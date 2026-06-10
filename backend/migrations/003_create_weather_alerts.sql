CREATE OR REPLACE FUNCTION check_extreme_weather()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS(SELECT 1 FROM alerts WHERE forecast_id=NEW.id) THEN
        RETURN NEW;
    END IF;

    IF NEW.temp_max >= 35.0 THEN
        INSERT INTO alerts(forecast_id, alert_message, recommendation)
        VALUES(
            NEW.id,
            'Extreme heat alert: temperatures expected to reach ' || NEW.temp_max || '°C.',
            'Stay hydrated, avoid outdoor activities during peak heat hours, and seek air-conditioned environments.'
        );
    END IF;

    IF NEW.temp_min <= -10.0 THEN
        INSERT INTO alerts(forecast_id, alert_message, recommendation)
        VALUES(
            NEW.id,
            'Extreme cold alert: temperatures expected to drop to ' || NEW.temp_min || '°C.',
            'Dress in layers, limit time outdoors, and ensure proper heating indoors.'
        );
    END IF;

    IF NEW.wind_speed >= 50.0 THEN
        INSERT INTO alerts(forecast_id, alert_message, recommendation)
        VALUES(
            NEW.id,
            'High wind alert: wind speeds expected to reach ' || NEW.wind_speed || ' m/s.',
            'Secure loose objects outdoors, avoid unnecessary travel, and stay indoors during peak wind periods.'
        );
    END IF;

    IF NEW.humidity >= 95 THEN
        INSERT INTO alerts(forecast_id, alert_message, recommendation)
        VALUES(
            NEW.id,
            'High humidity alert: humidity levels expected to reach ' || NEW.humidity || '%.',
            'Use dehumidifiers, ensure proper ventilation, and stay hydrated.'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS extreme_weather_trigger ON forecasts;

CREATE TRIGGER extreme_weather_trigger 
AFTER INSERT ON forecasts
FOR EACH ROW 
EXECUTE FUNCTION check_extreme_weather();