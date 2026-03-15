import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import {
  Flower2, Search, Play, Square, Download, Trash2, Heart, Phone, Globe,
  ChevronDown, ChevronUp, CheckSquare, XSquare, RefreshCw, Palmtree, Building2, Plane,
  Loader2, AlertTriangle, ExternalLink, Filter, Sparkles, ScanLine, RotateCcw, PhoneCall
} from "lucide-react";

interface HiveDirectory {
  id: string;
  name: string;
  baseUrl: string;
  scraperKey: string;
  enabled: boolean;
  status: string;
  region: string;
}

interface HiveCategory {
  id: string;
  name: string;
  slug: string;
  bundle: string;
  searchAliases: string[];
  isConsultingVariant: boolean;
}

interface HiveLocation {
  id: string;
  city: string;
  state: string;
  slug: string;
  population: number;
  tag: string | null;
}

interface HiveFlower {
  id: string;
  name: string;
  website: string;
  normalizedUrl: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  category: string;
  sourceDirectory: string;
  isFranchise: boolean;
  isAlive: boolean;
  lastChecked: string | null;
  beautyScore: number | null;
  beautyFlags: string | null;
  phoneValid: boolean | null;
  phoneChecked: string | null;
  createdAt: string;
}

interface HivePollen {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  category: string;
  sourceDirectory: string;
  crawlJobId: string | null;
  phoneValid: boolean | null;
  phoneChecked: string | null;
}

interface CrawlStatus {
  active: {
    jobId: string;
    running: boolean;
    totalCombos: number;
    completedCombos: number;
    flowersFound: number;
    pollenFound: number;
    maxResults: number | null;
    progress: number;
  } | null;
  recentJobs: any[];
}

interface HiveStats {
  totalFlowers: number;
  totalPollen: number;
  byDirectory: Record<string, number>;
  byCategory: Record<string, number>;
  directoryCount: number;
  categoryCount: number;
  locationCount: number;
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC"
];

const INTL_COUNTRIES = [
  "UK","DE","FR","NL","CH","IT","ES","IE","BE","AT","SE","DK","NO","FI",
  "PL","CZ","PT","RO","HU","GR",
  "JP","CN","HK","SG","KR","TW","IN","TH","ID","MY","PH","VN","AU","NZ",
  "AE","SA","QA","TR","IL","EG","KE","NG","ZA","MA","GH","TZ",
  "CA","MX","BR","AR","CO","CL","PE","PA","CR",
];

const ALL_REGIONS = [...US_STATES, ...INTL_COUNTRIES];

export default function HivePage() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const [rayOpen, setRayOpen] = useState(true);
  const [selectedDirs, setSelectedDirs] = useState<Set<string>>(new Set());
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [selectedLocs, setSelectedLocs] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("all");
  const [flowerSearch, setFlowerSearch] = useState("");
  const [pollenSearch, setPollenSearch] = useState("");
  const [pollenFilterCategory, setPollenFilterCategory] = useState("");
  const [pollenFilterState, setPollenFilterState] = useState("");
  const [pollenFilterDirectory, setPollenFilterDirectory] = useState("");
  const [pollenFilterBatch, setPollenFilterBatch] = useState("");
  const [pollenFilterIndustry, setPollenFilterIndustry] = useState("");
  const [pollenSortBy, setPollenSortBy] = useState("");
  const [flowerPage, setFlowerPage] = useState(1);
  const [pollenPage, setPollenPage] = useState(1);
  const [categorySearch, setCategorySearch] = useState("");
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const [locationSearch, setLocationSearch] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [filterAlive, setFilterAlive] = useState<string>("");
  const [filterPhoneValid, setFilterPhoneValid] = useState<string>("");
  const [pollenFilterPhoneValid, setPollenFilterPhoneValid] = useState<string>("");
  const [filterState, setFilterState] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterBatch, setFilterBatch] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [beauteousOnly, setBeauteousOnly] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const [maxResults, setMaxResults] = useState<string>("");
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);

  const { data: directories = [] } = useQuery<HiveDirectory[]>({ queryKey: ["/api/hive/directories"] });
  const { data: categories = [] } = useQuery<HiveCategory[]>({ queryKey: ["/api/hive/categories"] });
  const { data: locations = [] } = useQuery<HiveLocation[]>({ queryKey: ["/api/hive/locations"] });
  const { data: stats } = useQuery<HiveStats>({ queryKey: ["/api/hive/stats"], refetchInterval: 10000 });
  const { data: crawlStatus, refetch: refetchStatus } = useQuery<CrawlStatus>({ queryKey: ["/api/hive/crawl/status"], refetchInterval: 3000 });

  const flowerFilters: Record<string, string> = {};
  if (activeTab !== "all" && activeTab !== "pollen") flowerFilters.directory = activeTab;
  if (flowerSearch) flowerFilters.search = flowerSearch;
  if (filterIndustry) {
    const industryCatNames = categories.filter(c => c.bundle === filterIndustry).map(c => c.name);
    if (industryCatNames.length > 0) flowerFilters.categories = industryCatNames.join(",");
  } else if (filterCategory && filterCategory.startsWith("bundle:")) {
    const bundleName = filterCategory.slice(7);
    const bundleCatNames = categories.filter(c => c.bundle === bundleName).map(c => c.name);
    if (bundleCatNames.length > 0) flowerFilters.categories = bundleCatNames.join(",");
  } else if (filterCategory) flowerFilters.category = filterCategory;
  if (filterAlive) flowerFilters.alive = filterAlive;
  if (filterPhoneValid) flowerFilters.phoneValid = filterPhoneValid;
  if (filterState) flowerFilters.state = filterState;
  if (filterTag) flowerFilters.tag = filterTag;
  if (filterBatch) flowerFilters.crawlJobId = filterBatch;
  if (sortBy) flowerFilters.sortBy = sortBy;
  if (beauteousOnly) flowerFilters.beauteousOnly = "true";
  flowerFilters.page = String(flowerPage);
  flowerFilters.limit = "50";

  const flowerQs = new URLSearchParams(flowerFilters).toString();
  const { data: flowersData, isLoading: flowersLoading } = useQuery<{ flowers: HiveFlower[]; total: number }>({
    queryKey: ["/api/hive/flowers", flowerQs],
    queryFn: () => fetch(`/api/hive/flowers?${flowerQs}`, { credentials: "include" }).then(r => r.json()),
    enabled: activeTab !== "pollen",
    refetchInterval: 15000,
  });

  const pollenFilters: Record<string, string> = { search: pollenSearch, page: String(pollenPage), limit: "50" };
  if (pollenFilterIndustry) {
    const industryCatNames = categories.filter(c => c.bundle === pollenFilterIndustry).map(c => c.name);
    if (industryCatNames.length > 0) pollenFilters.categories = industryCatNames.join(",");
  } else if (pollenFilterCategory && pollenFilterCategory.startsWith("bundle:")) {
    const bundleName = pollenFilterCategory.slice(7);
    const bundleCatNames = categories.filter(c => c.bundle === bundleName).map(c => c.name);
    if (bundleCatNames.length > 0) pollenFilters.categories = bundleCatNames.join(",");
  } else if (pollenFilterCategory) pollenFilters.category = pollenFilterCategory;
  if (pollenFilterState) pollenFilters.state = pollenFilterState;
  if (pollenFilterDirectory) pollenFilters.directory = pollenFilterDirectory;
  if (pollenFilterBatch) pollenFilters.crawlJobId = pollenFilterBatch;
  if (pollenFilterPhoneValid) pollenFilters.phoneValid = pollenFilterPhoneValid;
  if (pollenSortBy) pollenFilters.sortBy = pollenSortBy;
  const pollenQs = new URLSearchParams(pollenFilters).toString();
  const { data: pollenData, isLoading: pollenLoading } = useQuery<{ pollen: HivePollen[]; total: number }>({
    queryKey: ["/api/hive/pollen", pollenQs],
    queryFn: () => fetch(`/api/hive/pollen?${pollenQs}`, { credentials: "include" }).then(r => r.json()),
    enabled: activeTab === "pollen",
  });

  const { data: jobLog } = useQuery<{ log: string[]; status: string }>({
    queryKey: ["/api/hive/crawl", viewingJobId, "log"],
    queryFn: () => fetch(`/api/hive/crawl/${viewingJobId}/log`, { credentials: "include" }).then(r => r.json()),
    enabled: !!viewingJobId,
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (directories.length > 0 && selectedDirs.size === 0) {
      const autoDeselect = new Set(["mapquest", "hotfrog", "ezlocal", "n49"]);
      setSelectedDirs(new Set(directories.filter(d => d.enabled && !autoDeselect.has(d.scraperKey)).map(d => d.id)));
    }
  }, [directories]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [jobLog?.log]);

  useEffect(() => {
    if (crawlStatus?.active?.jobId && !viewingJobId) {
      setViewingJobId(crawlStatus.active.jobId);
    }
  }, [crawlStatus?.active?.jobId]);

  const startCrawl = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hive/crawl", {
      directoryIds: Array.from(selectedDirs),
      categoryIds: Array.from(selectedCats),
      locationIds: Array.from(selectedLocs),
      maxResults: maxResults ? Number(maxResults) : undefined,
    }),
    onSuccess: async (res) => {
      const data = await res.json();
      setViewingJobId(data.jobId);
      toast({ title: "Ray of Grace launched!" });
      queryClient.invalidateQueries({ queryKey: ["/api/hive/crawl/status"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const stopCrawl = useMutation({
    mutationFn: () => apiRequest("POST", `/api/hive/crawl/${crawlStatus?.active?.jobId}/stop`),
    onSuccess: () => {
      toast({ title: "Stop requested" });
      refetchStatus();
    },
  });

  const deleteFlower = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/hive/flowers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.startsWith?.("/api/hive/flowers") || query.queryKey[0] === "/api/hive/flowers" });
      queryClient.invalidateQueries({ queryKey: ["/api/hive/stats"] });
    },
  });

  const completedCombosCount = useQuery<{ count: number }>({ queryKey: ["/api/hive/completed-combos/count"] });

  const clearScanHistory = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/hive/completed-combos"),
    onSuccess: () => {
      toast({ title: "Scan history cleared", description: "All combos can be re-scanned now." });
      queryClient.invalidateQueries({ queryKey: ["/api/hive/completed-combos/count"] });
    },
  });

  const healthCheck = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hive/health-check"),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Health check complete", description: `Checked: ${data.checked}, Alive: ${data.alive}, Dead: ${data.dead}` });
      queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.startsWith?.("/api/hive/flowers") || query.queryKey[0] === "/api/hive/flowers" });
    },
  });

  const beautyScan = useMutation({
    mutationFn: (rescan: boolean) => apiRequest("POST", "/api/hive/beauty-scan", { rescan }),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Beauty scan started", description: data.message || `${data.total} flowers queued` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: beautyScanStatus } = useQuery<{ running: boolean }>({
    queryKey: ["/api/hive/beauty-scan/status"],
    refetchInterval: 3000,
  });

  const prevScanRunning = useRef(false);
  useEffect(() => {
    if (prevScanRunning.current && beautyScanStatus && !beautyScanStatus.running) {
      queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.includes?.("/api/hive/flowers") });
      toast({ title: "Beauty scan complete" });
    }
    prevScanRunning.current = beautyScanStatus?.running || false;
  }, [beautyScanStatus?.running]);

  const phoneScan = useMutation({
    mutationFn: (opts: { rescan: boolean; target: string }) => apiRequest("POST", "/api/hive/phone-scan", opts),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Phone scan started", description: data.message || `${data.total} entries queued` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: phoneScanStatus } = useQuery<{ running: boolean; scanned: number; total: number; type: string }>({
    queryKey: ["/api/hive/phone-scan/status"],
    refetchInterval: 2000,
  });

  const prevPhoneScanRunning = useRef(false);
  useEffect(() => {
    if (prevPhoneScanRunning.current && phoneScanStatus && !phoneScanStatus.running) {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0] as string;
        return key?.includes?.("/api/hive/flowers") || key?.includes?.("/api/hive/pollen");
      }});
      toast({ title: "Phone scan complete" });
    }
    prevPhoneScanRunning.current = phoneScanStatus?.running || false;
  }, [phoneScanStatus?.running]);

  const bundles = [...new Set(categories.map(c => c.bundle))].sort();

  const toggleBundle = (bundle: string) => {
    const bundleCats = categories.filter(c => c.bundle === bundle);
    const allSelected = bundleCats.every(c => selectedCats.has(c.id));
    const next = new Set(selectedCats);
    bundleCats.forEach(c => allSelected ? next.delete(c.id) : next.add(c.id));
    setSelectedCats(next);
  };

  const filteredLocations = locations.filter(l =>
    (!locationSearch || l.city.toLowerCase().includes(locationSearch.toLowerCase())) &&
    (!selectedState || l.state === selectedState)
  ).sort((a, b) => {
    const aSelected = selectedLocs.has(a.id) ? 0 : 1;
    const bSelected = selectedLocs.has(b.id) ? 0 : 1;
    if (aSelected !== bSelected) return aSelected - bSelected;
    const aTravel = a.tag === "travel" ? 0 : 1;
    const bTravel = b.tag === "travel" ? 0 : 1;
    if (aTravel !== bTravel) return aTravel - bTravel;
    return a.city.localeCompare(b.city);
  });

  const selectAllLocations = () => {
    const ids = filteredLocations.map(l => l.id);
    setSelectedLocs(new Set(ids));
  };

  const clearAllLocations = () => setSelectedLocs(new Set());

  const totalFlowerPages = flowersData ? Math.ceil(flowersData.total / 50) : 1;
  const totalPollenPages = pollenData ? Math.ceil(pollenData.total / 50) : 1;

  const directoryTabs = directories.filter(d => d.enabled);

  return (
    <div className="min-h-screen bg-black text-gray-100 p-4 space-y-4" data-testid="hive-page">
      <div className="flex items-center gap-3 mb-4">
        <Flower2 className="w-6 h-6 text-pink-400" />
        <h1 className="text-xl font-bold text-white tracking-wide" data-testid="text-page-title">Beauteous Brigade</h1>
        <span className="text-xs text-gray-500 ml-2">Private Business Discovery Engine</span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="stats-bar">
          <StatCard label="Total Flowers" value={stats.totalFlowers} color="text-pink-400" />
          <StatCard label="Total Pollen" value={stats.totalPollen} color="text-yellow-400" />
          <StatCard label="Categories" value={stats.categoryCount} color="text-blue-400" />
          <StatCard label="Locations" value={stats.locationCount} color="text-green-400" />
          <StatCard label="Directories" value={stats.directoryCount} color="text-purple-400" />
        </div>
      )}

      <div className="border border-gray-700 rounded-lg bg-gray-950" data-testid="ray-of-grace-panel">
        <button
          onClick={() => setRayOpen(!rayOpen)}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-900 transition-colors"
          data-testid="button-toggle-ray"
        >
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-pink-400" />
            <span className="text-sm font-semibold text-white">Ray of Grace — Crawl Engine</span>
            {crawlStatus?.active && (
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full animate-pulse">RUNNING</span>
            )}
          </div>
          {rayOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>

        {rayOpen && (
          <div className="p-4 border-t border-gray-800 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Directories</label>
                <div className="space-y-1 max-h-32 overflow-y-auto border border-gray-800 rounded p-2 bg-gray-900/50">
                  {directories.map(d => (
                    <label key={d.id} className="flex items-center gap-2 text-xs cursor-pointer" data-testid={`checkbox-dir-${d.scraperKey}`}>
                      <input
                        type="checkbox"
                        checked={selectedDirs.has(d.id)}
                        onChange={() => {
                          const next = new Set(selectedDirs);
                          next.has(d.id) ? next.delete(d.id) : next.add(d.id);
                          setSelectedDirs(next);
                        }}
                        className="rounded"
                        disabled={!d.enabled}
                      />
                      <span className={d.enabled ? "text-gray-200" : "text-gray-600 line-through"}>{d.name}</span>
                      {d.region === "us" && <span className="text-blue-400 text-[10px] font-mono" data-testid={`badge-region-${d.scraperKey}`}>us</span>}
                      {d.region === "intl" && <span className="text-emerald-400 text-[10px] font-mono" data-testid={`badge-region-${d.scraperKey}`}>intl</span>}
                      {d.region === "global" && <span className="text-amber-400 text-[10px] font-mono" data-testid={`badge-region-${d.scraperKey}`}>global</span>}
                      {d.status === "working" && <span className="text-green-500 text-[10px]">OK</span>}
                      {d.status === "blocked" && <span className="text-red-500 text-[10px]">BLOCKED</span>}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Categories ({selectedCats.size} selected)
                </label>
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={categorySearch}
                  onChange={e => setCategorySearch(e.target.value)}
                  className="w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 placeholder-gray-600"
                  data-testid="input-category-search"
                />
                <div className="max-h-64 overflow-y-auto border border-gray-800 rounded bg-gray-900/50">
                  {bundles.map(b => {
                    const bundleCats = categories.filter(c => c.bundle === b);
                    const visibleCats = bundleCats.filter(c =>
                      !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase()) || c.bundle.toLowerCase().includes(categorySearch.toLowerCase())
                    );
                    if (categorySearch && visibleCats.length === 0) return null;
                    const selectedCount = bundleCats.filter(c => selectedCats.has(c.id)).length;
                    const allSelected = bundleCats.length > 0 && bundleCats.every(c => selectedCats.has(c.id));
                    const isExpanded = expandedBundles.has(b) || !!categorySearch;
                    return (
                      <div key={b} className="border-b border-gray-800 last:border-b-0">
                        <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-gray-800/50 cursor-pointer" data-testid={`bundle-header-${b.toLowerCase().replace(/\s+/g, "-")}`}>
                          <button
                            onClick={() => {
                              const next = new Set(expandedBundles);
                              next.has(b) ? next.delete(b) : next.add(b);
                              setExpandedBundles(next);
                            }}
                            className="text-gray-500 hover:text-gray-300 text-[10px] w-4 flex-shrink-0"
                            data-testid={`button-expand-${b.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            {isExpanded ? "▼" : "▶"}
                          </button>
                          <button
                            onClick={() => toggleBundle(b)}
                            className={`flex-1 text-left text-[11px] font-medium transition-colors ${
                              allSelected ? "text-pink-300" : selectedCount > 0 ? "text-pink-400/70" : "text-gray-400"
                            }`}
                            data-testid={`button-bundle-${b.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            {b}
                          </button>
                          <span className={`text-[10px] ${allSelected ? "text-pink-400" : selectedCount > 0 ? "text-pink-500/60" : "text-gray-600"}`}>
                            {selectedCount}/{bundleCats.length}
                          </span>
                        </div>
                        {isExpanded && (
                          <div className="pl-6 pr-2 pb-1.5 space-y-0.5">
                            {(categorySearch ? visibleCats : bundleCats).map(c => (
                              <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer" data-testid={`checkbox-cat-${c.slug}`}>
                                <input
                                  type="checkbox"
                                  checked={selectedCats.has(c.id)}
                                  onChange={() => {
                                    const next = new Set(selectedCats);
                                    next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                                    setSelectedCats(next);
                                  }}
                                  className="rounded"
                                />
                                <span className="text-gray-300">{c.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Locations ({selectedLocs.size} selected)
                </label>
                <div className="flex gap-1 items-center">
                  <input
                    type="text"
                    placeholder="Search cities..."
                    value={locationSearch}
                    onChange={e => setLocationSearch(e.target.value)}
                    className="flex-1 text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 placeholder-gray-600"
                    data-testid="input-location-search"
                  />
                  <select
                    value={selectedState}
                    onChange={e => setSelectedState(e.target.value)}
                    className="text-xs bg-gray-900 border border-gray-700 rounded px-1 py-1 text-gray-200"
                    data-testid="select-state-filter"
                  >
                    <option value="">All Regions</option>
                    <optgroup label="US States">
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </optgroup>
                    <optgroup label="International">
                      {INTL_COUNTRIES.map(s => <option key={s} value={s}>{s}</option>)}
                    </optgroup>
                  </select>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={selectAllLocations}
                    className="text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200"
                    data-testid="button-select-all-locations"
                  >
                    <CheckSquare className="w-3 h-3 inline mr-1" />Select All
                  </button>
                  <button
                    onClick={clearAllLocations}
                    className="text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200"
                    data-testid="button-clear-all-locations"
                  >
                    <XSquare className="w-3 h-3 inline mr-1" />Clear
                  </button>
                  <span className="text-gray-600 text-[10px] flex items-center px-1">|</span>
                  <button
                    onClick={() => {
                      const travelLocs = locations.filter(l => l.tag === "travel");
                      const allSelected = travelLocs.every(l => selectedLocs.has(l.id));
                      const next = new Set(selectedLocs);
                      travelLocs.forEach(l => allSelected ? next.delete(l.id) : next.add(l.id));
                      setSelectedLocs(next);
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      locations.filter(l => l.tag === "travel").length > 0 &&
                      locations.filter(l => l.tag === "travel").every(l => selectedLocs.has(l.id))
                        ? "border-amber-500 bg-amber-500/20 text-amber-300"
                        : "border-gray-700 text-gray-400 hover:text-gray-200"
                    }`}
                    data-testid="button-tag-travel"
                  >
                    <Palmtree className="w-3 h-3 inline mr-0.5" />Travel ({locations.filter(l => l.tag === "travel").length})
                  </button>
                  <button
                    onClick={() => {
                      const metroLocs = locations.filter(l => !l.tag);
                      const allSelected = metroLocs.every(l => selectedLocs.has(l.id));
                      const nextLocs = new Set(selectedLocs);
                      metroLocs.forEach(l => allSelected ? nextLocs.delete(l.id) : nextLocs.add(l.id));
                      setSelectedLocs(nextLocs);
                      if (!allSelected) {
                        const nextDirs = new Set(selectedDirs);
                        directories.filter(d => d.enabled && (d.region === "us" || d.region === "global")).forEach(d => nextDirs.add(d.id));
                        directories.filter(d => d.region === "intl").forEach(d => nextDirs.delete(d.id));
                        setSelectedDirs(nextDirs);
                      }
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      locations.filter(l => !l.tag).length > 0 &&
                      locations.filter(l => !l.tag).every(l => selectedLocs.has(l.id))
                        ? "border-blue-500 bg-blue-500/20 text-blue-300"
                        : "border-gray-700 text-gray-400 hover:text-gray-200"
                    }`}
                    data-testid="button-tag-metro"
                  >
                    <Building2 className="w-3 h-3 inline mr-0.5" />Metro ({locations.filter(l => !l.tag && US_STATES.includes(l.state)).length})
                  </button>
                  <button
                    onClick={() => {
                      const intlLocs = locations.filter(l => l.tag === "intl");
                      const allSelected = intlLocs.every(l => selectedLocs.has(l.id));
                      const nextLocs = new Set(selectedLocs);
                      intlLocs.forEach(l => allSelected ? nextLocs.delete(l.id) : nextLocs.add(l.id));
                      setSelectedLocs(nextLocs);
                      if (!allSelected) {
                        const nextDirs = new Set(selectedDirs);
                        directories.filter(d => d.enabled && (d.region === "intl" || d.region === "global")).forEach(d => nextDirs.add(d.id));
                        directories.filter(d => d.region === "us").forEach(d => nextDirs.delete(d.id));
                        setSelectedDirs(nextDirs);
                      }
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      locations.filter(l => l.tag === "intl").length > 0 &&
                      locations.filter(l => l.tag === "intl").every(l => selectedLocs.has(l.id))
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                        : "border-gray-700 text-gray-400 hover:text-gray-200"
                    }`}
                    data-testid="button-tag-international"
                  >
                    <Globe className="w-3 h-3 inline mr-0.5" />International ({locations.filter(l => l.tag === "intl").length})
                  </button>
                </div>
                <div className="space-y-0.5 max-h-52 overflow-y-auto border border-gray-800 rounded p-2 bg-gray-900/50">
                  {filteredLocations.map(l => (
                    <label key={l.id} className="flex items-center gap-2 text-xs cursor-pointer" data-testid={`checkbox-loc-${l.slug}`}>
                      <input
                        type="checkbox"
                        checked={selectedLocs.has(l.id)}
                        onChange={() => {
                          const next = new Set(selectedLocs);
                          next.has(l.id) ? next.delete(l.id) : next.add(l.id);
                          setSelectedLocs(next);
                        }}
                        className="rounded"
                      />
                      <span className="text-gray-200">{l.city}, {l.state}</span>
                      {l.tag === "intl" && <Globe className="w-3 h-3 text-emerald-500 inline" />}
                      {l.tag === "travel" && <Plane className="w-3 h-3 text-amber-500 inline" data-testid={`icon-travel-${l.slug}`} />}
                      <span className="text-gray-600 text-[10px]">{l.population.toLocaleString()}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {(() => {
              const selDirArr = directories.filter(d => selectedDirs.has(d.id));
              const selLocArr = locations.filter(l => selectedLocs.has(l.id));
              const hasUSOnly = selDirArr.some(d => d.region === "us");
              const hasIntlOnly = selDirArr.some(d => d.region === "intl");
              const hasIntlLocs = selLocArr.some(l => l.tag === "intl");
              const hasUSLocs = selLocArr.some(l => l.tag !== "intl");
              const mismatch = (hasUSOnly && hasIntlLocs && !hasUSLocs) || (hasIntlOnly && hasUSLocs && !hasIntlLocs);
              if (!mismatch) return null;
              const msg = hasUSOnly && hasIntlLocs
                ? "us-only directories selected with international locations — those combos will be skipped by the engine"
                : "intl-only directories selected with us locations — those combos will be skipped by the engine";
              return (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-900/30 border border-amber-700/50 rounded text-amber-300 text-xs" data-testid="warning-region-mismatch">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{msg}</span>
                </div>
              );
            })()}

            <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
              {!crawlStatus?.active ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 whitespace-nowrap">Max flowers:</label>
                    <select
                      value={maxResults}
                      onChange={(e) => setMaxResults(e.target.value)}
                      className="w-36 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:border-pink-500 focus:outline-none"
                      data-testid="input-max-results"
                    >
                      <option value="">Unlimited</option>
                      <option value="100">100</option>
                      <option value="500">500</option>
                      <option value="1000">1,000</option>
                      <option value="5000">5,000</option>
                      <option value="10000">10,000</option>
                      <option value="50000">50,000</option>
                      <option value="100000">100,000</option>
                      <option value="500000">500,000</option>
                      <option value="1000000">1,000,000</option>
                    </select>
                  </div>
                  <button
                    onClick={() => startCrawl.mutate()}
                    disabled={selectedDirs.size === 0 || selectedCats.size === 0 || selectedLocs.size === 0 || startCrawl.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold rounded transition-colors"
                    data-testid="button-send-ray"
                  >
                    {startCrawl.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Send Ray of Grace
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => stopCrawl.mutate()}
                  disabled={stopCrawl.isPending}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-base font-bold rounded ring-2 ring-red-400 animate-pulse transition-colors"
                  data-testid="button-stop-crawl"
                >
                  <Square className="w-5 h-5" />
                  Stop Crawl
                </button>
              )}

              {crawlStatus?.active && (
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span data-testid="text-progress">{crawlStatus.active.progress}% ({crawlStatus.active.completedCombos}/{crawlStatus.active.totalCombos})</span>
                  <span className="text-pink-400" data-testid="text-flowers-found">Flowers: {crawlStatus.active.flowersFound}{crawlStatus.active.maxResults ? ` / ${crawlStatus.active.maxResults}` : ""}</span>
                  <span className="text-yellow-400" data-testid="text-pollen-found">Pollen: {crawlStatus.active.pollenFound}</span>
                </div>
              )}

              <div className="flex-1" />

              {(completedCombosCount.data?.count ?? 0) > 0 && (
                <button
                  onClick={() => clearScanHistory.mutate()}
                  disabled={clearScanHistory.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-700 rounded text-gray-400 hover:text-orange-300 transition-colors"
                  data-testid="button-clear-scan-history"
                >
                  {clearScanHistory.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  Clear Scan History ({completedCombosCount.data?.count})
                </button>
              )}

              <button
                onClick={() => healthCheck.mutate()}
                disabled={healthCheck.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
                data-testid="button-health-check"
              >
                {healthCheck.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Heart className="w-3 h-3" />}
                Health Check
              </button>
            </div>

            {viewingJobId && jobLog && (
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-400">Crawl Log</span>
                  <span className="text-[10px] text-gray-600">{jobLog.status}</span>
                </div>
                <div
                  ref={logRef}
                  className="bg-black border border-gray-800 rounded p-2 max-h-40 overflow-y-auto font-mono text-[10px] text-gray-500 space-y-0.5"
                  data-testid="crawl-log"
                >
                  {(jobLog.log || []).map((line, i) => (
                    <div key={i} className={line.includes("Error") ? "text-red-400" : line.includes("+") ? "text-green-400" : ""}>
                      {line}
                    </div>
                  ))}
                  {(!jobLog.log || jobLog.log.length === 0) && <div className="text-gray-700">No log entries yet...</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border border-gray-700 rounded-lg bg-gray-950" data-testid="flowers-panel">
        <div className="flex items-center gap-1 p-2 border-b border-gray-800 overflow-x-auto">
          <TabButton active={activeTab === "all"} onClick={() => { setActiveTab("all"); setFlowerPage(1); }} label="All" count={stats?.totalFlowers} testId="tab-all" />
          {directoryTabs.map(d => (
            <TabButton
              key={d.id}
              active={activeTab === d.name}
              onClick={() => { setActiveTab(d.name); setFlowerPage(1); }}
              label={d.name}
              count={stats?.byDirectory?.[d.name]}
              testId={`tab-${d.scraperKey}`}
            />
          ))}
          <TabButton active={activeTab === "pollen"} onClick={() => { setActiveTab("pollen"); setPollenPage(1); }} label="Pollen" count={stats?.totalPollen} color="text-yellow-400" testId="tab-pollen" />
        </div>

        {activeTab !== "pollen" && (
          <div className="flex flex-wrap items-center gap-2 p-2 border-b border-gray-800">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
              <input
                type="text"
                placeholder="Search flowers by name or website..."
                value={flowerSearch}
                onChange={e => { setFlowerSearch(e.target.value); setFlowerPage(1); }}
                className="w-full text-xs bg-gray-900 border border-gray-700 rounded pl-7 pr-2 py-1.5 text-gray-200 placeholder-gray-600"
                data-testid="input-flower-search"
              />
            </div>
            <select
              value={filterCategory}
              onChange={e => { setFilterCategory(e.target.value); setFilterIndustry(""); setFlowerPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 max-w-[200px]"
              data-testid="select-filter-category"
            >
              <option value="">All Categories</option>
              {[...new Set(categories.map(c => c.bundle))].sort().map(bundle => (
                <optgroup key={bundle} label={bundle}>
                  <option value={`bundle:${bundle}`}>★ {bundle} (all)</option>
                  {categories.filter(c => c.bundle === bundle).sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={filterAlive}
              onChange={e => { setFilterAlive(e.target.value); setFlowerPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
              data-testid="select-filter-alive"
            >
              <option value="">All Status</option>
              <option value="true">Alive</option>
              <option value="false">Dead</option>
            </select>
            <select
              value={filterPhoneValid}
              onChange={e => { setFilterPhoneValid(e.target.value); setFlowerPage(1); }}
              className={`text-xs bg-gray-900 border rounded px-2 py-1.5 ${filterPhoneValid ? "border-cyan-500 text-cyan-300" : "border-gray-700 text-gray-200"}`}
              data-testid="select-filter-phone"
            >
              <option value="">All Phones</option>
              <option value="true">Verified</option>
              <option value="false">Invalid</option>
              <option value="nophone">No Phone</option>
              <option value="unchecked">Unchecked</option>
            </select>
            <select
              value={filterState}
              onChange={e => { setFilterState(e.target.value); setFilterTag(""); setFlowerPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 max-w-[120px]"
              data-testid="select-filter-state"
            >
              <option value="">All Regions</option>
              <optgroup label="US States">
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </optgroup>
              <optgroup label="International">
                {INTL_COUNTRIES.map(s => <option key={s} value={s}>{s}</option>)}
              </optgroup>
            </select>
            <button
              onClick={() => { setFilterState(filterState === "HI" ? "" : "HI"); setFilterTag(""); setFlowerPage(1); }}
              className={`text-[10px] px-2 py-1.5 rounded border ${
                filterState === "HI"
                  ? "border-amber-500 bg-amber-500/20 text-amber-300"
                  : "border-gray-700 text-gray-400 hover:text-gray-200"
              }`}
              data-testid="button-filter-hawaii"
            >
              <Palmtree className="w-3 h-3 inline mr-0.5" />Hawaii
            </button>
            <button
              onClick={() => { setFilterTag(filterTag === "travel" ? "" : "travel"); setFilterState(""); setFlowerPage(1); }}
              className={`text-[10px] px-2 py-1.5 rounded border ${
                filterTag === "travel"
                  ? "border-amber-500 bg-amber-500/20 text-amber-300"
                  : "border-gray-700 text-gray-400 hover:text-gray-200"
              }`}
              data-testid="button-filter-travel"
            >
              <Plane className="w-3 h-3 inline mr-0.5" />Travel
            </button>
            <select
              value={filterBatch}
              onChange={e => { setFilterBatch(e.target.value); setFlowerPage(1); }}
              className={`text-xs bg-gray-900 border rounded px-2 py-1.5 max-w-[180px] ${filterBatch ? "border-purple-500 text-purple-300" : "border-gray-700 text-gray-200"}`}
              data-testid="select-filter-batch"
            >
              <option value="">All Batches</option>
              {(crawlStatus?.recentJobs || []).map((job: any) => (
                <option key={job.id} value={job.id}>
                  {job.startedAt ? new Date(job.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "?"} — {job.flowersFound || 0} flowers
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setFlowerPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
              data-testid="select-sort-by"
            >
              <option value="">Newest</option>
              <option value="category">By Category</option>
              <option value="state">By State</option>
              <option value="beauty">Most Beauteous</option>
              <option value="phone">Phone Verified</option>
              <option value="name">Name A-Z</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" data-testid="checkbox-beauteous-only">
              <input
                type="checkbox"
                checked={beauteousOnly}
                onChange={e => { setBeauteousOnly(e.target.checked); setFlowerPage(1); }}
                className="rounded"
              />
              <Sparkles className="w-3 h-3 text-yellow-400" />
              <span className="text-yellow-400 whitespace-nowrap">Pristine Only</span>
            </label>
            <button
              onClick={() => beautyScan.mutate(false)}
              disabled={beautyScan.isPending || beautyScanStatus?.running}
              className="flex items-center gap-1 text-xs px-2 py-1.5 border border-gray-700 rounded text-gray-400 hover:text-yellow-300 transition-colors disabled:opacity-30"
              data-testid="button-beauty-scan"
            >
              {beautyScanStatus?.running ? <Loader2 className="w-3 h-3 animate-spin" /> : <ScanLine className="w-3 h-3" />}
              {beautyScanStatus?.running ? "Scanning..." : "Beauty Scan"}
            </button>
            <button
              onClick={() => phoneScan.mutate({ rescan: false, target: "flowers" })}
              disabled={phoneScan.isPending || phoneScanStatus?.running}
              className="flex items-center gap-1 text-xs px-2 py-1.5 border border-gray-700 rounded text-gray-400 hover:text-cyan-300 transition-colors disabled:opacity-30"
              data-testid="button-phone-scan"
            >
              {phoneScanStatus?.running && phoneScanStatus.type === "flowers" ? <Loader2 className="w-3 h-3 animate-spin" /> : <PhoneCall className="w-3 h-3" />}
              {phoneScanStatus?.running && phoneScanStatus.type === "flowers" ? `${phoneScanStatus.scanned}/${phoneScanStatus.total}` : "Phone Scan"}
            </button>
            <a
              href={`/api/hive/export?${new URLSearchParams(Object.fromEntries(Object.entries(flowerFilters).filter(([k]) => k !== "page" && k !== "limit"))).toString()}`}
              className="flex items-center gap-1 text-xs px-2 py-1.5 border border-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
              data-testid="button-download-csv"
            >
              <Download className="w-3 h-3" />CSV
            </a>
          </div>
        )}

        {activeTab !== "pollen" && bundles.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-800 overflow-x-auto" data-testid="flower-industry-filter">
            <Filter className="w-3 h-3 text-gray-600 flex-shrink-0" />
            {bundles.map(b => (
              <button
                key={b}
                onClick={() => { setFilterIndustry(filterIndustry === b ? "" : b); setFilterCategory(""); setFlowerPage(1); }}
                className={`text-[10px] px-2 py-1 rounded border whitespace-nowrap transition-colors ${
                  filterIndustry === b
                    ? "border-amber-500 bg-amber-500/20 text-amber-300"
                    : "border-gray-700 text-gray-500 hover:text-gray-300"
                }`}
                data-testid={`button-industry-${b.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {b}
              </button>
            ))}
          </div>
        )}

        {activeTab === "pollen" && (
          <div className="flex flex-wrap items-center gap-2 p-2 border-b border-gray-800">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
              <input
                type="text"
                placeholder="Search pollen by name..."
                value={pollenSearch}
                onChange={e => { setPollenSearch(e.target.value); setPollenPage(1); }}
                className="w-full text-xs bg-gray-900 border border-gray-700 rounded pl-7 pr-2 py-1.5 text-gray-200 placeholder-gray-600"
                data-testid="input-pollen-search"
              />
            </div>
            <select
              value={pollenFilterCategory}
              onChange={e => { setPollenFilterCategory(e.target.value); setPollenFilterIndustry(""); setPollenPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 max-w-[200px]"
              data-testid="select-pollen-filter-category"
            >
              <option value="">All Categories</option>
              {[...new Set(categories.map(c => c.bundle))].sort().map(bundle => (
                <optgroup key={bundle} label={bundle}>
                  <option value={`bundle:${bundle}`}>★ {bundle} (all)</option>
                  {categories.filter(c => c.bundle === bundle).sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={pollenFilterState}
              onChange={e => { setPollenFilterState(e.target.value); setPollenPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 max-w-[120px]"
              data-testid="select-pollen-filter-state"
            >
              <option value="">All Regions</option>
              <optgroup label="US States">
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </optgroup>
              <optgroup label="International">
                {INTL_COUNTRIES.map(s => <option key={s} value={s}>{s}</option>)}
              </optgroup>
            </select>
            <select
              value={pollenFilterDirectory}
              onChange={e => { setPollenFilterDirectory(e.target.value); setPollenPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 max-w-[150px]"
              data-testid="select-pollen-filter-directory"
            >
              <option value="">All Sources</option>
              {directories.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
            <select
              value={pollenFilterBatch}
              onChange={e => { setPollenFilterBatch(e.target.value); setPollenPage(1); }}
              className={`text-xs bg-gray-900 border rounded px-2 py-1.5 max-w-[180px] ${pollenFilterBatch ? "border-purple-500 text-purple-300" : "border-gray-700 text-gray-200"}`}
              data-testid="select-pollen-filter-batch"
            >
              <option value="">All Batches</option>
              {(crawlStatus?.recentJobs || []).map((job: any) => (
                <option key={job.id} value={job.id}>
                  {job.startedAt ? new Date(job.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "?"} — {job.pollenFound || 0} pollen
                </option>
              ))}
            </select>
            <select
              value={pollenFilterPhoneValid}
              onChange={e => { setPollenFilterPhoneValid(e.target.value); setPollenPage(1); }}
              className={`text-xs bg-gray-900 border rounded px-2 py-1.5 ${pollenFilterPhoneValid ? "border-cyan-500 text-cyan-300" : "border-gray-700 text-gray-200"}`}
              data-testid="select-pollen-filter-phone"
            >
              <option value="">All Phones</option>
              <option value="true">Verified</option>
              <option value="false">Invalid</option>
              <option value="nophone">No Phone</option>
              <option value="unchecked">Unchecked</option>
            </select>
            <select
              value={pollenSortBy}
              onChange={e => { setPollenSortBy(e.target.value); setPollenPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200"
              data-testid="select-pollen-sort-by"
            >
              <option value="">Newest</option>
              <option value="category">By Category</option>
              <option value="state">By State</option>
              <option value="phone">Phone Verified</option>
              <option value="name">Name A-Z</option>
            </select>
            <button
              onClick={() => phoneScan.mutate({ rescan: false, target: "pollen" })}
              disabled={phoneScan.isPending || phoneScanStatus?.running}
              className="flex items-center gap-1 text-xs px-2 py-1.5 border border-gray-700 rounded text-gray-400 hover:text-cyan-300 transition-colors disabled:opacity-30"
              data-testid="button-pollen-phone-scan"
            >
              {phoneScanStatus?.running && phoneScanStatus.type === "pollen" ? <Loader2 className="w-3 h-3 animate-spin" /> : <PhoneCall className="w-3 h-3" />}
              {phoneScanStatus?.running && phoneScanStatus.type === "pollen" ? `${phoneScanStatus.scanned}/${phoneScanStatus.total}` : "Phone Scan"}
            </button>
            <a
              href={`/api/hive/export-pollen?${new URLSearchParams(Object.fromEntries(Object.entries(pollenFilters).filter(([k]) => k !== "page" && k !== "limit"))).toString()}`}
              className="flex items-center gap-1 text-xs px-2 py-1.5 border border-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
              data-testid="button-download-pollen-csv"
            >
              <Download className="w-3 h-3" />CSV
            </a>
          </div>
        )}

        {activeTab === "pollen" && bundles.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-800 overflow-x-auto" data-testid="pollen-industry-filter">
            <Filter className="w-3 h-3 text-gray-600 flex-shrink-0" />
            {bundles.map(b => (
              <button
                key={b}
                onClick={() => { setPollenFilterIndustry(pollenFilterIndustry === b ? "" : b); setPollenFilterCategory(""); setPollenPage(1); }}
                className={`text-[10px] px-2 py-1 rounded border whitespace-nowrap transition-colors ${
                  pollenFilterIndustry === b
                    ? "border-amber-500 bg-amber-500/20 text-amber-300"
                    : "border-gray-700 text-gray-500 hover:text-gray-300"
                }`}
                data-testid={`button-pollen-industry-${b.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {b}
              </button>
            ))}
          </div>
        )}

        {activeTab !== "pollen" && (
          <div className="overflow-x-auto">
            {flowersLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
              </div>
            ) : (
              <>
                <table className="w-full text-xs" data-testid="flowers-table">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500">
                      <th className="text-left p-2 font-medium">Name</th>
                      <th className="text-left p-2 font-medium">Website</th>
                      <th className="text-left p-2 font-medium">City/State</th>
                      <th className="text-left p-2 font-medium">Category</th>
                      <th className="text-left p-2 font-medium">Phone</th>
                      <th className="text-left p-2 font-medium">Source</th>
                      <th className="text-center p-2 font-medium">Beauty</th>
                      <th className="text-center p-2 font-medium">Ph. Auth</th>
                      <th className="text-center p-2 font-medium">Status</th>
                      <th className="text-center p-2 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(flowersData?.flowers || []).map(f => (
                      <tr key={f.id} className="border-b border-gray-900 hover:bg-gray-900/50" data-testid={`row-flower-${f.id}`}>
                        <td className="p-2 text-gray-200 font-medium max-w-[200px] truncate">
                          {f.name}
                          {f.isFranchise && <span className="ml-1 text-[9px] text-orange-400 bg-orange-900/30 px-1 rounded">FRANCHISE</span>}
                        </td>
                        <td className="p-2">
                          <a href={f.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1 max-w-[200px] truncate" data-testid={`link-website-${f.id}`}>
                            {f.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                            <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                          </a>
                        </td>
                        <td className="p-2 text-gray-400">{f.city}{f.state ? `, ${f.state}` : ""}</td>
                        <td className="p-2 text-gray-400">{f.category}</td>
                        <td className="p-2 text-gray-400">{f.phone || "-"}</td>
                        <td className="p-2 text-gray-500">{f.sourceDirectory}</td>
                        <td className="p-2 text-center">
                          <BeautyBadge score={f.beautyScore} flags={f.beautyFlags} />
                        </td>
                        <td className="p-2 text-center">
                          <PhoneBadge valid={f.phoneValid} checked={f.phoneChecked} />
                        </td>
                        <td className="p-2 text-center">
                          {f.lastChecked ? (
                            f.isAlive
                              ? <span className="text-green-400 text-[10px]">ALIVE</span>
                              : <span className="text-red-400 text-[10px]">DEAD</span>
                          ) : (
                            <span className="text-gray-600 text-[10px]">—</span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => {
                              if (confirm(`Delete "${f.name}"?`)) deleteFlower.mutate(f.id);
                            }}
                            className="text-gray-600 hover:text-red-400 transition-colors"
                            data-testid={`button-delete-flower-${f.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(!flowersData?.flowers || flowersData.flowers.length === 0) && (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-gray-600">
                          No flowers yet. Run a Ray of Grace crawl to discover businesses.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {flowersData && flowersData.total > 50 && (
                  <div className="flex items-center justify-between p-2 border-t border-gray-800">
                    <span className="text-[10px] text-gray-500" data-testid="text-flower-count">{flowersData.total} flowers total</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setFlowerPage(Math.max(1, flowerPage - 1))}
                        disabled={flowerPage === 1}
                        className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                        data-testid="button-flower-prev"
                      >
                        Prev
                      </button>
                      <span className="text-xs text-gray-500" data-testid="text-flower-page">{flowerPage}/{totalFlowerPages}</span>
                      <button
                        onClick={() => setFlowerPage(Math.min(totalFlowerPages, flowerPage + 1))}
                        disabled={flowerPage >= totalFlowerPages}
                        className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                        data-testid="button-flower-next"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "pollen" && (
          <div className="overflow-x-auto">
            {pollenLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
              </div>
            ) : (
              <>
                <table className="w-full text-xs" data-testid="pollen-table">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500">
                      <th className="text-left p-2 font-medium">Name</th>
                      <th className="text-left p-2 font-medium">City/State</th>
                      <th className="text-left p-2 font-medium">Category</th>
                      <th className="text-left p-2 font-medium">Phone</th>
                      <th className="text-center p-2 font-medium">Ph. Auth</th>
                      <th className="text-left p-2 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pollenData?.pollen || []).map(p => (
                      <tr key={p.id} className="border-b border-gray-900 hover:bg-gray-900/50" data-testid={`row-pollen-${p.id}`}>
                        <td className="p-2 text-gray-200 font-medium">{p.name}</td>
                        <td className="p-2 text-gray-400">{p.city}{p.state ? `, ${p.state}` : ""}</td>
                        <td className="p-2 text-gray-400">{p.category}</td>
                        <td className="p-2 text-gray-400">{p.phone || "-"}</td>
                        <td className="p-2 text-center">
                          <PhoneBadge valid={p.phoneValid} checked={p.phoneChecked} />
                        </td>
                        <td className="p-2 text-gray-500">{p.sourceDirectory}</td>
                      </tr>
                    ))}
                    {(!pollenData?.pollen || pollenData.pollen.length === 0) && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-gray-600">
                          No pollen entries yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {pollenData && pollenData.total > 50 && (
                  <div className="flex items-center justify-between p-2 border-t border-gray-800">
                    <span className="text-[10px] text-gray-500">{pollenData.total} pollen total</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPollenPage(Math.max(1, pollenPage - 1))}
                        disabled={pollenPage === 1}
                        className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                        data-testid="button-pollen-prev"
                      >
                        Prev
                      </button>
                      <span className="text-xs text-gray-500">{pollenPage}/{totalPollenPages}</span>
                      <button
                        onClick={() => setPollenPage(Math.min(totalPollenPages, pollenPage + 1))}
                        disabled={pollenPage >= totalPollenPages}
                        className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                        data-testid="button-pollen-next"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
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

function BeautyBadge({ score, flags }: { score: number | null; flags: string | null }) {
  if (score === null || score === undefined) {
    return <span className="text-[10px] text-gray-600" data-testid="beauty-unscanned">—</span>;
  }

  let label: string;
  let colorClass: string;
  if (score >= 90) {
    label = "Pristine";
    colorClass = "text-green-400 bg-green-900/30";
  } else if (score >= 70) {
    label = "Clean";
    colorClass = "text-blue-400 bg-blue-900/30";
  } else if (score >= 50) {
    label = "Guarded";
    colorClass = "text-yellow-400 bg-yellow-900/30";
  } else {
    label = "Fortified";
    colorClass = "text-red-400 bg-red-900/30";
  }

  const flagList = flags ? flags.split(",").filter(Boolean) : [];

  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded ${colorClass} cursor-default`}
      title={flagList.length > 0 ? `Score: ${score}\nDefenses: ${flagList.join(", ")}` : `Score: ${score}`}
      data-testid="beauty-badge"
    >
      {score} {label}
    </span>
  );
}

function PhoneBadge({ valid, checked }: { valid: boolean | null; checked: string | null }) {
  if (!checked) {
    return <span className="text-[10px] text-gray-600" data-testid="phone-unchecked">—</span>;
  }
  if (valid === true) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded text-green-400 bg-green-900/30" data-testid="phone-valid">
        Valid
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded text-red-400 bg-red-900/30" data-testid="phone-invalid">
      Invalid
    </span>
  );
}

function TabButton({ active, onClick, label, count, color, testId }: {
  active: boolean; onClick: () => void; label: string; count?: number; color?: string; testId: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t transition-colors whitespace-nowrap ${
        active
          ? "bg-gray-800 text-white border-b-2 border-pink-500"
          : "text-gray-500 hover:text-gray-300"
      }`}
      data-testid={testId}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className={`text-[10px] ${color || (active ? "text-pink-400" : "text-gray-600")}`}>
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}
