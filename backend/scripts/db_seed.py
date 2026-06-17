import os
import sys
import random
from datetime import datetime, timedelta

# Adjust path to import backend modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database

def seed_db():
    db = database.get_db()
    print("Starting MongoDB / Local NoSQL Seeding Process...")
    
    # 1. Clear existing data
    collections = ['stations', 'pollution_records', 'health_advisories', 'system_alerts', 'audit_logs', 'admin_users', 'environmental_tips']
    for coll in collections:
        # For mock client, we can drop by slicing array, for pymongo we call drop()
        if database.is_mock:
            db[coll].db_store.data[coll] = []
        else:
            db[coll].drop()
    
    # Save empty state for mock
    if database.is_mock:
        db['stations'].db_store.save()

    # 2. Seed Health Advisories
    advisories = [
        {
            "_id": "Good",
            "aqiRange": { "lower": 0, "upper": 50 },
            "generalAdvisory": "Air quality is satisfactory, and air pollution poses little or no risk.",
            "sensitiveAdvisory": "It is a perfect day for outdoor activities for everyone.",
            "actionTip": "Keep doing your part to keep the air clean! Use public transport, walk or cycle.",
            "colorCode": "#10b981"
        },
        {
            "_id": "Moderate",
            "aqiRange": { "lower": 51, "upper": 100 },
            "generalAdvisory": "Air quality is acceptable. However, there may be a risk for some people, particularly those who are unusually sensitive to air pollution.",
            "sensitiveAdvisory": "Sensitive children and adults should limit prolonged outdoor exertion.",
            "actionTip": "Reduce driving, avoid burning leaves, and maintain your vehicle to prevent emissions.",
            "colorCode": "#f59e0b"
        },
        {
            "_id": "Poor",
            "aqiRange": { "lower": 101, "upper": 150 },
            "generalAdvisory": "Members of sensitive groups may experience health effects. The general public is less likely to be affected.",
            "sensitiveAdvisory": "Children, active adults, and people with respiratory disease should limit outdoor exertion.",
            "actionTip": "Conserve energy at home, and choose clean transportation options today.",
            "colorCode": "#ef4444"
        },
        {
            "_id": "Very Poor",
            "aqiRange": { "lower": 151, "upper": 200 },
            "generalAdvisory": "Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects.",
            "sensitiveAdvisory": "Children and elderly should avoid outdoor physical activity; others should avoid prolonged outdoor exposure.",
            "actionTip": "Avoid wood burning, use air purifiers indoors, and wear a N95 mask if heading outdoors.",
            "colorCode": "#a855f7"
        },
        {
            "_id": "Severe",
            "aqiRange": { "lower": 201, "upper": 500 },
            "generalAdvisory": "Health alert: The risk of health effects is increased for everyone. Emergency conditions are likely.",
            "sensitiveAdvisory": "Everyone should avoid all outdoor physical activity. Keep windows closed and run air filters.",
            "actionTip": "Work from home if possible, avoid any physical activity outdoors, and avoid starting any outdoor fires.",
            "colorCode": "#7f1d1d"
        }
    ]
    
    for adv in advisories:
        db['health_advisories'].insert_one(adv)
    print("Seeded health_advisories lookup collection.")

    # 3. Seed Stations
    stations = [
        {
            "_id": "60c72b2f9b1d8a2c2c8b4561",
            "name": "Central Park Observatory",
            "city": "New York",
            "location": { "type": "Point", "coordinates": [-73.968285, 40.785091] },
            "status": "Active",
            "establishedDate": "2020-01-15",
            "lastReading": { "timestamp": None, "aqi": None }
        },
        {
            "_id": "60c72b2f9b1d8a2c2c8b4562",
            "name": "Westminster Station",
            "city": "London",
            "location": { "type": "Point", "coordinates": [-0.124625, 51.500729] },
            "status": "Active",
            "establishedDate": "2021-03-22",
            "lastReading": { "timestamp": None, "aqi": None }
        },
        {
            "_id": "60c72b2f9b1d8a2c2c8b4563",
            "name": "Shinjuku Station South",
            "city": "Tokyo",
            "location": { "type": "Point", "coordinates": [139.691700, 35.689500] },
            "status": "Active",
            "establishedDate": "2019-11-01",
            "lastReading": { "timestamp": None, "aqi": None }
        },
        {
            "_id": "60c72b2f9b1d8a2c2c8b4564",
            "name": "Connaught Place Metro",
            "city": "Delhi",
            "location": { "type": "Point", "coordinates": [77.217700, 28.630400] },
            "status": "Active",
            "establishedDate": "2018-05-12",
            "lastReading": { "timestamp": None, "aqi": None }
        },
        {
            "_id": "60c72b2f9b1d8a2c2c8b4565",
            "name": "Circular Quay Terminal",
            "city": "Sydney",
            "location": { "type": "Point", "coordinates": [151.210000, -33.861700] },
            "status": "Active",
            "establishedDate": "2022-08-30",
            "lastReading": { "timestamp": None, "aqi": None }
        }
    ]
    
    for st in stations:
        db['stations'].insert_one(st)
    print("Seeded stations collection.")

    # 4. Seed Environmental Tips (Daily Tips)
    tips = [
        { "tipText": "The average person breathes about 11,000 liters of air per day. Protect your lungs!", "category": "General", "author": "AirPulse Team" },
        { "tipText": "Did you know? Indoor air quality can be 2 to 5 times worse than outdoor air. Cultivate air-filtering indoor plants.", "category": "Indoor", "author": "CleanAir council" },
        { "tipText": "Commuting by foot or cycling once a week reduces your transport emissions by up to 20%.", "category": "Commute", "author": "GreenLife" },
        { "tipText": "Planting trees in urban corridors helps block fine dust particles and reduces ambient summer heat.", "category": "Greenery", "author": "CityForest" },
        { "tipText": "Avoid burning dry organic waste. Open fires release high-toxicity PM2.5 particles directly into breathing zones.", "category": "Safety", "author": "EcoAlliance" }
    ]
    
    for tip in tips:
        db['environmental_tips'].insert_one(tip)
    print("Seeded environmental_tips collection.")

    # 5. Seed Admin Users
    admin = {
        "username": "admin",
        "passwordHash": "$2b$12$KjY5eBvP2468101214161820222426283032343638404244464850", # mock bcrypt
        "role": "SuperAdmin",
        "lastLogin": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "isActive": True
    }
    db['admin_users'].insert_one(admin)
    print("Seeded admin_users collection.")

    # 6. Seed Pollution Records (7-day timeline for each station)
    end_date = datetime.now()
    city_profiles = {
        "60c72b2f9b1d8a2c2c8b4561": (16, 30, 0.4, 25, 4, 35),   # New York
        "60c72b2f9b1d8a2c2c8b4562": (24, 42, 0.5, 30, 5, 26),   # London
        "60c72b2f9b1d8a2c2c8b4563": (12, 20, 0.3, 18, 3, 42),   # Tokyo
        "60c72b2f9b1d8a2c2c8b4564": (145, 230, 2.1, 70, 16, 44), # Delhi
        "60c72b2f9b1d8a2c2c8b4565": (8, 14, 0.2, 10, 2, 32)     # Sydney
    }

    records_count = 0
    for st_id, base in city_profiles.items():
        latest_aqi = 0
        latest_time = ""
        
        for day in range(7, -1, -1):
            timestamp = (end_date - timedelta(days=day)).strftime('%Y-%m-%d %H:%M:%S')
            
            pm25 = max(1.0, round(base[0] * random.uniform(0.7, 1.3), 2))
            pm10 = max(2.0, round(base[1] * random.uniform(0.7, 1.3), 2))
            co = max(0.05, round(base[2] * random.uniform(0.7, 1.3), 2))
            no2 = max(1.0, round(base[3] * random.uniform(0.7, 1.3), 2))
            so2 = max(0.5, round(base[4] * random.uniform(0.7, 1.3), 2))
            o3 = max(1.0, round(base[5] * random.uniform(0.7, 1.3), 2))
            
            aqi, category = database.calculate_aqi_values(pm25, pm10, co, no2, so2, o3)
            
            rec_doc = {
                "stationId": st_id,
                "timestamp": timestamp,
                "pollutants": {
                    "pm25": pm25,
                    "pm10": pm10,
                    "co": co,
                    "no2": no2,
                    "so2": so2,
                    "o3": o3
                },
                "aqi": aqi,
                "aqiCategory": category
            }
            res = db['pollution_records'].insert_one(rec_doc)
            records_count += 1
            
            # Keep track of latest reading for stations collection link
            latest_aqi = aqi
            latest_time = timestamp
            
            # Check thresholds and trigger alerts on seeding
            if pm25 > 150.0 or so2 > 75.0 or aqi > 200:
                alert_doc = {
                    "stationId": st_id,
                    "recordId": str(res.inserted_id),
                    "pollutant": "PM2.5" if pm25 > 150.0 else "SO2" if so2 > 75.0 else "AQI",
                    "observedValue": pm25 if pm25 > 150.0 else so2 if so2 > 75.0 else aqi,
                    "thresholdValue": 150.0 if pm25 > 150.0 else 75.0 if so2 > 75.0 else 200.0,
                    "timestamp": timestamp,
                    "status": "Active"
                }
                db['system_alerts'].insert_one(alert_doc)
                
        # Update station document with latest reading details
        db['stations'].update_one(
            {"_id": st_id},
            {"$set": {
                "lastReading.timestamp": latest_time,
                "lastReading.aqi": latest_aqi
            }}
        )

    print(f"Seeded {records_count} pollution_records across stations.")
    
    # Audit log entry for seeding
    db['audit_logs'].insert_one({
        "actionType": "INSERT",
        "collectionName": "system_seeder",
        "documentId": "system",
        "newState": {"seeded_collections_count": 5},
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "executedBy": "system_installer"
    })
    print("Generated seeding audit log.")
    print("Database successfully initialized and seeded!\n")

if __name__ == '__main__':
    seed_db()
