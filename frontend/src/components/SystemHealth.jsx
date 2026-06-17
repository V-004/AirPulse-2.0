import React from 'react';
import { Database, Network, Activity, ShieldCheck, Clock } from 'lucide-react';

export default function SystemHealth({ systemStatus }) {
  const monitors = [
    {
      title: "Data Engine",
      value: systemStatus.dbStatus,
      status: "Active",
      icon: Database,
      color: "text-sky-400 bg-sky-500/10 border-sky-500/20"
    },
    {
      title: "WebSocket Server",
      value: systemStatus.socketStatus,
      status: systemStatus.socketStatus === 'Connected' ? 'Online' : 'Offline',
      icon: Network,
      color: systemStatus.socketStatus === 'Connected' ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"
    },
    {
      title: "Transaction Logs",
      value: "Auditing Active",
      status: "Encrypted",
      icon: ShieldCheck,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
    },
    {
      title: "Uptime Monitor",
      value: systemStatus.uptime,
      status: "100%",
      icon: Clock,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {monitors.map((mon, idx) => {
        const Icon = mon.icon;
        return (
          <div key={idx} className="glass-panel p-5 flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-heading font-bold">
                {mon.title}
              </span>
              <span className="text-sm font-extrabold font-heading text-slate-200">
                {mon.value}
              </span>
              <span className="text-[10px] font-semibold text-slate-400">
                Uptime status: <strong className="text-slate-300">{mon.status}</strong>
              </span>
            </div>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${mon.color}`}>
              <Icon className="w-5.5 h-5.5" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
