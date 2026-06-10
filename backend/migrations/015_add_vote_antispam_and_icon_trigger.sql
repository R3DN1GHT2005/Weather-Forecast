CREATE OR REPLACE FUNCTION trg_handle_vote_antispam()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.user_id IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM reaction_logs
                WHERE user_id = NEW.user_id
                  AND created_at > NOW() - INTERVAL '3 seconds'
            ) THEN
                RAISE EXCEPTION 'Anti-spam: Please wait 3 seconds before voting again';
            END IF;
            INSERT INTO reaction_logs (user_id, action)
            VALUES (NEW.user_id, 'vote');
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_votes_antispam ON comment_votes;
CREATE TRIGGER trg_comment_votes_antispam
BEFORE INSERT ON comment_votes
FOR EACH ROW
EXECUTE FUNCTION trg_handle_vote_antispam();


-- 2) Icon type autofill trigger for forecasts (mirror of uv_index trigger)
CREATE OR REPLACE FUNCTION trg_fill_forecast_icon()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.icon_type IS NULL OR BTRIM(NEW.icon_type) = '' THEN
        NEW.icon_type := generate_weather_icon(NEW.temp_max, NEW.humidity, NEW.wind_speed);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forecasts_icon ON forecasts;
CREATE TRIGGER trg_forecasts_icon
BEFORE INSERT OR UPDATE ON forecasts
FOR EACH ROW
EXECUTE FUNCTION trg_fill_forecast_icon();


UPDATE forecasts
SET icon_type = generate_weather_icon(temp_max, humidity, wind_speed)
WHERE icon_type IS NULL OR BTRIM(icon_type) = '';
