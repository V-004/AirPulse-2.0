/* -------------------------------------------------------------
 * AirPulse 2.0 – Premium Environmental Analytics Dashboard JS
 * ------------------------------------------------------------- */

let trendChart = null;
let compareChart = null;
let map = null;
let mapMarkers = [];
let currentTab = 'dashboard';
let stations = [];
let latestReadings = [];
let recentRecords = [];
let alerts = [];
let auditLogs = [];
let currentTipIndex = 0;

const environmentalTips = [
  "The average person breathes about 11,000 liters of air per day. Protect your lungs!",
  "Did you know? Indoor air quality can be 2 to 5 times worse than outdoor air. Cultivate air-filtering indoor plants.",
  "Commuting by foot or cycling once a week reduces your transport emissions by up to 20%.",
  "Planting trees in urban corridors helps block fine dust particles and reduces ambient summer heat.",
  "Avoid burning dry organic waste. Open fires release high-toxicity PM2.5 particles directly into breathing zones."
];

// Eco Challenges Gamification
let challenges = [
  { id: 1, text: "Commute via public transit, walking, or cycling today.", completed: false, points: 20 },
  { id: 2, text: "Unplug standby electronics to conserve residential energy.", completed: false, points: 15 },
  { id: 3, text: "Water local saplings or indoor air-purifying plants.", completed: false, points: 25 },
  { id: 4, text: "Avoid charcoal grilling or wood combustion today.", completed: false, points: 10 }
];
let ecoScore = 0;

// Replay states
let isReplaying = false;
let replaySpeed = 1000;
let replayIndex = 0;
let replayInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  // Init Icons
  lucide.createIcons();
  
  // Date time
  updateDateTime();
  setInterval(updateDateTime, 60000);
  
  // Init Map
  initLeafletMap();
  
  // Navigation tabs
  initNavigation();
  
  // Load data
  loadDashboardData();
  
  // Theme Switching
  initThemeSwitcher();
  
  // Tips Cycling
  initTipsBox();
  
  // SQL/Mongo play console
  initPlaygrounds();
  
  // CRUD Actions
  initCrudOperations();
  
  // Eco Challenges
  renderChallenges();
  
  // Sockets Listener
  initSocketConnection();
  
  // Timeline Replay
  initTimelineReplay();
  
  document.getElementById('btn-reset-db').addEventListener('click', resetDatabase);
  document.getElementById('close-modal-btn').addEventListener('click', closeEditModal);
  document.getElementById('btn-cancel-edit').addEventListener('click', closeEditModal);
  document.getElementById('form-edit-record').addEventListener('submit', submitEditRecord);
});

function updateDateTime() {
  const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  document.getElementById('current-datetime').textContent = new Date().toLocaleDateString('en-US', options);
}

// Map initialize
function initLeafletMap() {
  const mapContainer = document.getElementById('leaflet-map-container');
  if (!mapContainer) return;
  
  map = L.map('leaflet-map-container').setView([25.0, 35.0], 2);
  
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(map);
}

// Navigation Tabs
function initNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      if (targetTab === currentTab) return;
      
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      tabPanes.forEach(t => t.classList.remove('active'));
      document.getElementById(`tab-${targetTab}`).classList.add('active');
      
      currentTab = targetTab;
      
      // Update Header Text
      const titleMap = {
        'dashboard': { title: 'Dashboard Overview', sub: 'Real-time air quality metrics and environmental trends.' },
        'operations': { title: 'DB Mutation Control Center', sub: 'Mutate documents and inspect trigger cascades.' },
        'sql-console': { title: 'Relational SQL Playground', sub: 'Verify relational queries against the sqlite-mirrored layer.' },
        'mongo-console': { title: 'Document MongoDB Playground', sub: 'Write direct pymongo find / aggregate statement queries.' },
        'academic-guide': { title: 'Academic Portfolio Review', sub: 'Project presentation slides, schemas, and credentials.' }
      };
      
      document.getElementById('page-title').textContent = titleMap[targetTab].title;
      document.getElementById('page-subtitle').textContent = titleMap[targetTab].sub;
      
      if (targetTab === 'dashboard') {
        loadDashboardData();
        // Resize maps and charts to fit viewport grid
        setTimeout(() => {
          if (map) map.invalidateSize();
        }, 100);
      } else if (targetTab === 'operations') {
        loadRecentRecords();
        loadDashboardData();
      }
    });
  });
}

// Theme management
function initThemeSwitcher() {
  const selector = document.getElementById('theme-selector');
  const buttons = selector.querySelectorAll('button');
  
  // Set theme from storage
  const activeTheme = localStorage.getItem('airpulse-theme') || 'aurora';
  document.documentElement.setAttribute('data-theme', activeTheme);
  
  buttons.forEach(btn => {
    const themeName = btn.getAttribute('data-theme');
    if (themeName === activeTheme) {
      btn.classList.add('scale-125', 'border-white');
    } else {
      btn.classList.remove('scale-125', 'border-white');
    }
    
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('scale-125', 'border-white'));
      btn.classList.add('scale-125', 'border-white');
      
      document.documentElement.setAttribute('data-theme', themeName);
      localStorage.setItem('airpulse-theme', themeName);
      
      toastShow(`Theme Switched to: ${themeName.toUpperCase()}`, 'info');
      
      // Update ChartColors on theme switch
      if (trendChart && compareChart) {
        loadDashboardData();
      }
    });
  });
}

// Toast
function toastShow(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'check-circle';
  if (type === 'error') icon = 'alert-triangle';
  if (type === 'info') icon = 'info';
  
  toast.innerHTML = `<i data-lucide="${icon}"></i><span>${message}</span>`;
  container.appendChild(toast);
  lucide.createIcons();
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Sockets Setup
function initSocketConnection() {
  const socketUrl = window.location.origin;
  const socket = io(socketUrl);
  
  socket.on('connect', () => {
    document.getElementById('socket-indicator').className = 'status-indicator online';
    document.getElementById('socket-status-text').textContent = 'Socket.IO Online';
  });
  
  socket.on('disconnect', () => {
    document.getElementById('socket-indicator').className = 'status-indicator offline bg-red-500 shadow-[0_0_8px_#ef4444]';
    document.getElementById('socket-status-text').textContent = 'Sockets Offline';
  });

  socket.on('db_mutation', (data) => {
    toastShow(`Live Atlas Trigger: ${data.action} on collection '${data.collection}'`);
    loadDashboardData();
    if (currentTab === 'operations') {
      loadRecentRecords();
    }
  });

  socket.on('db_reset', (data) => {
    toastShow(data.message, 'success');
    loadDashboardData();
    if (currentTab === 'operations') {
      loadRecentRecords();
    }
  });
}

// Load dynamic data
async function loadDashboardData() {
  try {
    const response = await fetch('/api/dashboard');
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    
    stations = data.stations;
    latestReadings = data.latest_readings;
    alerts = data.alerts;
    cityStats = data.city_stats;
    auditLogs = data.audit_logs;
    
    // 1. Populate filters dropdown
    populateStationDropdowns();
    
    // 2. Render AQI Cards & Pollutants
    updateAqiDisplay();
    
    // 3. Render map markers
    updateMapMarkers();
    
    // 4. Alerts
    renderAlerts();
    
    // 5. Audit logs
    renderAuditLogs();
    
    // 6. City statistics chart
    renderCompareChart();
    
    // 7. Trends line chart
    loadTrends();
    
    // 8. Academic Guide health cards
    renderSystemHealth(data.system_status);
    
  } catch (err) {
    toastShow(err.message, 'error');
  }
}

// Filter Dropdowns
function populateStationDropdowns() {
  const select = document.getElementById('station-select');
  const formSelect = document.getElementById('record-station-id');
  
  const prevVal = select.value;
  const prevFormVal = formSelect.value;
  
  select.innerHTML = '<option value="all">Global (All Stations Averages)</option>';
  formSelect.innerHTML = '';
  
  stations.forEach(st => {
    const opt = `<option value="${st._id}">${st.name} (${st.city})</option>`;
    select.insertAdjacentHTML('beforeend', opt);
    formSelect.insertAdjacentHTML('beforeend', opt);
  });
  
  if (prevVal) select.value = prevVal;
  if (prevFormVal) formSelect.value = prevFormVal;
  
  select.onchange = () => {
    updateAqiDisplay();
    loadTrends();
  };
}

// Render circular dials and pollutant cards
function updateAqiDisplay() {
  const selected = document.getElementById('station-select').value;
  
  let rec = null;
  if (selected === 'all') {
    if (latestReadings.length === 0) return;
    const avgAqi = Math.round(latestReadings.reduce((sum, r) => sum + r.aqi, 0) / latestReadings.length);
    
    let cat = 'Good', color = '#10b981', gen = 'Overall atmospheric index is in healthy safety thresholds.', sens = 'Safe to exercise outside.', act = 'Use public mobility options.';
    if (avgAqi > 50) { cat = 'Moderate'; color = '#f59e0b'; gen = 'Acceptable indicators; minor concern for sensitive groups.'; sens = 'Sensitive groups should monitor symptoms.'; act = 'Ensure vehicles are tuned.'; }
    if (avgAqi > 100) { cat = 'Poor'; color = '#ef4444'; gen = 'Moderate respiratory concerns for general public.'; sens = 'Children should reduce outdoor exhaustion.'; act = 'Conserve energy.'; }
    if (avgAqi > 150) { cat = 'Very Poor'; color = '#a855f7'; gen = 'Hazardous particles verified; widespread health warnings.'; sens = 'Elderly should stay inside.'; act = 'Wear N95 masks.'; }
    if (avgAqi > 200) { cat = 'Severe'; color = '#7f1d1d'; gen = 'Severe emergency guidelines; heavy PM densities.'; sens = 'Complete outdoor ban enforced.'; act = 'Run HEPA air scrubbers.'; }

    rec = {
      aqi: avgAqi, aqiCategory: cat, colorCode: color, generalAdvisory: gen, sensitiveAdvisory: sens, actionTip: act,
      pollutants: {
        pm25: (latestReadings.reduce((sum, r) => sum + r.pollutants.pm25, 0) / latestReadings.length).toFixed(1),
        pm10: (latestReadings.reduce((sum, r) => sum + r.pollutants.pm10, 0) / latestReadings.length).toFixed(1),
        co: (latestReadings.reduce((sum, r) => sum + r.pollutants.co, 0) / latestReadings.length).toFixed(2),
        no2: (latestReadings.reduce((sum, r) => sum + r.pollutants.no2, 0) / latestReadings.length).toFixed(1),
        so2: (latestReadings.reduce((sum, r) => sum + r.pollutants.so2, 0) / latestReadings.length).toFixed(1),
        o3: (latestReadings.reduce((sum, r) => sum + r.pollutants.o3, 0) / latestReadings.length).toFixed(1)
      }
    };
  } else {
    rec = latestReadings.find(r => r.stationId === selected);
  }
  
  if (!rec) {
    // Empty state
    setDOMAqiMetrics({
      aqi: '--', aqiCategory: 'Unknown', colorCode: '#64748b', generalAdvisory: 'No dynamic data recorded yet.',
      sensitiveAdvisory: 'Register measurements in DB Control tab.', actionTip: 'Seed database to initialize.',
      pollutants: { pm25: 0, pm10: 0, co: 0, no2: 0, so2: 0, o3: 0 }
    });
    return;
  }
  
  setDOMAqiMetrics(rec);
}

function setDOMAqiMetrics(rec) {
  // Aqi circular gauge offset
  const aqiCircle = document.getElementById('aqi-circle-bg');
  const aqiVal = document.getElementById('dashboard-aqi-value');
  const aqiCat = document.getElementById('dashboard-aqi-cat');
  
  aqiVal.textContent = rec.aqi;
  aqiCat.textContent = rec.aqiCategory;
  aqiCat.style.backgroundColor = rec.colorCode;
  aqiCircle.style.borderColor = rec.colorCode;
  aqiCircle.style.boxShadow = `inset 0 0 15px rgba(0,0,0,0.4), 0 0 25px ${rec.colorCode}25`;
  
  document.getElementById('aqi-general-advisory').textContent = rec.generalAdvisory;
  document.getElementById('aqi-sensitive-advisory').textContent = rec.sensitiveAdvisory;
  document.getElementById('aqi-action-tip').textContent = rec.actionTip;
  
  // Eco-impact score (100 - aqi/5)
  const score = Math.max(0, Math.min(100, Math.round(100 - (Number(rec.aqi) || 0) / 5)));
  document.getElementById('impact-score').textContent = score;
  
  // AI Health Advice diagnostics
  const adviceMap = {
    'Good': { child: 'Perfect day for outdoor play, cycling, and park activities.', elderly: 'No health warnings. Safe to exercise and breathe outdoor air.', asthma: 'Zero concerns. Good time to air out residential rooms.', workers: 'Completely safe. Ideal conditions for manual outdoor workloads.' },
    'Moderate': { child: 'Safe overall. Monitor children who exhibit mild coughing.', elderly: 'Acceptable quality. Rest frequently during exercise.', asthma: 'Consider keeping inhalers close. Minor risk of throat irritation.', workers: 'No immediate concerns. Maintain hydration levels.' },
    'Poor': { child: 'Limit intensive running. Take regular inside breaks.', elderly: 'Reduce walks. Relocate workouts to indoor gyms.', asthma: 'Restrict outdoor exertion. Keep windows closed.', workers: 'Wear standard dust masks. Take frequent rest breaks in shaded areas.' },
    'Very Poor': { child: 'Avoid outdoor play. Stay indoors with air filtering.', elderly: 'Elderly should stay indoors. Keep windows closed.', asthma: 'High risk of severe attacks. Run air filters continuously.', workers: 'Mandatory N95 mask usage. Avoid heavy manual workloads.' },
    'Severe': { child: 'Total indoor containment. Zero outdoor exposure.', elderly: 'Critical risk factor. Run HEPA scrubbers, keep windows sealed.', asthma: 'Emergency threat levels. Keep emergency medication close.', workers: 'Complete suspension of non-emergency outdoor labor.' }
  };
  
  const suggestions = adviceMap[rec.aqiCategory] || adviceMap['Good'];
  document.getElementById('ai-child').textContent = suggestions.child;
  document.getElementById('ai-elderly').textContent = suggestions.elderly;
  document.getElementById('ai-asthma').textContent = suggestions.asthma;
  document.getElementById('ai-workers').textContent = suggestions.workers;
  
  // Pollutants bars
  const pContainer = document.getElementById('pollutants-container');
  pContainer.innerHTML = '';
  
  const pollutantsBreakdown = [
    { name: 'PM2.5', value: rec.pollutants.pm25, limit: 35, unit: 'µg/m³', desc: 'Fine dust' },
    { name: 'PM10', value: rec.pollutants.pm10, limit: 150, unit: 'µg/m³', desc: 'Coarse dust' },
    { name: 'CO', value: rec.pollutants.co, limit: 9, unit: 'mg/m³', desc: 'Carbon Monoxide' },
    { name: 'NO2', value: rec.pollutants.no2, limit: 80, unit: 'µg/m³', desc: 'Nitrogen Dioxide' },
    { name: 'SO2', value: rec.pollutants.so2, limit: 75, unit: 'µg/m³', desc: 'Sulfur Dioxide' },
    { name: 'O3', value: rec.pollutants.o3, limit: 100, unit: 'µg/m³', desc: 'Ozone' }
  ];
  
  pollutantsBreakdown.forEach(p => {
    const pct = Math.min(100, (p.value / p.limit) * 100);
    const polHTML = `
      <div class="pollutant-card">
        <div class="pollutant-meta">
          <span class="pollutant-name">${p.name}</span>
          <span class="pollutant-val">${p.value}</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: ${pct}%; background-color: ${rec.colorCode}"></div>
        </div>
        <div class="pollutant-footer">
          <span>${p.desc}</span>
          <span>Limit: ${p.limit} ${p.unit}</span>
        </div>
      </div>
    `;
    pContainer.insertAdjacentHTML('beforeend', polHTML);
  });
}

// Leaflet Markers
function updateMapMarkers() {
  if (!map) return;
  
  // Clear old markers
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];
  
  latestReadings.forEach(rec => {
    const lat = Number(rec.latitude);
    const lng = Number(rec.longitude);
    if (isNaN(lat) || isNaN(lng)) return;
    
    // Colored Marker Icon
    const customIcon = new L.DivIcon({
      html: `<div class="w-4 h-4 rounded-full border border-white/60 shadow-lg animate-ping absolute opacity-75" style="background-color: ${rec.colorCode}"></div>
             <div class="w-4 h-4 rounded-full border-2 border-white shadow-lg relative" style="background-color: ${rec.colorCode}"></div>`,
      className: 'custom-leaflet-marker',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    
    const popupHTML = `
      <div style="font-family: 'Inter', sans-serif; min-width: 140px; color: #000">
        <h4 style="font-weight: 800; font-size: 12px; margin-bottom: 2px;">${rec.stationName}</h4>
        <div style="font-size: 9px; color: #64748b; text-transform: uppercase; margin-bottom: 5px;">${rec.city}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 11px;">AQI:</span>
          <span style="background-color: ${rec.colorCode}; color: #fff; padding: 2px 6px; font-weight: bold; border-radius: 4px; font-size: 11px;">${rec.aqi}</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 9px; border-top: 1px solid #e2e8f0; padding-top: 5px; font-family: monospace;">
          <div>PM2.5: <b>${rec.pollutants.pm25}</b></div>
          <div>PM10: <b>${rec.pollutants.pm10}</b></div>
        </div>
      </div>
    `;
    
    const marker = L.marker([lat, lng], { icon: customIcon }).bindPopup(popupHTML);
    marker.addTo(map);
    mapMarkers.push(marker);
  });
}

// Active Safety alerts
function renderAlerts() {
  const container = document.getElementById('alert-feed-container');
  const countEl = document.getElementById('alert-count');
  countEl.textContent = `${alerts.length} Active`;
  
  if (alerts.length === 0) {
    container.innerHTML = `
      <div class="no-data h-full">
        <i data-lucide="check-circle" class="text-success w-8 h-8"></i>
        <p>All pollutants are currently within safe limits.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  container.innerHTML = '';
  alerts.forEach(a => {
    const alertHTML = `
      <div class="alert-entry">
        <div class="alert-entry-header">
          <span>${a.city.toUpperCase()} | HIGH ${a.pollutant}</span>
          <span>ACTIVE</span>
        </div>
        <p class="alert-desc">${a.stationName} reported concentration level of <strong>${a.observedValue}</strong> vs threshold of ${a.thresholdValue}.</p>
        <span class="alert-time">${a.timestamp.split(' ')[1]}</span>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', alertHTML);
  });
}

// Audit log feed
let lastMaxLogID = 0;
function renderAuditLogs() {
  const container = document.getElementById('audit-log-container');
  if (auditLogs.length === 0) {
    container.innerHTML = '<div class="no-data"><p>No writes audited yet.</p></div>';
    return;
  }
  
  const isFirst = lastMaxLogID === 0;
  const currentMax = auditLogs.length > 0 ? Number(auditLogs[0].LogID || auditLogs[0].documentId.hashCode()) : 0;
  
  container.innerHTML = '';
  auditLogs.forEach(log => {
    const highlight = (!isFirst && Number(log.LogID || log.documentId.hashCode()) > lastMaxLogID) ? 'highlight' : '';
    const oldVal = log.oldState ? `<div class="audit-payload">OLD: ${JSON.stringify(log.oldState)}</div>` : '';
    const newVal = log.newState ? `<div class="audit-payload">NEW: ${JSON.stringify(log.newState)}</div>` : '';
    
    const logHTML = `
      <div class="audit-entry ${highlight}">
        <div class="audit-meta">
          <span class="audit-op-badge ${log.actionType}">${log.actionType}</span>
          <span class="audit-table">${log.collectionName}</span>
        </div>
        <div class="text-xs text-slate-400">Doc ID: <strong class="text-slate-300">#${log.documentId.substring(0, 8)}</strong></div>
        ${oldVal}
        ${newVal}
        <span class="audit-time">${log.timestamp} (by ${log.executedBy})</span>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', logHTML);
  });
  
  lastMaxLogID = currentMax;
}

// Chart.js Averages Comparison Bar Graph
function renderCompareChart() {
  const ctx = document.getElementById('compareChart').getContext('2d');
  
  const labels = cityStats.map(c => c.City);
  const dataValues = cityStats.map(c => c.AvgAQI);
  
  const colors = dataValues.map(v => 
    v > 150 ? 'rgba(168, 85, 247, 0.25)' : 
    v > 100 ? 'rgba(239, 68, 68, 0.25)' : 
    v > 50 ? 'rgba(245, 158, 11, 0.25)' : 'rgba(34, 197, 94, 0.25)'
  );
  
  const borderColors = dataValues.map(v => 
    v > 150 ? '#a855f7' : 
    v > 100 ? '#ef4444' : 
    v > 50 ? '#f59e0b' : '#22c55e'
  );
  
  if (compareChart) {
    compareChart.data.labels = labels;
    compareChart.data.datasets[0].data = dataValues;
    compareChart.data.datasets[0].backgroundColor = colors;
    compareChart.data.datasets[0].borderColor = borderColors;
    compareChart.update();
    return;
  }
  
  compareChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: colors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
      }
    }
  });
}

// Fetch trend data
async function loadTrends() {
  const selected = document.getElementById('station-select').value;
  const param = selected !== 'all' ? `?station_id=${selected}` : '';
  
  try {
    const res = await fetch(`/api/trends${param}`);
    const data = await res.json();
    if (data.success) {
      renderTrendChart(data.trends, selected !== 'all');
    }
  } catch (err) {
    console.error(err);
  }
}

// Render trend chart (Line Chart)
function renderTrendChart(trendsData, isSingle) {
  const ctx = document.getElementById('trendChart').getContext('2d');
  
  const labels = trendsData.map(t => isSingle ? t.timestamp.split(' ')[0].substring(5) : t.Date.substring(5));
  const dataValues = trendsData.map(t => isSingle ? t.aqi : t.AvgAQI);
  
  // Pick active Accent color dynamically
  const activeColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  
  if (trendChart) {
    trendChart.data.labels = labels;
    trendChart.data.datasets[0].data = dataValues;
    trendChart.data.datasets[0].borderColor = activeColor;
    trendChart.data.datasets[0].backgroundColor = `${activeColor}08`;
    trendChart.update();
    return;
  }
  
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        borderColor: activeColor,
        backgroundColor: `${activeColor}08`,
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        pointBackgroundColor: activeColor
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
      }
    }
  });
}

// Cycler tip box
function initTipsBox() {
  const box = document.getElementById('environmental-tip-box');
  const btn = document.getElementById('next-tip-btn');
  
  box.textContent = `"${environmentalTips[0]}"`;
  btn.addEventListener('click', () => {
    currentTipIndex = (currentTipIndex + 1) % environmentalTips.length;
    box.style.opacity = '0';
    setTimeout(() => {
      box.textContent = `"${environmentalTips[currentTipIndex]}"`;
      box.style.opacity = '1';
    }, 200);
  });
  
  setInterval(() => btn.click(), 12000);
}

// SQL & MongoDB Playgrounds interpreter consoles
function initPlaygrounds() {
  // SQL console
  const sqlEditor = document.getElementById('sql-query-editor');
  const sqlRun = document.getElementById('btn-run-query');
  const sqlClear = document.getElementById('btn-clear-query');
  const sqlResult = document.getElementById('sql-result-container');
  const sqlTime = document.getElementById('execution-time');
  
  sqlEditor.value = "SELECT * FROM Stations;";
  
  document.querySelectorAll('[data-sql]').forEach(btn => {
    btn.addEventListener('click', () => {
      sqlEditor.value = btn.getAttribute('data-sql');
      sqlEditor.focus();
    });
  });
  
  sqlClear.addEventListener('click', () => {
    sqlEditor.value = '';
    sqlResult.innerHTML = '<div class="no-data"><i data-lucide="terminal" class="text-slate-500"></i><p>Execute a template to view relational tables outputs.</p></div>';
    sqlTime.textContent = 'Ready';
    lucide.createIcons();
  });
  
  sqlRun.addEventListener('click', async () => {
    const query = sqlEditor.value.trim();
    if (!query) return;
    
    sqlTime.textContent = 'Running...';
    const start = performance.now();
    
    try {
      const res = await fetch('/api/sql-console', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      const end = performance.now();
      sqlTime.textContent = `Completed in ${((end - start)/1000).toFixed(4)}s`;
      
      if (!data.success) {
        sqlResult.innerHTML = `<div class="sql-error-box"><strong>DATABASE ERROR:</strong><br>${data.error}</div>`;
        return;
      }
      
      if (data.type === 'select') {
        if (data.row_count === 0) {
          sqlResult.innerHTML = '<div class="sql-success-alert">Success: 0 rows returned.</div>';
          return;
        }
        let tableHTML = `
          <div class="table-container">
            <table class="data-table">
              <thead><tr>${data.columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
              <tbody>
                ${data.rows.map(row => `<tr>${row.map(cell => `<td>${cell === null ? 'NULL' : cell}</td>`).join('')}</tr>`).join('')}
              </tbody>
            </table>
          </div>
        `;
        sqlResult.innerHTML = tableHTML;
      } else {
        sqlResult.innerHTML = `<div class="sql-success-alert"><i data-lucide="check"></i> ${data.message}</div>`;
        lucide.createIcons();
      }
    } catch (err) {
      sqlTime.textContent = 'Failed';
      sqlResult.innerHTML = `<div class="sql-error-box">${err.message}</div>`;
    }
  });

  // Mongo console
  const mongoEditor = document.getElementById('mongo-query-editor');
  const mongoRun = document.getElementById('btn-run-mongo');
  const mongoClear = document.getElementById('btn-clear-mongo');
  const mongoResult = document.getElementById('mongo-result-container');
  const mongoTime = document.getElementById('mongo-execution-time');
  
  mongoEditor.value = "db.stations.find();";
  
  document.querySelectorAll('[data-mongo]').forEach(btn => {
    btn.addEventListener('click', () => {
      mongoEditor.value = btn.getAttribute('data-mongo');
      mongoEditor.focus();
    });
  });
  
  mongoClear.addEventListener('click', () => {
    mongoEditor.value = '';
    mongoResult.innerHTML = '<div class="no-data"><i data-lucide="cpu" class="text-slate-500"></i><p>Execute a MongoDB collection statement query.</p></div>';
    mongoTime.textContent = 'Ready';
    lucide.createIcons();
  });
  
  mongoRun.addEventListener('click', async () => {
    let query = mongoEditor.value.trim();
    if (!query) return;
    
    if (query.endsWith(';')) query = query.slice(0, -1);
    
    mongoTime.textContent = 'Running...';
    const start = performance.now();
    
    try {
      const res = await fetch('/api/mongo-console', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      const end = performance.now();
      mongoTime.textContent = `Completed in ${((end - start)/1000).toFixed(4)}s`;
      
      if (!data.success) {
        mongoResult.innerHTML = `<div class="sql-error-box"><strong>MONGO EXCEPTION:</strong><br>${data.error}</div>`;
        return;
      }
      
      mongoResult.innerHTML = `
        <div class="flex flex-col gap-2">
          <span class="badge badge-success w-fit">Query OK | Method: ${data.method}</span>
          <pre class="bg-slate-950 p-4 border border-slate-900 rounded-xl max-w-full overflow-x-auto text-[11px] text-slate-200">${JSON.stringify(data.output, null, 2)}</pre>
        </div>
      `;
    } catch (err) {
      mongoTime.textContent = 'Failed';
      mongoResult.innerHTML = `<div class="sql-error-box">${err.message}</div>`;
    }
  });
}

// CRUD
function initCrudOperations() {
  // Forms switching tabs
  const tabs = document.querySelectorAll('.ops-tab-btn');
  const forms = document.querySelectorAll('.ops-form');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      forms.forEach(f => f.classList.remove('active'));
      
      tab.classList.add('active');
      const target = tab.getAttribute('data-form');
      document.getElementById(target).classList.add('active');
    });
  });
  
  // Submit record
  document.getElementById('form-insert-record').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      station_id: document.getElementById('record-station-id').value,
      pm25: parseFloat(document.getElementById('record-pm25').value),
      pm10: parseFloat(document.getElementById('record-pm10').value),
      co: parseFloat(document.getElementById('record-co').value),
      no2: parseFloat(document.getElementById('record-no2').value),
      so2: parseFloat(document.getElementById('record-so2').value),
      o3: parseFloat(document.getElementById('record-o3').value)
    };
    
    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (result.success) {
        toastShow(result.message);
        document.getElementById('form-insert-record').reset();
      } else {
        toastShow(result.error, 'error');
      }
    } catch (err) {
      toastShow(err.message, 'error');
    }
  });

  // Register Station
  document.getElementById('form-insert-station').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('station-name').value,
      city: document.getElementById('station-city').value,
      latitude: parseFloat(document.getElementById('station-lat').value),
      longitude: parseFloat(document.getElementById('station-lng').value),
      status: document.getElementById('station-status').value
    };
    
    try {
      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (result.success) {
        toastShow(result.message);
        document.getElementById('form-insert-station').reset();
      } else {
        toastShow(result.error, 'error');
      }
    } catch (err) {
      toastShow(err.message, 'error');
    }
  });
}

// Fetch list of recent records for table
async function loadRecentRecords() {
  try {
    const res = await fetch('/api/records');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    
    recentRecords = data.records;
    
    const tbody = document.getElementById('db-records-tbody');
    tbody.innerHTML = '';
    
    recentRecords.slice(0, 10).forEach(rec => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-900/50 hover:bg-slate-900/10';
      
      const badgeStyle = `border-color: ${rec.aqi > 150 ? 'rgba(168,85,247,0.3)': rec.aqi > 100 ? 'rgba(239,68,68,0.3)': rec.aqi > 50 ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}; color: ${rec.aqi > 150 ? '#d8b4fe': rec.aqi > 100 ? '#f87171': rec.aqi > 50 ? '#fbbf24' : '#34d399'}; background-color: ${rec.aqi > 150 ? 'rgba(168,85,247,0.08)': rec.aqi > 100 ? 'rgba(239,68,68,0.08)': rec.aqi > 50 ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)'}`;
      
      tr.innerHTML = `
        <td class="py-2.5 px-3 font-semibold text-slate-500">#${rec._id.substring(0,6)}</td>
        <td class="py-2.5 px-3">${rec.stationName}</td>
        <td class="py-2.5 px-3">${rec.city}</td>
        <td class="py-2.5 px-3">${rec.pollutants.pm25}</td>
        <td class="py-2.5 px-3 font-bold">${rec.aqi}</td>
        <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border" style="${badgeStyle}">${rec.aqiCategory}</span></td>
        <td class="py-2.5 px-3 flex gap-2">
          <button class="p-1 hover:bg-slate-800 rounded text-sky-400 btn-icon-edit" data-id="${rec._id}"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i></button>
          <button class="p-1 hover:bg-slate-800 rounded text-red-400 btn-icon-delete" data-id="${rec._id}"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    
    lucide.createIcons();
    
    // Bind actions
    tbody.querySelectorAll('.btn-icon-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteRecord(btn.getAttribute('data-id'));
      });
    });
    tbody.querySelectorAll('.btn-icon-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const r_id = btn.getAttribute('data-id');
        const rec = recentRecords.find(x => x._id === r_id);
        if (rec) openEditModal(rec);
      });
    });
  } catch (err) {
    console.error(err);
  }
}

async function deleteRecord(id) {
  if (!confirm("Confirm record deletion? Triggers will audit this delete operation.")) return;
  try {
    const res = await fetch(`/api/records/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      toastShow(result.message);
    } else {
      toastShow(result.error, 'error');
    }
  } catch (err) {
    toastShow(err.message, 'error');
  }
}

// Edit Record Modal
function openEditModal(rec) {
  document.getElementById('edit-record-id').value = rec._id;
  document.getElementById('edit-pm25').value = rec.pollutants.pm25;
  document.getElementById('edit-pm10').value = rec.pollutants.pm10;
  document.getElementById('edit-co').value = rec.pollutants.co;
  document.getElementById('edit-no2').value = rec.pollutants.no2;
  document.getElementById('edit-so2').value = rec.pollutants.so2;
  document.getElementById('edit-o3').value = rec.pollutants.o3;
  
  document.getElementById('edit-modal').classList.add('active');
  lucide.createIcons();
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
}

async function submitEditRecord(e) {
  e.preventDefault();
  const id = document.getElementById('edit-record-id').value;
  const payload = {
    pm25: parseFloat(document.getElementById('edit-pm25').value),
    pm10: parseFloat(document.getElementById('edit-pm10').value),
    co: parseFloat(document.getElementById('edit-co').value),
    no2: parseFloat(document.getElementById('edit-no2').value),
    so2: parseFloat(document.getElementById('edit-so2').value),
    o3: parseFloat(document.getElementById('edit-o3').value)
  };
  
  try {
    const res = await fetch(`/api/records/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      toastShow(result.message);
      closeEditModal();
    } else {
      toastShow(result.error, 'error');
    }
  } catch (err) {
    toastShow(err.message, 'error');
  }
}

// Reset Database
async function resetDatabase() {
  if (!confirm("Are you sure? This will purge MongoDB and SQLite and re-seed 7 days of raw data.")) return;
  try {
    await fetch('/api/reset-db', { method: 'POST' });
  } catch (err) {
    toastShow(err.message, 'error');
  }
}

// Timeline Replay
function initTimelineReplay() {
  const playBtn = document.getElementById('btn-timeline-play');
  const speedBtns = document.getElementById('replay-speed-controls').querySelectorAll('button');
  
  playBtn.addEventListener('click', () => {
    if (isReplaying) {
      clearInterval(replayInterval);
      isReplaying = false;
      playBtn.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i>';
      playBtn.className = 'p-1.5 rounded-lg flex items-center justify-center bg-sky-500/20 text-sky-400 hover:bg-sky-500/30';
      lucide.createIcons();
    } else {
      if (recentRecords.length === 0) return;
      isReplaying = true;
      playBtn.innerHTML = '<i data-lucide="pause" class="w-4 h-4"></i>';
      playBtn.className = 'p-1.5 rounded-lg flex items-center justify-center bg-red-500/20 text-red-400 hover:bg-red-500/30';
      lucide.createIcons();
      
      const playStep = () => {
        replayIndex = (replayIndex + 1) % recentRecords.length;
        const currentRec = recentRecords[replayIndex];
        
        document.getElementById('station-select').value = currentRec.stationId;
        updateAqiDisplay();
        loadTrends();
        
        toastShow(`Replay Timeline: ${currentRec.timestamp}`, 'info');
      };
      
      replayInterval = setInterval(playStep, replaySpeed);
    }
  });

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedBtns.forEach(b => b.className = 'px-2 py-0.5 rounded text-slate-400');
      btn.className = 'px-2 py-0.5 rounded bg-sky-500 text-white';
      
      replaySpeed = parseInt(btn.getAttribute('data-speed'));
      
      if (isReplaying) {
        clearInterval(replayInterval);
        replayInterval = setInterval(() => {
          replayIndex = (replayIndex + 1) % recentRecords.length;
          const currentRec = recentRecords[replayIndex];
          document.getElementById('station-select').value = currentRec.stationId;
          updateAqiDisplay();
          loadTrends();
        }, replaySpeed);
      }
    });
  });
}

// Challenges checkable list
function renderChallenges() {
  const container = document.getElementById('challenges-container');
  container.innerHTML = '';
  
  challenges.forEach(ch => {
    const label = document.createElement('label');
    label.className = 'flex gap-3 items-start cursor-pointer group';
    
    label.innerHTML = `
      <input type="checkbox" ${ch.completed ? 'checked': ''} class="mt-1 rounded accent-sky-500 border-slate-700 bg-slate-900 w-4 h-4 shrink-0 challenge-checkbox" data-id="${ch.id}">
      <span class="text-xs leading-normal group-hover:text-slate-200 transition-colors ${ch.completed ? 'line-through text-slate-500': 'text-slate-300'}">
        ${ch.text} <strong class="text-sky-400">(+${ch.points} pts)</strong>
      </span>
    `;
    container.appendChild(label);
  });
  
  container.querySelectorAll('.challenge-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const ch_id = parseInt(cb.getAttribute('data-id'));
      const challenge = challenges.find(x => x.id === ch_id);
      
      if (challenge) {
        challenge.completed = cb.checked;
        ecoScore = cb.checked ? ecoScore + challenge.points : ecoScore - challenge.points;
        document.getElementById('eco-score-val').textContent = `${ecoScore} XP`;
        renderChallenges();
        toastShow("Challenge Points Updated!", 'success');
      }
    });
  });
}

// Academic guide indicators
function renderSystemHealth(status) {
  const grid = document.getElementById('system-health-grid');
  if (!grid) return;
  
  const monitors = [
    { title: "Data Engine", val: status.dbStatus, state: "Active", icon: "database", color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
    { title: "WebSocket Server", val: status.socketStatus, state: status.socketStatus === 'Connected' ? 'Online' : 'Offline', icon: "network", color: status.socketStatus === 'Connected' ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20" },
    { title: "Transaction Logs", val: "Auditing Active", state: "Active", icon: "shield-check", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    { title: "Uptime Monitor", val: "99.99%", state: status.uptime, icon: "clock", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" }
  ];
  
  grid.innerHTML = '';
  monitors.forEach(m => {
    const cardHTML = `
      <div class="glass-panel p-5 flex items-center justify-between gap-4">
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-slate-400 uppercase tracking-widest font-heading font-bold">${m.title}</span>
          <span class="text-sm font-extrabold font-heading text-slate-200">${m.val}</span>
          <span class="text-[10px] font-semibold text-slate-400">Status: <strong class="text-slate-300">${m.state}</strong></span>
        </div>
        <div class="w-11 h-11 rounded-xl flex items-center justify-center border ${m.color}">
          <i data-lucide="${m.icon}"></i>
        </div>
      </div>
    `;
    grid.insertAdjacentHTML('beforeend', cardHTML);
  });
  
  lucide.createIcons();
}

// Hash helper for mock log matching
String.prototype.hashCode = function() {
  let hash = 0;
  for (let i = 0; i < this.length; i++) {
    hash = this.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};
