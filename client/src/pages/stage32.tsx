import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Play, Square, Download, Loader2, ExternalLink, Globe, Mail, Phone, Film, Star, MapPin, Briefcase, Calendar } from "lucide-react";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";

interface Stage32Profile {
  id: string;
  stage32Id: number | null;
  stage32Slug: string | null;
  stage32Url: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  location: string | null;
  profession: string | null;
  company: string | null;
  profileImageUrl: string | null;
  twitter: string | null;
  instagram: string | null;
  youtube: string | null;
  facebook: string | null;
  linkedin: string | null;
  website: string | null;
  bioPhone: string | null;
  bioEmail: string | null;
  bioCalendlyUrl: string | null;
  websitePhone: string | null;
  websiteEmail: string | null;
  websiteCalendlyUrl: string | null;
  imdbId: string | null;
  guild: string | null;
  projects: string | null;
  isServiceProvider: boolean;
  isExecutive: boolean;
  status: string;
  scrapedAt: string | null;
  websiteCheckedAt: string | null;
  createdAt: string;
}

interface Stage32Stats {
  total: number;
  scraped: number;
  withContact: number;
  withWebsite: number;
  serviceProviders: number;
}

export default function Stage32Page() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterHasContact, setFilterHasContact] = useState(false);
  const [filterServiceProvider, setFilterServiceProvider] = useState(false);
  const [startId, setStartId] = useState("700000");
  const [endId, setEndId] = useState("1500000");
  const [scanMode, setScanMode] = useState<"serper" | "sequential">("serper");

  // Status query
  const { data: status, refetch: refetchStatus } = useQuery<{ active: boolean; recentJobs: any[] }>({
    queryKey: ["/api/stage32/scan/status"],
    queryFn: () => fetch("/api/stage32/scan/status", { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 5000,
  });

  // Stats query
  const { data: stats } = useQuery<Stage32Stats>({
    queryKey: ["/api/stage32/stats"],
    queryFn: () => fetch("/api/stage32/stats", { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 10000,
  });

  // Profiles query
  const profileFilters: Record<string, string> = { page: String(page), limit: String(limit) };
  if (searchQuery) profileFilters.search = searchQuery;
  if (filterLocation) profileFilters.location = filterLocation;
  if (filterHasContact) profileFilters.hasContact = "true";
  if (filterServiceProvider) profileFilters.isServiceProvider = "true";
  const qs = new URLSearchParams(profileFilters).toString();
  const { data: profilesData, isLoading: profilesLoading } = useQuery<{ profiles: Stage32Profile[]; total: number }>({
    queryKey: ["/api/stage32/profiles", qs],
    queryFn: () => fetch(`/api/stage32/profiles?${qs}`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 10000,
  });

  // Start scan mutation
  const startScan = useMutation({
    mutationFn: () => apiRequest("POST", "/api/stage32/scan", {
      startId: parseInt(startId) || 1,
      endId: parseInt(endId) || 1500000,
      mode: scanMode,
    }),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Stage 32 scan started!", description: `Job ${data.jobId?.substring(0, 8) || ""}` });
      queryClient.invalidateQueries({ queryKey: ["/api/stage32/scan/status"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Stop scan mutation
  const stopScan = useMutation({
    mutationFn: () => apiRequest("POST", "/api/stage32/scan/stop"),
    onSuccess: () => {
      toast({ title: "Stop requested" });
      refetchStatus();
    },
  });

  const profiles = profilesData?.profiles || [];
  const total = profilesData?.total || 0;
  const totalPages = Math.ceil(total / limit) || 1;
  const activeJob = status?.recentJobs?.find((j: any) => j.status === "running");

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Film className="w-7 h-7 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold">Stage 32 Contact Harvester</h1>
            <p className="text-xs text-gray-500">Scrape 1.5M entertainment industry profiles for names, emails, phones, and websites</p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2">
            <div className="text-[10px] text-gray-500 uppercase">Total Profiles</div>
            <div className="text-xl font-bold text-cyan-400">{stats?.total?.toLocaleString() || 0}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2">
            <div className="text-[10px] text-gray-500 uppercase">Scraped</div>
            <div className="text-xl font-bold text-green-400">{stats?.scraped?.toLocaleString() || 0}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2">
            <div className="text-[10px] text-gray-500 uppercase">With Contact Info</div>
            <div className="text-xl font-bold text-amber-400">{stats?.withContact?.toLocaleString() || 0}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2">
            <div className="text-[10px] text-gray-500 uppercase">With Website</div>
            <div className="text-xl font-bold text-blue-400">{stats?.withWebsite?.toLocaleString() || 0}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2">
            <div className="text-[10px] text-gray-500 uppercase">Service Providers</div>
            <div className="text-xl font-bold text-purple-400">{stats?.serviceProviders?.toLocaleString() || 0}</div>
          </div>
        </div>

        {/* Scan controls */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="text-[10px] text-gray-600">
              9 workers | 1s gap | exponential backoff
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setScanMode("serper")}
                disabled={!!status?.active}
                className={`px-2 py-1.5 text-xs rounded transition-colors ${
                  scanMode === "serper" ? "bg-cyan-600/30 border border-cyan-500 text-cyan-400" : "bg-gray-800 border border-gray-700 text-gray-500"
                }`}
                title="Use Google search to find real profile IDs (high hit rate, ~50 queries)"
              >
                Serper Discovery
              </button>
              <button
                onClick={() => setScanMode("sequential")}
                disabled={!!status?.active}
                className={`px-2 py-1.5 text-xs rounded transition-colors ${
                  scanMode === "sequential" ? "bg-amber-600/30 border border-amber-500 text-amber-400" : "bg-gray-800 border border-gray-700 text-gray-500"
                }`}
                title="Brute-force sequential BFF IDs (low hit rate, slow)"
              >
                Sequential
              </button>
            </div>
            {scanMode === "sequential" && (
              <div className="flex items-end gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Start ID</label>
                  <input type="number" value={startId} onChange={(e) => setStartId(e.target.value)} disabled={!!status?.active}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm w-28 focus:border-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">End ID</label>
                  <input type="number" value={endId} onChange={(e) => setEndId(e.target.value)} disabled={!!status?.active}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm w-28 focus:border-amber-500 outline-none" />
                </div>
              </div>
            )}
            <div className="flex-1" />
            {!status?.active ? (
              <button
                onClick={() => startScan.mutate()}
                disabled={startScan.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 text-white text-sm font-semibold rounded transition-colors"
              >
                {startScan.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Start Scan
              </button>
            ) : (
              <button
                onClick={() => stopScan.mutate()}
                disabled={stopScan.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded ring-2 ring-red-400 animate-pulse transition-colors"
              >
                <Square className="w-4 h-4" />
                Stop Scan
              </button>
            )}
            <button
              onClick={() => window.open(`/api/stage32/export?hasContact=${filterHasContact ? "true" : ""}`, "_blank")}
              className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>

          {/* Active job progress */}
          {activeJob && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <div className="flex items-center gap-3 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span className="text-gray-300">
                  Scanning IDs {activeJob.startId}-{activeJob.endId}
                </span>
                <span className="text-gray-500">|</span>
                <span className="text-green-400">{activeJob.workersScraped?.toLocaleString() || 0} scraped</span>
                <span className="text-gray-500">|</span>
                <span className="text-blue-400">{activeJob.websitesChecked?.toLocaleString() || 0} websites checked</span>
                <span className="text-gray-500">|</span>
                <span className="text-amber-400">{activeJob.contactFound?.toLocaleString() || 0} contacts found</span>
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                placeholder="Search name, bio, profession..."
                className="w-full bg-gray-900 border border-gray-800 rounded pl-9 pr-3 py-2 text-sm focus:border-amber-500 outline-none"
              />
            </div>
          </div>
          <input
            type="text"
            value={filterLocation}
            onChange={(e) => { setFilterLocation(e.target.value); setPage(1); }}
            placeholder="Location filter..."
            className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm w-40 focus:border-amber-500 outline-none"
          />
          <button
            onClick={() => { setFilterHasContact(!filterHasContact); setPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded border transition-colors ${
              filterHasContact
                ? "bg-amber-600/20 border-amber-500 text-amber-400"
                : "bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-300"
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            Has Contact
          </button>
          <button
            onClick={() => { setFilterServiceProvider(!filterServiceProvider); setPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded border transition-colors ${
              filterServiceProvider
                ? "bg-purple-600/20 border-purple-500 text-purple-400"
                : "bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-300"
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            Service Providers
          </button>
        </div>

        {/* Profiles table */}
        {profilesLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-20 text-gray-600 text-sm">
            No profiles found. Start a scan to begin harvesting.
          </div>
        ) : (
          <>
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs">
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Profession</th>
                    <th className="text-left px-4 py-3">Location</th>
                    <th className="text-left px-4 py-3">Email</th>
                    <th className="text-left px-4 py-3">Phone</th>
                    <th className="text-left px-4 py-3">Website</th>
                    <th className="text-left px-4 py-3">Social</th>
                    <th className="text-left px-4 py-3">Calendly</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => {
                    const email = p.websiteEmail || p.bioEmail;
                    const phone = p.websitePhone || p.bioPhone;
                    const calendly = p.websiteCalendlyUrl || p.bioCalendlyUrl;
                    const socials = [p.twitter, p.instagram, p.youtube, p.facebook].filter(Boolean);
                    return (
                      <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-200">{p.name || "—"}</div>
                          {p.isServiceProvider && <span className="text-[10px] text-purple-400">Service Provider</span>}
                          {p.isExecutive && <span className="text-[10px] text-cyan-400">Executive</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-400">{p.profession || p.company || "—"}</td>
                        <td className="px-4 py-3 text-gray-400">{p.location || "—"}</td>
                        <td className="px-4 py-3">
                          {email ? (
                            <span className="text-green-400 flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              <a href={`mailto:${email}`} className="hover:underline">{email}</a>
                            </span>
                          ) : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {phone ? (
                            <span className="text-green-400 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {phone}
                            </span>
                          ) : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {p.website ? (
                            <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline flex items-center gap-1 truncate max-w-[150px]">
                              <Globe className="w-3 h-3 shrink-0" />
                              {p.website.replace(/^https?:\/\//, "")}
                            </a>
                          ) : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {socials.length > 0 ? (
                            <div className="flex gap-2">
                              {p.twitter && <a href={p.twitter} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-blue-400 text-xs">X</a>}
                              {p.instagram && <a href={p.instagram} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-pink-400 text-xs">IG</a>}
                              {p.youtube && <a href={p.youtube} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-red-400 text-xs">YT</a>}
                              {p.facebook && <a href={p.facebook} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-blue-400 text-xs">FB</a>}
                            </div>
                          ) : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {calendly ? (
                            <a href={calendly} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline flex items-center gap-1 text-xs">
                              <Calendar className="w-3 h-3" />
                              Calendly
                            </a>
                          ) : <span className="text-gray-700">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages} ({total.toLocaleString()} profiles)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
