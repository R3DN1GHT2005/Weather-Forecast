use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};

#[derive(Serialize, FromRow)]
pub struct CountryStats {
    pub p_avg_temp: Option<f64>,
    pub p_alert_count: Option<i64>,
    pub p_hotspot_city: String,
}

#[derive(Serialize, FromRow)]
pub struct UserPowerStats {
    pub p_reputation: i32,
    pub p_total_comments: i64,
    pub p_power_score: f64,
}

#[derive(Serialize, FromRow)]
pub struct CityRisk {
    pub p_risk_level: String,
}

#[derive(Serialize, FromRow)]
pub struct CityAnomaly {
    pub p_is_anomaly: bool,
    pub p_deviation: f64,
}

#[derive(Serialize, FromRow)]
pub struct CityTrust {
    pub p_trust_score: Option<f64>,
    pub p_audit_label: String,
}

#[derive(Serialize, FromRow)]
pub struct CountrySeriesPoint {
    pub label: String,
    pub value: f64,
}

#[derive(Serialize, FromRow)]
pub struct CountryRangePoint {
    pub label: String,
    pub min_temp: f64,
    pub max_temp: f64,
}

#[derive(Serialize, FromRow)]
pub struct CountryCityRank {
    pub name: String,
    pub temp: f64,
}

#[derive(Serialize, FromRow)]
pub struct CountryClimateAlert {
    pub alert_type: String,
    pub severity: String,
    pub message: String,
}

#[derive(Serialize, FromRow)]
pub struct CitySeasonalComparisonRow {
    pub comparison_label: String,
    pub current_avg_temp: Option<f64>,
    pub reference_avg_temp: Option<f64>,
    pub current_avg_wind: Option<f64>,
    pub reference_avg_wind: Option<f64>,
    pub current_avg_humidity: Option<f64>,
    pub reference_avg_humidity: Option<f64>,
    pub delta_score: Option<f64>,
}

#[derive(Deserialize)]
pub struct CitySeasonalQuery {
    pub target_date: Option<NaiveDate>,
}

#[derive(Serialize, FromRow)]
pub struct CountryCityClusterRow {
    pub city_name: String,
    pub cluster_label: String,
    pub avg_temp: f64,
    pub avg_humidity: f64,
    pub avg_wind: f64,
    pub similarity_score: f64,
    pub cluster_size: i32,
}

#[derive(Deserialize)]
pub struct CountryTargetQuery {
    pub target_date: Option<NaiveDate>,
    pub limit: Option<i32>,
}

#[derive(Serialize, FromRow)]
pub struct CountryCityLeaderboardRow {
    pub rank_position: i32,
    pub city_name: String,
    pub forecast_score: f64,
    pub avg_temp: f64,
    pub avg_humidity: f64,
    pub avg_wind: f64,
}

#[derive(Serialize, FromRow)]
pub struct ForecastScoreboardRow {
    pub rank_position: i32,
    pub city_name: String,
    pub forecast_date: NaiveDate,
    pub forecast_score: f64,
    pub weighted_accuracy: Option<f64>,
    pub comment_count: i32,
    pub reputation_score: f64,
}

#[derive(Serialize)]
pub struct CountryDashboardResponse {
    pub p_avg_temp: Option<f64>,
    pub p_avg_humidity: Option<f64>,
    pub p_avg_wind: Option<f64>,
    pub p_avg_uv_index: Option<String>,
    pub p_alert_count: Option<i64>,
    pub p_hotspot_city: String,
    pub latest_date: Option<NaiveDate>,
    pub monthly_avg_temps: Vec<CountrySeriesPoint>,
    pub historic_extremes: Vec<CountryRangePoint>,
    pub yearly_evolution: Vec<CountrySeriesPoint>,
    pub hottest_cities_today: Vec<CountryCityRank>,
    pub coldest_cities_today: Vec<CountryCityRank>,
    pub alerts: Vec<CountryClimateAlert>,
    pub db_alerts: Vec<CountryClimateAlert>,
}

pub async fn get_country_report(
    State(pool): State<PgPool>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let result = sqlx::query_as::<_, CountryStats>(
        r#"
        WITH stats AS (
            SELECT
                AVG((f.temp_min + f.temp_max) / 2.0) AS avg_temp,
                COUNT(a.id) AS alert_count
            FROM countries co
            JOIN cities ci ON co.id = ci.country_id
            JOIN forecasts f ON ci.id = f.city_id
            LEFT JOIN alerts a ON f.id = a.forecast_id
            WHERE co.name = $1
        ),
        hotspot AS (
            SELECT ci.name
            FROM cities ci
            JOIN forecasts f ON ci.id = f.city_id
            LEFT JOIN alerts a ON f.id = a.forecast_id
            WHERE ci.country_id = (SELECT id FROM countries WHERE name = $1)
            GROUP BY ci.id, ci.name
            ORDER BY COUNT(a.id) DESC
            LIMIT 1
        )
        SELECT
            s.avg_temp AS p_avg_temp,
            s.alert_count::bigint AS p_alert_count,
            COALESCE(h.name, 'N/A') AS p_hotspot_city
        FROM stats s, hotspot h
        "#,
    )
    .bind(name)
    .fetch_one(&pool)
    .await;

    match result {
        Ok(stats) => (StatusCode::OK, Json(stats)).into_response(),
        Err(e) => handle_db_error(e),
    }
}

pub async fn get_country_dashboard(
    State(pool): State<PgPool>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let country = sqlx::query!("SELECT id FROM countries WHERE name = $1", name)
        .fetch_optional(&pool)
        .await;

    let country_id = match country {
        Ok(Some(record)) => record.id,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"message": "Country not found"})),
            )
                .into_response();
        }
        Err(e) => return handle_db_error(e),
    };

    let overview = sqlx::query_as::<_, CountryStats>(
        r#"
        SELECT
            AVG((f.temp_min + f.temp_max) / 2.0) AS p_avg_temp,
            COUNT(a.id) AS p_alert_count,
            COALESCE(
                (
                    SELECT ci.name
                    FROM cities ci
                    JOIN forecasts fx ON fx.city_id = ci.id
                    LEFT JOIN alerts ax ON ax.forecast_id = fx.id
                    WHERE ci.country_id = $1
                    GROUP BY ci.id, ci.name
                    ORDER BY COUNT(ax.id) DESC, ci.name ASC
                    LIMIT 1
                ),
                'N/A'
            ) AS p_hotspot_city
        FROM cities ci
        JOIN forecasts f ON ci.id = f.city_id
        LEFT JOIN alerts a ON f.id = a.forecast_id
        WHERE ci.country_id = $1
        "#,
    )
    .bind(country_id)
    .fetch_one(&pool)
    .await;

    let overview = match overview {
        Ok(data) => data,
        Err(e) => return handle_db_error(e),
    };

    let metrics = sqlx::query!(
        r#"
        SELECT
            AVG(f.humidity::double precision) AS p_avg_humidity,
            AVG(f.wind_speed) AS p_avg_wind,
            MAX(f.forecasts_date) AS latest_date
        FROM cities ci
        JOIN forecasts f ON ci.id = f.city_id
        WHERE ci.country_id = $1
        "#,
        country_id
    )
    .fetch_one(&pool)
    .await;

    let metrics = match metrics {
        Ok(data) => data,
        Err(e) => return handle_db_error(e),
    };

    let p_avg_uv_index = sqlx::query_scalar::<_, Option<String>>(
        "SELECT get_country_dominant_uv($1)",
    )
    .bind(country_id)
    .fetch_one(&pool)
    .await
    .ok()
    .flatten();

    let latest_date = metrics.latest_date;

    let monthly_avg_temps = sqlx::query_as::<_, CountrySeriesPoint>(
        r#"
        SELECT
            TO_CHAR(MAKE_DATE(2000, EXTRACT(MONTH FROM f.forecasts_date)::INT, 1), 'Mon') AS label,
            ROUND(AVG((f.temp_min + f.temp_max) / 2.0)::numeric, 2)::double precision AS value
        FROM cities ci
        JOIN forecasts f ON ci.id = f.city_id
        WHERE ci.country_id = $1
        GROUP BY EXTRACT(MONTH FROM f.forecasts_date)
        ORDER BY EXTRACT(MONTH FROM f.forecasts_date)
        "#,
    )
    .bind(country_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let historic_extremes = sqlx::query_as::<_, CountryRangePoint>(
        r#"
        SELECT
            EXTRACT(YEAR FROM f.forecasts_date)::INT::TEXT AS label,
            ROUND(MIN(f.temp_min)::numeric, 2)::double precision AS min_temp,
            ROUND(MAX(f.temp_max)::numeric, 2)::double precision AS max_temp
        FROM cities ci
        JOIN forecasts f ON ci.id = f.city_id
        WHERE ci.country_id = $1
        GROUP BY EXTRACT(YEAR FROM f.forecasts_date)
        ORDER BY EXTRACT(YEAR FROM f.forecasts_date)
        "#,
    )
    .bind(country_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let yearly_evolution = sqlx::query_as::<_, CountrySeriesPoint>(
        r#"
        SELECT
            EXTRACT(YEAR FROM f.forecasts_date)::INT::TEXT AS label,
            ROUND(AVG((f.temp_min + f.temp_max) / 2.0)::numeric, 2)::double precision AS value
        FROM cities ci
        JOIN forecasts f ON ci.id = f.city_id
        WHERE ci.country_id = $1
        GROUP BY EXTRACT(YEAR FROM f.forecasts_date)
        ORDER BY EXTRACT(YEAR FROM f.forecasts_date)
        "#,
    )
    .bind(country_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let hottest_cities_today = if let Some(latest_date) = latest_date {
        sqlx::query_as::<_, CountryCityRank>(
            r#"
            SELECT
                ci.name,
                ROUND(AVG((f.temp_min + f.temp_max) / 2.0)::numeric, 2)::double precision AS temp
            FROM cities ci
            JOIN forecasts f ON ci.id = f.city_id
            WHERE ci.country_id = $1
              AND f.forecasts_date = $2
            GROUP BY ci.id, ci.name
            ORDER BY temp DESC, ci.name ASC
            LIMIT 5
            "#,
        )
        .bind(country_id)
        .bind(latest_date)
        .fetch_all(&pool)
        .await
        .unwrap_or_default()
    } else {
        Vec::new()
    };

    let coldest_cities_today = if let Some(latest_date) = latest_date {
        sqlx::query_as::<_, CountryCityRank>(
            r#"
            SELECT
                ci.name,
                ROUND(AVG((f.temp_min + f.temp_max) / 2.0)::numeric, 2)::double precision AS temp
            FROM cities ci
            JOIN forecasts f ON ci.id = f.city_id
            WHERE ci.country_id = $1
              AND f.forecasts_date = $2
            GROUP BY ci.id, ci.name
            ORDER BY temp ASC, ci.name ASC
            LIMIT 5
            "#,
        )
        .bind(country_id)
        .bind(latest_date)
        .fetch_all(&pool)
        .await
        .unwrap_or_default()
    } else {
        Vec::new()
    };

    let latest_avg_temp = if let Some(latest_date) = latest_date {
        sqlx::query_scalar::<_, Option<f64>>(
            r#"
            SELECT AVG((f.temp_min + f.temp_max) / 2.0)
            FROM cities ci
            JOIN forecasts f ON ci.id = f.city_id
            WHERE ci.country_id = $1
              AND f.forecasts_date = $2
            "#,
        )
        .bind(country_id)
        .bind(latest_date)
        .fetch_one(&pool)
        .await
        .ok()
        .flatten()
    } else {
        None
    };

    let multi_year_avg = yearly_evolution
        .iter()
        .map(|entry| entry.value)
        .reduce(|acc, value| acc + value)
        .map(|sum| sum / yearly_evolution.len() as f64);

    let mut alerts = Vec::new();

    if let Some(avg_temp) = overview.p_avg_temp {
        if avg_temp >= 30.0 {
            alerts.push(CountryClimateAlert {
                alert_type: "heat wave".to_string(),
                severity: "high".to_string(),
                message: format!("High national average temperature: {:.1}°C", avg_temp),
            });
        } else if avg_temp <= 0.0 {
            alerts.push(CountryClimateAlert {
                alert_type: "cold wave".to_string(),
                severity: "high".to_string(),
                message: format!("Very low national average temperature: {:.1}°C", avg_temp),
            });
        }
    }

    if let Some(avg_wind) = metrics.p_avg_wind
        && avg_wind >= 35.0
    {
        alerts.push(CountryClimateAlert {
            alert_type: "strong wind".to_string(),
            severity: "medium".to_string(),
            message: format!("Average wind speed is {:.1} km/h", avg_wind),
        });
    }

    if let Some(avg_humidity) = metrics.p_avg_humidity {
        if avg_humidity >= 85.0 {
            alerts.push(CountryClimateAlert {
                alert_type: "extreme humidity".to_string(),
                severity: "medium".to_string(),
                message: format!("Average humidity is {:.1}%", avg_humidity),
            });
        }

        if avg_humidity <= 25.0 {
            alerts.push(CountryClimateAlert {
                alert_type: "possible drought".to_string(),
                severity: "medium".to_string(),
                message: format!("Very low average humidity: {:.1}%", avg_humidity),
            });
        }
    }

    if let (Some(latest_avg), Some(multi_avg)) = (latest_avg_temp, multi_year_avg)
        && (latest_avg - multi_avg).abs() >= 5.0
    {
        alerts.push(CountryClimateAlert {
            alert_type: "climate anomaly".to_string(),
            severity: "high".to_string(),
            message: format!(
                "Recent deviation of {:.1}°C from multi-year average",
                (latest_avg - multi_avg).abs()
            ),
        });
    }

    let db_alerts = sqlx::query_as::<_, CountryClimateAlert>(
        "SELECT alert_type, severity, message FROM get_country_alerts($1)",
    )
    .bind(country_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let dashboard = CountryDashboardResponse {
        p_avg_temp: overview.p_avg_temp,
        p_avg_humidity: metrics.p_avg_humidity,
        p_avg_wind: metrics.p_avg_wind,
        p_avg_uv_index,
        p_alert_count: overview.p_alert_count,
        p_hotspot_city: overview.p_hotspot_city,
        latest_date,
        monthly_avg_temps,
        historic_extremes,
        yearly_evolution,
        hottest_cities_today,
        coldest_cities_today,
        alerts,
        db_alerts,
    };

    (StatusCode::OK, Json(dashboard)).into_response()
}

pub async fn get_user_power(State(pool): State<PgPool>, Path(id): Path<i32>) -> impl IntoResponse {
    let result = sqlx::query_as::<_, UserPowerStats>(
        r#"
        WITH user_data AS (
            SELECT
                COALESCE(u.reputation_score, 0) AS p_reputation,
                COUNT(c.id)::bigint AS p_total_comments
            FROM users u
            LEFT JOIN comments c ON u.id = c.user_id
            WHERE u.id = $1
            GROUP BY u.reputation_score
        ),
        reaction_count AS (
            SELECT COUNT(*)::bigint AS total FROM reaction_logs WHERE user_id = $1
        )
        SELECT
            u.p_reputation,
            u.p_total_comments,
            ROUND(
                (u.p_reputation * 0.5 +
                 u.p_total_comments * 5 * 0.3 +
                 r.total * 2 * 0.2)::numeric, 2
            )::double precision AS p_power_score
        FROM user_data u, reaction_count r
        "#,
    )
    .bind(id)
    .fetch_one(&pool)
    .await;

    match result {
        Ok(stats) => (StatusCode::OK, Json(stats)).into_response(),
        Err(e) => handle_db_error(e),
    }
}

pub async fn get_city_risk(State(pool): State<PgPool>, Path(id): Path<i32>) -> impl IntoResponse {
    let result = sqlx::query_as::<_, CityRisk>(
        r#"
        WITH v_diff AS (
            SELECT (MAX(temp_max) - MIN(temp_min)) AS diff
            FROM forecasts
            WHERE city_id = $1
              AND forecasts_date > CURRENT_DATE - INTERVAL '7 days'
        )
        SELECT
            CASE
                WHEN diff IS NULL THEN 'NO DATA - No recent forecasts found'
                WHEN diff > 20 THEN 'EXTREME VOLATILITY'
                WHEN diff > 10 THEN 'MODERATE RISK'
                ELSE 'STABLE CLIMATE'
            END AS p_risk_level
        FROM v_diff
        "#,
    )
    .bind(id)
    .fetch_one(&pool)
    .await;

    match result {
        Ok(risk) => (StatusCode::OK, Json(risk)).into_response(),
        Err(e) => handle_db_error(e),
    }
}

pub async fn get_city_anomaly(
    State(pool): State<PgPool>,
    Path(id): Path<i32>,
) -> impl IntoResponse {
    let result = sqlx::query_as::<_, CityAnomaly>(
        r#"
        WITH latest AS (
            SELECT id, temp_max
            FROM forecasts
            WHERE city_id = $1
            ORDER BY forecasts_date DESC
            LIMIT 1
        ),
        historical_avg AS (
            SELECT AVG(f.temp_max) AS avg_temp
            FROM forecasts f
            WHERE f.city_id = $1
              AND f.id <> (SELECT COALESCE(id, 0) FROM latest)
        )
        SELECT
            CASE
                WHEN l.temp_max IS NULL OR h.avg_temp IS NULL THEN false
                ELSE ABS(l.temp_max - h.avg_temp) > 10
            END AS p_is_anomaly,
            CASE
                WHEN l.temp_max IS NULL OR h.avg_temp IS NULL THEN 0.0
                ELSE ROUND(ABS(l.temp_max - h.avg_temp)::numeric, 2)::double precision
            END AS p_deviation
        FROM latest l, historical_avg h
        "#,
    )
    .bind(id)
    .fetch_optional(&pool)
    .await;

    match result {
        Ok(Some(anomaly)) => (StatusCode::OK, Json(anomaly)).into_response(),
        Ok(None) => (
            StatusCode::OK,
            Json(CityAnomaly {
                p_is_anomaly: false,
                p_deviation: 0.0,
            }),
        )
            .into_response(),
        Err(e) => handle_db_error(e),
    }
}

pub async fn get_city_trust(State(pool): State<PgPool>, Path(id): Path<i32>) -> impl IntoResponse {
    let result = sqlx::query_as::<_, CityTrust>(
        r#"
        WITH trust_data AS (
            SELECT AVG(c.accuracy_rating)::double precision AS score
            FROM comments c
            JOIN forecasts f ON c.forecast_id = f.id
            WHERE f.city_id = $1
        )
        SELECT
            score AS p_trust_score,
            CASE
                WHEN score IS NULL THEN 'NO DATA - No comments available'
                WHEN score < 2.5 THEN 'LOW TRUST - Check sensors'
                WHEN score > 4.0 THEN 'HIGH TRUST - Data validated by users'
                ELSE 'STABLE'
            END AS p_audit_label
        FROM trust_data
        "#,
    )
    .bind(id)
    .fetch_optional(&pool)
    .await;

    match result {
        Ok(Some(trust)) => (StatusCode::OK, Json(trust)).into_response(),
        Ok(None) => (
            StatusCode::OK,
            Json(CityTrust {
                p_trust_score: None,
                p_audit_label: "NO DATA - No comments available".to_string(),
            }),
        )
            .into_response(),
        Err(e) => handle_db_error(e),
    }
}

pub async fn get_city_seasonal_comparison(
    State(pool): State<PgPool>,
    Path(id): Path<i32>,
    Query(query): Query<CitySeasonalQuery>,
) -> impl IntoResponse {
    let target_date = query.target_date.unwrap_or_else(|| chrono::Local::now().date_naive());

    let result = sqlx::query_as::<_, CitySeasonalComparisonRow>(
        r#"
        SELECT
            comparison_label,
            current_avg_temp,
            reference_avg_temp,
            current_avg_wind,
            reference_avg_wind,
            current_avg_humidity,
            reference_avg_humidity,
            delta_score
        FROM get_city_seasonal_comparison($1, $2)
        ORDER BY comparison_label
        "#,
    )
    .bind(id)
    .bind(target_date)
    .fetch_all(&pool)
    .await;

    match result {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => handle_db_error(e),
    }
}

pub async fn get_country_city_clusters(
    State(pool): State<PgPool>,
    Path(name): Path<String>,
    Query(query): Query<CountryTargetQuery>,
) -> impl IntoResponse {
    let target_date = query.target_date.unwrap_or_else(|| chrono::Local::now().date_naive());

    let result = sqlx::query_as::<_, CountryCityClusterRow>(
        r#"
        WITH city_predictions AS (
            SELECT
                ci.name AS city_name,
                p.avg_temp_max AS avg_temp,
                p.avg_humidity AS avg_humidity,
                p.avg_wind_speed AS avg_wind
            FROM countries co
            JOIN cities ci ON ci.country_id = co.id
            CROSS JOIN LATERAL get_city_prediction(ci.id, $2) p
            WHERE co.name = $1
        ),
        country_avg AS (
            SELECT
                AVG(cp.avg_temp) AS country_avg_temp,
                AVG(cp.avg_humidity) AS country_avg_humidity,
                AVG(cp.avg_wind) AS country_avg_wind
            FROM city_predictions cp
        ),
        classified AS (
            SELECT
                cp.city_name,
                (
                    CASE WHEN cp.avg_temp >= ca.country_avg_temp THEN 'warm' ELSE 'cool' END
                    || ' / ' || CASE WHEN cp.avg_humidity >= ca.country_avg_humidity THEN 'humid' ELSE 'dry' END
                    || ' / ' || CASE WHEN cp.avg_wind >= ca.country_avg_wind THEN 'windy' ELSE 'calm' END
                ) AS cluster_label,
                cp.avg_temp,
                cp.avg_humidity,
                cp.avg_wind,
                ROUND(
                    (
                        ABS(cp.avg_temp - ca.country_avg_temp) / 10.0
                        + ABS(cp.avg_humidity - ca.country_avg_humidity) / 25.0
                        + ABS(cp.avg_wind - ca.country_avg_wind) / 15.0
                    )::NUMERIC,
                    2
                )::DOUBLE PRECISION AS similarity_score
            FROM city_predictions cp
            CROSS JOIN country_avg ca
        )
        SELECT
            c.city_name,
            c.cluster_label,
            c.avg_temp,
            c.avg_humidity,
            c.avg_wind,
            c.similarity_score,
            COUNT(*) OVER (PARTITION BY c.cluster_label)::INT AS cluster_size
        FROM classified c
        ORDER BY c.cluster_label, c.similarity_score ASC, c.city_name ASC
        "#,
    )
    .bind(name)
    .bind(target_date)
    .fetch_all(&pool)
    .await;

    match result {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => handle_db_error(e),
    }
}

pub async fn get_country_city_leaderboard(
    State(pool): State<PgPool>,
    Path(name): Path<String>,
    Query(query): Query<CountryTargetQuery>,
) -> impl IntoResponse {
    let target_date = query.target_date.unwrap_or_else(|| chrono::Local::now().date_naive());
    let limit = query.limit.unwrap_or(20).clamp(1, 50);

    let result = sqlx::query_as::<_, CountryCityLeaderboardRow>(
        r#"
        WITH city_predictions AS (
            SELECT
                ci.name AS city_name,
                p.avg_temp_max AS avg_temp,
                p.avg_humidity AS avg_humidity,
                p.avg_wind_speed AS avg_wind,
                COALESCE(aw.alert_count, 0) AS alert_count
            FROM countries co
            JOIN cities ci ON ci.country_id = co.id
            CROSS JOIN LATERAL get_city_prediction(ci.id, $2) p
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::INT AS alert_count
                FROM forecasts f
                JOIN alerts a ON a.forecast_id = f.id
                WHERE f.city_id = ci.id
                  AND f.forecasts_date = $2
            ) aw ON TRUE
            WHERE co.name = $1
        ),
        scored AS (
            SELECT
                cp.city_name,
                cp.avg_temp,
                cp.avg_humidity,
                cp.avg_wind,
                ROUND(
                    (
                        CASE
                            WHEN cp.avg_temp BETWEEN 18 AND 26 THEN 100.0
                            ELSE 100.0 - ABS(cp.avg_temp - 22.0) * 2.0
                        END
                        - cp.avg_wind * 0.35
                        - ABS(cp.avg_humidity - 55.0) * 0.15
                        - cp.alert_count * 1.5
                    )::NUMERIC,
                    2
                )::DOUBLE PRECISION AS forecast_score
            FROM city_predictions cp
        )
        SELECT
            CAST(ROW_NUMBER() OVER (ORDER BY s.forecast_score DESC, s.city_name ASC) AS INT) AS rank_position,
            s.city_name,
            s.forecast_score,
            s.avg_temp,
            s.avg_humidity,
            s.avg_wind
        FROM scored s
        ORDER BY s.forecast_score DESC, s.city_name ASC
        LIMIT $3
        "#,
    )
    .bind(name)
    .bind(target_date)
    .bind(limit)
    .fetch_all(&pool)
    .await;

    match result {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => handle_db_error(e),
    }
}

pub async fn get_country_forecast_scoreboard(
    State(pool): State<PgPool>,
    Path(name): Path<String>,
    Query(query): Query<CountryTargetQuery>,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(20).clamp(1, 50);

    let result = sqlx::query_as::<_, ForecastScoreboardRow>(
        r#"
        WITH forecast_base AS (
            SELECT
                f.id,
                ci.name AS city_name,
                f.forecasts_date
            FROM forecasts f
            JOIN cities ci ON ci.id = f.city_id
            JOIN countries co ON co.id = ci.country_id
            WHERE co.name = $1
        ),
        comment_stats AS (
            SELECT
                c.forecast_id,
                COUNT(*)::INT AS comment_count,
                AVG(c.accuracy_rating)::DOUBLE PRECISION AS avg_accuracy,
                CASE
                    WHEN SUM(GREATEST(COALESCE(u.reputation_score, 0), 1)) = 0 THEN NULL
                    ELSE SUM(c.accuracy_rating * GREATEST(COALESCE(u.reputation_score, 0), 1))::DOUBLE PRECISION
                        / SUM(GREATEST(COALESCE(u.reputation_score, 0), 1))
                END AS weighted_accuracy,
                AVG(COALESCE(u.reputation_score, 0))::DOUBLE PRECISION AS reputation_score,
                COALESCE(SUM(CASE WHEN cv.vote_type = 'like' THEN 1 WHEN cv.vote_type = 'dislike' THEN -1 ELSE 0 END), 0)::DOUBLE PRECISION AS vote_balance
            FROM comments c
            JOIN users u ON u.id = c.user_id
            LEFT JOIN comment_votes cv ON cv.comment_id = c.id
            GROUP BY c.forecast_id
        ),
        scored AS (
            SELECT
                fb.city_name,
                fb.forecasts_date,
                COALESCE(cs.comment_count, 0) AS comment_count,
                COALESCE(cs.weighted_accuracy, cs.avg_accuracy, 0)::DOUBLE PRECISION AS weighted_accuracy,
                COALESCE(cs.reputation_score, 0)::DOUBLE PRECISION AS reputation_score,
                ROUND(
                    (
                        COALESCE(cs.weighted_accuracy, cs.avg_accuracy, 0) * 18.0
                        + COALESCE(cs.comment_count, 0) * 1.5
                        + COALESCE(cs.reputation_score, 0) * 0.4
                        + COALESCE(cs.vote_balance, 0) * 0.75
                    )::NUMERIC,
                    2
                )::DOUBLE PRECISION AS forecast_score
            FROM forecast_base fb
            LEFT JOIN comment_stats cs ON cs.forecast_id = fb.id
        )
        SELECT
            CAST(ROW_NUMBER() OVER (ORDER BY s.forecast_score DESC, s.city_name ASC, s.forecasts_date DESC) AS INT) AS rank_position,
            s.city_name,
            s.forecasts_date AS forecast_date,
            s.forecast_score,
            s.weighted_accuracy,
            s.comment_count,
            s.reputation_score
        FROM scored s
        ORDER BY s.forecast_score DESC, s.city_name ASC, s.forecasts_date DESC
        LIMIT $2
        "#,
    )
    .bind(name)
    .bind(limit)
    .fetch_all(&pool)
    .await;

    match result {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => handle_db_error(e),
    }
}

fn handle_db_error(e: sqlx::Error) -> axum::response::Response {
    if let Some(db_err) = e.as_database_error() {
        let msg = db_err.message();
        if msg.contains("Anti-spam") || msg.contains("3 seconds") {
            return (
                StatusCode::TOO_MANY_REQUESTS,
                Json(serde_json::json!({
                    "status": "error",
                    "type": "RateLimitExceeded",
                    "message": msg
                })),
            )
                .into_response();
        }
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "status": "error",
                "type": "DatabaseError",
                "message": msg
            })),
        )
            .into_response();
    }

    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "An unexpected server error occurred",
    )
        .into_response()
}
