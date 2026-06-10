CREATE OR REPLACE FUNCTION get_city_today_alerts(p_city_id INT)
RETURNS TABLE (
    id INT,
    forecast_id INT,
    alert_message VARCHAR(255),
    recommendation TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.forecast_id,
        a.alert_message,
        a.recommendation,
        a.created_at
    FROM alerts a
    JOIN forecasts f ON f.id = a.forecast_id
    WHERE f.city_id = p_city_id
      AND a.created_at::date = CURRENT_DATE
    ORDER BY a.created_at DESC;
END;
$$;