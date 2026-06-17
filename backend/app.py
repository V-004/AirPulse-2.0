import os
import re
import sqlite3
import json
import random
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request, send_file
from flask_socketio import SocketIO, emit

# Load local database driver & exporters
from database import get_db, is_mock, ObjectId, root_db, sync_all_sqlite_to_mongodb, calculate_aqi_values, calculate_aqi_category
from exports.generator import generate_csv, generate_excel, generate_pdf
from external_apis import fetch_aqicn_data, fetch_openweather_data, fetch_gemini_advisory, search_aqicn_locations, geocode_openweather

app = Flask(__name__)
app.config['SECRET_KEY'] = 'airpulse-2.0-secret-key'

# Initialize Socket.IO with CORS allowance for React Vite development
socketio = SocketIO(app, cors_allowed_origins="*")

# Path configurations
EXPORTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'exports_temp')
os.makedirs(EXPORTS_DIR, exist_ok=True)

# CORS headers filter
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response


# Global JSON Error Handlers (Prevents returning HTML error pages to API consumers)
@app.errorhandler(404)
def handle_404_error(e):
    return jsonify({
        "success": False,
        "error": "Not Found",
        "message": "The requested API endpoint does not exist on this server.",
        "path": request.path,
        "method": request.method
    }), 404

@app.errorhandler(500)
def handle_500_error(e):
    return jsonify({
        "success": False,
        "error": "Internal Server Error",
        "message": "An unhandled server-side database or processing exception occurred.",
        "details": str(e)
    }), 500

@app.errorhandler(Exception)
def handle_general_exception(e):
    from werkzeug.exceptions import HTTPException
    # Pass through standard HTTP Exceptions so their specific status codes are preserved
    if isinstance(e, HTTPException):
        return jsonify({
            "success": False,
            "error": e.name,
            "message": e.description
        }), e.code
        
    # Log the full stack trace to backend stdout for easy debugging
    import traceback
    print("=================== BACKEND UNHANDLED EXCEPTION ===================")
    traceback.print_exc()
    print("===================================================================")
    
    return jsonify({
        "success": False,
        "error": "Internal Server Error",
        "message": str(e)
    }), 500


def update_stations_from_aqicn():
    conn = root_db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM Stations WHERE Status = 'Active'")
    stations = cursor.fetchall()
    
    updates_made = 0
    for st in stations:
        st_id = st['StationID']
        lat = st['Latitude']
        lon = st['Longitude']
        
        aqi_data = fetch_aqicn_data(lat, lon)
        if aqi_data:
            aqi = aqi_data['aqi']
            p = aqi_data['pollutants']
            category = calculate_aqi_category(aqi)
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            # Check if we already have a record for this timestamp in the same hour
            cursor.execute("""
                SELECT COUNT(*) FROM PollutionRecords 
                WHERE StationID = ? AND Timestamp LIKE ?
            """, (st_id, timestamp[:13] + '%'))
            
            if cursor.fetchone()[0] == 0:
                cursor.execute("""
                    INSERT INTO PollutionRecords (StationID, Timestamp, PM25, PM10, CO, NO2, SO2, O3, AQI, AQI_Category)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (st_id, timestamp, p['pm25'], p['pm10'], p['co'], p['no2'], p['so2'], p['o3'], aqi, category))
                updates_made += 1
                
    if updates_made > 0:
        conn.commit()
        print(f"[AQICN] Inserted {updates_made} new real-time pollution records from AQICN API.")
        sync_all_sqlite_to_mongodb()
    conn.close()

def serialize_mongo_data(data):
    if isinstance(data, list):
        return [serialize_mongo_data(item) for item in data]
    elif isinstance(data, dict):
        return {k: serialize_mongo_data(v) for k, v in data.items()}
    elif isinstance(data, ObjectId) or (hasattr(data, '__class__') and data.__class__.__name__ == 'ObjectId'):
        return str(data)
    return data

def parse_location_hierarchy(location_name):
    # Splits "Station Name, City/District, State, Country"
    parts = [p.strip() for p in location_name.split(',')]
    country = "Unknown"
    state = "Unknown"
    district = "Unknown"
    city = "Unknown"
    
    if len(parts) >= 1:
        country = parts[-1]
    if len(parts) >= 2:
        state = parts[-2]
    if len(parts) >= 3:
        district = parts[-3]
    if len(parts) >= 4:
        city = parts[-4]
    else:
        city = parts[0]
        
    return country, state, district, city

def log_search_history(query, lat, lon, aqi, source, session_id=None, location_name=""):
    db = get_db()
    country, state, district, city = parse_location_hierarchy(location_name or query)
    
    doc = {
        "searchId": str(ObjectId()),
        "query": query,
        "country": country,
        "state": state,
        "district": district,
        "city": city,
        "latitude": float(lat) if lat is not None else None,
        "longitude": float(lon) if lon is not None else None,
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "source": source,
        "AQI": int(aqi) if aqi is not None else None,
        "userSessionId": session_id or "session-default"
    }
    res = db['search_history'].insert_one(doc)
    doc['_id'] = str(res.inserted_id)
    
    log_location_interaction(f"{city}, {country}" if city else query, "selection" if "click" in source or "globe" in source or "map" in source else "search", session_id)
    return doc

def log_location_interaction(location, interaction_type, session_id=None):
    db = get_db()
    doc = {
        "interactionId": str(ObjectId()),
        "interactionType": interaction_type,
        "location": location,
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "sessionId": session_id or "session-default"
    }
    res = db['location_interactions'].insert_one(doc)
    doc['_id'] = str(res.inserted_id)

# =============================================================
# 1. REST API Gateways (SQLite primary DBMS)
# =============================================================
@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    try:
        conn = root_db.get_db_connection()
        cursor = conn.cursor()
        
        # 1. Fetch all stations
        cursor.execute("SELECT * FROM Stations ORDER BY Name")
        stations_rows = [dict(row) for row in cursor.fetchall()]
        stations_list = []
        for st in stations_rows:
            st_id = st['StationID']
            mongo_id = f"60c72b2f9b1d8a2c2c8b45{st_id:02x}"
            
            # get latest reading
            cursor.execute("""
                SELECT Timestamp, AQI FROM PollutionRecords 
                WHERE StationID = ? 
                ORDER BY Timestamp DESC, RecordID DESC LIMIT 1
            """, (st_id,))
            latest = cursor.fetchone()
            latest_reading = { "timestamp": None, "aqi": None }
            if latest:
                latest_reading = { "timestamp": latest[0], "aqi": latest[1] }
                
            # Fetch OpenWeather if key is available
            weather_data = fetch_openweather_data(st['Latitude'], st['Longitude'])
                
            stations_list.append({
                "_id": mongo_id,
                "name": st['Name'],
                "city": st['City'],
                "location": { "type": "Point", "coordinates": [st['Longitude'], st['Latitude']] },
                "status": st['Status'],
                "establishedDate": st['EstablishedDate'],
                "lastReading": latest_reading,
                "weather": weather_data
            })
            
        # 2. Fetch active alerts
        cursor.execute("""
            SELECT sa.*, s.Name as StationName, s.City 
            FROM SystemAlerts sa
            JOIN Stations s ON sa.StationID = s.StationID
            WHERE sa.Status = 'Active'
            ORDER BY sa.AlertTimestamp DESC
        """)
        alerts_rows = [dict(row) for row in cursor.fetchall()]
        alerts_list = []
        for a in alerts_rows:
            a_id = a['AlertID']
            mongo_id = f"60c72b2f9b1d8a2c2c8b48{a_id:02x}"
            st_mongo_id = f"60c72b2f9b1d8a2c2c8b45{a['StationID']:02x}"
            rec_mongo_id = f"60c72b2f9b1d8a2c2c8b47{a['RecordID']:02x}"
            alerts_list.append({
                "_id": mongo_id,
                "stationId": st_mongo_id,
                "recordId": rec_mongo_id,
                "pollutant": a['Pollutant'],
                "observedValue": a['ObservedValue'],
                "thresholdValue": a['ThresholdValue'],
                "timestamp": a['AlertTimestamp'],
                "status": a['Status'],
                "stationName": a['StationName'],
                "city": a['City']
            })
            
        # 3. Aggregate statistics by City
        cursor.execute("""
            SELECT City, 
                   AVG(AQI) as AvgAQI, 
                   COUNT(RecordID) as RecordCount,
                   MAX(AQI) as MaxAQI
            FROM DetailedPollutionDashboard
            GROUP BY City
            ORDER BY AvgAQI DESC
        """)
        city_stats_rows = [dict(row) for row in cursor.fetchall()]
        city_stats_list = []
        for c in city_stats_rows:
            city_stats_list.append({
                "City": c['City'],
                "AvgAQI": round(c['AvgAQI'], 1),
                "RecordCount": c['RecordCount'],
                "MaxAQI": c['MaxAQI']
            })
            
        # 4. Recent audit logs
        cursor.execute("""
            SELECT * FROM AuditLog 
            ORDER BY ActionTimestamp DESC, LogID DESC 
            LIMIT 12
        """)
        audit_logs_rows = [dict(row) for row in cursor.fetchall()]
        audit_logs_list = []
        for log in audit_logs_rows:
            l_id = log['LogID']
            mongo_id = f"60c72b2f9b1d8a2c2c8b49{l_id:02x}"
            tbl = log['TableName']
            rec_id = log['RecordID']
            if tbl == 'PollutionRecords':
                doc_id = f"60c72b2f9b1d8a2c2c8b47{rec_id:02x}"
                collection_name = 'pollution_records'
            elif tbl == 'Stations':
                doc_id = f"60c72b2f9b1d8a2c2c8b45{rec_id:02x}"
                collection_name = 'stations'
            else:
                doc_id = str(rec_id)
                collection_name = tbl.lower()
                
            try:
                old_s = json.loads(log['OldValues']) if log['OldValues'] else None
            except Exception:
                old_s = log['OldValues']
                
            try:
                new_s = json.loads(log['NewValues']) if log['NewValues'] else None
            except Exception:
                new_s = log['NewValues']
                
            audit_logs_list.append({
                "_id": mongo_id,
                "actionType": log['ActionType'],
                "collectionName": collection_name,
                "documentId": doc_id,
                "oldState": old_s,
                "newState": new_s,
                "timestamp": log['ActionTimestamp'],
                "executedBy": log['ExecutedBy']
            })
            
        # 5. Resolve latest readings details
        cursor.execute("""
            SELECT d1.* FROM DetailedPollutionDashboard d1
            INNER JOIN (
                SELECT StationID, MAX(Timestamp) as MaxTime 
                FROM PollutionRecords 
                GROUP BY StationID
            ) d2 ON d1.StationID = d2.StationID AND d1.Timestamp = d2.MaxTime
        """)
        latest_rows = [dict(row) for row in cursor.fetchall()]
        latest_readings = []
        for r in latest_rows:
            r_id = r['RecordID']
            mongo_id = f"60c72b2f9b1d8a2c2c8b47{r_id:02x}"
            st_mongo_id = f"60c72b2f9b1d8a2c2c8b45{r['StationID']:02x}"
            
            # Fetch Gemini AI Health advisory
            ai_advisory = fetch_gemini_advisory(
                r['AQI'], r['PM25'], r['PM10'], r['CO'], r['NO2'], r['SO2'], r['O3']
            )
            
            latest_readings.append({
                "_id": mongo_id,
                "stationId": st_mongo_id,
                "timestamp": r['Timestamp'],
                "pollutants": {
                    "pm25": r['PM25'],
                    "pm10": r['PM10'],
                    "co": r['CO'],
                    "no2": r['NO2'],
                    "so2": r['SO2'],
                    "o3": r['O3']
                },
                "aqi": r['AQI'],
                "aqiCategory": r['AQI_Category'],
                "stationName": r['StationName'],
                "city": r['City'],
                "latitude": r['Latitude'],
                "longitude": r['Longitude'],
                "colorCode": r['ColorCode'],
                "generalAdvisory": r['GeneralAdvisory'],
                "sensitiveAdvisory": r['ChildElderlyAdvisory'],
                "actionTip": r['ActionTip'],
                "aiAdvisory": ai_advisory
            })
            
        # System status data
        system_status = {
            "dbStatus": "MockDB (Offline)" if is_mock else "MongoDB Atlas (Cloud)",
            "socketStatus": "Connected",
            "uptime": "Active",
            "lastBackup": datetime.now().strftime('%Y-%m-%d 02:00:00')
        }
        
        conn.close()
        
        return jsonify({
            "success": True,
            "stations": stations_list,
            "latest_readings": latest_readings,
            "alerts": alerts_list,
            "city_stats": city_stats_list,
            "audit_logs": audit_logs_list,
            "system_status": system_status
        })
    except Exception as e:
        print(f"Error in get_dashboard: {str(e)}")
        try:
            conn.close()
        except:
            pass
        return jsonify({"success": False, "error": str(e)}), 500
@app.route('/api/explore', methods=['POST'])
def explore_location():
    data = request.json
    query = data.get('query', '').strip()
    session_id = data.get('sessionId')
    source = data.get('source', 'search bar')
    
    if not query:
        return jsonify({"success": False, "error": "Location search term cannot be empty."}), 400

    conn = root_db.get_db_connection()
    cursor = conn.cursor()
    
    # Check hierarchy: c. SQLite cached records
    # Check if we already have a station with this name or city matching
    cursor.execute("""
        SELECT * FROM Stations 
        WHERE Name LIKE ? OR City LIKE ? 
        ORDER BY StationID LIMIT 1
    """, (f"%{query}%", f"%{query}%"))
    st = cursor.fetchone()
    
    station_id = None
    lat = None
    lon = None
    name = None
    city = None
    
    if st:
        station_id = st['StationID']
        lat = st['Latitude']
        lon = st['Longitude']
        name = st['Name']
        city = st['City']
        
        # Check if we have a fresh cache (less than 1 hour old)
        one_hour_ago = (datetime.now() - timedelta(hours=1)).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("""
            SELECT * FROM PollutionRecords 
            WHERE StationID = ? AND Timestamp >= ? 
            ORDER BY Timestamp DESC LIMIT 1
        """, (station_id, one_hour_ago))
        fresh_rec = cursor.fetchone()
        
        if fresh_rec:
            print(f"[CACHE HIT] Returning SQLite cached record for {name}")
            rec = dict(fresh_rec)
            
            # Fetch Weather Cache (or query weather if cache missing)
            weather_data = fetch_openweather_data(lat, lon)
            
            # Re-fetch Gemini AI recommendation
            ai_advisory = fetch_gemini_advisory(
                rec['AQI'], rec['PM25'], rec['PM10'], rec['CO'], rec['NO2'], rec['SO2'], rec['O3']
            )
            
            conn.close()
            
            # Build mirror ID
            mongo_id = f"60c72b2f9b1d8a2c2c8b47{rec['RecordID']:02x}"
            st_mongo_id = f"60c72b2f9b1d8a2c2c8b45{station_id:02x}"
            
            # Log to search_history
            hist = log_search_history(query, lat, lon, rec['AQI'], source, session_id, name)
            socketio.emit('db_mutation', {
                "action": "INSERT", "collection": "search_history", "id": hist['searchId'], "payload": hist
            })
            
            return jsonify({
                "success": True,
                "cached": True,
                "station": {
                    "_id": st_mongo_id,
                    "name": name,
                    "city": city,
                    "location": { "type": "Point", "coordinates": [lon, lat] },
                    "status": st['Status'],
                    "establishedDate": st['EstablishedDate'],
                    "weather": weather_data
                },
                "record": {
                    "_id": mongo_id,
                    "stationId": st_mongo_id,
                    "timestamp": rec['Timestamp'],
                    "pollutants": {
                        "pm25": rec['PM25'],
                        "pm10": rec['PM10'],
                        "co": rec['CO'],
                        "no2": rec['NO2'],
                        "so2": rec['SO2'],
                        "o3": rec['O3']
                    },
                    "aqi": rec['AQI'],
                    "aqiCategory": rec['AQI_Category'],
                    "aiAdvisory": ai_advisory
                }
            })

    # No fresh cache exists. Proceed with hierarchies: a. AQICN API / b. OpenWeather APIs
    # Search AQICN for matching location keyword
    results = search_aqicn_locations(query)
    
    if results and len(results) > 0:
        # Take first matching station
        match = results[0]
        name = match.get("station", {}).get("name", query)
        geo = match.get("station", {}).get("geo", [])
        
        if len(geo) == 2:
            lat = float(geo[0])
            lon = float(geo[1])
            city = query
    else:
        # Check if coordinates were passed directly: e.g. "48.8566, 2.3522"
        coord_match = re.match(r"^[-+]?([0-9]*\.[0-9]+|[0-9]+),\s*[-+]?([0-9]*\.[0-9]+|[0-9]+)$", query)
        if coord_match:
            lat = float(coord_match.group(1))
            lon = float(coord_match.group(2))
            name = f"Coordinates: {lat:.4f}, {lon:.4f}"
            city = "Geocoded Point"
        else:
            # Fallback to OpenWeather Geocoding API to resolve country shapes and random city queries
            geo_match = geocode_openweather(query)
            if geo_match:
                lat = geo_match["lat"]
                lon = geo_match["lon"]
                name = f"{geo_match['name']} Observatory"
                city = geo_match["name"]
                print(f"[OPENWEATHER GEOCODE] Resolved {query} -> {city} ({lat}, {lon})")
            
    # If we couldn't resolve coordinates from search, try OpenWeather as a fallback
    if lat is None or lon is None:
        # Fallback to seeded data search or error
        cursor.execute("SELECT * FROM Stations ORDER BY Name")
        all_stations = cursor.fetchall()
        matched_seed = None
        for st_row in all_stations:
            if query.lower() in st_row['City'].lower() or query.lower() in st_row['Name'].lower():
                matched_seed = st_row
                break
        
        if matched_seed:
            print(f"[FALLBACK TO SEED] City coordinates not resolved; falling back to seeded city {matched_seed['City']}")
            lat = matched_seed['Latitude']
            lon = matched_seed['Longitude']
            name = matched_seed['Name']
            city = matched_seed['City']
            station_id = matched_seed['StationID']
        else:
            conn.close()
            return jsonify({"success": False, "error": "Could not resolve location coordinates. Please search for a different city."}), 404

    # Now we have resolved Coordinates (lat, lon) and names
    # Query AQICN API
    aqi_data = fetch_aqicn_data(lat, lon)
    # Query OpenWeather API
    weather_data = fetch_openweather_data(lat, lon)
    
    aqi = 0
    pollutants = { "pm25": 10.0, "pm10": 20.0, "co": 0.3, "no2": 15.0, "so2": 2.0, "o3": 25.0 }
    category = "Good"
    offline_fallback = False
    last_updated = None
    
    if aqi_data:
        aqi = aqi_data['aqi']
        pollutants = aqi_data['pollutants']
        category = calculate_aqi_category(aqi)
    else:
        # Check if we have any historical records in SQLite for this city/station
        cursor.execute("""
            SELECT pr.*, s.Name as StationName, s.City 
            FROM PollutionRecords pr
            JOIN Stations s ON pr.StationID = s.StationID
            WHERE s.Name = ? OR s.City = ? OR pr.StationID = ?
            ORDER BY pr.Timestamp DESC LIMIT 1
        """, (name, city, station_id))
        historical = cursor.fetchone()
        
        if historical:
            print(f"[OFFLINE CACHE HIT] APIs failed; returning historical SQLite cached record for {name}")
            rec = dict(historical)
            aqi = rec['AQI']
            pollutants = {
                "pm25": rec['PM25'],
                "pm10": rec['PM10'],
                "co": rec['CO'],
                "no2": rec['NO2'],
                "so2": rec['SO2'],
                "o3": rec['O3']
            }
            category = rec['AQI_Category']
            offline_fallback = True
            last_updated = rec['Timestamp']
            name = rec['StationName']
            city = rec['City']
            station_id = rec['StationID']
        else:
            print("[FALLBACK TO SQLite Simulation] No historical records found; generating baseline simulation.")
            pm25 = max(1.0, round(22.0 * random.uniform(0.6, 1.4), 2))
            pm10 = max(2.0, round(40.0 * random.uniform(0.6, 1.4), 2))
            co = max(0.05, round(0.4 * random.uniform(0.7, 1.3), 2))
            no2 = max(1.0, round(25.0 * random.uniform(0.6, 1.4), 2))
            so2 = max(0.5, round(4.0 * random.uniform(0.5, 1.5), 2))
            o3 = max(1.0, round(35.0 * random.uniform(0.6, 1.4), 2))
            aqi, category = calculate_aqi_values(pm25, pm10, co, no2, so2, o3)
            pollutants = { "pm25": pm25, "pm10": pm10, "co": co, "no2": no2, "so2": so2, "o3": o3 }

    if not weather_data:
        weather_data = {
            "temp": round(random.uniform(15.0, 30.0), 1),
            "humidity": random.randint(40, 80),
            "description": "clear sky",
            "icon": "01d"
        }

    if offline_fallback:
        conn.close()
        mongo_id = f"60c72b2f9b1d8a2c2c8b47{rec['RecordID']:02x}"
        st_mongo_id = f"60c72b2f9b1d8a2c2c8b45{station_id:02x}"
        
        hist = log_search_history(query, lat, lon, aqi, source, session_id, name)
        socketio.emit('db_mutation', {
            "action": "INSERT", "collection": "search_history", "id": hist['searchId'], "payload": hist
        })
        
        return jsonify({
            "success": True,
            "cached": True,
            "offline": True,
            "lastUpdated": last_updated,
            "station": {
                "_id": st_mongo_id,
                "name": name,
                "city": city,
                "location": { "type": "Point", "coordinates": [lon, lat] },
                "status": "Active",
                "establishedDate": datetime.now().strftime('%Y-%m-%d'),
                "weather": weather_data
            },
            "record": {
                "_id": mongo_id,
                "stationId": st_mongo_id,
                "timestamp": last_updated,
                "pollutants": pollutants,
                "aqi": aqi,
                "aqiCategory": category,
                "aiAdvisory": fetch_gemini_advisory(aqi, pollutants['pm25'], pollutants['pm10'], pollutants['co'], pollutants['no2'], pollutants['so2'], pollutants['o3'])
            }
        })

    # Save to SQLite (caching Response)
    cursor.execute("SELECT * FROM Stations WHERE Name = ?", (name,))
    exist_st = cursor.fetchone()
    
    try:
        if not exist_st:
            cursor.execute("""
                INSERT INTO Stations (Name, City, Latitude, Longitude, Status, EstablishedDate)
                VALUES (?, ?, ?, ?, 'Active', ?)
            """, (name, city, lat, lon, datetime.now().strftime('%Y-%m-%d')))
            station_id = cursor.lastrowid
        else:
            station_id = exist_st['StationID']
            
        # Insert Pollution Record
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("""
            INSERT INTO PollutionRecords (StationID, Timestamp, PM25, PM10, CO, NO2, SO2, O3, AQI, AQI_Category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (station_id, timestamp, pollutants['pm25'], pollutants['pm10'], pollutants['co'], pollutants['no2'], pollutants['so2'], pollutants['o3'], aqi, category))
        record_id = cursor.lastrowid
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"success": False, "error": f"Database Cache writing failed: {str(e)}"}), 500

    conn.close()
    
    # Mirror writes to MongoDB Atlas (NoSQL cache)
    try:
        sync_all_sqlite_to_mongodb()
    except Exception as e:
        print(f"MongoDB replication sync failed: {str(e)}")

    # Fetch Gemini AI Health advisory
    ai_advisory = fetch_gemini_advisory(
        aqi, pollutants['pm25'], pollutants['pm10'], pollutants['co'], pollutants['no2'], pollutants['so2'], pollutants['o3']
    )

    mongo_id = f"60c72b2f9b1d8a2c2c8b47{record_id:02x}"
    st_mongo_id = f"60c72b2f9b1d8a2c2c8b45{station_id:02x}"
    
    new_record = {
        "_id": mongo_id,
        "stationId": st_mongo_id,
        "timestamp": timestamp,
        "pollutants": pollutants,
        "aqi": aqi,
        "aqiCategory": category
    }

    # Log search history
    hist = log_search_history(query, lat, lon, aqi, source, session_id, name)
    socketio.emit('db_mutation', {
        "action": "INSERT", "collection": "search_history", "id": hist['searchId'], "payload": hist
    })

    # Socket notifications for live updates
    socketio.emit('db_mutation', {
        "action": "INSERT", "collection": "pollution_records", "id": mongo_id, "payload": new_record
    })
    
    return jsonify({
        "success": True,
        "cached": False,
        "station": {
            "_id": st_mongo_id,
            "name": name,
            "city": city,
            "location": { "type": "Point", "coordinates": [lon, lat] },
            "status": "Active",
            "establishedDate": datetime.now().strftime('%Y-%m-%d'),
            "weather": weather_data
        },
        "record": {
            "_id": mongo_id,
            "stationId": st_mongo_id,
            "timestamp": timestamp,
            "pollutants": pollutants,
            "aqi": aqi,
            "aqiCategory": category,
            "aiAdvisory": ai_advisory
        }
    })

# =============================================================
# User Journey & Search History Persistence API Routes
# =============================================================

@app.route('/api/explore/history', methods=['GET'])
def get_search_history():
    try:
        db = get_db()
        history = list(db['search_history'].find(limit=10, sort=[("timestamp", -1)]))
        return jsonify({"success": True, "history": serialize_mongo_data(history)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/explore/history', methods=['POST'])
def save_search_history():
    try:
        data = request.json
        query = data.get('query')
        lat = data.get('latitude')
        lon = data.get('longitude')
        aqi = data.get('aqi')
        source = data.get('source', 'search bar')
        session_id = data.get('sessionId')
        location_name = data.get('locationName')
        
        doc = log_search_history(query, lat, lon, aqi, source, session_id, location_name)
        
        socketio.emit('db_mutation', {
            "action": "INSERT", 
            "collection": "search_history", 
            "id": doc['searchId'], 
            "payload": doc
        })
        
        return jsonify({"success": True, "record": doc})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/favorites', methods=['GET'])
def get_favorites():
    try:
        db = get_db()
        favorites = list(db['favorite_locations'].find(sort=[("savedAt", -1)]))
        return jsonify({"success": True, "favorites": serialize_mongo_data(favorites)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/favorites', methods=['POST'])
def add_favorite():
    try:
        data = request.json
        city = data.get('city')
        country = data.get('country')
        lat = data.get('latitude')
        lon = data.get('longitude')
        
        db = get_db()
        exist = db['favorite_locations'].find_one({"city": city, "country": country})
        if exist:
            return jsonify({"success": True, "message": "Already favorited.", "favorite": serialize_mongo_data(exist)})
            
        doc = {
            "favoriteId": str(ObjectId()),
            "country": country,
            "city": city,
            "latitude": float(lat) if lat is not None else None,
            "longitude": float(lon) if lon is not None else None,
            "savedAt": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        res = db['favorite_locations'].insert_one(doc)
        doc['_id'] = str(res.inserted_id)

        socketio.emit('db_mutation', {
            "action": "INSERT", 
            "collection": "favorite_locations", 
            "id": str(res.inserted_id), 
            "payload": doc
        })
        
        return jsonify({"success": True, "message": "Location saved to favorites.", "favorite": doc})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/favorites/<id>', methods=['DELETE'])
def remove_favorite(id):
    try:
        db = get_db()
        res = db['favorite_locations'].delete_one({"_id": id})
        if res.deleted_count == 0:
            res = db['favorite_locations'].delete_one({"favoriteId": id})
            
        socketio.emit('db_mutation', {
            "action": "DELETE", 
            "collection": "favorite_locations", 
            "id": id
        })
        return jsonify({"success": True, "message": "Location removed from favorites."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/location-interactions', methods=['POST'])
def log_interaction_route():
    try:
        data = request.json
        location = data.get('location')
        interaction_type = data.get('interactionType', 'click')
        session_id = data.get('sessionId')
        
        log_location_interaction(location, interaction_type, session_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/trending', methods=['GET'])
def get_trending_insights():
    try:
        db = get_db()
        history = list(db['search_history'].find())
        
        city_counts = {}
        country_counts = {}
        highest_aqi = None
        severe_views = []
        
        for item in history:
            city = item.get('city')
            country = item.get('country')
            aqi = item.get('AQI')
            
            if city and city != 'Unknown':
                city_counts[city] = city_counts.get(city, 0) + 1
            if country and country != 'Unknown':
                country_counts[country] = country_counts.get(country, 0) + 1
                
            if aqi is not None:
                aqi_int = int(aqi)
                if highest_aqi is None or aqi_int > highest_aqi['aqi']:
                    highest_aqi = {"city": city, "country": country, "aqi": aqi_int}
                
                if aqi_int > 150:
                    severe_views.append({
                        "city": city,
                        "country": country,
                        "aqi": aqi_int,
                        "timestamp": item.get('timestamp')
                    })
                    
        top_cities = [{"city": k, "count": v} for k, v in sorted(city_counts.items(), key=lambda x: x[1], reverse=True)[:5]]
        top_countries = [{"country": k, "count": v} for k, v in sorted(country_counts.items(), key=lambda x: x[1], reverse=True)[:5]]
        severe_views = sorted(severe_views, key=lambda x: x['timestamp'], reverse=True)[:5]
        
        favorites = list(db['favorite_locations'].find(limit=5))
        
        return jsonify({
            "success": True,
            "top_cities": top_cities,
            "top_countries": top_countries,
            "highest_aqi": highest_aqi or {"city": "None", "country": "N/A", "aqi": 0},
            "severe_views": severe_views,
            "favorites": serialize_mongo_data(favorites)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/trends', methods=['GET'])
def get_trends():
    station_id = request.args.get('station_id')
    try:
        conn = root_db.get_db_connection()
        cursor = conn.cursor()
        
        if station_id and station_id != 'all':
            # Reverse map mongo station_id to SQLite StationID
            try:
                st_sqlite_id = int(station_id[-2:], 16)
            except Exception:
                st_sqlite_id = 1
                
            cursor.execute("""
                SELECT Timestamp, AQI, PM25, PM10, CO, NO2, SO2, O3, AQI_Category
                FROM PollutionRecords
                WHERE StationID = ?
                ORDER BY Timestamp ASC
            """, (st_sqlite_id,))
            trends_rows = [dict(row) for row in cursor.fetchall()]
            trends = []
            for t in trends_rows:
                trends.append({
                    "timestamp": t['Timestamp'],
                    "aqi": t['AQI'],
                    "pollutants": {
                        "pm25": t['PM25'],
                        "pm10": t['PM10'],
                        "co": t['CO'],
                        "no2": t['NO2'],
                        "so2": t['SO2'],
                        "o3": t['O3']
                    },
                    "aqiCategory": t['AQI_Category']
                })
        else:
            # Aggregate dashboard trends: Average AQI by date across all stations
            cursor.execute("""
                SELECT SUBSTR(Timestamp, 1, 10) as Date, 
                       ROUND(AVG(AQI), 1) as AvgAQI
                FROM PollutionRecords
                GROUP BY Date
                ORDER BY Date ASC
            """)
            trends_rows = cursor.fetchall()
            trends = [{"Date": r[0], "AvgAQI": r[1]} for r in trends_rows]
            
        conn.close()
        return jsonify({"success": True, "trends": trends})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/stations', methods=['POST'])
def add_station():
    data = request.json
    name = data.get('name')
    city = data.get('city')
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    status = data.get('status', 'Active')
    established_date = datetime.now().strftime('%Y-%m-%d')
    
    if not name or not city or latitude is None or longitude is None:
        return jsonify({"success": False, "error": "Missing station properties."}), 400
        
    try:
        conn = root_db.get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO Stations (Name, City, Latitude, Longitude, Status, EstablishedDate)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (name, city, float(latitude), float(longitude), status, established_date))
        conn.commit()
        st_id = cursor.lastrowid
        conn.close()
        
        # Mirror change to MongoDB Atlas
        sync_all_sqlite_to_mongodb()
        
        mongo_id = f"60c72b2f9b1d8a2c2c8b45{st_id:02x}"
        new_station = {
            "_id": mongo_id,
            "name": name,
            "city": city,
            "location": {
                "type": "Point",
                "coordinates": [float(longitude), float(latitude)]
            },
            "status": status,
            "establishedDate": established_date,
            "lastReading": { "timestamp": None, "aqi": None }
        }
        
        # Emit Socket update to clients
        socketio.emit('db_mutation', {
            "action": "INSERT", "collection": "stations", "id": mongo_id, "payload": new_station
        })
        
        return jsonify({"success": True, "message": "Station created successfully!", "station": new_station})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/records', methods=['GET', 'POST'])
def manage_records():
    if request.method == 'GET':
        try:
            conn = root_db.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT pr.*, s.Name as StationName, s.City 
                FROM PollutionRecords pr
                JOIN Stations s ON pr.StationID = s.StationID
                ORDER BY pr.Timestamp DESC, pr.RecordID DESC
                LIMIT 50
            """)
            records_rows = [dict(row) for row in cursor.fetchall()]
            conn.close()
            
            records = []
            for r in records_rows:
                r_id = r['RecordID']
                mongo_id = f"60c72b2f9b1d8a2c2c8b47{r_id:02x}"
                st_mongo_id = f"60c72b2f9b1d8a2c2c8b45{r['StationID']:02x}"
                records.append({
                    "_id": mongo_id,
                    "stationId": st_mongo_id,
                    "timestamp": r['Timestamp'],
                    "pollutants": {
                        "pm25": r['PM25'],
                        "pm10": r['PM10'],
                        "co": r['CO'],
                        "no2": r['NO2'],
                        "so2": r['SO2'],
                        "o3": r['O3']
                    },
                    "aqi": r['AQI'],
                    "aqiCategory": r['AQI_Category'],
                    "stationName": r['StationName'],
                    "city": r['City']
                })
            return jsonify({"success": True, "records": records})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500
            
    elif request.method == 'POST':
        data = request.json
        station_id = data.get('station_id') # MongoDB hex ID
        pm25 = data.get('pm25')
        pm10 = data.get('pm10')
        co = data.get('co')
        no2 = data.get('no2')
        so2 = data.get('so2')
        o3 = data.get('o3')
        
        if not station_id or pm25 is None or pm10 is None or co is None or no2 is None or so2 is None or o3 is None:
            return jsonify({"success": False, "error": "Missing pollutants concentrations."}), 400
            
        try:
            # Reverse map station_id
            try:
                st_sqlite_id = int(station_id[-2:], 16)
            except Exception:
                st_sqlite_id = 1
                
            # Calculate overall AQI and Category
            aqi, category = calculate_aqi_values(pm25, pm10, co, no2, so2, o3)
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            conn = root_db.get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO PollutionRecords (StationID, Timestamp, PM25, PM10, CO, NO2, SO2, O3, AQI, AQI_Category)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (st_sqlite_id, timestamp, float(pm25), float(pm10), float(co), float(no2), float(so2), float(o3), aqi, category))
            conn.commit()
            record_id = cursor.lastrowid
            conn.close()
            
            # Mirror writes to MongoDB
            sync_all_sqlite_to_mongodb()
            
            mongo_id = f"60c72b2f9b1d8a2c2c8b47{record_id:02x}"
            new_record = {
                "_id": mongo_id,
                "stationId": station_id,
                "timestamp": timestamp,
                "pollutants": {
                    "pm25": float(pm25),
                    "pm10": float(pm10),
                    "co": float(co),
                    "no2": float(no2),
                    "so2": float(so2),
                    "o3": float(o3)
                },
                "aqi": aqi,
                "aqiCategory": category
            }
            
            # Emit Socket updates to all web clients
            socketio.emit('db_mutation', {
                "action": "INSERT", "collection": "pollution_records", "id": mongo_id, "payload": new_record
            })
            
            return jsonify({
                "success": True, 
                "message": "Record inserted successfully!", 
                "record": new_record, 
                "alerts": aqi > 200 or float(pm25) > 150.0 or float(so2) > 75.0
            })
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/records/<record_id>', methods=['PUT', 'DELETE'])
def mutate_record(record_id):
    # Reverse map record_id
    try:
        rec_sqlite_id = int(record_id[-2:], 16)
    except Exception:
        return jsonify({"success": False, "error": "Invalid record ID"}), 400
        
    if request.method == 'PUT':
        data = request.json
        pm25 = data.get('pm25')
        pm10 = data.get('pm10')
        co = data.get('co')
        no2 = data.get('no2')
        so2 = data.get('so2')
        o3 = data.get('o3')
        
        if pm25 is None or pm10 is None or co is None or no2 is None or so2 is None or o3 is None:
            return jsonify({"success": False, "error": "Missing pollutants."}), 400
            
        try:
            aqi, category = calculate_aqi_values(pm25, pm10, co, no2, so2, o3)
            
            conn = root_db.get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE PollutionRecords
                SET PM25 = ?, PM10 = ?, CO = ?, NO2 = ?, SO2 = ?, O3 = ?, AQI = ?, AQI_Category = ?
                WHERE RecordID = ?
            """, (float(pm25), float(pm10), float(co), float(no2), float(so2), float(o3), aqi, category, rec_sqlite_id))
            conn.commit()
            conn.close()
            
            # Mirror to MongoDB
            sync_all_sqlite_to_mongodb()
            
            # Broadcast socket
            socketio.emit('db_mutation', {
                "action": "UPDATE", "collection": "pollution_records", "id": record_id, "payload": {"aqi": aqi}
            })
            
            return jsonify({"success": True, "message": "Record modified successfully!", "aqi": aqi})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500
            
    elif request.method == 'DELETE':
        try:
            conn = root_db.get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("DELETE FROM PollutionRecords WHERE RecordID = ?", (rec_sqlite_id,))
            conn.commit()
            conn.close()
            
            # Mirror to MongoDB
            sync_all_sqlite_to_mongodb()
            
            # Broadcast Socket
            socketio.emit('db_mutation', {
                "action": "DELETE", "collection": "pollution_records", "id": record_id
            })
            
            return jsonify({"success": True, "message": "Record deleted successfully!"})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/feedback', methods=['GET', 'POST'])
def manage_feedback():
    db = get_db()
    if request.method == 'GET':
        try:
            feedbacks = list(db['user_feedback'].find(sort=[("timestamp", -1)]))
            for f in feedbacks:
                f['_id'] = str(f['_id'])
            return jsonify({"success": True, "feedback": feedbacks})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500
            
    elif request.method == 'POST':
        data = request.json
        name = data.get('name', 'Anonymous')
        email = data.get('email', 'anonymous@example.com')
        station_id = data.get('station_id')
        rating = data.get('rating', 5)
        comments = data.get('comments', '')
        
        try:
            feedback_doc = {
                "name": name,
                "email": email,
                "stationId": station_id,
                "rating": int(rating),
                "comments": comments,
                "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            res = db['user_feedback'].insert_one(feedback_doc)
            feedback_doc['_id'] = str(res.inserted_id)
            
            # Broadcast socket
            socketio.emit('db_mutation', {
                "action": "INSERT", "collection": "user_feedback", "id": str(res.inserted_id), "payload": feedback_doc
            })
            
            return jsonify({"success": True, "message": "Feedback submitted!"})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/tips', methods=['GET'])
def get_tips():
    db = get_db()
    try:
        tips = list(db['environmental_tips'].find())
        for t in tips:
            t['_id'] = str(t['_id'])
        return jsonify({"success": True, "tips": tips})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/reset-db', methods=['POST'])
def reset_database():
    try:
        # 1. Re-seed SQLite Relational DB (primary source of truth)
        root_db.init_db(force=True)
        
        # 2. Clear & Re-seed MongoDB collections
        sync_all_sqlite_to_mongodb()
        
        # 3. Seed MongoDB specific collections: environmental_tips and admin_users
        db = get_db()
        # environmental_tips
        if is_mock:
            db['environmental_tips'].db_store.data['environmental_tips'] = []
        else:
            db['environmental_tips'].drop()
        tips = [
            { "tipText": "The average person breathes about 11,000 liters of air per day. Protect your lungs!", "category": "General", "author": "AirPulse Team" },
            { "tipText": "Did you know? Indoor air quality can be 2 to 5 times worse than outdoor air. Cultivate air-filtering indoor plants.", "category": "Indoor", "author": "CleanAir council" },
            { "tipText": "Commuting by foot or cycling once a week reduces your transport emissions by up to 20%.", "category": "Commute", "author": "GreenLife" },
            { "tipText": "Planting trees in urban corridors helps block fine dust particles and reduces ambient summer heat.", "category": "Greenery", "author": "CityForest" },
            { "tipText": "Avoid burning dry organic waste. Open fires release high-toxicity PM2.5 particles directly into breathing zones.", "category": "Safety", "author": "EcoAlliance" }
        ]
        for t in tips:
            db['environmental_tips'].insert_one(t)
            
        # admin_users
        if is_mock:
            db['admin_users'].db_store.data['admin_users'] = []
        else:
            db['admin_users'].drop()
        admin = {
            "username": "admin",
            "passwordHash": "$2b$12$KjY5eBvP2468101214161820222426283032343638404244464850",
            "role": "SuperAdmin",
            "lastLogin": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "isActive": True
        }
        db['admin_users'].insert_one(admin)
        
        if is_mock:
            db['environmental_tips'].db_store.save()
            
        # Broadcast Reset
        socketio.emit('db_reset', {"success": True, "message": "Database reset completed!"})
        
        # Trigger real-time sync with AQICN after reset
        try:
            update_stations_from_aqicn()
        except Exception as e:
            print(f"Post-reset AQICN synchronization failed: {str(e)}")
        
        return jsonify({"success": True, "message": "Database re-seeded successfully!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# =============================================================
# 2. Exporters Gateways (PDF / CSV / Excel Reports from SQLite)
# =============================================================
@app.route('/api/reports/download', methods=['GET'])
def download_report():
    fmt = request.args.get('format', 'PDF')
    
    try:
        conn = root_db.get_db_connection()
        cursor = conn.cursor()
        
        # Fetch records from SQLite
        cursor.execute("""
            SELECT pr.*, s.Name as StationName, s.City 
            FROM PollutionRecords pr
            JOIN Stations s ON pr.StationID = s.StationID
            ORDER BY pr.Timestamp DESC, pr.RecordID DESC
        """)
        records_rows = [dict(row) for row in cursor.fetchall()]
        
        records_list = []
        for r in records_rows:
            records_list.append({
                "_id": f"60c72b2f9b1d8a2c2c8b47{r['RecordID']:02x}",
                "stationId": f"60c72b2f9b1d8a2c2c8b45{r['StationID']:02x}",
                "timestamp": r['Timestamp'],
                "pollutants": {
                    "pm25": r['PM25'],
                    "pm10": r['PM10'],
                    "co": r['CO'],
                    "no2": r['NO2'],
                    "so2": r['SO2'],
                    "o3": r['O3']
                },
                "aqi": r['AQI'],
                "aqiCategory": r['AQI_Category'],
                "stationName": r['StationName'],
                "city": r['City']
            })
            
        # Fetch city stats from DetailedPollutionDashboard SQLite view
        cursor.execute("""
            SELECT City, 
                   AVG(AQI) as AvgAQI, 
                   COUNT(RecordID) as RecordCount,
                   MAX(AQI) as MaxAQI
            FROM DetailedPollutionDashboard
            GROUP BY City
        """)
        city_stats_rows = [dict(row) for row in cursor.fetchall()]
        city_stats_list = []
        for c in city_stats_rows:
            city_stats_list.append({
                "City": c['City'],
                "AvgAQI": c['AvgAQI'],
                "RecordCount": c['RecordCount'],
                "MaxAQI": c['MaxAQI']
            })
            
        conn.close()
        
        filename = f"AirPulse_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        if fmt == 'CSV':
            filepath = os.path.join(EXPORTS_DIR, f"{filename}.csv")
            generate_csv(records_list, filepath)
            mimetype = "text/csv"
        elif fmt == 'Excel':
            filepath = os.path.join(EXPORTS_DIR, f"{filename}.xlsx")
            generate_excel(records_list, filepath)
            mimetype = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else:
            filepath = os.path.join(EXPORTS_DIR, f"{filename}.pdf")
            generate_pdf(records_list, city_stats_list, filepath)
            mimetype = "application/pdf"
            
        return send_file(filepath, mimetype=mimetype, as_attachment=True, download_name=os.path.basename(filepath))
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to generate report: {str(e)}"}), 500


# =============================================================
# 3. Interactive SQL & MongoDB Query Playgrounds
# =============================================================
@app.route('/api/sql-console', methods=['POST'])
def run_sql():
    data = request.json
    query = data.get('query', '').strip()
    
    if not query:
        return jsonify({'success': False, 'error': 'SQL query cannot be empty.'}), 400
        
    blocked = ['DROP DATABASE', 'ATTACH', 'DETACH']
    for cmd in blocked:
        if cmd in query.upper():
            return jsonify({'success': False, 'error': f'Command "{cmd}" is disabled.'}), 403
            
    try:
        conn = root_db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute(query)
        
        is_select = query.upper().startswith(('SELECT', 'EXPLAIN', 'PRAGMA', 'WITH'))
        
        if is_select:
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            rows = cursor.fetchall()
            row_list = [list(r) for r in rows]
            conn.close()
            return jsonify({
                'success': True, 'type': 'select', 'columns': columns, 'rows': row_list, 'row_count': len(row_list)
            })
        else:
            conn.commit()
            affected = cursor.rowcount
            conn.close()
            
            # Sync SQLite changes to MongoDB Atlas
            sync_all_sqlite_to_mongodb()
            
            # Broadcast update
            socketio.emit('db_reset', {"success": True, "message": "Relational query mutation committed!"})
            
            return jsonify({
                'success': True, 'type': 'mutation', 'affected_rows': affected, 'message': f'Affected rows: {affected}'
            })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/mongo-console', methods=['POST'])
def run_mongo_query():
    data = request.json
    query_str = data.get('query', '').strip()
    
    if not query_str:
        return jsonify({'success': False, 'error': 'Query cannot be empty.'}), 400
        
    pattern = r"^\s*db\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s*\(([\s\S]*)\)\s*;?\s*$"
    match = re.match(pattern, query_str.strip())
    
    if not match:
        return jsonify({
            'success': False, 
            'error': 'Invalid syntax. Query must strictly match format: db.<collection>.<method>(<args>)\ne.g. db.pollution_records.find({"aqi": {"$gt": 150}})'
        }), 400
        
    coll_name = match.group(1)
    method_name = match.group(2)
    args_str = match.group(3).strip()
    
    db = get_db()
    collection = db[coll_name]
    allowed_methods = ['find', 'find_one', 'insert_one', 'update_one', 'delete_one', 'aggregate', 'count_documents']
    if method_name not in allowed_methods:
        return jsonify({'success': False, 'error': f"Method '{method_name}' is not supported. Supported: {', '.join(allowed_methods)}"}), 400
        
    eval_globals = {
        "ObjectId": ObjectId,
        "datetime": datetime,
        "true": True,
        "false": False,
        "null": None
    }
    
    try:
        if not args_str:
            args = []
        else:
            args = eval(f"({args_str},)", {"__builtins__": None}, eval_globals)
            
        func = getattr(collection, method_name)
        result = func(*args)
        
        if method_name in ['find', 'aggregate']:
            formatted_result = serialize_mongo_data(list(result))
        elif method_name == 'find_one':
            formatted_result = serialize_mongo_data(result)
        elif method_name == 'insert_one':
            formatted_result = {"inserted_id": str(result.inserted_id)}
        elif method_name == 'delete_one':
            formatted_result = {"deleted_count": result.deleted_count}
        elif method_name == 'update_one':
            formatted_result = {"matched_count": result.matched_count, "modified_count": result.modified_count}
        elif method_name == 'count_documents':
            formatted_result = {"count": result}
        else:
            formatted_result = str(result)
            
        return jsonify({
            'success': True,
            'collection': coll_name,
            'method': method_name,
            'output': formatted_result
        })
    except Exception as e:
        return jsonify({'success': False, 'error': f"Execution failed: {str(e)}"}), 400

@app.route('/api/viva-data', methods=['GET'])
def get_viva_data():
    """Returns live SQLite schema info for the DBMS Viva Mode academic guide."""
    try:
        conn = root_db.get_db_connection()
        cursor = conn.cursor()

        # Tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
        tables = [r[0] for r in cursor.fetchall()]

        # Table schemas (columns)
        table_schemas = {}
        for tbl in tables:
            cursor.execute(f"PRAGMA table_info({tbl});")
            cols = [{"name": r["name"], "type": r["type"], "pk": bool(r["pk"]), "notnull": bool(r["notnull"])} for r in cursor.fetchall()]
            table_schemas[tbl] = cols

        # Foreign keys
        fk_list = []
        for tbl in tables:
            cursor.execute(f"PRAGMA foreign_key_list({tbl});")
            for r in cursor.fetchall():
                fk_list.append({"from_table": tbl, "from_col": r["from"], "to_table": r["table"], "to_col": r["to"]})

        # Triggers
        cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name;")
        triggers = [{"name": r[0], "sql": r[1]} for r in cursor.fetchall()]

        # Views
        cursor.execute("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name;")
        views = [r[0] for r in cursor.fetchall()]

        # Indexes
        cursor.execute("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name;")
        indexes = [{"name": r[0], "table": r[1], "sql": r[2]} for r in cursor.fetchall()]

        # Row counts
        row_counts = {}
        for tbl in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {tbl};")
            row_counts[tbl] = cursor.fetchone()[0]

        # Sample: top 5 most polluted records
        cursor.execute("""
            SELECT s.Name as station, s.City as city, pr.AQI, pr.AQI_Category, pr.Timestamp
            FROM PollutionRecords pr
            JOIN Stations s ON pr.StationID = s.StationID
            ORDER BY pr.AQI DESC LIMIT 5;
        """)
        top_polluted = [dict(r) for r in cursor.fetchall()]

        # Sample: city averages from view
        cursor.execute("""
            SELECT City, ROUND(AVG(AQI),1) as AvgAQI, COUNT(*) as Records, MAX(AQI) as PeakAQI
            FROM DetailedPollutionDashboard
            GROUP BY City ORDER BY AvgAQI DESC;
        """)
        city_summary = [dict(r) for r in cursor.fetchall()]

        # Audit log count
        cursor.execute("SELECT ActionType, COUNT(*) as cnt FROM AuditLog GROUP BY ActionType;")
        audit_summary = [dict(r) for r in cursor.fetchall()]

        # Active alerts
        cursor.execute("SELECT Pollutant, COUNT(*) as cnt FROM SystemAlerts WHERE Status='Active' GROUP BY Pollutant;")
        alert_summary = [dict(r) for r in cursor.fetchall()]

        conn.close()

        return jsonify({
            "success": True,
            "tables": tables,
            "table_schemas": table_schemas,
            "foreign_keys": fk_list,
            "triggers": triggers,
            "views": views,
            "indexes": indexes,
            "row_counts": row_counts,
            "top_polluted": top_polluted,
            "city_summary": city_summary,
            "audit_summary": audit_summary,
            "alert_summary": alert_summary,
            "db_mode": "MongoDB Atlas (Cloud)" if not is_mock else "Mock NoSQL Emulator (Offline)"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Server status ping
@socketio.on('ping_status')
def handle_ping():
    emit('pong_status', {"status": "Online"})

@app.route('/api/sync-aqicn', methods=['POST'])
def sync_aqicn_route():
    try:
        update_stations_from_aqicn()
        socketio.emit('db_reset', {"success": True, "message": "Successfully synchronized live air quality from AQICN API!"})
        return jsonify({"success": True, "message": "Live AQICN sync complete."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    # Initialize SQLite database (primary source of truth) using root seeder if not exists
    conn = root_db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM Stations")
        cursor.fetchone()
    except Exception:
        print("SQLite Database not initialized. Initializing...")
        root_db.init_db(force=True)
    finally:
        conn.close()
        
    # Synchronize initial state to MongoDB Atlas cloud database
    try:
        print("Syncing SQLite database to MongoDB Atlas...")
        sync_sqlite_to_mongodb = sync_all_sqlite_to_mongodb
        sync_sqlite_to_mongodb()
        print("Initial database synchronization successful!")
        
        # Sync live data from AQICN
        update_stations_from_aqicn()
    except Exception as e:
        print(f"Initial MongoDB/AQICN synchronization failed: {str(e)}")
        
    # Seed static tip and user collections in MongoDB
    db = get_db()
    try:
        if db['environmental_tips'].count_documents({}) == 0:
            tips = [
                { "tipText": "The average person breathes about 11,000 liters of air per day. Protect your lungs!", "category": "General", "author": "AirPulse Team" },
                { "tipText": "Did you know? Indoor air quality can be 2 to 5 times worse than outdoor air. Cultivate air-filtering indoor plants.", "category": "Indoor", "author": "CleanAir council" },
                { "tipText": "Commuting by foot or cycling once a week reduces your transport emissions by up to 20%.", "category": "Commute", "author": "GreenLife" },
                { "tipText": "Planting trees in urban corridors helps block fine dust particles and reduces ambient summer heat.", "category": "Greenery", "author": "CityForest" },
                { "tipText": "Avoid burning dry organic waste. Open fires release high-toxicity PM2.5 particles directly into breathing zones.", "category": "Safety", "author": "EcoAlliance" }
            ]
            for t in tips:
                db['environmental_tips'].insert_one(t)
        if db['admin_users'].count_documents({}) == 0:
            admin = {
                "username": "admin",
                "passwordHash": "$2b$12$KjY5eBvP2468101214161820222426283032343638404244464850",
                "role": "SuperAdmin",
                "lastLogin": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                "isActive": True
            }
            db['admin_users'].insert_one(admin)
            
        if is_mock:
            db['environmental_tips'].db_store.save()
    except Exception as e:
        print(f"MongoDB static seeding failed: {str(e)}")

    print("\nStarting AirPulse 2.0 Web Application Backend Server...")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)
