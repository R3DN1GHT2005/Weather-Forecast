CREATE OR REPLACE FUNCTION get_city_prediction(p_city_id INT, p_target_date DATE)
RETURNS TABLE (
    avg_temp_min   DOUBLE PRECISION,
    avg_temp_max   DOUBLE PRECISION,
    avg_wind_speed DOUBLE PRECISION,
    avg_humidity   DOUBLE PRECISION
) AS $$
DECLARE
    v_base_min        DOUBLE PRECISION;
    v_base_max        DOUBLE PRECISION;
    v_base_wind       DOUBLE PRECISION;
    v_base_humidity   DOUBLE PRECISION;
    v_latest_date     DATE;
    v_recent_max      DOUBLE PRECISION;
    v_norm_max        DOUBLE PRECISION;
    v_trend_offset    DOUBLE PRECISION := 0;
    v_offset_min      DOUBLE PRECISION := 0;
    v_offset_max      DOUBLE PRECISION := 0;
    v_offset_wind     DOUBLE PRECISION := 0;
    v_offset_humidity DOUBLE PRECISION := 0;
    v_offset_count    INT := 0;
    v_yr              INT;
    v_prev_min        DOUBLE PRECISION;
    v_prev_max        DOUBLE PRECISION;
    v_prev_wind       DOUBLE PRECISION;
    v_prev_humidity   DOUBLE PRECISION;
    v_doy_min         DOUBLE PRECISION;
    v_doy_max         DOUBLE PRECISION;
    v_doy_wind        DOUBLE PRECISION;
    v_doy_humidity    DOUBLE PRECISION;
    v_window_start    INT;
    v_window_end      INT;
    v_doy             INT;
BEGIN
    v_doy := EXTRACT(DOY FROM p_target_date)::INT;
    v_window_start := v_doy - 3;
    v_window_end   := v_doy + 3;

        SELECT MAX(forecasts_date)
        INTO v_latest_date
        FROM forecasts
        WHERE city_id = p_city_id;

        IF v_latest_date IS NOT NULL THEN
                SELECT AVG(temp_max)
                INTO v_recent_max
                FROM forecasts
                WHERE city_id = p_city_id
                    AND forecasts_date > v_latest_date - INTERVAL '7 days'
                    AND forecasts_date <= v_latest_date;

                SELECT AVG(temp_max)
                INTO v_norm_max
                FROM forecasts
                WHERE city_id = p_city_id
                    AND EXTRACT(YEAR FROM forecasts_date) = EXTRACT(YEAR FROM v_latest_date)
                    AND EXTRACT(MONTH FROM forecasts_date) = EXTRACT(MONTH FROM v_latest_date);

                IF v_recent_max IS NOT NULL AND v_norm_max IS NOT NULL THEN
                        v_trend_offset := (v_recent_max - v_norm_max) / 2;
                        v_trend_offset := GREATEST(LEAST(v_trend_offset, 4), -4);
                END IF;
        END IF;

    SELECT AVG(temp_min), AVG(temp_max), AVG(wind_speed), AVG(humidity)
    INTO v_base_min, v_base_max, v_base_wind, v_base_humidity
    FROM forecasts
    WHERE city_id = p_city_id
      AND (
          (EXTRACT(DOY FROM forecasts_date) BETWEEN v_window_start AND v_window_end)
          OR (v_window_start < 1 AND EXTRACT(DOY FROM forecasts_date) >= 365 + v_window_start)
          OR (v_window_end > 366 AND EXTRACT(DOY FROM forecasts_date) <= v_window_end - 366)
      );

    FOR v_yr IN
        SELECT EXTRACT(YEAR FROM g)::INT
        FROM generate_series(p_target_date - INTERVAL '3 years', p_target_date - INTERVAL '1 year', INTERVAL '1 year') g
        ORDER BY g DESC
    LOOP
        SELECT temp_min, temp_max, wind_speed, humidity
        INTO v_prev_min, v_prev_max, v_prev_wind, v_prev_humidity
        FROM forecasts
        WHERE city_id = p_city_id
          AND EXTRACT(YEAR FROM forecasts_date) = v_yr
          AND EXTRACT(DOY FROM forecasts_date) = v_doy;

        CONTINUE WHEN v_prev_min IS NULL;

        SELECT AVG(temp_min), AVG(temp_max), AVG(wind_speed), AVG(humidity)
        INTO v_doy_min, v_doy_max, v_doy_wind, v_doy_humidity
        FROM forecasts
        WHERE city_id = p_city_id
          AND EXTRACT(YEAR FROM forecasts_date) = v_yr
          AND (
              (EXTRACT(DOY FROM forecasts_date) BETWEEN v_window_start AND v_window_end)
              OR (v_window_start < 1 AND EXTRACT(DOY FROM forecasts_date) >= 365 + v_window_start)
              OR (v_window_end > 366 AND EXTRACT(DOY FROM forecasts_date) <= v_window_end - 366)
          );

        CONTINUE WHEN v_doy_min IS NULL;

        v_offset_min      := v_offset_min + (v_prev_min - v_doy_min);
        v_offset_max      := v_offset_max + (v_prev_max - v_doy_max);
        v_offset_wind     := v_offset_wind + (v_prev_wind - v_doy_wind);
        v_offset_humidity := v_offset_humidity + (v_prev_humidity - v_doy_humidity);
        v_offset_count    := v_offset_count + 1;
    END LOOP;

    IF v_offset_count > 0 THEN
        v_offset_min      := v_offset_min / v_offset_count;
        v_offset_max      := v_offset_max / v_offset_count;
        v_offset_wind     := v_offset_wind / v_offset_count;
        v_offset_humidity := v_offset_humidity / v_offset_count;
    END IF;

    RETURN QUERY SELECT
        ROUND(COALESCE(GREATEST((v_base_min + v_offset_min + v_trend_offset)::numeric, -50), 0), 2)::DOUBLE PRECISION,
        ROUND(COALESCE(GREATEST((v_base_max + v_offset_max + v_trend_offset)::numeric, -50), 0), 2)::DOUBLE PRECISION,
        ROUND(COALESCE(GREATEST((v_base_wind + v_offset_wind)::numeric, 0), 0), 2)::DOUBLE PRECISION,
        ROUND(COALESCE(GREATEST(LEAST((v_base_humidity + v_offset_humidity)::numeric, 100), 0), 50), 2)::DOUBLE PRECISION;
END;
$$ LANGUAGE plpgsql;