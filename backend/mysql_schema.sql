-- =============================================================
-- AirPulse 2.0 – Smart Pollution Analytics Database Schema
-- DBMS Target: MySQL / MariaDB (XAMPP / WAMP Compatible)
-- Purpose: College DBMS Course Project Submission (Relational Compliance)
-- =============================================================

CREATE DATABASE IF NOT EXISTS AirPulse;
USE AirPulse;

-- Drop triggers if they exist
DROP TRIGGER IF EXISTS trg_pollution_after_insert;
DROP TRIGGER IF EXISTS trg_pollution_after_update;
DROP TRIGGER IF EXISTS trg_pollution_after_delete;
DROP TRIGGER IF EXISTS trg_stations_after_insert;

-- Drop views if they exist
DROP VIEW IF EXISTS DetailedPollutionDashboard;

-- Drop tables if they exist (order is critical due to Foreign Keys)
DROP TABLE IF EXISTS SystemAlerts;
DROP TABLE IF EXISTS AuditLog;
DROP TABLE IF EXISTS PollutionRecords;
DROP TABLE IF EXISTS Stations;
DROP TABLE IF EXISTS HealthAdvisories;

-- =============================================================
-- 1. Table: HealthAdvisories (Lookup Reference Table)
-- =============================================================
CREATE TABLE HealthAdvisories (
    CategoryName VARCHAR(20) PRIMARY KEY,
    AQILower INT NOT NULL,
    AQIUpper INT NOT NULL,
    GeneralAdvisory TEXT NOT NULL,
    ChildElderlyAdvisory TEXT NOT NULL,
    ActionTip TEXT NOT NULL,
    ColorCode VARCHAR(7) NOT NULL
);

-- =============================================================
-- 2. Table: Stations (Parent Entity)
-- =============================================================
CREATE TABLE Stations (
    StationID INT AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(100) NOT NULL UNIQUE,
    City VARCHAR(50) NOT NULL,
    Latitude DECIMAL(9,6) NOT NULL,
    Longitude DECIMAL(9,6) NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Active',
    EstablishedDate DATE NOT NULL,
    CONSTRAINT chk_station_status CHECK (Status IN ('Active', 'Inactive', 'Maintenance'))
);

-- =============================================================
-- 3. Table: PollutionRecords (Child Entity)
-- =============================================================
CREATE TABLE PollutionRecords (
    RecordID INT AUTO_INCREMENT PRIMARY KEY,
    StationID INT NOT NULL,
    Timestamp DATETIME NOT NULL,
    PM25 DECIMAL(5,2) NOT NULL,
    PM10 DECIMAL(5,2) NOT NULL,
    CO DECIMAL(5,2) NOT NULL,
    NO2 DECIMAL(5,2) NOT NULL,
    SO2 DECIMAL(5,2) NOT NULL,
    O3 DECIMAL(5,2) NOT NULL,
    AQI INT NOT NULL,
    AQI_Category VARCHAR(20) NOT NULL,
    FOREIGN KEY (StationID) REFERENCES Stations(StationID) ON DELETE CASCADE,
    FOREIGN KEY (AQI_Category) REFERENCES HealthAdvisories(CategoryName)
);

-- =============================================================
-- 4. Table: SystemAlerts (Event Alert Tracking Table)
-- =============================================================
CREATE TABLE SystemAlerts (
    AlertID INT AUTO_INCREMENT PRIMARY KEY,
    StationID INT NOT NULL,
    RecordID INT NOT NULL,
    Pollutant VARCHAR(10) NOT NULL,
    ObservedValue DECIMAL(5,2) NOT NULL,
    ThresholdValue DECIMAL(5,2) NOT NULL,
    AlertTimestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    Status VARCHAR(20) NOT NULL DEFAULT 'Active',
    FOREIGN KEY (StationID) REFERENCES Stations(StationID) ON DELETE CASCADE,
    FOREIGN KEY (RecordID) REFERENCES PollutionRecords(RecordID) ON DELETE CASCADE,
    CONSTRAINT chk_alert_status CHECK (Status IN ('Active', 'Resolved'))
);

-- =============================================================
-- 5. Table: AuditLog (Trigger Auditing Log Table)
-- =============================================================
CREATE TABLE AuditLog (
    LogID INT AUTO_INCREMENT PRIMARY KEY,
    ActionType VARCHAR(10) NOT NULL,
    TableName VARCHAR(30) NOT NULL,
    RecordID INT NOT NULL,
    OldValues TEXT,
    NewValues TEXT,
    ActionTimestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ExecutedBy VARCHAR(50) DEFAULT 'web_admin',
    CONSTRAINT chk_action_type CHECK (ActionType IN ('INSERT', 'UPDATE', 'DELETE'))
);

-- =============================================================
-- 6. Creating Database Indexes (Performance Tuning)
-- =============================================================
CREATE INDEX idx_pollution_station ON PollutionRecords(StationID);
CREATE INDEX idx_pollution_timestamp ON PollutionRecords(Timestamp);
CREATE INDEX idx_pollution_aqi ON PollutionRecords(AQI);

-- =============================================================
-- 7. Database View: DetailedPollutionDashboard (Analytical Join)
-- =============================================================
CREATE VIEW DetailedPollutionDashboard AS
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

-- =============================================================
-- 8. Database Triggers (MySQL Syntax)
-- =============================================================

-- Trigger 1: AFTER INSERT ON PollutionRecords
DELIMITER //
CREATE TRIGGER trg_pollution_after_insert
AFTER INSERT ON PollutionRecords
FOR EACH ROW
BEGIN
    -- Log insertion into AuditLog
    INSERT INTO AuditLog (ActionType, TableName, RecordID, NewValues)
    VALUES (
        'INSERT', 
        'PollutionRecords', 
        NEW.RecordID, 
        CONCAT('{"StationID":', NEW.StationID, ',"Timestamp":"', NEW.Timestamp, '","AQI":', NEW.AQI, ',"AQI_Category":"', NEW.AQI_Category, '"}')
    );

    -- Raise alert for PM2.5 exceeded threshold of 150
    IF NEW.PM25 > 150.0 THEN
        INSERT INTO SystemAlerts (StationID, RecordID, Pollutant, ObservedValue, ThresholdValue)
        VALUES (NEW.StationID, NEW.RecordID, 'PM2.5', NEW.PM25, 150.0);
    END IF;

    -- Raise alert for SO2 exceeded threshold of 75
    IF NEW.SO2 > 75.0 THEN
        INSERT INTO SystemAlerts (StationID, RecordID, Pollutant, ObservedValue, ThresholdValue)
        VALUES (NEW.StationID, NEW.RecordID, 'SO2', NEW.SO2, 75.0);
    END IF;

    -- Raise alert for general High AQI (>200)
    IF NEW.AQI > 200 THEN
        INSERT INTO SystemAlerts (StationID, RecordID, Pollutant, ObservedValue, ThresholdValue)
        VALUES (NEW.StationID, NEW.RecordID, 'AQI', NEW.AQI, 200.0);
    END IF;
END//
DELIMITER ;

-- Trigger 2: AFTER UPDATE ON PollutionRecords
DELIMITER //
CREATE TRIGGER trg_pollution_after_update
AFTER UPDATE ON PollutionRecords
FOR EACH ROW
BEGIN
    -- Log update into AuditLog
    INSERT INTO AuditLog (ActionType, TableName, RecordID, OldValues, NewValues)
    VALUES (
        'UPDATE', 
        'PollutionRecords', 
        NEW.RecordID,
        CONCAT('{"Timestamp":"', OLD.Timestamp, '","AQI":', OLD.AQI, ',"PM25":', OLD.PM25, '}'),
        CONCAT('{"Timestamp":"', NEW.Timestamp, '","AQI":', NEW.AQI, ',"PM25":', NEW.PM25, '}')
    );

    -- Resolve AQI alerts if AQI goes back to safe levels
    IF NEW.AQI <= 200 THEN
        UPDATE SystemAlerts 
        SET Status = 'Resolved'
        WHERE RecordID = NEW.RecordID AND Pollutant = 'AQI';
    END IF;

    -- Create alert if AQI is updated to severe
    IF NEW.AQI > 200 THEN
        IF NOT EXISTS (SELECT 1 FROM SystemAlerts WHERE RecordID = NEW.RecordID AND Pollutant = 'AQI' AND Status = 'Active') THEN
            INSERT INTO SystemAlerts (StationID, RecordID, Pollutant, ObservedValue, ThresholdValue)
            VALUES (NEW.StationID, NEW.RecordID, 'AQI', NEW.AQI, 200.0);
        END IF;
    END IF;
END//
DELIMITER ;

-- Trigger 3: AFTER DELETE ON PollutionRecords
DELIMITER //
CREATE TRIGGER trg_pollution_after_delete
AFTER DELETE ON PollutionRecords
FOR EACH ROW
BEGIN
    -- Log deletion into AuditLog
    INSERT INTO AuditLog (ActionType, TableName, RecordID, OldValues)
    VALUES (
        'DELETE', 
        'PollutionRecords', 
        OLD.RecordID,
        CONCAT('{"StationID":', OLD.StationID, ',"Timestamp":"', OLD.Timestamp, '","AQI":', OLD.AQI, '}')
    );
END//
DELIMITER ;

-- Trigger 4: AFTER INSERT ON Stations
DELIMITER //
CREATE TRIGGER trg_stations_after_insert
AFTER INSERT ON Stations
FOR EACH ROW
BEGIN
    INSERT INTO AuditLog (ActionType, TableName, RecordID, NewValues)
    VALUES (
        'INSERT',
        'Stations',
        NEW.StationID,
        CONCAT('{"Name":"', NEW.Name, '","City":"', NEW.City, '","Status":"', NEW.Status, '"}')
    );
END//
DELIMITER ;

-- =============================================================
-- 9. Stored Procedure: GetCityAQITrends
-- =============================================================
DELIMITER //
CREATE PROCEDURE GetCityAQITrends(IN cityName VARCHAR(50))
BEGIN
    SELECT pr.Timestamp, pr.AQI, pr.PM25, pr.PM10, pr.CO, pr.NO2, pr.SO2, pr.O3
    FROM PollutionRecords pr
    JOIN Stations s ON pr.StationID = s.StationID
    WHERE s.City = cityName
    ORDER BY pr.Timestamp ASC;
END//
DELIMITER ;

-- =============================================================
-- 10. Seeding Reference Data
-- =============================================================
INSERT INTO HealthAdvisories (CategoryName, AQILower, AQIUpper, GeneralAdvisory, ChildElderlyAdvisory, ActionTip, ColorCode)
VALUES 
('Good', 0, 50, 'Air quality is satisfactory, and air pollution poses little or no risk.', 'It is a perfect day for outdoor activities for everyone.', 'Keep doing your part to keep the air clean! Use public transport, walk or cycle.', '#10b981'),
('Moderate', 51, 100, 'Air quality is acceptable. However, there may be a risk for some people, particularly those who are unusually sensitive to air pollution.', 'Sensitive children and adults should limit prolonged outdoor exertion.', 'Reduce driving, avoid burning leaves, and maintain your vehicle to prevent emissions.', '#f59e0b'),
('Poor', 101, 150, 'Members of sensitive groups may experience health effects. The general public is less likely to be affected.', 'Children, active adults, and people with respiratory disease should limit outdoor exertion.', 'Conserve energy at home, and choose clean transportation options today.', '#ef4444'),
('Very Poor', 151, 200, 'Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects.', 'Children and elderly should avoid outdoor physical activity; others should avoid prolonged outdoor exposure.', 'Avoid wood burning, use air purifiers indoors, and wear a N95 mask if heading outdoors.', '#a855f7'),
('Severe', 201, 500, 'Health alert: The risk of health effects is increased for everyone. Emergency conditions are likely.', 'Everyone should avoid all outdoor physical activity. Keep windows closed and run air filters.', 'Work from home if possible, avoid any physical activity outdoors, and avoid starting any outdoor fires.', '#7f1d1d');

-- =============================================================
-- 11. Seeding Mock Data
-- =============================================================
INSERT INTO Stations (StationID, Name, City, Latitude, Longitude, Status, EstablishedDate)
VALUES 
(1, 'Central Park Observatory', 'New York', 40.785091, -73.968285, 'Active', '2020-01-15'),
(2, 'Westminster Station', 'London', 51.500729, -0.124625, 'Active', '2021-03-22'),
(3, 'Shinjuku Station South', 'Tokyo', 35.689500, 139.691700, 'Active', '2019-11-01'),
(4, 'Connaught Place Metro', 'Delhi', 28.630400, 77.217700, 'Active', '2018-05-12'),
(5, 'Circular Quay Terminal', 'Sydney', -33.861700, 151.210000, 'Active', '2022-08-30');

INSERT INTO PollutionRecords (RecordID, StationID, Timestamp, PM25, PM10, CO, NO2, SO2, O3, AQI, AQI_Category)
VALUES 
(1, 1, '2026-06-10 10:00:00', 12.50, 24.00, 0.35, 22.00, 3.50, 30.00, 18, 'Good'),
(2, 2, '2026-06-10 10:00:00', 25.10, 42.00, 0.52, 35.00, 7.10, 24.00, 37, 'Good'),
(3, 3, '2026-06-10 10:00:00', 10.20, 18.00, 0.28, 15.00, 2.50, 38.00, 15, 'Good'),
(4, 4, '2026-06-10 10:00:00', 145.00, 250.00, 2.10, 80.00, 16.00, 45.00, 217, 'Severe'),
(5, 5, '2026-06-10 10:00:00', 7.80, 14.00, 0.18, 10.00, 1.80, 28.00, 11, 'Good');
