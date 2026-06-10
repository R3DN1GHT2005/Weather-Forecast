use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Deserialize, Serialize, FromRow)]
pub struct Forecast {
    pub id: i32,
    pub city_id: i32,
    pub forecasts_date: NaiveDate,
    pub temp_min: f64,
    pub temp_max: f64,
    pub wind_speed: f64,
    pub humidity: Option<i32>,
    pub uv_index: Option<String>,
    pub icon_type: Option<String>,
}
