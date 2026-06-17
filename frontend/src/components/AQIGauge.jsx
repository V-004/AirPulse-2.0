import React from 'react';

export default function AQIGauge({ aqi = 0, category = 'Good', color = '#10b981' }) {
  const numericAqi = isNaN(Number(aqi)) ? 0 : Number(aqi);
  const radius = 60;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  
  // AQI scale spans from 0 to 500
  const percentage = Math.min(100, (numericAqi / 500) * 100);
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center premium-card h-full min-h-[240px]">
      <div className="relative w-40 h-40 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 140 140">
          {/* Background track circle */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            className="text-slate-200 dark:text-slate-800"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            opacity={0.15}
          />
          {/* Dynamic colored progress circle */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Center reading value */}
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-heading">AQI INDEX</span>
          <span className="text-4xl font-extrabold font-number my-0.5 tracking-tighter" style={{ color }}>
            {numericAqi}
          </span>
          <span 
            className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}15`, color: color }}
          >
            {category}
          </span>
        </div>
      </div>
    </div>
  );
}
