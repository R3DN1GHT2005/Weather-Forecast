use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Comment {
    pub id: i32,
    pub user_id: Option<i32>,
    pub forecast_id: i32,
    pub accuracy_rating: Option<i32>,
    pub comments_text: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct ReactRequest {
    pub reaction_type: String, // "like" | "dislike"
}
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct CommentResponse {
    pub id: i32,
    pub user_id: Option<i32>,
    pub forecast_id: i32,
    pub accuracy_rating: Option<i32>,
    pub comments_text: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub like_count: i64,
    pub dislike_count: i64,
    pub user_reaction: Option<String>,
}
