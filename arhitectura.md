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
