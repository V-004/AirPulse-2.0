import os
import json
import urllib.request
import urllib.parse
import urllib.error
import time

# Simple cache for API responses to prevent rate-limiting (keyed by station ID or coordinates)
weather_cache = {}
aqicn_cache = {}
gemini_cache = {}

def http_get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        print(f"[AirPulse 2.0 API Error] GET {url} failed: {str(e)}")
        return None

def http_post(url, data_dict, headers=None):
    headers = headers or {}
    headers['Content-Type'] = 'application/json'
    data_bytes = json.dumps(data_dict).encode('utf-8')
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        print(f"[AirPulse 2.0 API Error] POST {url} failed: {str(e)}")
        return None

def search_aqicn_locations(query):
    api_key = os.getenv('AQUICN_API_KEY') or os.getenv('AQICN_API_KEY')
    if not api_key:
        return None
    query_encoded = urllib.parse.quote(query)
    url = f"https://api.waqi.info/search/?keyword={query_encoded}&token={api_key}"
    resp_text = http_get(url)
    if not resp_text:
        return None
    try:
        resp = json.loads(resp_text)
        if resp.get("status") == "ok":
            return resp.get("data", [])
    except Exception as e:
        print(f"Error parsing AQICN search: {str(e)}")
    return None

def fetch_aqicn_data(lat, lon):
    api_key = os.getenv('AQUICN_API_KEY') or os.getenv('AQICN_API_KEY')
    if not api_key:
        return None
        
    cache_key = f"{lat},{lon}"
    now = time.time()
    if cache_key in aqicn_cache:
        cached_data, timestamp = aqicn_cache[cache_key]
        if now - timestamp < 300:  # 5 minutes cache
            return cached_data
            
    url = f"https://api.waqi.info/feed/geo:{lat};{lon}/?token={api_key}"
    resp_text = http_get(url)
    if not resp_text:
        return None
        
    try:
        resp = json.loads(resp_text)
        if resp.get("status") == "ok":
            data = resp.get("data", {})
            aqi = data.get("aqi")
            iaqi = data.get("iaqi", {})
            
            # Map AQICN pollutant fields to our schema
            pollutants = {
                "pm25": iaqi.get("pm25", {}).get("v", 0.0),
                "pm10": iaqi.get("pm10", {}).get("v", 0.0),
                "co": iaqi.get("co", {}).get("v", 0.0),
                "no2": iaqi.get("no2", {}).get("v", 0.0),
                "so2": iaqi.get("so2", {}).get("v", 0.0),
                "o3": iaqi.get("o3", {}).get("v", 0.0)
            }
            
            result = {
                "aqi": int(aqi) if aqi is not None else 0,
                "pollutants": pollutants
            }
            aqicn_cache[cache_key] = (result, now)
            return result
    except Exception as e:
        print(f"Error parsing AQICN response: {str(e)}")
        
    return None

def fetch_openweather_data(lat, lon):
    api_key = os.getenv('OPENWEATHER_API_KEY')
    if not api_key:
        return None
        
    cache_key = f"{lat},{lon}"
    now = time.time()
    if cache_key in weather_cache:
        cached_data, timestamp = weather_cache[cache_key]
        if now - timestamp < 600:  # 10 minutes cache
            return cached_data
            
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={api_key}&units=metric"
    resp_text = http_get(url)
    if not resp_text:
        return None
        
    try:
        resp = json.loads(resp_text)
        main = resp.get("main", {})
        weather_info = resp.get("weather", [{}])[0]
        
        result = {
            "temp": round(main.get("temp", 0.0), 1),
            "humidity": int(main.get("humidity", 0)),
            "description": weather_info.get("description", "unknown"),
            "icon": weather_info.get("icon", "")
        }
        weather_cache[cache_key] = (result, now)
        return result
    except Exception as e:
        print(f"Error parsing OpenWeather response: {str(e)}")
        
    return None

def fetch_gemini_advisory(aqi, pm25, pm10, co, no2, so2, o3):
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        return None
        
    cache_key = f"{aqi},{pm25},{pm10}"
    now = time.time()
    if cache_key in gemini_cache:
        cached_data, timestamp = gemini_cache[cache_key]
        if now - timestamp < 3600:  # 1 hour cache (rarely changes for identical AQI)
            return cached_data
            
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    prompt = (
        f"You are an air quality health assistant. Analyze the current air quality metrics:\n"
        f"AQI: {aqi}, PM2.5: {pm25} ug/m3, PM10: {pm10} ug/m3, CO: {co} mg/m3, NO2: {no2} ug/m3, SO2: {so2} ug/m3, O3: {o3} ug/m3.\n"
        f"Generate a customized health advisory. You MUST respond with ONLY a raw JSON object and nothing else. "
        f"Do not include markdown wrappers like ```json or ```. The JSON keys must be exactly: "
        f"'children', 'elderly', 'asthma', 'workers'. Each value must be a single concise, protective sentence."
    )
    
    payload = {
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }]
    }
    
    resp_text = http_post(url, payload)
    if not resp_text:
        return None
        
    try:
        resp = json.loads(resp_text)
        candidates = resp.get("candidates", [])
        if not candidates:
            return None
            
        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            return None
            
        text = parts[0].get("text", "").strip()
        
        # Clean markdown if model returned it despite instructions
        if text.startswith("```json"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        
        parsed_advisory = json.loads(text)
        # Ensure all required keys exist
        required_keys = ['children', 'elderly', 'asthma', 'workers']
        if all(k in parsed_advisory for k in required_keys):
            gemini_cache[cache_key] = (parsed_advisory, now)
            return parsed_advisory
    except Exception as e:
        print(f"Error parsing Gemini response or content: {str(e)}")
        
    return None


def geocode_openweather(query):
    api_key = os.getenv('OPENWEATHER_API_KEY')
    if not api_key:
        return None
    query_encoded = urllib.parse.quote(query)
    url = f"https://api.openweathermap.org/geo/1.0/direct?q={query_encoded}&limit=1&appid={api_key}"
    resp_text = http_get(url)
    if not resp_text:
        return None
    try:
        resp = json.loads(resp_text)
        if isinstance(resp, list) and len(resp) > 0:
            match = resp[0]
            return {
                "name": match.get("name"),
                "lat": match.get("lat"),
                "lon": match.get("lon"),
                "country": match.get("country"),
                "state": match.get("state", "Unknown")
            }
    except Exception as e:
        print(f"Error parsing OpenWeather Geocoding response: {str(e)}")
    return None
