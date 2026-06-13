"use client";

import { useEffect, useState, useCallback } from "react";
import { Calendar, Gift, Terminal, MapPin, ExternalLink, RefreshCw, AlertTriangle, Beer } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type FeedItem = {
  title: string;
  link: string;
  pubDate: string;
  category: string;
  contentSnippet: string;
};

export default function Home() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchFeeds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/feeds");
      const data = await res.json();
      setItems(data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to fetch feeds", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    let isMounted = true;

    const initFetch = async () => {
      try {
        const res = await fetch("/api/feeds");
        const data = await res.json();
        if (isMounted) {
          setItems(data);
          setLastUpdated(new Date());
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to fetch feeds", error);
        if (isMounted) setLoading(false);
      }
    };

    initFetch();

    const interval = setInterval(() => {
      initFetch();
    }, 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Swag & Goodies":
        return <Gift className="w-5 h-5 text-purple-400" />;
      case "Freebies":
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case "Tech Events":
        return <Calendar className="w-5 h-5 text-blue-400" />;
      case "Hackathons":
        return <Terminal className="w-5 h-5 text-green-400" />;
      case "Nightlife":
        return <Beer className="w-5 h-5 text-pink-400" />;
      default:
        return <MapPin className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans p-4 sm:p-8 selection:bg-cyan-500/30">
      <div className="max-w-7xl mx-auto space-y-8">

        <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-6 gap-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight flex items-center gap-3">
              <Terminal className="w-10 h-10 text-cyan-400" />
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Free Access Hub
              </span>
            </h1>
            <p className="text-gray-400 mt-2 text-lg">
              Real-time aggregation of tech events, hackathons, swag, and freebies.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-gray-900/50 p-3 rounded-xl border border-gray-800">
            <div className="flex flex-col items-end">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Live Status</span>
              <span className="text-sm text-gray-300">
                {lastUpdated ? `Updated ${formatDistanceToNow(lastUpdated)} ago` : 'Waiting...'}
              </span>
            </div>
            <button
              onClick={fetchFeeds}
              className={`p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors border border-gray-700 ${loading ? 'animate-spin opacity-50 cursor-not-allowed' : ''}`}
              disabled={loading}
              title="Force Refresh"
            >
              <RefreshCw className="w-5 h-5 text-cyan-400" />
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-gray-900/80 p-6 rounded-2xl border border-gray-800/50 hover:border-blue-500/30 transition-all duration-300">
             <div className="flex items-center gap-3 mb-4">
                <Calendar className="w-6 h-6 text-blue-400" />
                <h2 className="text-xl font-bold text-white">Big Tech Meetups</h2>
             </div>
             <p className="text-gray-400 text-sm leading-relaxed mb-4">Monitor Luma, Dev.events, and Meetup.com. Look for Generative AI, Full-Stack, and Cloud Native tags. Register early as a &quot;System Engineer&quot; for priority.</p>
          </div>
          <div className="bg-gray-900/80 p-6 rounded-2xl border border-gray-800/50 hover:border-pink-500/30 transition-all duration-300">
             <div className="flex items-center gap-3 mb-4">
                <Beer className="w-6 h-6 text-pink-400" />
                <h2 className="text-xl font-bold text-white">Nightlife & Clubs</h2>
             </div>
             <p className="text-gray-400 text-sm leading-relaxed mb-4">Use apps like HighApe or GuestInMe by Thursday. Arrive by 8:30 PM absolute latest to beat the cover charge cutoff for couples/ladies lists.</p>
          </div>
          <div className="bg-gray-900/80 p-6 rounded-2xl border border-gray-800/50 hover:border-purple-500/30 transition-all duration-300">
             <div className="flex items-center gap-3 mb-4">
                <Gift className="w-6 h-6 text-purple-400" />
                <h2 className="text-xl font-bold text-white">DevRel Swag</h2>
             </div>
             <p className="text-gray-400 text-sm leading-relaxed mb-4">Join beta-testing programs and virtual hackathons (Devpost). Even valid submissions that don&apos;t win often get cloud credits ($50-$100) or physical swag.</p>
          </div>
        </section>

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            Live Intelligence Feed
          </h2>
          <span className="text-sm bg-gray-800 text-gray-300 px-3 py-1 rounded-full border border-gray-700">
            {items.length} intel drops found
          </span>
        </div>

        {loading && items.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse bg-gray-900/50 h-48 rounded-2xl border border-gray-800"></div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item, index) => (
              <a
                key={index}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col bg-gray-900/60 p-6 rounded-2xl border border-gray-800 hover:border-gray-600 hover:bg-gray-800/80 transition-all duration-300 relative overflow-hidden"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2 bg-gray-950 px-3 py-1.5 rounded-full border border-gray-800">
                    {getCategoryIcon(item.category)}
                    <span className="text-xs font-medium text-gray-300">{item.category}</span>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {formatDistanceToNow(new Date(item.pubDate))} ago
                  </span>
                </div>

                <h3 className="text-lg font-bold text-gray-100 mb-3 line-clamp-2 group-hover:text-cyan-400 transition-colors">
                  {item.title}
                </h3>
                <p className="text-sm text-gray-400 line-clamp-3 mb-4 flex-grow">
                  {item.contentSnippet || "No summary available."}
                </p>

                <div className="mt-auto flex items-center text-sm font-semibold text-cyan-500/80 group-hover:text-cyan-400 transition-colors">
                  Access Portal <ExternalLink className="w-4 h-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 transform" />
                </div>
              </a>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
