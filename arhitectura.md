PROJECT/
├── arhitectura.md
├── init_database.sql
├── backend/
│   ├── Cargo.toml                 # Rust + Axum + SQLx + PostgreSQL
│   ├── migrations/                # Sequentially applied SQL migrations
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_create_prediction_function.sql
│   │   ├── 003_create_weather_alerts.sql
│   │   ├── 004_react_scheme.sql
│   │   ├── 005_statistics_procedures.sql
│   │   ├── 006_add_refresh_token.sql
│   │   ├── 007_create_saved_cities.sql
│   │   ├── 008_generate_weather_icon.sql
│   │   └── 009_add_favorite_procedure.sql
│   └── src/
│       ├── main.rs                # Entry point: starts the Axum server
│       ├── db.rs                  # PgPool + PostgreSQL connection config
│       ├── routes.rs              # Public and protected routes
│       ├── handlers/              # Business logic
│       │   ├── auth.rs            # Google OAuth + access/refresh tokens
│       │   ├── discovery.rs       # City / country search & discovery
│       │   ├── forecasts.rs       # Predictions and forecast history
│       │   ├── social.rs          # Comments and reactions
│       │   ├── stats.rs           # National and per-city statistics
│       │   ├── user.rs            # Profile, favorites, settings
│       │   └── weather.rs         # Current weather, alerts, icons
│       └── models/                # DTOs and DB data mappings
│           ├── alert.rs
│           ├── city.rs
│           ├── comment.rs
│           ├── comment_reaction.rs
│           ├── country.rs
│           ├── forecast.rs
│           ├── reaction_log.rs
│           └── user.rs
│
├── frontend/
│   ├── package.json               # React + Vite + TypeScript
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx               # Mount React app
│   │   ├── App.tsx                # Router and global layout
│   │   ├── context/
│   │   │   └── AuthContext.tsx    # Authentication state
│   │   ├── hooks/
│   │   │   └── useAuth.ts
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx      # Map, search, predictions, favorites
│   │   │   ├── CityDetails.tsx    # City details, comments, votes
│   │   │   ├── Favorites.tsx      # Saved cities and associated alerts
│   │   │   ├── Login.tsx          # Google login
│   │   │   ├── Settings.tsx       # Account settings
│   │   │   └── Statistics.tsx     # Global and local statistics
│   │   ├── components/
│   │   │   ├── AlertBanner.tsx
│   │   │   ├── MapView.tsx
│   │   │   ├── Navbar.tsx
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── WeatherCard.tsx
│   │   ├── services/
│   │   │   └── api.ts             # Axios + token refresh
│   │   └── types/
│   │       └── weather.ts         # TypeScript interfaces for responses
│   └── public/
│
├── scripts/
│   ├── seed_meteo.py              # Automatic seed for weather data
│   └── update_country.py          # Utility for updating countries/cities
│
└── worldcities.csv                # Data source for populating cities

## Logical architecture

The application is split into three layers:

1. Web client in React + TypeScript, responsible for UI, search, map, charts, and user actions.
2. Rust backend server, which exposes a REST API and orchestrates business logic.
3. PostgreSQL database, storing forecasts, cities, countries, users, favorites, comments, reactions, and alerts.

## Main flows

- Dashboard: city search, autocomplete, selection, automatic prediction for the current day, add to favorites.
- City details: weather evolution, prediction for a given date, comments and like/dislike votes.
- Statistics: per-country and per-city statistics, historical charts, alerts and classifications.
- Favorites: list of saved cities and their associated alerts.
- Settings: update username and display profile data.

## Server elements worth explaining in the report

- the `get_city_prediction` SQL function, which combines the local average with historical data from previous years;
- the `generate_weather_icon` function, which classifies weather conditions based on meteorological parameters;
- the extreme weather alert trigger;
- the comment reaction logic and anti-spam protection;
- access control via JWT and refresh token.

## How to run

1. Start the backend:
   ```bash
   cd backend
   cargo run
   ```

2. Start the frontend (in a separate terminal):
   ```bash
   cd frontend
   npm install   # only the first time
   npm run dev
   ```

3. Open the URL shown in the frontend terminal (default: `http://localhost:5173`).

> Make sure PostgreSQL is running and the database is initialized via the migrations (run automatically by the backend). The backend requires a `.env` file in `backend/` with the database connection string and Google OAuth credentials.
│