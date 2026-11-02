import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Square, Loader2, Download, Search, Users, Phone, Mail, Globe, Star } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BackstageProfile {
  id: string;
  username: string;
  profileUrl: string;
  profileType: string | null;
  name: string | null;
  stageName: string | null;
  gender: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  bio: string | null;
  hair: string | null;
  eyes: string | null;
  bodyType: string | null;
  ethnicities: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  phoneFromWebsite: string | null;
  emailFromWebsite: string | null;
  websiteScraped: string | null;
  qualityScore: number | null;
  status: string;
  scrapedAt: string | null;
}

interface BackstageStats {
  totalProfiles: number;
  enriched: number;
  pending: number;
  withPhone: number;
  withEmail: number;
}

export default function BackstagePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedProfile, setSelectedProfile] = useState<BackstageProfile | null>(null);
  const limit = 50;

  const { data: stats, refetch: refetchStats } = useQuery<BackstageStats>({
    queryKey: ["/api/backstage/stats"],
    refetchInterval: 5000,
  });

  const { data: status } = useQuery<{ active: boolean; engineStatus: any; recentJobs: any[] }>({
    queryKey: ["/api/backstage/status"],
    refetchInterval: 3000,
  });

  const { data: logData } = useQuery<{ status: string; log: string[] }>({
    queryKey: ["/api/backstage/log", status?.recentJobs?.[0]?.id],
    queryFn: () => status?.recentJobs?.[0]?.id
      ? fetch(`/api/backstage/log/${status.recentJobs[0].id}`, { credentials: "include" }).then(r => r.json())
      : { status: "idle", log: [] },
    enabled: !!status?.recentJobs?.[0]?.id,
    refetchInterval: 3000,
  });

  const profileFilters: Record<string, string> = { page: String(page), limit: String(limit) };
  if (searchQuery) profileFilters.search = searchQuery;
  if (statusFilter) profileFilters.status = statusFilter;
  const profileQs = new URLSearchParams(profileFilters).toString();

  const { data: profilesData, isLoading } = useQuery<{ profiles: BackstageProfile[]; total: number }>({
    queryKey: ["/api/backstage/profiles", profileQs],
    queryFn: () => fetch(`/api/backstage/profiles?${profileQs}`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: status?.active ? 5000 : 15000,
  });

  const startScan = useMutation({
    mutationFn: () => apiRequest("POST", "/api/backstage/scan"),
    onSuccess: () => {
      toast({ title: "Backstage scan started!", description: "Sitemap discovery + profile enrichment" });
      queryClient.invalidateQueries({ queryKey: ["/api/backstage/status"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const stopScan = useMutation({
    mutationFn: () => apiRequest("POST", "/api/backstage/stop"),
    onSuccess: () => {
      toast({ title: "Backstage scan stopping..." });
      queryClient.invalidateQueries({ queryKey: ["/api/backstage/status"] });
    },
  });

  const totalPages = profilesData ? Math.ceil(profilesData.total / limit) : 1;
  const isActive = status?.active;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Backstage.com Profile Harvester</h1>
            <p className="text-xs text-gray-500">300K+ actor/performer profiles from Backstage.com (FlareSolverr + Cloudflare bypass)</p>
          </div>
          <div className="flex items-center gap-3">
            {!isActive ? (
              <button
                onClick={() => startScan.mutate()}
                disabled={startScan.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm font-semibold rounded transition-colors"
                data-testid="button-backstage-start"
              >
                {startScan.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Start Scan
              </button>
            ) : (
              <button
                onClick={() => stopScan.mutate()}
                disabled={stopScan.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded ring-2 ring-red-400 animate-pulse transition-colors"
                data-testid="button-backstage-stop"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-2 p-4 border-b border-gray-800">
        <div className="border border-gray-700 rounded-lg bg-gray-900 p-3 text-center">
          <Users className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
          <div className="text-xl font-bold text-white">{stats?.totalProfiles?.toLocaleString() ?? 0}</div>
          <div className="text-[10px] text-gray-500 uppercase">Total</div>
        </div>
        <div className="border border-gray-700 rounded-lg bg-gray-900 p-3 text-center">
          <div className="text-xl font-bold text-green-400">{stats?.enriched?.toLocaleString() ?? 0}</div>
          <div className="text-[10px] text-gray-500 uppercase">Enriched</div>
        </div>
        <div className="border border-gray-700 rounded-lg bg-gray-900 p-3 text-center">
          <div className="text-xl font-bold text-yellow-400">{stats?.pending?.toLocaleString() ?? 0}</div>
          <div className="text-[10px] text-gray-500 uppercase">Pending</div>
        </div>
        <div className="border border-gray-700 rounded-lg bg-gray-900 p-3 text-center">
          <Phone className="w-4 h-4 text-blue-400 mx-auto mb-1" />
          <div className="text-xl font-bold text-blue-400">{stats?.withPhone ?? 0}</div>
          <div className="text-[10px] text-gray-500 uppercase">Phones</div>
        </div>
        <div className="border border-gray-700 rounded-lg bg-gray-900 p-3 text-center">
          <Mail className="w-4 h-4 text-purple-400 mx-auto mb-1" />
          <div className="text-xl font-bold text-purple-400">{stats?.withEmail ?? 0}</div>
          <div className="text-[10px] text-gray-500 uppercase">Emails</div>
        </div>
      </div>

      {/* Live status */}
      {isActive && status?.engineStatus && (
        <div className="border border-indigo-700 rounded-lg bg-gray-950 p-4 mx-4 mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
            <span className="text-sm font-semibold text-white">Scanning...</span>
            <span className="text-xs text-gray-400">
              {status.engineStatus.totalEnriched?.toLocaleString() ?? 0} / {status.engineStatus.totalDiscovered?.toLocaleString() ?? 0} enriched
            </span>
          </div>
          <div className="w-full bg-gray-800 rounded h-2 overflow-hidden">
            <div
              className="bg-indigo-500 h-full transition-all"
              style={{ width: `${status.engineStatus.totalDiscovered > 0 ? (status.engineStatus.totalEnriched / status.engineStatus.totalDiscovered) * 100 : 0}%` }}
            />
          </div>
          {logData?.log && logData.log.length > 0 && (
            <div className="text-[10px] text-gray-500 truncate">
              {logData.log[logData.log.length - 1]}
            </div>
          )}
        </div>
      )}

      {/* Search & filters */}
      <div className="p-4 border-b border-gray-800 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
            <input
              type="text"
              placeholder="Search name, location, bio, type..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="w-full text-xs bg-gray-900 border border-gray-700 rounded pl-7 pr-2 py-1.5 text-gray-200 placeholder-gray-600"
            />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200">
            <option value="">All Status</option>
            <option value="enriched">Enriched</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <a
            href="/api/backstage/export"
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-gray-700 bg-gray-900 text-gray-300 hover:text-white"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </a>
        </div>
      </div>

      {/* Profile table */}
      <div className="overflow-auto max-h-[calc(100vh-400px)]">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading profiles...
          </div>
        ) : profilesData && profilesData.profiles.length > 0 ? (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-900 border-b border-gray-700">
              <tr className="text-left text-gray-400">
                <th className="p-2 font-medium">Name</th>
                <th className="p-2 font-medium">Type</th>
                <th className="p-2 font-medium">Gender</th>
                <th className="p-2 font-medium">Location</th>
                <th className="p-2 font-medium">Phone</th>
                <th className="p-2 font-medium">Phone (Web)</th>
                <th className="p-2 font-medium">Email</th>
                <th className="p-2 font-medium">Website</th>
                <th className="p-2 font-medium">Score</th>
                <th className="p-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {profilesData.profiles.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedProfile(p)}
                  className="border-b border-gray-800 hover:bg-gray-900 cursor-pointer"
                >
                  <td className="p-2 text-gray-200">{p.name || p.username}</td>
                  <td className="p-2 text-gray-400">{p.profileType || "-"}</td>
                  <td className="p-2 text-gray-400">{p.gender || "-"}</td>
                  <td className="p-2 text-gray-400">{p.location || "-"}</td>
                  <td className="p-2 text-blue-400">{p.phone ? "✓" : "-"}</td>
                  <td className="p-2 text-green-400">{p.phoneFromWebsite ? "✓" : "-"}</td>
                  <td className="p-2 text-purple-400">{p.email ? "✓" : "-"}</td>
                  <td className="p-2 text-cyan-400">{p.website ? "✓" : "-"}</td>
                  <td className="p-2 text-amber-400">{p.qualityScore ?? "-"}</td>
                  <td className="p-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.status === "enriched" ? "bg-green-900/40 text-green-400" : p.status === "failed" ? "bg-red-900/40 text-red-400" : "bg-yellow-900/40 text-yellow-400"}`}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-500">
            No profiles yet. Start a scan to discover Backstage.com profiles.
          </div>
        )}
      </div>

      {/* Pagination */}
      {profilesData && profilesData.total > limit && (
        <div className="flex items-center justify-between p-2 border-t border-gray-800 text-xs text-gray-400">
          <span>{profilesData.total.toLocaleString()} total — Page {page}/{totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded border border-gray-700 disabled:opacity-30">Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded border border-gray-700 disabled:opacity-30">Next</button>
          </div>
        </div>
      )}

      {/* Profile detail modal */}
      {selectedProfile && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setSelectedProfile(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedProfile.name || selectedProfile.username}</h2>
                <p className="text-xs text-gray-500">
                  {selectedProfile.profileType} • {selectedProfile.gender} • {selectedProfile.location}
                </p>
                {selectedProfile.qualityScore && (
                  <p className="text-xs text-amber-400 flex items-center gap-1 mt-1">
                    <Star className="w-3 h-3" /> Quality Score: {selectedProfile.qualityScore}
                  </p>
                )}
              </div>
              <button onClick={() => setSelectedProfile(null)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              {selectedProfile.bio && <div><span className="text-gray-500">Bio:</span> {selectedProfile.bio}</div>}
              {selectedProfile.hair && <div><span className="text-gray-500">Hair:</span> {selectedProfile.hair}</div>}
              {selectedProfile.eyes && <div><span className="text-gray-500">Eyes:</span> {selectedProfile.eyes}</div>}
              {selectedProfile.bodyType && <div><span className="text-gray-500">Body Type:</span> {selectedProfile.bodyType}</div>}
              {selectedProfile.ethnicities && <div><span className="text-gray-500">Ethnicities:</span> {selectedProfile.ethnicities}</div>}
              {selectedProfile.phone && <div><span className="text-gray-500">Phone (Backstage):</span> <span className="text-blue-400">{selectedProfile.phone}</span></div>}
              {selectedProfile.phoneFromWebsite && <div><span className="text-gray-500">Phone (Website):</span> <span className="text-green-400">{selectedProfile.phoneFromWebsite}</span></div>}
              {selectedProfile.email && <div><span className="text-gray-500">Email (Backstage):</span> <span className="text-purple-400">{selectedProfile.email}</span></div>}
              {selectedProfile.emailFromWebsite && <div><span className="text-gray-500">Email (Website):</span> <span className="text-green-400">{selectedProfile.emailFromWebsite}</span></div>}
              {selectedProfile.websiteScraped && <div><span className="text-gray-500">Scraped from:</span> <a href={selectedProfile.websiteScraped} target="_blank" rel="noopener" className="text-cyan-400 hover:underline">{selectedProfile.websiteScraped}</a></div>}
              {selectedProfile.website && <div><span className="text-gray-500">Website:</span> <a href={selectedProfile.website} target="_blank" rel="noopener" className="text-cyan-400 hover:underline">{selectedProfile.website}</a></div>}
              <div><span className="text-gray-500">Profile URL:</span> <a href={selectedProfile.profileUrl} target="_blank" rel="noopener" className="text-indigo-400 hover:underline">{selectedProfile.profileUrl}</a></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
