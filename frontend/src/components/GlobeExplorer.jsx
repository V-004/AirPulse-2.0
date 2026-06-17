import React, { useEffect, useState, useRef } from 'react';
import Globe from 'react-globe.gl';

export default function GlobeExplorer({ latestReadings = [], onSelectLocation, theme = 'aurora' }) {
  const [countries, setCountries] = useState({ features: [] });
  const globeRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 500, height: 350 });

  // Update dimensions responsively
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: Math.max(200, entry.contentRect.width),
          height: Math.max(200, entry.contentRect.height)
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Atmospheric glow color mapping
  const getThemeGlowColor = () => {
    if (theme === 'emerald') return '#10b981';
    if (theme === 'aurora') return '#8b5cf6';
    if (theme === 'light') return '#475569';
    return '#3b82f6'; // blue default
  };

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson')
      .then(res => {
        if (!res.ok) throw new Error('Failed loading world maps');
        return res.json();
      })
      .then(data => setCountries(data))
      .catch(err => console.warn("Could not retrieve world shapes, mapping pins standalone. Error:", err));
  }, []);

  useEffect(() => {
    if (globeRef.current) {
      globeRef.current.controls().autoRotate = true;
      globeRef.current.controls().autoRotateSpeed = 0.45;
    }
  }, []);

  const pointsData = latestReadings.map(rec => {
    const lat = Number(rec.latitude);
    const lng = Number(rec.longitude);
    return {
      lat,
      lng,
      size: 0.16,
      color: rec.colorCode || '#3b82f6',
      name: `${rec.stationName} (${rec.city})`,
      aqi: rec.aqi,
      category: rec.aqiCategory,
      rawRecord: rec
    };
  });

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-slate-950/5 dark:bg-slate-950/10 min-h-[300px]">
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        globeColor={theme === 'light' ? '#cbd5e1' : '#0f172a'}
        showAtmosphere={true}
        atmosphereColor={getThemeGlowColor()}
        atmosphereAltitude={0.25}
        
        // Polygons configuration for countries
        polygonsData={countries.features}
        polygonCapColor={() => theme === 'light' ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.04)'}
        polygonStrokeColor={() => theme === 'light' ? 'rgba(15, 23, 42, 0.15)' : 'rgba(255, 255, 255, 0.1)'}
        polygonSideColor={() => 'rgba(0, 0, 0, 0)'}
        polygonAltitude={0.005}
        onPolygonClick={(polygon) => {
          const countryName = polygon.properties.name;
          if (onSelectLocation && countryName) {
            onSelectLocation({ isSearch: true, term: countryName });
          }
        }}

        // AQI labels configurations
        labelsData={pointsData}
        labelLat={d => d.lat}
        labelLng={d => d.lng}
        labelText={d => `● ${d.aqi}`}
        labelColor={d => d.color}
        labelSize={1.5}
        labelDotRadius={0.4}
        onLabelClick={(label) => {
          if (onSelectLocation && label.rawRecord) {
            onSelectLocation(label.rawRecord);
          }
        }}
        labelResolution={2}

        // Station points configurations
        pointsData={pointsData}
        pointColor={d => d.color}
        pointAltitude={0.04}
        pointRadius={0.25}
        onPointClick={(point) => {
          if (onSelectLocation && point.rawRecord) {
            onSelectLocation(point.rawRecord);
          }
        }}
      />
    </div>
  );
}
