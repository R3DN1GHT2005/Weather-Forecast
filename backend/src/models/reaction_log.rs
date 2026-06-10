use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ReactionLog {
    pub id: i32,
    pub user_id: i32,
    pub action: String,
    pub created_at: Option<DateTime<Utc>>,
}