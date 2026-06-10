CREATE OR REPLACE FUNCTION get_city_prediction_bulk(
    p_city_id INT,
    p_start_date DATE,
    p_days INT DEFAULT 10
)
RETURNS TABLE (
    forecast_date DATE,
    avg_temp_min DOUBLE PRECISION,
    avg_temp_max DOUBLE PRECISION,
    avg_wind_speed DOUBLE PRECISION,
    avg_humidity DOUBLE PRECISION,
    icon_type TEXT,
    uv_index TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_days INT := GREATEST(1, LEAST(COALESCE(p_days, 10), 10));
    v_index INT;
    v_date DATE;
BEGIN
    FOR v_index IN 0..v_days - 1 LOOP
        v_date := p_start_date + v_index;

        RETURN QUERY
        SELECT
            v_date AS forecast_date,
            p.avg_temp_min,
            p.avg_temp_max,
            p.avg_wind_speed,
            p.avg_humidity,
            generate_weather_icon(p.avg_temp_max, p.avg_humidity, p.avg_wind_speed)::TEXT AS icon_type,
            generate_uv_index(p.avg_temp_max, p.avg_humidity::INT, p.avg_wind_speed)::TEXT AS uv_index
        FROM get_city_prediction(p_city_id, v_date) p;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION get_city_seasonal_comparison(
    p_city_id INT,
    p_target_date DATE
)
RETURNS TABLE (
    comparison_label TEXT,
    current_avg_temp DOUBLE PRECISION,
    reference_avg_temp DOUBLE PRECISION,
    current_avg_wind DOUBLE PRECISION,
    reference_avg_wind DOUBLE PRECISION,
    current_avg_humidity DOUBLE PRECISION,
    reference_avg_humidity DOUBLE PRECISION,
    delta_score DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_temp DOUBLE PRECISION;
    v_current_wind DOUBLE PRECISION;
    v_current_humidity DOUBLE PRECISION;
    v_month INT := EXTRACT(MONTH FROM p_target_date)::INT;
    v_season TEXT;
BEGIN
    SELECT
        COALESCE(
            (SELECT f.temp_max FROM forecasts f WHERE f.city_id = p_city_id AND f.forecasts_date = p_target_date LIMIT 1),
            (SELECT p.avg_temp_max FROM get_city_prediction(p_city_id, p_target_date) p LIMIT 1)
        ),
        COALESCE(
            (SELECT f.wind_speed FROM forecasts f WHERE f.city_id = p_city_id AND f.forecasts_date = p_target_date LIMIT 1),
            (SELECT p.avg_wind_speed FROM get_city_prediction(p_city_id, p_target_date) p LIMIT 1)
        ),
        COALESCE(
            (SELECT f.humidity::DOUBLE PRECISION FROM forecasts f WHERE f.city_id = p_city_id AND f.forecasts_date = p_target_date LIMIT 1),
            (SELECT p.avg_humidity FROM get_city_prediction(p_city_id, p_target_date) p LIMIT 1)
        )
    INTO v_current_temp, v_current_wind, v_current_humidity;

    v_season := CASE
        WHEN v_month IN (12, 1, 2) THEN 'winter'
        WHEN v_month IN (3, 4, 5) THEN 'spring'
        WHEN v_month IN (6, 7, 8) THEN 'summer'
        ELSE 'autumn'
    END;

    RETURN QUERY
    WITH same_day AS (
        SELECT
            AVG(f.temp_max)::DOUBLE PRECISION AS ref_temp,
            AVG(f.wind_speed)::DOUBLE PRECISION AS ref_wind,
            AVG(f.humidity)::DOUBLE PRECISION AS ref_humidity
        FROM forecasts f
        WHERE f.city_id = p_city_id
          AND f.forecasts_date <> p_target_date
          AND EXTRACT(MONTH FROM f.forecasts_date) = v_month
          AND EXTRACT(DAY FROM f.forecasts_date) = EXTRACT(DAY FROM p_target_date)
    ),
    seasonal AS (
        SELECT
            AVG(f.temp_max)::DOUBLE PRECISION AS ref_temp,
            AVG(f.wind_speed)::DOUBLE PRECISION AS ref_wind,
            AVG(f.humidity)::DOUBLE PRECISION AS ref_humidity
        FROM forecasts f
        WHERE f.city_id = p_city_id
          AND f.forecasts_date <> p_target_date
          AND CASE
                WHEN EXTRACT(MONTH FROM f.forecasts_date) IN (12, 1, 2) THEN 'winter'
                WHEN EXTRACT(MONTH FROM f.forecasts_date) IN (3, 4, 5) THEN 'spring'
                WHEN EXTRACT(MONTH FROM f.forecasts_date) IN (6, 7, 8) THEN 'summer'
                ELSE 'autumn'
              END = v_season
    )
    SELECT
        'same_day_previous_years'::TEXT AS comparison_label,
        v_current_temp AS current_avg_temp,
        s.ref_temp AS reference_avg_temp,
        v_current_wind AS current_avg_wind,
        s.ref_wind AS reference_avg_wind,
        v_current_humidity AS current_avg_humidity,
        s.ref_humidity AS reference_avg_humidity,
        CASE
            WHEN s.ref_temp IS NULL OR s.ref_wind IS NULL OR s.ref_humidity IS NULL THEN NULL
            ELSE ROUND(
                (
                    ABS(COALESCE(v_current_temp, 0) - s.ref_temp)
                    + ABS(COALESCE(v_current_wind, 0) - s.ref_wind) / 5.0
                    + ABS(COALESCE(v_current_humidity, 0) - s.ref_humidity) / 10.0
                )::NUMERIC,
                2
            )::DOUBLE PRECISION
        END AS delta_score
    FROM same_day s

    UNION ALL

    SELECT
        'seasonal_average'::TEXT AS comparison_label,
        v_current_temp AS current_avg_temp,
        s.ref_temp AS reference_avg_temp,
        v_current_wind AS current_avg_wind,
        s.ref_wind AS reference_avg_wind,
        v_current_humidity AS current_avg_humidity,
        s.ref_humidity AS reference_avg_humidity,
        CASE
            WHEN s.ref_temp IS NULL OR s.ref_wind IS NULL OR s.ref_humidity IS NULL THEN NULL
            ELSE ROUND(
                (
                    ABS(COALESCE(v_current_temp, 0) - s.ref_temp)
                    + ABS(COALESCE(v_current_wind, 0) - s.ref_wind) / 5.0
                    + ABS(COALESCE(v_current_humidity, 0) - s.ref_humidity) / 10.0
                )::NUMERIC,
                2
            )::DOUBLE PRECISION
        END AS delta_score
    FROM seasonal s;
END;
$$;

CREATE OR REPLACE FUNCTION get_country_city_clusters(
    p_country_name TEXT,
    p_target_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    city_name TEXT,
    cluster_label TEXT,
    avg_temp DOUBLE PRECISION,
    avg_humidity DOUBLE PRECISION,
    avg_wind DOUBLE PRECISION,
    similarity_score DOUBLE PRECISION,
    cluster_size INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH city_predictions AS (
        SELECT
            ci.name AS city_name,
            p.avg_temp_max AS avg_temp,
            p.avg_humidity AS avg_humidity,
            p.avg_wind_speed AS avg_wind
        FROM countries co
        JOIN cities ci ON ci.country_id = co.id
        CROSS JOIN LATERAL get_city_prediction(ci.id, p_target_date) p
        WHERE co.name = p_country_name
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
    ORDER BY c.cluster_label, c.similarity_score ASC, c.city_name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION get_country_city_leaderboard(
    p_country_name TEXT,
    p_target_date DATE DEFAULT CURRENT_DATE,
    p_limit INT DEFAULT 20
)
RETURNS TABLE (
    rank_position INT,
    city_name TEXT,
    forecast_score DOUBLE PRECISION,
    avg_temp DOUBLE PRECISION,
    avg_humidity DOUBLE PRECISION,
    avg_wind DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH city_predictions AS (
        SELECT
            ci.name AS city_name,
            p.avg_temp_max AS avg_temp,
            p.avg_humidity AS avg_humidity,
            p.avg_wind_speed AS avg_wind,
            COALESCE(aw.alert_count, 0) AS alert_count
        FROM countries co
        JOIN cities ci ON ci.country_id = co.id
        CROSS JOIN LATERAL get_city_prediction(ci.id, p_target_date) p
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::INT AS alert_count
            FROM forecasts f
            JOIN alerts a ON a.forecast_id = f.id
            WHERE f.city_id = ci.id
              AND f.forecasts_date = p_target_date
        ) aw ON TRUE
        WHERE co.name = p_country_name
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
    LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION get_country_forecast_scoreboard(
    p_country_name TEXT,
    p_limit INT DEFAULT 20
)
RETURNS TABLE (
    rank_position INT,
    city_name TEXT,
    forecast_date DATE,
    forecast_score DOUBLE PRECISION,
    weighted_accuracy DOUBLE PRECISION,
    comment_count INT,
    reputation_score DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH forecast_base AS (
        SELECT
            f.id,
            ci.name AS city_name,
            f.forecasts_date
        FROM forecasts f
        JOIN cities ci ON ci.id = f.city_id
        JOIN countries co ON co.id = ci.country_id
        WHERE co.name = p_country_name
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
    LIMIT p_limit;
END;
$$;