CREATE TABLE IF NOT EXISTS countries(
    id serial primary key,
    name VARCHAR(60) not null unique
);

CREATE TABLE IF NOT EXISTS cities(
    id serial primary key,
    country_id int references countries(id) on delete cascade,
    name VARCHAR(60) not null UNIQUE,
    latitude DOUBLE PRECISION,  
    longitude DOUBLE PRECISION 
);

CREATE TABLE IF NOT EXISTS users(
    id serial primary key,
    email VARCHAR(255) not null unique,
    google_id VARCHAR(255) unique,
    username VARCHAR(100),
    avatar_url text,
    reputation_score int default 0,
    created_at timestamp with time zone default current_timestamp
);

CREATE TABLE IF NOT EXISTS forecasts(
    id serial primary key,
    city_id int references cities(id) on delete cascade,
    forecasts_date date not null,
    temp_min DOUBLE PRECISION not null, 
    temp_max DOUBLE PRECISION not null, 
    wind_speed DOUBLE PRECISION not null, 
    humidity int check (humidity >=0 and humidity<=100),
    uv_index VARCHAR(20),
    icon_type VARCHAR(50),
    unique(city_id, forecasts_date)
);

CREATE TABLE IF NOT EXISTS alerts(
    id serial primary key,
    forecast_id int references forecasts(id) on delete cascade,
    alert_message VARCHAR(255) NOT NULL,
    recommendation text,
    created_at timestamp with time zone default current_timestamp
);

CREATE TABLE IF NOT EXISTS comments(
    id serial primary key,
    user_id int references users(id) on delete set null,
    forecast_id int references forecasts(id) on delete cascade,
    accuracy_rating int check(accuracy_rating between 1 and 5),
    comments_text text,
    created_at timestamp with time zone default current_timestamp
);