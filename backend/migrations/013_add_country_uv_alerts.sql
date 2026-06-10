CREATE OR REPLACE FUNCTION get_country_dominant_uv(p_country_id INT)
RETURNS VARCHAR(20)
LANGUAGE plpgsql
AS $$
DECLARE
    v_result VARCHAR(20);
BEGIN
    SELECT f.uv_index INTO v_result
    FROM forecasts f
    JOIN cities ci ON ci.id = f.city_id
    WHERE ci.country_id = p_country_id
      AND f.uv_index IS NOT NULL
    GROUP BY f.uv_index
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    RETURN COALESCE(v_result, 'Low');
END;
$$;

CREATE OR REPLACE FUNCTION get_country_alerts(p_country_id INT)
RETURNS TABLE (
    alert_type VARCHAR(50),
    severity VARCHAR(20),
    message TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE
            WHEN a.alert_message ILIKE '%heat%' THEN 'heat wave'
            WHEN a.alert_message ILIKE '%cold%' THEN 'cold wave'
            WHEN a.alert_message ILIKE '%wind%' THEN 'strong wind'
            WHEN a.alert_message ILIKE '%humidity%' THEN 'extreme humidity'
            ELSE 'weather alert'
        END::VARCHAR(50),
        'warning'::VARCHAR(20),
        a.alert_message::TEXT
    FROM alerts a
    JOIN forecasts f ON f.id = a.forecast_id
    JOIN cities ci ON ci.id = f.city_id
    WHERE ci.country_id = p_country_id
      AND a.created_at >= CURRENT_DATE - INTERVAL '10 days'
    ORDER BY a.created_at DESC
    LIMIT 50;
END;
$$;
