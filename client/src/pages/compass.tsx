import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { Compass, Search, Play, Square, Download, Trash2, Globe, ChevronDown, ChevronUp, Loader2, AlertTriangle, ExternalLink, Filter, RefreshCw, Clock, Tag, User, Building2, Calendar, Star } from "lucide-react";

interface CompassSource {
  id: string;
  name: string;
  scraperKey: string;
  enabled: boolean;
  status: string;
  region: string;
}

interface CompassIndustry {
  id: string;
  name: string;
  slug: string;
  bundle: string;
  keywords: string[];
}

interface CompassProfile {
  id: string;
  calUrl: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  timezone: string | null;
  location: string | null;
  industry: string | null;
  industryBundle: string | null;
  scope: string | null;
  qualityScore: number | null;
  socialLinks: string | null;
  isTeamProfile: boolean;
  companyName: string | null;
  eventCount: number;
  source: string;
  isAlive: boolean;
  createdAt: string;
}

interface CompassEventType {
  id: string;
  title: string;
  description: string | null;
  duration: number | null;
  price: number | null;
  slug: string | null;
}

interface CompassDiscovery {
  id: string;
  url: string;
  username: string | null;
  source: string;
  sourceQuery: string | null;
  queryJobId: string | null;
  status: string;
  discoveredAt: string;
  enrichedAt: string | null;
}

interface CompassStatus {
  active: {
    jobId: string;
    running: boolean;
    totalQueries: number;
    completedQueries: number;
    urlsDiscovered: number;
    urlsFound: number;
    profilesEnriched: number;
    progress: number;
  } | null;
  recentJobs: any[];
}

interface CompassStats {
  totalProfiles: number;
  totalDiscoveries: number;
  bySource: Record<string, number>;
  byIndustry: Record<string, number>;
}

interface CompassSpeedMode {
  current: string;
  params: { name: string; label: string; discoveryWorkerCount: number; enrichmentWorkerCount: number };
  modes: any[];
}

const SCOPE_OPTIONS = [
  { value: "individual", label: "Individual" },
  { value: "small_business", label: "Small Business" },
  { value: "team", label: "Team" },
  { value: "enterprise", label: "Enterprise" },
];

const SPEED_MODES = ["turtle", "energation", "caligratos", "steady", "blitz"];

const speedModeColor = (name: string) =>
  name === "turtle"
    ? "bg-orange-900/60 text-orange-300 border border-orange-600/50"
    : name === "energation"
    ? "bg-yellow-900/60 text-yellow-300 border border-yellow-600/50"
    : name === "caligratos"
    ? "bg-purple-900/60 text-purple-300 border border-purple-600/50"
    : name === "steady"
    ? "bg-green-900/60 text-green-300 border border-green-600/50"
    : "bg-cyan-900/60 text-cyan-300 border border-cyan-600/50";

const speedModeChip = (name: string) =>
  name === "blitz"
    ? "text-red-400 border-red-500/30 bg-red-500/10"
    : name === "turtle"
    ? "text-blue-400 border-blue-500/30 bg-blue-500/10"
    : name === "energation"
    ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
    : name === "caligratos"
    ? "text-purple-400 border-purple-500/30 bg-purple-500/10"
    : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";

export default function CompassPage() {
  const { theme } = useTheme();
  const { toast } = useToast();

  // discovery controls
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [selectedBundles, setSelectedBundles] = useState<Set<string>>(new Set());
  const [customKeywords, setCustomKeywords] = useState("");
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const [bundleSearch, setBundleSearch] = useState("");

  // Sources that return 0 results when industry keywords are used
  // search + filters
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"url" | "all">("url");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [filterBundle, setFilterBundle] = useState("");
  const [filterScope, setFilterScope] = useState("");
  const [filterMinQuality, setFilterMinQuality] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("cal.com");
  // Compass tab is cal.com only — Calendly has its own tab
  const [filterCountry, setFilterCountry] = useState("US");
  const [filterState, setFilterState] = useState("all");
  const [strictMode, setStrictMode] = useState(false);
  const [sortBy, setSortBy] = useState("quality");
  const [page, setPage] = useState(1);
  const limit = 50;

  // profile browser phase: "enriched" shows compass_profiles, "discovered" shows compass_discoveries
  const [browserPhase, setBrowserPhase] = useState<"enriched" | "discovered">("enriched");

  // profile detail modal
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const logRef = useRef<HTMLDivElement>(null);

  const { data: sources = [] } = useQuery<CompassSource[]>({ queryKey: ["/api/compass/sources"] });
  const { data: industries = [] } = useQuery<CompassIndustry[]>({ queryKey: ["/api/compass/industries"] });
  const { data: stats } = useQuery<CompassStats>({ queryKey: ["/api/compass/stats", "cal.com"], queryFn: () => fetch("/api/compass/stats?platform=cal.com", { credentials: "include" }).then((r) => r.json()), refetchInterval: 10000 });
  const { data: status, refetch: refetchStatus } = useQuery<CompassStatus>({
    queryKey: ["/api/compass/discover/status"],
    refetchInterval: 2000,
  });
  const { data: speedMode } = useQuery<CompassSpeedMode>({
    queryKey: ["/api/compass/speed-mode"],
    refetchInterval: 5000,
  });

  // Auto-switch to "discovered" tab when a run starts so users see results immediately
  useEffect(() => {
    if (status?.active?.running && browserPhase === "enriched") {
      setBrowserPhase("discovered");
      setSortBy("recent");
      setPage(1);
    }
  }, [status?.active?.running, browserPhase]);

  // Build profile query string
  const profileFilters: Record<string, string> = { page: String(page), limit: String(limit) };
  if (searchQuery) { profileFilters.search = searchQuery; profileFilters.searchMode = searchMode; }
  if (filterIndustry) profileFilters.industry = filterIndustry;
  if (filterBundle) profileFilters.bundle = filterBundle;
  if (filterScope) profileFilters.scope = filterScope;
  if (filterMinQuality) profileFilters.minQuality = filterMinQuality;
  if (filterSource) profileFilters.source = filterSource;
  if (filterPlatform) profileFilters.platform = filterPlatform;
  if (sortBy) profileFilters.sort = sortBy;
  const profileQs = new URLSearchParams(profileFilters).toString();

  const { data: profilesData, isLoading: profilesLoading } = useQuery<{ profiles: CompassProfile[]; total: number }>({
    queryKey: ["/api/compass/profiles", profileQs],
    queryFn: () => fetch(`/api/compass/profiles?${profileQs}`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: status?.active ? 5000 : 15000,
  });

  // Discoveries query (Phase 1 — discovered URLs not yet enriched)
  const discoveryFilters: Record<string, string> = { page: String(page), limit: String(limit) };
  if (searchQuery) { discoveryFilters.search = searchQuery; discoveryFilters.searchMode = searchMode; }
  if (filterSource) discoveryFilters.source = filterSource;
  if (filterPlatform) discoveryFilters.platform = filterPlatform;
  if (sortBy) discoveryFilters.sort = sortBy;
  const discoveryQs = new URLSearchParams(discoveryFilters).toString();
  const { data: discoveriesData, isLoading: discoveriesLoading } = useQuery<{ discoveries: CompassDiscovery[]; total: number }>({
    queryKey: ["/api/compass/discoveries", discoveryQs],
    queryFn: () => fetch(`/api/compass/discoveries?${discoveryQs}`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: status?.active ? 2000 : 10000,
  });

  const { data: jobLog } = useQuery<{ log: string[]; status: string }>({
    queryKey: ["/api/compass/discover", status?.active?.jobId, "log"],
    queryFn: () => fetch(`/api/compass/discover/${status?.active?.jobId}/log`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!status?.active?.jobId,
    refetchInterval: 2000,
  });

  const { data: selectedProfile } = useQuery<{ profile: CompassProfile; eventTypes: CompassEventType[] }>({
    queryKey: ["/api/compass/profiles", selectedProfileId],
    queryFn: () => fetch(`/api/compass/profiles/${selectedProfileId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!selectedProfileId,
  });

  // Auto-select default sources
  useEffect(() => {
    if (sources.length > 0 && selectedSources.size === 0) {
      setSelectedSources(new Set(sources.filter((s) => s.enabled).map((s) => s.id)));
    }
  }, [sources]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [jobLog?.log]);

  const setSpeedMode = useMutation({
    mutationFn: (mode: string) => apiRequest("POST", "/api/compass/speed-mode", { mode }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compass/speed-mode"] });
      toast({ title: "Speed mode updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const parsedCustomKeywords = customKeywords.trim()
    ? customKeywords.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const hasCustomKeywords = parsedCustomKeywords.length > 0;

  const startDiscover = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/compass/discover", {
        sourceIds: Array.from(selectedSources),
        industryIds: hasCustomKeywords ? [] : Array.from(selectedBundles),
        strategyIds: [],
        country: filterCountry,
        state: filterCountry === "US" ? filterState : "all",
        strictMode,
        ...(hasCustomKeywords ? { customKeywords: parsedCustomKeywords } : {}),
      }),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Compass discovery launched!", description: data.jobId ? `Job ${data.jobId}` : undefined });
      queryClient.invalidateQueries({ queryKey: ["/api/compass/discover/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compass/discoveries" ] });
      queryClient.invalidateQueries({ queryKey: ["/api/compass/profiles"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const stopDiscover = useMutation({
    mutationFn: () => apiRequest("POST", `/api/compass/discover/${status?.active?.jobId}/stop`),
    onSuccess: () => {
      toast({ title: "Stop requested" });
      refetchStatus();
    },
  });

  const bundles = Array.from(new Set(industries.map((i) => i.bundle))).sort();

  // Industries grouped by bundle for cascading filter in the profile browser
  const industriesByBundle: Record<string, CompassIndustry[]> = {};
  for (const ind of industries) {
    if (!industriesByBundle[ind.bundle]) industriesByBundle[ind.bundle] = [];
    industriesByBundle[ind.bundle].push(ind);
  }
  const filterIndustryOptions = filterBundle
    ? (industriesByBundle[filterBundle] || []).sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const toggleBundle = (bundle: string) => {
    const bundleInds = industries.filter((i) => i.bundle === bundle);
    const allSelected = bundleInds.every((i) => selectedBundles.has(i.id));
    const next = new Set(selectedBundles);
    bundleInds.forEach((i) => (allSelected ? next.delete(i.id) : next.add(i.id)));
    setSelectedBundles(next);
  };

  const selectAllBundles = () => {
    setSelectedBundles(new Set(industries.map((i) => i.id)));
  };

  const clearAllBundles = () => setSelectedBundles(new Set());

  // group sources by region
  const sourcesByRegion = sources.reduce<Record<string, CompassSource[]>>((acc, s) => {
    const key = s.region || "global";
    (acc[key] ||= []).push(s);
    return acc;
  }, {});
  const regionOrder = ["global", "us", "intl"];

  const totalProfilePages = browserPhase === "enriched"
    ? (profilesData ? Math.ceil(profilesData.total / limit) : 1)
    : (discoveriesData ? Math.ceil(discoveriesData.total / limit) : 1);

  const exportCsv = () => {
    const exportFilters = { ...profileFilters };
    delete exportFilters.page;
    delete exportFilters.limit;
    const qs = new URLSearchParams(exportFilters).toString();
    window.open(`/api/compass/export?${qs}`, "_blank");
  };

  const qualityLabel = (score: number) => {
    if (score >= 90) return { label: "Pristine", color: "text-green-400 bg-green-900/30" };
    if (score >= 70) return { label: "Clean", color: "text-blue-400 bg-blue-900/30" };
    if (score >= 50) return { label: "Guarded", color: "text-yellow-400 bg-yellow-900/30" };
    return { label: "Low", color: "text-red-400 bg-red-900/30" };
  };

  return (
    <div className="min-h-screen bg-black text-gray-100 p-4 space-y-4" data-testid="compass-page">
      <div className="flex items-center gap-3 mb-4">
        <Compass className="w-6 h-6 text-cyan-400" />
        <h1 className="text-xl font-bold text-white tracking-wide" data-testid="text-page-title">Compass</h1>
        <span className="text-xs text-gray-500 ml-2">cal.com Profile Discovery Engine</span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="stats-bar">
          <StatCard label="Total Profiles" value={stats.totalProfiles} color="text-cyan-400" />
          <StatCard label="Total Discoveries" value={stats.totalDiscoveries} color="text-yellow-400" />
          <StatCard label="Sources" value={Object.keys(stats.bySource || {}).length} color="text-blue-400" />
          <StatCard label="Industries" value={Object.keys(stats.byIndustry || {}).length} color="text-purple-400" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT PANEL — DISCOVERY CONTROLS */}
        <div className="border border-gray-700 rounded-lg bg-gray-950" data-testid="discovery-controls-panel">
          <div className="flex items-center gap-2 p-3 border-b border-gray-800">
            <Compass className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-white">Discovery Controls</span>
            {status?.active && (
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full animate-pulse">RUNNING</span>
            )}
          </div>

          <div className="p-4 space-y-4">
            {/* Sources — grouped multi-select chip groups with presets */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Sources ({selectedSources.size} selected)
              </label>
              {/* Quick-select presets */}
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setSelectedSources(new Set(sources.filter((s) => ["search_engine_dork", "discover_sitemap", "discover_browse"].includes(s.scraperKey) && s.enabled).map((s) => s.id)))}
                  className="text-[10px] px-2 py-0.5 rounded border border-cyan-700/40 text-cyan-400 hover:bg-cyan-900/30"
                  data-testid="preset-fast-discovery"
                >
                  Fast Discovery
                </button>
                <button
                  onClick={() => setSelectedSources(new Set(sources.filter((s) => ["web_archive_bulk", "sitemap_harvest", "username_enumeration", "github_bio", "social_bio"].includes(s.scraperKey) && s.enabled).map((s) => s.id)))}
                  className="text-[10px] px-2 py-0.5 rounded border border-amber-700/40 text-amber-400 hover:bg-amber-900/30"
                  data-testid="preset-deep-scrape"
                >
                  Deep Scrape
                </button>
                <button
                  onClick={() => setSelectedSources(new Set(sources.filter((s) => ["embed_detection", "referral_graph", "hive_cross_pollination"].includes(s.scraperKey) && s.enabled).map((s) => s.id)))}
                  className="text-[10px] px-2 py-0.5 rounded border border-rose-700/40 text-rose-400 hover:bg-rose-900/30"
                  data-testid="preset-cross-reference"
                >
                  Cross-Reference
                </button>
                <button
                  onClick={() => setSelectedSources(new Set(sources.filter((s) => ["sitemap_harvest"].includes(s.scraperKey) && s.enabled).map((s) => s.id)))}
                  className="text-[10px] px-2 py-0.5 rounded border border-orange-700/40 text-orange-400 hover:bg-orange-900/30"
                  data-testid="preset-sitemap-harvest"
                >
                  Sitemap Harvest
                </button>
                <button
                  onClick={() => {
                    setSelectedSources(new Set(sources.filter((s) => ["discover_sitemap", "discover_browse"].includes(s.scraperKey) && s.enabled).map((s) => s.id)));
                    setSelectedBundles(new Set());
                    setCustomKeywords("");
                    setStrictMode(false);
                  }}
                  className="text-[10px] px-2 py-0.5 rounded border border-purple-700/40 text-purple-400 hover:bg-purple-900/30"
                  data-testid="preset-discover-harvest"
                >
                  Discover Harvest
                </button>
                <button
                  onClick={() => setSelectedSources(new Set(sources.filter((s) => s.enabled).map((s) => s.id)))}
                  className="text-[10px] px-2 py-0.5 rounded border border-gray-600 text-gray-300 hover:bg-gray-800"
                  data-testid="preset-everything"
                >
                  Everything
                </button>
                <button
                  onClick={() => setSelectedSources(new Set())}
                  className="text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-500 hover:text-gray-300"
                  data-testid="preset-clear"
                >
                  Clear
                </button>
              </div>
              {(() => {
                const SOURCE_GROUPS: { label: string; color: string; keys: string[] }[] = [
                  { label: "Search", color: "cyan", keys: ["search_engine_dork", "google_cse"] },
                  { label: "Sitemap", color: "orange", keys: ["sitemap_harvest"] },
                  { label: "Archive", color: "amber", keys: ["web_archive_bulk", "username_enumeration"] },
                  { label: "Bio / Social", color: "emerald", keys: ["github_bio", "social_bio"] },
                  { label: "Cal.com Native", color: "purple", keys: ["discover_sitemap", "discover_browse"] },
                  { label: "Cross-Reference", color: "rose", keys: ["hive_cross_pollination", "embed_detection", "referral_graph"] },
                ];
                const colorMap: Record<string, { on: string; off: string; group: string }> = {
                  cyan: { on: "bg-cyan-900/40 border-cyan-600/60 text-cyan-300", off: "bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300", group: "text-cyan-400 border-cyan-700/40" },
                  orange: { on: "bg-orange-900/40 border-orange-600/60 text-orange-300", off: "bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300", group: "text-orange-400 border-orange-700/40" },
                  amber: { on: "bg-amber-900/40 border-amber-600/60 text-amber-300", off: "bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300", group: "text-amber-400 border-amber-700/40" },
                  emerald: { on: "bg-emerald-900/40 border-emerald-600/60 text-emerald-300", off: "bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300", group: "text-emerald-400 border-emerald-700/40" },
                  purple: { on: "bg-purple-900/40 border-purple-600/60 text-purple-300", off: "bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300", group: "text-purple-400 border-purple-700/40" },
                  rose: { on: "bg-rose-900/40 border-rose-600/60 text-rose-300", off: "bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300", group: "text-rose-400 border-rose-700/40" },
                };
                return (
                <div className="space-y-2">
                  {/* Group rows */}
                  {SOURCE_GROUPS.map((grp) => {
                    const groupSources = sources.filter((s) => grp.keys.includes(s.scraperKey));
                    const selectedInGroup = groupSources.filter((s) => selectedSources.has(s.id));
                    const allSelected = groupSources.length > 0 && selectedInGroup.length === groupSources.length;
                    const colors = colorMap[grp.color];
                    return (
                      <div key={grp.label} className={`rounded border p-2 ${colors.group} bg-gray-900/30`}>
                        {/* Group header with select-all toggle */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${colors.group}`}>{grp.label}</span>
                          <button
                            onClick={() => {
                              const next = new Set(selectedSources);
                              if (allSelected) {
                                groupSources.forEach((s) => next.delete(s.id));
                              } else {
                                groupSources.forEach((s) => { if (s.enabled) next.add(s.id); });
                              }
                              setSelectedSources(next);
                            }}
                            className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${allSelected ? colors.on : "border-gray-700 text-gray-500 hover:text-gray-300"}`}
                          >
                            {allSelected ? "✓ All" : "Select All"}
                          </button>
                        </div>
                        {/* Source chips */}
                        <div className="flex flex-wrap gap-1.5">
                          {groupSources.map((s) => {
                            const isSelected = selectedSources.has(s.id);
                            return (
                              <button
                                key={s.id}
                                onClick={() => {
                                  if (!s.enabled) return;
                                  const next = new Set(selectedSources);
                                  isSelected ? next.delete(s.id) : next.add(s.id);
                                  setSelectedSources(next);
                                }}
                                disabled={!s.enabled}
                                className={`text-[10px] px-2 py-1 rounded border transition-all ${isSelected ? colors.on : colors.off} ${!s.enabled ? "opacity-40 cursor-not-allowed line-through" : ""}`}
                                data-testid={`chip-source-${s.scraperKey}`}
                              >
                                {s.name}
                                {s.status === "working" && <span className="ml-1 text-green-400">✓</span>}
                                {s.status === "blocked" && <span className="ml-1 text-red-400">✕</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {/* Global select all / clear */}
                  <div className="flex gap-1.5 pt-1">
                    <button
                      onClick={() => setSelectedSources(new Set(sources.filter((s) => s.enabled).map((s) => s.id)))}
                      className="text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200"
                      data-testid="button-select-all-sources"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedSources(new Set())}
                      className="text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200"
                      data-testid="button-clear-sources"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                );
              })()}
            </div>

            {/* Custom keywords */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Custom Keywords</label>
              <input
                type="text"
                placeholder="Comma-separated keywords (overrides bundles)"
                value={customKeywords}
                onChange={(e) => setCustomKeywords(e.target.value)}
                className={`w-full text-xs rounded px-2 py-1 text-gray-200 placeholder-gray-600 border ${hasCustomKeywords ? "bg-cyan-950/40 border-cyan-600/60 text-cyan-200" : "bg-gray-900 border-gray-700"}`}
                data-testid="input-custom-keywords"
              />
              {hasCustomKeywords && (
                <div className="text-[10px] text-cyan-400/80 flex items-center gap-1">
                  <Search className="w-3 h-3" />
                  {parsedCustomKeywords.length} custom {parsedCustomKeywords.length === 1 ? "keyword" : "keywords"} — bundles ignored
                </div>
              )}
            </div>

            {/* Industry bundles */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Industry Bundles ({selectedBundles.size} selected)
              </label>
              <input
                type="text"
                placeholder="Search bundles..."
                value={bundleSearch}
                onChange={(e) => setBundleSearch(e.target.value)}
                className={`w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 placeholder-gray-600 ${hasCustomKeywords ? "text-gray-600 opacity-50" : "text-gray-200"}`}
                data-testid="input-bundle-search"
                disabled={hasCustomKeywords}
              />
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={selectAllBundles}
                  disabled={hasCustomKeywords}
                  className="text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                  data-testid="button-select-all-bundles"
                >
                  Select All
                </button>
                <button
                  onClick={clearAllBundles}
                  disabled={hasCustomKeywords}
                  className="text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                  data-testid="button-clear-all-bundles"
                >
                  Clear
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto border border-gray-800 rounded bg-gray-900/50">
                {bundles.map((b) => {
                  const bundleInds = industries.filter((i) => i.bundle === b);
                  const visibleInds = bundleInds.filter(
                    (i) =>
                      !bundleSearch ||
                      i.name.toLowerCase().includes(bundleSearch.toLowerCase()) ||
                      i.bundle.toLowerCase().includes(bundleSearch.toLowerCase())
                  );
                  if (bundleSearch && visibleInds.length === 0) return null;
                  const selectedCount = bundleInds.filter((i) => selectedBundles.has(i.id)).length;
                  const allSelected = bundleInds.length > 0 && bundleInds.every((i) => selectedBundles.has(i.id));
                  const isExpanded = expandedBundles.has(b) || !!bundleSearch;
                  const bundleSlug = b.toLowerCase().replace(/\s+/g, "-");
                  return (
                    <div key={b} className="border-b border-gray-800 last:border-b-0">
                      <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-gray-800/50 cursor-pointer" data-testid={`bundle-header-${bundleSlug}`}>
                        <button
                          onClick={() => {
                            const next = new Set(expandedBundles);
                            next.has(b) ? next.delete(b) : next.add(b);
                            setExpandedBundles(next);
                          }}
                          className="text-gray-500 hover:text-gray-300 text-[10px] w-4 flex-shrink-0"
                          data-testid={`button-expand-${bundleSlug}`}
                        >
                          {isExpanded ? "▼" : "▶"}
                        </button>
                        <button
                          onClick={() => toggleBundle(b)}
                          disabled={hasCustomKeywords}
                          className={`flex-1 text-left text-[11px] font-medium transition-colors ${
                            allSelected ? "text-cyan-300" : selectedCount > 0 ? "text-cyan-400/70" : "text-gray-400"
                          } disabled:opacity-50`}
                          data-testid={`button-bundle-${bundleSlug}`}
                        >
                          {b}
                        </button>
                        <span className={`text-[10px] ${allSelected ? "text-cyan-400" : selectedCount > 0 ? "text-cyan-500/60" : "text-gray-600"}`}>
                          {selectedCount}/{bundleInds.length}
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="pl-6 pr-2 pb-1.5 space-y-0.5">
                          {(bundleSearch ? visibleInds : bundleInds).map((i) => (
                            <label key={i.id} className="flex items-center gap-2 text-xs cursor-pointer" data-testid={`checkbox-ind-${i.slug}`}>
                              <input
                                type="checkbox"
                                checked={selectedBundles.has(i.id)}
                                disabled={hasCustomKeywords}
                                onChange={() => {
                                  const next = new Set(selectedBundles);
                                  next.has(i.id) ? next.delete(i.id) : next.add(i.id);
                                  setSelectedBundles(next);
                                }}
                                className="rounded"
                              />
                              <span className="text-gray-300">{i.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Speed mode */}
            {speedMode && (
              <div className="flex items-center gap-2 px-2 py-2 rounded text-xs border border-gray-800 bg-gray-900/50" data-testid="speed-mode-panel">
                <span className="text-gray-400 font-medium">speed:</span>
                <div className="flex flex-wrap gap-1">
                  {speedMode.modes.map((m: any) => (
                    <button
                      key={m.name}
                      onClick={() => setSpeedMode.mutate(m.name)}
                      disabled={setSpeedMode.isPending}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                        speedMode.current === m.name ? speedModeColor(m.name) : "bg-gray-800/50 text-gray-500 border border-gray-700/50 hover:text-gray-300"
                      }`}
                      data-testid={`button-speed-${m.name}`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Country selector */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Country</label>
              <select
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="bg-gray-900 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 focus:border-cyan-700 focus:outline-none"
                data-testid="select-country"
              >
                <option value="all">All Countries</option>
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
                <option value="DE">Germany</option>
                <option value="IN">India</option>
              </select>
              {filterCountry === "US" && (
                <select
                  value={filterState}
                  onChange={(e) => setFilterState(e.target.value)}
                  className="bg-gray-900 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 focus:border-cyan-700 focus:outline-none"
                  data-testid="select-state"
                >
                  <option value="all">All States</option>
                  <option value="AL">Alabama</option>
                  <option value="AK">Alaska</option>
                  <option value="AZ">Arizona</option>
                  <option value="AR">Arkansas</option>
                  <option value="CA">California</option>
                  <option value="CO">Colorado</option>
                  <option value="CT">Connecticut</option>
                  <option value="DE">Delaware</option>
                  <option value="DC">District of Columbia</option>
                  <option value="FL">Florida</option>
                  <option value="GA">Georgia</option>
                  <option value="HI">Hawaii</option>
                  <option value="ID">Idaho</option>
                  <option value="IL">Illinois</option>
                  <option value="IN">Indiana</option>
                  <option value="IA">Iowa</option>
                  <option value="KS">Kansas</option>
                  <option value="KY">Kentucky</option>
                  <option value="LA">Louisiana</option>
                  <option value="ME">Maine</option>
                  <option value="MD">Maryland</option>
                  <option value="MA">Massachusetts</option>
                  <option value="MI">Michigan</option>
                  <option value="MN">Minnesota</option>
                  <option value="MS">Mississippi</option>
                  <option value="MO">Missouri</option>
                  <option value="MT">Montana</option>
                  <option value="NE">Nebraska</option>
                  <option value="NV">Nevada</option>
                  <option value="NH">New Hampshire</option>
                  <option value="NJ">New Jersey</option>
                  <option value="NM">New Mexico</option>
                  <option value="NY">New York</option>
                  <option value="NC">North Carolina</option>
                  <option value="ND">North Dakota</option>
                  <option value="OH">Ohio</option>
                  <option value="OK">Oklahoma</option>
                  <option value="OR">Oregon</option>
                  <option value="PA">Pennsylvania</option>
                  <option value="RI">Rhode Island</option>
                  <option value="SC">South Carolina</option>
                  <option value="SD">South Dakota</option>
                  <option value="TN">Tennessee</option>
                  <option value="TX">Texas</option>
                  <option value="UT">Utah</option>
                  <option value="VT">Vermont</option>
                  <option value="VA">Virginia</option>
                  <option value="WA">Washington</option>
                  <option value="WV">West Virginia</option>
                  <option value="WI">Wisconsin</option>
                  <option value="WY">Wyoming</option>
                </select>
              )}
            </div>

            {/* Strict mode + API key warning */}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-800">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={strictMode}
                    onChange={(e) => setStrictMode(e.target.checked)}
                    className="w-3 h-3 accent-cyan-600"
                    data-testid="checkbox-strict-mode"
                  />
                  Strict mode
                  <span className="text-[10px] text-gray-600">(filter Unclassified)</span>
                </label>
              </div>
              <div className="text-[10px] text-yellow-600/70 bg-yellow-900/10 border border-yellow-900/30 rounded px-2 py-1" data-testid="serper-warning">
                Tip: Set <code className="text-yellow-500">SERPER_API_KEY</code> env var for keyword-targeted search (free at serper.dev). Without it, search/social/embed scouts return 0 results.
              </div>
            </div>

            {/* Start / Stop buttons */}
            <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
              {!status?.active ? (
                <button
                  onClick={() => startDiscover.mutate()}
                  disabled={
                    selectedSources.size === 0 || (!hasCustomKeywords && selectedBundles.size === 0) || startDiscover.isPending
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold rounded transition-colors"
                  data-testid="button-start-discovery"
                >
                  {startDiscover.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Start Discovery
                </button>
              ) : (
                <button
                  onClick={() => stopDiscover.mutate()}
                  disabled={stopDiscover.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded ring-2 ring-red-400 animate-pulse transition-colors"
                  data-testid="button-stop-discovery"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </button>
              )}

              {speedMode && (
                <span className={`font-mono text-xs px-1.5 py-0.5 rounded border ${speedModeChip(speedMode.current)}`} data-testid="text-discover-speed-mode">
                  {speedMode.current}
                </span>
              )}
            </div>

            {/* Live progress */}
            {status?.active && (
              <div className="space-y-2 pt-2 border-t border-gray-800" data-testid="live-progress">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">
                    Queries: {status.active.completedQueries}/{status.active.totalQueries}
                  </span>
                  <span className="text-cyan-400" data-testid="text-urls-discovered">URLs: {status.active.urlsFound || status.active.urlsDiscovered} ({status.active.urlsDiscovered} new)</span>
                  <span className="text-yellow-400" data-testid="text-profiles-enriched">Enriched: {status.active.profilesEnriched}</span>
                </div>
                <div className="w-full bg-gray-800 rounded h-2 overflow-hidden">
                  <div
                    className="bg-cyan-500 h-full transition-all"
                    style={{ width: `${status.active.progress}%` }}
                    data-testid="progress-bar"
                  />
                </div>
                <div className="text-[10px] text-gray-500 text-center" data-testid="text-progress">
                  {status.active.progress}% complete
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CENTER — DASHBOARD */}
        <div className="space-y-4" data-testid="dashboard-column">
          {/* Stats overview */}
          <div className="border border-gray-700 rounded-lg bg-gray-950 p-4" data-testid="stats-panel">
            <div className="flex items-center gap-2 mb-3">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-white">Dashboard</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Total Profiles</span>
                <span className="text-cyan-400 font-semibold" data-testid="text-total-profiles">{stats?.totalProfiles?.toLocaleString() ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Total Discoveries</span>
                <span className="text-yellow-400 font-semibold" data-testid="text-total-discoveries">{stats?.totalDiscoveries?.toLocaleString() ?? 0}</span>
              </div>
            </div>

            {/* By source */}
            <div className="mt-3 space-y-1">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Profiles by Source</div>
              {stats?.bySource && Object.keys(stats.bySource).length > 0 ? (
                Object.entries(stats.bySource)
                  .sort((a, b) => b[1] - a[1])
                  .map(([src, count]) => {
                    const max = Math.max(...Object.values(stats.bySource));
                    const pct = max > 0 ? (count / max) * 100 : 0;
                    return (
                      <div key={src} className="flex items-center gap-2 text-xs" data-testid={`bar-source-${src.toLowerCase()}`}>
                        <span className="text-gray-400 w-24 truncate">{src}</span>
                        <div className="flex-1 bg-gray-800 rounded h-1.5 overflow-hidden">
                          <div className="bg-cyan-600 h-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-gray-500 w-10 text-right">{count}</span>
                      </div>
                    );
                  })
              ) : (
                <div className="text-[10px] text-gray-700">No data yet.</div>
              )}
            </div>
          </div>

          {/* Two-phase progress */}
          {status?.active && (
            <div className="border border-gray-700 rounded-lg bg-gray-950 p-4 space-y-3" data-testid="two-phase-progress">
              <div className="flex items-center gap-2 mb-1">
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                <span className="text-sm font-semibold text-white">Two-Phase Progress</span>
              </div>
              {/* Discovery phase */}
              <div className="space-y-1" data-testid="phase-discovery">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Phase 1: Discovery</span>
                  <span className="text-cyan-400">
                    {status.active.completedQueries}/{status.active.totalQueries} queries
                    <span className="text-gray-500 ml-2">|</span>
                    <span className="ml-2">{(status.active.urlsDiscovered || 0).toLocaleString()} URLs found</span>
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded h-2 overflow-hidden">
                  <div
                    className="bg-cyan-500 h-full transition-all"
                    style={{ width: `${status.active.totalQueries > 0 ? (status.active.completedQueries / status.active.totalQueries) * 100 : 0}%` }}
                  />
                </div>
                {/* Latest log line for real-time activity */}
                {jobLog?.log && jobLog.log.length > 0 && (
                  <div className="text-[10px] text-gray-500 truncate mt-1">
                    {jobLog.log[jobLog.log.length - 1]}
                  </div>
                )}
              </div>
              {/* Enrichment phase */}
              <div className="space-y-1" data-testid="phase-enrichment">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Phase 2: Enrichment</span>
                  <span className="text-yellow-400">
                    {(status.active.profilesEnriched || 0).toLocaleString()}
                    <span className="text-gray-500"> / </span>
                    {(status.active.urlsDiscovered || 0).toLocaleString()} profiles
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded h-2 overflow-hidden">
                  <div
                    className="bg-yellow-500 h-full transition-all"
                    style={{ width: `${(status.active.urlsDiscovered || 0) > 0 ? ((status.active.profilesEnriched || 0) / (status.active.urlsDiscovered || 1)) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Speed mode display */}
          {speedMode && (
            <div className="border border-gray-700 rounded-lg bg-gray-950 p-4" data-testid="speed-mode-display">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-semibold text-white">Speed Mode</span>
                <span className={`font-mono text-xs px-1.5 py-0.5 rounded border ${speedModeChip(speedMode.current)}`}>
                  {speedMode.current}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-gray-400">Label: <span className="text-gray-200">{speedMode.params.label}</span></div>
                <div className="text-gray-400">Discovery Workers: <span className="text-gray-200">{speedMode.params.discoveryWorkerCount}</span></div>
                <div className="text-gray-400">Enrichment Workers: <span className="text-gray-200">{speedMode.params.enrichmentWorkerCount}</span></div>
              </div>
            </div>
          )}

          {/* Live log stream */}
          <div className="border border-gray-700 rounded-lg bg-gray-950" data-testid="log-panel">
            <div className="flex items-center gap-2 p-3 border-b border-gray-800">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-white">Live Log</span>
              {jobLog?.status && <span className="text-[10px] text-gray-600">{jobLog.status}</span>}
            </div>
            <div
              ref={logRef}
              className="bg-black border-t border-gray-800 p-2 max-h-64 overflow-y-auto font-mono text-[10px] text-gray-500 space-y-0.5"
              data-testid="live-log"
            >
              {(jobLog?.log || []).map((line, i) => (
                <div key={i} className={line.includes("Error") ? "text-red-400" : line.includes("+") ? "text-green-400" : ""}>
                  {line}
                </div>
              ))}
              {(!jobLog?.log || jobLog.log.length === 0) && (
                <div className="text-gray-700">No log entries yet. Start a discovery to see live output.</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL — PROFILE BROWSER */}
        <div className="border border-gray-700 rounded-lg bg-gray-950" data-testid="profile-browser-panel">
          <div className="flex items-center gap-2 p-3 border-b border-gray-800">
            <User className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-white">Profile Browser</span>
            {/* Phase toggle */}
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => { setBrowserPhase("enriched"); setSortBy("quality"); setPage(1); }}
                className={`text-[10px] px-2 py-1 rounded border transition-colors ${browserPhase === "enriched" ? "border-cyan-700 bg-cyan-900/30 text-cyan-300" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}
                data-testid="button-phase-enriched"
              >
                Enriched ({stats?.totalProfiles ?? 0})
              </button>
              <button
                onClick={() => { setBrowserPhase("discovered"); setSortBy("recent"); setPage(1); }}
                className={`text-[10px] px-2 py-1 rounded border transition-colors ${browserPhase === "discovered" ? "border-cyan-700 bg-cyan-900/30 text-cyan-300" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}
                data-testid="button-phase-discovered"
              >
                Discovered ({stats?.totalDiscoveries ?? 0})
              </button>
              <button
                onClick={exportCsv}
                className="ml-2 flex items-center gap-1 text-xs px-2 py-1 border border-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
                data-testid="button-export-csv"
              >
                <Download className="w-3 h-3" />CSV
              </button>
            </div>
          </div>

          {/* Search + filters */}
          <div className="p-2 border-b border-gray-800 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                <input
                  type="text"
                  placeholder={searchMode === "url" ? "Search by URL or username..." : "Search name, bio, industry, URL, events..."}
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  className="w-full text-xs bg-gray-900 border border-gray-700 rounded pl-7 pr-2 py-1.5 text-gray-200 placeholder-gray-600"
                  data-testid="input-profile-search"
                />
              </div>
              <div className="flex rounded border border-gray-700 overflow-hidden" data-testid="search-mode-toggle">
                <button
                  onClick={() => { setSearchMode("url"); setPage(1); }}
                  className={`text-[10px] px-2 py-1.5 ${searchMode === "url" ? "bg-cyan-900 text-cyan-300" : "bg-gray-900 text-gray-500"}`}
                >
                  URL
                </button>
                <button
                  onClick={() => { setSearchMode("all"); setPage(1); }}
                  className={`text-[10px] px-2 py-1.5 ${searchMode === "all" ? "bg-cyan-900 text-cyan-300" : "bg-gray-900 text-gray-500"}`}
                >
                  Everything
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* Bundle filter — top of cascade */}
              <select
                value={filterBundle}
                onChange={(e) => { setFilterBundle(e.target.value); setFilterIndustry(""); setPage(1); }}
                className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
                data-testid="select-filter-bundle"
              >
                <option value="">All Bundles</option>
                {bundles.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              {/* Industry filter — cascading from bundle */}
              <select
                value={filterIndustry}
                onChange={(e) => { setFilterIndustry(e.target.value); setPage(1); }}
                disabled={!filterBundle}
                className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 disabled:opacity-40"
                data-testid="select-filter-industry"
              >
                <option value="">{filterBundle ? `All in ${filterBundle}` : "Select bundle first"}</option>
                {filterIndustryOptions.map((i) => (
                  <option key={i.id} value={i.name}>{i.name}</option>
                ))}
              </select>
              {browserPhase === "enriched" && (
                <select
                  value={filterScope}
                  onChange={(e) => { setFilterScope(e.target.value); setPage(1); }}
                  className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
                  data-testid="select-filter-scope"
                >
                  <option value="">All Scopes</option>
                  {SCOPE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              )}
              {browserPhase === "enriched" && (
                <select
                  value={filterMinQuality}
                  onChange={(e) => { setFilterMinQuality(e.target.value); setPage(1); }}
                  className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
                  data-testid="select-filter-min-quality"
                >
                  <option value="">Any Quality</option>
                  <option value="50">50+</option>
                  <option value="70">70+</option>
                  <option value="90">90+</option>
                </select>
              )}
              <select
                value={filterSource}
                onChange={(e) => { setFilterSource(e.target.value); setPage(1); }}
                className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
                data-testid="select-filter-source"
              >
                <option value="">All Sources</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.scraperKey}>{s.name}</option>
                ))}
              </select>
              {browserPhase === "enriched" && (
                <select
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                  className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
                  data-testid="select-sort-by"
                >
                  <option value="quality">Quality (default)</option>
                  <option value="name">Name A-Z</option>
                  <option value="industry">Industry</option>
                  <option value="events">Event Count</option>
                  <option value="recent">Most Recent</option>
                </select>
              )}
              {browserPhase === "discovered" && (
                <select
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                  className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
                  data-testid="select-discovery-sort"
                >
                  <option value="recent">Most Recent</option>
                  <option value="oldest">Oldest First</option>
                  <option value="source">Source A-Z</option>
                  <option value="username">Username A-Z</option>
                </select>
              )}
            </div>
          </div>

          {/* Results table — ENRICHED phase */}
          {browserPhase === "enriched" && (
            <div className="overflow-x-auto">
              {profilesLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
                </div>
              ) : (
                <>
                  <table className="w-full text-xs" data-testid="profiles-table">
                    <thead>
                      <tr className="border-b border-gray-800 text-gray-500">
                        <th className="text-left p-2 font-medium">Name</th>
                        <th className="text-left p-2 font-medium">Industry</th>
                        <th className="text-left p-2 font-medium">Scope</th>
                        <th className="text-center p-2 font-medium">Quality</th>
                        <th className="text-center p-2 font-medium">Events</th>
                        <th className="text-left p-2 font-medium">Source</th>
                        <th className="text-center p-2 font-medium w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(profilesData?.profiles || []).map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedProfileId(p.id)}
                          className="border-b border-gray-900 hover:bg-gray-900/50 cursor-pointer"
                          data-testid={`row-profile-${p.id}`}
                        >
                          <td className="p-2 text-gray-200 font-medium max-w-[160px] truncate">
                            {p.name || p.username}
                            {p.isTeamProfile && <span className="ml-1 text-[9px] text-purple-400 bg-purple-900/30 px-1 rounded">TEAM</span>}
                          </td>
                          <td className="p-2 text-gray-400 max-w-[120px] truncate">{p.industry || "-"}</td>
                          <td className="p-2 text-gray-400">{p.scope || "-"}</td>
                          <td className="p-2 text-center">
                            {p.qualityScore !== null && p.qualityScore !== undefined ? (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${qualityLabel(p.qualityScore).color}`}>
                                {p.qualityScore}
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-600">—</span>
                            )}
                          </td>
                          <td className="p-2 text-center text-gray-400">{p.eventCount}</td>
                          <td className="p-2 text-gray-500 max-w-[100px] truncate">{p.source}</td>
                          <td className="p-2 text-center">
                            <a
                              href={p.calUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center text-cyan-400 hover:text-cyan-300"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                        </tr>
                      ))}
                      {(!profilesData?.profiles || profilesData.profiles.length === 0) && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-gray-600">
                            No enriched profiles yet. Run a discovery to find cal.com profiles.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* Results table — DISCOVERED phase */}
          {browserPhase === "discovered" && (
            <div className="overflow-x-auto">
              {discoveriesLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
                </div>
              ) : (
                <table className="w-full text-xs" data-testid="discoveries-table">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500">
                      <th className="text-left p-2 font-medium">URL</th>
                      <th className="text-left p-2 font-medium">Username</th>
                      <th className="text-left p-2 font-medium">Source</th>
                      <th className="text-left p-2 font-medium">Status</th>
                      <th className="text-left p-2 font-medium">Discovered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(discoveriesData?.discoveries || []).map((d) => (
                      <tr
                        key={d.id}
                        className="border-b border-gray-900 hover:bg-gray-900/50"
                        data-testid={`row-discovery-${d.id}`}
                      >
                        <td className="p-2 text-gray-200 max-w-[200px] truncate">
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">
                            {d.url}
                          </a>
                        </td>
                        <td className="p-2 text-gray-400">{d.username || "-"}</td>
                        <td className="p-2 text-gray-500">{d.source}</td>
                        <td className="p-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            d.status === "enriched" ? "text-green-400 bg-green-900/30" :
                            d.status === "failed" ? "text-red-400 bg-red-900/30" :
                            "text-yellow-400 bg-yellow-900/30"
                          }`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="p-2 text-gray-500">{new Date(d.discoveredAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                    {(!discoveriesData?.discoveries || discoveriesData.discoveries.length === 0) && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-600">
                          No discovered URLs yet. Run a discovery to find cal.com links.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Pagination (shared) */}
          <div className="flex items-center justify-between p-2 border-t border-gray-800">
            <span className="text-[10px] text-gray-500" data-testid="text-profile-count">
              {browserPhase === "enriched"
                ? `${profilesData?.total ?? 0} profiles`
                : `${discoveriesData?.total ?? 0} URLs`}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                data-testid="button-profile-prev"
              >
                Prev
              </button>
              <span className="text-xs text-gray-500" data-testid="text-profile-page">{page}/{totalProfilePages}</span>
              <button
                onClick={() => setPage(Math.min(totalProfilePages, page + 1))}
                disabled={page >= totalProfilePages}
                className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                data-testid="button-profile-next"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PROFILE DETAIL MODAL */}
      {selectedProfile && selectedProfile.profile && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedProfileId(null)}
          data-testid="profile-modal-overlay"
        >
          <div
            className="bg-gray-950 border border-gray-700 rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            data-testid="profile-modal"
          >
            <div className="flex items-center justify-between p-3 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-semibold text-white">Profile Detail</span>
              </div>
              <button
                onClick={() => setSelectedProfileId(null)}
                className="text-gray-500 hover:text-gray-300 text-xs"
                data-testid="button-close-modal"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Header: avatar + name + bio */}
              <div className="flex items-start gap-4">
                {selectedProfile.profile.avatarUrl ? (
                  <img
                    src={selectedProfile.profile.avatarUrl}
                    alt={selectedProfile.profile.name || selectedProfile.profile.username}
                    className="w-16 h-16 rounded-full border border-gray-700 object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full border border-gray-700 bg-gray-900 flex items-center justify-center">
                    <User className="w-8 h-8 text-gray-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold text-white">
                    {selectedProfile.profile.name || selectedProfile.profile.username}
                  </div>
                  {selectedProfile.profile.companyName && (
                    <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Building2 className="w-3 h-3" />{selectedProfile.profile.companyName}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-0.5">@{selectedProfile.profile.username}</div>
                  {selectedProfile.profile.bio && (
                    <div className="text-xs text-gray-300 mt-2" data-testid="profile-bio">{selectedProfile.profile.bio}</div>
                  )}
                  <a
                    href={selectedProfile.profile.calUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 mt-2"
                    data-testid="link-cal-profile"
                  >
                    <ExternalLink className="w-3 h-3" />{selectedProfile.profile.calUrl.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              </div>

              {/* Badges row */}
              <div className="flex flex-wrap gap-2 text-[10px]">
                {selectedProfile.profile.industry && (
                  <span className="px-2 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-300 flex items-center gap-1">
                    <Tag className="w-3 h-3" />{selectedProfile.profile.industry}
                  </span>
                )}
                {selectedProfile.profile.industryBundle && (
                  <span className="px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300">
                    {selectedProfile.profile.industryBundle}
                  </span>
                )}
                {selectedProfile.profile.scope && (
                  <span className="px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 capitalize">
                    {selectedProfile.profile.scope}
                  </span>
                )}
                {selectedProfile.profile.isTeamProfile && (
                  <span className="px-2 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-300">
                    TEAM
                  </span>
                )}
                {selectedProfile.profile.timezone && (
                  <span className="px-2 py-0.5 rounded border border-gray-700 text-gray-400 flex items-center gap-1">
                    <Globe className="w-3 h-3" />{selectedProfile.profile.timezone}
                  </span>
                )}
                {selectedProfile.profile.location && (
                  <span className="px-2 py-0.5 rounded border border-gray-700 text-gray-400">
                    {selectedProfile.profile.location}
                  </span>
                )}
              </div>

              {/* Quality score bar */}
              {selectedProfile.profile.qualityScore !== null && selectedProfile.profile.qualityScore !== undefined && (
                <div className="space-y-1" data-testid="profile-quality-bar">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400 flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400" />Quality Score</span>
                    <span className={`px-1.5 py-0.5 rounded ${qualityLabel(selectedProfile.profile.qualityScore).color}`}>
                      {selectedProfile.profile.qualityScore} {qualityLabel(selectedProfile.profile.qualityScore).label}
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded h-2 overflow-hidden">
                    <div
                      className="bg-yellow-500 h-full"
                      style={{ width: `${selectedProfile.profile.qualityScore}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Event types */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3 h-3" />Event Types ({(selectedProfile.eventTypes || []).length})
                </div>
                {(selectedProfile.eventTypes || []).length > 0 ? (
                  <div className="space-y-1">
                    {selectedProfile.eventTypes.map((e) => (
                      <div key={e.id} className="border border-gray-800 rounded p-2 bg-gray-900/50" data-testid={`event-${e.id}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-200 font-medium">{e.title}</span>
                          <div className="flex items-center gap-2 text-[10px] text-gray-500">
                            {e.duration !== null && e.duration !== undefined && <span>{e.duration} min</span>}
                            {e.price !== null && e.price !== undefined && <span className="text-green-400">{e.price > 0 ? `$${e.price}` : "Free"}</span>}
                          </div>
                        </div>
                        {e.description && <div className="text-[10px] text-gray-500 mt-1">{e.description}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-700">No event types found.</div>
                )}
              </div>

              {/* Social links */}
              {selectedProfile.profile.socialLinks && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Social Links</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedProfile.profile.socialLinks.split(",").filter(Boolean).map((link, i) => (
                      <a
                        key={i}
                        href={link.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 border border-gray-700 rounded px-2 py-0.5"
                      >
                        <ExternalLink className="w-3 h-3" />{link.trim().replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer link */}
              <a
                href={selectedProfile.profile.calUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded transition-colors"
                data-testid="button-open-cal"
              >
                <ExternalLink className="w-4 h-4" />Open cal.com Profile
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}
