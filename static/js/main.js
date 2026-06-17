/* -------------------------------------------------------------
 * AirPulse – Smart Pollution Analytics Dashboard JS
 * Core: Tab Navigation, AJAX CRUD operations, Chart.js, SQL Console
 * ------------------------------------------------------------- */

// Global state variables
let trendChart = null;
let compareChart = null;
let currentTab = 'dashboard';
let stationsList = [];

// Environmental tips list (Humanized feature)
const environmentalTips = [
    "The average person breathes about 11,000 liters of air per day. What we put in our air, we put in our bodies.",
    "Did you know? Indoor air quality can be 2 to 5 times worse than outdoor air. Keep windows open on low-pollution days and cultivate indoor plants.",
    "Small action: Commuting by foot, bike, or public transit just one day a week saves an average of 1,200 lbs of greenhouse gases per year.",
    "Tree canopy check: Mature trees absorb up to 150kg of CO2 per year, acting as natural air filters in dense urban neighborhoods.",
    "Avoid open burning of leaves and waste. Burning green waste releases thousands of high-toxicity PM2.5 particles directly into breathing zones."
];
let currentTipIndex = 0;

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    lucide.createIcons();
    
    // Set DateTime
    updateDateTime();
    setInterval(updateDateTime, 60000);
    
    // Wire up sidebar navigation
    initNavigation();
    
    // Load initial dashboard stats
    loadDashboardData();
    
    // Tip Box setup
    initTipsBox();
    
    // CRUD Forms wiring
    initOperationsForms();
    
    // SQL Console wiring
    initSqlConsole();
    
    // Database Reset
    document.getElementById('btn-reset-db').addEventListener('click', resetDatabase);
    
    // Modals close triggers
    document.getElementById('close-modal-btn').addEventListener('click', closeEditModal);
    document.getElementById('btn-cancel-edit').addEventListener('click', closeEditModal);
    document.getElementById('form-edit-record').addEventListener('submit', submitEditRecord);
});

// Update datetime badge
function updateDateTime() {
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    document.getElementById('current-datetime').textContent = new Date().toLocaleDateString('en-US', options);
}

// Side-bar tab transitions
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            if (targetTab === currentTab) return;
            
            // Toggle active buttons
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Toggle active tabs
            tabPanes.forEach(t => t.classList.remove('active'));
            
            const activeTabPane = document.getElementById(`tab-${targetTab}`);
            activeTabPane.classList.add('active');
            
            currentTab = targetTab;
            
            // Update Page Headers
            const titleMap = {
                'dashboard': { title: 'Dashboard Overview', sub: 'Real-time air quality metrics and environmental trends.' },
                'operations': { title: 'DB Control Center', sub: 'Demonstrate live database changes (CRUD) and witness instant triggers.' },
                'sql-console': { title: 'Interactive SQL Playground', sub: 'Write raw SQLite/MySQL statements for grading and project evaluation.' },
                'academic-guide': { title: 'Academic Project Portfolio', sub: 'ER Diagram, Relational Normalization, and Viva Voice revision slides.' }
            };
            
            document.getElementById('page-title').textContent = titleMap[targetTab].title;
            document.getElementById('page-subtitle').textContent = titleMap[targetTab].sub;
            
            // Refresh data on entry
            if (targetTab === 'dashboard') {
                loadDashboardData();
            } else if (targetTab === 'operations') {
                loadRecentRecords();
                loadDashboardData(); // to sync station selections
            }
        });
    });

    // Guide slide sub-tabbing
    const guideBtns = document.querySelectorAll('.guide-nav-btn');
    const guideSlides = document.querySelectorAll('.guide-slide');
    
    guideBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            guideBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const targetSlide = btn.getAttribute('data-slide');
            guideSlides.forEach(s => s.classList.remove('active'));
            document.getElementById(`slide-${targetSlide}`).classList.add('active');
        });
    });
}

// Show toast notification
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconName = 'check-circle-2';
    if (type === 'error') iconName = 'alert-triangle';
    if (type === 'info') iconName = 'info';
    
    toast.innerHTML = `
        <i data-lucide="${iconName}" class="toast-icon ${type}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(15px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Load dynamic data from Flask API
async function loadDashboardData() {
    try {
        const response = await fetch('/api/dashboard');
        const data = await response.json();
        
        if (!data.success) throw new Error(data.error);
        
        stationsList = data.stations;
        
        // 1. Populate Station Dropdowns
        populateStationDropdowns(data.stations);
        
        // 2. Load latest records for current selection
        updateSelectedStationDashboard(data.latest_records);
        
        // 3. Render Alerts
        renderAlertsFeed(data.alerts);
        
        // 4. Render City Comparison Chart
        renderCompareChart(data.city_stats);
        
        // 5. Load Trends Chart (historical averages)
        loadTrends();
        
        // 6. Update Audit Log Feed
        renderAuditLogs(data.audit_logs);
        
    } catch (err) {
        showToast(`Dashboard Fetch Error: ${err.message}`, 'error');
    }
}

// Populate station select lists in filters & forms
function populateStationDropdowns(stations) {
    const stationSelect = document.getElementById('station-select');
    const formRecordStationSelect = document.getElementById('record-station-id');
    
    // Save current values to prevent reset
    const prevSelectVal = stationSelect.value;
    const prevFormVal = formRecordStationSelect.value;
    
    // Reset filters
    stationSelect.innerHTML = '<option value="all">All Stations (Combined)</option>';
    formRecordStationSelect.innerHTML = '';
    
    stations.forEach(station => {
        const optionHTML = `<option value="${station.StationID}">${station.Name} (${station.City})</option>`;
        stationSelect.insertAdjacentHTML('beforeend', optionHTML);
        formRecordStationSelect.insertAdjacentHTML('beforeend', optionHTML);
    });
    
    // Restore select values if they still exist
    if (prevSelectVal && Array.from(stationSelect.options).some(o => o.value === prevSelectVal)) {
        stationSelect.value = prevSelectVal;
    }
    if (prevFormVal && Array.from(formRecordStationSelect.options).some(o => o.value === prevFormVal)) {
        formRecordStationSelect.value = prevFormVal;
    }
    
    // Add change listener to filters
    stationSelect.onchange = () => {
        loadTrends();
        fetch('/api/dashboard')
            .then(res => res.json())
            .then(data => {
                updateSelectedStationDashboard(data.latest_records);
            });
    };
}

// Update dashboard based on filter selection
function updateSelectedStationDashboard(latestRecords) {
    const selectedStationVal = document.getElementById('station-select').value;
    
    let recordsToUse = [];
    if (selectedStationVal === 'all') {
        recordsToUse = latestRecords;
    } else {
        recordsToUse = latestRecords.filter(r => r.StationID == selectedStationVal);
    }
    
    if (recordsToUse.length === 0) {
        // Handle no records condition
        setAQIDashboardMetrics({
            AQI: '--',
            AQI_Category: 'Unknown',
            ColorCode: '#94a3b8',
            GeneralAdvisory: 'No reading data is currently recorded for this station.',
            ChildElderlyAdvisory: 'Register measurements in the DB Control Center to compute metrics.',
            ActionTip: 'Add records to calculate indices.',
            PM25: 0, PM10: 0, CO: 0, NO2: 0, SO2: 0, O3: 0
        });
        return;
    }
    
    if (selectedStationVal === 'all') {
        // Calculate average index of all active stations
        const totalAQI = recordsToUse.reduce((sum, r) => sum + r.AQI, 0);
        const avgAQI = Math.round(totalAQI / recordsToUse.length);
        
        // Find corresponding Advisory limits
        let category = 'Good';
        let color = '#10b981';
        let genAdv = 'Overall air quality across all reporting cities is healthy.';
        let sensAdv = 'Safe to exercise outside.';
        let action = 'Use shared mobility options to preserve green corridors.';
        
        if (avgAQI > 50) { category = 'Moderate'; color = '#f59e0b'; genAdv = 'Acceptable conditions overall; minor issues for high-sensitivity populations.'; sensAdv = 'Sensitive groups should monitor symptoms.'; action = 'Ensure vehicles are tuned.'; }
        if (avgAQI > 100) { category = 'Poor'; color = '#ef4444'; genAdv = 'Average air represents moderate health issues for standard groups.'; sensAdv = 'Children should reduce long exposure outdoors.'; action = 'Reduce fireplaces usage.'; }
        if (avgAQI > 150) { category = 'Very Poor'; color = '#a855f7'; genAdv = 'Hazardous indicators reported; widespread health risk alerts.'; sensAdv = 'Elderly populations must remain inside.'; action = 'Wear carbon filtration masks.'; }
        if (avgAQI > 200) { category = 'Severe'; color = '#7f1d1d'; genAdv = 'Emergency levels. Heavy particle density triggers general warnings.'; sensAdv = 'Complete outdoor ban recommended.'; action = 'Deploy indoor air scrubbers.'; }
        
        // Calculate average pollutant levels
        const avgPollutants = {
            AQI: avgAQI,
            AQI_Category: category,
            ColorCode: color,
            GeneralAdvisory: genAdv,
            ChildElderlyAdvisory: sensAdv,
            ActionTip: action,
            PM25: (recordsToUse.reduce((sum, r) => sum + r.PM25, 0) / recordsToUse.length).toFixed(1),
            PM10: (recordsToUse.reduce((sum, r) => sum + r.PM10, 0) / recordsToUse.length).toFixed(1),
            CO: (recordsToUse.reduce((sum, r) => sum + r.CO, 0) / recordsToUse.length).toFixed(2),
            NO2: (recordsToUse.reduce((sum, r) => sum + r.NO2, 0) / recordsToUse.length).toFixed(1),
            SO2: (recordsToUse.reduce((sum, r) => sum + r.SO2, 0) / recordsToUse.length).toFixed(1),
            O3: (recordsToUse.reduce((sum, r) => sum + r.O3, 0) / recordsToUse.length).toFixed(1)
        };
        
        setAQIDashboardMetrics(avgPollutants);
    } else {
        // Single station - use exact records
        setAQIDashboardMetrics(recordsToUse[0]);
    }
}

// Update DOM elements for dashboard metrics
function setAQIDashboardMetrics(data) {
    const aqiCircleBg = document.getElementById('aqi-circle-bg');
    const aqiValueEl = document.getElementById('dashboard-aqi-value');
    const aqiCatEl = document.getElementById('dashboard-aqi-cat');
    
    const genAdvEl = document.getElementById('aqi-general-advisory');
    const sensAdvEl = document.getElementById('aqi-sensitive-advisory');
    const actionTipEl = document.getElementById('aqi-action-tip');
    
    // Set circle properties
    aqiValueEl.textContent = data.AQI;
    aqiCatEl.textContent = data.AQI_Category;
    aqiCatEl.style.backgroundColor = data.ColorCode;
    aqiCircleBg.style.borderColor = data.ColorCode;
    aqiCircleBg.style.boxShadow = `inset 0 0 20px rgba(0,0,0,0.4), 0 0 30px ${data.ColorCode}33`;
    
    // Set text guidance
    genAdvEl.textContent = data.GeneralAdvisory;
    sensAdvEl.textContent = data.ChildElderlyAdvisory;
    actionTipEl.textContent = data.ActionTip;
    
    // Set pollutants metrics
    document.getElementById('val-pm25').textContent = `${data.PM25} µg/m³`;
    document.getElementById('val-pm10').textContent = `${data.PM10} µg/m³`;
    document.getElementById('val-co').textContent = `${data.CO} mg/m³`;
    document.getElementById('val-no2').textContent = `${data.NO2} µg/m³`;
    document.getElementById('val-so2').textContent = `${data.SO2} µg/m³`;
    document.getElementById('val-o3').textContent = `${data.O3} µg/m³`;
    
    // Update progress bars relative to limits
    // PM2.5 limit 35, PM10 150, CO 9, NO2 80, SO2 75, O3 100
    updateProgressBar('bar-pm25', data.PM25, 35, data.ColorCode);
    updateProgressBar('bar-pm10', data.PM10, 150, data.ColorCode);
    updateProgressBar('bar-co', data.CO, 9, data.ColorCode);
    updateProgressBar('bar-no2', data.NO2, 80, data.ColorCode);
    updateProgressBar('bar-so2', data.SO2, 75, data.ColorCode);
    updateProgressBar('bar-o3', data.O3, 100, data.ColorCode);
}

function updateProgressBar(id, value, limit, color) {
    const progressEl = document.getElementById(id);
    let pct = (value / limit) * 100;
    pct = Math.min(100, Math.max(0, pct)); // clamp 0-100
    progressEl.style.width = `${pct}%`;
    progressEl.style.backgroundColor = color;
}

// Render active threat alerts feed
function renderAlertsFeed(alerts) {
    const container = document.getElementById('alert-feed-container');
    const alertCountEl = document.getElementById('alert-count');
    
    alertCountEl.textContent = `${alerts.length} Active`;
    
    if (alerts.length === 0) {
        container.innerHTML = `
            <div class="no-data">
                <i data-lucide="check-circle-2" class="text-success"></i>
                <p>All pollutants are currently within safe limits.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    container.innerHTML = '';
    alerts.forEach(alert => {
        const timeFormatted = new Date(alert.AlertTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const alertHTML = `
            <div class="alert-entry">
                <div class="alert-entry-header">
                    <span>${alert.City.toUpperCase()} ALERT: HIGH ${alert.Pollutant}</span>
                    <span>ACTIVE</span>
                </div>
                <p class="alert-desc">${alert.StationName} reports concentration of <strong>${alert.ObservedValue}</strong> exceeding limit threshold of ${alert.ThresholdValue}.</p>
                <span class="alert-time">${timeFormatted}</span>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', alertHTML);
    });
}

// Render DB Audit Logs (Triggers visual validation)
let lastMaxLogID = 0;
function renderAuditLogs(logs) {
    const container = document.getElementById('audit-log-container');
    if (logs.length === 0) {
        container.innerHTML = '<div class="no-data"><p>No database activity logged yet.</p></div>';
        return;
    }
    
    // Check if we have new logs to highlight
    const isFirstLoad = lastMaxLogID === 0;
    const currentMaxLogID = logs.length > 0 ? logs[0].LogID : 0;
    
    container.innerHTML = '';
    logs.forEach(log => {
        const highlightClass = (!isFirstLoad && log.LogID > lastMaxLogID) ? 'highlight' : '';
        const oldValHTML = log.OldValues ? `<div class="text-xs text-muted">OLD STATE:</div><div class="audit-payload">${log.OldValues}</div>` : '';
        const newValHTML = log.NewValues ? `<div class="text-xs text-muted">NEW STATE:</div><div class="audit-payload">${log.NewValues}</div>` : '';
        
        const logHTML = `
            <div class="audit-entry ${highlightClass}">
                <div class="audit-meta">
                    <span class="audit-op-badge ${log.ActionType}">${log.ActionType}</span>
                    <span class="audit-table">table: ${log.TableName}</span>
                </div>
                <div class="text-xs">Record ID: <strong>#${log.RecordID}</strong></div>
                ${oldValHTML}
                ${newValHTML}
                <span class="audit-time">${log.ActionTimestamp} (by ${log.ExecutedBy})</span>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', logHTML);
    });
    
    lastMaxLogID = currentMaxLogID;
}

// Fetch historical averages or station trends
async function loadTrends() {
    const selectedStationVal = document.getElementById('station-select').value;
    const queryParam = selectedStationVal !== 'all' ? `?station_id=${selectedStationVal}` : '';
    
    try {
        const response = await fetch(`/api/trends${queryParam}`);
        const data = await response.json();
        
        if (!data.success) throw new Error(data.error);
        
        renderTrendChart(data.trends, selectedStationVal !== 'all');
    } catch (err) {
        console.error("Trends Load Error:", err);
    }
}

// Render historical line charts (Chart.js)
function renderTrendChart(trendsData, isSingleStation) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    const labels = trendsData.map(t => {
        if (isSingleStation) {
            // Cut seconds from timestamp
            return t.Timestamp.split(' ')[0].substring(5); // e.g. "06-15"
        }
        return t.Date.substring(5);
    });
    const datasetValues = trendsData.map(t => isSingleStation ? t.AQI : t.AvgAQI);
    
    if (trendChart) {
        trendChart.data.labels = labels;
        trendChart.data.datasets[0].data = datasetValues;
        trendChart.data.datasets[0].label = isSingleStation ? 'Station AQI' : 'Average City AQI';
        trendChart.update();
        return;
    }
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: isSingleStation ? 'Station AQI' : 'Average City AQI',
                data: datasetValues,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.35,
                pointBackgroundColor: '#818cf8',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { family: 'Inter', size: 10 } }
                },
                y: {
                    min: 0,
                    max: 250,
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#94a3b8', font: { family: 'Inter', size: 10 } }
                }
            }
        }
    });
}

// Render comparison bar charts (Chart.js)
function renderCompareChart(cityStats) {
    const ctx = document.getElementById('compareChart').getContext('2d');
    
    const labels = cityStats.map(c => c.City);
    const dataValues = cityStats.map(c => c.AvgAQI);
    
    // Determine colors dynamically based on value
    const colors = dataValues.map(v => {
        if (v <= 50) return '#10b98133'; // emerald
        if (v <= 100) return '#f59e0b33'; // amber
        if (v <= 150) return '#ef444433'; // red
        if (v <= 200) return '#a855f733'; // purple
        return '#7f1d1d33';
    });
    
    const borderColors = dataValues.map(v => {
        if (v <= 50) return '#10b981';
        if (v <= 100) return '#f59e0b';
        if (v <= 150) return '#ef4444';
        if (v <= 200) return '#a855f7';
        return '#7f1d1d';
    });
    
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
                label: 'Avg AQI',
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
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { family: 'Inter', size: 10 } }
                },
                y: {
                    min: 0,
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#94a3b8', font: { family: 'Inter', size: 10 } }
                }
            }
        }
    });
}

// Environmental Tips cycler
function initTipsBox() {
    const tipEl = document.getElementById('environmental-tip-box');
    const nextBtn = document.getElementById('next-tip-btn');
    
    tipEl.textContent = `"${environmentalTips[0]}"`;
    
    nextBtn.addEventListener('click', () => {
        currentTipIndex = (currentTipIndex + 1) % environmentalTips.length;
        tipEl.style.opacity = '0';
        setTimeout(() => {
            tipEl.textContent = `"${environmentalTips[currentTipIndex]}"`;
            tipEl.style.opacity = '1';
        }, 200);
    });
    
    // Auto cycle tips every 15s
    setInterval(() => {
        nextBtn.click();
    }, 15000);
}

// CRUD Operations UI logic
function initOperationsForms() {
    // Operations tab selection
    const tabs = document.querySelectorAll('.ops-tab-btn');
    const forms = document.querySelectorAll('.ops-form');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            forms.forEach(f => f.classList.remove('active'));
            
            tab.classList.add('active');
            const targetForm = tab.getAttribute('data-form');
            document.getElementById(targetForm).classList.add('active');
        });
    });
    
    // Submit handler: Add Station
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
            const response = await fetch('/api/stations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            if (!result.success) throw new Error(result.error);
            
            showToast(result.message);
            document.getElementById('form-insert-station').reset();
            
            // Reload details to update maps and dropdowns
            loadDashboardData();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Submit handler: Insert Pollution Record
    document.getElementById('form-insert-record').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            station_id: parseInt(document.getElementById('record-station-id').value),
            pm25: parseFloat(document.getElementById('record-pm25').value),
            pm10: parseFloat(document.getElementById('record-pm10').value),
            co: parseFloat(document.getElementById('record-co').value),
            no2: parseFloat(document.getElementById('record-no2').value),
            so2: parseFloat(document.getElementById('record-so2').value),
            o3: parseFloat(document.getElementById('record-o3').value)
        };
        
        try {
            const response = await fetch('/api/records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            if (!result.success) throw new Error(result.error);
            
            showToast(`${result.message} Calculated AQI: ${result.calculated_aqi} (${result.calculated_category})`);
            document.getElementById('form-insert-record').reset();
            
            // Re-fetch everything
            loadDashboardData();
            loadRecentRecords();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

// Fetch recent records for the editable data table
async function loadRecentRecords() {
    try {
        const response = await fetch('/api/records');
        const data = await response.json();
        
        if (!data.success) throw new Error(data.error);
        
        const tbody = document.getElementById('db-records-tbody');
        tbody.innerHTML = '';
        
        data.records.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>#${row.RecordID}</strong></td>
                <td>${row.StationName}</td>
                <td>${row.City}</td>
                <td>${row.PM25}</td>
                <td><strong>${row.AQI}</strong></td>
                <td><span class="badge" style="background:${row.AQI > 200 ? '#7f1d1d33': row.AQI > 150 ? '#a855f733' : row.AQI > 100 ? '#ef444433' : row.AQI > 50 ? '#f59e0b33' : '#10b98133'}; color:${row.AQI > 200 ? '#f87171': row.AQI > 150 ? '#d8b4fe' : row.AQI > 100 ? '#f87171' : row.AQI > 50 ? '#fbbf24' : '#34d399'}">${row.AQI_Category}</span></td>
                <td>
                    <button class="btn-icon text-indigo-400" onclick="openEditRecord(${row.RecordID}, ${row.PM25}, ${row.PM10}, ${row.CO}, ${row.NO2}, ${row.SO2}, ${row.O3})"><i data-lucide="edit-3"></i></button>
                    <button class="btn-icon text-red-400" onclick="deleteRecord(${row.RecordID})"><i data-lucide="trash-2"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        lucide.createIcons();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// CRUD: Delete record trigger
async function deleteRecord(recordID) {
    if (!confirm(`Are you sure you want to delete environmental record #${recordID}? This will trigger an automatic audit log deletion entry.`)) return;
    
    try {
        const response = await fetch(`/api/records/${recordID}`, { method: 'DELETE' });
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        showToast(result.message);
        
        // Refresh tables and graphs
        loadDashboardData();
        loadRecentRecords();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// CRUD Modals operations
function openEditRecord(recordID, pm25, pm10, co, no2, so2, o3) {
    document.getElementById('edit-record-id').value = recordID;
    document.getElementById('edit-pm25').value = pm25;
    document.getElementById('edit-pm10').value = pm10;
    document.getElementById('edit-co').value = co;
    document.getElementById('edit-no2').value = no2;
    document.getElementById('edit-so2').value = so2;
    document.getElementById('edit-o3').value = o3;
    
    document.getElementById('edit-modal').classList.add('active');
    lucide.createIcons();
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('active');
}

async function submitEditRecord(e) {
    e.preventDefault();
    const recordID = document.getElementById('edit-record-id').value;
    
    const payload = {
        pm25: parseFloat(document.getElementById('edit-pm25').value),
        pm10: parseFloat(document.getElementById('edit-pm10').value),
        co: parseFloat(document.getElementById('edit-co').value),
        no2: parseFloat(document.getElementById('edit-no2').value),
        so2: parseFloat(document.getElementById('edit-so2').value),
        o3: parseFloat(document.getElementById('edit-o3').value)
    };
    
    try {
        const response = await fetch(`/api/records/${recordID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        showToast(`Record updated. New AQI: ${result.aqi} (${result.category})`);
        closeEditModal();
        
        // Refresh tables and graphs
        loadDashboardData();
        loadRecentRecords();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Reset entire database to default values
async function resetDatabase() {
    if (!confirm("Caution: This will drop all tables, recreate them, and restore original clean seed data. Every dashboard alert and trend line will reset. Do you wish to continue?")) return;
    
    try {
        const response = await fetch('/api/reset-db', { method: 'POST' });
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        showToast(result.message);
        
        // Purge log caches
        lastMaxLogID = 0;
        
        // Refresh everything
        loadDashboardData();
        if (currentTab === 'operations') {
            loadRecentRecords();
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// SQL console playground execution
function initSqlConsole() {
    const editor = document.getElementById('sql-query-editor');
    const runBtn = document.getElementById('btn-run-query');
    const clearBtn = document.getElementById('btn-clear-query');
    const resultContainer = document.getElementById('sql-result-container');
    const timeBadge = document.getElementById('execution-time');
    
    // Quick templates buttons click
    const templateBtns = document.querySelectorAll('[data-sql]');
    templateBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            editor.value = btn.getAttribute('data-sql');
            editor.focus();
        });
    });
    
    clearBtn.addEventListener('click', () => {
        editor.value = '';
        resultContainer.innerHTML = `
            <div class="no-data">
                <i data-lucide="console" class="text-muted"></i>
                <p>Select a quick template or write a custom query, then click Execute Query.</p>
            </div>
        `;
        timeBadge.textContent = 'Ready';
        lucide.createIcons();
    });
    
    runBtn.addEventListener('click', async () => {
        const sqlQuery = editor.value.trim();
        if (!sqlQuery) {
            showToast("Please enter an SQL query first.", 'info');
            return;
        }
        
        timeBadge.textContent = 'Executing...';
        resultContainer.innerHTML = '<div class="no-data"><p>Processing query, please wait...</p></div>';
        
        const startTime = performance.now();
        
        try {
            const response = await fetch('/api/sql-console', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: sqlQuery })
            });
            const result = await response.json();
            
            const endTime = performance.now();
            const elapsed = ((endTime - startTime) / 1000).toFixed(4);
            timeBadge.textContent = `Completed in ${elapsed}s`;
            
            if (!result.success) {
                resultContainer.innerHTML = `
                    <div class="sql-error-box">
                        <strong>DATABASE ERROR:</strong><br>
                        ${result.error}
                    </div>
                `;
                return;
            }
            
            if (result.type === 'select') {
                if (result.row_count === 0) {
                    resultContainer.innerHTML = `
                        <div class="sql-success-alert">
                            Query completed successfully. Result set is empty (0 rows returned).
                        </div>
                    `;
                    return;
                }
                
                // Construct a dynamic results table
                let tableHTML = `
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    ${result.columns.map(c => `<th>${c}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${result.rows.map(row => `
                                    <tr>
                                        ${row.map(cell => `<td>${cell === null ? '<span class="text-muted">NULL</span>' : cell}</td>`).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="text-xs text-muted mt-2">Fetched ${result.row_count} rows.</div>
                `;
                resultContainer.innerHTML = tableHTML;
            } else {
                // Mutation query completed
                resultContainer.innerHTML = `
                    <div class="sql-success-alert">
                        <i data-lucide="check" style="display:inline; width:16px; height:16px; margin-top:-3px; vertical-align:middle;"></i>
                        ${result.message}
                    </div>
                `;
                
                // If it mutated tables, we should refresh dashboard states in the background
                loadDashboardData();
            }
            
        } catch (err) {
            timeBadge.textContent = 'Failed';
            resultContainer.innerHTML = `
                <div class="sql-error-box">
                    <strong>NETWORK/SERVER ERROR:</strong><br>
                    ${err.message}
                </div>
            `;
        }
    });
}
