import React, { useState, useEffect } from 'react';
import {
  Database, GitBranch, Zap, Eye, Award, ChevronDown, ChevronUp,
  RefreshCw, CheckCircle2, AlertTriangle, BookOpen, Layers, Link2
} from 'lucide-react';
import SystemHealth from './SystemHealth';

// ER Diagram – rendered as SVG
function ERDiagram() {
  const tables = [
    { id: 'ha',   x: 20,  y: 160, w: 180, label: 'HealthAdvisories', color: '#10b981', pk: 'CategoryName', cols: ['AQILower','AQIUpper','GeneralAdvisory','ColorCode'] },
    { id: 'st',   x: 240, y: 20,  w: 160, label: 'Stations',         color: '#3b82f6', pk: 'StationID',    cols: ['Name','City','Latitude','Longitude','Status'] },
    { id: 'pr',   x: 460, y: 160, w: 185, label: 'PollutionRecords', color: '#f59e0b', pk: 'RecordID',     cols: ['StationID ↗','Timestamp','PM25','AQI','AQI_Category ↗'] },
    { id: 'sa',   x: 700, y: 20,  w: 160, label: 'SystemAlerts',     color: '#ef4444', pk: 'AlertID',      cols: ['StationID ↗','RecordID ↗','Pollutant','Status'] },
    { id: 'al',   x: 700, y: 280, w: 160, label: 'AuditLog',         color: '#8b5cf6', pk: 'LogID',        cols: ['ActionType','TableName','RecordID','OldValues'] },
  ];

  const fkLines = [
    { from: [420, 75],  to: [460, 210] }, // Stations → PollutionRecords
    { from: [645, 210], to: [700, 70]  }, // PollutionRecords → SystemAlerts
    { from: [645, 230], to: [700, 310] }, // PollutionRecords → AuditLog
    { from: [200, 230], to: [460, 240] }, // HealthAdvisories → PollutionRecords
  ];

  return (
    <svg viewBox="0 0 920 400" className="w-full h-auto text-slate-700 dark:text-slate-300" style={{ minHeight: 300 }}>
      {/* FK arrows */}
      {fkLines.map((l, i) => (
        <line key={i} x1={l.from[0]} y1={l.from[1]} x2={l.to[0]} y2={l.to[1]}
          stroke="rgba(99,102,241,0.4)" strokeWidth="1.5" strokeDasharray="5,3"
          markerEnd="url(#arrow)" />
      ))}
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="rgba(99,102,241,0.6)" />
        </marker>
      </defs>
      {/* Tables */}
      {tables.map(t => (
        <g key={t.id}>
          <rect x={t.x} y={t.y} width={t.w} height={24 + t.cols.length * 18 + 10}
            rx="12" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
          {/* Header */}
          <rect x={t.x} y={t.y} width={t.w} height={26} rx="12" fill={t.color + '15'} />
          <rect x={t.x} y={t.y + 18} width={t.w} height={8} fill={t.color + '15'} />
          <text x={t.x + t.w / 2} y={t.y + 17} textAnchor="middle" fill={t.color}
            fontSize="10" fontWeight="bold" fontFamily="Sora, sans-serif">{t.label}</text>
          {/* PK */}
          <text x={t.x + 10} y={t.y + 40} fill="#f59e0b" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
            🔑 {t.pk}
          </text>
          {/* Cols */}
          {t.cols.map((c, ci) => (
            <text key={ci} x={t.x + 10} y={t.y + 56 + ci * 18}
              fill="var(--text-secondary)" fontSize="9" fontFamily="JetBrains Mono, monospace">
              {c}
            </text>
          ))}
        </g>
      ))}
      {/* View badge */}
      <rect x={355} y={325} width={220} height={42} rx="12"
        fill="rgba(16,185,129,0.08)" stroke="rgba(16,185,129,0.3)" strokeWidth="1" strokeDasharray="4,3" />
      <text x={465} y={342} textAnchor="middle" fill="#10b981" fontSize="9.5" fontWeight="bold" fontFamily="Sora, sans-serif">
        VIEW: DetailedPollutionDashboard
      </text>
      <text x={465} y={356} textAnchor="middle" fill="var(--text-secondary)" fontSize="8.5" fontFamily="Inter, sans-serif">
        JOIN of Stations + PollutionRecords + HealthAdvisories
      </text>
    </svg>
  );
}

// Collapsible card
function Card({ title, icon: Icon, color = 'blue', children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const colors = {
    blue:    'text-blue-500 border-blue-500/20 bg-blue-500/5',
    green:   'text-emerald-500 border-emerald-500/20 bg-emerald-500/5',
    amber:   'text-amber-500 border-amber-500/20 bg-amber-500/5',
    red:     'text-red-500 border-red-500/20 bg-red-500/5',
    purple:  'text-purple-500 border-purple-500/20 bg-purple-500/5',
    indigo:  'text-indigo-500 border-indigo-500/20 bg-indigo-500/5',
  };
  return (
    <div className={`border rounded-2xl overflow-hidden mb-4 ${colors[color] || colors.blue}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex justify-between items-center px-5 py-4 font-heading font-bold text-xs">
        <span className="flex items-center gap-2">
          {Icon && <Icon className="w-4.5 h-4.5" />}{title}
        </span>
        {open ? <ChevronUp className="w-4.5 h-4.5 opacity-60" /> : <ChevronDown className="w-4.5 h-4.5 opacity-60" />}
      </button>
      {open && <div className="px-5 pb-5 pt-1 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">{children}</div>}
    </div>
  );
}

// Code block
function Code({ children }) {
  return (
    <pre className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 rounded-xl p-3.5 text-[10px] font-mono text-slate-800 dark:text-sky-400 overflow-x-auto whitespace-pre-wrap select-all leading-relaxed mt-2">
      {children}
    </pre>
  );
}

// Stat pill
function Pill({ label, value, color = '#3b82f6' }) {
  return (
    <div className="flex flex-col items-center bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/60 rounded-2xl px-4 py-3 gap-0.5">
      <span className="text-xl font-extrabold font-heading font-number" style={{ color }}>{value}</span>
      <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">{label}</span>
    </div>
  );
}

export default function VivaMode({ systemStatus, initialTab = 'er', hideTabBar = false }) {
  const [viva, setViva] = useState(null);
  const [loading, setLoading] = useState(true);
  const [vivaTab, setVivaTab] = useState(initialTab);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/viva-data');
      const data = await res.json();
      if (data.success) setViva(data);
    } catch (e) {
      console.error("Failed loading viva details: ", e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setVivaTab(initialTab);
  }, [initialTab]);

  const tabs = [
    { id: 'er',          label: 'ER Diagram',      icon: GitBranch },
    { id: 'norm',        label: 'Normalization',   icon: Layers },
    { id: 'schema',      label: 'Live Schema',     icon: Database },
    { id: 'trigs',       label: 'Triggers',        icon: Zap },
    { id: 'views',       label: 'Views & Indexes', icon: Eye },
    { id: 'stats',       label: 'Live Stats',      icon: CheckCircle2 },
    { id: 'persistence', label: 'User Journey',    icon: Zap },
    { id: 'viva',        label: 'Viva Q&A',        icon: BookOpen },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* System Health */}
      <SystemHealth systemStatus={systemStatus} />

      {/* Header (Only show if tabs aren't hidden by main hub) */}
      {!hideTabBar && (
        <div className="premium-card py-4 px-6 flex justify-between items-center">
          <div>
            <h2 className="text-md font-bold font-heading flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-500" /> DBMS Academic Mode
            </h2>
            <p className="text-slate-500 text-[10px] mt-0.5">Academic live evaluation guidelines and diagnostic queries.</p>
          </div>
          <button onClick={load}
            className="flex items-center gap-2 px-3 py-1.5 bg-accent/10 hover:bg-accent/25 border border-accent/20 rounded-xl text-accent text-xs font-bold transition-all">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Relational Info
          </button>
        </div>
      )}

      {/* Tab bar (Only show if tabs aren't hidden by main hub) */}
      {!hideTabBar && (
        <div className="flex flex-wrap gap-2">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setVivaTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold font-heading transition-all ${vivaTab === t.id ? 'bg-accent text-white shadow-md' : 'bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="premium-card p-10 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 animate-spin text-accent" />
          <span className="ml-3 text-slate-400 text-sm">Synchronizing SQLite queries...</span>
        </div>
      )}

      {!loading && (
        <div className="flex flex-col gap-6">

          {/* ER DIAGRAM */}
          {vivaTab === 'er' && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-500 mb-2">Primary keys are demarcated with 🔑, and Foreign key relationships are marked as dashed arrows.</p>
              <ERDiagram />
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-slate-200 dark:border-slate-850 pt-4">
                {[
                  { label: 'Relational Entity (Table)', color: 'var(--surface)' },
                  { label: 'Primary Key Index', color: '#f59e0b' },
                  { label: 'Foreign Key Constraint', color: 'rgba(99,102,241,0.6)' },
                  { label: 'Database View (Virtual)', color: '#10b981' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                    <span className="w-3.5 h-3.5 rounded-md inline-block border border-slate-300 dark:border-slate-800" style={{ background: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NORMALIZATION */}
          {vivaTab === 'norm' && (
            <div className="flex flex-col gap-4">
              <Card title="1NF — First Normal Form" icon={Layers} color="green" defaultOpen={true}>
                <p className="mb-2">A relation is in 1NF if and only if all underlying domains contain only atomic (indivisible) values, and no repeating groups exist.</p>
                <p className="text-slate-400 mb-2 font-medium">✅ Satisfied: Each pollutant (PM2.5, PM10, CO, NO2, SO2, O3) is stored in its own column as a numeric field. No complex arrays or comma-delimited fields are present inside table columns.</p>
                <Code>{`CREATE TABLE PollutionRecords (
  RecordID   INTEGER PRIMARY KEY AUTOINCREMENT,
  StationID  INTEGER NOT NULL,
  Timestamp  TEXT NOT NULL,
  PM25       REAL NOT NULL,  -- Atomic measurement
  PM10       REAL NOT NULL,  -- Atomic measurement
  CO         REAL NOT NULL,  -- Atomic measurement
  AQI        INTEGER NOT NULL
);`}</Code>
              </Card>
              <Card title="2NF — Second Normal Form" icon={Layers} color="amber" defaultOpen={true}>
                <p className="mb-2">A relation is in 2NF if it is in 1NF and every non-prime attribute is fully functionally dependent on the primary key (no partial dependencies on candidate keys).</p>
                <p className="text-slate-400 mb-2 font-medium">✅ Satisfied: Stations table is split from PollutionRecords. Station parameters (Name, City, Latitude, Longitude) depend only on <code>StationID</code>. If they were kept in a single unified table, station names would have been partially dependent on the composite query parameters.</p>
                <Code>{`-- Stations (StationID → Name, City, Lat, Lon, Status)
-- PollutionRecords (RecordID → StationID, AQI, PM25...)
-- Eliminates redundant text copies on write mutations`}</Code>
              </Card>
              <Card title="3NF — Third Normal Form" icon={Layers} color="blue" defaultOpen={true}>
                <p className="mb-2">A relation is in 3NF if it is in 2NF and there are no transitive dependencies (non-prime attributes do not determine other non-prime attributes).</p>
                <p className="text-slate-400 mb-2 font-medium">✅ Satisfied: HealthAdvisories was extracted to prevent transitive dependencies where <code>RecordID → AQI_Category → GeneralAdvisory</code>. Instead, advice details depend solely on <code>CategoryName</code> (primary key of HealthAdvisories).</p>
                <Code>{`-- Without 3NF:
--   PollutionRecords: RecordID → AQI_Category → GeneralAdvisory (Transitive link)

-- In 3NF:
--   PollutionRecords: RecordID → AQI_Category (FK)
--   HealthAdvisories: CategoryName → GeneralAdvisory, ColorCode`}</Code>
              </Card>
              <Card title="BCNF — Boyce-Codd Normal Form" icon={Layers} color="purple">
                <p className="mb-2">A relation is in BCNF if for every non-trivial functional dependency X → Y, X is a superkey.</p>
                <p className="text-slate-400 font-medium">✅ Satisfied: AirPulse schema satisfies BCNF. In Stations, <code>StationID</code> is the superkey determining all attributes. In HealthAdvisories, <code>CategoryName</code> uniquely determines coordinates parameters with no overlapping functional dependencies.</p>
              </Card>
            </div>
          )}

          {/* LIVE SCHEMA */}
          {vivaTab === 'schema' && viva && (
            <div className="flex flex-col gap-5">
              {viva.tables.map(tbl => (
                <div key={tbl} className="border border-slate-200 dark:border-slate-850 rounded-xl p-4 bg-slate-100/50 dark:bg-slate-900/10">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold font-heading text-accent flex items-center gap-2">
                      <Database className="w-4 h-4" />{tbl}
                    </h4>
                    <span className="text-[10px] bg-slate-200 dark:bg-slate-800 border border-slate-350 dark:border-slate-700 rounded-full px-2.5 py-0.5 text-slate-500 dark:text-slate-400 font-number font-bold">
                      {viva.row_counts[tbl]} rows
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] font-mono border-collapse">
                      <thead>
                        <tr className="bg-slate-200 dark:bg-slate-950 text-slate-500 dark:text-slate-450">
                          <th className="px-3 py-1.5 text-left">Column</th>
                          <th className="px-3 py-1.5 text-left">Type</th>
                          <th className="px-3 py-1.5 text-left">PK</th>
                          <th className="px-3 py-1.5 text-left">NOT NULL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viva.table_schemas[tbl]?.map(col => (
                          <tr key={col.name} className="border-t border-slate-250 dark:border-slate-900/50">
                            <td className={`px-3 py-1.5 font-bold ${col.pk ? 'text-amber-500' : 'text-slate-700 dark:text-slate-300'}`}>
                              {col.pk ? '🔑 ' : ''}{col.name}
                            </td>
                            <td className="px-3 py-1.5 text-indigo-500 dark:text-indigo-400">{col.type}</td>
                            <td className="px-3 py-1.5">{col.pk ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : '—'}</td>
                            <td className="px-3 py-1.5">{col.notnull ? <CheckCircle2 className="w-3 h-3 text-accent" /> : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {viva.foreign_keys.filter(f => f.from_table === tbl).map((fk, i) => (
                    <div key={i} className="mt-2 flex items-center gap-2 text-[10px] text-indigo-500 dark:text-indigo-400 font-mono">
                      <Link2 className="w-3 h-3" />
                      <span>{fk.from_col} → {fk.to_table}.{fk.to_col}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* TRIGGERS */}
          {vivaTab === 'trigs' && viva && (
            <div className="flex flex-col gap-4">
              <div className="border border-slate-200 dark:border-slate-850 rounded-xl p-5 bg-slate-100/50 dark:bg-slate-900/10">
                <h3 className="font-heading font-bold flex items-center gap-2 mb-2 text-amber-500 text-sm">
                  <Zap className="w-4.5 h-4.5" /> SQLite Relational Triggers ({viva.triggers.length} Active)
                </h3>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Triggers are automated routines that compile on writing events (INSERT, UPDATE, DELETE). AirPulse uses triggers to calculate indexes, write audits, and flag alerts.
                </p>
                {viva.triggers.map(trg => (
                  <div key={trg.name} className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold rounded-lg font-mono">{trg.name}</span>
                    </div>
                    <Code>{trg.sql}</Code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEWS & INDEXES */}
          {vivaTab === 'views' && viva && (
            <div className="flex flex-col gap-4">
              <div className="border border-slate-200 dark:border-slate-850 rounded-xl p-5 bg-slate-100/50 dark:bg-slate-900/10">
                <h3 className="font-heading font-bold flex items-center gap-2 mb-2 text-emerald-500 text-sm">
                  <Eye className="w-4.5 h-4.5" /> Virtual Views ({viva.views.length})
                </h3>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  A VIEW exposes a saved query as a virtual, read-only table. It encapsulates joins for better readability.
                </p>
                {viva.views.map(v => (
                  <div key={v} className="mb-4">
                    <span className="text-emerald-500 font-mono font-bold text-xs">{v}</span>
                    <Code>{`SELECT d1.* FROM ${v} d1
  INNER JOIN (
    SELECT StationID, MAX(Timestamp) AS MaxTime
    FROM PollutionRecords GROUP BY StationID
  ) d2 ON d1.StationID = d2.StationID;`}</Code>
                  </div>
                ))}
              </div>
              <div className="border border-slate-200 dark:border-slate-850 rounded-xl p-5 bg-slate-100/50 dark:bg-slate-900/10">
                <h3 className="font-heading font-bold flex items-center gap-2 mb-2 text-accent text-sm">
                  <Layers className="w-4.5 h-4.5" /> B-Tree Database Indexes ({viva.indexes.length})
                </h3>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Indexes accelerate lookups using B-Tree indexing mechanisms, converting sequential scans O(n) into logarithmic lookups O(log n).
                </p>
                {viva.indexes.map(idx => (
                  <div key={idx.name} className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 text-[10px] font-bold rounded font-mono">{idx.name}</span>
                      <span className="text-[10px] text-slate-400">on {idx.table}</span>
                    </div>
                    <Code>{idx.sql}</Code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LIVE STATS */}
          {vivaTab === 'stats' && viva && (
            <div className="flex flex-col gap-5">
              <div className="border border-slate-200 dark:border-slate-850 rounded-xl p-5 bg-slate-100/50 dark:bg-slate-900/10">
                <h3 className="font-bold font-heading mb-4 text-sm text-slate-700 dark:text-slate-200">Table Row Counts</h3>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
                  {viva.tables.map(tbl => (
                    <Pill key={tbl} label={tbl.replace('PollutionRecords','Pollution').replace('HealthAdvisories','Advisories').replace('SystemAlerts','Alerts')} value={viva.row_counts[tbl]} />
                  ))}
                </div>
                
                <h4 className="font-bold font-heading text-accent mb-3 text-xs uppercase tracking-wider">Top 5 Most Polluted Logs (Live SQL JOIN Query)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] font-mono border-collapse">
                    <thead>
                      <tr className="bg-slate-200 dark:bg-slate-950 text-slate-500">
                        <th className="px-3 py-1.5 text-left">Station</th>
                        <th className="px-3 py-1.5 text-left">City</th>
                        <th className="px-3 py-1.5 text-left">AQI</th>
                        <th className="px-3 py-1.5 text-left">Category</th>
                        <th className="px-3 py-1.5 text-left">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viva.top_polluted.map((r, i) => (
                        <tr key={i} className="border-t border-slate-250 dark:border-slate-900/50 hover:bg-slate-200/25 dark:hover:bg-slate-900/20">
                          <td className="px-3 py-1.5 text-slate-800 dark:text-slate-200">{r.station}</td>
                          <td className="px-3 py-1.5 text-slate-500">{r.city}</td>
                          <td className="px-3 py-1.5 font-extrabold text-rose-500 font-number">{r.AQI}</td>
                          <td className="px-3 py-1.5 text-amber-500 font-semibold">{r.AQI_Category}</td>
                          <td className="px-3 py-1.5 text-slate-400 font-number">{r.Timestamp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* USER JOURNEY PERSISTENCE */}
          {vivaTab === 'persistence' && (
            <div className="flex flex-col gap-4">
              <div className="border border-slate-200 dark:border-slate-850 rounded-xl p-5 bg-slate-100/50 dark:bg-slate-900/10">
                <h3 className="font-heading font-bold flex items-center gap-2 mb-2 text-sky-400 text-sm">
                  <Zap className="w-4.5 h-4.5" /> User Journey Mirrored Synchronization
                </h3>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Demonstration of how user interaction state, search history, and favorite locations are synchronized between SQLite (relational primary DB) and MongoDB Atlas (cloud NoSQL layer) in real-time.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card title="1. Geocode & Search History" icon={Database} color="blue" defaultOpen={true}>
                    <p className="mb-2">When a location search occurs, it checks standard hierarchies (local SQLite cache, API geocoders). Upon resolution, it logs the search query to SQLite and inserts a JSON document in MongoDB Atlas:</p>
                    <Code>{`-- MongoDB Document Schema inside 'search_history':
{
  "_id": ObjectId("64d1f2b3e8c84b11e8093d5a"),
  "query": "Paris",
  "country": "France",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "AQI": 42,
  "timestamp": "2026-06-15 11:07:00",
  "source": "search bar"
}`}</Code>
                  </Card>

                  <Card title="2. Favorites & Location Interactions" icon={Zap} color="green" defaultOpen={true}>
                    <p className="mb-2">Adding a city to favorites creates a mirrored link. Interactions log what types of components are popular, stored inside <code>favorite_locations</code> and <code>location_interactions</code>:</p>
                    <Code>{`-- MongoDB document inside 'favorite_locations':
{
  "_id": ObjectId("64d1f2b3e8c84b11e8093d5b"),
  "city": "Paris",
  "country": "France",
  "savedAt": "2026-06-15 11:07:15"
}`}</Code>
                  </Card>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-850 rounded-xl p-5 bg-slate-100/50 dark:bg-slate-900/10">
                <h3 className="font-heading font-semibold text-slate-200 text-xs mb-3 uppercase tracking-wider">WebSocket Event Propagation Flow</h3>
                <div className="flex flex-col gap-3 font-mono text-[10px] text-slate-400 leading-normal">
                  <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 rounded-lg">
                    <span className="w-5 h-5 rounded-full bg-accent/20 border border-accent/40 text-accent flex items-center justify-center font-bold">1</span>
                    <span>User searches a city or toggles a favorite on the Map or Globe.</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 rounded-lg">
                    <span className="w-5 h-5 rounded-full bg-accent/20 border border-accent/40 text-accent flex items-center justify-center font-bold">2</span>
                    <span>Flask backend writes search history and interaction telemetry to MongoDB Atlas.</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 rounded-lg">
                    <span className="w-5 h-5 rounded-full bg-accent/20 border border-accent/40 text-accent flex items-center justify-center font-bold">3</span>
                    <span>Flask server triggers Socket.IO broadcast: <code>socketio.emit('db_mutation', &#123; action: 'INSERT', collection: 'search_history' &#125;)</code>.</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 rounded-lg">
                    <span className="w-5 h-5 rounded-full bg-accent/20 border border-accent/40 text-accent flex items-center justify-center font-bold">4</span>
                    <span>Active React clients receive the WebSocket socket event, displaying a notification banner and updating the Dashboard widgets dynamically.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIVA Q&A */}
          {vivaTab === 'viva' && (
            <div className="flex flex-col gap-4">
              {[
                {
                  q: 'What is the difference between a PRIMARY KEY and a FOREIGN KEY?',
                  a: 'A PRIMARY KEY uniquely identifies each row within a table (e.g., StationID in Stations). A FOREIGN KEY references the PRIMARY KEY of another table, enforcing referential integrity (e.g., StationID in PollutionRecords references Stations.StationID). Deleting a Station cascade-triggers the removal of its PollutionRecords.'
                },
                {
                  q: 'Explain the purpose of the DetailedPollutionDashboard VIEW.',
                  a: 'A VIEW is a saved SELECT statement exposed as a virtual table. DetailedPollutionDashboard compiles details from PollutionRecords, Stations, and HealthAdvisories so frontend clients can write simple queries without repeating complex SQL JOIN syntax.'
                },
                {
                  q: 'How do database triggers work in AirPulse 2.0?',
                  a: 'SQLite triggers are automated SQL procedures that execute on INSERT, UPDATE, or DELETE operations. (1) AFTER INSERT on PollutionRecords writes an AuditLog entry and creates SystemAlerts if values exceed thresholds. (2) AFTER UPDATE logs updates. (3) AFTER DELETE tracks deletions.'
                },
                {
                  q: 'What is database normalization and what normal forms are satisfied?',
                  a: 'Normalization structures relational tables to eliminate redundancy and anomaly issues. AirPulse satisfies 3NF and BCNF: 1NF requires atomic attributes. 2NF separates Station metadata to eliminate partial dependencies. 3NF separates HealthAdvisories to remove transitive dependencies (RecordID → Category → Advice).'
                },
                {
                  q: 'What is the dual-database architecture in this project?',
                  a: 'SQLite behaves as the primary ACID relational database demonstrating schema normalization, views, triggers, and indices. MongoDB Atlas functions as a mirrored secondary document store synchronized on SQLite mutations. The React frontend leverages both models, proving SQL and NoSQL proficiency.'
                },
                {
                  q: 'How is user session state and exploration telemetry persisted?',
                  a: 'User journey logs are stored dynamically in three specialized collections in MongoDB: search_history (user queries & resolved AQIs), favorite_locations (cities favorited from the drawer), and location_interactions (telemetry mapping active clicks). Client-side states like SQL playgrounds and custom template preferences utilize localStorage cache persistence.'
                }
              ].map((qa, i) => (
                <Card key={i} title={`Question ${i + 1}: ${qa.q}`} icon={BookOpen} color="indigo">
                  <p className="text-slate-650 dark:text-slate-300 font-medium leading-relaxed">{qa.a}</p>
                </Card>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
