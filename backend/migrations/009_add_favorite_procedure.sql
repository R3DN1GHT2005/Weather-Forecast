CREATE OR REPLACE PROCEDURE add_favorite_city(p_user_id INT, p_city_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO saved_cities (user_id, city_id) VALUES (p_user_id, p_city_id);
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'ALREADY_FAVORITED: City % is already in favorites for user %', p_city_id, p_user_id;
END;
$$;
