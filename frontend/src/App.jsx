import React, { useState, useEffect, useRef } from 'react';
import { 
  Wind, LayoutDashboard, Database, Terminal, BookOpen, Calendar, 
  MapPin, AlertTriangle, CheckCircle2, ChevronRight, Activity, 
  Trash2, Edit3, PlusCircle, RefreshCw, Download, FileText, 
  ShieldAlert, Award, Play, Pause, Cpu, Heart, CheckSquare, 
  ChevronLeft, Settings, Info, Users, BarChart3, Globe2
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { io } from 'socket.io-client';

// Chart.js imports
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// Import sub-components
import AQIGauge from './components/AQIGauge';
import IndiaMap from './components/IndiaMap';
import GlobeExplorer from './components/GlobeExplorer';
import SQLConsole from './components/SQLConsole';
import MongoConsole from './components/MongoConsole';
import VivaMode from './components/VivaMode';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function App() {
  const [currentTab, setCurrentTab] = useState('dashboard'); // dashboard, map, academic
  const [academicSubTab, setAcademicSubTab] = useState('diagram'); // diagram, sql, mongo, triggers, guide, audit
  const [theme, setTheme] = useState('blue'); // blue, emerald, aurora, light
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCoords, setActiveCoords] = useState([20.0, 77.0]); // Default coordinates
  const [selectedLocationDetail, setSelectedLocationDetail] = useState(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState('all');

  // Dashboard states
  const [stations, setStations] = useState([]);
  const [latestReadings, setLatestReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [cityStats, setCityStats] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [systemStatus, setSystemStatus] = useState({
    dbStatus: 'Loading...', socketStatus: 'Connecting...', uptime: 'Active', lastBackup: '--'
  });
  const [recentRecords, setRecentRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // User Exploration Persistence states
  const [favorites, setFavorites] = useState([]);
  const [exploreHistory, setExploreHistory] = useState([]);
  const [trendingInsights, setTrendingInsights] = useState(null);

  // CRUD & Mutation Form states
  const [formData, setFormData] = useState({
    station_id: '', pm25: '', pm10: '', co: '', no2: '', so2: '', o3: ''
  });
  const [stationForm, setStationForm] = useState({
    name: '', city: '', latitude: '', longitude: '', status: 'Active'
  });
  const [activeFormTab, setActiveFormTab] = useState('insert-record');

  // Modal edit states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editRecordData, setEditRecordData] = useState(null);

  // Timeline Replay states
  const [isReplaying, setIsReplaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1000); // ms per step
  const [replayIndex, setReplayIndex] = useState(0);
  const replayIntervalRef = useRef(null);

  // Eco Challenges points system
  const [challenges, setChallenges] = useState([
    { id: 1, text: "Commute via walking, cycling, or public transit today.", completed: false, points: 20 },
    { id: 2, text: "Unplug high-power standby electronics to reduce grid loads.", completed: false, points: 15 },
    { id: 3, text: "Nurture clean air by watering local plants or saplings.", completed: false, points: 25 },
    { id: 4, text: "Avoid high-emission wood burning or charcoal grilling today.", completed: false, points: 10 }
  ]);
  const [ecoScore, setEcoScore] = useState(0);

  // Climate Awareness Fact cycler
  const [tips, setTips] = useState([]);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  // Socket.IO Ref
  const socketRef = useRef(null);

  // Load and subscribe
  useEffect(() => {
    fetchTips();
    fetchDashboardData();
    fetchRecentRecords();
    fetchFavorites();
    fetchExploreHistory();
    fetchTrendingInsights();

    const savedTheme = localStorage.getItem('airpulse-theme') || 'blue';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    const socketUrl = window.location.origin.includes('5173') 
      ? 'http://localhost:5000' 
      : window.location.origin;
      
    socketRef.current = io(socketUrl);
    
    socketRef.current.on('connect', () => {
      setSystemStatus(prev => ({ ...prev, socketStatus: 'Connected' }));
    });
    
    socketRef.current.on('disconnect', () => {
      setSystemStatus(prev => ({ ...prev, socketStatus: 'Disconnected' }));
    });

    socketRef.current.on('db_mutation', (data) => {
      toast.success(`Live SQLite ⇄ MongoDB Sync: ${data.action} inside '${data.collection}'`, {
        icon: '⚡',
        style: {
          background: theme === 'light' ? '#fff' : '#0f172a',
          color: theme === 'light' ? '#0f172a' : '#fff',
          border: '1px solid var(--border)'
        }
      });
      fetchDashboardData();
      fetchRecentRecords();
      fetchFavorites();
      fetchExploreHistory();
      fetchTrendingInsights();
    });

    socketRef.current.on('db_reset', (data) => {
      toast.success(data.message, { icon: '🔄' });
      fetchDashboardData();
      fetchRecentRecords();
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    };
  }, []);

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('airpulse-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const detectSpikeAnomaly = (record) => {
    if (!record || !recentRecords || recentRecords.length === 0) return null;
    const stationLogs = recentRecords.filter(r => r.stationId === record.stationId && r._id !== record._id);
    if (stationLogs.length < 2) return null;
    
    const sorted = [...stationLogs].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    const previous = sorted.slice(-3);
    const avgPrevAqi = previous.reduce((sum, r) => sum + r.aqi, 0) / previous.length;
    
    if (record.aqi > avgPrevAqi * 1.5 && record.aqi > 100) {
      return {
        deviation: Math.round(((record.aqi - avgPrevAqi) / avgPrevAqi) * 100),
        previousAverage: Math.round(avgPrevAqi)
      };
    }
    return null;
  };

  const getSafestCities = () => {
    return [...cityStats].sort((a, b) => a.AvgAQI - b.AvgAQI).slice(0, 5);
  };
  
  const getTopPollutedCities = () => {
    return [...cityStats].sort((a, b) => b.AvgAQI - a.AvgAQI).slice(0, 5);
  };

  const handleSelectLocation = (location) => {
    if (!location) return;
    
    // Route all searches, country boundary clicks, and marker clicks through the explore pipeline.
    // This executes full cache lookups, SQLite logging, NoSQL mirroring, and Socket.IO updates.
    if (location.isSearch) {
      setSearchQuery(location.term);
      triggerSearch(location.term);
      return;
    }
    
    const locationQuery = location.city || location.stationName;
    if (locationQuery) {
      setSearchQuery(locationQuery);
      triggerSearch(locationQuery);
    } else {
      // Direct display fallback
      const detailedData = {
        _id: location._id,
        stationId: location.stationId,
        timestamp: location.timestamp,
        pollutants: location.pollutants,
        aqi: location.aqi,
        aqiCategory: location.aqiCategory,
        stationName: location.stationName || (stations.find(s => s._id === location.stationId)?.name || 'Exploring Monitor'),
        city: location.city || (stations.find(s => s._id === location.stationId)?.city || 'Global Station'),
        latitude: location.latitude || (stations.find(s => s._id === location.stationId)?.location?.coordinates[1] || 20.0),
        longitude: location.longitude || (stations.find(s => s._id === location.stationId)?.location?.coordinates[0] || 77.0),
        colorCode: location.colorCode || (location.aqi > 200 ? '#7f1d1d' : location.aqi > 150 ? '#a855f7' : location.aqi > 100 ? '#ef4444' : location.aqi > 50 ? '#f59e0b' : '#10b981'),
        generalAdvisory: location.generalAdvisory || 'Air quality is within current tracking indicators.',
        sensitiveAdvisory: location.sensitiveAdvisory || 'Ensure standard precautions for children and elderly.',
        weather: location.weather || { temp: 24, humidity: 60, description: 'scattered clouds', icon: '03d' },
        aiAdvisory: location.aiAdvisory
      };
      setSelectedLocationDetail(detailedData);
      setIsDetailPanelOpen(true);
      if (detailedData.latitude && detailedData.longitude) {
        setActiveCoords([Number(detailedData.latitude), Number(detailedData.longitude)]);
      }
    }
  };

  const triggerSearch = async (term) => {
    const queryTerm = term || searchQuery;
    if (!queryTerm.trim()) {
      toast.error("Enter a location to explore.");
      return;
    }
    
    const loaderId = toast.loading("Exploring global atmospheric intelligence...");
    try {
      const res = await fetch('/api/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryTerm })
      });
      
      const contentType = res.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error(`DEBUG [triggerSearch]: Non-JSON payload returned from /api/explore (status ${res.status}):`, text);
        throw new Error(`Server returned a non-JSON payload (${res.status}). Check developer console.`);
      }
      
      if (data.success) {
        toast.success(`Mapped environment status for ${data.station.name}!`, { id: loaderId });
        
        await fetchDashboardData();
        await fetchRecentRecords();
        fetchExploreHistory();
        fetchTrendingInsights();
        
        const coords = data.station.location.coordinates;
        setActiveCoords([coords[1], coords[0]]);
        
        const detailedData = {
          _id: data.record._id,
          stationId: data.record.stationId,
          timestamp: data.record.timestamp,
          pollutants: data.record.pollutants,
          aqi: data.record.aqi,
          aqiCategory: data.record.aqiCategory,
          stationName: data.station.name,
          city: data.station.city,
          latitude: coords[1],
          longitude: coords[0],
          colorCode: data.record.aqiCategory === 'Good' ? '#10b981' : data.record.aqiCategory === 'Moderate' ? '#f59e0b' : data.record.aqiCategory === 'Poor' ? '#ef4444' : data.record.aqiCategory === 'Very Poor' ? '#a855f7' : '#7f1d1d',
          generalAdvisory: data.record.aqiCategory === 'Good' ? 'Air quality is satisfactory.' : 'Acceptable limits exceeded.',
          weather: data.station.weather,
          aiAdvisory: data.record.aiAdvisory,
          offline: !!data.offline,
          lastUpdated: data.lastUpdated
        };
        
        setSelectedLocationDetail(detailedData);
        setIsDetailPanelOpen(true);
      } else {
        toast.error(data.error || "Exploration failed.", { id: loaderId });
      }
    } catch (err) {
      toast.error(`Error: ${err.message}`, { id: loaderId });
    }
  };

  const fetchTips = async () => {
    try {
      const res = await fetch('/api/tips');
      const data = await res.json();
      if (data.success) setTips(data.tips);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      if (data.success) {
        setStations(data.stations);
        setLatestReadings(data.latest_readings);
        setAlerts(data.alerts);
        setCityStats(data.city_stats);
        setAuditLogs(data.audit_logs);
        setSystemStatus(prev => ({
          ...prev,
          dbStatus: data.system_status.dbStatus,
          uptime: data.system_status.uptime,
          lastBackup: data.system_status.lastBackup
        }));
        
        if (data.stations.length > 0 && !formData.station_id) {
          setFormData(prev => ({ ...prev, station_id: data.stations[0]._id }));
        }
      }
      setLoading(false);
    } catch (err) {
      toast.error(`Error loading metrics: ${err.message}`);
    }
  };

  const fetchRecentRecords = async () => {
    try {
      const res = await fetch('/api/records');
      const data = await res.json();
      if (data.success) setRecentRecords(data.records);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFavorites = async () => {
    try {
      const res = await fetch('/api/favorites');
      const data = await res.json();
      if (data.success) setFavorites(data.favorites);
    } catch (err) {
      console.error("Error fetching favorites:", err);
    }
  };

  const fetchExploreHistory = async () => {
    try {
      const res = await fetch('/api/explore/history');
      const data = await res.json();
      if (data.success) setExploreHistory(data.history);
    } catch (err) {
      console.error("Error fetching explore history:", err);
    }
  };

  const fetchTrendingInsights = async () => {
    try {
      const res = await fetch('/api/trending');
      const data = await res.json();
      if (data.success) setTrendingInsights(data);
    } catch (err) {
      console.error("Error fetching trending insights:", err);
    }
  };

  const handleToggleFavorite = async (location) => {
    if (!location) return;
    const isFav = favorites.some(fav => fav.city === location.city && fav.country === location.country);
    
    if (isFav) {
      const favoriteObj = favorites.find(fav => fav.city === location.city && fav.country === location.country);
      const id = favoriteObj._id || favoriteObj.favoriteId;
      try {
        const res = await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          toast.success(`Removed ${location.city} from favorites`);
          fetchFavorites();
          fetchTrendingInsights();
        }
      } catch (err) {
        toast.error(`Error removing favorite: ${err.message}`);
      }
    } else {
      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            city: location.city,
            country: location.country,
            latitude: location.latitude,
            longitude: location.longitude
          })
        });
        const data = await res.json();
        if (data.success) {
          toast.success(`Saved ${location.city} to favorites`);
          fetchFavorites();
          fetchTrendingInsights();
        }
      } catch (err) {
        toast.error(`Error saving favorite: ${err.message}`);
      }
    }
  };

  const getSelectedMetrics = () => {
    if (selectedStation === 'all') {
      if (latestReadings.length === 0) return null;
      const avgAqi = Math.round(latestReadings.reduce((sum, r) => sum + r.aqi, 0) / latestReadings.length);
      
      let category = 'Good';
      let color = '#10b981';
      let genAdv = 'Overall atmospheric index is in healthy safety thresholds.';
      let sensAdv = 'Safe to exercise outside.';
      let action = 'Use public mobility options to protect city corridors.';
      
      if (avgAqi > 50) { category = 'Moderate'; color = '#f59e0b'; genAdv = 'Acceptable indicators; minor concern for sensitive populations.'; sensAdv = 'Sensitive groups should track inhalation symptoms.'; action = 'Ensure vehicles are tuned.'; }
      if (avgAqi > 100) { category = 'Poor'; color = '#ef4444'; genAdv = 'Moderate respiratory concerns for standard public.'; sensAdv = 'Limit exertion for kids.'; action = 'Conserve electricity.'; }
      if (avgAqi > 150) { category = 'Very Poor'; color = '#a855f7'; genAdv = 'Hazardous particles verified; widespread health alerts.'; sensAdv = 'Avoid outdoor exertion.'; action = 'Wear N95 masks.'; }
      if (avgAqi > 200) { category = 'Severe'; color = '#7f1d1d'; genAdv = 'Severe emergency guidelines; heavy PM densities.'; sensAdv = 'Complete outdoor ban enforced.'; action = 'Run indoor air purifiers.'; }

      return {
        aqi: avgAqi,
        aqiCategory: category,
        colorCode: color,
        generalAdvisory: genAdv,
        sensitiveAdvisory: sensAdv,
        actionTip: action,
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
      return latestReadings.find(r => r.stationId === selectedStation) || null;
    }
  };

  const activeMetrics = getSelectedMetrics();

  const getEnvironmentalScore = () => {
    if (!activeMetrics) return 100;
    const aqi = activeMetrics.aqi;
    return Math.max(0, Math.min(100, Math.round(100 - (aqi / 5))));
  };

  const getHumanizedHealthSuggestions = () => {
    if (!activeMetrics) return {};
    if (activeMetrics.aiAdvisory) {
      return activeMetrics.aiAdvisory;
    }
    const cat = activeMetrics.aqiCategory;
    
    const recommendations = {
      'Good': {
        children: 'Perfect air conditions. Children can play outside without worries.',
        elderly: 'Completely clear. Senior groups can carry out all activities safely.',
        exercise: 'Ideal for high-intensity cardio, jogging, and training.',
        general: 'Breathe freely. The atmosphere is highly safe for the public.'
      },
      'Moderate': {
        children: 'Safe overall. Keep an eye on children showing mild coughing.',
        elderly: 'Comfortable conditions, but take breaks during heavy exertion.',
        exercise: 'Good for workouts; sensitive individuals can monitor symptoms.',
        general: "Today's air quality is generally acceptable. Sensitive individuals may prefer limiting prolonged outdoor activity."
      },
      'Poor': {
        children: 'Limit strenuous outdoor play. Encourage indoor activities instead.',
        elderly: 'Reduce outdoor walking. Senior groups should avoid prolonged exposure.',
        exercise: 'Move intense cardio workouts indoors to protect lung linings.',
        general: 'Air contains noticeable pollution. Sensitive groups should wear face protection.'
      },
      'Very Poor': {
        children: 'Total indoor containment. Play spaces must keep windows sealed.',
        elderly: 'High vulnerability. Elderly individuals must remain indoors.',
        exercise: 'Avoid outdoor training. Restrict sports to ventilated indoor courts.',
        general: 'Atmosphere is heavily compromised. Widespread mask usage is highly recommended.'
      },
      'Severe': {
        children: 'Critical levels. Total restriction on any outdoor entry.',
        elderly: 'Severe health risk. Seniors should utilize air scrubbers at home.',
        exercise: 'All outdoor workouts must be immediately suspended.',
        general: 'Hazardous air quality. Safe indoor containment and mask usage are required.'
      }
    };
    
    return recommendations[cat] || recommendations['Good'];
  };

  const humanAdvisory = getHumanizedHealthSuggestions();

  const handleChallengeToggle = (id) => {
    const updated = challenges.map(ch => {
      if (ch.id === id) {
        const nextState = !ch.completed;
        setEcoScore(prev => nextState ? prev + ch.points : prev - ch.points);
        return { ...ch, completed: nextState };
      }
      return ch;
    });
    setChallenges(updated);
    toast.success("Eco challenge awareness updated!");
  };

  // CRUD API Calls
  const handleInsertRecord = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setFormData({
          station_id: stations[0]?._id || '', pm25: '', pm10: '', co: '', no2: '', so2: '', o3: ''
        });
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCreateStation = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stationForm)
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setStationForm({ name: '', city: '', latitude: '', longitude: '', status: 'Active' });
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteRecord = async (id) => {
    if (!confirm("Delete this record? Audit log triggers will log this write mutation.")) return;
    try {
      const res = await fetch(`/api/records/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openEditModal = (rec) => {
    setEditRecordData({
      id: rec._id,
      pm25: rec.pollutants.pm25,
      pm10: rec.pollutants.pm10,
      co: rec.pollutants.co,
      no2: rec.pollutants.no2,
      so2: rec.pollutants.so2,
      o3: rec.pollutants.o3
    });
    setEditModalOpen(true);
  };

  const handleUpdateRecord = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/records/${editRecordData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editRecordData)
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setEditModalOpen(false);
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const resetDatabase = async () => {
    if (!confirm("Re-seed the databases? This purges SQLite and MongoDB to regenerate clean, fresh seed records.")) return;
    try {
      await fetch('/api/reset-db', { method: 'POST' });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleReplay = () => {
    if (isReplaying) {
      clearInterval(replayIntervalRef.current);
      setIsReplaying(false);
    } else {
      if (recentRecords.length === 0) return;
      setIsReplaying(true);
      
      const playNextFrame = () => {
        setReplayIndex(prev => {
          const next = prev + 1 >= recentRecords.length ? 0 : prev + 1;
          const currentRec = recentRecords[next];
          setSelectedStation(currentRec.stationId);
          toast.success(`Playing Replay Frame: ${currentRec.timestamp}`, {
            duration: 800,
            icon: '⏱️'
          });
          return next;
        });
      };
      replayIntervalRef.current = setInterval(playNextFrame, replaySpeed);
    }
  };

  useEffect(() => {
    if (isReplaying) {
      clearInterval(replayIntervalRef.current);
      replayIntervalRef.current = setInterval(() => {
        setReplayIndex(prev => {
          const next = prev + 1 >= recentRecords.length ? 0 : prev + 1;
          const currentRec = recentRecords[next];
          setSelectedStation(currentRec.stationId);
          return next;
        });
      }, replaySpeed);
    }
  }, [replaySpeed]);

  // Chart data formatting
  const getTrendChartData = () => {
    const historicalData = recentRecords.filter(r => selectedStation === 'all' || r.stationId === selectedStation);
    const sorted = [...historicalData].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)).slice(-10);
    
    return {
      labels: sorted.map(r => r.timestamp.split(' ')[0].substring(5)),
      datasets: [{
        label: 'AQI Over Time',
        data: sorted.map(r => r.aqi),
        borderColor: theme === 'light' ? '#0f172a' : '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.04)',
        borderWidth: 3,
        tension: 0.35,
        fill: false,
        pointBackgroundColor: theme === 'light' ? '#0f172a' : '#38bdf8',
        pointBorderColor: '#ffffff',
        pointHoverRadius: 6
      }]
    };
  };

  const getStackedAreaChartData = () => {
    const historicalData = recentRecords.filter(r => selectedStation === 'all' || r.stationId === selectedStation);
    const sorted = [...historicalData].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)).slice(-10);
    
    return {
      labels: sorted.map(r => r.timestamp.split(' ')[0].substring(5)),
      datasets: [
        {
          label: 'PM2.5 Level',
          data: sorted.map(r => r.pollutants.pm25),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.35)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'PM10 Level',
          data: sorted.map(r => r.pollutants.pm10),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.2)',
          fill: true,
          tension: 0.3
        }
      ]
    };
  };

  const getChartOptions = (title) => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: theme === 'light' ? '#475569' : '#94a3b8',
            font: { family: 'Inter', size: 10, weight: '500' }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: theme === 'light' ? '#475569' : '#64748b', font: { family: 'JetBrains Mono', size: 9 } }
        },
        y: {
          grid: { color: theme === 'light' ? '#e2e8f0' : 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: theme === 'light' ? '#475569' : '#64748b', font: { family: 'JetBrains Mono', size: 9 } }
        }
      }
    };
  };

  return (
    <div className="flex min-h-screen">
      <Toaster position="bottom-right" />
      
      {/* Sidebar Navigation */}
      <aside className="w-[280px] bg-slate-950/20 dark:bg-slate-950/45 border-r border-slate-200 dark:border-slate-800/60 flex flex-col p-6 fixed h-screen z-20 justify-between">
        <div>
          {/* Logo Brand Header */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center">
              <Wind className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-md font-extrabold font-heading tracking-tight">AirPulse 2.0</h1>
              <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-heading font-semibold">Global Intelligence</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-5">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-3">Monitor Platform</span>
              <div className="flex flex-col gap-1">
                <button 
                  onClick={() => setCurrentTab('dashboard')}
                  className={`py-2 px-3 rounded-xl flex items-center gap-3 font-heading font-medium text-xs transition-all ${currentTab === 'dashboard' ? 'bg-accent text-white shadow-md' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/40 dark:hover:bg-slate-900/35'}`}
                >
                  <LayoutDashboard className="w-4 h-4" /> Dashboard Explorer
                </button>
                <button 
                  onClick={() => setCurrentTab('map')}
                  className={`py-2 px-3 rounded-xl flex items-center gap-3 font-heading font-medium text-xs transition-all ${currentTab === 'map' ? 'bg-accent text-white shadow-md' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/40 dark:hover:bg-slate-900/35'}`}
                >
                  <Globe2 className="w-4 h-4" /> Immersive Spatial Map
                </button>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-3">Academic Evaluation</span>
              <button 
                onClick={() => {
                  setCurrentTab('academic');
                  setAcademicSubTab('diagram');
                }}
                className={`w-full py-2 px-3 rounded-xl flex items-center gap-3 font-heading font-medium text-xs transition-all ${currentTab === 'academic' ? 'bg-accent text-white shadow-md' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/40 dark:hover:bg-slate-900/35'}`}
              >
                <BookOpen className="w-4 h-4" /> Academic DBMS Hub
              </button>
            </div>
          </nav>
        </div>

        {/* Sidebar Footer controls */}
        <div className="pt-6 border-t border-slate-200 dark:border-slate-850 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Interface Theme</span>
            <div className="flex gap-1">
              {[
                { key: 'blue', color: 'bg-blue-600', name: 'Atmospheric Blue' },
                { key: 'emerald', color: 'bg-emerald-500', name: 'Forest Emerald' },
                { key: 'aurora', color: 'bg-violet-500', name: 'Midnight Aurora' },
                { key: 'light', color: 'bg-slate-300 border border-slate-400', name: 'Minimal Light' }
              ].map(t => (
                <button 
                  key={t.key}
                  onClick={() => handleThemeChange(t.key)}
                  className={`w-4.5 h-4.5 rounded-full transition-all ${t.color} ${theme === t.key ? 'ring-2 ring-accent scale-110' : 'scale-90 opacity-70'}`}
                  title={t.name}
                />
              ))}
            </div>
          </div>
          
          <button 
            onClick={resetDatabase}
            className="w-full py-2 bg-slate-200/70 hover:bg-slate-350 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold border border-slate-300 dark:border-slate-800 transition-all"
          >
            <RefreshCw className="w-3 h-3" /> Re-Seed DB Layers
          </button>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <main className="ml-[280px] flex-grow p-8 min-h-screen flex flex-col">
        
        {/* Workspace dynamic Header */}
        <header className="flex justify-between items-center mb-8 pb-5 border-b border-slate-200 dark:border-slate-850 shrink-0">
          <div>
            <h2 className="text-xl font-bold font-heading">
              {currentTab === 'dashboard' && 'Platform Dashboard'}
              {currentTab === 'map' && 'Immersive Spatial view'}
              {currentTab === 'academic' && 'Academic DBMS Center'}
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              {currentTab === 'dashboard' && 'Premium global environmental diagnostics and dynamic monitoring.'}
              {currentTab === 'map' && 'Immersive 2D vector fallback display and sensor nodes coordinates.'}
              {currentTab === 'academic' && 'Academic validation schemas, normalization structures, and interactive SQL playgrounds.'}
            </p>
          </div>
          <div className="bg-slate-200/60 dark:bg-slate-900/60 border border-slate-300/40 dark:border-slate-800/50 rounded-xl px-4 py-2 flex items-center gap-2 text-slate-500 text-[11px] font-semibold">
            <Calendar className="w-3.5 h-3.5" />
            <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </header>

        {loading ? (
          <div className="flex-grow flex items-center justify-center">
            <RefreshCw className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : (
          <div className="flex-grow flex flex-col">
            
            {/* VIEW 1: PLATFORM DASHBOARD */}
            {currentTab === 'dashboard' && (
              <div className="flex flex-col gap-6">
                
                {/* Search, Filter & Playback toolbar */}
                <div className="premium-card py-3.5 px-5 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                    
                    {/* Station Selector */}
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <select 
                        value={selectedStation}
                        onChange={(e) => setSelectedStation(e.target.value)}
                        className="bg-transparent text-xs outline-none border border-slate-300 dark:border-slate-800 rounded-xl px-2.5 py-1.5 font-semibold text-slate-600 dark:text-slate-300 focus:border-accent"
                      >
                        <option value="all">Global averages</option>
                        {stations.map(st => (
                          <option key={st._id} value={st._id}>{st.name} ({st.city})</option>
                        ))}
                      </select>
                    </div>

                    {/* Geocode Search */}
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 px-3 py-1.5 rounded-xl max-w-xs w-full">
                      <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && triggerSearch()}
                        placeholder="Search coordinates..."
                        className="bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none w-full placeholder-slate-400"
                      />
                      <button 
                        onClick={() => triggerSearch()}
                        className="px-2 py-0.5 bg-accent/15 hover:bg-accent/25 border border-accent/20 text-accent rounded-lg text-[10px] font-extrabold transition-all"
                      >
                        Find
                      </button>
                    </div>
                  </div>

                  {/* Replay controller */}
                  <div className="flex items-center gap-4 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 rounded-xl px-4 py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={toggleReplay}
                        className={`p-1 rounded flex items-center justify-center transition-all ${isReplaying ? 'bg-red-500/20 text-red-500' : 'bg-accent/15 text-accent'}`}
                      >
                        {isReplaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <span className="font-semibold text-slate-600 dark:text-slate-400">Replay Timeline</span>
                    </div>
                    <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-4">
                      <button 
                        onClick={() => setReplaySpeed(2000)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${replaySpeed === 2000 ? 'bg-accent text-white' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        0.5x
                      </button>
                      <button 
                        onClick={() => setReplaySpeed(1000)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${replaySpeed === 1000 ? 'bg-accent text-white' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        1.0x
                      </button>
                      <button 
                        onClick={() => setReplaySpeed(400)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${replaySpeed === 400 ? 'bg-accent text-white' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        2.5x
                      </button>
                    </div>
                  </div>
                </div>

                {/* Top Section: Hero Globe (70% width) & Atmospheric Intelligence Panel (30% width) */}
                <div className="grid grid-cols-12 gap-6">
                  
                  {/* Hero 3D Globe */}
                  <div className="col-span-12 lg:col-span-8 flex flex-col premium-card !p-0 overflow-hidden h-[450px]">
                    <div className="p-5 pb-2 shrink-0 flex justify-between items-center">
                      <div>
                        <h3 className="text-sm font-bold font-heading">Interactive Globe Explorer</h3>
                        <p className="text-[10px] text-slate-500">Tap countries or nodes to query live atmospheric measurements.</p>
                      </div>
                      <span className="px-2 py-0.5 bg-accent/10 border border-accent/20 text-accent text-[9px] font-bold rounded-full uppercase">
                        WebGL Active
                      </span>
                    </div>
                    <div className="flex-grow w-full min-h-0">
                      <GlobeExplorer 
                        latestReadings={latestReadings}
                        onSelectLocation={handleSelectLocation}
                        theme={theme}
                      />
                    </div>
                  </div>

                  {/* Atmospheric Intelligence Panel */}
                  <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                    {activeMetrics ? (
                      <div className="premium-card flex-grow flex flex-col justify-between">
                        <div>
                          <h3 className="text-sm font-bold font-heading mb-4 text-slate-400">Diagnostic Summary</h3>
                          
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-20 h-20 shrink-0">
                              <AQIGauge 
                                aqi={activeMetrics.aqi}
                                category={activeMetrics.aqiCategory}
                                color={activeMetrics.colorCode}
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 block uppercase font-bold">Health Assessment</span>
                              <p className="text-xs text-slate-700 dark:text-slate-350 leading-relaxed font-semibold mt-1">
                                {activeMetrics.generalAdvisory}
                              </p>
                            </div>
                          </div>

                          {activeMetrics.weather && (
                            <div className="flex items-center gap-3 text-[10px] bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3 mb-4 font-mono text-accent w-fit">
                              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                              <span>Live Weather: <strong>{activeMetrics.weather.temp}°C</strong></span>
                              <span>•</span>
                              <span>Humidity: <strong>{activeMetrics.weather.humidity}%</strong></span>
                              <span>•</span>
                              <span className="capitalize">{activeMetrics.weather.description}</span>
                            </div>
                          )}
                        </div>

                        <div className="border-t border-slate-200 dark:border-slate-850 pt-4 flex flex-col gap-3">
                          <div className="flex items-start gap-2.5">
                            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold block uppercase">Precautionary Warning</span>
                              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">{activeMetrics.sensitiveAdvisory}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5 border-t border-slate-100 dark:border-slate-900 pt-3">
                            <Activity className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold block uppercase">Eco-Action Tip</span>
                              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">{activeMetrics.actionTip}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="premium-card flex-grow flex flex-col items-center justify-center text-center text-slate-400">
                        <AlertTriangle className="w-8 h-8 mb-2 text-slate-500" />
                        <p className="text-xs">No environmental recordings registered.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Middle Section: Trends (Line) and Pollutant breakdown (contribution bars) */}
                <div className="grid grid-cols-12 gap-6">
                  
                  {/* Pollutant Breakdown contribution bars */}
                  <div className="col-span-12 lg:col-span-4 premium-card flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-bold font-heading mb-4">Pollutant Concentrations</h3>
                      <div className="flex flex-col gap-4">
                        {activeMetrics ? (
                          [
                            { name: 'PM2.5', value: activeMetrics.pollutants.pm25, limit: 35, unit: 'µg/m³', desc: 'Fine particles' },
                            { name: 'PM10', value: activeMetrics.pollutants.pm10, limit: 150, unit: 'µg/m³', desc: 'Coarse dust' },
                            { name: 'CO', value: activeMetrics.pollutants.co, limit: 9, unit: 'mg/m³', desc: 'Carbon Monoxide' },
                            { name: 'NO2', value: activeMetrics.pollutants.no2, limit: 80, unit: 'µg/m³', desc: 'Nitrogen Oxide' }
                          ].map(pol => {
                            const pct = Math.min(100, (pol.value / pol.limit) * 100);
                            return (
                              <div key={pol.name} className="flex flex-col gap-1">
                                <div className="flex justify-between text-xs font-semibold">
                                  <span className="text-slate-700 dark:text-slate-350">{pol.name} <span className="text-[10px] text-slate-400 font-normal">({pol.desc})</span></span>
                                  <span className="font-number">{pol.value} / {pol.limit} <span className="text-[10px] text-slate-500">{pol.unit}</span></span>
                                </div>
                                <div className="h-2 w-full bg-slate-200 dark:bg-slate-950 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full rounded-full transition-all duration-1000" 
                                    style={{ width: `${pct}%`, backgroundColor: activeMetrics.colorCode }}
                                  />
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-slate-400">Loading pollutants breakdown...</p>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-850 pt-4 mt-6 flex justify-between items-center text-[10px] text-slate-500">
                      <span>Index Standard: EPA 2026 Guidelines</span>
                      <span>Safe Threshold Limit (100%)</span>
                    </div>
                  </div>

                  {/* Stacked Area Comparison & Trends */}
                  <div className="col-span-12 lg:col-span-8 premium-card flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-bold font-heading">7-Day Trend Timeline Analysis</h3>
                        <span className="text-[10px] text-slate-400 font-mono">Historical Logs Comparison</span>
                      </div>
                      <div className="h-[230px] w-full">
                        {recentRecords.length > 0 ? (
                          <Line data={getTrendChartData()} options={getChartOptions('AQI Index Timeline')} />
                        ) : (
                          <div className="flex items-center justify-center h-full text-xs text-slate-400">No chart data logged.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Section: Area Chart, Alerts, Eco Challenges, recommendations */}
                <div className="grid grid-cols-12 gap-6">
                  
                  {/* Comparisons Stacked Area Chart */}
                  <div className="col-span-12 lg:col-span-6 premium-card">
                    <h3 className="text-sm font-bold font-heading mb-4">Atmospheric PM Particle Comparisons</h3>
                    <div className="h-[240px] w-full">
                      {recentRecords.length > 0 ? (
                        <Line data={getStackedAreaChartData()} options={getChartOptions('Stacked Area Comparison')} />
                      ) : (
                        <div className="flex items-center justify-center h-full text-xs text-slate-400">No comparison data logged.</div>
                      )}
                    </div>
                  </div>

                  {/* Safety Alerts feed */}
                  <div className="col-span-12 lg:col-span-6 premium-card flex flex-col h-[300px]">
                    <div className="flex justify-between items-center mb-4 border-b border-slate-200 dark:border-slate-850 pb-2">
                      <h3 className="text-sm font-bold font-heading flex items-center gap-2">
                        <AlertTriangle className="w-4.5 h-4.5 text-rose-500" /> Sensor Alerts
                      </h3>
                      <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/25 text-rose-500 text-[9px] font-bold rounded-full">
                        {alerts.length} Active
                      </span>
                    </div>

                    <div className="flex-grow overflow-y-auto flex flex-col gap-3 pr-1">
                      {alerts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                          <p className="text-xs">All sensors reporting safe limits.</p>
                        </div>
                      ) : (
                        alerts.map(a => (
                          <div key={a._id} className="p-3 bg-rose-500/5 dark:bg-rose-500/5 border border-rose-500/20 rounded-xl flex justify-between items-start text-xs">
                            <div>
                              <span className="font-extrabold text-[10px] text-rose-500 uppercase block mb-0.5">{a.city}</span>
                              <p className="text-slate-700 dark:text-slate-300">
                                {a.stationName} exceeded {a.pollutant} levels: <strong>{a.observedValue}</strong> vs threshold limit {a.thresholdValue}.
                              </p>
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0 font-number font-semibold">{a.timestamp.split(' ')[1]}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Eco challenges awareness points */}
                  <div className="col-span-12 lg:col-span-6 premium-card flex flex-col justify-between h-[300px]">
                    <div>
                      <h3 className="text-sm font-bold font-heading flex items-center gap-2 mb-2">
                        <Award className="w-4.5 h-4.5 text-yellow-500" /> Eco-Awareness Challenges
                      </h3>
                      <p className="text-[11px] text-slate-500 mb-4 leading-normal">
                        Complete environmental actions to lower your carbon footprint:
                      </p>
                      <div className="flex flex-col gap-3">
                        {challenges.map(ch => (
                          <label key={ch.id} className="flex gap-3 items-start cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={ch.completed}
                              onChange={() => handleChallengeToggle(ch.id)}
                              className="mt-0.5 rounded accent-accent border-slate-300 dark:border-slate-800 bg-slate-900 w-4 h-4 shrink-0" 
                            />
                            <span className={`text-xs leading-normal transition-colors ${ch.completed ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                              {ch.text} <strong className="text-accent font-number">(+{ch.points} pts)</strong>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-850 pt-3 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Total Awareness Points:</span>
                      <span className="font-extrabold text-yellow-500 font-number">{ecoScore} XP</span>
                    </div>
                  </div>

                  {/* Empirical Recommendations / Health Intelligence */}
                  <div className="col-span-12 lg:col-span-6 premium-card flex flex-col justify-between h-[300px]">
                    <div>
                      <h3 className="text-sm font-bold font-heading flex items-center gap-2 mb-3">
                        <Cpu className="w-4.5 h-4.5 text-accent" /> Environmental Recommendations
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-900 rounded-xl">
                          <span className="text-[10px] font-bold text-accent block uppercase mb-1">Children & Kids</span>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal">{humanAdvisory.children}</p>
                        </div>
                        <div className="p-3 bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-900 rounded-xl">
                          <span className="text-[10px] font-bold text-amber-500 block uppercase mb-1">Elderly Care</span>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal">{humanAdvisory.elderly}</p>
                        </div>
                        <div className="p-3 bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-900 rounded-xl">
                          <span className="text-[10px] font-bold text-emerald-500 block uppercase mb-1">Outdoor Activity</span>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal">{humanAdvisory.exercise}</p>
                        </div>
                        <div className="p-3 bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-900 rounded-xl">
                          <span className="text-[10px] font-bold text-indigo-500 block uppercase mb-1">General Population</span>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal">{humanAdvisory.general}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ranked top polluted cities list */}
                <div className="premium-card">
                  <h3 className="text-sm font-bold font-heading mb-4">Global Cities Averages Leaderboard</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Safest */}
                    <div className="border border-slate-200 dark:border-slate-850 rounded-xl p-4">
                      <span className="text-xs font-bold text-emerald-500 block mb-3 uppercase tracking-wider">Top 5 Safest Cities</span>
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                            <th className="py-2">City</th>
                            <th className="py-2 text-right">Average AQI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getSafestCities().map(c => (
                            <tr key={c.City} className="border-b border-slate-100 dark:border-slate-900/50">
                              <td className="py-2.5 font-semibold">{c.City}</td>
                              <td className="py-2.5 text-right font-number font-extrabold text-emerald-500">{c.AvgAQI}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Polluted */}
                    <div className="border border-slate-200 dark:border-slate-850 rounded-xl p-4">
                      <span className="text-xs font-bold text-rose-500 block mb-3 uppercase tracking-wider">Top 5 Polluted Cities</span>
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                            <th className="py-2">City</th>
                            <th className="py-2 text-right">Average AQI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getTopPollutedCities().map(c => (
                            <tr key={c.City} className="border-b border-slate-100 dark:border-slate-900/50">
                              <td className="py-2.5 font-semibold">{c.City}</td>
                              <td className="py-2.5 text-right font-number font-extrabold text-rose-500">{c.AvgAQI}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Section 4: User Session Intelligence */}
                <div className="grid grid-cols-12 gap-6 mt-6">
                  {/* Favorites Widget */}
                  <div className="col-span-12 md:col-span-4 premium-card flex flex-col h-[300px]">
                    <div className="flex justify-between items-center mb-3 border-b border-slate-200 dark:border-slate-850 pb-2 shrink-0">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                        <Heart className="w-4 h-4 text-purple-400 fill-purple-400/25" /> Favorite Places
                      </h3>
                      <span className="text-[10px] text-slate-400 font-bold bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800">
                        {favorites.length} Saved
                      </span>
                    </div>
                    <div className="flex-grow overflow-y-auto pr-1 flex flex-col gap-2">
                      {favorites.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 italic text-xs py-8">
                          <span>No saved favorites yet.</span>
                          <span className="text-[10px] text-slate-505 mt-1 text-center">Click the heart in the side drawer.</span>
                        </div>
                      ) : (
                        favorites.map(fav => (
                          <div 
                            key={fav._id || fav.favoriteId}
                            onClick={() => handleSelectLocation({
                              city: fav.city,
                              country: fav.country,
                              latitude: fav.latitude,
                              longitude: fav.longitude,
                              stationName: `${fav.city} Observatory`,
                              aqi: 75,
                              aqiCategory: 'Moderate',
                              pollutants: { pm25: 12, pm10: 25, co: 0.4, no2: 18, so2: 5, o3: 30 }
                            })}
                            className="flex items-center justify-between p-2.5 bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900 rounded-xl cursor-pointer hover:border-purple-500/40 hover:bg-purple-950/5 transition-all group"
                          >
                            <div>
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block group-hover:text-purple-400">{fav.city}</span>
                              <span className="text-[10px] text-slate-400">{fav.country}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFavorite({ city: fav.city, country: fav.country });
                              }}
                              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Recently Explored Widget */}
                  <div className="col-span-12 md:col-span-4 premium-card flex flex-col h-[300px]">
                    <div className="flex justify-between items-center mb-3 border-b border-slate-200 dark:border-slate-850 pb-2 shrink-0">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-sky-400" /> Recently Explored
                      </h3>
                      <span className="text-[10px] text-slate-400 font-bold bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800">
                        History
                      </span>
                    </div>
                    <div className="flex-grow overflow-y-auto pr-1 flex flex-col gap-2">
                      {exploreHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 italic text-xs py-8">
                          No exploration logs found.
                        </div>
                      ) : (
                        exploreHistory.map((hist) => (
                          <div
                            key={hist.searchId}
                            onClick={() => handleSelectLocation({
                              city: hist.city,
                              country: hist.country,
                              latitude: hist.latitude,
                              longitude: hist.longitude,
                              stationName: hist.query,
                              aqi: hist.AQI || 50,
                              aqiCategory: hist.AQI > 150 ? 'Severe' : hist.AQI > 100 ? 'Poor' : 'Good',
                              pollutants: { pm25: 10, pm10: 20, co: 0.3, no2: 15, so2: 3, o3: 25 }
                            })}
                            className="flex items-center justify-between p-2.5 bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900 rounded-xl cursor-pointer hover:border-sky-500/40 hover:bg-sky-950/5 transition-all group"
                          >
                            <div className="truncate pr-2">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate group-hover:text-sky-400">{hist.city || hist.query}</span>
                              <span className="text-[10px] text-slate-400">{hist.country} • {hist.timestamp?.split(' ')[1]}</span>
                            </div>
                            {hist.AQI !== null && (
                              <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${hist.AQI > 150 ? 'bg-red-500/10 text-red-500' : hist.AQI > 100 ? 'bg-orange-500/10 text-orange-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                {hist.AQI}
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Trending Insights Widget */}
                  <div className="col-span-12 md:col-span-4 premium-card flex flex-col h-[300px]">
                    <div className="flex justify-between items-center mb-3 border-b border-slate-200 dark:border-slate-850 pb-2 shrink-0">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-amber-400" /> Trending Insights
                      </h3>
                      <span className="text-[10px] text-slate-400 font-bold bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800">
                        Analytics
                      </span>
                    </div>
                    <div className="flex-grow overflow-y-auto pr-1 flex flex-col gap-3 text-xs leading-normal">
                      {trendingInsights ? (
                        <>
                          {trendingInsights.top_cities?.length > 0 && (
                            <div>
                              <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 block mb-1">Most Searched Cities:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {trendingInsights.top_cities.map((tc, idx) => (
                                  <span key={idx} className="bg-slate-100 dark:bg-slate-950 border border-slate-250 dark:border-slate-850 rounded px-2 py-0.5 text-[10px] text-slate-700 dark:text-slate-350">
                                    {tc.city} ({tc.count})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {trendingInsights.highest_aqi && trendingInsights.highest_aqi.aqi > 0 && (
                            <div className="p-2.5 bg-rose-500/5 border border-rose-500/20 rounded-xl flex items-center justify-between">
                              <div>
                                <span className="text-[9px] uppercase tracking-wider font-bold text-rose-500 block">Peak Recorded AQI:</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">{trendingInsights.highest_aqi.city}, {trendingInsights.highest_aqi.country}</span>
                              </div>
                              <span className="font-mono font-extrabold text-rose-500 text-lg bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-lg">
                                {trendingInsights.highest_aqi.aqi}
                              </span>
                            </div>
                          )}

                          {trendingInsights.severe_views?.length > 0 && (
                            <div>
                              <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 block mb-1.5">Recent Severe Warnings:</span>
                              <div className="flex flex-col gap-1.5">
                                {trendingInsights.severe_views.slice(0, 2).map((sv, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-[10px] text-slate-400">
                                    <span className="text-slate-300 font-semibold">{sv.city} ({sv.aqi} AQI)</span>
                                    <span>{sv.timestamp?.split(' ')[1]}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-500 italic">
                          Calculating analytics...
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* VIEW 2: IMMERSIVE MAP SCREEN */}
            {currentTab === 'map' && (
              <div className="flex-grow flex flex-col h-[calc(100vh-12rem)] min-h-[400px]">
                <div className="flex-grow rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                  <IndiaMap 
                    latestReadings={latestReadings}
                    activeCoordinates={activeCoords}
                    onSelectLocation={handleSelectLocation}
                    theme={theme}
                  />
                </div>
              </div>
            )}

            {/* VIEW 3: ACADEMIC DBMS HUB */}
            {currentTab === 'academic' && (
              <div className="flex flex-col gap-6">
                
                {/* Academic Header navigation tabs */}
                <div className="premium-card p-2 flex flex-wrap gap-1">
                  {[
                    { key: 'diagram', label: 'ER Schema Model' },
                    { key: 'sql', label: 'SQL Consoles' },
                    { key: 'mongo', label: 'MongoDB Playground' },
                    { key: 'triggers', label: 'DB Triggers & Guides' },
                    { key: 'audit', label: 'Audit Logs Feed' },
                    { key: 'viva', label: 'Oral Oral Prep Prep' }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setAcademicSubTab(tab.key)}
                      className={`px-4 py-2 rounded-xl text-xs font-heading font-medium transition-all ${academicSubTab === tab.key ? 'bg-accent text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* SubTab Content panels */}
                <div className="flex flex-col gap-6">
                  
                  {academicSubTab === 'diagram' && (
                    <div className="premium-card">
                      <h3 className="text-md font-bold font-heading mb-4">Relational Model Diagram</h3>
                      <VivaMode systemStatus={systemStatus} initialTab="er-diagram" />
                    </div>
                  )}

                  {academicSubTab === 'sql' && (
                    <div className="premium-card">
                      <SQLConsole />
                    </div>
                  )}

                  {academicSubTab === 'mongo' && (
                    <div className="premium-card">
                      <MongoConsole />
                    </div>
                  )}

                  {academicSubTab === 'triggers' && (
                    <div className="premium-card">
                      <VivaMode systemStatus={systemStatus} initialTab="academic-viva" />
                    </div>
                  )}

                  {academicSubTab === 'audit' && (
                    <div className="grid grid-cols-12 gap-6">
                      
                      {/* Mutations Log Table */}
                      <div className="col-span-12 xl:col-span-8 premium-card">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-200 dark:border-slate-850 pb-2">
                          <h3 className="text-sm font-bold font-heading">Recent Audit Logs</h3>
                          <span className="text-[10px] text-slate-400 font-mono">SQLite System Mutator Audits</span>
                        </div>
                        <div className="overflow-x-auto w-full">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                                <th className="py-2.5 px-3">Log ID</th>
                                <th className="py-2.5 px-3">Type</th>
                                <th className="py-2.5 px-3">Target Layer</th>
                                <th className="py-2.5 px-3">Timestamp</th>
                                <th className="py-2.5 px-3">Executed By</th>
                              </tr>
                            </thead>
                            <tbody>
                              {auditLogs.map(log => (
                                <tr key={log._id} className="border-b border-slate-100 dark:border-slate-900/40 hover:bg-slate-200/20 dark:hover:bg-slate-900/10">
                                  <td className="py-2.5 px-3 font-mono text-slate-500">#{log._id.substring(0, 6)}</td>
                                  <td className="py-2.5 px-3 font-bold">
                                    <span className={`px-2 py-0.5 rounded text-[10px] ${log.actionType === 'INSERT' ? 'bg-emerald-500/10 text-emerald-500' : log.actionType === 'UPDATE' ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500'}`}>
                                      {log.actionType}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 uppercase text-slate-500 font-semibold">{log.collectionName}</td>
                                  <td className="py-2.5 px-3 text-slate-400">{log.timestamp}</td>
                                  <td className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">{log.executedBy}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Raw mutations form controls */}
                      <div className="col-span-12 xl:col-span-4 flex flex-col gap-6">
                        <div className="premium-card">
                          <div className="flex border-b border-slate-200 dark:border-slate-850 mb-4 pb-2 text-xs">
                            <button 
                              onClick={() => setActiveFormTab('insert-record')}
                              className={`flex-grow text-center font-bold pb-2 ${activeFormTab === 'insert-record' ? 'border-b-2 border-accent text-accent' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                              Insert Record
                            </button>
                            <button 
                              onClick={() => setActiveFormTab('add-station')}
                              className={`flex-grow text-center font-bold pb-2 ${activeFormTab === 'add-station' ? 'border-b-2 border-accent text-accent' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                              Add Station
                            </button>
                          </div>

                          {activeFormTab === 'insert-record' && (
                            <form onSubmit={handleInsertRecord} className="flex flex-col gap-3">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-bold text-slate-400">Target Station</label>
                                <select
                                  value={formData.station_id}
                                  onChange={(e) => setFormData(p => ({ ...p, station_id: e.target.value }))}
                                  className="form-input-premium bg-slate-100 dark:bg-slate-950"
                                >
                                  {stations.map(st => (
                                    <option key={st._id} value={st._id}>{st.name}</option>
                                  ))}
                                </select>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { name: 'pm25', label: 'PM2.5' },
                                  { name: 'pm10', label: 'PM10' },
                                  { name: 'co', label: 'CO' },
                                  { name: 'no2', label: 'NO2' },
                                  { name: 'so2', label: 'SO2' },
                                  { name: 'o3', label: 'O3' }
                                ].map(inp => (
                                  <div key={inp.name} className="flex flex-col gap-1">
                                    <label className="text-[9px] uppercase font-bold text-slate-400">{inp.label}</label>
                                    <input 
                                      type="number"
                                      step="any"
                                      value={formData[inp.name]}
                                      onChange={(e) => setFormData(p => ({ ...p, [inp.name]: e.target.value }))}
                                      className="form-input-premium w-full bg-slate-100 dark:bg-slate-950"
                                      placeholder="value"
                                      required
                                    />
                                  </div>
                                ))}
                              </div>

                              <button type="submit" className="w-full py-2 bg-accent text-white rounded-xl text-xs font-bold shadow-md hover:bg-accent/80 transition-all flex items-center justify-center gap-1.5 mt-2">
                                <PlusCircle className="w-4 h-4" /> Insert to Atlas mirrored
                              </button>
                            </form>
                          )}

                          {activeFormTab === 'add-station' && (
                            <form onSubmit={handleCreateStation} className="flex flex-col gap-3">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-bold text-slate-400">Station Name</label>
                                <input 
                                  type="text" 
                                  value={stationForm.name}
                                  onChange={(e) => setStationForm(p => ({ ...p, name: e.target.value }))}
                                  className="form-input-premium bg-slate-100 dark:bg-slate-950"
                                  placeholder="Observatory Westminster"
                                  required
                                />
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[9px] uppercase font-bold text-slate-400">City</label>
                                  <input 
                                    type="text" 
                                    value={stationForm.city}
                                    onChange={(e) => setStationForm(p => ({ ...p, city: e.target.value }))}
                                    className="form-input-premium bg-slate-100 dark:bg-slate-950"
                                    placeholder="London"
                                    required
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[9px] uppercase font-bold text-slate-400">Status</label>
                                  <select 
                                    value={stationForm.status}
                                    onChange={(e) => setStationForm(p => ({ ...p, status: e.target.value }))}
                                    className="form-input-premium bg-slate-100 dark:bg-slate-950"
                                  >
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                    <option value="Maintenance">Maintenance</option>
                                  </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[9px] uppercase font-bold text-slate-400">Latitude</label>
                                  <input 
                                    type="number"
                                    step="any"
                                    value={stationForm.latitude}
                                    onChange={(e) => setStationForm(p => ({ ...p, latitude: e.target.value }))}
                                    className="form-input-premium bg-slate-100 dark:bg-slate-950"
                                    placeholder="51.50"
                                    required
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[9px] uppercase font-bold text-slate-400">Longitude</label>
                                  <input 
                                    type="number"
                                    step="any"
                                    value={stationForm.longitude}
                                    onChange={(e) => setStationForm(p => ({ ...p, longitude: e.target.value }))}
                                    className="form-input-premium bg-slate-100 dark:bg-slate-950"
                                    placeholder="-0.12"
                                    required
                                  />
                                </div>
                              </div>

                              <button type="submit" className="w-full py-2 bg-accent text-white rounded-xl text-xs font-bold shadow-md hover:bg-accent/80 transition-all flex items-center justify-center gap-1.5 mt-2">
                                <PlusCircle className="w-4 h-4" /> Add Station Node
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {academicSubTab === 'viva' && (
                    <div className="premium-card">
                      <h3 className="text-md font-bold font-heading mb-4">Database Viva Oral Guide</h3>
                      <VivaMode systemStatus={systemStatus} initialTab="viva-mode" />
                    </div>
                  )}

                </div>
              </div>
            )}

          </div>
        )}
      </main>

      {/* Slide-over Globe Intelligence Drawer Panel */}
      <div className={`fixed top-0 right-0 h-screen w-[420px] bg-white dark:bg-slate-900/98 border-l border-slate-200 dark:border-slate-800 shadow-2xl transition-transform duration-500 z-50 p-6 overflow-y-auto flex flex-col justify-between ${isDetailPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedLocationDetail && (
          <>
            <div className="flex flex-col gap-6">
              
              {/* Drawer Header */}
              <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-850 pb-4">
                <div>
                  <span className="text-[9px] text-accent uppercase font-bold tracking-widest font-heading font-semibold">Location Intelligence</span>
                  <h3 className="text-lg font-bold font-heading text-slate-900 dark:text-white mt-1">{selectedLocationDetail.city}</h3>
                  <span className="text-xs text-slate-400 block mt-0.5">{selectedLocationDetail.stationName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => handleToggleFavorite(selectedLocationDetail)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 transition-colors"
                    title="Toggle Favorite"
                  >
                    <Heart 
                      className={`w-5 h-5 transition-all ${favorites.some(fav => fav.city === selectedLocationDetail.city && fav.country === selectedLocationDetail.country) ? 'text-rose-500 fill-rose-500 scale-110' : 'text-slate-400'}`} 
                    />
                  </button>
                  <button 
                    onClick={() => setIsDetailPanelOpen(false)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Offline Warning Banner */}
              {selectedLocationDetail.offline && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 flex gap-2.5 items-start text-amber-500 font-medium">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <span className="text-[11px] font-bold block">Offline Fallback View</span>
                    <p className="text-[10px] leading-relaxed mt-0.5 text-amber-600">
                      Failed to contact live geocoding APIs. AirPulse loaded historical cache records from <strong>{selectedLocationDetail.lastUpdated || selectedLocationDetail.timestamp}</strong>.
                    </p>
                  </div>
                </div>
              )}

              {/* Radial gauge score display */}
              <div className="premium-card p-5 text-center flex flex-col items-center justify-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase mb-2">Atmospheric AQI</span>
                <div 
                  className="w-24 h-24 rounded-full flex flex-col items-center justify-center border-4 mb-3"
                  style={{ borderColor: selectedLocationDetail.colorCode }}
                >
                  <span className="text-3xl font-extrabold font-number text-slate-900 dark:text-white">{selectedLocationDetail.aqi}</span>
                  <span className="text-[9px] uppercase font-bold text-slate-500 font-heading">{selectedLocationDetail.aqiCategory}</span>
                </div>
                <span className="text-xs text-slate-600 dark:text-slate-400 italic">"{selectedLocationDetail.generalAdvisory}"</span>
              </div>

              {/* Anomaly spike alert */}
              {(() => {
                const anomaly = detectSpikeAnomaly(selectedLocationDetail);
                if (anomaly) {
                  return (
                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex gap-3 items-start animate-pulse">
                      <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-bold text-rose-500 block font-heading">Atmospheric Spike Anomaly!</span>
                        <p className="text-[11px] text-rose-500/90 leading-relaxed mt-1">
                          This station observed a sudden spike. Current AQI ({selectedLocationDetail.aqi}) is <strong>{anomaly.deviation}% higher</strong> than the average of past 3 logs ({anomaly.previousAverage} AQI). Keep windows closed!
                        </p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Weather statistics */}
              {selectedLocationDetail.weather && (
                <div className="premium-card p-4">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-3">Live Weather parameters</span>
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex flex-col gap-1 text-slate-600 dark:text-slate-300 font-semibold">
                      <span>Temp: <span className="font-number">{selectedLocationDetail.weather.temp}°C</span></span>
                      <span>Humidity: <span className="font-number">{selectedLocationDetail.weather.humidity}%</span></span>
                    </div>
                    <div className="text-right">
                      <span className="capitalize block font-mono text-accent font-bold text-xs">{selectedLocationDetail.weather.description}</span>
                      <span className="text-[10px] text-slate-400 font-medium">Station coordinates</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Pollutant levels progress bars */}
              <div className="premium-card p-5">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-4">Pollutant Distributions</span>
                <div className="flex flex-col gap-3">
                  {[
                    { name: 'PM2.5', value: selectedLocationDetail.pollutants?.pm25 || 0, limit: 35, unit: 'µg/m³' },
                    { name: 'PM10', value: selectedLocationDetail.pollutants?.pm10 || 0, limit: 150, unit: 'µg/m³' },
                    { name: 'CO', value: selectedLocationDetail.pollutants?.co || 0, limit: 9, unit: 'mg/m³' },
                    { name: 'NO2', value: selectedLocationDetail.pollutants?.no2 || 0, limit: 80, unit: 'µg/m³' },
                    { name: 'SO2', value: selectedLocationDetail.pollutants?.so2 || 0, limit: 75, unit: 'µg/m³' },
                    { name: 'O3', value: selectedLocationDetail.pollutants?.o3 || 0, limit: 100, unit: 'µg/m³' }
                  ].map(pol => {
                    const pct = Math.min(100, (pol.value / pol.limit) * 100);
                    return (
                      <div key={pol.name} className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-700 dark:text-slate-350">{pol.name}</span>
                          <span className="text-slate-500 font-number">{pol.value} / {pol.limit} <span className="text-[10px] font-normal">{pol.unit}</span></span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-950 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500" 
                            style={{ width: `${pct}%`, backgroundColor: selectedLocationDetail.colorCode }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Empathetic advisory */}
              <div className="premium-card p-5">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-4">Empathetic Health recommendations</span>
                <div className="flex flex-col gap-4">
                  {[
                    { title: 'Children & Kids', text: selectedLocationDetail.aiAdvisory?.children || 'Conditions are safe for standard kids activities.', color: 'text-accent' },
                    { title: 'Elderly Populations', text: selectedLocationDetail.aiAdvisory?.elderly || 'Senior citizens can engage in standard routines.', color: 'text-amber-500' },
                    { title: 'Asthma Patients', text: selectedLocationDetail.aiAdvisory?.asthma || 'Keep rescue inhalers accessible.', color: 'text-red-500' },
                    { title: 'Outdoor Labor Workers', text: selectedLocationDetail.aiAdvisory?.workers || 'Limit exposure during peak midday heat and smog.', color: 'text-emerald-500' }
                  ].map(item => (
                    <div key={item.title} className="text-xs">
                      <span className={`font-bold block mb-1 font-heading ${item.color}`}>{item.title}</span>
                      <p className="text-slate-650 dark:text-slate-350 leading-relaxed">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Report Export Drawer Utilities */}
              <div className="premium-card p-4 flex flex-col gap-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Export Analytics Report</span>
                <div className="flex gap-2">
                  <a 
                    href={`/api/reports/download?format=PDF`} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex-grow py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850/40 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-200 rounded-xl text-center text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 border border-slate-250 dark:border-slate-800"
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-500" /> Export PDF
                  </a>
                  <a 
                    href={`/api/reports/download?format=CSV`} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex-grow py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850/40 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-200 rounded-xl text-center text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 border border-slate-250 dark:border-slate-800"
                  >
                    <Download className="w-3.5 h-3.5 text-sky-400" /> Export CSV
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-850 flex justify-between items-center text-[10px] text-slate-500 font-mono">
              <span>Sensor node: #{selectedLocationDetail._id?.substring(0, 8)}</span>
              <span>Updated: {selectedLocationDetail.timestamp}</span>
            </div>
          </>
        )}
      </div>

      {/* Edit Record Modal popup */}
      {editModalOpen && editRecordData && (
        <div className="fixed inset-0 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[500px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 transform transition-all duration-300 scale-100 flex flex-col gap-4">
            <h3 className="text-md font-bold font-heading text-slate-900 dark:text-slate-100">Edit Pollution Record #{editRecordData.id.substring(0,8)}</h3>
            
            <form onSubmit={handleUpdateRecord} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4 text-xs">
                {[
                  { name: 'pm25', label: 'PM2.5' },
                  { name: 'pm10', label: 'PM10' },
                  { name: 'co', label: 'CO' },
                  { name: 'no2', label: 'NO2' },
                  { name: 'so2', label: 'SO2' },
                  { name: 'o3', label: 'O3' }
                ].map(inp => (
                  <div key={inp.name} className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase">{inp.label}</label>
                    <input 
                      type="number" 
                      step="any"
                      value={editRecordData[inp.name]}
                      onChange={(e) => setEditRecordData(p => ({ ...p, [inp.name]: e.target.value }))}
                      className="form-input-premium bg-slate-100 dark:bg-slate-950 w-full"
                      required
                    />
                  </div>
                ))}
              </div>
              
              <div className="flex justify-end gap-3 mt-4 text-xs">
                <button 
                  type="button" 
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold border border-slate-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-xl font-bold shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
