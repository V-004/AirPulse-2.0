# AirPulse 2.0 – Premium Environmental Intelligence Platform

AirPulse 2.0 is a startup-grade environmental analytics dashboard and intelligence platform designed as an advanced academic Database Management System (DBMS) project. 

It implements a **hybrid database model** (relational database indexing, views, and active trigger logs, coupled with a document-oriented MongoDB Atlas cloud database driver) and is visualised on a **real-time React SPA client** powered by **Socket.IO** events.

---

## 🚀 Key Features

- **Real-Time Data Broadcasting**: Driven by WebSockets (Socket.IO) to push database triggers instantly to the UI dashboard.
- **Interactive Heatmap**: Leaflet-based dynamic spatial mapping plots monitoring stations.
- **Terminal Playgrounds**: Raw query consoles for executing direct SQL statements (SQLite sandbox) and MongoDB commands (NoSQL pipeline runner).
- **Gamified Engagement**: AI health warnings, target environmental threshold alerts, and personal Eco Challenge trackers.
- **Reporting Engine**: Generates dynamically styled ReportLab PDF summaries and Pandas-based Excel/CSV data exports.
- **Multi-Theme UI**: Dynamic theme switcher supports **Aurora Air** (blue), **Emerald Earth** (emerald), and **Neon Future** (purple) styles.

---

## 📂 Project Structure

```text
dbms/
├── README.md                   # Top-level quickstart guide
├── .env.example                # Global configuration secrets template
├── backend/                    # Flask-SocketIO backend server files
│   ├── app.py                  # Server entry point & API endpoints
│   ├── database.py             # MongoDB Atlas driver & fallback offline emulator
│   ├── mysql_schema.sql        # MySQL schemas, triggers, & views for university review
│   ├── mock_mongodb.json       # JSON file store for offline presentation stability
│   ├── airpulse_relational.db  # SQLite mirrored file database
│   ├── requirements.txt        # Python dependencies
│   ├── exports/
│   │   └── generator.py        # PDF & Excel exporters
│   └── scripts/
│       └── db_seed.py          # Relational + NoSQL database initial seeder
└── frontend/                   # React + Vite + Tailwind CSS frontend files
    ├── package.json            # Client dependencies
    ├── vite.config.js          # Port 5173 server & backend proxy config
    └── src/
        ├── App.jsx             # Main dashboard shell & timeline replay
        ├── main.jsx            # React client mount
        ├── components/         # Sub-components (Map, SQL, Mongo, Gauges, Health)
        └── styles/
            └── index.css       # Core styling & glassmorphic utilities
```

---

## 🛠️ Step-by-Step Setup

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)

### 1. Configure the Environment
Create a `.env` file in the project root based on `.env.example`:
```env
MONGO_URI=your_mongodb_atlas_connection_string
DATABASE_NAME=airpulse
PORT=5000
FLASK_ENV=development
SECRET_KEY=airpulse-2.0-secure-jwt-key
```
*Note: If `MONGO_URI` is omitted or empty, AirPulse 2.0 automatically boots up in **offline fallback mode** using `mock_mongodb.json` as a mock NoSQL database, ensuring zero-configuration stability during presentations.*

---

### 2. Run the Backend Server
Open a terminal in the `backend` directory:
```bash
# Install dependencies
pip install -r requirements.txt

# Seed the database (runs relational & NoSQL setup)
python scripts/db_seed.py

# Launch the server
python app.py
```
*The backend server will run on **`http://localhost:5000`**.*

---

### 3. Run the Frontend Server
Open a second terminal in the `frontend` directory:
```bash
# Install packages
npm install

# Start the Vite development server
npm run dev
```
*The frontend client will boot up on **`http://localhost:5173`**.*

---

## 🎓 Academic Compliance & Viva Voce

For college lab evaluations, the equivalent SQL schemas, triggers, cascading constraint parameters, and views are structured in:
👉 **[mysql_schema.sql](./backend/mysql_schema.sql)**

To prepare for viva questions, review database design decisions, and check the setup guide:
👉 **[walkthrough.md](./walkthrough.md)**


