CREATE OR REPLACE PROCEDURE proc_user_power_stats(
    IN  p_user_id          INT,
    INOUT p_reputation     INT,
    INOUT p_total_comments INT,
    INOUT p_power_score    FLOAT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_total_reactions INT;
BEGIN
    SELECT
        u.reputation_score,
        COUNT(c.id)
    INTO p_reputation, p_total_comments
    FROM users u
    LEFT JOIN comments c ON u.id = c.user_id
    WHERE u.id = p_user_id
    GROUP BY u.reputation_score;

    SELECT COUNT(*) INTO v_total_reactions
    FROM reaction_logs
    WHERE user_id = p_user_id;

    p_power_score := ROUND(
        (COALESCE(p_reputation, 0)      * 0.5 +
         COALESCE(p_total_comments, 0)  * 5   * 0.3 +
         COALESCE(v_total_reactions, 0) * 2   * 0.2)::numeric,
        2
    );
END;
$$;

CREATE OR REPLACE PROCEDURE proc_country_analytics(
    IN  p_country_name   TEXT,
    INOUT p_avg_temp     FLOAT,
    INOUT p_alert_count  INT,
    INOUT p_hotspot_city TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
    SELECT
        AVG((f.temp_min + f.temp_max) / 2.0),
        COUNT(a.id)
    INTO p_avg_temp, p_alert_count
    FROM countries co
    JOIN cities     ci ON co.id = ci.country_id
    JOIN forecasts  f  ON ci.id = f.city_id
    LEFT JOIN alerts a ON f.id  = a.forecast_id
    WHERE co.name = p_country_name;

    SELECT ci.name INTO p_hotspot_city
    FROM cities     ci
    JOIN forecasts  f  ON ci.id = f.city_id
    LEFT JOIN alerts a ON f.id  = a.forecast_id
    WHERE ci.country_id = (SELECT id FROM countries WHERE name = p_country_name)
    GROUP BY ci.id, ci.name
    ORDER BY COUNT(a.id) DESC
    LIMIT 1;

    IF p_hotspot_city IS NULL THEN
        p_hotspot_city := 'N/A';
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE proc_detect_city_anomaly(
    IN  p_city_id      INT,
    INOUT p_is_anomaly BOOLEAN,
    INOUT p_deviation  FLOAT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_last_id   INT;
    v_avg_hist  FLOAT;
    v_curr_temp FLOAT;
BEGIN
    SELECT id INTO v_last_id
    FROM forecasts
    WHERE city_id = p_city_id
    ORDER BY forecasts_date DESC
    LIMIT 1;

    SELECT AVG(temp_max) INTO v_avg_hist
    FROM forecasts
    WHERE city_id = p_city_id
      AND id <> v_last_id;

    SELECT temp_max INTO v_curr_temp
    FROM forecasts
    WHERE id = v_last_id;

    IF v_avg_hist IS NULL OR v_curr_temp IS NULL THEN
        p_is_anomaly := FALSE;
        p_deviation  := 0;
        RETURN;
    END IF;

    p_deviation := ABS(v_curr_temp - v_avg_hist);

    IF p_deviation > 10 THEN
        p_is_anomaly := TRUE;
    ELSE
        p_is_anomaly := FALSE;
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE proc_audit_city_trust(
    IN  p_city_id       INT,
    INOUT p_trust_score FLOAT,
    INOUT p_audit_label TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
    SELECT AVG(c.accuracy_rating) INTO p_trust_score
    FROM comments c
    JOIN forecasts f ON c.forecast_id = f.id
    WHERE f.city_id = p_city_id;

    IF p_trust_score IS NULL THEN
        p_audit_label := 'NO DATA - No comments available';
    ELSIF p_trust_score < 2.5 THEN
        p_audit_label := 'LOW TRUST - Check sensors';
    ELSIF p_trust_score > 4.0 THEN
        p_audit_label := 'HIGH TRUST - Data validated by users';
    ELSE
        p_audit_label := 'STABLE';
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE proc_classify_city_risk(
    IN  p_city_id    INT,
    OUT p_risk_level TEXT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_diff FLOAT;
BEGIN
    SELECT (MAX(temp_max) - MIN(temp_min)) INTO v_diff
    FROM forecasts
    WHERE city_id = p_city_id
      AND forecasts_date > CURRENT_DATE - INTERVAL '7 days';

    IF v_diff IS NULL THEN
        p_risk_level := 'NO DATA - No recent forecasts found';
    ELSIF v_diff > 20 THEN
        p_risk_level := 'EXTREME VOLATILITY';
    ELSIF v_diff > 10 THEN
        p_risk_level := 'MODERATE RISK';
    ELSE
        p_risk_level := 'STABLE CLIMATE';
    END IF;
END;
$$;

