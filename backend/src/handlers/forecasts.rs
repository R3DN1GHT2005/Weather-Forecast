use crate::models::forecast::Forecast;
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

#[derive(Deserialize, Debug)]
pub struct BulkPayload {
    pub city_name: String,
    pub latitude: f64,
    pub longitude: f64,
    pub forecasts: Vec<DailyPayload>,
}

#[derive(Deserialize, Debug)]
pub struct DailyPayload {
    pub date: NaiveDate,
    pub temp_min: f64,
    pub temp_max: f64,
    pub wind_speed: f64,
    pub humidity: i32,
}

#[derive(Deserialize, Debug)]
pub struct BulkPredictionQuery {
    pub start_date: Option<NaiveDate>,
    pub days: Option<i32>,
}

#[derive(Serialize, Debug)]
pub struct BulkPredictionResponse {
    pub forecast_date: NaiveDate,
    pub avg_temp_min: f64,
    pub avg_temp_max: f64,
    pub avg_wind_speed: f64,
    pub avg_humidity: f64,
    pub icon_type: String,
    pub uv_index: String,
}

pub async fn get_all_forecasts(State(pool): State<PgPool>) -> Json<Vec<Forecast>> {
    let forecasts = sqlx::query_as::<_, Forecast>("SELECT * FROM forecasts")
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

    Json(forecasts)
}

pub async fn create_forecast(
    State(pool): State<PgPool>,
    Json(payload): Json<BulkPayload>,
) -> Result<StatusCode, StatusCode> {
    let city_record = sqlx::query!(
        r#"
        INSERT INTO cities (name, latitude, longitude) 
        VALUES ($1, $2, $3) 
        ON CONFLICT (name) DO UPDATE SET latitude = $2::double precision, longitude = $3::double precision
        RETURNING id
        "#,
        payload.city_name,
        payload.latitude,
        payload.longitude
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la procesarea orașului {}: {:?}", payload.city_name, e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let city_id = city_record.id;

    for daily in payload.forecasts {
        sqlx::query(
            r#"
            INSERT INTO forecasts (city_id, forecasts_date, temp_min, temp_max, wind_speed, humidity, uv_index)
            VALUES ($1, $2::date, $3::double precision, $4::double precision, $5::double precision, $6, generate_uv_index($4::double precision, $6, $5::double precision))
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(city_id)
        .bind(daily.date)
        .bind(daily.temp_min)
        .bind(daily.temp_max)
        .bind(daily.wind_speed)
        .bind(daily.humidity)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Eroare la inserarea prognozei pt data {}: {:?}", daily.date, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    }

    Ok(StatusCode::CREATED)
}

#[derive(Serialize, Debug)]
pub struct PredictionResponse {
    pub avg_temp_min: f64,
    pub avg_temp_max: f64,
    pub avg_wind_speed: f64,
    pub avg_humidity: f64,
    pub icon_type: String,
    pub uv_index: String,
}

#[derive(Deserialize, Debug)]
pub struct PredictionQuery {
    pub target_date: NaiveDate,
}

pub async fn get_forecast_list(
    State(pool): State<PgPool>,
    Path(city_id): Path<i32>,
) -> Result<Json<Vec<Forecast>>, StatusCode> {
    let forecasts = sqlx::query_as::<_, Forecast>(
        r#"
        SELECT * FROM forecasts
        WHERE city_id = $1
        ORDER BY forecasts_date DESC
        "#,
    )
    .bind(city_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea forecast-urilor: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(forecasts))
}

pub async fn get_prediction(
    State(pool): State<PgPool>,
    Path(city_id): Path<i32>,
    Query(query): Query<PredictionQuery>,
) -> Result<Json<PredictionResponse>, StatusCode> {
    let prediction = sqlx::query(
        r#"
        SELECT 
            p.avg_temp_min,
            p.avg_temp_max,
            p.avg_wind_speed,
            p.avg_humidity,
            generate_weather_icon(p.avg_temp_max, p.avg_humidity, p.avg_wind_speed) AS icon_type,
            generate_uv_index(p.avg_temp_max, p.avg_humidity::int, p.avg_wind_speed) AS uv_index
        FROM get_city_prediction($1::int, $2::date) p
        "#,
    )
    .bind(city_id)
    .bind(query.target_date)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea predicției pentru oraș {}: {:?}", city_id, e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    match prediction {
        Some(row) => {
            let response = PredictionResponse {
                avg_temp_min: row.try_get::<Option<f64>, _>("avg_temp_min").unwrap_or(None).unwrap_or(0.0),
                avg_temp_max: row.try_get::<Option<f64>, _>("avg_temp_max").unwrap_or(None).unwrap_or(0.0),
                avg_wind_speed: row.try_get::<Option<f64>, _>("avg_wind_speed").unwrap_or(None).unwrap_or(0.0),
                avg_humidity: row.try_get::<Option<f64>, _>("avg_humidity").unwrap_or(None).unwrap_or(0.0),
                icon_type: row.try_get::<Option<String>, _>("icon_type").unwrap_or(None).unwrap_or_else(|| "☀️ Senin".to_string()),
                uv_index: row.try_get::<Option<String>, _>("uv_index").unwrap_or(None).unwrap_or_else(|| "Low".to_string()),
            };
            Ok(Json(response))
        },
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn get_prediction_bulk(
    State(pool): State<PgPool>,
    Path(city_id): Path<i32>,
    Query(query): Query<BulkPredictionQuery>,
) -> Result<Json<Vec<BulkPredictionResponse>>, StatusCode> {
    let start_date = query.start_date.unwrap_or_else(|| chrono::Local::now().date_naive());
    let days = query.days.unwrap_or(10).clamp(1, 10);

    let rows = sqlx::query(
        r#"
        SELECT
            forecast_date,
            avg_temp_min,
            avg_temp_max,
            avg_wind_speed,
            avg_humidity,
            icon_type,
            uv_index
        FROM get_city_prediction_bulk($1::int, $2::date, $3::int)
        ORDER BY forecast_date
        "#,
    )
    .bind(city_id)
    .bind(start_date)
    .bind(days)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea predicțiilor bulk pentru oraș {}: {:?}", city_id, e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let predictions = rows
        .into_iter()
        .map(|row| BulkPredictionResponse {
            forecast_date: row.try_get("forecast_date").unwrap_or(start_date),
            avg_temp_min: row.try_get("avg_temp_min").unwrap_or(0.0),
            avg_temp_max: row.try_get("avg_temp_max").unwrap_or(0.0),
            avg_wind_speed: row.try_get("avg_wind_speed").unwrap_or(0.0),
            avg_humidity: row.try_get("avg_humidity").unwrap_or(0.0),
            icon_type: row
                .try_get::<Option<String>, _>("icon_type")
                .unwrap_or(None)
                .unwrap_or_else(|| "☀️ Senin".to_string()),
            uv_index: row
                .try_get::<Option<String>, _>("uv_index")
                .unwrap_or(None)
                .unwrap_or_else(|| "Low".to_string()),
        })
        .collect::<Vec<_>>();

    Ok(Json(predictions))
}
