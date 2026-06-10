ALTER TABLE cities
    DROP CONSTRAINT IF EXISTS cities_name_key;

ALTER TABLE cities
    ADD CONSTRAINT cities_country_id_name_key
    UNIQUE USING INDEX cities_country_id_name_idx;
