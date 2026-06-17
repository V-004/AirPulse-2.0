import sqlite3
import os
import json
from datetime import datetime, timedelta
import random

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'airpulse.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db(force=False):
    """
    Initializes the database. If force=True, drops existing tables and recreates them.
    """
    if force and os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
        except PermissionError:
            # If database is locked, we will drop tables manually
            pass

    conn = get_db_connection()
    cursor = conn.cursor()

    # Create Tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS Stations (
        StationID INTEGER PRIMARY KEY AUTOINCREMENT,
        Name TEXT NOT NULL UNIQUE,
        City TEXT NOT NULL,
        Latitude REAL NOT NULL,
        Longitude REAL NOT NULL,
        Status TEXT NOT NULL DEFAULT 'Active' CHECK(Status IN ('Active', 'Inactive', 'Maintenance')),
        EstablishedDate TEXT NOT NULL
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS HealthAdvisories (
        CategoryName TEXT PRIMARY KEY,
        AQILower INTEGER NOT NULL,
        AQIUpper INTEGER NOT NULL,
        GeneralAdvisory TEXT NOT NULL,
        ChildElderlyAdvisory TEXT NOT NULL,
        ActionTip TEXT NOT NULL,
        ColorCode TEXT NOT NULL
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS PollutionRecords (
        RecordID INTEGER PRIMARY KEY AUTOINCREMENT,
        StationID INTEGER NOT NULL,
        Timestamp TEXT NOT NULL,
        PM25 REAL NOT NULL,
        PM10 REAL NOT NULL,
        CO REAL NOT NULL,
        NO2 REAL NOT NULL,
        SO2 REAL NOT NULL,
        O3 REAL NOT NULL,
        AQI INTEGER NOT NULL,
        AQI_Category TEXT NOT NULL,
        FOREIGN KEY (StationID) REFERENCES Stations(StationID) ON DELETE CASCADE,
        FOREIGN KEY (AQI_Category) REFERENCES HealthAdvisories(CategoryName)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS SystemAlerts (
        AlertID INTEGER PRIMARY KEY AUTOINCREMENT,
        StationID INTEGER NOT NULL,
        RecordID INTEGER NOT NULL,
        Pollutant TEXT NOT NULL,
        ObservedValue REAL NOT NULL,
        ThresholdValue REAL NOT NULL,
        AlertTimestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        Status TEXT NOT NULL DEFAULT 'Active' CHECK(Status IN ('Active', 'Resolved')),
        FOREIGN KEY (StationID) REFERENCES Stations(StationID) ON DELETE CASCADE,
        FOREIGN KEY (RecordID) REFERENCES PollutionRecords(RecordID) ON DELETE CASCADE
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS AuditLog (
        LogID INTEGER PRIMARY KEY AUTOINCREMENT,
        ActionType TEXT NOT NULL CHECK(ActionType IN ('INSERT', 'UPDATE', 'DELETE')),
        TableName TEXT NOT NULL,
        RecordID INTEGER NOT NULL,
        OldValues TEXT,
        NewValues TEXT,
        ActionTimestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ExecutedBy TEXT NOT NULL DEFAULT 'web_admin'
    );
    """)

    # Create Views
    cursor.execute("""
    CREATE VIEW IF NOT EXISTS DetailedPollutionDashboard AS
    SELECT 
        pr.RecordID,
        pr.Timestamp,
        s.StationID,
        s.Name AS StationName,
        s.City AS City,
        s.Latitude,
        s.Longitude,
        pr.PM25,
        pr.PM10,
        pr.CO,
        pr.NO2,
        pr.SO2,
        pr.O3,
        pr.AQI,
        pr.AQI_Category,
        ha.ColorCode,
        ha.GeneralAdvisory,
        ha.ChildElderlyAdvisory,
        ha.ActionTip
    FROM PollutionRecords pr
    JOIN Stations s ON pr.StationID = s.StationID
    JOIN HealthAdvisories ha ON pr.AQI_Category = ha.CategoryName;
    """)

    # Create Indexes for fast querying
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pollution_station ON PollutionRecords(StationID);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pollution_timestamp ON PollutionRecords(Timestamp);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pollution_aqi ON PollutionRecords(AQI);")

    # Create Triggers
    
    # 1. AFTER INSERT ON PollutionRecords
    cursor.execute("""
    CREATE TRIGGER IF NOT EXISTS trg_pollution_after_insert
    AFTER INSERT ON PollutionRecords
    BEGIN
        -- Log insertion into AuditLog
        INSERT INTO AuditLog (ActionType, TableName, RecordID, NewValues)
        VALUES (
            'INSERT', 
            'PollutionRecords', 
            NEW.RecordID, 
            '{"StationID":' || NEW.StationID || ',"Timestamp":"' || NEW.Timestamp || '","AQI":' || NEW.AQI || ',"AQI_Category":"' || NEW.AQI_Category || '"}'
        );

        -- Raise alert for PM2.5 exceeded threshold of 150
        INSERT INTO SystemAlerts (StationID, RecordID, Pollutant, ObservedValue, ThresholdValue)
        SELECT NEW.StationID, NEW.RecordID, 'PM2.5', NEW.PM25, 150.0
        WHERE NEW.PM25 > 150.0;

        -- Raise alert for SO2 exceeded threshold of 75
        INSERT INTO SystemAlerts (StationID, RecordID, Pollutant, ObservedValue, ThresholdValue)
        SELECT NEW.StationID, NEW.RecordID, 'SO2', NEW.SO2, 75.0
        WHERE NEW.SO2 > 75.0;

        -- Raise alert for general High AQI (>200)
        INSERT INTO SystemAlerts (StationID, RecordID, Pollutant, ObservedValue, ThresholdValue)
        SELECT NEW.StationID, NEW.RecordID, 'AQI', NEW.AQI, 200.0
        WHERE NEW.AQI > 200;
    END;
    """)

    # 2. AFTER UPDATE ON PollutionRecords
    cursor.execute("""
    CREATE TRIGGER IF NOT EXISTS trg_pollution_after_update
    AFTER UPDATE ON PollutionRecords
    BEGIN
        -- Log update into AuditLog
        INSERT INTO AuditLog (ActionType, TableName, RecordID, OldValues, NewValues)
        VALUES (
            'UPDATE', 
            'PollutionRecords', 
            NEW.RecordID,
            '{"Timestamp":"' || OLD.Timestamp || '","AQI":' || OLD.AQI || ',"PM25":' || OLD.PM25 || '}',
            '{"Timestamp":"' || NEW.Timestamp || '","AQI":' || NEW.AQI || ',"PM25":' || NEW.PM25 || '}'
        );

        -- Delete resolved alerts if AQI goes back to normal (<150)
        UPDATE SystemAlerts 
        SET Status = 'Resolved'
        WHERE RecordID = NEW.RecordID AND Pollutant = 'AQI' AND NEW.AQI <= 200;

        -- Create alert if AQI is updated to severe
        INSERT INTO SystemAlerts (StationID, RecordID, Pollutant, ObservedValue, ThresholdValue)
        SELECT NEW.StationID, NEW.RecordID, 'AQI', NEW.AQI, 200.0
        WHERE NEW.AQI > 200 AND NOT EXISTS (
            SELECT 1 FROM SystemAlerts WHERE RecordID = NEW.RecordID AND Pollutant = 'AQI' AND Status = 'Active'
        );
    END;
    """)

    # 3. AFTER DELETE ON PollutionRecords
    cursor.execute("""
    CREATE TRIGGER IF NOT EXISTS trg_pollution_after_delete
    AFTER DELETE ON PollutionRecords
    BEGIN
        -- Log deletion into AuditLog
        INSERT INTO AuditLog (ActionType, TableName, RecordID, OldValues)
        VALUES (
            'DELETE', 
            'PollutionRecords', 
            OLD.RecordID,
            '{"StationID":' || OLD.StationID || ',"Timestamp":"' || OLD.Timestamp || '","AQI":' || OLD.AQI || '}'
        );
    END;
    """)

    # 4. AFTER INSERT ON Stations
    cursor.execute("""
    CREATE TRIGGER IF NOT EXISTS trg_stations_after_insert
    AFTER INSERT ON Stations
    BEGIN
        INSERT INTO AuditLog (ActionType, TableName, RecordID, NewValues)
        VALUES (
            'INSERT',
            'Stations',
            NEW.StationID,
            '{"Name":"' || NEW.Name || '","City":"' || NEW.City || '","Status":"' || NEW.Status || '"}'
        );
    END;
    """)

    conn.commit()
    seed_reference_data(conn)
    seed_mock_data(conn)
    conn.close()

def seed_reference_data(conn):
    cursor = conn.cursor()
    
    # Check if reference data exists
    cursor.execute("SELECT COUNT(*) FROM HealthAdvisories")
    if cursor.fetchone()[0] > 0:
        return

    advisories = [
        ('Good', 0, 50, 
         'Air quality is satisfactory, and air pollution poses little or no risk.', 
         'It is a perfect day for outdoor activities for everyone.', 
         'Keep doing your part to keep the air clean! Use public transport, walk or cycle.', 
         '#10b981'), # Emerald Green
         
        ('Moderate', 51, 100, 
         'Air quality is acceptable. However, there may be a risk for some people, particularly those who are unusually sensitive to air pollution.', 
         'Sensitive children and adults should limit prolonged outdoor exertion.', 
         'Reduce driving, avoid burning leaves, and maintain your vehicle to prevent emissions.', 
         '#f59e0b'), # Amber Yellow
         
        ('Poor', 101, 150, 
         'Members of sensitive groups may experience health effects. The general public is less likely to be affected.', 
         'Children, active adults, and people with respiratory disease should limit outdoor exertion.', 
         'Conserve energy at home, and choose clean transportation options today.', 
         '#ef4444'), # Light Red
         
        ('Very Poor', 151, 200, 
         'Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects.', 
         'Children and elderly should avoid outdoor physical activity; others should avoid prolonged outdoor exposure.', 
         'Avoid wood burning, use air purifiers indoors, and wear a N95 mask if heading outdoors.', 
         '#a855f7'), # Purple
         
        ('Severe', 201, 500, 
         'Health alert: The risk of health effects is increased for everyone. Emergency conditions are likely.', 
         'Everyone should avoid all outdoor physical activity. Keep windows closed and run air filters.', 
         'Work from home if possible, avoid any physical activity outdoors, and avoid starting any outdoor fires.', 
         '#7f1d1d')  # Deep Maroon / Dark Red
    ]
    
    cursor.executemany("""
    INSERT INTO HealthAdvisories (CategoryName, AQILower, AQIUpper, GeneralAdvisory, ChildElderlyAdvisory, ActionTip, ColorCode)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, advisories)
    conn.commit()

def calculate_aqi_category(aqi):
    if aqi <= 50:
        return 'Good'
    elif aqi <= 100:
        return 'Moderate'
    elif aqi <= 150:
        return 'Poor'
    elif aqi <= 200:
        return 'Very Poor'
    else:
        return 'Severe'

def seed_mock_data(conn):
    cursor = conn.cursor()
    
    # Check if stations exist
    cursor.execute("SELECT COUNT(*) FROM Stations")
    if cursor.fetchone()[0] > 0:
        return

    # 1. Insert Stations
    stations = [
        ('Central Park Observatory', 'New York', 40.785091, -73.968285, 'Active', '2020-01-15'),
        ('Westminster Station', 'London', 51.500729, -0.124625, 'Active', '2021-03-22'),
        ('Shinjuku Station South', 'Tokyo', 35.689500, 139.691700, 'Active', '2019-11-01'),
        ('Connaught Place Metro', 'Delhi', 28.630400, 77.217700, 'Active', '2018-05-12'),
        ('Circular Quay Terminal', 'Sydney', -33.861700, 151.210000, 'Active', '2022-08-30')
    ]
    
    cursor.executemany("""
    INSERT INTO Stations (Name, City, Latitude, Longitude, Status, EstablishedDate)
    VALUES (?, ?, ?, ?, ?, ?)
    """, stations)
    
    # 2. Insert Pollution Records
    # We will generate daily records for the past 7 days for each station
    end_date = datetime.now()
    
    city_profiles = {
        1: (15, 30, 0.4, 25, 4, 35),   # New York: Moderate/Good
        2: (22, 40, 0.5, 32, 6, 28),   # London: Moderate
        3: (12, 22, 0.3, 18, 3, 40),   # Tokyo: Good
        4: (140, 240, 2.2, 75, 18, 48), # Delhi: Very Poor/Severe
        5: (8, 15, 0.2, 12, 2, 30)     # Sydney: Good
    }
    
    records = []
    
    for station_id in range(1, 6):
        base = city_profiles[station_id]
        for day in range(7, -1, -1):
            timestamp = (end_date - timedelta(days=day)).strftime('%Y-%m-%d %H:%M:%S')
            
            pm25 = max(1.0, round(base[0] * random.uniform(0.6, 1.4), 2))
            pm10 = max(2.0, round(base[1] * random.uniform(0.6, 1.4), 2))
            co = max(0.05, round(base[2] * random.uniform(0.7, 1.3), 2))
            no2 = max(1.0, round(base[3] * random.uniform(0.6, 1.4), 2))
            so2 = max(0.5, round(base[4] * random.uniform(0.5, 1.5), 2))
            o3 = max(1.0, round(base[5] * random.uniform(0.6, 1.4), 2))
            
            sub_indices = [
                pm25 * 1.5,
                pm10 * 0.8,
                co * 12.0,
                no2 * 1.3,
                so2 * 1.8,
                o3 * 1.0
            ]
            aqi = min(500, int(max(sub_indices)))
            category = calculate_aqi_category(aqi)
            
            records.append((station_id, timestamp, pm25, pm10, co, no2, so2, o3, aqi, category))

    # Temporarily disable triggers during seeding to avoid cluttering logs
    cursor.execute("DROP TRIGGER IF EXISTS trg_pollution_after_insert;")
    
    cursor.executemany("""
    INSERT INTO PollutionRecords (StationID, Timestamp, PM25, PM10, CO, NO2, SO2, O3, AQI, AQI_Category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, records)
    
    conn.commit()
    
    # Re-create triggers
    cursor.execute("""
    CREATE TRIGGER IF NOT EXISTS trg_pollution_after_insert
    AFTER INSERT ON PollutionRecords
    BEGIN
        INSERT INTO AuditLog (ActionType, TableName, RecordID, NewValues)
        VALUES (
            'INSERT', 
            'PollutionRecords', 
            NEW.RecordID, 
            '{"StationID":' || NEW.StationID || ',"Timestamp":"' || NEW.Timestamp || '","AQI":' || NEW.AQI || ',"AQI_Category":"' || NEW.AQI_Category || '"}'
        );

        INSERT INTO SystemAlerts (StationID, RecordID, Pollutant, ObservedValue, ThresholdValue)
        SELECT NEW.StationID, NEW.RecordID, 'PM2.5', NEW.PM25, 150.0
        WHERE NEW.PM25 > 150.0;

        INSERT INTO SystemAlerts (StationID, RecordID, Pollutant, ObservedValue, ThresholdValue)
        SELECT NEW.StationID, NEW.RecordID, 'SO2', NEW.SO2, 75.0
        WHERE NEW.SO2 > 75.0;

        INSERT INTO SystemAlerts (StationID, RecordID, Pollutant, ObservedValue, ThresholdValue)
        SELECT NEW.StationID, NEW.RecordID, 'AQI', NEW.AQI, 200.0
        WHERE NEW.AQI > 200;
    END;
    """)
    conn.commit()

    cursor.execute("""
    INSERT INTO SystemAlerts (StationID, RecordID, Pollutant, ObservedValue, ThresholdValue, Status)
    SELECT StationID, RecordID, 'PM2.5', PM25, 150.0, 'Active'
    FROM PollutionRecords
    WHERE PM25 > 150.0;
    """)

    cursor.execute("""
    INSERT INTO AuditLog (ActionType, TableName, RecordID, NewValues, ActionTimestamp)
    SELECT 'INSERT', 'Stations', StationID, '{"Name":"' || Name || '","City":"' || City || '"}' , EstablishedDate || ' 09:00:00'
    FROM Stations;
    """)
    
    conn.commit()

if __name__ == '__main__':
    print("Initializing Database...")
    init_db(force=True)
    print("Database Initialized Successfully!")
