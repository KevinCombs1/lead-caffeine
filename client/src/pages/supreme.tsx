import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Square, Loader2, Download, Search, MapPin, Globe, Crosshair, Layers, Upload, Copy, Check, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SupremeCompany {
  id: string;
  jobId: string;
  line: string;
  name: string | null;
  website: string | null;
  normalizedUrl: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  category: string | null;
  source: string | null;
  sourceUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeSource: string | null;
  geocodeConfidence: number | null;
  radiusYards: number | null;
  radiusMiles: number | null;
  radiusKm: number | null;
  metaRadiusMiles: number | null;
  pinQuery: string | null;
  status: string;
  error: string | null;
  createdAt: string | null;
}

interface SupremeJob {
  id: string;
  line: string;
  status: string;
  params: any;
  totalCombos: number;
  completedCombos: number;
  companiesFound: number;
  totalWebsites: number;
  geocodedCount: number;
  failedCount: number;
  shouldStop: boolean;
  startedAt: string;
  completedAt: string | null;
}

interface Capabilities {
  flaresolverr: boolean;
  googlePlaces: boolean;
  scraperCount: number;
  scraperKeys: string[];
}

type Tab = "line1" | "line2";

export default function SupremePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("line1");

  // ── Status polling ──
  const { data: status } = useQuery<{ active: any; recentJobs: SupremeJob[] }>({
    queryKey: ["/api/supreme/status"],
    queryFn: () => fetch("/api/supreme/status", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 3000,
  });

  // ── Capabilities ──
  const { data: caps } = useQuery<Capabilities>({
    queryKey: ["/api/supreme/capabilities"],
    queryFn: () => fetch("/api/supreme/capabilities", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const isActive = status?.active;
  const activeLine = status?.active?.line;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Parallel Supreme</h1>
            <p className="text-xs text-gray-500">
              Geofence advertising engine — discover companies, pin exact coordinates, export to Meta Ads Manager in bulk
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <div className="flex items-center gap-1">
              <Globe className="w-3 h-3" />
              <span>{caps?.scraperCount ?? 0} scrapers</span>
            </div>
            <div className={`flex items-center gap-1 ${caps?.flaresolverr ? "text-green-400" : "text-gray-600"}`}>
              <Crosshair className="w-3 h-3" />
              <span>FlareSolverr {caps?.flaresolverr ? "ON" : "OFF"}</span>
            </div>
            <div className={`flex items-center gap-1 ${caps?.googlePlaces ? "text-green-400" : "text-gray-600"}`}>
              <MapPin className="w-3 h-3" />
              <span>Google Places {caps?.googlePlaces ? "ON" : "OFF"}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          <button
            onClick={() => setTab("line1")}
            disabled={isActive}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors disabled:opacity-30 ${
              tab === "line1" ? "bg-indigo-900 text-indigo-300" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Line 1 — Keyword Discovery
          </button>
          <button
            onClick={() => setTab("line2")}
            disabled={isActive}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors disabled:opacity-30 ${
              tab === "line2" ? "bg-indigo-900 text-indigo-300" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Line 2 — Geocode & Pin
          </button>
        </div>
      </div>

      {/* Tab content */}
      {tab === "line1" ? (
        <Line1Tab isActive={!!isActive} activeLine={activeLine} />
      ) : (
        <Line2Tab isActive={!!isActive} activeLine={activeLine} caps={caps} />
      )}
    </div>
  );
}

// ── LINE 1 TAB ──────────────────────────────────────────────────────────────
function Line1Tab({ isActive: _parentActive, activeLine: _parentActiveLine }: { isActive: boolean; activeLine?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [locations, setLocations] = useState<Array<{ city: string; state: string }>>([]);
  const [cityInput, setCityInput] = useState("");
  const [stateInput, setStateInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [maxResults, setMaxResults] = useState(50000);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [viewJobId, setViewJobId] = useState<string | null>(null);
  const [justStarted, setJustStarted] = useState(false);
  const [selectedScrapers, setSelectedScrapers] = useState<string[]>(["googlesearch", "yellowpages"]);
  const [viewAllRuns, setViewAllRuns] = useState(false);
  const limit = 50;

  // Local status poll — source of truth for active state within the tab
  const { data: status } = useQuery<{ active: any; recentJobs: SupremeJob[] }>({
    queryKey: ["/api/supreme/status"],
    queryFn: () => fetch("/api/supreme/status", { credentials: "include" }).then(r => r.json()),
    refetchInterval: justStarted ? 1000 : 3000,
  });

  const serverActive = status?.active?.line === "line1";
  const isRunning = serverActive || justStarted;

  // Fetch capabilities for scraper list
  const { data: caps } = useQuery<Capabilities>({
    queryKey: ["/api/supreme/capabilities"],
    queryFn: () => fetch("/api/supreme/capabilities", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
  });

  // Scraper metadata: which ones work, what they do
  const SCRAPER_INFO: Record<string, { label: string; desc: string; working: boolean }> = {
    googlesearch: { label: "Google Search", desc: "Google Places + organic search via Serper — names, websites, addresses, phones, coords", working: true },
    yellowpages: { label: "Yellow Pages", desc: "Google search for YellowPages listings — names, phones, addresses", working: true },
    superpages: { label: "Superpages", desc: "Directory — often blocked by Cloudflare", working: false },
    mapquest: { label: "MapQuest", desc: "JS-rendered — not scrapable", working: false },
    hotfrog: { label: "Hotfrog", desc: "Returns 404", working: false },
    ezlocal: { label: "EZLocal", desc: "Often blocked by Cloudflare", working: false },
    n49: { label: "N49", desc: "Returns 404", working: false },
    yelp: { label: "Yelp", desc: "Requires API key", working: false },
    bbb: { label: "BBB", desc: "CAPTCHA protected", working: false },
    angi: { label: "Angi", desc: "Requires auth", working: false },
    clutch: { label: "Clutch", desc: "Cloudflare protected", working: false },
    manta: { label: "Manta", desc: "Cloudflare protected", working: false },
    chamberofcommerce: { label: "Chamber of Commerce", desc: "CAPTCHA protected", working: false },
    kompass: { label: "Kompass", desc: "DataDome protected", working: false },
    europages: { label: "Europages", desc: "International directory — European companies", working: true },
    yell: { label: "Yell (UK)", desc: "Cloudflare protected", working: false },
    cylex: { label: "Cylex", desc: "Cloudflare protected", working: false },
    tradekey: { label: "TradeKey", desc: "Dead — 410 Gone", working: false },
    exporthub: { label: "ExportHub", desc: "Dead — 404", working: false },
    go4worldbusiness: { label: "Go4WorldBusiness", desc: "Blocked — 403", working: false },
    tradeford: { label: "TradeFord", desc: "Cloudflare protected", working: false },
    tradeindia: { label: "TradeIndia", desc: "Cloudflare protected", working: false },
    madeinchina: { label: "Made-in-China", desc: "Requires auth", working: false },
    indiamart: { label: "IndiaMart", desc: "Requires auth", working: false },
    ec21: { label: "EC21", desc: "Cloudflare protected", working: false },
    globalsources: { label: "GlobalSources", desc: "Cloudflare protected", working: false },
    wlw: { label: "WLW", desc: "German directory — limited results", working: false },
  };

  const toggleScraper = (key: string) => {
    setSelectedScrapers(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const allScrapers = caps?.scraperKeys ?? Object.keys(SCRAPER_INFO);

  useEffect(() => {
    if (serverActive && justStarted) {
      setJustStarted(false);
    }
  }, [serverActive, justStarted]);

  useEffect(() => {
    if (!viewJobId) {
      const line1Jobs = status?.recentJobs?.filter(j => j.line === "line1") ?? [];
      if (line1Jobs.length > 0) {
        setViewJobId(line1Jobs[0].id);
      }
    }
  }, [status?.recentJobs]);

  const displayJobId = serverActive ? status?.active?.jobId : viewJobId;

  // Log poll for active job
  const { data: logData } = useQuery<{ log: string[] }>({
    queryKey: ["/api/supreme/log", displayJobId],
    queryFn: () => displayJobId ? fetch(`/api/supreme/log/${displayJobId}`, { credentials: "include" }).then(r => r.json()) : { log: [] },
    enabled: !!displayJobId,
    refetchInterval: isRunning ? 2000 : 5000,
  });

  // Companies for display — show all runs when not actively running and viewAllRuns is on
  const companiesJobId = isRunning ? displayJobId : (viewAllRuns ? undefined : displayJobId);
  const qs = new URLSearchParams({ line: "line1", page: String(page), limit: String(limit) });
  if (companiesJobId) qs.set("jobId", companiesJobId);
  if (search) qs.set("search", search);
  const { data: companiesData, isLoading } = useQuery<{ companies: SupremeCompany[]; total: number }>({
    queryKey: ["/api/supreme/companies", qs.toString()],
    queryFn: () => fetch(`/api/supreme/companies?${qs}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!displayJobId || viewAllRuns,
    refetchInterval: isRunning ? 3000 : 15000,
  });

  // Source stats — per-scraper yield (all runs or current job)
  const { data: sourceStats } = useQuery<Array<{ source: string; total: number; withWebsite: number; withAddress: number; withPhone: number; withCoords: number }>>({
    queryKey: ["/api/supreme/source-stats", companiesJobId],
    queryFn: () => fetch(`/api/supreme/source-stats${companiesJobId ? `?jobId=${companiesJobId}` : ""}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!displayJobId || viewAllRuns,
    refetchInterval: isRunning ? 3000 : 15000,
  });

  const addLocation = () => {
    if (!cityInput.trim() || !stateInput.trim()) return;
    const exists = locations.some(l => l.city.toLowerCase() === cityInput.trim().toLowerCase() && l.state.toLowerCase() === stateInput.trim().toLowerCase());
    if (!exists) {
      setLocations([...locations, { city: cityInput.trim(), state: stateInput.trim().toUpperCase() }]);
    }
    setCityInput("");
    setStateInput("");
  };

  const removeLocation = (idx: number) => {
    setLocations(locations.filter((_, i) => i !== idx));
  };

  const addKeyword = () => {
    if (!keywordInput.trim()) return;
    if (!keywords.includes(keywordInput.trim())) {
      setKeywords([...keywords, keywordInput.trim()]);
    }
    setKeywordInput("");
  };

  const removeKeyword = (idx: number) => {
    setKeywords(keywords.filter((_, i) => i !== idx));
  };

  const startLine1 = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/supreme/line1/start", {
        locations,
        keywords,
        maxResults,
        scraperKeys: selectedScrapers.length > 0 ? selectedScrapers : undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Line 1 started!", description: `Job ${data.jobId.slice(0, 8)} — discovering companies` });
      setViewJobId(data.jobId);
      setJustStarted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/supreme/status"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const stopJob = useMutation({
    mutationFn: () => apiRequest("POST", "/api/supreme/stop"),
    onSuccess: () => {
      toast({ title: "Stopping..." });
      queryClient.invalidateQueries({ queryKey: ["/api/supreme/status"] });
    },
  });

  const totalPages = companiesData ? Math.ceil(companiesData.total / limit) : 1;

  return (
    <div className="p-4 space-y-4">
      {/* Controls */}
      <div className="border border-gray-700 rounded-lg bg-gray-900 p-4 space-y-4">
        {/* Locations */}
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Locations (City, State)</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="City"
              value={cityInput}
              onChange={e => setCityInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && stateInput && addLocation()}
              className="flex-1 text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
              disabled={isRunning}
            />
            <input
              type="text"
              placeholder="State (e.g. TX)"
              value={stateInput}
              onChange={e => setStateInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addLocation()}
              className="w-24 text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 uppercase"
              disabled={isRunning}
            />
            <button onClick={addLocation} disabled={isRunning || !cityInput || !stateInput} className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-30">
              Add
            </button>
          </div>
          {locations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {locations.map((loc, i) => (
                <span key={i} className="flex items-center gap-1 text-[11px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300">
                  {loc.city}, {loc.state}
                  <button onClick={() => removeLocation(i)} disabled={isRunning} className="text-gray-500 hover:text-red-400 disabled:opacity-30">✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Keywords */}
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Industry / Custom Keywords</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="e.g. HVAC, dental, roofing, restaurants..."
              value={keywordInput}
              onChange={e => setKeywordInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addKeyword()}
              className="flex-1 text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
              disabled={isRunning}
            />
            <button onClick={addKeyword} disabled={isRunning || !keywordInput} className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-30">
              Add
            </button>
          </div>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((kw, i) => (
                <span key={i} className="flex items-center gap-1 text-[11px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-indigo-300">
                  {kw}
                  <button onClick={() => removeKeyword(i)} disabled={isRunning} className="text-gray-500 hover:text-red-400 disabled:opacity-30">✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Scraper sources */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-400 uppercase">Scraper Sources</label>
            <span className="text-[10px] text-gray-500">
              {selectedScrapers.length} active · {allScrapers.length - selectedScrapers.length} inactive
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-52 overflow-y-auto pr-1">
            {allScrapers.map(key => {
              const info = SCRAPER_INFO[key];
              const selected = selectedScrapers.includes(key);
              const working = info?.working ?? false;
              return (
                <button
                  key={key}
                  onClick={() => toggleScraper(key)}
                  disabled={isRunning}
                  title={info?.desc ?? key}
                  className={`text-left text-[11px] rounded px-2.5 py-2 border transition-colors disabled:opacity-40 ${
                    selected
                      ? working
                        ? "bg-emerald-900/40 border-emerald-600 text-emerald-300"
                        : "bg-amber-900/40 border-amber-600 text-amber-300"
                      : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold truncate">{info?.label ?? key}</span>
                    {selected ? (
                      <span className="text-[9px] uppercase tracking-wide font-bold">ON</span>
                    ) : (
                      <span className="text-[9px] uppercase tracking-wide text-gray-600">OFF</span>
                    )}
                  </div>
                  {!working && (
                    <div className="text-[9px] text-gray-600 truncate mt-0.5">{info?.desc ?? "Unknown"}</div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setSelectedScrapers(["googlesearch", "yellowpages"])}
              disabled={isRunning}
              className="text-[10px] px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-gray-200 disabled:opacity-30"
            >
              Reset to defaults
            </button>
            <button
              onClick={() => setSelectedScrapers([])}
              disabled={isRunning}
              className="text-[10px] px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-gray-200 disabled:opacity-30"
            >
              Clear all
            </button>
          </div>
        </div>

        {/* Max results + start */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Max results:</label>
            <input
              type="number"
              value={maxResults}
              onChange={e => setMaxResults(Math.min(50000, Math.max(1, parseInt(e.target.value) || 50000)))}
              disabled={isRunning}
              className="w-24 text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
            />
            <span className="text-[10px] text-gray-500">max 50,000</span>
          </div>

          {!isRunning ? (
            <button
              onClick={() => startLine1.mutate()}
              disabled={startLine1.isPending || locations.length === 0 || keywords.length === 0 || selectedScrapers.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm font-semibold rounded transition-colors"
            >
              {startLine1.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Line 1
            </button>
          ) : (
            <button
              onClick={() => stopJob.mutate()}
              disabled={stopJob.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded ring-2 ring-red-400 animate-pulse"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Inline progress banner — visible when running */}
      {isRunning && (
        <div className="border border-indigo-700 rounded-lg bg-indigo-950/30 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
            <span className="text-sm font-semibold text-white">
              {justStarted ? "Starting Line 1..." : "Line 1 — Discovering..."}
            </span>
            {status?.active?.totalCombos && status.active.totalCombos > 0 ? (
              <span className="text-xs text-gray-400">
                {status.active.completedCombos}/{status.active.totalCombos} combos — {(status.active.companiesFound ?? 0).toLocaleString()} companies found
              </span>
            ) : !justStarted ? (
              <span className="text-xs text-gray-400">
                {(status?.active?.companiesFound ?? 0).toLocaleString()} companies found
              </span>
            ) : null}
          </div>
          {status?.active?.totalCombos && status.active.totalCombos > 0 ? (
            <div className="w-full bg-gray-800 rounded h-2 overflow-hidden">
              <div
                className="bg-indigo-500 h-full transition-all duration-500"
                style={{ width: `${status.active.progress ?? 0}%` }}
              />
            </div>
          ) : null}
          {justStarted && (
            <div className="text-[10px] text-indigo-400">
              Engine initializing — building combo queue and spinning up workers...
            </div>
          )}
        </div>
      )}

      {/* Log panel — visible during run AND after completion */}
      {logData?.log && logData.log.length > 0 && (
        <div className="border border-gray-700 rounded-lg bg-gray-900 p-3 space-y-2">
          <div className="flex items-center gap-2">
            {!isRunning && (
              <span className="text-xs font-semibold text-gray-400">
                Completed — {companiesData?.total?.toLocaleString() ?? 0} companies found
              </span>
            )}
            {isRunning && (
              <span className="text-xs font-semibold text-gray-400">Engine Log</span>
            )}
          </div>
          <div className="bg-black/40 rounded p-2 max-h-40 overflow-y-auto font-mono text-[10px] text-gray-400 space-y-0.5">
            {logData.log.slice(-20).map((line, i) => (
              <div key={i} className={line.includes("+") ? "text-green-400" : line.includes("Error") || line.includes("Timeout") ? "text-red-400" : line.includes("→") ? "text-indigo-400" : line.includes("completed") || line.includes("started") ? "text-amber-400" : "text-gray-500"}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source Stats — per-scraper yield breakdown */}
      {displayJobId && sourceStats && sourceStats.length > 0 && (
        <div className="border border-gray-700 rounded-lg bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300">Source Stats</h2>
            <span className="text-[10px] text-gray-500">per-scraper yield comparison</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[...sourceStats]
              .sort((a, b) => b.total - a.total)
              .map(s => {
                const info = SCRAPER_INFO[s.source];
                const maxTotal = Math.max(...sourceStats.map(x => x.total), 1);
                const barWidth = (s.total / maxTotal) * 100;
                return (
                  <div key={s.source} className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-gray-200">{info?.label ?? s.source}</span>
                      <span className="text-xs font-mono text-gray-400">{s.total}</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mb-2.5">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${barWidth}%` }} />
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-center">
                      <div className="bg-gray-900/50 rounded px-1 py-1.5">
                        <div className="text-[9px] uppercase text-gray-500">Sites</div>
                        <div className="text-xs font-mono text-emerald-400">{s.withWebsite}</div>
                      </div>
                      <div className="bg-gray-900/50 rounded px-1 py-1.5">
                        <div className="text-[9px] uppercase text-gray-500">Addr</div>
                        <div className="text-xs font-mono text-sky-400">{s.withAddress}</div>
                      </div>
                      <div className="bg-gray-900/50 rounded px-1 py-1.5">
                        <div className="text-[9px] uppercase text-gray-500">Phone</div>
                        <div className="text-xs font-mono text-amber-400">{s.withPhone}</div>
                      </div>
                      <div className="bg-gray-900/50 rounded px-1 py-1.5">
                        <div className="text-[9px] uppercase text-gray-500">Pins</div>
                        <div className="text-xs font-mono text-fuchsia-400">{s.withCoords}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Results */}
      {displayJobId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-300">
                Companies {companiesData && `(${companiesData.total.toLocaleString()})`}
                {isRunning && companiesData?.total === 0 && (
                  <span className="text-indigo-400 ml-2 text-xs">— scraping in progress, waiting for first results...</span>
                )}
              </h2>
              {!isRunning && (
                <div className="flex bg-gray-800 border border-gray-700 rounded text-[10px]">
                  <button
                    onClick={() => setViewAllRuns(false)}
                    className={`px-2 py-1 rounded-l ${!viewAllRuns ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-300"}`}
                  >
                    Last run
                  </button>
                  <button
                    onClick={() => setViewAllRuns(true)}
                    className={`px-2 py-1 rounded-r border-l border-gray-700 ${viewAllRuns ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-300"}`}
                  >
                    All runs
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="text-xs bg-gray-800 border border-gray-700 rounded pl-7 pr-2 py-1.5 text-gray-200 w-40"
                />
              </div>
              <a
                href={`/api/supreme/line1/export?jobId=${companiesJobId || ""}`}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-gray-700 bg-gray-800 text-gray-300 hover:text-white"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </a>
              <button
                onClick={() => {
                  toast({ title: "Chain to Line 2", description: "Go to Line 2 tab, select this job as source" });
                }}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-indigo-700 bg-indigo-900/40 text-indigo-300 hover:text-indigo-200"
              >
                <MapPin className="w-3.5 h-3.5" /> Pin All
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            </div>
          ) : companiesData && companiesData.companies.length > 0 ? (
            <div className="overflow-auto max-h-[calc(100vh-450px)] border border-gray-800 rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-900 border-b border-gray-700">
                  <tr className="text-left text-gray-400">
                    <th className="p-2 font-medium">Name</th>
                    <th className="p-2 font-medium">Website</th>
                    <th className="p-2 font-medium">Phone</th>
                    <th className="p-2 font-medium">Address</th>
                    <th className="p-2 font-medium">City</th>
                    <th className="p-2 font-medium">State</th>
                    <th className="p-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {companiesData.companies.map(c => (
                    <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-900">
                      <td className="p-2 text-gray-200">{c.name || "-"}</td>
                      <td className="p-2 text-cyan-400 truncate max-w-[200px]">
                        {c.website ? <a href={c.website} target="_blank" rel="noopener" className="hover:underline">{c.website}</a> : "-"}
                      </td>
                      <td className="p-2 text-blue-400">{c.phone || "-"}</td>
                      <td className="p-2 text-gray-400 truncate max-w-[200px]">{c.address || "-"}</td>
                      <td className="p-2 text-gray-400">{c.city || "-"}</td>
                      <td className="p-2 text-gray-400">{c.state || "-"}</td>
                      <td className="p-2 text-gray-500">{c.source || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : isRunning ? (
            <div className="p-8 text-center text-indigo-400 text-xs space-y-2">
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              <div>Engine is scraping — results will appear here as companies are found.</div>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 text-xs">
              No companies yet. Select locations and keywords, then start Line 1.
            </div>
          )}

          {companiesData && companiesData.total > limit && (
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{companiesData.total.toLocaleString()} total — Page {page}/{totalPages}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded border border-gray-700 disabled:opacity-30">Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded border border-gray-700 disabled:opacity-30">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── LINE 2 TAB ──────────────────────────────────────────────────────────────
function Line2Tab({ isActive: _parentActive, activeLine: _parentActiveLine, caps }: { isActive: boolean; activeLine?: string; caps?: Capabilities }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [websiteText, setWebsiteText] = useState("");
  const [radiusYards, setRadiusYards] = useState(250);
  const [useWebsiteScrape, setUseWebsiteScrape] = useState(true);
  const [useCensus, setUseCensus] = useState(true);
  const [useNominatim, setUseNominatim] = useState(true);
  const [useGooglePlaces, setUseGooglePlaces] = useState(false);
  const [useChromium, setUseChromium] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [viewJobId, setViewJobId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [justStarted, setJustStarted] = useState(false);
  const [inputMode, setInputMode] = useState<"websites" | "addresses">("websites");
  const [onlyWithAddress, setOnlyWithAddress] = useState(false);
  const [dspRadiusFeet, setDspRadiusFeet] = useState(500);
  const [dspRadiusM, setDspRadiusM] = useState(500);
  const [showDspMenu, setShowDspMenu] = useState(false);
  const [parsedAddresses, setParsedAddresses] = useState<Array<{ name?: string; address?: string; city?: string; state?: string; zip?: string; website?: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const limit = 50;

  const { data: status } = useQuery<{ active: any; recentJobs: SupremeJob[] }>({
    queryKey: ["/api/supreme/status"],
    queryFn: () => fetch("/api/supreme/status", { credentials: "include" }).then(r => r.json()),
    refetchInterval: justStarted ? 1000 : 3000,
  });

  const serverActive = status?.active?.line === "line2";
  const isRunning = serverActive || justStarted;

  useEffect(() => {
    if (serverActive && justStarted) {
      setJustStarted(false);
    }
  }, [serverActive, justStarted]);

  useEffect(() => {
    if (!viewJobId) {
      const line2Jobs = status?.recentJobs?.filter(j => j.line === "line2") ?? [];
      if (line2Jobs.length > 0) {
        setViewJobId(line2Jobs[0].id);
      }
    }
  }, [status?.recentJobs]);

  const displayJobId = serverActive ? status?.active?.jobId : viewJobId;

  // Log poll for active job
  const { data: logData } = useQuery<{ log: string[] }>({
    queryKey: ["/api/supreme/log", displayJobId],
    queryFn: () => displayJobId ? fetch(`/api/supreme/log/${displayJobId}`, { credentials: "include" }).then(r => r.json()) : { log: [] },
    enabled: !!displayJobId,
    refetchInterval: isRunning ? 2000 : 5000,
  });

  // Line 1 jobs for chaining
  const line1Jobs = status?.recentJobs?.filter(j => j.line === "line1" && j.companiesFound > 0) ?? [];

  const qs = new URLSearchParams({ jobId: displayJobId || "", line: "line2", page: String(page), limit: String(limit) });
  if (search) qs.set("search", search);
  const { data: companiesData, isLoading } = useQuery<{ companies: SupremeCompany[]; total: number }>({
    queryKey: ["/api/supreme/companies", qs.toString()],
    queryFn: () => fetch(`/api/supreme/companies?${qs}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!displayJobId,
    refetchInterval: isRunning ? 3000 : 15000,
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;

      // Try to parse as CSV (same format as Line 1 CSV export)
      if (text.includes("Name,") || text.includes("Address,") || text.includes("Website,")) {
        try {
          const addrs = parseCsvToAddresses(text);
          if (addrs.length > 0) {
            setParsedAddresses(addrs);
            setInputMode("addresses");
            toast({ title: "CSV loaded", description: `${addrs.length} addresses parsed — geocoding from address mode` });
            return;
          }
        } catch { /* fall through to plain text */ }
      }

      // Plain text — treat as website list
      setWebsiteText(text);
      setInputMode("websites");
      toast({ title: "File loaded", description: `${text.split("\n").filter(l => l.trim()).length} lines` });
    };
    reader.readAsText(file);
  };

  // Parse CSV (Line 1 export format) into address objects
  function parseCsvToAddresses(csv: string): Array<{ name?: string; address?: string; city?: string; state?: string; zip?: string; website?: string }> {
    const lines = csv.split("\n").filter(l => l.trim());
    if (lines.length < 2) return [];

    // Parse header to find column indices
    const header = lines[0].split(",").map(h => h.trim().toLowerCase());
    const colIdx: Record<string, number> = {};
    header.forEach((h, i) => { colIdx[h] = i; });

    const results: Array<{ name?: string; address?: string; city?: string; state?: string; zip?: string; website?: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      // Simple CSV split (handles basic quoting)
      const cols = lines[i].match(/("([^"]*)"|[^,]*)(,|$)/g)?.map(c => c.replace(/,$/, "").replace(/^"|"$/g, "")) ?? lines[i].split(",");
      const name = colIdx["name"] !== undefined ? cols[colIdx["name"]]?.trim() : undefined;
      const address = colIdx["address"] !== undefined ? cols[colIdx["address"]]?.trim() : undefined;
      const city = colIdx["city"] !== undefined ? cols[colIdx["city"]]?.trim() : undefined;
      const state = colIdx["state"] !== undefined ? cols[colIdx["state"]]?.trim() : undefined;
      const zip = colIdx["zip"] !== undefined ? cols[colIdx["zip"]]?.trim() : undefined;
      const website = colIdx["website"] !== undefined ? cols[colIdx["website"]]?.trim() : undefined;

      // Must have at least an address or city to be useful
      if (address || city) {
        results.push({
          name: name || undefined,
          address: address || undefined,
          city: city || undefined,
          state: state || undefined,
          zip: zip || undefined,
          website: website || undefined,
        });
      }
    }
    return results;
  }

  const startLine2 = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/supreme/line2/start", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Line 2 started!", description: `Job ${data.jobId.slice(0, 8)} — geocoding & pinning` });
      setViewJobId(data.jobId);
      setJustStarted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/supreme/status"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const stopJob = useMutation({
    mutationFn: () => apiRequest("POST", "/api/supreme/stop"),
    onSuccess: () => {
      toast({ title: "Stopping..." });
      queryClient.invalidateQueries({ queryKey: ["/api/supreme/status"] });
    },
  });

  const handleStart = (sourceJobId?: string) => {
    const websites = websiteText.split("\n").map(w => w.trim()).filter(w => w.length > 0);
    if (!sourceJobId && inputMode === "websites" && websites.length === 0) {
      toast({ title: "Error", description: "Paste websites or upload a file", variant: "destructive" });
      return;
    }
    if (!sourceJobId && inputMode === "addresses" && parsedAddresses.length === 0) {
      toast({ title: "Error", description: "Upload a CSV with addresses to use this mode", variant: "destructive" });
      return;
    }
    startLine2.mutate({
      websites: sourceJobId || inputMode === "addresses" ? [] : websites,
      addresses: inputMode === "addresses" ? parsedAddresses : undefined,
      radiusYards,
      useWebsiteScrape,
      useCensus,
      useNominatim,
      useGooglePlaces,
      useChromium,
      sourceJobId,
      onlyWithAddress,
    });
  };

  const copyPins = async () => {
    if (!displayJobId) return;
    try {
      const resp = await fetch(`/api/supreme/line2/export/json?jobId=${displayJobId}`, { credentials: "include" });
      const data = await resp.json();
      const pins = data.targeting.custom_locations.map((l: any) => l.pinQuery).join("\n");
      await navigator.clipboard.writeText(pins);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied!", description: `${data.total_locations} coordinate pins copied to clipboard` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const totalPages = companiesData ? Math.ceil(companiesData.total / limit) : 1;
  const yardsToMiles = (yards: number) => (yards / 1760).toFixed(2);

  return (
    <div className="p-4 space-y-4">
      {/* Controls */}
      <div className="border border-gray-700 rounded-lg bg-gray-900 p-4 space-y-4">
        {/* Input mode toggle */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs font-semibold text-gray-400 uppercase">Input</label>
            <div className="flex bg-gray-800 border border-gray-700 rounded text-[10px]">
              <button
                onClick={() => { setInputMode("websites"); setParsedAddresses([]); }}
                disabled={isRunning}
                className={`px-3 py-1 rounded-l ${inputMode === "websites" ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-300"}`}
              >
                Websites
              </button>
              <button
                onClick={() => setInputMode("addresses")}
                disabled={isRunning}
                className={`px-3 py-1 rounded-r border-l border-gray-700 ${inputMode === "addresses" ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-300"}`}
              >
                Addresses (CSV)
              </button>
            </div>
          </div>

          {inputMode === "websites" ? (
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">
                Company Websites (one per line, up to 50,000)
              </label>
              <div className="flex gap-2 mb-2">
                <textarea
                  value={websiteText}
                  onChange={e => setWebsiteText(e.target.value)}
                  placeholder={"example.com\nanother-business.com\nthird-company.net"}
                  rows={5}
                  disabled={isRunning}
                  className="flex-1 text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 font-mono resize-y"
                />
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.csv"
                    onChange={handleFileUpload}
                    disabled={isRunning}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef?.current?.click()}
                    disabled={isRunning}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-gray-700 bg-gray-800 text-gray-300 hover:text-white disabled:opacity-30"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload File
                  </button>
                  <div className="text-[10px] text-gray-500 text-center">
                    {websiteText.split("\n").filter(l => l.trim()).length} sites
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">
                Upload CSV with Address Columns (same format as Line 1 export)
              </label>
              <div className="flex gap-2 mb-2">
                <div className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 min-h-[120px]">
                  {parsedAddresses.length > 0 ? (
                    <div className="space-y-1">
                      <div className="text-[10px] text-emerald-400 font-semibold">
                        ✓ {parsedAddresses.length} addresses loaded — will geocode directly from address
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {parsedAddresses.slice(0, 8).map((a, i) => (
                          <div key={i} className="text-[10px] text-gray-400 font-mono">
                            {a.name || "—"} | {a.address || "—"} | {a.city || "—"}, {a.state || "—"} {a.zip || ""}
                          </div>
                        ))}
                        {parsedAddresses.length > 8 && (
                          <div className="text-[10px] text-gray-500">...and {parsedAddresses.length - 8} more</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-gray-500 py-4 text-center">
                      Upload a CSV file with columns: Name, Website, Phone, Address, City, State, Zip
                      <br />
                      (Same format as the Line 1 CSV export — just download from Line 1 and upload here)
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    disabled={isRunning}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef?.current?.click()}
                    disabled={isRunning}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-gray-700 bg-gray-800 text-gray-300 hover:text-white disabled:opacity-30"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload CSV
                  </button>
                  <button
                    onClick={() => { setParsedAddresses([]); setWebsiteText(""); }}
                    disabled={isRunning || parsedAddresses.length === 0}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-gray-700 bg-gray-800 text-gray-500 hover:text-red-400 disabled:opacity-30"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Chain from Line 1 */}
          {line1Jobs.length > 0 && !isRunning && (
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <Layers className="w-3 h-3" />
              <span>Or chain from Line 1 results:</span>
              {line1Jobs.slice(0, 3).map(job => (
                <button
                  key={job.id}
                  onClick={() => handleStart(job.id)}
                  className="text-indigo-400 hover:text-indigo-300 underline"
                >
                  Job {job.id.slice(0, 8)}... ({job.companiesFound} companies)
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Radius selector */}
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Radius</label>
          <div className="flex flex-wrap gap-2">
            {/* Feet options — for DSP exports (Basis, StackAdapt) */}
            <div className="flex gap-1.5 items-center">
              <span className="text-[9px] text-gray-500 uppercase mr-1">DSP</span>
              {[
                { ft: 250, yd: 84 },
                { ft: 500, yd: 167 },
                { ft: 1000, yd: 333 },
              ].map(r => (
                <button
                  key={`ft-${r.ft}`}
                  onClick={() => setRadiusYards(r.yd)}
                  disabled={isRunning}
                  className={`text-xs px-3 py-2 rounded border transition-colors disabled:opacity-50 ${
                    radiusYards === r.yd ? "bg-emerald-900 border-emerald-600 text-emerald-300" : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  {r.ft} ft
                  <span className="block text-[9px] text-gray-500">{(r.ft * 0.3048).toFixed(0)}m</span>
                </button>
              ))}
            </div>
            <div className="w-px bg-gray-700 mx-1" />
            {/* Yard options — for Meta Ads */}
            <div className="flex gap-1.5 items-center">
              <span className="text-[9px] text-gray-500 uppercase mr-1">Meta</span>
              {[100, 250, 500].map(r => (
                <button
                  key={`yd-${r}`}
                  onClick={() => setRadiusYards(r)}
                  disabled={isRunning}
                  className={`text-xs px-3 py-2 rounded border transition-colors disabled:opacity-50 ${
                    radiusYards === r ? "bg-indigo-900 border-indigo-600 text-indigo-300" : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  {r} yd
                  <span className="block text-[9px] text-gray-500">{yardsToMiles(r)} mi</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            <span className="text-emerald-500">Green = DSP (sub-mile precision, no minimum)</span> · <span className="text-indigo-500">Indigo = Meta (min 0.63mi, auto-clamped)</span>
          </p>
        </div>

        {/* Geocode sources */}
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Geocode Sources (cascading)</label>
          <div className="flex flex-wrap gap-3">
            <SourceToggle label="Website Scrape" desc="JSON-LD, meta, Google Maps embed" enabled={useWebsiteScrape} setEnabled={setUseWebsiteScrape} disabled={isRunning} color="cyan" />
            <SourceToggle label="Census Geocoder" desc="Free, US addresses" enabled={useCensus} setEnabled={setUseCensus} disabled={isRunning} color="green" />
            <SourceToggle label="Nominatim" desc="OpenStreetMap, 1 req/s" enabled={useNominatim} setEnabled={setUseNominatim} disabled={isRunning} color="blue" />
            <SourceToggle label="Google Places" desc={caps?.googlePlaces ? "API key detected" : "No API key"} enabled={useGooglePlaces} setEnabled={setUseGooglePlaces} disabled={isRunning || !caps?.googlePlaces} color="amber" />
            <SourceToggle label="Chromium / Maps" desc={caps?.flaresolverr ? "FlareSolverr ready" : "FlareSolverr off"} enabled={useChromium} setEnabled={setUseChromium} disabled={isRunning} color="purple" />
          </div>
        </div>

        {/* Filter: only listings with addresses */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOnlyWithAddress(!onlyWithAddress)}
            disabled={isRunning}
            className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-40 ${onlyWithAddress ? "bg-emerald-600" : "bg-gray-700"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${onlyWithAddress ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
          <label className="text-xs text-gray-300 cursor-pointer" onClick={() => !isRunning && setOnlyWithAddress(!onlyWithAddress)}>
            Only geocode listings with addresses
            <span className="block text-[10px] text-gray-500">Skip any listing that has no address — saves time on large runs</span>
          </label>
        </div>

        {/* Start / Stop */}
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <button
              onClick={() => handleStart()}
              disabled={startLine2.isPending || (websiteText.split("\n").filter(l => l.trim()).length === 0 && line1Jobs.length === 0)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm font-semibold rounded transition-colors"
            >
              {startLine2.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Line 2
            </button>
          ) : (
            <button
              onClick={() => stopJob.mutate()}
              disabled={stopJob.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded ring-2 ring-red-400 animate-pulse"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          )}
          {displayJobId && !isRunning && (
            <button
              onClick={async () => {
                try {
                  const res = await apiRequest("POST", "/api/supreme/line2/regeocode", {
                    sourceJobId: displayJobId,
                    includeScraped: true,
                    includeFailed: true,
                  });
                  const data = await res.json();
                  toast({ title: `Reset ${data.reset} companies to pending — click Start Line 2 to re-geocode` });
                  queryClient.invalidateQueries({ queryKey: ["supreme-companies"] });
                  queryClient.invalidateQueries({ queryKey: ["supreme-jobs"] });
                } catch (err: any) {
                  toast({ title: `Re-geocode failed: ${err.message}`, variant: "destructive" });
                }
              }}
              className="flex items-center gap-2 px-3 py-2 bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold rounded transition-colors"
              title="Reset failed and scraped companies back to pending so Line 2 can try again"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-geocode Failed
            </button>
          )}
        </div>
      </div>

      {/* Inline progress banner — visible when running */}
      {isRunning && (
        <div className="border border-indigo-700 rounded-lg bg-indigo-950/30 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
            <span className="text-sm font-semibold text-white">
              {justStarted ? "Starting Line 2..." : "Line 2 — Geocoding & Pinning..."}
            </span>
            {status?.active?.totalWebsites && status.active.totalWebsites > 0 ? (
              <span className="text-xs text-gray-400">
                {status.active.geocodedCount ?? 0} geocoded / {status.active.failedCount ?? 0} failed / {status.active.totalWebsites} total
              </span>
            ) : null}
          </div>
          {status?.active?.totalWebsites && status.active.totalWebsites > 0 ? (
            <div className="w-full bg-gray-800 rounded h-2 overflow-hidden">
              <div
                className="bg-indigo-500 h-full transition-all duration-500"
                style={{ width: `${status.active.progress ?? 0}%` }}
              />
            </div>
          ) : null}
          {justStarted && (
            <div className="text-[10px] text-indigo-400">
              Engine initializing — inserting websites and spinning up geocode workers...
            </div>
          )}
        </div>
      )}

      {/* Log panel — visible during run AND after completion */}
      {logData?.log && logData.log.length > 0 && (
        <div className="border border-gray-700 rounded-lg bg-gray-900 p-3 space-y-2">
          <div className="flex items-center gap-2">
            {!isRunning && (
              <span className="text-xs font-semibold text-gray-400">
                Completed — {status?.active?.geocodedCount ?? companiesData?.total ?? 0} geocoded
              </span>
            )}
            {isRunning && (
              <span className="text-xs font-semibold text-gray-400">Engine Log</span>
            )}
          </div>
          <div className="bg-black/40 rounded p-2 max-h-40 overflow-y-auto font-mono text-[10px] text-gray-400 space-y-0.5">
            {logData.log.slice(-20).map((line, i) => (
              <div key={i} className={line.includes("✓") ? "text-green-400" : line.includes("✗") || line.includes("Error") || line.includes("Timeout") ? "text-red-400" : line.includes("completed") || line.includes("started") ? "text-amber-400" : "text-gray-500"}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {displayJobId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">
              Geocoded Companies {companiesData && `(${companiesData.total.toLocaleString()})`}
            </h2>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="text-xs bg-gray-800 border border-gray-700 rounded pl-7 pr-2 py-1.5 text-gray-200 w-40"
                />
              </div>
              <button
                onClick={copyPins}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-gray-700 bg-gray-800 text-gray-300 hover:text-white"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Pins
              </button>
              <a
                href={`/api/supreme/line2/export?jobId=${displayJobId}`}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-gray-700 bg-gray-800 text-gray-300 hover:text-white"
              >
                <Download className="w-3.5 h-3.5" /> Meta CSV
              </a>
              <a
                href={`/api/supreme/line2/export/campaign?jobId=${displayJobId}`}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-blue-600 bg-blue-900/40 text-blue-300 hover:text-blue-200"
                title="CSV ready to upload to Geofence → Campaigns tab"
              >
                <Download className="w-3.5 h-3.5" /> Campaign CSV
              </a>
              <a
                href={`/api/supreme/line2/export/json?jobId=${displayJobId}`}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-indigo-700 bg-indigo-900/40 text-indigo-300 hover:text-indigo-200"
              >
                <Download className="w-3.5 h-3.5" /> Meta JSON
              </a>
              {/* DSP Exports — sub-mile radius for Basis / StackAdapt / ad:personam */}
              <div className="relative">
                <button
                  onClick={() => setShowDspMenu(!showDspMenu)}
                  disabled={!displayJobId}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-emerald-700 bg-emerald-900/40 text-emerald-300 hover:text-emerald-200 disabled:opacity-30"
                >
                  <Download className="w-3.5 h-3.5" /> DSP Export
                  <span className="text-[9px] text-gray-500">{dspRadiusFeet}ft / {dspRadiusM}m</span>
                </button>
                {showDspMenu && (
                  <div className="absolute right-0 top-full mt-1 z-10 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 space-y-2 min-w-[280px]">
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1.5">Radius — Basis / StackAdapt (feet)</label>
                      <div className="flex gap-1.5">
                        {[250, 500, 1000].map(ft => (
                          <button
                            key={ft}
                            onClick={() => setDspRadiusFeet(ft)}
                            className={`text-[10px] px-2 py-1 rounded border ${dspRadiusFeet === ft ? "bg-emerald-700 border-emerald-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400"}`}
                          >
                            {ft}ft
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1.5">Radius — ad:personam (metres, min 100m)</label>
                      <div className="flex gap-1.5">
                        {[100, 300, 500, 1000].map(m => (
                          <button
                            key={m}
                            onClick={() => setDspRadiusM(m)}
                            className={`text-[10px] px-2 py-1 rounded border ${dspRadiusM === m ? "bg-emerald-700 border-emerald-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400"}`}
                          >
                            {m}m
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-gray-700 pt-2 space-y-1">
                      <a
                        href={`/api/supreme/line2/export/basis?jobId=${displayJobId}&radiusFeet=${dspRadiusFeet}`}
                        onClick={() => setShowDspMenu(false)}
                        className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded hover:bg-gray-800 text-gray-300"
                      >
                        <Download className="w-3 h-3" /> Basis DSP CSV
                        <span className="text-[9px] text-gray-500 ml-auto">hyperlocal zones</span>
                      </a>
                      <a
                        href={`/api/supreme/line2/export/stackadapt?jobId=${displayJobId}&radiusFeet=${dspRadiusFeet}`}
                        onClick={() => setShowDspMenu(false)}
                        className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded hover:bg-gray-800 text-gray-300"
                      >
                        <Download className="w-3 h-3" /> StackAdapt CSV
                        <span className="text-[9px] text-gray-500 ml-auto">geo radius targeting</span>
                      </a>
                      <a
                        href={`/api/supreme/line2/export/adpersonam?jobId=${displayJobId}&radiusM=${dspRadiusM}`}
                        onClick={() => setShowDspMenu(false)}
                        className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded hover:bg-gray-800 text-gray-300"
                      >
                        <Download className="w-3 h-3" /> ad:personam CSV
                        <span className="text-[9px] text-gray-500 ml-auto">hyperlocal GPS</span>
                      </a>
                    </div>
                    <div className="border-t border-gray-700 pt-2">
                      <p className="text-[9px] text-gray-600">
                        DSP exports use exact radius (no 0.63mi clamp). Basis = hyperlocal zones. StackAdapt = geo radius targeting. ad:personam = self-serve GPS (100-9999m, max 500 per line item).
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            </div>
          ) : companiesData && companiesData.companies.length > 0 ? (
            <div className="overflow-auto max-h-[calc(100vh-550px)] border border-gray-800 rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-900 border-b border-gray-700">
                  <tr className="text-left text-gray-400">
                    <th className="p-2 font-medium">Name</th>
                    <th className="p-2 font-medium">Website</th>
                    <th className="p-2 font-medium">Address</th>
                    <th className="p-2 font-medium">Latitude</th>
                    <th className="p-2 font-medium">Longitude</th>
                    <th className="p-2 font-medium">Pin</th>
                    <th className="p-2 font-medium">Radius</th>
                    <th className="p-2 font-medium">Source</th>
                    <th className="p-2 font-medium">Conf</th>
                    <th className="p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {companiesData.companies.map(c => (
                    <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-900">
                      <td className="p-2 text-gray-200">{c.name || "-"}</td>
                      <td className="p-2 text-cyan-400 truncate max-w-[160px]">
                        {c.website ? <a href={c.website} target="_blank" rel="noopener" className="hover:underline">{c.website}</a> : "-"}
                      </td>
                      <td className="p-2 text-gray-400 truncate max-w-[180px]">{c.address || "-"}</td>
                      <td className="p-2 text-green-400 font-mono">{c.latitude ? c.latitude.toFixed(6) : "-"}</td>
                      <td className="p-2 text-green-400 font-mono">{c.longitude ? c.longitude.toFixed(6) : "-"}</td>
                      <td className="p-2 text-indigo-400 font-mono text-[10px]">{c.pinQuery || "-"}</td>
                      <td className="p-2 text-gray-400">{c.radiusYards ? `${c.radiusYards}yd` : "-"}</td>
                      <td className="p-2 text-gray-500 text-[10px]">{c.geocodeSource || "-"}</td>
                      <td className="p-2 text-gray-500">{c.geocodeConfidence ? `${c.geocodeConfidence}%` : "-"}</td>
                      <td className="p-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          c.status === "geocoded" ? "bg-green-900/40 text-green-400" :
                          c.status === "failed" ? "bg-red-900/40 text-red-400" :
                          c.status === "pending" ? "bg-yellow-900/40 text-yellow-400" :
                          "bg-gray-800 text-gray-400"
                        }`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : isRunning ? (
            <div className="p-8 text-center text-indigo-400 text-xs space-y-2">
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              <div>Engine is geocoding — coordinates will appear here as companies are pinned.</div>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 text-xs">
              No results yet. Paste company websites above, select radius and sources, then start Line 2.
            </div>
          )}

          {companiesData && companiesData.total > limit && (
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{companiesData.total.toLocaleString()} total — Page {page}/{totalPages}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded border border-gray-700 disabled:opacity-30">Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded border border-gray-700 disabled:opacity-30">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Source toggle component ────────────────────────────────────────────────
function SourceToggle({
  label,
  desc,
  enabled,
  setEnabled,
  disabled,
  color,
}: {
  label: string;
  desc: string;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  disabled?: boolean;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    cyan: "bg-cyan-900/40 border-cyan-700 text-cyan-300",
    green: "bg-green-900/40 border-green-700 text-green-300",
    blue: "bg-blue-900/40 border-blue-700 text-blue-300",
    amber: "bg-amber-900/40 border-amber-700 text-amber-300",
    purple: "bg-purple-900/40 border-purple-700 text-purple-300",
  };
  return (
    <button
      onClick={() => setEnabled(!enabled)}
      disabled={disabled}
      className={`text-left border rounded px-3 py-2 transition-colors disabled:opacity-30 ${
        enabled ? colorClasses[color] : "bg-gray-800 border-gray-700 text-gray-500"
      }`}
    >
      <div className="text-xs font-semibold flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${enabled ? "bg-current" : "bg-gray-600"}`} />
        {label}
      </div>
      <div className="text-[9px] text-gray-500 mt-0.5">{desc}</div>
    </button>
  );
}
