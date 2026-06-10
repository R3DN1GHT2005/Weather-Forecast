use serde::{Deserialize, Serialize};
use sqlx::FromRow;
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct City {
    pub id: i32,
    pub country_id: i32,
    pub name: String,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}
