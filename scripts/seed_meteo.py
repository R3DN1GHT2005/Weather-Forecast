import csv
import requests
import time
import json
import random
import sys
import os
import subprocess
from datetime import datetime, timedelta
 
CSV_FILE = "worldcities.csv"
RUST_API_URL = "http://localhost:3000/forecasts"
START_DATE = "2024-04-15"
END_DATE = "2026-05-14"
CITIES_PER_COUNTRY = 40
PROGRESS_FILE = "progress.txt"
 
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}
 
RETRY_WAIT = 1800 
 
 
def load_progress():
    """Citește indexul de la care să reluăm din fișierul de progres."""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            val = f.read().strip()
            if val.isdigit():
                return int(val)
    return 0
 
 
def save_progress(index):
    """Salvează indexul curent în fișierul de progres."""
    with open(PROGRESS_FILE, "w") as f:
        f.write(str(index))
 
 
def get_balanced_cities(file_path, limit_per_country):
    countries_data = {}
    try:
        with open(file_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                country = row['country']
                city_info = {
                    "name": row['city_ascii'],
                    "lat": float(row['lat']),
                    "lng": float(row['lng']),
                    "pop": float(row['population']) if row['population'] else 0
                }
                if country not in countries_data:
                    countries_data[country] = []
                countries_data[country].append(city_info)
 
        balanced_cities = []
        for country, cities in countries_data.items():
            sorted_cities = sorted(cities, key=lambda x: x['pop'], reverse=True)
            balanced_cities.extend(sorted_cities[:limit_per_country])
 
        return balanced_cities
    except Exception as e:
        print(f"Eroare la citirea CSV-ului: {e}")
        return []
 
 
def fetch_historical_weather(lat, lng):
    url = (f"https://archive-api.open-meteo.com/v1/archive?"
           f"latitude={lat}&longitude={lng}&"
           f"start_date={START_DATE}&end_date={END_DATE}&"
           f"daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max&"
           f"hourly=relative_humidity_2m&timezone=GMT")
    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 429:
            print(f"   ⚠️  429 primit. Header-e răspuns: {dict(response.headers)}")
            return "LIMIT_REACHED"
        else:
            print(f"   ⚠️  API Error {response.status_code}: {response.text[:200]}")
            return None
    except requests.exceptions.Timeout:
        print(f"   ⏱️  Timeout la request.")
        return None
    except Exception as e:
        print(f"   ❌ Eroare request către Open-Meteo: {e}")
        return None
 
 
def wait_with_countdown(seconds, reason=""):
    resume_time = datetime.now() + timedelta(seconds=seconds)
    minutes = seconds // 60
    print(f"\n   ⏳ {reason} Pauză {minutes} minute. Reluare la: {resume_time.strftime('%H:%M:%S')}")
 
    remaining = seconds
    while remaining > 0:
        chunk = min(300, remaining)
        time.sleep(chunk)
        remaining -= chunk
        if remaining > 0:
            eta = datetime.now() + timedelta(seconds=remaining)
            print(f"   🕐 Mai sunt {remaining // 60} minute... (ETA: {eta.strftime('%H:%M:%S')})")
 
    print(f"   ✅ Pauza s-a terminat. Reluăm...\n")
 
 
def process_city(city):
    """
    Încearcă să descarce și să salveze datele pentru un oraș.
    Returnează True dacă trebuie să trecem la următorul oraș,
    False dacă trebuie să rămânem pe același (nu ar trebui să se întâmple cu logica actuală).
    """
    retry_count = 0
 
    while True:
        data = fetch_historical_weather(city['lat'], city['lng'])
        if data == "LIMIT_REACHED":
            retry_count += 1
            wait_with_countdown(
                RETRY_WAIT,
                f"Limită API atinsă (încercarea {retry_count}). Reîncercăm în 30 min."
            )
            continue
 
        elif data and isinstance(data, dict) and 'daily' in data and 'hourly' in data:
            retry_count = 0  
 
            dates = data['daily']['time']
            t_max = data['daily']['temperature_2m_max']
            t_min = data['daily']['temperature_2m_min']
            w_speed = data['daily']['wind_speed_10m_max']
            h_humidity = data['hourly']['relative_humidity_2m']
 
            payload = {
                "city_name": city['name'],
                "latitude": city['lat'],
                "longitude": city['lng'],
                "forecasts": []
            }
 
            for i in range(len(dates)):
                if t_max[i] is not None and t_min[i] is not None:
                    wind = w_speed[i] if w_speed[i] is not None else 0.0
                    midday_index = (i * 24) + 12
                    try:
                        daily_humidity = h_humidity[midday_index] if h_humidity[midday_index] is not None else 50
                    except IndexError:
                        daily_humidity = 50
 
                    payload["forecasts"].append({
                        "date": dates[i],
                        "temp_min": t_min[i],
                        "temp_max": t_max[i],
                        "wind_speed": wind,
                        "humidity": int(daily_humidity)
                    })
 
            try:
                res = requests.post(RUST_API_URL, json=payload, timeout=30)
                if res.status_code in [200, 201]:
                    print(f"   ✔️  Salvat în DB ({len(payload['forecasts'])} zile).")
                    return True  # Succes, mergem la următorul oraș
                else:
                    print(f"   ❌ Eroare Rust server ({res.status_code}): {res.text[:200]}")
                    return True  # Eroare de DB — nu ne blocăm, trecem mai departe
            except requests.exceptions.ConnectionError:
                print("   ❌ Rust Server Offline! Pornește API-ul cu `cargo run`.")
                sys.exit(1)
 
        else:
            print(f"   ⚠️  Date incomplete de la API pentru {city['name']}. Trecem mai departe.")
            return True
 
 
def main():
    print(f"📖 Citim orașele din {CSV_FILE}...")
    cities = get_balanced_cities(CSV_FILE, CITIES_PER_COUNTRY)
    total_cities = len(cities)
 
    start_from = load_progress()
 
    print(f"🌍 Total orașe: {total_cities}")
    print(f"▶️  Reluăm de la indexul: {start_from}")
    print(f"⏳ Interval de timp: {START_DATE} → {END_DATE}\n")
 
    for index, city in enumerate(cities[start_from:], start=start_from):
        print(f"[{index + 1}/{total_cities}] Se procesează: {city['name']}...")
 
        process_city(city)
 
        save_progress(index + 1)
        sleep_time = random.uniform(1.5, 2.5)
        time.sleep(sleep_time)
 
    print("\n🏁 Gata! Baza de date a fost populată la nivel global.")
 
    if os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)
        print("🗑️  Fișierul de progres a fost șters.")
    db_url = os.environ.get('DATABASE_URL')
    if db_url:
        try:
            print('\n🔁 Running update_country() to normalize seeded cities...')
            subprocess.run(['psql', db_url, '-c', "SELECT update_country();"], check=True)
            print('✅ update_country() executed successfully.')
        except Exception as e:
            print('⚠️ Failed to call update_country() via psql:', e)
            print('Run: psql "$DATABASE_URL" -c "SELECT update_country();"')
    else:
        print('\n⚠️ DATABASE_URL not set. To normalize seeded data run:')
        print('   psql "$DATABASE_URL" -c "SELECT update_country();"')

 
if __name__ == "__main__":
    main()