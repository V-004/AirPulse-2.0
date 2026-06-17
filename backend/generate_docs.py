import os
import sys
from datetime import datetime

# ReportLab imports for generating styled PDF documentation
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, ListFlowable, ListItem
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

def generate_documentation_pdf(filepath):
    # Set up document template with 0.75-inch margins
    doc = SimpleDocTemplate(
        filepath, 
        pagesize=letter, 
        rightMargin=54, 
        leftMargin=54, 
        topMargin=54, 
        bottomMargin=54
    )
    
    story = []
    styles = getSampleStyleSheet()

    # Define color palette
    c_primary = colors.HexColor('#0f172a')     # Slate 900
    c_secondary = colors.HexColor('#1e293b')   # Slate 800
    c_accent = colors.HexColor('#0284c7')      # Sky 600
    c_light_accent = colors.HexColor('#e0f2fe')# Sky 100
    c_text = colors.HexColor('#334155')        # Slate 700
    c_muted = colors.HexColor('#64748b')       # Slate 500

    # Custom Paragraph Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=26,
        leading=30,
        textColor=c_primary,
        spaceAfter=8,
        alignment=1 # Centered
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=c_muted,
        spaceAfter=30,
        alignment=1 # Centered
    )

    h1_style = ParagraphStyle(
        'DocH1',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=c_primary,
        spaceBefore=15,
        spaceAfter=12,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'DocH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=c_accent,
        spaceBefore=12,
        spaceAfter=8,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14.5,
        textColor=c_text,
        spaceAfter=10
    )

    bullet_style = ParagraphStyle(
        'DocBullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=c_text,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=6
    )

    code_style = ParagraphStyle(
        'DocCode',
        parent=styles['Code'],
        fontName='Courier',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#0f172a'),
        backColor=colors.HexColor('#f1f5f9'),
        borderColor=colors.HexColor('#cbd5e1'),
        borderWidth=0.5,
        borderPadding=8,
        spaceAfter=12,
        spaceBefore=6
    )

    callout_style = ParagraphStyle(
        'DocCallout',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#0369a1'),
        backColor=colors.HexColor('#f0f9ff'),
        borderColor=colors.HexColor('#bae6fd'),
        borderWidth=0.5,
        borderPadding=10,
        spaceAfter=15,
        spaceBefore=10
    )

    # Helper function to add Section Headers with colored accents
    def add_section_header(title):
        story.append(Spacer(1, 10))
        story.append(Paragraph(title, h1_style))
        # Add decorative line below heading
        line_data = [['']]
        line_table = Table(line_data, colWidths=[doc.width], rowHeights=[2])
        line_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), c_accent),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
        ]))
        story.append(line_table)
        story.append(Spacer(1, 10))

    # ================= PAGE 1: TITLE & EXECUTIVE SUMMARY =================
    story.append(Spacer(1, 40))
    story.append(Paragraph("AirPulse 2.0 Platform", title_style))
    story.append(Paragraph("Comprehensive Technical Documentation & System Reference", subtitle_style))
    
    # Visual Cover Divider
    banner_data = [['']]
    banner_table = Table(banner_data, colWidths=[doc.width], rowHeights=[4])
    banner_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_accent),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 25))

    story.append(Paragraph("Executive System Overview", h2_style))
    story.append(Paragraph(
        "<b>AirPulse 2.0</b> is a production-quality, premium Environmental Intelligence Platform. "
        "It acts as a hybrid educational tool and a real-time tracking interface, highlighting the "
        "synergistic power of relational database systems (SQLite) combined with NoSQL cloud document "
        "stores (MongoDB Atlas). The platform is engineered to display modern full-stack developer patterns "
        "while preserving and demonstrating core academic DBMS principles (normalization, relational mapping, "
        "foreign keys, active triggers, indexed searches, and database views) required for college assessments.",
        body_style
    ))

    story.append(Paragraph("Core Technical Pillars", h2_style))
    
    pillars = [
        "<b>Primary Relational Layer (ACID)</b>: Hosted entirely on SQLite (<code>airpulse_relational.db</code>), enforcing strict constraints, foreign key referential integrity (CASCADE deletions), and indexing.",
        "<b>Secondary Mirroring Layer (NoSQL)</b>: Replicated in real-time to MongoDB Atlas cloud database cluster, utilizing dynamic mirroring functions during mutations to sync stations, logs, and alert feeds.",
        "<b>Real-Time Eventing Service</b>: Socket.IO bridges frontend UI updates instantly when database writes occur—enabling immediate UI updates and audit logs without web refreshes.",
        "<b>User Session Persistence</b>: Local caching using <code>localStorage</code> ensures query history, custom Mongo templates, and SQL playground execution state survive page updates.",
        "<b>Robust Fallback Capabilities</b>: Multi-tier offline safety parameters handle geocoding failures via SQLite cache logs and database failures via JSON NoSQL mock emulators."
    ]
    for p in pillars:
        story.append(Paragraph(f"• {p}", bullet_style))

    story.append(PageBreak())

    # ================= PAGE 2: TECH STACK & SYSTEM ARCHITECTURE =================
    add_section_header("1. Technology Stack & Tool Integrations")
    story.append(Paragraph(
        "AirPulse 2.0 leverages a highly-scalable stack. The system dependencies and tools have been "
        "selected to ensure offline presentation stability while preserving capability to connect to cloud services.",
        body_style
    ))

    # Table listing technology components
    tech_data = [
        ["Component", "Technology / Tool Used", "Functional Purpose"],
        ["Client Interface", "React (JS), Vite, Tailwind CSS", "Builds dynamic interface with CSS animations"],
        ["Backend Server", "Python, Flask, Flask-SocketIO", "Exposes REST API gateways and event channels"],
        ["Relational DBMS", "SQLite 3 (Primary source of truth)", "Manages normalization, triggers, constraints, views"],
        ["NoSQL DBMS", "MongoDB Atlas (Cloud Cluster DB)", "Synchronized secondary mirror layer for document queries"],
        ["3D Globe Visualization", "react-globe.gl & Three.js", "Renders interactive gl canvas for exploration"],
        ["AI Advisory", "Google Gemini 1.5 Flash API", "Constructs sensitive group health advisories"],
        ["Uptime Weather", "OpenWeatherMap API", "Displays local temperature, humidity, and atmospheric state"],
        ["Analytics Feed", "AQICN WAQI API Feed", "Syncs live air quality metrics from global monitors"],
        ["Report Exporter", "ReportLab, Pandas, OpenPyXL", "Compiles customized PDF audits, CSV sheets, and Excel logs"]
    ]
    tech_table = Table(tech_data, colWidths=[120, 160, 220])
    tech_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_secondary),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f8fafc'), colors.white]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('FONTSIZE', (0,0), (-1,-1), 8.5),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
    ]))
    story.append(tech_table)
    story.append(Spacer(1, 15))

    story.append(Paragraph("System Architecture Flow", h2_style))
    story.append(Paragraph(
        "A typical database mutation flows through the architecture in the following order:<br/>"
        "1. A client initiates a mutation (e.g., Inserting a record or adding a station node).<br/>"
        "2. The Flask controller targets the SQLite primary database via Python's <code>sqlite3</code> driver.<br/>"
        "3. SQLite applies integrity checks (foreign keys, CHECK bounds) and executes associated <b>SQL Triggers</b>.<br/>"
        "4. The SQLite database inserts the data, auto-logging the action into the <code>AuditLog</code> table and compiling alerts into the <code>SystemAlerts</code> table.<br/>"
        "5. The backend mirroring functions retrieve these tables and update the MongoDB Atlas collections.<br/>"
        "6. An event is broadcasted via <b>Socket.IO</b>, triggering a toast message on client interfaces and causing the dashboard to refresh metrics seamlessly.",
        body_style
    ))

    story.append(PageBreak())

    # ================= PAGE 3: FEATURE MATRIX =================
    add_section_header("2. Core Features & Functional Description")
    story.append(Paragraph(
        "The application divides operations into distinct tabs within the user interface, serving specific functional domains:",
        body_style
    ))

    features = [
        ("Real-time Dashboard Console", 
         "Displays current atmospheric metrics dynamically. Includes an animated circular AQI Gauge, historical 7-day trend charts, active system safety alert feeds, weather parameters, and dynamic health recommendation advisories."),
        
        ("Immersive spatial views", 
         "Contains a 3D Earth Globe (React-Globe.gl) supporting rotation, zoom, country boundaries hover, and geocoded monitor node placements, alongside an SVG Vector Map (IndiaMap) with zoom behaviors."),
        
        ("SQL Playground Console", 
         "Allows executing custom queries directly on SQLite. Exposes a split text editor and pagination grid with vertical/horizontal scrollbars, client filter filters, Excel/CSV exporters, and localStorage persistence."),
        
        ("NoSQL Mongo Console", 
         "Supports executing MongoDB statements using BSON. Outputs formatted documents in collapsible tree-views, history logs list dropdown, custom-saved templates sidebar, document copy controls, and pagination."),
        
        ("Academic DBMS Center", 
         "Academic guidelines featuring ER schemas, live table schemas, 1NF/2NF/3NF/BCNF normalization tables, SQL triggers documentation, database views definitions, and an interactive Viva prep question board."),
        
        ("User Journey Persistence Analytics", 
         "Integrated dashboard widgets: 'Favorite Places' (adds/removes favorited locations with selection drill-down), 'Recently Explored' (lists last 10 searches), and 'Trending Insights' (most searched cities/countries, severe alerts, highest AQI)."),
        
        ("Dynamic Environmental Gamification", 
         "Checklist of green actions (mobility, energy saving, greenery). Completing actions awards points (XP) which dynamically unlocks visual achievements and badges (Zero Carbon, Clean Air, Seed Sower).")
    ]

    for title, desc in features:
        story.append(Paragraph(f"<b>{title}</b>", h2_style))
        story.append(Paragraph(desc, body_style))
        story.append(Spacer(1, 2))

    story.append(PageBreak())

    # ================= PAGE 4: DATABASE SCHEMA & TRIGGERS =================
    add_section_header("3. Database Schema, Constraints, & Triggers")
    story.append(Paragraph(
        "The project implements a normalized relational database design satisfying 3NF. "
        "Foreign key constraints enforce referential boundaries, and active triggers automate audits.",
        body_style
    ))

    story.append(Paragraph("Relational Schema Definitions", h2_style))
    story.append(Paragraph(
        "• <b>Stations</b>: Stores monitor locations.<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;<i>Columns</i>: <code>StationID</code> (PK), <code>Name</code> (Unique), <code>City</code>, <code>Latitude</code>, <code>Longitude</code>, <code>Status</code> (CHECK: Active, Inactive, Maintenance), <code>EstablishedDate</code>.<br/>"
        "• <b>HealthAdvisories</b>: Reference lookup for health precautions.<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;<i>Columns</i>: <code>CategoryName</code> (PK), <code>AQILower</code>, <code>AQIUpper</code>, <code>GeneralAdvisory</code>, <code>ChildElderlyAdvisory</code>, <code>ActionTip</code>, <code>ColorCode</code>.<br/>"
        "• <b>PollutionRecords</b>: Daily pollutant logs.<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;<i>Columns</i>: <code>RecordID</code> (PK), <code>StationID</code> (FK referencing Stations ON DELETE CASCADE), <code>Timestamp</code>, <code>PM25</code>, <code>PM10</code>, <code>CO</code>, <code>NO2</code>, <code>SO2</code>, <code>O3</code>, <code>AQI</code>, <code>AQI_Category</code> (FK referencing HealthAdvisories).<br/>"
        "• <b>SystemAlerts</b>: Exceeded pollutant indicators.<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;<i>Columns</i>: <code>AlertID</code> (PK), <code>StationID</code> (FK), <code>RecordID</code> (FK ON DELETE CASCADE), <code>Pollutant</code>, <code>ObservedValue</code>, <code>ThresholdValue</code>, <code>AlertTimestamp</code>, <code>Status</code> (CHECK: Active, Resolved).<br/>"
        "• <b>AuditLog</b>: Auto-populated historical audit journal.<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;<i>Columns</i>: <code>LogID</code> (PK), <code>ActionType</code> (CHECK: INSERT, UPDATE, DELETE), <code>TableName</code>, <code>RecordID</code>, <code>OldValues</code> (JSON), <code>NewValues</code> (JSON), <code>ActionTimestamp</code>, <code>ExecutedBy</code>.",
        body_style
    ))

    story.append(Paragraph("Relational Triggers", h2_style))
    story.append(Paragraph(
        "The database handles business logic on the database side using four active triggers:<br/>"
        "1. <b>trg_pollution_after_insert</b>: Fired on new records. Automatically writes a log entry into the <code>AuditLog</code> "
        "table. It also scans concentrations: if PM2.5 exceeds 150.0, SO2 exceeds 75.0, or AQI exceeds 200.0, it generates active warning rows in <code>SystemAlerts</code>.<br/>"
        "2. <b>trg_pollution_after_update</b>: Triggered when record concentrations are modified. Logs the changes (storing old and new states in JSON format) and resolves existing alerts if the updated AQI drops below safe thresholds.<br/>"
        "3. <b>trg_pollution_after_delete</b>: Triggered on row removal, logging old metrics to the audit journal.<br/>"
        "4. <b>trg_stations_after_insert</b>: Logs the registration of new station nodes into the audit log automatically.",
        body_style
    ))

    # Sample trigger code snippet
    story.append(Paragraph("SQL Trigger Demonstration (Insert Auditing)", h2_style))
    story.append(Paragraph(
        "<code>CREATE TRIGGER trg_pollution_after_insert AFTER INSERT ON PollutionRecords BEGIN<br/>"
        "&nbsp;&nbsp;INSERT INTO AuditLog (ActionType, TableName, RecordID, NewValues)<br/>"
        "&nbsp;&nbsp;VALUES ('INSERT', 'PollutionRecords', NEW.RecordID, '{\"StationID\":'||NEW.StationID||',\"AQI\":'||NEW.AQI||'}');<br/>"
        "END;</code>",
        code_style
    ))

    story.append(PageBreak())

    # ================= PAGE 5: DUAL ARCHITECTURE & REAL-TIME SYNC =================
    add_section_header("4. Dual-Database Mirroring & Real-Time Sync")
    story.append(Paragraph(
        "A critical feature of AirPulse 2.0 is its dual-database design. It utilizes SQLite for ACID compliance and academic evaluation, and MongoDB Atlas for real-time unstructured cloud storage.",
        body_style
    ))

    story.append(Paragraph("MongoDB Replicated Collections", h2_style))
    story.append(Paragraph(
        "Every write operation on SQLite calls a synchronizer. The system flushes and replicates records into these primary MongoDB Atlas collections:<br/>"
        "• <b>stations</b>: Replicates coordinate documents, names, statuses, and latest readings.<br/>"
        "• <b>pollution_records</b>: Maps relational records with key pollutant components.<br/>"
        "• <b>system_alerts</b>: Syncs active warning records.<br/>"
        "• <b>audit_logs</b>: Mirrors SQLite mutation audits.<br/>"
        "• <b>search_history</b>: Persists user-searched city geocodes, timestamps, resolved AQIs, and click sources.<br/>"
        "• <b>favorite_locations</b>: Stores custom locations favorited by users in the side drawer.<br/>"
        "• <b>location_interactions</b>: Logs click and search telemetry logs for analytics.",
        body_style
    ))

    story.append(Paragraph("WebSocket Broadcast Event Propagation", h2_style))
    story.append(Paragraph(
        "Socket.IO handles event updates instantly across active clients. When database writes or sync events compile, "
        "the server fires a <code>db_mutation</code> event containing details. Clients intercept this websocket event, "
        "trigger a synchronization toast notification, and dynamically pull updated stats without reloading the application.",
        body_style
    ))

    story.append(Paragraph("Robust Network Fallbacks", h2_style))
    story.append(Paragraph(
        "To guarantee deployment reliability during internet outages or server issues, the connection engine "
        "implements self-healing fallbacks. If MongoDB Atlas is unavailable or credentials fail, the server "
        "dynamically initializes an offline <b>Mock NoSQL Emulator (JSON storage)</b>. The dashboard remains "
        "online and responsive, saving state locally in <code>mock_mongodb.json</code>.",
        callout_style
    ))

    story.append(PageBreak())

    # ================= PAGE 6: PLAYGROUNDS & OFFLINE CACHING =================
    add_section_header("5. SQL/NoSQL Playgrounds & Offline Caching")
    story.append(Paragraph(
        "To maximize user experience and system resilience, AirPulse 2.0 incorporates advanced console upgrades, "
        "complete session persistence, and self-healing fallback mechanisms.",
        body_style
    ))

    story.append(Paragraph("SQL Playground Usability Upgrades", h2_style))
    story.append(Paragraph(
        "The SQL console has been upgraded to a production-grade query grid featuring:<br/>"
        "• <b>Scrollable Container & Sticky Headers</b>: Decoupled results tables support vertical and horizontal scrolls with sticky headers.<br/>"
        "• <b>Interactive Pagination</b>: Supports page size configurations of 10, 25, 50, or 100 rows with navigation buttons.<br/>"
        "• <b>Query Filter Input</b>: On-the-fly search input filters matching cells instantly.<br/>"
        "• <b>Client-Side Blob Exports</b>: Allows fast downloads to CSV and XML-formatted Excel spreadsheet files.<br/>"
        "• <b>localStorage Persistence</b>: Caches editor query, result sets, current page index, size, and filters across session reloads.",
        body_style
    ))

    story.append(Paragraph("MongoDB Tree-View Playgrounds", h2_style))
    story.append(Paragraph(
        "Query output is formatted as an interactive tree-view structure, enabling users to expand and collapse "
        "document fields. The NoSQL panel features command history (last 10 queries), custom-saved template shortcuts, "
        "individual document copy-to-clipboard utilities, and paginated BSON results.",
        body_style
    ))

    story.append(Paragraph("Offline API Fallback Cache Lookup", h2_style))
    story.append(Paragraph(
        "If external geocoding (WAQI/AQICN) or weather APIs encounter network failures or rate limits, the explore "
        "engine fallbacks to the local SQLite database. It performs queries matching the searched city/coordinates. "
        "It retrieves the matching record, maps it with the <code>offline: true</code> parameter, and displays the fallback "
        "cached dataset inside the client drawer accompanied by a warning banner outlining the <code>lastUpdated</code> timestamp.",
        body_style
    ))

    story.append(Paragraph("User Session Intelligence Widgets", h2_style))
    story.append(Paragraph(
        "Three widgets display exploration analytics live on the dashboard:<br/>"
        "1. <b>Favorite Places</b>: Displays saved favorite cities, with drill-down exploration queries and inline deletion triggers.<br/>"
        "2. <b>Recently Explored</b>: Lists the last 10 geocoded queries and their resolved AQIs.<br/>"
        "3. <b>Trending Insights</b>: Auto-computes analytics (most searched cities/countries, peak AQI value, and severe warning logs).",
        body_style
    ))

    doc.build(story)
    print(f"Documentation successfully generated at: {filepath}")

if __name__ == '__main__':
    target = r'c:\Users\VYUSH\Desktop\dbms\AirPulse_Documentation.pdf'
    generate_documentation_pdf(target)
