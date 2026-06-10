use crate::handlers::auth::{google_auth, mw_auth, refresh_token_handler};
use crate::handlers::discovery::{
    get_all_cities, get_all_countries, get_cities_by_country, get_city_details, search_cities,get_cities_by_bounds
};
use crate::handlers::forecasts::{create_forecast, get_all_forecasts, get_prediction, get_prediction_bulk, get_forecast_list};
use crate::handlers::social::{create_comment, create_city_comment, get_city_comments, get_forecast_comments, toggle_reaction};
use crate::handlers::stats::{
    get_city_anomaly, get_city_risk, get_city_seasonal_comparison, get_city_trust, get_country_city_clusters,
    get_country_city_leaderboard, get_country_dashboard, get_country_forecast_scoreboard, get_country_report, get_user_power,
};
use crate::handlers::user::{get_my_profile, get_user_stats, save_city, unsave_city, update_settings,get_city_favorites};
use crate::handlers::weather::{get_active_alerts, get_current_weather, get_forecast_history, get_today_alerts};
use axum::{
    Router, middleware,
    routing::{get, patch, post},
};
use sqlx::PgPool;

pub fn app_router(pool: PgPool) -> Router {
    let protected_routes = Router::new()
        .route("/comments", post(create_comment))
        .route("/comments/{comment_id}/react", post(toggle_reaction))
        .route("/cities/{city_id}/comments", post(create_city_comment))
        .route("/users/me", get(get_my_profile))
        .route("/users/{id}/stats", get(get_user_stats))
        .route("/users/me/settings", patch(update_settings))
        .route("/cities/{city_id}/save", post(save_city).delete(unsave_city))
        .route("/users/me/favorites", get(get_city_favorites))
        .layer(middleware::from_fn(mw_auth));

    let public_routes = Router::new()
        .route("/forecasts", get(get_all_forecasts))
        .route("/forecasts/{city_id}", get(get_forecast_list))
        .route("/forecasts/{city_id}/prediction", get(get_prediction))
        .route("/forecasts/{city_id}/prediction/bulk", get(get_prediction_bulk))
        .route("/stats/country/{name}", get(get_country_report))
        .route("/stats/country/{name}/dashboard", get(get_country_dashboard))
        .route("/stats/country/{name}/clusters", get(get_country_city_clusters))
        .route("/stats/country/{name}/leaderboard", get(get_country_city_leaderboard))
        .route("/stats/country/{name}/forecast-ranking", get(get_country_forecast_scoreboard))
        .route("/stats/user/{id}/power", get(get_user_power))
        .route("/stats/city/{id}/anomaly", get(get_city_anomaly))
        .route("/stats/city/{id}/trust", get(get_city_trust))
        .route("/stats/city/{id}/seasonal", get(get_city_seasonal_comparison))
        .route("/stats/city/{id}/risk", get(get_city_risk))
        .route("/countries", get(get_all_countries))
        .route("/countries/{id}/cities", get(get_cities_by_country))
        .route("/cities", get(get_all_cities))
        .route("/cities/{id}", get(get_city_details))
        .route("/cities/{city_id}/comments", get(get_city_comments))
        .route("/cities/search", get(search_cities))
        .route("/weather/current/{city_id}", get(get_current_weather))
        .route("/weather/alerts/{city_id}", get(get_active_alerts))
        .route("/cities/{city_id}/alerts", get(get_active_alerts))
        .route("/cities/{city_id}/alerts/today", get(get_today_alerts))
        .route("/weather/history/{city_id}", get(get_forecast_history))
        .route("/comments/forecast", get(get_forecast_comments))
        .route("/auth/google", post(google_auth))
        .route("/auth/refresh", post(refresh_token_handler))
        
        .route("/cities/bounds", get(get_cities_by_bounds));

    // Move forecast creation behind authentication
    let protected_routes = protected_routes.route("/forecasts", post(create_forecast));

    public_routes.merge(protected_routes).with_state(pool)
}
