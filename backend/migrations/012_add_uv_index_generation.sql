CREATE OR REPLACE FUNCTION generate_uv_index(
    p_temp_max DOUBLE PRECISION,
    p_humidity INT,
    p_wind_speed DOUBLE PRECISION
)
RETURNS VARCHAR(20)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_temp_max >= 35 OR p_humidity <= 20 THEN
        RETURN 'Extreme';
    ELSIF p_temp_max >= 30 OR p_wind_speed >= 50 THEN
        RETURN 'Very High';
    ELSIF p_temp_max >= 25 OR p_humidity <= 40 THEN
        RETURN 'High';
    ELSIF p_temp_max >= 18 THEN
        RETURN 'Moderate';
    END IF;

    RETURN 'Low';
END;
$$;

CREATE OR REPLACE FUNCTION trg_fill_forecast_uv_index()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.uv_index IS NULL OR BTRIM(NEW.uv_index) = '' THEN
        NEW.uv_index := generate_uv_index(NEW.temp_max, NEW.humidity, NEW.wind_speed);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forecasts_uv_index ON forecasts;

CREATE TRIGGER trg_forecasts_uv_index
BEFORE INSERT OR UPDATE ON forecasts
FOR EACH ROW
EXECUTE FUNCTION trg_fill_forecast_uv_index();

UPDATE forecasts
SET uv_index = generate_uv_index(temp_max, humidity, wind_speed)
WHERE uv_index IS NULL OR BTRIM(uv_index) = '';