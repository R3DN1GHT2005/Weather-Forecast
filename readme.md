# Demo:
https://youtu.be/RcQGiWM8hWc

# Weather Forecast

A full-stack weather forecasting application with Google OAuth, statistical analysis, anomaly detection, and location-based predictions across 600 cities.

Also available in Romanian — see [`documentation/referat_prognoza_meteo.docx`](documentation/referat_prognoza_meteo.docx) and [`arhitectura.md`](arhitectura.md).

---

## Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js, React 19, TypeScript, Vite, Recharts, Leaflet, React-Leaflet, Axios |
| **Backend** | Rust, Axum 0.8, SQLx, Tokio, jsonwebtoken, reqwest, tower-http |
| **Database** | PostgreSQL with 18 SQL migrations (PL/pgSQL functions, triggers, stored procedures) |
| **Scripting** | Python (seed, alerts, anomaly generation) |

---

## Data

- **~5 million rows** inserted across the database
- **600 cities** from around the world (40 per country, balanced by population)
- **853 days** of historical weather data (April 2024 – May 2026) sourced from Open-Meteo API
- **18 database migrations** implementing business logic directly in PostgreSQL

---

## Architecture

```
PROJECT/
├── backend/          # Rust + Axum REST API
│   ├── src/
│   │   ├── main.rs           # Server startup, CORS, migrations
│   │   ├── db.rs             # PgPool connection (max 10 connections)
│   │   ├── routes.rs         # 35+ public & protected endpoints
│   │   ├── handlers/         # Business logic layer
│   │   │   ├── auth.rs       # Google OAuth, JWT, refresh tokens
│   │   │   ├── forecasts.rs  # Predictions, bulk predictions, history
│   │   │   ├── discovery.rs  # City/country search, map bounds query
│   │   │   ├── social.rs     # Comments, reactions (like/dislike)
│   │   │   ├── stats.rs      # Country dashboards, clusters, leaderboards
│   │   │   ├── user.rs       # Profile, favorites, settings
│   │   │   └── weather.rs    # Current weather, alerts, history
│   │   └── models/           # DTOs & DB mappings
│   └── migrations/           # 18 SQL migrations (see below)
├── frontend/         # Next.js + React 19
│   └── src/
│       ├── pages/            # Dashboard, CityDetails, Statistics, Favorites, Settings, Login
│       ├── components/       # MapView, WeatherCard, Navbar, AlertBanner, ProtectedRoute
│       ├── services/         # Axios with auto token refresh & request queuing
│       ├── context/          # AuthContext (user state, login/logout)
│       ├── hooks/            # useAuth
│       └── types/            # TypeScript interfaces
├── scripts/          # Python utilities
│   ├── seed_meteo.py         # Seeds 5M rows from Open-Meteo API
│   ├── generate_alerts.py    # Injects extreme weather data to trigger DB alerts
│   └── generate_romania_anomaly.py  # Generates temperature anomalies for testing
└── worldcities.csv           # Data source (population-balanced city selection)
```

---

## Cool Features

### 1. Prediction Engine (PL/pgSQL)
`get_city_prediction()` at [`backend/migrations/002_create_prediction_function.sql`](backend/migrations/002_create_prediction_function.sql) combines:
- **7-day recent trend offset** capped at ±4°C
- **DOY window averages** (±3 days around target date across all years)
- **3-year historical extrapolation** — compares same day-of-year in prior years against their window averages to compute deltas
- Result is clamped to realistic ranges

`get_city_prediction_bulk()` wraps this to return up to 10 days at once, pre-decorated with icons and UV index.

### 2. Bulk Prediction with Concurrent Fetching
The frontend (`CityDetails.tsx`) fetches predictions in **parallel batches of 6** for missing dates. For 5-day, 7-day, 10-day ranges it uses the bulk endpoint; for 1-month and 1-year ranges it selectively fetches missing dates only.

### 3. Weather Icon Classification
`generate_weather_icon()` at [`backend/migrations/008_generate_weather_icon.sql`](backend/migrations/008_generate_weather_icon.sql) classifies conditions into 12 types:
☀️ Senin → ☀️ Caniculă → 🔥 Caniculă cu umiditate → ⛅ Parțial înnorat → ☁️ Înnorat → 🌦️ Ploaie ușoară → 🌧️ Ploaie abundentă → 🌬️ Vânt puternic cu ploaie → 💨 Vânt puternic → ⛈️ Furtună → ❄️ Ninsoare → 🥶 Ger

Automatically populated via a `BEFORE INSERT OR UPDATE` trigger on the `forecasts` table.

### 4. UV Index Generation
`generate_uv_index()` at [`backend/migrations/012_add_uv_index_generation.sql`](backend/migrations/012_add_uv_index_generation.sql) derives UV levels (Low → Moderate → High → Very High → Extreme) from temperature, humidity, and wind speed. Also auto-filled via trigger on every forecast insert/update.

### 5. Extreme Weather Alert Trigger
`check_extreme_weather()` at [`backend/migrations/003_create_weather_alerts.sql`](backend/migrations/003_create_weather_alerts.sql) is an `AFTER INSERT` trigger that fires on every new forecast row and creates alerts if:
- temp_max ≥ 35°C → extreme heat alert with recommendations
- temp_min ≤ -10°C → extreme cold alert
- wind_speed ≥ 50 km/h → high wind alert
- humidity ≥ 95% → high humidity alert

Duplicate alerts are prevented (checks if forecast_id already has an alert).

### 6. Comment System with Anti-Spam & Reputation
- **Votes**: Like/dislike on comments, supports both authenticated users and anonymous guest tokens (`x-guest-token` header)
- **Anti-spam**: `trg_handle_vote_antispam()` at [`backend/migrations/015_add_vote_antispam_and_icon_trigger.sql`](backend/migrations/015_add_vote_antispam_and_icon_trigger.sql) enforces a **3-second cooldown** between votes using a `reaction_logs` table
- **Reputation system**: `adjust_comment_vote_reputation()` at [`backend/migrations/011_add_comment_vote_reputation.sql`](backend/migrations/011_add_comment_vote_reputation.sql) adjusts comment author's reputation on each vote:
  - Users with reputation ≥ 100 have **double voting power** (20 instead of 10)
  - Dislikes apply negative delta
- **Optimistic UI**: Comments appear instantly with a "Sending..." state, then update with server response

### 7. Country Statistics Dashboard
`/stats/country/{name}/dashboard` at [`backend/src/handlers/stats.rs:184`](backend/src/handlers/stats.rs:184) returns a comprehensive response with:
- National averages (temp, humidity, wind, UV index)
- Monthly temperature trends (line chart)
- Historic yearly extremes (min/max bar chart)
- Yearly evolution
- Hottest and coldest cities today (top 5)
- In-memory climate alerts (heat wave, cold wave, strong wind, extreme humidity, drought, climate anomaly)
- Database alerts from `get_country_alerts()`

### 8. Weather Clustering
`get_country_city_clusters()` at [`backend/migrations/014_add_bulk_predictions_and_rankings.sql`](backend/migrations/014_add_bulk_predictions_and_rankings.sql) classifies cities within a country into 8 clusters:
`warm/humid/windy` · `warm/humid/calm` · `warm/dry/windy` · `warm/dry/calm` · `cool/humid/windy` · `cool/humid/calm` · `cool/dry/windy` · `cool/dry/calm`

Each city gets a similarity score relative to the national average, and clusters show their size.

### 9. City Leaderboards & Forecast Scoreboard
- **City Forecast Leaderboard**: Ranks cities by a composite score (ideal temp = 22°C, penalties for wind, humidity deviation, alert count)
- **Forecast Scoreboard**: Ranks forecasts by weighted accuracy (reputation-weighted), comment count, reputation score, and vote balance

### 10. Volatility Risk Assessment
`proc_classify_city_risk()` classifies cities based on 7-day temperature volatility:
- STABLE CLIMATE (diff ≤ 10°C)
- MODERATE RISK (diff 10-20°C)
- EXTREME VOLATILITY (diff > 20°C)

### 11. Anomaly Detection
`proc_detect_city_anomaly()` compares the latest temperature against the historical average. Flagged as anomaly if deviation exceeds 10°C. The frontend visualizes this with a bar chart showing the exact deviation.

### 12. City Trust Score
`proc_audit_city_trust()` computes average user accuracy rating per city and labels it:
- HIGH TRUST (> 4.0) — "Data validated by users"
- STABLE (2.5-4.0)
- LOW TRUST (< 2.5) — "Check sensors"

### 13. Seasonal Comparisons
`get_city_seasonal_comparison()` at [`backend/migrations/014_add_bulk_predictions_and_rankings.sql`](backend/migrations/014_add_bulk_predictions_and_rankings.sql) compares current conditions against:
- Same day of month across all prior years
- Entire seasonal baseline (winter/spring/summer/autumn)
- Delta score aggregates temperature, wind, and humidity differences

### 14. User Power Score
`/stats/user/{id}/power` computes a user's influence score as: `reputation × 0.5 + comments × 5 × 0.3 + reactions × 2 × 0.2`.

### 15. Interactive Map
`MapView.tsx` at [`frontend/src/components/MapView.tsx`](frontend/src/components/MapView.tsx) uses Leaflet with:
- Dynamic city loading based on map bounds (zoom level 6+)
- City markers with weather popups (temp, wind, humidity)
- Favorite toggle directly on map markers
- "You must be logged in" tooltip for unauthenticated favorite attempts
- Fly-to animation when searching cities

### 16. Token Refresh with Request Queue
The Axios interceptor at [`frontend/src/services/api.ts`](frontend/src/services/api.ts) handles 401 errors by:
- Queuing all pending requests while refreshing the token
- Processing the queue atomically after successful refresh
- Redirecting to login on refresh failure

### 17. Optimistic Comment UI
Comments submitted on CityDetails page appear immediately with a "Sending..." indicator and transition to the server response seamlessly. On failure, they roll back and restore the input.

### 18. Seed Script with Resume Support
`seed_meteo.py` at [`scripts/seed_meteo.py`](scripts/seed_meteo.py) intelligently:
- Selects 40 most populous cities per country
- Fetches 853 days of historical data from Open-Meteo Archive API
- Handles 429 rate limits with 30-minute backoff and countdown
- Saves progress to `progress.txt` for resumable seeding
- Runs `update_country()` at the end to normalize country associations

### 19. Alert Generation Script
`generate_alerts.py` creates extreme weather forecasts to trigger the alert system — useful for testing.

### 20. Documentation in Romanian
See [`documentation/referat_prognoza_meteo.docx`](documentation/referat_prognoza_meteo.docx) for the full academic paper in Romanian covering architecture, algorithms, and methodology.

---

## How to Run

### Prerequisites
- PostgreSQL (running)
- Rust (latest stable)
- Node.js 20+
- Python 3.10+

### Setup

1. **Backend environment** — create `backend/.env`:
   ```
   DATABASE_URL=postgres://user:pass@localhost/prognoza_meteo
   JWT_SECRET=your-secret-key
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   ```

2. **Start backend** (migrations run automatically):
   ```bash
   cd backend
   cargo run
   # Server starts at http://localhost:3000
   ```

3. **Start frontend** (in a separate terminal):
   ```bash
   cd frontend
   npm install    # first time only
   npm run dev
   # Opens at http://localhost:5173
   ```

4. **Seed the database** (populates 600 cities × 853 days ≈ 5M rows):
   ```bash
   cd scripts
   python seed_meteo.py
   ```
   The script is resumable — if interrupted, it continues from where it left off.

5. **(Optional) Generate test alerts**:
   ```bash
   cd scripts
   python generate_alerts.py
   python generate_romania_anomaly.py
   ```
