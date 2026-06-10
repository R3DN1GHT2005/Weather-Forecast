use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use crate::models::alert::Alert;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

#[derive(Debug, Serialize, Deserialize)]
pub struct CurrentWeatherResponse {
    pub forecast_id: i32,
    pub city_id: i32,
    pub city_name: String,
    pub date: String,
    pub temp_min: f64,
    pub temp_max: f64,
    pub wind_speed: f64,
    pub humidity: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ForecastHistoryItem {
    pub id: i32,
    pub date: String,
    pub temp_min: f64,
    pub temp_max: f64,
    pub wind_speed: f64,
    pub humidity: i32,
}

pub async fn get_current_weather(
    State(pool): State<PgPool>,
    Path(city_id): Path<i32>,
) -> Result<Json<CurrentWeatherResponse>, StatusCode> {
    let result = sqlx::query!(
        r#"
        SELECT 
            f.id as forecast_id,
            f.city_id,
            c.name as city_name,
            f.forecasts_date,
            f.temp_min,
            f.temp_max,
            f.wind_speed,
            f.humidity
        FROM forecasts f
        JOIN cities c ON f.city_id = c.id
        WHERE f.city_id = $1
        ORDER BY f.forecasts_date DESC
        LIMIT 1
        "#,
        city_id
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea meteoului curent: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    match result {
        Some(row) => Ok(Json(CurrentWeatherResponse {
            forecast_id: row.forecast_id,
            city_id: row.city_id.unwrap_or(0),
            city_name: row.city_name,
            date: row.forecasts_date.to_string(),
            temp_min: row.temp_min,
            temp_max: row.temp_max,
            wind_speed: row.wind_speed,
            humidity: row.humidity.unwrap_or(0),
        })),
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn get_active_alerts(
    State(pool): State<PgPool>,
    Path(city_id): Path<i32>,
) -> Result<Json<Vec<Alert>>, StatusCode> {
    let alerts = sqlx::query_as::<_, Alert>(
        r#"
        SELECT 
            a.forecast_id,
            a.alert_message,
            a.recommendation,
            a.created_at,
            a.id
        FROM alerts a
        JOIN forecasts f ON a.forecast_id = f.id
        WHERE f.city_id = $1
        ORDER BY a.created_at DESC
        "#,
    )
    .bind(city_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea alertelor active: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(alerts))
}

pub async fn get_today_alerts(
    State(pool): State<PgPool>,
    Path(city_id): Path<i32>,
) -> Result<Json<Vec<Alert>>, StatusCode> {
    let alerts = sqlx::query_as::<_, Alert>(
        r#"
        SELECT
            a.forecast_id,
            a.alert_message,
            a.recommendation,
            a.created_at,
            a.id
        FROM get_city_today_alerts($1) a
        "#,
    )
    .bind(city_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea alertelor de azi: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(alerts))
}

pub async fn get_forecast_history(
    State(pool): State<PgPool>,
    Path(city_id): Path<i32>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Vec<ForecastHistoryItem>>, StatusCode> {
    let days = params
        .get("days")
        .and_then(|d| d.parse::<i32>().ok())
        .unwrap_or(7);

    let rows = sqlx::query!(
        r#"
        SELECT 
            id,
            forecasts_date,
            temp_min,
            temp_max,
            wind_speed,
            humidity
        FROM forecasts
        WHERE city_id = $1
        ORDER BY forecasts_date DESC
        LIMIT $2
        "#,
        city_id,
        days as i32
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea istoricului de prognoza: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let history = rows
        .into_iter()
        .map(|row| ForecastHistoryItem {
            id: row.id,
            date: row.forecasts_date.to_string(),
            temp_min: row.temp_min,
            temp_max: row.temp_max,
            wind_speed: row.wind_speed,
            humidity: row.humidity.unwrap_or(0),
        })
        .collect();

    Ok(Json(history))
}
