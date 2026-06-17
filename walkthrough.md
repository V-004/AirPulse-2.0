# AirPulse 2.0 — Comprehensive System Walkthrough & Running Guide

Welcome to **AirPulse 2.0**, a startup-grade Environmental Intelligence Platform. This application showcases a state-of-the-art full-stack implementation that integrates a **hybrid database model** (relational SQLite + cloud-mirrored document-oriented MongoDB Atlas), real-time WebSockets, responsive 3D globe visualizations, Gemini AI health advice, and data export engines.

This document serves as your complete guide to understanding the application's architecture, database designs, features, and step-by-step execution.

---

## 🏗️ 1. Architecture & Data Flow

AirPulse 2.0 operates on a hybrid dual-database architecture:

```mermaid
graph TD
    Client[React SPA Frontend] -- HTTP / WebSockets --> Backend[Flask-SocketIO Server]
    Backend -- SQLite JDBC/Driver --> SQLite[(SQLite: airpulse_relational.db)]
    SQLite -- Runs Triggers --> SQLiteTrig[Triggers: Audit Log, System Alerts]
    Backend -- Mirrored Sync --> Mongo[(MongoDB Atlas Cloud DB)]
    Backend -- External Feeds --> APIs[OpenWeather / WAQI / Gemini AI]
    Backend -- Socket.IO Broadcast --> Client
```

1. **Relational Core (ACID)**: SQLite acts as the primary transactional database. All inserts, updates, and deletes of stations or readings go here. Standard SQL triggers automate audits and safety alerts.
2. **Document-Oriented Mirror (NoSQL)**: Changes in SQLite are dynamically mirrored to MongoDB Atlas collections. If Atlas is offline or credentials are not configured, the backend seamlessly falls back to a local JSON NoSQL emulator (`mock_mongodb.json`), ensuring high presentation stability.
3. **Real-time Event Loop**: When database changes occur, Flask emits a `db_mutation` event via **Socket.IO**. Active clients intercept this to refresh dashboards and pop toast notifications instantly.
4. **Offline Resilience**: If external geocoding/weather API requests fail due to rate limits or connection loss, the server falls back to SQLite-cached historical readings and displays an offline status banner.

---

## 🗄️ 2. Database Schema, Triggers, and Normalization

### A. Relational Schema (SQLite / MySQL Compliance)
The relational schema comprises 5 key tables designed in **Third Normal Form (3NF)**:
*   **`Stations`**: Holds monitor details.
    *   *Columns*: `StationID` (PK), `Name` (Unique), `City`, `Latitude`, `Longitude`, `Status` (Active/Inactive/Maintenance), `EstablishedDate`.
*   **`HealthAdvisories`**: Reference lookup for AQI bands and advice.
    *   *Columns*: `CategoryName` (PK), `AQILower`, `AQIUpper`, `GeneralAdvisory`, `ChildElderlyAdvisory`, `ActionTip`, `ColorCode`.
*   **`PollutionRecords`**: Daily air pollutant metrics.
    *   *Columns*: `RecordID` (PK), `StationID` (FK referencing Stations), `Timestamp`, `PM2.5`, `PM10`, `CO`, `NO2`, `SO2`, `O3`, `AQI`, `AQI_Category` (FK referencing HealthAdvisories).
*   **`SystemAlerts`**: Trigger-generated alerts when safety thresholds are breached.
    *   *Columns*: `AlertID` (PK), `StationID` (FK), `RecordID` (FK), `Pollutant`, `ObservedValue`, `ThresholdValue`, `AlertTimestamp`, `Status` (Active/Resolved).
*   **`AuditLog`**: Automatic logger of all data changes.
    *   *Columns*: `LogID` (PK), `ActionType` (INSERT/UPDATE/DELETE), `TableName`, `RecordID`, `OldValues` (JSON), `NewValues` (JSON), `ActionTimestamp`, `ExecutedBy`.

### B. Database Triggers (Automated Actions)
*   **`trg_pollution_after_insert`**: Runs after inserting a pollution record. Logs the action in `AuditLog` and evaluates concentrations. If PM2.5 > 150, SO2 > 75, or AQI > 200, it automatically inserts an active alert into `SystemAlerts`.
*   **`trg_pollution_after_update`**: Runs after updating a record. Logs the old and new states in JSON to `AuditLog`. If the updated AQI drops below 200, it marks the corresponding `AQI` alert as `Resolved`.
*   **`trg_pollution_after_delete`**: Logs the deletion and older record details into `AuditLog`.
*   **`trg_stations_after_insert`**: Logs the registration of any new sensor station.

### C. Normalization & De-composition (UNF → BCNF)
*   **1NF**: Multi-valued attributes (like lists of pollutants or comma-separated location history) are separated. Every cell contains atomic values.
*   **2NF**: Removed partial key dependencies. All non-prime attributes are fully functionally dependent on primary keys.
*   **3NF**: Eliminated transitive dependencies. The daily charge/advisories color codes depend on `AQI_Category`, which transitively depends on the `AQI` score via `PollutionRecords`. Decoupling `HealthAdvisories` ensures 3NF compliance.

---

## 🚀 3. Step-by-Step Running Guide

> [!NOTE]
> **Current Status**: The backend server is currently running in the background on [http://localhost:5000](http://localhost:5000) and the frontend Vite server is running on [http://localhost:5173](http://localhost:5173). You can navigate to [http://localhost:5173](http://localhost:5173) in your browser to interact with the application immediately!

### System Prerequisites
Ensure you have the following installed on your machine:
*   **Python 3.10+**
*   **Node.js v18+** (with npm)

---

### Step 1: Configure Environment Variables (`.env`)
Create a file named `.env` in the root of the project (`c:/Users/VYUSH/Desktop/dbms/.env`).
Copy the following template and fill in your keys:

```env
# MongoDB Atlas Credentials
# Leave empty to run in offline fallback mode using mock_mongodb.json
MONGO_URI=mongodb+srv://your_username:your_password@your_cluster.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=airpulse

# Backend Configuration
PORT=5000
FLASK_ENV=development
SECRET_KEY=airpulse-2.0-secure-jwt-key

# API Keys (Required for complete cloud integrations)
AQUICN_API_KEY=your_waqi_api_key
GEMINI_API_KEY=your_gemini_google_api_key
OPENWEATHER_API_KEY=your_openweather_api_key
```

> [!TIP]
> If you do not have a MongoDB Atlas connection string, you can leave `MONGO_URI` blank. The system will start smoothly using the **offline mock MongoDB client** which saves and reads data from `backend/mock_mongodb.json`.

---

### Step 2: Initialize SQLite and NoSQL Databases

You can initialize and seed both databases from the root of the project:

1. **Initialize the Relational SQLite Database**:
   ```bash
   python database.py
   ```
   *This initializes the `airpulse.db` SQLite database with the full 3NF schemas, triggers, indexes, and initial reference/mock readings.*

2. **Seed the NoSQL/MongoDB Database**:
   ```bash
   python backend/scripts/db_seed.py
   ```
   *This seeds the MongoDB Atlas collections (or the `backend/mock_mongodb.json` emulator fallback) with identical lookup keys, admin profiles, and timeline metrics.*

---

### Step 3: Run the Backend Flask-SocketIO Server

1. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```
2. Launch the backend server:
   ```bash
   python backend/app.py
   ```
   *The server will boot up and start listening on **`http://localhost:5000`**.*

---

### Step 4: Run the Frontend Vite React Server

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install the Node packages:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to **`http://localhost:5173`**.

---

## 🖥️ 4. Feature Tour & Demonstration

### 📊 Dashboard & AI Advisor
*   **AQI Gauge**: Interactive animated dials display the latest air quality readings.
*   **Health Warning Panels**: The app takes live AQI metrics and sends them to Google's **Gemini AI** to formulate custom, target health advice for sensitive groups.
*   **System Alert Feed**: Displays live threshold warnings powered by the SQLite triggers.

### 🌐 Spatial Visualization
*   **3D React Globe**: Move, rotate, and zoom into country shapes. Clicking on country nodes geocodes the coordinates and places a pin with live WAQI atmospheric readings.
*   **India Map**: Vector-based maps highlighting sub-continental pollution metrics.

### 💻 SQL Playground
*   Allows executing custom queries directly against `airpulse.db`.
*   **Grid controls**: Features custom client filtering (search bar), sorting, and interactive pagination sizes (`10`, `25`, `50`, `100`).
*   **Data Export**: Click buttons to export the query results into structured **CSV** files or formatted **Excel** sheets.
*   **Session Caching**: Current queries, outputs, and page limits are preserved in `localStorage` across page reloads.

### 🍃 MongoDB Console & Query Templates
*   Execute raw MongoDB BSON query objects.
*   **JSON Tree-View**: Collapsible nesting formatting for complex, unstructured JSON structures.
*   **Query Templates**: Save frequently used queries under custom nicknames for quick reuse.
*   **Execution History**: Lists the last 10 commands run in the console.

### 🎓 Academic Hub & User Journey
*   A dedicated section with ER models, schemas, and normalization tables.
*   **User Journey Diagram**: Explains the data sync pipelines.
*   **Viva Q&A Prep**: Review commonly asked database architecture questions.

### 🎮 Gamification & Eco Challenges
*   Log green actions (e.g., carpooling, planting trees) to earn experience points (XP).
*   Unlock progressive environmental badges (Zero Carbon, Clean Air, Seed Sower).
