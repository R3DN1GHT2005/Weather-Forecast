CREATE UNIQUE INDEX IF NOT EXISTS cities_country_id_name_idx
    ON cities (country_id, name);
