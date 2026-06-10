use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: i32,
    pub email: String,
    pub google_id: Option<String>,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub reputation_score: i32,
    pub created_at: Option<DateTime<Utc>>,
    pub refresh_token: Option<String>,
}
