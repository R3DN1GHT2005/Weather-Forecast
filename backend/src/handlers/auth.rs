use axum::{
    Json, body::Body, extract::State, http::StatusCode, http::header, middleware::Next,
    response::IntoResponse, response::Response,
};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::env;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct GoogleLoginRequest {
    pub id_token: String,
}

#[derive(Deserialize, Debug)]
pub struct GoogleTokenInfo {
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
    pub aud: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: i32,
    pub exp: usize,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub user_id: i32,
}

#[derive(Deserialize)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

fn generate_access_token(user_id: i32) -> Result<String, StatusCode> {
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::minutes(15))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: user_id,
        exp: expiration,
    };

    let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_ref()),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn google_auth(
    State(pool): State<PgPool>,
    Json(payload): Json<GoogleLoginRequest>,
) -> impl IntoResponse {
    let client = reqwest::Client::new();
    let google_url = format!(
        "https://oauth2.googleapis.com/tokeninfo?id_token={}",
        payload.id_token
    );

    let response = match client.get(google_url).send().await {
        Ok(res) => res,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid ID token").into_response(),
    };

    if !response.status().is_success() {
        return (StatusCode::BAD_REQUEST, "Invalid ID token").into_response();
    }

    let google_user: GoogleTokenInfo = match response.json().await {
        Ok(data) => data,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Error processing Google data",
            )
                .into_response();
        }
    };
    // Verify audience (client id)
    let expected_aud = env::var("GOOGLE_CLIENT_ID").unwrap_or_default();
    if !expected_aud.is_empty() && google_user.aud.as_deref() != Some(&expected_aud) {
        return (StatusCode::UNAUTHORIZED, "Invalid Google token audience").into_response();
    }
    let refresh_token = Uuid::new_v4().to_string();
    let user_record = sqlx::query!(
        r#"
        INSERT INTO users (email, username, avatar_url, refresh_token)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) DO UPDATE 
        SET avatar_url = EXCLUDED.avatar_url,
            refresh_token = EXCLUDED.refresh_token
        RETURNING id
        "#,
        google_user.email,
        google_user.name,
        google_user.picture,
        refresh_token
    )
    .fetch_one(&pool)
    .await;

    let user_id = match user_record {
        Ok(record) => record.id,
        Err(_) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Error saving user to DB").into_response();
        }
    };

    let access_token = match generate_access_token(user_id) {
        Ok(token) => token,
        Err(e) => return e.into_response(),
    };

    (
        StatusCode::OK,
        Json(AuthResponse {
            access_token,
            refresh_token,
            user_id,
        }),
    )
        .into_response()
}

pub async fn refresh_token_handler(
    State(pool): State<PgPool>,
    Json(payload): Json<RefreshTokenRequest>,
) -> impl IntoResponse {
    let user_record = sqlx::query!(
        "SELECT id FROM users WHERE refresh_token = $1",
        payload.refresh_token
    )
    .fetch_optional(&pool)
    .await;

    let user_id = match user_record {
        Ok(Some(record)) => record.id,
        Ok(None) => {
            return (StatusCode::UNAUTHORIZED, "Invalid or expired refresh token").into_response();
        }
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response(),
    };
    let new_refresh_token = Uuid::new_v4().to_string();
    if sqlx::query!(
        "UPDATE users SET refresh_token = $1 WHERE id = $2",
        new_refresh_token,
        user_id
    )
    .execute(&pool)
    .await
    .is_err()
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to update refresh token",
        )
            .into_response();
    }
    let access_token = match generate_access_token(user_id) {
        Ok(token) => token,
        Err(e) => return e.into_response(),
    };

    (
        StatusCode::OK,
        Json(AuthResponse {
            access_token,
            refresh_token: new_refresh_token,
            user_id,
        }),
    )
        .into_response()
}

pub async fn mw_auth(
    mut req: axum::http::Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if !auth_header.starts_with("Bearer ") {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let token = &auth_header[7..];
    let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set");

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_ref()),
        &Validation::default(),
    )
    .map_err(|_| StatusCode::UNAUTHORIZED)?;

    req.extensions_mut().insert(token_data.claims);
    Ok(next.run(req).await)
}
