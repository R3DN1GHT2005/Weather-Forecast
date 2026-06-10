use crate::handlers::auth::Claims;
use crate::models::comment::{Comment, CommentResponse, ReactRequest};
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    http::HeaderMap,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use std::env;

#[derive(Debug)]
struct VoteActor {
    user_id: Option<i32>,
    guest_token: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct VoteSummary {
    like_count: i64,
    dislike_count: i64,
    user_reaction: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct CommentVoteRecord {
    vote_type: String,
}

fn decode_user_from_header(headers: &HeaderMap) -> Result<Option<i32>, StatusCode> {
    let Some(auth_header) = headers.get(axum::http::header::AUTHORIZATION).and_then(|h| h.to_str().ok()) else {
        return Ok(None);
    };

    if !auth_header.starts_with("Bearer ") {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let token = &auth_header[7..];
    let jwt_secret = env::var("JWT_SECRET").map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_ref()),
        &Validation::default(),
    )
    .map_err(|_| StatusCode::UNAUTHORIZED)?;

    Ok(Some(token_data.claims.sub))
}

fn resolve_vote_actor(headers: &HeaderMap) -> Result<VoteActor, StatusCode> {
    let user_id = decode_user_from_header(headers)?;
    if user_id.is_some() {
        return Ok(VoteActor {
            user_id,
            guest_token: None,
        });
    }

    let guest_token = headers
        .get("x-guest-token")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    Ok(VoteActor {
        user_id: None,
        guest_token,
    })
}

async fn fetch_vote_summary(
    pool: &PgPool,
    comment_id: i32,
    actor: &VoteActor,
) -> Result<VoteSummary, StatusCode> {
    let summary = sqlx::query_as::<_, VoteSummary>(
        r#"
        SELECT
            COALESCE(SUM(CASE WHEN cv.vote_type = 'like' THEN 1 ELSE 0 END), 0) AS like_count,
            COALESCE(SUM(CASE WHEN cv.vote_type = 'dislike' THEN 1 ELSE 0 END), 0) AS dislike_count,
            MAX(
                CASE
                    WHEN ($2::int IS NOT NULL AND cv.user_id = $2)
                      OR ($3::text IS NOT NULL AND cv.guest_token = $3)
                    THEN cv.vote_type
                    ELSE NULL
                END
            ) AS user_reaction
        FROM comment_votes cv
        WHERE cv.comment_id = $1
        "#,
    )
    .bind(comment_id)
    .bind(actor.user_id)
    .bind(actor.guest_token.as_deref())
    .fetch_one(pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la încărcarea voturilor comentariului: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(summary)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateCommentRequest {
    pub forecast_id: i32,
    pub accuracy_rating: i32,
    pub comments_text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateCityCommentRequest {
    pub content: String,
}

pub async fn create_comment(
    State(pool): State<PgPool>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<CreateCommentRequest>,
) -> Result<(StatusCode, Json<Comment>), StatusCode> {
    let user_id = claims.sub;

    if payload.accuracy_rating < 1 || payload.accuracy_rating > 5 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let comment = sqlx::query_as::<_, Comment>(
        r#"
        INSERT INTO comments (user_id, forecast_id, accuracy_rating, comments_text)
        VALUES ($1, $2, $3, $4)
        RETURNING id, user_id, forecast_id, accuracy_rating, comments_text, created_at
        "#,
    )
    .bind(user_id)
    .bind(payload.forecast_id)
    .bind(payload.accuracy_rating)
    .bind(payload.comments_text.unwrap_or_default())
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la crearea comentariului: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((StatusCode::CREATED, Json(comment)))
}

#[derive(Serialize, FromRow)]
pub struct CreateCityCommentResponse {
    pub id: i32,
    pub comments_text: Option<String>,
    pub username: Option<String>,
}

pub async fn create_city_comment(
    State(pool): State<PgPool>,
    Extension(claims): Extension<Claims>,
    Path(city_id): Path<i32>,
    Json(payload): Json<CreateCityCommentRequest>,
) -> Result<(StatusCode, Json<CreateCityCommentResponse>), StatusCode> {
    let user_id = claims.sub;

    let forecast = sqlx::query!("SELECT id FROM forecasts WHERE city_id = $1 ORDER BY forecasts_date DESC LIMIT 1", city_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("Eroare la obținerea forecast-ului: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    let comment = sqlx::query_as::<_, Comment>(
        r#"
        INSERT INTO comments (user_id, forecast_id, accuracy_rating, comments_text)
        VALUES ($1, $2, 3, $3)
        RETURNING id, user_id, forecast_id, accuracy_rating, comments_text, created_at
        "#,
    )
    .bind(user_id)
    .bind(forecast.id)
    .bind(&payload.content)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la crearea comentariului orașului: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let username = sqlx::query_scalar::<_, Option<String>>(
        "SELECT username FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .unwrap_or_default();

    let response = CreateCityCommentResponse {
        id: comment.id,
        comments_text: comment.comments_text,
        username: Some(username),
    };

    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn get_city_comments(
    State(pool): State<PgPool>,
    Path(city_id): Path<i32>,
    headers: HeaderMap,
) -> Result<Json<Vec<CommentResponse>>, StatusCode> {
    let actor = resolve_vote_actor(&headers)?;

    let comments = sqlx::query_as::<_, CommentResponse>(
        r#"
        SELECT
            c.id,
            c.user_id,
            c.forecast_id,
            c.accuracy_rating,
            c.comments_text,
            c.created_at,
            u.username,
            u.avatar_url,
            COALESCE(SUM(CASE WHEN cv.vote_type = 'like' THEN 1 ELSE 0 END), 0) AS like_count,
            COALESCE(SUM(CASE WHEN cv.vote_type = 'dislike' THEN 1 ELSE 0 END), 0) AS dislike_count,
            MAX(
                CASE
                    WHEN ($2::int IS NOT NULL AND cv.user_id = $2)
                      OR ($3::text IS NOT NULL AND cv.guest_token = $3)
                    THEN cv.vote_type
                    ELSE NULL
                END
            ) AS user_reaction
        FROM comments c
        JOIN forecasts f ON f.id = c.forecast_id
        LEFT JOIN users u ON u.id = c.user_id
        LEFT JOIN comment_votes cv ON cv.comment_id = c.id
        WHERE f.city_id = $1
        GROUP BY
            c.id,
            c.user_id,
            c.forecast_id,
            c.accuracy_rating,
            c.comments_text,
            c.created_at,
            u.username,
            u.avatar_url
        ORDER BY c.created_at DESC
        "#,
    )
    .bind(city_id)
    .bind(actor.user_id)
    .bind(actor.guest_token.as_deref())
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea comentariilor orașului: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(comments))
}

pub async fn get_forecast_comments(
    State(pool): State<PgPool>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Vec<Comment>>, StatusCode> {
    let forecast_id = params
        .get("forecast_id")
        .and_then(|id| id.parse::<i32>().ok())
        .ok_or(StatusCode::BAD_REQUEST)?;

    let comments = sqlx::query_as::<_, Comment>(
        r#"
        SELECT 
            c.id,
            c.user_id,
            c.forecast_id,
            c.accuracy_rating,
            c.comments_text,
            c.created_at
        FROM comments c
        WHERE c.forecast_id = $1
        ORDER BY c.created_at DESC
        "#,
    )
    .bind(forecast_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea comentariilor: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(comments))
}

pub async fn toggle_reaction(
    State(pool): State<PgPool>,
    Path(comment_id): Path<i32>,
    headers: HeaderMap,
    Json(payload): Json<ReactRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    let reaction_type = payload.reaction_type.to_lowercase();
    let actor = resolve_vote_actor(&headers)?;

    if reaction_type != "like" && reaction_type != "dislike" {
        return Err(StatusCode::BAD_REQUEST);
    }

    if actor.user_id.is_none() && actor.guest_token.is_none() {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let existing = sqlx::query_as::<_, CommentVoteRecord>(
        r#"
        SELECT vote_type
        FROM comment_votes
        WHERE comment_id = $1
          AND (
              ($2::int IS NOT NULL AND user_id = $2)
              OR ($3::text IS NOT NULL AND guest_token = $3)
          )
        LIMIT 1
        "#,
    )
    .bind(comment_id)
    .bind(actor.user_id)
    .bind(actor.guest_token.as_deref())
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la verificarea votului: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if let Some(existing_vote) = existing {
        if existing_vote.vote_type == reaction_type {
            sqlx::query!(
                r#"DELETE FROM comment_votes WHERE comment_id = $1 AND ( ($2::int IS NOT NULL AND user_id = $2) OR ($3::text IS NOT NULL AND guest_token = $3) )"#,
                comment_id,
                actor.user_id,
                actor.guest_token.as_deref()
            )
            .execute(&pool)
            .await
            .map_err(|e| {
                eprintln!("Eroare la ștergerea votului: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        } else {
            sqlx::query!(
                r#"UPDATE comment_votes SET vote_type = $4 WHERE comment_id = $1 AND ( ($2::int IS NOT NULL AND user_id = $2) OR ($3::text IS NOT NULL AND guest_token = $3) )"#,
                comment_id,
                actor.user_id,
                actor.guest_token.as_deref(),
                reaction_type,
            )
            .execute(&pool)
            .await
            .map_err(|e| {
                eprintln!("Eroare la actualizarea votului: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        }
    } else {
        sqlx::query(
            r#"
            INSERT INTO comment_votes (comment_id, user_id, guest_token, vote_type)
            VALUES ($1, $2, $3, $4)
            "#,
        )
        .bind(comment_id)
        .bind(actor.user_id)
        .bind(actor.guest_token.as_deref())
        .bind(&reaction_type)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Eroare la salvarea votului: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    }

    let summary = fetch_vote_summary(&pool, comment_id, &actor).await?;

    Ok((StatusCode::OK, Json(serde_json::json!({
        "message": "Vote saved successfully",
        "like_count": summary.like_count,
        "dislike_count": summary.dislike_count,
        "user_reaction": summary.user_reaction
    }))))
}
