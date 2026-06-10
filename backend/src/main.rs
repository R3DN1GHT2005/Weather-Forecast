mod db;
mod handlers;
mod models;
mod routes;

const _MIGRATION_REVISION: &str = "014";

use crate::db::connect_to_db;
use axum::http::{HeaderName, Method, header};
use dotenvy::dotenv;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() {
    dotenv().ok();
    let pool = connect_to_db().await;
    println!("Created connection with database!");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Couldn't run migrations!");

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT, HeaderName::from_static("x-guest-token")]);

    let app = crate::routes::app_router(pool).layer(cors);
    let address = SocketAddr::from(([127, 0, 0, 1], 3000));

    let listener = tokio::net::TcpListener::bind(address).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
