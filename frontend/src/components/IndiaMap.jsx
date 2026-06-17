import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix leaflet icon asset paths in React Vite setups
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Helper component to pan Leaflet map dynamically
function MapController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] !== undefined) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

// Helper to create colored custom div icons for Leaflet markers based on AQI color
const createCustomIcon = (color) => {
  return new L.DivIcon({
    html: `<div class="w-4 h-4 rounded-full border border-white/60 shadow-lg animate-ping absolute opacity-75" style="background-color: ${color}"></div>
           <div class="w-4 h-4 rounded-full border-2 border-white shadow-lg relative" style="background-color: ${color}"></div>`,
    className: 'custom-leaflet-marker',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
};

export default function IndiaMap({ latestReadings = [], activeCoordinates = [25.0, 35.0], onSelectLocation, theme = 'aurora' }) {
  const centerPosition = activeCoordinates || [25.0, 35.0];
  const zoomLevel = activeCoordinates && activeCoordinates[0] !== 25.0 ? 5 : 2;

  const tileUrl = theme === 'light'
    ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  return (
    <div className="w-full h-full relative flex flex-col p-4 bg-slate-950/5 dark:bg-slate-950/10 min-h-[300px]">
      <div className="mb-3 flex justify-between items-center shrink-0">
        <h3 className="text-sm font-heading text-slate-400 font-bold">Spatial 2D Fallback Map</h3>
        <span className="text-[10px] text-slate-400 font-semibold uppercase font-number">OSM Engine</span>
      </div>
      
      <div className="flex-grow w-full rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-800/40">
        <MapContainer 
          center={centerPosition} 
          zoom={zoomLevel} 
          scrollWheelZoom={true} 
          className="w-full h-full"
        >
          <MapController center={centerPosition} zoom={zoomLevel} />
          
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url={tileUrl}
          />
          
          {latestReadings.map(rec => {
            const lat = Number(rec.latitude);
            const lng = Number(rec.longitude);
            
            if (isNaN(lat) || isNaN(lng)) return null;
            
            return (
              <Marker 
                key={rec._id} 
                position={[lat, lng]} 
                icon={createCustomIcon(rec.colorCode || '#38bdf8')}
                eventHandlers={{
                  click: () => {
                    if (onSelectLocation) {
                      onSelectLocation(rec);
                    }
                  }
                }}
              >
                <Popup className="custom-popup-theme">
                  <div className="p-2 font-body" style={{ color: theme === 'light' ? '#0f172a' : '#f8fafc' }}>
                    <h4 className="font-extrabold text-sm border-b pb-1 mb-1 font-heading">{rec.stationName}</h4>
                    <div className="text-[10px] text-slate-500 mb-2 uppercase font-bold">{rec.city}</div>
                    
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold">Latest AQI:</span>
                      <span 
                        className="px-2 py-0.5 rounded text-xs font-bold text-white shadow-sm font-number"
                        style={{ backgroundColor: rec.colorCode }}
                      >
                        {rec.aqi} ({rec.aqiCategory})
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] border-t pt-1.5 text-slate-400 font-mono">
                      <div>PM2.5: <strong className="font-number">{rec.pollutants.pm25}</strong></div>
                      <div>PM10: <strong className="font-number">{rec.pollutants.pm10}</strong></div>
                      <div>CO: <strong className="font-number">{rec.pollutants.co}</strong></div>
                      <div>O3: <strong className="font-number">{rec.pollutants.o3}</strong></div>
                    </div>
                    {rec.weather && (
                      <div className="border-t mt-1.5 pt-1.5 text-[9px] text-slate-400 font-mono">
                        Temp: <strong className="font-number">{rec.weather.temp}°C</strong> | Humidity: <strong className="font-number">{rec.weather.humidity}%</strong> | <span className="capitalize">{rec.weather.description}</span>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
