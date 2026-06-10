CREATE OR REPLACE FUNCTION generate_weather_icon(
    temp_max DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    wind_speed DOUBLE PRECISION
) RETURNS TEXT
LANGUAGE plpgsql AS $$
BEGIN
    IF temp_max >= 35 AND humidity < 40 THEN
        RETURN '☀️ Caniculă';
    ELSIF temp_max >= 35 AND humidity >= 40 THEN
        RETURN '🔥 Caniculă cu umiditate';
    ELSIF temp_max >= 30 THEN
        RETURN '🌤️ Foarte cald';
    ELSIF wind_speed >= 50 AND humidity >= 80 THEN
        RETURN '⛈️ Furtună';
    ELSIF wind_speed >= 40 AND humidity >= 70 THEN
        RETURN '🌬️ Vânt puternic cu ploaie';
    ELSIF temp_max <= 0 AND humidity >= 70 THEN
        RETURN '❄️ Ninsoare';
    ELSIF temp_max <= 0 THEN
        RETURN '🥶 Ger';
    ELSIF humidity >= 85 THEN
        RETURN '🌧️ Ploaie abundentă';
    ELSIF humidity >= 70 THEN
        RETURN '🌦️ Ploaie ușoară';
    ELSIF wind_speed >= 40 THEN
        RETURN '💨 Vânt puternic';
    ELSIF humidity >= 60 THEN
        RETURN '☁️ Înnorat';
    ELSIF humidity >= 40 THEN
        RETURN '⛅ Parțial înnorat';
    ELSE
        RETURN '☀️ Senin';
    END IF;
END;
$$;
