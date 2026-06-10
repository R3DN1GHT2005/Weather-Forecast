use crate::handlers::auth::Claims;
use crate::models::user::User;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use chrono::NaiveDate;

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSettingsRequest {
    pub username: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct UserStatsDTO {
    pub reputation_score: i32,
    pub total_comments: i64,
    pub visited_cities: i64,
    pub saved_cities: i64,
    pub power_score: f64,
}

pub async fn get_my_profile(
    State(pool): State<PgPool>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<User>, StatusCode> {
    let user_id = claims.sub;

    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea utilizatorului: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    user.map(Json).ok_or(StatusCode::NOT_FOUND)
}

pub async fn get_user_stats(
    State(pool): State<PgPool>,
    Path(user_id): Path<i32>,
) -> Result<Json<UserStatsDTO>, StatusCode> {
    let stats = sqlx::query_as::<_, UserStatsDTO>(
        r#"
        SELECT
            COALESCE(u.reputation_score, 0) AS reputation_score,
            COUNT(DISTINCT c.id) AS total_comments,
            COUNT(DISTINCT f.city_id) AS visited_cities,
            (SELECT COUNT(*) FROM saved_cities sc WHERE sc.user_id = u.id) AS saved_cities,
            ROUND(
                (
                    COALESCE(u.reputation_score, 0) * 0.5 +
                    COUNT(DISTINCT c.id) * 1.5 +
                    COUNT(DISTINCT f.city_id) * 2.0
                )::numeric,
                2
            )::float8 AS power_score
        FROM users u
        LEFT JOIN comments c ON c.user_id = u.id
        LEFT JOIN forecasts f ON f.id = c.forecast_id
        WHERE u.id = $1
        GROUP BY u.id, u.reputation_score
        "#,
    )
    .bind(user_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea statisticilor utilizatorului: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    stats.map(Json).ok_or(StatusCode::NOT_FOUND)
}

pub async fn save_city(
    State(pool): State<PgPool>,
    Extension(claims): Extension<Claims>,
    Path(city_id): Path<i32>,
) -> Result<StatusCode, StatusCode> {
    let user_id = claims.sub;

    sqlx::query("CALL add_favorite_city($1, $2)")
        .bind(user_id)
        .bind(city_id)
        .execute(&pool)
        .await
        .map_err(|e| {
            if let Some(db_err) = e.as_database_error()
                && db_err.message().contains("ALREADY_FAVORITED")
            {
                return StatusCode::CONFLICT;
            }
            eprintln!("Eroare la salvarea orașului: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::OK)
}

pub async fn unsave_city(
    State(pool): State<PgPool>,
    Extension(claims): Extension<Claims>,
    Path(city_id): Path<i32>,
) -> Result<StatusCode, StatusCode> {
    let user_id = claims.sub;

    sqlx::query(
        r#"
        DELETE FROM saved_cities
        WHERE user_id = $1 AND city_id = $2
        "#,
    )
    .bind(user_id)
    .bind(city_id)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la ștergerea orașului salvat: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::OK)
}

pub async fn update_settings(
    State(pool): State<PgPool>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<UpdateSettingsRequest>,
) -> Result<Json<User>, StatusCode> {
    let user_id = claims.sub;
    if let Some(username) = payload.username {
        let trimmed_username = username.trim();
        if trimmed_username.is_empty() {
            return Err(StatusCode::BAD_REQUEST);
        }

        sqlx::query!(
            "UPDATE users SET username = $1 WHERE id = $2",
            trimmed_username,
            user_id
        )
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Eroare la actualizarea username-ului: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    }
    if let Some(avatar_url) = payload.avatar_url {
        sqlx::query!(
            "UPDATE users SET avatar_url = $1 WHERE id = $2",
            avatar_url,
            user_id
        )
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Eroare la actualizarea avatar-ului: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    }
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea utilizatorului: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    user.map(Json).ok_or(StatusCode::NOT_FOUND)
}


#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct CityDTO {
    pub id: i32,
    pub name: String,
    pub lat: Option<f64>,        
    pub lng: Option<f64>,        
    pub temp_min: Option<f64>,  
    pub temp_max: Option<f64>,
    pub wind: Option<f64>,
    pub humidity: Option<i32>,   
    pub forecast_date: Option<NaiveDate>,
}

pub async fn get_city_favorites(
    State(pool): State<PgPool>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<CityDTO>>, StatusCode> {
    let user_id = claims.sub;

    let favorites = sqlx::query_as::<_, CityDTO>(
        r#"
        SELECT 
            c.id,
            c.name,
            c.latitude AS lat,
            c.longitude AS lng,
            COALESCE(f.temp_min, p.avg_temp_min) AS temp_min,
            COALESCE(f.temp_max, p.avg_temp_max) AS temp_max,
            COALESCE(f.wind_speed, p.avg_wind_speed) AS wind,
            COALESCE(f.humidity, ROUND(p.avg_humidity)::int) AS humidity,
            COALESCE(f.forecasts_date, CURRENT_DATE) AS forecast_date
        FROM cities c
        JOIN saved_cities sc ON c.id = sc.city_id
        LEFT JOIN forecasts f ON c.id = f.city_id AND f.forecasts_date = CURRENT_DATE
        LEFT JOIN LATERAL get_city_prediction(c.id, CURRENT_DATE) p ON TRUE
        WHERE sc.user_id = $1
        ORDER BY c.name
        "#,
    )
    .bind(user_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare SQL favorite: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(favorites))
}