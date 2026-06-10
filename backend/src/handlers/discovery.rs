use crate::models::{city::City, country::Country};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use chrono::NaiveDate;
use axum::response::IntoResponse;

#[derive(Debug, Serialize, Deserialize)]
pub struct CityDetailsResponse {
    pub id: i32,
    pub name: String,
    pub country_id: i32,
    pub country_name: String,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CitySearchResponse {
    pub id: i32,
    pub name: String,
    pub country_name: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

pub async fn get_all_countries(
    State(pool): State<PgPool>,
) -> Result<Json<Vec<Country>>, StatusCode> {
    let countries = sqlx::query_as::<_, Country>("SELECT id, name FROM countries ORDER BY name")
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            eprintln!("Eroare la obținerea țărilor: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(countries))
}

pub async fn get_cities_by_country(
    State(pool): State<PgPool>,
    Path(country_id): Path<i32>,
) -> Result<Json<Vec<City>>, StatusCode> {
    let cities = sqlx::query_as::<_, City>(
        "SELECT id, country_id, name, latitude, longitude 
         FROM cities 
         WHERE country_id = $1 
         ORDER BY name",
    )
    .bind(country_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea orașelor: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(cities))
}

pub async fn search_cities(
    State(pool): State<PgPool>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<Vec<CitySearchResponse>>, StatusCode> {
    let search_pattern = format!("%{}%", params.q);
    let rows = sqlx::query!(
        r#"
        SELECT c.id, c.name, c.latitude, c.longitude, co.name as "country_name?"
        FROM cities c
        LEFT JOIN countries co ON c.country_id = co.id
        WHERE c.name ILIKE $1
        ORDER BY c.name
        LIMIT 10
        "#,
        search_pattern
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la căutarea orașelor: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let cities: Vec<CitySearchResponse> = rows
        .into_iter()
        .map(|row| CitySearchResponse {
            id: row.id,
            name: row.name,
            country_name: row.country_name,
            latitude: row.latitude,
            longitude: row.longitude,
        })
        .collect();

    Ok(Json(cities))
}

pub async fn get_city_details(
    State(pool): State<PgPool>,
    Path(city_id): Path<i32>,
) -> Result<Json<CityDetailsResponse>, StatusCode> {
    let result = sqlx::query!(
        "SELECT c.id, c.name, c.country_id, c.latitude, c.longitude, co.name as country_name
         FROM cities c
         JOIN countries co ON c.country_id = co.id
         WHERE c.id = $1",
        city_id
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea detaliilor orașului: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    match result {
        Some(row) => Ok(Json(CityDetailsResponse {
            id: row.id,
            name: row.name,
            country_id: row.country_id.unwrap_or(0),
            country_name: row.country_name,
            latitude: row.latitude,
            longitude: row.longitude,
        })),
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn get_all_cities(State(pool): State<PgPool>) -> Result<Json<Vec<City>>, StatusCode> {
    let cities = sqlx::query_as::<_, City>(
        "SELECT id, country_id, name, latitude, longitude 
         FROM cities 
         ORDER BY name",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Eroare la obținerea orașelor: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(cities))
}


#[derive(Deserialize)]
pub struct BoundsQuery {
    pub min_lat: f64,
    pub max_lat: f64,
    pub min_lng: f64,
    pub max_lng: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CityPredictionDTO {
    pub id: i32,
    pub name: String,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub temp_min: Option<f64>, 
    pub temp_max: Option<f64>,
    pub wind: Option<f64>,
    pub humidity: Option<f64>,
    pub forecast_date: Option<NaiveDate>,
}

pub async fn get_cities_by_bounds(
    State(pool): State<PgPool>,
    Query(bounds): Query<BoundsQuery>,
) -> impl axum::response::IntoResponse {
    
    let result = sqlx::query_as!(
        CityPredictionDTO, 
        r#"
        SELECT 
            c.id, 
            c.name, 
            c.latitude as lat, 
            c.longitude as lng,
            p.avg_temp_min as temp_min, 
            p.avg_temp_max as temp_max, 
            p.avg_wind_speed as wind, 
            p.avg_humidity as humidity, 
            CURRENT_DATE as forecast_date
        FROM cities c
        CROSS JOIN LATERAL get_city_prediction(c.id, CURRENT_DATE) p
        WHERE c.latitude BETWEEN $1 AND $2 
          AND c.longitude BETWEEN $3 AND $4
        LIMIT 100
        "#,
        bounds.min_lat,
        bounds.max_lat,
        bounds.min_lng,
        bounds.max_lng
    )
    .fetch_all(&pool)
    .await;

    match result {
        Ok(cities) => axum::Json(cities).into_response(),
        Err(e) => {
            eprintln!("Eroare bounds: {}", e);
            (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Eroare DB").into_response()
        }
    }
}

