import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Radio, Users, Loader2, Power, Trash2, RefreshCw, Smartphone, Send, Zap, Megaphone, Upload, FileUp, Network, CheckCircle, XCircle, DollarSign, TrendingUp, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CampaignBuilder from "@/components/campaign-builder";

interface Geofence {
  id: string;
  name: string | null;
  companyId: string | null;
  jobId: string | null;
  latitude: number;
  longitude: number;
  radiusM: number;
  active: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  source: string | null;
  createdAt: string;
}

interface GeofenceStats {
  totalGeofences: number;
  activeGeofences: number;
  totalDevices: number;
  unsyncedDevices: number;
  totalSegments: number;
}

interface CapturedDevice {
  id: string;
  maid: string | null;
  deviceType: string | null;
  os: string | null;
  osv: string | null;
  make: string | null;
  model: string | null;
  latitude: number | null;
  longitude: number | null;
  geofenceId: string | null;
  geofenceName: string | null;
  ip: string | null;
  synced: boolean;
  syncedTo: string | null;
  firstSeen: string;
  lastSeen: string;
  hitCount: number;
}

interface AudienceSegment {
  id: string;
  name: string;
  description: string | null;
  geofenceIds: string[];
  deviceCount: number;
  status: string;
  createdAt: string;
}

interface GeofenceGroup {
  id: string;
  label: string;
  count: number;
  source: string;
}

type Tab = "dashboard" | "geofences" | "devices" | "segments" | "bidstream" | "sync" | "campaigns" | "exchanges" | "conversions";

export default function GeofencePage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [radiusM, setRadiusM] = useState(250);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stats } = useQuery<GeofenceStats>({
    queryKey: ["geofence-stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/geofence/stats");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: geofences = [] } = useQuery<Geofence[]>({
    queryKey: ["geofences"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/geofence");
      return res.json();
    },
  });

  const { data: devicesData } = useQuery<{ devices: CapturedDevice[]; total: number }>({
    queryKey: ["captured-devices"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/geofence/devices?limit=100");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: segments = [] } = useQuery<AudienceSegment[]>({
    queryKey: ["audience-segments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/geofence/segments");
      return res.json();
    },
  });

  const { data: analyticsData } = useQuery<any>({
    queryKey: ["geofence-analytics"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/geofence/analytics");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { radiusM: number }) => {
      const res = await apiRequest("POST", "/api/geofence/generate", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Generated ${data.created} geofences (${data.skipped} already existed)` });
      queryClient.invalidateQueries({ queryKey: ["geofences"] });
      queryClient.invalidateQueries({ queryKey: ["geofence-stats"] });
    },
  });

  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [csvGroupName, setCsvGroupName] = useState("");
  const csvFileRef = useRef<HTMLInputElement>(null);

  const csvUploadMutation = useMutation({
    mutationFn: async ({ csv, groupName }: { csv: string; groupName: string }) => {
      const res = await apiRequest("POST", "/api/geofence/upload-csv", { csv, groupName: groupName || undefined });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Created ${data.created} geofences (${data.skipped} skipped)` });
      setShowCsvUpload(false);
      setCsvGroupName("");
      if (csvFileRef.current) csvFileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["geofences"] });
      queryClient.invalidateQueries({ queryKey: ["geofence-stats"] });
      queryClient.invalidateQueries({ queryKey: ["geofence-groups"] });
    },
    onError: (err: any) => {
      toast({ title: `Upload failed: ${err.message}`, variant: "destructive" });
    },
  });

  const handleCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      csvUploadMutation.mutate({ csv: text, groupName: csvGroupName });
    };
    reader.readAsText(file);
  };

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/geofence/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["geofences"] });
      queryClient.invalidateQueries({ queryKey: ["geofence-stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/geofence/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Geofence deleted" });
      queryClient.invalidateQueries({ queryKey: ["geofences"] });
      queryClient.invalidateQueries({ queryKey: ["geofence-stats"] });
    },
  });

  const createSegmentMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await apiRequest("POST", "/api/geofence/segments", {
        ...data,
        geofenceIds: geofences.filter((g: Geofence) => g.active).map((g: Geofence) => g.id),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Audience segment created" });
      queryClient.invalidateQueries({ queryKey: ["audience-segments"] });
      queryClient.invalidateQueries({ queryKey: ["geofence-stats"] });
    },
  });

  const testBidMutation = useMutation({
    mutationFn: async (data: { lat: number; lng: number; maid: string }) => {
      const res = await fetch("/api/openrtb/auction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device: {
            ifa: data.maid,
            geo: { lat: data.lat, lon: data.lng },
            os: "Android",
            osv: "14.0",
            make: "Google",
            model: "Pixel 8",
          },
          app: { name: "TestApp" },
        }),
      });
      return { status: res.status };
    },
    onSuccess: () => {
      toast({ title: "Bid request sent — device captured if inside a geofence" });
      queryClient.invalidateQueries({ queryKey: ["captured-devices"] });
      queryClient.invalidateQueries({ queryKey: ["geofence-stats"] });
    },
  });

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "dashboard", label: "Dashboard", icon: Zap },
    { key: "geofences", label: "Geofences", icon: MapPin },
    { key: "devices", label: "Captured Devices", icon: Smartphone },
    { key: "segments", label: "Audience Segments", icon: Users },
    { key: "bidstream", label: "Bidstream Test", icon: Radio },
    { key: "exchanges", label: "Exchanges", icon: Network },
    { key: "sync", label: "DSP Sync", icon: Send },
    { key: "campaigns", label: "Campaigns", icon: Megaphone },
    { key: "conversions", label: "Conversions", icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Geofencing Platform</h1>
            <p className="text-xs text-muted-foreground">PostGIS geofences → bidstream MAID harvesting → DSP audience sync</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-4 p-1 bg-muted/30 rounded-lg w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Dashboard tab */}
        {tab === "dashboard" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Total Geofences" value={stats?.totalGeofences ?? 0} icon={MapPin} color="text-blue-400" />
              <StatCard label="Active Geofences" value={stats?.activeGeofences ?? 0} icon={Power} color="text-green-400" />
              <StatCard label="Captured Devices" value={stats?.totalDevices ?? 0} icon={Smartphone} color="text-orange-400" />
              <StatCard label="Unsynced" value={stats?.unsyncedDevices ?? 0} icon={Send} color="text-yellow-400" />
              <StatCard label="Segments" value={stats?.totalSegments ?? 0} icon={Users} color="text-purple-400" />
            </div>

            <div className="bg-card border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Generate Geofences from Supreme Line 2</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Creates polygon geofences around every geocoded company from Supreme Line 2. Each geofence is a circle approximated
                as a polygon with a configurable radius in metres.
              </p>
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium">Radius:</label>
                <select
                  value={radiusM}
                  onChange={(e) => setRadiusM(Number(e.target.value))}
                  className="bg-input border rounded px-2 py-1 text-xs"
                >
                  <option value={30}>100 ft (30m)</option>
                  <option value={46}>150 ft (46m)</option>
                  <option value={61}>200 ft (61m)</option>
                  <option value={76}>250 ft (76m)</option>
                  <option value={91}>300 ft (91m)</option>
                  <option value={107}>350 ft (107m)</option>
                  <option value={122}>400 ft (122m)</option>
                  <option value={137}>450 ft (137m)</option>
                  <option value={152}>500 ft (152m)</option>
                  <option value={168}>550 ft (168m)</option>
                  <option value={183}>600 ft (183m)</option>
                  <option value={198}>650 ft (198m)</option>
                  <option value={213}>700 ft (213m)</option>
                  <option value={229}>750 ft (229m)</option>
                  <option value={244}>800 ft (244m)</option>
                  <option value={260}>850 ft (260m)</option>
                  <option value={274}>900 ft (274m)</option>
                  <option value={290}>950 ft (290m)</option>
                  <option value={305}>1000 ft (305m)</option>
                </select>
                <button
                  onClick={() => generateMutation.mutate({ radiusM })}
                  disabled={generateMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {generateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Generate Geofences
                </button>
                {generateMutation.data && (
                  <span className="text-xs text-muted-foreground">
                    Created: {generateMutation.data.created} | Skipped: {generateMutation.data.skipped}
                  </span>
                )}
              </div>

              {/* CSV Upload toggle */}
              <div className="mt-3 pt-3 border-t">
                <button
                  onClick={() => setShowCsvUpload(!showCsvUpload)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <FileUp className="w-3 h-3" />
                  Upload CSV of locations instead
                </button>
                {showCsvUpload && (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-[10px] font-medium block mb-0.5">Group Name (shows in Campaign Builder)</label>
                      <input
                        value={csvGroupName}
                        onChange={(e) => setCsvGroupName(e.target.value)}
                        placeholder="e.g. Poughkeepsie HVAC, Arlington Restaurants"
                        className="bg-input border rounded px-2 py-1 text-xs w-full"
                      />
                    </div>
                    <input
                      ref={csvFileRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleCsvFile(file);
                      }}
                      className="hidden"
                    />
                    <button
                      onClick={() => csvFileRef.current?.click()}
                      disabled={csvUploadMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                    >
                      {csvUploadMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      Choose CSV File
                    </button>
                    {csvUploadMutation.isPending && (
                      <span className="text-xs text-muted-foreground">Uploading...</span>
                    )}
                    {csvUploadMutation.data && !csvUploadMutation.isPending && (
                      <span className="text-xs text-muted-foreground">
                        Created: {csvUploadMutation.data.created} | Skipped: {csvUploadMutation.data.skipped}
                      </span>
                    )}
                    <div className="bg-muted/30 rounded p-2 text-[10px] font-mono text-muted-foreground">
                      Required: name, latitude, longitude<br/>
                      Optional: radius_m (default 250m), address, city, state<br/>
                      Also auto-detects: radius_yards, radius_miles, radius_km
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-card border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Pipeline Status</h3>
              <div className="space-y-2">
                <PipelineStep number={1} title="PostGIS Geofence Layer" status="complete" detail={`${stats?.totalGeofences ?? 0} geofences active`} />
                <PipelineStep number={2} title="OpenRTB Bid Handler" status="complete" detail="POST /api/openrtb/auction — device.geo → PostGIS → capture" />
                <PipelineStep number={3} title="Redis + ClickHouse" status="complete" detail="Redis dedup + audience sets | ClickHouse analytics warehouse" />
                <PipelineStep number={4} title="DSP API Sync" status="in-progress" detail="MAID CSV export ready | TTD/StackAdapt API needs credentials" />
              </div>
            </div>

            {/* Analytics from ClickHouse */}
            <div className="bg-card border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Capture Analytics (ClickHouse)</h3>
              {analyticsData && analyticsData.analytics && analyticsData.analytics.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-1.5 font-medium">Geofence</th>
                      <th className="text-right p-1.5 font-medium">Captures</th>
                      <th className="text-right p-1.5 font-medium">Unique Devices</th>
                      <th className="text-left p-1.5 font-medium">First Capture</th>
                      <th className="text-left p-1.5 font-medium">Last Capture</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyticsData.analytics.map((a: any, i: number) => (
                      <tr key={i} className="border-b">
                        <td className="p-1.5">{a.geofence_name}</td>
                        <td className="p-1.5 text-right">{a.captures}</td>
                        <td className="p-1.5 text-right font-mono text-blue-400">{a.unique_devices}</td>
                        <td className="p-1.5 text-muted-foreground text-[10px]">{a.first_capture}</td>
                        <td className="p-1.5 text-muted-foreground text-[10px]">{a.last_capture}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-muted-foreground">No captures yet. Send a bid request from the Bidstream Test tab.</p>
              )}
              {analyticsData && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Total unique devices across all geofences: <span className="font-mono text-orange-400">{analyticsData.totalUniqueDevices}</span>
                </div>
              )}
            </div>

            {/* DSP Sync */}
            <div className="bg-card border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">DSP Sync — Export Captured MAIDs</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Export the captured device ID list as a CSV for manual upload to The Trade Desk, StackAdapt, or any DSP.
                For automated API sync, add your DSP credentials below.
              </p>
              <div className="flex items-center gap-3">
                <a
                  href="/api/geofence/export-maids"
                  onClick={(e) => { e.preventDefault(); window.open('/api/geofence/export-maids', '_blank'); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
                >
                  <Send className="w-3 h-3" />
                  Export MAIDs CSV
                </a>
                <span className="text-xs text-muted-foreground">
                  {stats?.totalDevices ?? 0} devices captured, {stats?.unsyncedDevices ?? 0} unsynced
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Geofences tab */}
        {tab === "geofences" && (
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card border-b">
                  <tr>
                    <th className="text-left p-2 font-medium">Name</th>
                    <th className="text-left p-2 font-medium">Address</th>
                    <th className="text-right p-2 font-medium">Lat</th>
                    <th className="text-right p-2 font-medium">Lng</th>
                    <th className="text-right p-2 font-medium">Radius</th>
                    <th className="text-center p-2 font-medium">Active</th>
                    <th className="text-center p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {geofences.slice(0, 200).map((g: Geofence) => (
                    <tr key={g.id} className="border-b hover:bg-muted/30">
                      <td className="p-2 font-medium">{g.name || "—"}</td>
                      <td className="p-2 text-muted-foreground">{g.address || "—"}, {g.city || ""}, {g.state || ""}</td>
                      <td className="p-2 text-right font-mono">{g.latitude.toFixed(6)}</td>
                      <td className="p-2 text-right font-mono">{g.longitude.toFixed(6)}</td>
                      <td className="p-2 text-right">{g.radiusM}m ({Math.round(g.radiusM / 0.3048)}ft)</td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => toggleMutation.mutate({ id: g.id, active: !g.active })}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            g.active ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
                          }`}
                        >
                          {g.active ? "ON" : "OFF"}
                        </button>
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => deleteMutation.mutate(g.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-2 border-t text-xs text-muted-foreground">
              Showing {Math.min(geofences.length, 200)} of {geofences.length} geofences
            </div>
          </div>
        )}

        {/* Captured Devices tab */}
        {tab === "devices" && (
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="p-3 border-b flex items-center justify-between">
              <span className="text-xs font-medium">
                {devicesData?.total ?? 0} devices captured
              </span>
              <span className="text-xs text-muted-foreground">Auto-refreshing every 5s</span>
            </div>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card border-b">
                  <tr>
                    <th className="text-left p-2 font-medium">MAID</th>
                    <th className="text-left p-2 font-medium">Device</th>
                    <th className="text-left p-2 font-medium">OS</th>
                    <th className="text-left p-2 font-medium">Geofence</th>
                    <th className="text-right p-2 font-medium">Lat/Lng</th>
                    <th className="text-center p-2 font-medium">Hits</th>
                    <th className="text-center p-2 font-medium">Synced</th>
                    <th className="text-left p-2 font-medium">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {devicesData?.devices.map((d: CapturedDevice) => (
                    <tr key={d.id} className="border-b hover:bg-muted/30">
                      <td className="p-2 font-mono text-[10px]">{d.maid || "—"}</td>
                      <td className="p-2">{d.make} {d.model}</td>
                      <td className="p-2">{d.os} {d.osv}</td>
                      <td className="p-2 text-muted-foreground">{d.geofenceName || "—"}</td>
                      <td className="p-2 text-right font-mono text-[10px]">
                        {d.latitude?.toFixed(4)}, {d.longitude?.toFixed(4)}
                      </td>
                      <td className="p-2 text-center">{d.hitCount}</td>
                      <td className="p-2 text-center">
                        {d.synced ? (
                          <span className="text-green-400 text-[10px]">→ {d.syncedTo}</span>
                        ) : (
                          <span className="text-yellow-400 text-[10px]">pending</span>
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground text-[10px]">
                        {new Date(d.lastSeen).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Audience Segments tab */}
        {tab === "segments" && (
          <div className="space-y-4">
            <div className="bg-card border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Create Audience Segment</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Groups all active geofences into an audience segment that can be pushed to a DSP (The Trade Desk, StackAdapt, etc.).
                Captured devices from these geofences become the audience.
              </p>
              <SegmentForm onSubmit={(name, desc) => createSegmentMutation.mutate({ name, description: desc })} isPending={createSegmentMutation.isPending} />
            </div>
            <div className="bg-card border rounded-lg overflow-hidden">
              {segments.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-xs">No segments created yet</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left p-2 font-medium">Name</th>
                      <th className="text-left p-2 font-medium">Description</th>
                      <th className="text-right p-2 font-medium">Geofences</th>
                      <th className="text-right p-2 font-medium">Devices</th>
                      <th className="text-center p-2 font-medium">Status</th>
                      <th className="text-left p-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segments.map((s: AudienceSegment) => (
                      <tr key={s.id} className="border-b hover:bg-muted/30">
                        <td className="p-2 font-medium">{s.name}</td>
                        <td className="p-2 text-muted-foreground">{s.description || "—"}</td>
                        <td className="p-2 text-right">{s.geofenceIds?.length || 0}</td>
                        <td className="p-2 text-right">{s.deviceCount}</td>
                        <td className="p-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            s.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="p-2 text-muted-foreground text-[10px]">{new Date(s.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Bidstream Test tab */}
        {tab === "bidstream" && (
          <BidstreamTest onSend={(lat, lng, maid) => testBidMutation.mutate({ lat, lng, maid })} isPending={testBidMutation.isPending} />
        )}

        {/* DSP Sync tab */}
        {tab === "sync" && (
          <DspSyncTab stats={stats} geofences={geofences} />
        )}

        {/* Campaign Builder tab */}
        {tab === "campaigns" && (
          <CampaignBuilder />
        )}

        {tab === "exchanges" && (
          <ExchangeConnectionsTab />
        )}

        {tab === "conversions" && (
          <ConversionsTab />
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function PipelineStep({ number, title, status, detail }: { number: number; title: string; status: "complete" | "in-progress" | "pending"; detail: string }) {
  const colors = {
    complete: "text-green-400 bg-green-500/10",
    "in-progress": "text-yellow-400 bg-yellow-500/10",
    pending: "text-gray-400 bg-gray-500/10",
  };
  const icons = {
    complete: "✓",
    "in-progress": "→",
    pending: "○",
  };
  return (
    <div className="flex items-center gap-3 p-2 rounded">
      <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${colors[status]}`}>
        {icons[status]}
      </div>
      <div className="flex-1">
        <div className="text-xs font-medium">Layer {number}: {title}</div>
        <div className="text-[10px] text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function SegmentForm({ onSubmit, isPending }: { onSubmit: (name: string, description: string) => void; isPending: boolean }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <div className="flex items-end gap-2">
      <div>
        <label className="text-xs font-medium block mb-1">Segment Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Poughkeepsie Auto Repair Audience"
          className="bg-input border rounded px-2 py-1 text-xs w-64"
        />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1">Description</label>
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Optional"
          className="bg-input border rounded px-2 py-1 text-xs w-64"
        />
      </div>
      <button
        onClick={() => { if (name) { onSubmit(name, desc); setName(""); setDesc(""); } }}
        disabled={isPending || !name}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
        Create Segment
      </button>
    </div>
  );
}

function BidstreamTest({ onSend, isPending }: { onSend: (lat: number, lng: number, maid: string) => void; isPending: boolean }) {
  const [lat, setLat] = useState("41.681427");
  const [lng, setLng] = useState("-73.855606");
  const [maid, setMaid] = useState("test-device-" + Math.random().toString(36).slice(2, 8));
  return (
    <div className="bg-card border rounded-lg p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold mb-1">Simulate OpenRTB Bid Request</h3>
        <p className="text-xs text-muted-foreground">
          Sends a mock OpenRTB 2.x bid request to <code className="text-primary">/api/openrtb/auction</code> with device GPS coordinates.
          If the device falls inside any active geofence, its MAID is captured and stored. The endpoint always returns a 204 no-bid
          (you're harvesting IDs, not buying impressions).
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs font-medium block mb-1">Latitude</label>
          <input value={lat} onChange={(e) => setLat(e.target.value)} className="bg-input border rounded px-2 py-1 text-xs w-full" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Longitude</label>
          <input value={lng} onChange={(e) => setLng(e.target.value)} className="bg-input border rounded px-2 py-1 text-xs w-full" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">MAID (IFA)</label>
          <input value={maid} onChange={(e) => setMaid(e.target.value)} className="bg-input border rounded px-2 py-1 text-xs w-full" />
        </div>
      </div>
      <button
        onClick={() => onSend(parseFloat(lat), parseFloat(lng), maid)}
        disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radio className="w-3 h-3" />}
        Send Bid Request
      </button>
    </div>
  );
}

function DspSyncTab({ stats, geofences }: { stats: GeofenceStats | undefined; geofences: Geofence[] }) {
  const [dsp, setDsp] = useState<"epom" | "smartyads">("epom");
  const [epomLogin, setEpomLogin] = useState("");
  const [epomPassword, setEpomPassword] = useState("");
  const [epomBaseUrl, setEpomBaseUrl] = useState("https://dsp-api.epommarket.com");
  const [apiToken, setApiToken] = useState("");
  const [audienceName, setAudienceName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [sdkResult, setSdkResult] = useState<string | null>(null);
  const [geoSyncing, setGeoSyncing] = useState(false);
  const [geoSyncResult, setGeoSyncResult] = useState<any>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [epomCampaigns, setEpomCampaigns] = useState<any[]>([]);
  const [epomCreatives, setEpomCreatives] = useState<any[]>([]);
  const [fetchingCampaigns, setFetchingCampaigns] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [approveResult, setApproveResult] = useState<any>(null);
  const { toast } = useToast();

  // Fetch geofence groups
  const { data: groups = [] } = useQuery<GeofenceGroup[]>({
    queryKey: ["geofence-groups"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/geofence/groups");
      return res.json();
    },
  });

  // Geofences belonging to selected groups (or all if none selected)
  const selectedGeofenceIds = selectedGroupIds.length > 0
    ? geofences.filter((g) => {
        const groupKey = g.jobId || g.source || "ungrouped";
        return selectedGroupIds.includes(groupKey) && g.active;
      }).map((g) => g.id)
    : geofences.filter((g) => g.active).map((g) => g.id);

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds(prev => prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]);
  };

  const fetchLogs = async () => {
    try {
      const res = await apiRequest("GET", "/api/dsp/logs?limit=20");
      const logs = await res.json();
      setSyncLogs(logs);
    } catch {}
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleSync = async () => {
    if (!audienceName) {
      toast({ title: "Audience name required", variant: "destructive" });
      return;
    }
    if (dsp === "epom" && (!epomLogin || !epomPassword)) {
      toast({ title: "Epom requires login and password", variant: "destructive" });
      return;
    }
    if (dsp === "smartyads" && !apiToken) {
      toast({ title: "SmartyAds requires API token", variant: "destructive" });
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const credentials = dsp === "epom"
        ? { login: epomLogin, password: epomPassword, baseUrl: epomBaseUrl }
        : { apiToken };
      const res = await apiRequest("POST", "/api/dsp/sync", {
        provider: dsp,
        credentials,
        segmentName: audienceName,
        geofenceIds: selectedGeofenceIds,
      });
      const result = await res.json();
      setSyncResult(result);
      if (result.success) {
        toast({ title: `Synced ${result.uploaded} MAIDs to ${result.provider} (segment: ${result.segmentId})` });
      } else {
        toast({ title: `Sync failed: ${result.error || "unknown error"}`, variant: "destructive" });
      }
      fetchLogs();
    } catch (err: any) {
      toast({ title: `Sync failed: ${err.message}`, variant: "destructive" });
    }
    setSyncing(false);
  };

  const handleGeoSync = async () => {
    if (!epomLogin || !epomPassword) {
      toast({ title: "Epom login and password required", variant: "destructive" });
      return;
    }
    setGeoSyncing(true);
    setGeoSyncResult(null);
    try {
      const res = await apiRequest("POST", "/api/dsp/epom/sync-geofences", {
        login: epomLogin,
        password: epomPassword,
        baseUrl: epomBaseUrl,
        groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
      });
      const result = await res.json();
      setGeoSyncResult(result);
      if (result.success) {
        toast({ title: `Synced ${result.uploaded} geofences to Epom` });
      } else {
        toast({ title: `Geofence sync failed: ${result.error || "unknown error"}`, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: `Geofence sync failed: ${err.message}`, variant: "destructive" });
    }
    setGeoSyncing(false);
  };

  const fetchEpomCampaigns = async () => {
    if (!epomLogin || !epomPassword) {
      toast({ title: "Epom login and password required", variant: "destructive" });
      return;
    }
    setFetchingCampaigns(true);
    setEpomCampaigns([]);
    try {
      const res = await apiRequest("POST", "/api/dsp/epom/campaigns", {
        login: epomLogin,
        password: epomPassword,
        baseUrl: epomBaseUrl,
      });
      const data = await res.json();
      // Handle multiple possible response shapes
      let campaigns = [];
      if (Array.isArray(data)) {
        campaigns = data;
      } else if (Array.isArray(data.campaigns)) {
        campaigns = data.campaigns;
      } else if (Array.isArray(data.items)) {
        campaigns = data.items;
      } else if (data.id) {
        campaigns = [data];
      } else if (data.error) {
        toast({ title: `Epom error: ${data.error}`, variant: "destructive" });
      }
      setEpomCampaigns(campaigns);
      if (campaigns.length === 0 && !data.error) {
        toast({ title: "No campaigns found on Epom" });
      } else if (campaigns.length > 0) {
        toast({ title: `Found ${campaigns.length} campaigns on Epom` });
      }
    } catch (err: any) {
      toast({ title: `Failed to fetch campaigns: ${err.message}`, variant: "destructive" });
    }
    setFetchingCampaigns(false);
  };

  const fetchEpomCreatives = async (campaignId: string) => {
    try {
      const res = await apiRequest("POST", `/api/dsp/epom/campaigns/${campaignId}/details`, {
        login: epomLogin,
        password: epomPassword,
        baseUrl: epomBaseUrl,
      });
      const data = await res.json();
      setEpomCreatives(data.creatives || []);
    } catch (err: any) {
      toast({ title: `Failed to fetch creatives: ${err.message}`, variant: "destructive" });
    }
  };

  const approveAllCreatives = async (campaignId: string) => {
    if (!epomLogin || !epomPassword) return;
    setApprovingAll(true);
    setApproveResult(null);
    try {
      const res = await apiRequest("POST", `/api/dsp/epom/campaign/${campaignId}/approve-all`, {
        login: epomLogin,
        password: epomPassword,
        baseUrl: epomBaseUrl,
      });
      const result = await res.json();
      setApproveResult(result);
      if (result.failed === 0) {
        toast({ title: `Approved ${result.approved} creatives` });
      } else {
        toast({ title: `Approved ${result.approved}, failed ${result.failed}`, variant: "destructive" });
      }
      // Refresh creatives
      fetchEpomCreatives(campaignId);
    } catch (err: any) {
      toast({ title: `Approve failed: ${err.message}`, variant: "destructive" });
    }
    setApprovingAll(false);
  };

  const testSdkIngest = async () => {
    const testPayload = {
      lat: 41.681427,
      lng: -73.855606,
      maid: "sdk-ping-test-" + Date.now(),
      os: "Android",
      osv: "14.0",
      make: "Google",
      model: "Pixel 8",
    };
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
      });
      const data = await res.json();
      setSdkResult(JSON.stringify(data, null, 2));
      toast({ title: data.captured ? `Captured: ${data.geofence}` : "Outside geofence" });
    } catch (err: any) {
      setSdkResult(`Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Selective Bidding Info */}
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-2">Selective Bidding Architecture</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
            <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-400 font-mono">204</span>
            <span className="text-muted-foreground">Non-targeted MAID → Free harvest, no cost</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">200</span>
            <span className="text-muted-foreground">Targeted MAID in geofence → $0.50 CPM bid</span>
          </div>
        </div>
      </div>

      {/* API Sync */}
      <div className="bg-card border rounded-lg p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Automated DSP Audience Sync</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Push captured MAIDs and geofence polygons to Epom or SmartyAds. Select which geofence groups to sync — each group stays separate so you can target different campaigns independently.
          </p>
        </div>

        {/* Geofence Group Selector */}
        {groups.length > 0 && (
          <div className="bg-muted/20 rounded p-2">
            <p className="text-xs font-medium mb-1.5">Select Geofence Groups to Sync:</p>
            <div className="space-y-1">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                    className="w-3.5 h-3.5"
                  />
                  <span className="text-xs font-medium flex-1">{g.label}</span>
                  <span className="text-[10px] text-muted-foreground">{g.count} geofences</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{g.source}</span>
                </label>
              ))}
            </div>
            {selectedGroupIds.length === 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">No groups selected — will sync ALL {geofences.filter(g => g.active).length} active geofences</p>
            )}
            {selectedGroupIds.length > 0 && (
              <p className="text-[10px] text-primary mt-1">{selectedGeofenceIds.length} geofences selected from {selectedGroupIds.length} group(s)</p>
            )}
          </div>
        )}

        {/* DSP selector */}
        <div className="flex gap-2">
          <button
            onClick={() => setDsp("epom")}
            className={`px-3 py-1.5 rounded text-xs font-medium ${dsp === "epom" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Epom (REST API)
          </button>
          <button
            onClick={() => setDsp("smartyads")}
            className={`px-3 py-1.5 rounded text-xs font-medium ${dsp === "smartyads" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            SmartyAds (JSON API)
          </button>
        </div>

        {/* Credentials */}
        {dsp === "epom" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium block mb-1">Epom Login (username)</label>
                <input
                  value={epomLogin}
                  onChange={(e) => setEpomLogin(e.target.value)}
                  placeholder="your-email@example.com"
                  className="bg-input border rounded px-2 py-1 text-xs w-full"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Epom Password</label>
                <input
                  value={epomPassword}
                  onChange={(e) => setEpomPassword(e.target.value)}
                  type="password"
                  placeholder="Your Epom password"
                  className="bg-input border rounded px-2 py-1 text-xs w-full"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">API Base URL</label>
              <input
                value={epomBaseUrl}
                onChange={(e) => setEpomBaseUrl(e.target.value)}
                placeholder="https://dsp-api.epommarket.com"
                className="bg-input border rounded px-2 py-1 text-xs w-full"
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs font-medium block mb-1">API Token</label>
            <input
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              type="password"
              placeholder="SmartyAds DSP API token"
              className="bg-input border rounded px-2 py-1 text-xs w-full"
            />
          </div>
        )}

        {/* Audience name */}
        <div>
          <label className="text-xs font-medium block mb-1">Segment Name</label>
          <input
            value={audienceName}
            onChange={(e) => setAudienceName(e.target.value)}
            placeholder="e.g. Poughkeepsie Auto Repair Geofence Audience"
            className="bg-input border rounded px-2 py-1 text-xs w-full"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing || !audienceName}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Sync to {dsp === "epom" ? "Epom" : "SmartyAds"}
          </button>
          <span className="text-xs text-muted-foreground">
            {selectedGeofenceIds.length} geofences → {stats?.totalDevices ?? 0} captured MAIDs
          </span>
        </div>

        {syncResult && (
          <div className="bg-muted/30 rounded p-2 text-xs font-mono">
            <pre>{JSON.stringify(syncResult, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* Epom Geofence Sync */}
      {dsp === "epom" && (
        <div className="bg-card border rounded-lg p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Sync Geofences to Epom</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Push {selectedGeofenceIds.length} geofence{selectedGroupIds.length > 0 ? " (selected groups only)" : " (all)"} to Epom so campaigns can target by location directly on their platform.
            </p>
          </div>
          <button
            onClick={handleGeoSync}
            disabled={geoSyncing || !epomLogin || !epomPassword || selectedGeofenceIds.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {geoSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
            Push {selectedGeofenceIds.length} Geofences to Epom
          </button>
          {geoSyncResult && (
            <div className="bg-muted/30 rounded p-2 text-xs font-mono">
              <pre>{JSON.stringify(geoSyncResult, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {/* Epom Campaign & Creative Management */}
      {dsp === "epom" && (
        <div className="bg-card border rounded-lg p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Epom Campaigns & Creative Approval</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Fetch your Epom campaigns and approve creatives directly from here. No more manual approval in Epom's dashboard.
            </p>
          </div>
          <button
            onClick={fetchEpomCampaigns}
            disabled={fetchingCampaigns || !epomLogin || !epomPassword}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {fetchingCampaigns ? <Loader2 className="w-3 h-3 animate-spin" /> : <Megaphone className="w-3 h-3" />}
            Fetch Epom Campaigns
          </button>

          {epomCampaigns.length > 0 && (
            <div className="space-y-2">
              {epomCampaigns.map((c: any, idx: number) => {
                const cid = c.id || c.campaignId || c.campaign || String(idx);
                const cname = c.name || c.campaignName || `Campaign ${cid}`;
                const cstatus = c.status || c.campaignStatus;
                return (
                  <div key={cid} className="border rounded p-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-medium">{cname}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">ID: {cid}</span>
                        {cstatus && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-2">{String(cstatus)}</span>}
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => fetchEpomCreatives(cid)}
                          className="px-2 py-1 rounded bg-muted hover:bg-muted/70 text-[10px] font-medium"
                        >
                          Show Creatives
                        </button>
                        <button
                          onClick={() => approveAllCreatives(cid)}
                          disabled={approvingAll}
                          className="px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 text-[10px] font-medium disabled:opacity-50"
                        >
                          {approvingAll ? "Approving..." : "Approve All"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {approveResult && (
                <div className="bg-muted/30 rounded p-2 text-xs font-mono">
                  <pre>{JSON.stringify(approveResult, null, 2)}</pre>
                </div>
              )}
            </div>
          )}

          {epomCreatives.length > 0 && (
            <div className="border rounded p-2">
              <p className="text-xs font-medium mb-1.5">Creatives:</p>
              <div className="space-y-1">
                {epomCreatives.map((cr: any, idx: number) => {
                  const crid = cr.id || cr.creativeId || String(idx);
                  const crname = cr.name || cr.creativeName || `Creative ${crid}`;
                  const crstatus = cr.approvalStatus || cr.approval;
                  return (
                    <div key={crid} className="flex items-center justify-between p-1.5 rounded hover:bg-muted/30">
                      <div>
                        <span className="text-xs">{crname}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">ID: {crid}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {crstatus && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            String(crstatus).toUpperCase() === "APPROVED" ? "bg-green-500/20 text-green-400" :
                            String(crstatus).toUpperCase() === "DISAPPROVED" ? "bg-red-500/20 text-red-400" :
                            "bg-yellow-500/20 text-yellow-400"
                          }`}>{String(crstatus)}</span>
                        )}
                        <button
                          onClick={() => {
                            const campaignId = epomCampaigns[0]?.id || epomCampaigns[0]?.campaignId;
                            if (campaignId) {
                              apiRequest("POST", "/api/dsp/epom/creative/approve", {
                                login: epomLogin, password: epomPassword, baseUrl: epomBaseUrl,
                                campaignId, creativeId: crid,
                              }).then(() => {
                                toast({ title: "Creative approved" });
                                fetchEpomCreatives(campaignId);
                              }).catch((err: any) => toast({ title: `Failed: ${err.message}`, variant: "destructive" }));
                            }
                          }}
                          className="text-[10px] px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-700"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sync Logs */}
      {syncLogs.length > 0 && (
        <div className="bg-card border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Sync History</h3>
          <table className="w-full text-xs">
            <thead className="border-b">
              <tr>
                <th className="text-left p-1.5 font-medium">Provider</th>
                <th className="text-left p-1.5 font-medium">Segment</th>
                <th className="text-right p-1.5 font-medium">MAIDs</th>
                <th className="text-right p-1.5 font-medium">Uploaded</th>
                <th className="text-center p-1.5 font-medium">Status</th>
                <th className="text-left p-1.5 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {syncLogs.map((log: any, i: number) => (
                <tr key={i} className="border-b">
                  <td className="p-1.5">{log.provider}</td>
                  <td className="p-1.5">{log.segment_name}</td>
                  <td className="p-1.5 text-right">{log.total_maids}</td>
                  <td className="p-1.5 text-right">{log.uploaded}</td>
                  <td className="p-1.5 text-center">
                    {log.success ? (
                      <span className="text-green-400 text-[10px]">✓ success</span>
                    ) : (
                      <span className="text-red-400 text-[10px]">✗ failed</span>
                    )}
                  </td>
                  <td className="p-1.5 text-muted-foreground text-[10px]">{(log.duration_ms / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual CSV Export */}
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-2">Manual MAID Export (No API Needed)</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Download captured device IDs as CSV. Upload directly to Epom, SmartyAds, or any DSP with bulk import.
        </p>
        <a
          href="/api/dsp/export-maids"
          onClick={(e) => { e.preventDefault(); window.open('/api/dsp/export-maids', '_blank'); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 w-fit"
        >
          <Send className="w-3 h-3" />
          Download MAIDs CSV ({stats?.totalDevices ?? 0} devices)
        </a>
      </div>

      {/* Direct SDK Ingestion */}
      <div className="bg-card border rounded-lg p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Direct SDK Ingestion (Bypass SSP)</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Mobile apps or web SDKs ping <code className="text-primary">POST /api/ingest</code> directly with JSON.
            No OpenRTB wrapper, no SSP intermediary.
          </p>
        </div>
        <div className="bg-muted/30 rounded p-2 text-xs font-mono overflow-x-auto">
          <pre>{`POST /api/ingest
Content-Type: application/json

{
  "lat": 41.681427,
  "lng": -73.855606,
  "maid": "device-idfa-xxx",
  "os": "iOS"
}

// Inside geofence: { "captured": true, "geofence": "J&J Auto", "new_device": true }
// Outside: { "captured": false, "reason": "outside_geofence" }`}</pre>
        </div>
        <button
          onClick={testSdkIngest}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
        >
          <Radio className="w-3 h-3" />
          Test SDK Ingest
        </button>
        {sdkResult && (
          <div className="bg-muted/30 rounded p-2 text-xs font-mono">
            <pre>{sdkResult}</pre>
          </div>
        )}
      </div>

      {/* Self-serve DSP links */}
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-2">Self-Serve DSP Registration</h3>
        <div className="grid grid-cols-2 gap-2">
          <a href="https://smartyads.com/self-serve" target="_blank" rel="noopener" className="flex items-center gap-2 px-3 py-2 rounded border hover:bg-muted/30 text-xs">
            <span className="w-2 h-2 rounded-full bg-green-400" /> SmartyAds — self-serve, DSP API
          </a>
          <a href="https://epom.com/dsp" target="_blank" rel="noopener" className="flex items-center gap-2 px-3 py-2 rounded border hover:bg-muted/30 text-xs">
            <span className="w-2 h-2 rounded-full bg-green-400" /> Epom — self-serve, no minimum
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Exchange Connections Tab ───────────────────────────────────────────

function ExchangeConnectionsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [addResult, setAddResult] = useState<any>(null);

  const { data: available = [] } = useQuery<any[]>({
    queryKey: ["exchanges-available"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/exchanges/available");
      return res.json();
    },
  });

  const { data: connections = [] } = useQuery<any[]>({
    queryKey: ["exchanges"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/exchanges");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const addMutation = useMutation({
    mutationFn: async (data: { name: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/exchanges", data);
      return res.json();
    },
    onSuccess: (data) => {
      setAddResult(data);
      toast({ title: `Connection created for ${data.name}` });
      setNewName("");
      setNewNotes("");
      setShowAdd(false);
      queryClient.invalidateQueries({ queryKey: ["exchanges"] });
    },
    onError: (err: any) => {
      toast({ title: `Failed: ${err.message}`, variant: "destructive" });
    },
  });

  const toggleStatus = async (id: string, status: string) => {
    try {
      await apiRequest("PATCH", `/api/exchanges/${id}/status`, { status });
      toast({ title: `Connection ${status}` });
      queryClient.invalidateQueries({ queryKey: ["exchanges"] });
    } catch (err: any) {
      toast({ title: `Failed: ${err.message}`, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5"><Network className="w-4 h-4" /> SSP / Exchange Connections</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Connect directly to SSPs and ad exchanges. They send OpenRTB bid requests to your endpoint, you bid with your campaigns.
          No middleman. No creative review boards. Full control.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          <StatCard label="Connections" value={connections.length} icon={Network} color="text-blue-400" />
          <StatCard label="Active" value={connections.filter((c: any) => c.status === "active").length} icon={CheckCircle} color="text-green-400" />
          <StatCard label="Bid Requests" value={connections.reduce((sum: number, c: any) => sum + (c.bidRequestsReceived || 0), 0)} icon={Radio} color="text-orange-400" />
        </div>

        {/* Your bid endpoint */}
        <div className="bg-muted/30 rounded p-2 mb-3">
          <p className="text-xs font-medium mb-1">Your Bid Endpoint:</p>
          <code className="text-[10px] text-primary">POST https://leadcaffeine.com/api/openrtb/auction</code>
          <p className="text-[10px] text-muted-foreground mt-1">Give this URL to SSPs when registering as a bidder. They send OpenRTB 2.5 bid requests here.</p>
        </div>

        {/* Active connections */}
        {connections.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs font-medium">Your Connections:</p>
            {connections.map((c: any) => (
              <div key={c.id} className="border rounded p-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${c.status === "active" ? "bg-green-400" : c.status === "pending" ? "bg-yellow-400" : "bg-red-400"}`} />
                    <span className="text-xs font-medium">{c.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c.status}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{c.bidRequestsReceived || 0} requests</span>
                    {c.status === "pending" && (
                      <button onClick={() => toggleStatus(c.id, "active")} className="text-[10px] px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-700">Activate</button>
                    )}
                    {c.status === "active" && (
                      <button onClick={() => toggleStatus(c.id, "suspended")} className="text-[10px] px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700">Suspend</button>
                    )}
                    {c.status === "suspended" && (
                      <button onClick={() => toggleStatus(c.id, "active")} className="text-[10px] px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-700">Reactivate</button>
                    )}
                  </div>
                </div>
                {c.apiKey && (
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">API Key:</span>
                    <code className="text-[10px] text-primary">{c.apiKey}</code>
                  </div>
                )}
                {c.lastBidRequest && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">Last request: {new Date(c.lastBidRequest).toLocaleString()}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add new connection */}
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
        >
          <Plus className="w-3 h-3" />
          Add Exchange Connection
        </button>

        {showAdd && (
          <div className="mt-2 space-y-2 border rounded p-3">
            <div>
              <label className="text-xs font-medium block mb-1">Exchange Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. BidsCube, Magnite, BidSwitch" className="bg-input border rounded px-2 py-1 text-xs w-full" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Notes</label>
              <input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Account info, contact, etc." className="bg-input border rounded px-2 py-1 text-xs w-full" />
            </div>
            <button
              onClick={() => addMutation.mutate({ name: newName, notes: newNotes })}
              disabled={addMutation.isPending || !newName}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {addMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Create Connection
            </button>
            {addResult && (
              <div className="bg-muted/30 rounded p-2 text-xs space-y-1">
                <p className="text-green-400 font-medium">Connection created!</p>
                <p>Give the SSP this bid endpoint:</p>
                <code className="text-[10px] text-primary block">{addResult.bidEndpoint}</code>
                <p>And this API key:</p>
                <code className="text-[10px] text-primary block">{addResult.apiKey}</code>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Available SSPs */}
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-2">Available SSP / Exchange Partners</h3>
        <p className="text-xs text-muted-foreground mb-3">Sign up with these SSPs, register your bid endpoint, and they'll start sending you real bid traffic.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {available.map((p: any) => (
            <div key={p.name} className="border rounded p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{p.name}</span>
                <a href={p.signupUrl} target="_blank" rel="noopener" className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90">Sign Up</a>
              </div>
              <p className="text-[10px] text-muted-foreground">{p.description}</p>
              <div className="flex flex-wrap gap-1 pt-1">
                {p.requirements?.map((r: string) => (
                  <span key={r} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r}</span>
                ))}
              </div>
              {p.docsUrl && (
                <a href={p.docsUrl} target="_blank" rel="noopener" className="text-[10px] text-primary hover:underline block">Docs →</a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Conversions Tab ────────────────────────────────────────────────────

function ConversionsTab() {
  const { data: conversions = [] } = useQuery<any[]>({
    queryKey: ["conversions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/conversions?limit=50");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const totalValue = conversions.reduce((sum: number, c: any) => sum + (parseFloat(c.conversion_value) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> S2S Conversion Tracking</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Conversions from landing pages feed back into the bidding engine. Creatives that convert get higher bid multipliers automatically.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard label="Total Conversions" value={conversions.length} icon={CheckCircle} color="text-green-400" />
          <StatCard label="Conversion Value" value={`$${totalValue.toFixed(2)}`} icon={DollarSign} color="text-blue-400" />
          <StatCard label="Avg Value" value={conversions.length > 0 ? `$${(totalValue / conversions.length).toFixed(2)}` : "$0"} icon={TrendingUp} color="text-orange-400" />
        </div>

        {/* Conversion tracking snippet */}
        <div className="bg-muted/30 rounded p-2 mb-3">
          <p className="text-xs font-medium mb-1">Landing Page Tracking Snippet:</p>
          <p className="text-[10px] text-muted-foreground mb-2">Add this to your landing pages to fire conversion events back to the bidding engine:</p>
          <pre className="text-[10px] font-mono overflow-x-auto">{`<script>
fetch("https://leadcaffeine.com/api/conversion", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    tid: new URLSearchParams(location.search).get("tid"),
    event_id: 1,
    conversion_value: 250.00,
    creative_id: "your-creative-id",
    campaign_id: "your-campaign-id"
  })
});
</script>`}</pre>
        </div>

        {/* Conversion log */}
        {conversions.length > 0 ? (
          <table className="w-full text-xs">
            <thead className="border-b">
              <tr>
                <th className="text-left p-1.5 font-medium">Tracking ID</th>
                <th className="text-left p-1.5 font-medium">Campaign</th>
                <th className="text-right p-1.5 font-medium">Value</th>
                <th className="text-left p-1.5 font-medium">MAID</th>
                <th className="text-left p-1.5 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {conversions.map((c: any) => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="p-1.5 text-[10px] font-mono">{(c.tracking_id || "").slice(0, 12)}...</td>
                  <td className="p-1.5 text-[10px]">{(c.campaign_id || "").slice(0, 8) || "—"}</td>
                  <td className="p-1.5 text-right">${(parseFloat(c.conversion_value) || 0).toFixed(2)}</td>
                  <td className="p-1.5 text-[10px]">{(c.maid || "").slice(0, 8) || "—"}</td>
                  <td className="p-1.5 text-[10px] text-muted-foreground">{c.recorded_at ? new Date(c.recorded_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-8">
            <TrendingUp className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No conversions yet. Add the tracking snippet to your landing pages to start receiving conversion events.</p>
          </div>
        )}
      </div>
    </div>
  );
}
