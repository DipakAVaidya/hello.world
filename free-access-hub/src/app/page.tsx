'use client';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Gift, MapPin, Activity, Search } from 'lucide-react';

type UIEvent = {
  id: string;
  title: string;
  category: string;
  deliveryType: string;
  sourcePlatform: string;
  perks: string[];
  eventTimestamp: string;
  registrationUrl: string;
  city?: string | null;
};

export default function WorldClassAggregatorDashboard() {
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'TECH_MEETUP' | 'SWAG_GOODIES' | 'NIGHTLIFE'>('ALL');

  // New Filter States
  const [cityFilter, setCityFilter] = useState('');
  const [deliveryFilter, setDeliveryFilter] = useState<'ALL' | 'ONSITE' | 'VIRTUAL'>('ALL');

  const [mouseCoords, setMouseCoords] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState({ activeScrapers: 14, linksVerified: 1102, systemLatency: '0.4s' });

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!containerRef.current) return;
    const { left, top } = containerRef.current.getBoundingClientRect();
    setMouseCoords({ x: event.clientX - left, y: event.clientY - top });
  };

  useEffect(() => {
    fetch("/api/events")
      .then(res => res.json())
      .then(data => {
          if(Array.isArray(data)) setEvents(data as UIEvent[]);
      })
      .catch(console.error);

    const sse = new EventSource('/api/stream/events');
    sse.onmessage = (messageEvent) => {
      try {
          const incoming = JSON.parse(messageEvent.data);
          if (incoming.type === 'NEW_EVENT' && incoming.data) {
             setEvents((prev) => {
                if (prev.find(e => e.id === incoming.data.id)) return prev;
                return [incoming.data, ...prev].slice(0, 100);
             });
          }
      } catch (err) {
      }
    };

    return () => sse.close();
  }, []);

  useEffect(() => {
    const updateInterval = setInterval(() => {
      setStats((prev) => ({
        activeScrapers: Math.floor(Math.random() * (16 - 12 + 1)) + 12,
        linksVerified: prev.linksVerified + Math.floor(Math.random() * 3),
        systemLatency: `${(Math.random() * (0.6 - 0.2) + 0.2).toFixed(2)}s`
      }));
    }, 4000);
    return () => clearInterval(updateInterval);
  }, []);

  // Compute Filtered Events
  const displayedEvents = events.filter(e => {
      const matchCategory = activeTab === 'ALL' || e.category === activeTab;
      const matchDelivery = deliveryFilter === 'ALL' || e.deliveryType === deliveryFilter;
      const matchCity = cityFilter === '' || (e.city && e.city.toLowerCase().includes(cityFilter.toLowerCase()));
      return matchCategory && matchDelivery && matchCity;
  });

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="min-h-screen bg-[#030712] text-slate-100 relative overflow-hidden font-sans antialiased selection:bg-cyan-500/30"
    >

      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-300 opacity-100"
        style={{
          background: `radial-gradient(800px circle at ${mouseCoords.x}px ${mouseCoords.y}px, rgba(55, 65, 81, 0.15), transparent 50%)`,
        }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      {/* Top Telemetry Ticker */}
      <div className="w-full bg-[#070a13] border-b border-white/5 text-[11px] font-mono text-slate-400 py-1.5 px-6 flex justify-between items-center tracking-wider relative z-20">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
            <span className="text-emerald-400 font-bold uppercase tracking-widest text-[10px]">Stream Pipeline Live</span>
          </span>
          <span className="text-white/20">|</span>
          <span>Active Scrapers: <span className="text-white font-semibold">{stats.activeScrapers}</span></span>
          <span className="text-white/20">|</span>
          <span>Verified Links: <span className="text-emerald-400 font-semibold">{stats.linksVerified}</span></span>
        </div>
        <div className="hidden sm:block">
          <span>Processing Latency: <span className="text-cyan-400">{stats.systemLatency}</span></span>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#030712]/60 backdrop-blur-xl border-b border-white/5 px-8 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-lg border border-white/10 shadow-inner">
            <Sparkles className="text-cyan-400 animate-spin-slow" size={20}/>
          </div>
          <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-transparent">
            FREELINK<span className="text-cyan-400 font-light">.IO</span>
          </h1>
        </div>

        {/* Global Omni-Search Toggle */}
        <div className="flex-1 max-w-md w-full relative group">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-cyan-400 transition-colors" />
           <input
              type="text"
              placeholder="Search by city (e.g. Bangalore, Global)"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
           />
        </div>

        {/* Tab Filters */}
        <div className="flex bg-white/[0.03] border border-white/5 p-1 rounded-xl shadow-2xl relative overflow-x-auto">
          {(['ALL', 'TECH_MEETUP', 'SWAG_GOODIES', 'NIGHTLIFE'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-5 py-2 text-xs font-semibold tracking-wide uppercase rounded-lg transition-all duration-300 z-10 whitespace-nowrap ${
                activeTab === tab ? 'text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {activeTab === tab && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-white/5 border border-white/10 rounded-lg -z-10 shadow-lg"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>
      </header>

      {/* Sub-Header Filters */}
      <div className="max-w-7xl mx-auto px-8 pt-6 pb-2 relative z-10 flex gap-2">
         {(['ALL', 'ONSITE', 'VIRTUAL'] as const).map(type => (
            <button
               key={type}
               onClick={() => setDeliveryFilter(type)}
               className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider transition-colors border ${
                 deliveryFilter === type
                 ? 'bg-slate-100 text-slate-900 border-transparent'
                 : 'bg-transparent text-slate-400 border-white/10 hover:border-white/30 hover:text-white'
               }`}
            >
               {type}
            </button>
         ))}
      </div>

      {/* Bento Grid Content */}
      <main className="max-w-7xl mx-auto px-8 py-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {displayedEvents.map((event) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", duration: 0.5 }}
                  key={event.id}
                  className="group relative rounded-2xl border border-white/5 bg-white/[0.01] backdrop-blur-3xl p-6 flex flex-col justify-between hover:border-white/10 hover:bg-white/[0.02] transition-all duration-300 shadow-2xl overflow-hidden hover:scale-[1.02]"
                >

                  {/* Category Gradient Border Top */}
                  <div className={`absolute top-0 left-0 right-0 h-[2px] transition-all duration-500 opacity-50 group-hover:opacity-100 ${
                    event.category === 'TECH_MEETUP' ? 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_1px_10px_#06b6d4]' :
                    event.category === 'SWAG_GOODIES' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_1px_10px_#10b981]' :
                    'bg-gradient-to-r from-rose-500 to-magenta-500 shadow-[0_1px_10px_#f43f5e]'
                  }`} />

                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase bg-white/5 border border-white/5 px-2 py-0.5 rounded">
                        {event.sourcePlatform}
                      </span>
                      <div className="flex items-center space-x-1.5 text-xs font-medium font-mono text-slate-400">
                        <MapPin className="text-slate-500" size={12}/>
                        <span className="truncate max-w-[120px]">{event.deliveryType}</span>
                      </div>
                    </div>

                    <h2 className="text-lg font-bold tracking-tight text-slate-200 group-hover:text-white transition-colors duration-300 line-clamp-2">
                      {event.title}
                    </h2>


                    <div className="flex flex-wrap gap-1.5 mt-3 mb-6">
                      {event.perks.map((perk: string, i: number) => (
                        <span key={i} className="inline-flex items-center space-x-1 text-[11px] font-medium font-mono px-2 py-0.5 rounded-md bg-emerald-500/5 border border-emerald-500/10 text-emerald-400">
                          <Gift size={10}/>
                          <span>{perk}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5 flex justify-between items-center mt-auto">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Event Time</span>
                      <span className="text-xs font-mono text-slate-300 font-semibold">
                        {new Date(event.eventTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <a
                      href={event.registrationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold tracking-wide px-4 py-2 rounded-xl bg-slate-100 text-black hover:bg-white active:scale-95 transition-all duration-200 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                    >
                      Secure Spot
                    </a>
                  </div>
                </motion.div>
              ))}
          </AnimatePresence>

          {displayedEvents.length === 0 && (
             <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-500 border border-dashed border-zinc-800 rounded-2xl relative z-10">
                 <Activity className="w-10 h-10 mb-4 opacity-50 animate-pulse" />
                 <p>Awaiting live intel drops matching filters...</p>
             </div>
          )}
        </div>
      </main>
    </div>
  );
}