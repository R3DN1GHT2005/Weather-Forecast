import requests
import sys
import argparse
from datetime import date, timedelta


def find_cities_by_names(api_base, names):
    """Search multiple city names and return combined list (deduplicated by id)."""
    url = f"{api_base}/cities/search"
    found = {}
    for name in names:
        params = {"q": name}
        try:
            resp = requests.get(url, params=params, timeout=10)
            resp.raise_for_status()
            items = resp.json() or []
            for it in items:
                cid = it.get('id')
                if cid and cid not in found:
                    found[cid] = it
        except Exception:
            continue
    return list(found.values())


def create_extreme_forecasts_for_city(api_base, city, days=3):
    """Construct and POST payload with `days` forecasts starting today.
    Values are chosen to trigger the alerts defined in migrations.
    - temp_max >= 35.0 -> extreme heat
    - temp_min <= -10.0 -> extreme cold (we'll alternate)
    - wind_speed >= 50.0 -> high wind
    - humidity >= 95 -> high humidity
    """
    today = date.today()
    forecasts = []

    for i in range(days):
        d = today + timedelta(days=i)
        if i % 4 == 0:
            forecasts.append({
                "date": d.isoformat(),
                "temp_min": 20.0,
                "temp_max": 38.5,
                "wind_speed": 5.0,
                "humidity": 96,
            })
        elif i % 4 == 1:
            forecasts.append({
                "date": d.isoformat(),
                "temp_min": -12.0,
                "temp_max": 0.0,
                "wind_speed": 3.0,
                "humidity": 70,
            })
        elif i % 4 == 2:
            forecasts.append({
                "date": d.isoformat(),
                "temp_min": 8.0,
                "temp_max": 15.0,
                "wind_speed": 55.0,
                "humidity": 60,
            })
        else:
            forecasts.append({
                "date": d.isoformat(),
                "temp_min": 10.0,
                "temp_max": 18.0,
                "wind_speed": 8.0,
                "humidity": 65,
            })

    payload = {
        "city_name": city.get("name") or city.get("city_name") or "Iasi",
        "latitude": city.get("latitude") or city.get("lat") or 0.0,
        "longitude": city.get("longitude") or city.get("lng") or 0.0,
        "forecasts": forecasts,
    }

    url = f"{api_base}/forecasts"
    resp = requests.post(url, json=payload, timeout=15)
    resp.raise_for_status()
    return resp.status_code


def fetch_alerts_for_city(api_base, city_id):
    url = f"{api_base}/cities/{city_id}/alerts"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    return resp.json()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default="http://localhost:3000", help="Base URL for backend API")
    parser.add_argument("--days", type=int, default=3, help="Number of days (forecasts) to insert per city")
    args = parser.parse_args()

    api_base = args.api_url.rstrip("/")

    targets = ["Iasi", "Brasov", "Bacau"]
    print(f"Searching for cities {targets} using {api_base}...")
    try:
        cities = find_cities_by_names(api_base, targets)
    except Exception as e:
        print(f"Failed to search cities: {e}")
        sys.exit(1)

    if not cities:
        print(f"No cities matching {targets} found via API. Ensure DB has these cities and backend is running.")
        sys.exit(0)

    print(f"Found {len(cities)} city(ies). Will create {args.days} forecasts per city.")

    for city in cities:
        cid = city.get("id")
        cname = city.get("name")
        lat = city.get("latitude") or city.get("lat") or city.get("latitude")
        lng = city.get("longitude") or city.get("lng") or city.get("longitude")
        print(f"\nProcessing {cname} (id={cid}) lat={lat} lng={lng}")
        try:
            status = create_extreme_forecasts_for_city(api_base, city, days=args.days)
            print(f"  POST /forecasts returned {status} (created).")
        except Exception as e:
            print(f"  Failed to POST forecasts for {cname}: {e}")
            continue

        # fetch created alerts
        try:
            alerts = fetch_alerts_for_city(api_base, cid)
            if alerts:
                print(f"  Alerts for city {cname}:")
                for a in alerts:
                    print(f"    - [{a.get('created_at')}] {a.get('alert_message')} -> {a.get('recommendation')}")
            else:
                print("  No alerts returned for this city.")
        except Exception as e:
            print(f"  Failed to fetch alerts: {e}")

    print("\nDone. Check the application UI or /cities/{id}/alerts endpoint for results.")


if __name__ == '__main__':
    main()
