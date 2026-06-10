use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use std::env;

pub async fn connect_to_db() -> PgPool {
    let database_url =
        env::var("DATABASE_URL").expect("Variable DATABASE_URL is not set in .env");

    return PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("Couldn't connect to the database");
}
