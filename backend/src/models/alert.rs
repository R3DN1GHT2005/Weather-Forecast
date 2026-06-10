use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Alert {
    pub id: i32,
    pub forecast_id: i32,
    pub alert_message: String,
    pub recommendation: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}
