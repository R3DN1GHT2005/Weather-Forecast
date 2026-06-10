import pandas as pd
import psycopg2
from psycopg2 import extras
import unicodedata

DB_CONFIG = {
    "dbname": "Prognoza_meteo",
    "user": "postgres",
    "password": "andrei",
    "host": "localhost",
    "port": "5433"
}

CSV_FILE = "worldcities.csv"


def normalize(text):
    text = str(text).strip().lower()
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def fix_my_countries():
    conn = None
    cur = None

    try:
        print("1. Citesc CSV...")
        df = pd.read_csv(CSV_FILE)

        df["city_norm"] = df["city"].apply(normalize)
        df["city_ascii_norm"] = df["city_ascii"].apply(normalize)

        print("2. Conectare la DB...")
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        print("3. Extragem orașele...")
        cur.execute("SELECT id, name, latitude, longitude FROM cities")
        my_cities = cur.fetchall()

        cur.execute("SELECT name, id FROM countries")
        db_countries = dict(cur.fetchall())

        updates = []
        not_found = []

        print(f"4. Procesare {len(my_cities)} orașe...")

        for idx, (city_id, city_name, lat, lng) in enumerate(my_cities):

            city_key = normalize(city_name)

            matches = df[df["city_norm"] == city_key]

            if matches.empty:
                matches = df[df["city_ascii_norm"] == city_key]

            if matches.empty:
                not_found.append(city_name)
                continue

            matches = matches.copy()
            matches["dist"] = (
                (matches["lat"] - lat) ** 2 +
                (matches["lng"] - lng) ** 2
            )

            best = matches.loc[matches["dist"].idxmin()]
            country_name = best["country"]

            if country_name not in db_countries:
                cur.execute(
                    """
                    INSERT INTO countries (name)
                    VALUES (%s)
                    ON CONFLICT (name) DO NOTHING
                    RETURNING id
                    """,
                    (country_name,)
                )

                res = cur.fetchone()
                if res:
                    db_countries[country_name] = res[0]
                else:
                    cur.execute(
                        "SELECT id FROM countries WHERE name=%s",
                        (country_name,)
                    )
                    db_countries[country_name] = cur.fetchone()[0]

            country_id = db_countries[country_name]
            updates.append((country_id, city_id))

            if idx % 500 == 0:
                print(f"Progres: {idx}/{len(my_cities)}")

        print("5. Aplic update batch...")
        if updates:
            extras.execute_batch(
                cur,
                "UPDATE cities SET country_id = %s WHERE id = %s",
                updates,
                page_size=1000
            )

        conn.commit()

        print(f"\n✨ GATA!")
        print(f"✔ Orașe actualizate: {len(updates)}")
        print(f"⚠ Orașe fără match: {len(not_found)}")

        if not_found:
            print("Exemple:", not_found[:10])

    except Exception as e:
        print(f"❌ Eroare: {e}")
        if conn:
            conn.rollback()

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    fix_my_countries()