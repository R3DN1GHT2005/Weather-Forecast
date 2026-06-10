import argparse
from datetime import date, timedelta

import requests


DEFAULT_COUNTRY = "Romania"
TARGET_CITIES = ["Bucharest", "Cluj-Napoca", "Iasi", "Timisoara", "Brasov"]


def api_get(api_base, path, params=None):
    response = requests.get(f"{api_base}{path}", params=params, timeout=15)
    response.raise_for_status()
    return response.json()


def api_post(api_base, path, payload):
    response = requests.post(f"{api_base}{path}", json=payload, timeout=20)
    response.raise_for_status()
    return response


def find_country(api_base, country_name):
    countries = api_get(api_base, "/countries") or []
    for country in countries:
        if country.get("name", "").strip().lower() == country_name.lower():
            return country
    return None


def find_city_in_country(api_base, country_id):
    cities = api_get(api_base, f"/countries/{country_id}/cities") or []
    by_name = {city.get("name", "").strip().lower(): city for city in cities if city.get("name")}

    for target in TARGET_CITIES:
        city = by_name.get(target.lower())
        if city:
            return city

    return None


def get_latest_forecast_date(api_base, city_id):
    forecasts = api_get(api_base, f"/forecasts/{city_id}") or []
    latest = None
    for forecast in forecasts:
        raw_date = forecast.get("forecasts_date") or forecast.get("forecast_date")
        if not raw_date:
            continue
        current = date.fromisoformat(str(raw_date))
        if latest is None or current > latest:
            latest = current
    return latest


def build_forecasts(start_date):
    normal_days = [
        {
            "date": (start_date + timedelta(days=offset)).isoformat(),
            "temp_min": 9.0 + offset,
            "temp_max": 18.0 + offset,
            "wind_speed": 12.0 + offset,
            "humidity": 60,
        }
        for offset in range(4)
    ]

    anomaly_day = {
        "date": (start_date + timedelta(days=4)).isoformat(),
        "temp_min": 4.0,
        "temp_max": 42.0,
        "wind_speed": 8.0,
        "humidity": 72,
    }

    return normal_days + [anomaly_day]


def create_forecasts(api_base, city, forecasts):
    payload = {
        "city_name": city.get("name"),
        "latitude": city.get("latitude") or city.get("lat") or 0.0,
        "longitude": city.get("longitude") or city.get("lng") or 0.0,
        "forecasts": forecasts,
    }
    api_post(api_base, "/forecasts", payload)


def check_anomaly(api_base, city_id):
    return api_get(api_base, f"/stats/city/{city_id}/anomaly")


def main():
    parser = argparse.ArgumentParser(description="Generate a hardcoded anomaly for Romania.")
    parser.add_argument("--api-url", default="http://localhost:3000", help="Backend API base URL")
    args = parser.parse_args()

    api_base = args.api_url.rstrip("/")

    print(f"Caut tara {DEFAULT_COUNTRY} in {api_base}...")
    country = find_country(api_base, DEFAULT_COUNTRY)
    if not country:
        raise SystemExit(f"Nu am gasit tara {DEFAULT_COUNTRY} in API.")

    country_id = country["id"]
    print(f"Gasit {country.get('name')} (id={country_id}). Caut un oras din tara...")

    city = find_city_in_country(api_base, country_id)
    if not city:
        raise SystemExit(
            f"Nu am gasit niciun oras din lista tinta in {DEFAULT_COUNTRY}: {', '.join(TARGET_CITIES)}."
        )

    city_id = city["id"]
    city_name = city.get("name")
    print(f"Folosesc orasul {city_name} (id={city_id}).")

    latest_date = get_latest_forecast_date(api_base, city_id)
    if latest_date is None:
        start_date = date.today()
        print("Orasul nu are forecast-uri. Pornesc de azi.")
    else:
        start_date = latest_date + timedelta(days=1)
        print(f"Ultimul forecast exista la {latest_date.isoformat()}. Continui de la {start_date.isoformat()}.")

    forecasts = build_forecasts(start_date)
    print(f"Trimit {len(forecasts)} forecast-uri; ultimul este setat sa declanseze anomalia.")

    create_forecasts(api_base, city, forecasts)
    anomaly = check_anomaly(api_base, city_id)

    print("Rezultat anomaly endpoint:")
    print(anomaly)


if __name__ == "__main__":
    main()