import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Image, Film, Upload, Trash2, Loader2, Plus, Link2, Unlink, DollarSign, MousePointerClick, Eye, Settings2, FileUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  bidPriceCpm: number;
  dailyBudget: number | null;
  totalBudget: number | null;
  totalSpent: number;
  totalImpressions: number;
  totalClicks: number;
  totalWins: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

interface Creative {
  id: string;
  campaignId: string;
  name: string;
  type: string;
  filePath: string;
  fileSize: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  clickUrl: string | null;
  headline: string | null;
  description: string | null;
  ctaText: string | null;
  displayUrl: string | null;
  status: string;
  createdAt: string;
}

interface Geofence {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
  radiusM: number;
  active: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  source: string | null;
}

interface CampaignDetail extends Campaign {
  geofenceIds: string[];
  creatives: Creative[];
}

type Tab = "list" | "create" | "detail";

export default function CampaignBuilder() {
  const [tab, setTab] = useState<Tab>("list");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/campaigns");
      return res.json();
    },
  });

  if (tab === "create") {
    return <CreateCampaignForm onCreated={(id) => { setTab("detail"); setSelectedCampaignId(id); }} onBack={() => setTab("list")} />;
  }

  if (tab === "detail" && selectedCampaignId) {
    return <CampaignDetailPage campaignId={selectedCampaignId} onBack={() => setTab("list")} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Campaigns</h3>
        <button
          onClick={() => setTab("create")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
        >
          <Plus className="w-3 h-3" />
          New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center">
          <Megaphone className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No campaigns yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {campaigns.map((c) => (
            <div
              key={c.id}
              onClick={() => { setSelectedCampaignId(c.id); setTab("detail"); }}
              className="bg-card border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${c.status === "active" ? "bg-green-400" : "bg-gray-500"}`} />
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c.status}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> ${c.bidPriceCpm.toFixed(2)}/CPM</span>
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {c.totalImpressions}</span>
                  <span className="flex items-center gap-1"><MousePointerClick className="w-3 h-3" /> {c.totalClicks}</span>
                </div>
              </div>
              {c.description && <p className="text-xs text-muted-foreground mt-1">{c.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateCampaignForm({ onCreated, onBack }: { onCreated: (id: string) => void; onBack: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [bidPriceCpm, setBidPriceCpm] = useState("0.50");
  const [dailyBudget, setDailyBudget] = useState("");
  const [totalBudget, setTotalBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/campaigns", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Campaign "${data.name}" created` });
      onCreated(data.id);
    },
    onError: (err: any) => {
      toast({ title: `Failed: ${err.message}`, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!name) {
      toast({ title: "Campaign name required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name,
      description: description || undefined,
      bidPriceCpm: parseFloat(bidPriceCpm) || 0.50,
      dailyBudget: dailyBudget ? parseFloat(dailyBudget) : undefined,
      totalBudget: totalBudget ? parseFloat(totalBudget) : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
        <h3 className="text-sm font-semibold">Create Campaign</h3>
      </div>

      <div className="bg-card border rounded-lg p-4 space-y-3">
        <div>
          <label className="text-xs font-medium block mb-1">Campaign Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q1 Auto Repair Poughkeepsie" className="bg-input border rounded px-2 py-1 text-xs w-full" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className="bg-input border rounded px-2 py-1 text-xs w-full" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs font-medium block mb-1">Bid CPM ($)</label>
            <input value={bidPriceCpm} onChange={(e) => setBidPriceCpm(e.target.value)} type="number" step="0.01" className="bg-input border rounded px-2 py-1 text-xs w-full" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Daily Budget ($)</label>
            <input value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} type="number" step="0.01" placeholder="Optional" className="bg-input border rounded px-2 py-1 text-xs w-full" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Total Budget ($)</label>
            <input value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} type="number" step="0.01" placeholder="Optional" className="bg-input border rounded px-2 py-1 text-xs w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium block mb-1">Start Date</label>
            <input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" className="bg-input border rounded px-2 py-1 text-xs w-full" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">End Date</label>
            <input value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" className="bg-input border rounded px-2 py-1 text-xs w-full" />
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={createMutation.isPending || !name}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Megaphone className="w-3 h-3" />}
          Create Campaign
        </button>
      </div>
    </div>
  );
}

function CampaignDetailPage({ campaignId, onBack }: { campaignId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const { data: campaign, refetch } = useQuery<CampaignDetail>({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/campaigns/${campaignId}`);
      return res.json();
    },
  });

  const { data: allGeofences = [] } = useQuery<Geofence[]>({
    queryKey: ["geofences"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/geofence");
      return res.json();
    },
  });

  // Creative upload form state
  const [creativeName, setCreativeName] = useState("");
  const [clickUrl, setClickUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [creativeDescription, setCreativeDescription] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [displayUrl, setDisplayUrl] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // CSV paste state
  const [csvText, setCsvText] = useState("");
  const [showCsvPaste, setShowCsvPaste] = useState(false);
  // Radius override for CSV uploads (in feet, converted to metres)
  const [radiusOverride, setRadiusOverride] = useState(""); // empty = use CSV's radius_m column

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/campaigns/${campaignId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  const uploadCreativeMutation = useMutation({
    mutationFn: async ({ file, name, clickUrl: url, headline: hl, description: desc, ctaText: cta, displayUrl: durl }: {
      file: File; name: string; clickUrl?: string; headline?: string; description?: string; ctaText?: string; displayUrl?: string;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (name) formData.append("name", name);
      if (url) formData.append("clickUrl", url);
      if (hl) formData.append("headline", hl);
      if (desc) formData.append("description", desc);
      if (cta) formData.append("ctaText", cta);
      if (durl) formData.append("displayUrl", durl);
      const res = await fetch(`/api/campaigns/${campaignId}/creatives`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Creative uploaded: ${data.name}` });
      setCreativeName("");
      setClickUrl("");
      setHeadline("");
      setCreativeDescription("");
      setCtaText("");
      setDisplayUrl("");
      setPendingFile(null);
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
    onError: (err: any) => {
      toast({ title: `Upload failed: ${err.message}`, variant: "destructive" });
    },
  });

  const uploadCsvMutation = useMutation({
    mutationFn: async (csv: string) => {
      // If radius override is set, replace the radius_m column in every data row
      let finalCsv = csv;
      if (radiusOverride) {
        const radiusM = Math.round(parseFloat(radiusOverride) * 0.3048); // feet to metres
        const lines = csv.split(/\r?\n/);
        if (lines.length > 0) {
          // Find the header and radius_m column index
          const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ""));
          const radiusIdx = header.findIndex((h) => h === "radiusm" || h === "radius_m" || h === "radius");
          if (radiusIdx >= 0) {
            finalCsv = lines.map((line, i) => {
              if (i === 0) return line; // skip header
              const fields = line.split(",");
              if (fields.length > radiusIdx) fields[radiusIdx] = String(radiusM);
              return fields.join(",");
            }).join("\n");
          }
        }
      }
      const res = await apiRequest("POST", `/api/campaigns/${campaignId}/upload-csv`, { csv: finalCsv });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `CSV imported: ${data.created} geofences created, ${data.skipped} skipped` });
      setCsvText("");
      setShowCsvPaste(false);
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["geofences"] });
    },
    onError: (err: any) => {
      toast({ title: `CSV import failed: ${err.message}`, variant: "destructive" });
    },
  });

  const linkGeofenceMutation = useMutation({
    mutationFn: async (geofenceIds: string[]) => {
      const res = await apiRequest("POST", `/api/campaigns/${campaignId}/geofences`, { geofenceIds });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Geofences linked" });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });

  const unlinkGeofenceMutation = useMutation({
    mutationFn: async (geofenceId: string) => {
      await apiRequest("DELETE", `/api/campaigns/${campaignId}/geofences/${geofenceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });

  const deleteCreativeMutation = useMutation({
    mutationFn: async (creativeId: string) => {
      await apiRequest("DELETE", `/api/creatives/${creativeId}`);
    },
    onSuccess: () => {
      toast({ title: "Creative deleted" });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });

  if (!campaign) return <div className="text-xs text-muted-foreground p-4">Loading...</div>;

  const linkedIds = new Set(campaign.geofenceIds || []);
  const unlinkedGeofences = allGeofences.filter((g) => !linkedIds.has(g.id));
  const linkedGeofences = allGeofences.filter((g) => linkedIds.has(g.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
        <h3 className="text-sm font-semibold">{campaign.name}</h3>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${campaign.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}`}>{campaign.status}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatMini label="Bid CPM" value={`$${campaign.bidPriceCpm.toFixed(2)}`} />
        <StatMini label="Impressions" value={campaign.totalImpressions.toString()} />
        <StatMini label="Clicks" value={campaign.totalClicks.toString()} />
        <StatMini label="Spent" value={`$${campaign.totalSpent.toFixed(2)}`} />
      </div>

      {/* Settings */}
      <div className="bg-card border rounded-lg p-3">
        <div className="flex items-center gap-3">
          <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Status</span>
          <select
            value={campaign.status}
            onChange={(e) => updateMutation.mutate({ status: e.target.value })}
            className="bg-input border rounded px-2 py-1 text-xs"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
          <span className="text-xs font-medium ml-2">Bid CPM ($)</span>
          <input
            type="number"
            step="0.01"
            value={campaign.bidPriceCpm}
            onChange={(e) => updateMutation.mutate({ bidPriceCpm: parseFloat(e.target.value) })}
            className="bg-input border rounded px-2 py-1 text-xs w-20"
          />
        </div>
      </div>

      {/* Upload CSV Geofences */}
      <div className="bg-card border rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-1.5"><FileUp className="w-3.5 h-3.5" /> Upload Geofences CSV</h4>
        <p className="text-xs text-muted-foreground">
          Upload a CSV with pre-geocoded businesses. Columns: <code className="text-primary">name, latitude, longitude, radius_m, address, city, state</code>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={csvRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                const text = await f.text();
                uploadCsvMutation.mutate(text);
              }
              e.target.value = "";
            }}
          />
          <button
            onClick={() => csvRef.current?.click()}
            disabled={uploadCsvMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {uploadCsvMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            Upload CSV File
          </button>
          <button
            onClick={() => setShowCsvPaste(!showCsvPaste)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium hover:bg-muted/30"
          >
            {showCsvPaste ? "Hide Paste" : "Paste CSV Text"}
          </button>
          {uploadCsvMutation.data && (
            <span className="text-xs text-green-400">✓ {uploadCsvMutation.data.created} created</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium whitespace-nowrap">Override Radius:</label>
          <select
            value={radiusOverride}
            onChange={(e) => setRadiusOverride(e.target.value)}
            className="bg-input border rounded px-2 py-1 text-xs"
          >
            <option value="">Use CSV's radius</option>
            <option value="100">100 ft (30m)</option>
            <option value="150">150 ft (46m)</option>
            <option value="200">200 ft (61m)</option>
            <option value="250">250 ft (76m)</option>
            <option value="300">300 ft (91m)</option>
            <option value="350">350 ft (107m)</option>
            <option value="400">400 ft (122m)</option>
            <option value="450">450 ft (137m)</option>
            <option value="500">500 ft (152m)</option>
            <option value="550">550 ft (168m)</option>
            <option value="600">600 ft (183m)</option>
            <option value="650">650 ft (198m)</option>
            <option value="700">700 ft (213m)</option>
            <option value="750">750 ft (229m)</option>
            <option value="800">800 ft (244m)</option>
            <option value="850">850 ft (260m)</option>
            <option value="900">900 ft (274m)</option>
            <option value="950">950 ft (290m)</option>
            <option value="1000">1000 ft (305m)</option>
          </select>
          {radiusOverride && (
            <span className="text-[10px] text-muted-foreground">All geofences will use {radiusOverride} ft ({Math.round(parseFloat(radiusOverride) * 0.3048)}m) regardless of CSV values</span>
          )}
        </div>
        {showCsvPaste && (
          <div className="space-y-2">
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="name,latitude,longitude,radius_m,address,city,state&#10;J&J Auto Repair,41.681427,-73.855606,250,123 Main St,Poughkeepsie,NY"
              className="bg-input border rounded px-2 py-1 text-xs w-full font-mono h-32"
            />
            <button
              onClick={() => csvText && uploadCsvMutation.mutate(csvText)}
              disabled={uploadCsvMutation.isPending || !csvText}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {uploadCsvMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              Import Pasted CSV
            </button>
          </div>
        )}
        <div className="bg-muted/30 rounded p-2 text-[10px] font-mono text-muted-foreground">
          name,latitude,longitude,radius_m,address,city,state<br/>
          J&J Auto Repair,41.681427,-73.855606,250,123 Main St,Poughkeepsie,NY
        </div>
      </div>

      {/* Linked Geofences */}
      <div className="bg-card border rounded-lg p-4">
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Linked Geofences ({linkedGeofences.length})</h4>
        {linkedGeofences.length === 0 ? (
          <p className="text-xs text-muted-foreground">No geofences linked. Upload a CSV or link existing geofences below.</p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {linkedGeofences.map((g) => (
              <div key={g.id} className="flex items-center justify-between p-1.5 rounded hover:bg-muted/30">
                <span className="text-xs">{g.name || "—"} <span className="text-muted-foreground text-[10px]">{g.address || ""}, {g.city || ""}</span></span>
                <button onClick={() => unlinkGeofenceMutation.mutate(g.id)} className="text-red-400 hover:text-red-300">
                  <Unlink className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {unlinkedGeofences.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs font-medium mb-2">Link existing geofences:</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {unlinkedGeofences.slice(0, 50).map((g) => (
                <div key={g.id} className="flex items-center justify-between p-1.5 rounded hover:bg-muted/30">
                  <span className="text-xs">{g.name || "—"} <span className="text-muted-foreground text-[10px]">{g.city || ""}, {g.state || ""}</span></span>
                  <button onClick={() => linkGeofenceMutation.mutate([g.id])} className="text-blue-400 hover:text-blue-300">
                    <Link2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            {unlinkedGeofences.length > 0 && (
              <button
                onClick={() => linkGeofenceMutation.mutate(unlinkedGeofences.map((g) => g.id))}
                className="mt-2 text-[10px] text-primary hover:underline"
              >
                Link all {unlinkedGeofences.length} geofences
              </button>
            )}
          </div>
        )}
      </div>

      {/* Creatives */}
      <div className="bg-card border rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          {campaign.creatives?.some((c) => c.type === "video") ? <Film className="w-3.5 h-3.5" /> : <Image className="w-3.5 h-3.5" />}
          Ad Creatives ({campaign.creatives?.length || 0})
        </h4>

        {campaign.creatives && campaign.creatives.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {campaign.creatives.map((c) => (
              <div key={c.id} className="border rounded p-2 space-y-1">
                <div className="aspect-video bg-muted/30 rounded flex items-center justify-center overflow-hidden">
                  {c.type === "image" ? (
                    <img src={`/api/creative/${c.id}`} alt={c.name} className="w-full h-full object-contain" />
                  ) : (
                    <video src={`/api/creative/${c.id}`} className="w-full h-full object-contain" muted controls />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] truncate">{c.name}</span>
                  <button onClick={() => deleteCreativeMutation.mutate(c.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {c.type} {c.width && `${c.width}x${c.height}`} {c.mimeType}
                </div>
                {(c as any).headline && <div className="text-[10px] font-semibold truncate">{(c as any).headline}</div>}
                {(c as any).ctaText && <div className="text-[10px] text-blue-400">CTA: {(c as any).ctaText}</div>}
                {c.clickUrl && (
                  <div className="text-[10px] text-blue-400 truncate">→ {c.clickUrl}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No creatives uploaded yet. Upload images or video below.</p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPendingFile(f);
            e.target.value = "";
          }}
        />

        {/* Creative metadata fields */}
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium">Ad Text (shown to phone user)</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium block mb-1">Creative Name (optional)</label>
              <input
                value={creativeName}
                onChange={(e) => setCreativeName(e.target.value)}
                placeholder={pendingFile ? pendingFile.name : "e.g. Auto Repair Banner"}
                className="bg-input border rounded px-2 py-1 text-xs w-full"
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Click URL (landing page)</label>
              <input
                value={clickUrl}
                onChange={(e) => setClickUrl(e.target.value)}
                placeholder="https://your-landing-page.com"
                className="bg-input border rounded px-2 py-1 text-xs w-full"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Headline (bold title shown on ad)</label>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. Get 20% Off Your Next Oil Change"
              maxLength={40}
              className="bg-input border rounded px-2 py-1 text-xs w-full"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Description (body text under headline)</label>
            <textarea
              value={creativeDescription}
              onChange={(e) => setCreativeDescription(e.target.value)}
              placeholder="e.g. J&J Auto Repair in Poughkeepsie — full-service oil changes, brake repair, and more. Walk-ins welcome."
              maxLength={125}
              className="bg-input border rounded px-2 py-1 text-xs w-full h-16 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium block mb-1">CTA Button Text</label>
              <select
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                className="bg-input border rounded px-2 py-1 text-xs w-full"
              >
                <option value="">No button</option>
                <option value="Learn More">Learn More</option>
                <option value="Book Now">Book Now</option>
                <option value="Call Now">Call Now</option>
                <option value="Shop Now">Shop Now</option>
                <option value="Sign Up">Sign Up</option>
                <option value="Get Offer">Get Offer</option>
                <option value="Get Directions">Get Directions</option>
                <option value="Visit Site">Visit Site</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Display URL (shown to user)</label>
              <input
                value={displayUrl}
                onChange={(e) => setDisplayUrl(e.target.value)}
                placeholder="e.g. JJAutoRepair.com"
                className="bg-input border rounded px-2 py-1 text-xs w-full"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadCreativeMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {uploadCreativeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {pendingFile ? `Upload: ${pendingFile.name}` : "Choose File"}
          </button>
          {pendingFile && (
            <button
              onClick={() => uploadCreativeMutation.mutate({ file: pendingFile, name: creativeName, clickUrl, headline, description: creativeDescription, ctaText, displayUrl })}
              disabled={uploadCreativeMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {uploadCreativeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              Upload Now
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">Max 10MB for images, 50MB for video. Supports PNG, JPG, GIF, WebP, MP4, WebM. Click URL is where users go when they click your ad.</p>
      </div>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border rounded-lg p-2 text-center">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

import { MapPin } from "lucide-react";
