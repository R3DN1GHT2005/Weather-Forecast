use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct CommentReaction {
    pub id: i32,
    pub user_id: i32,
    pub comment_id: i32,
    pub reaction_type: String, // "like" | "dislike"
    pub created_at: Option<DateTime<Utc>>,
}
