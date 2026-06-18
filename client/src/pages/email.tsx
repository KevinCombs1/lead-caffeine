import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Mail, Send, Pause, Play, Trash2, Plus, Upload, Settings, FileText, Users,
  ChevronDown, ChevronUp, Clock, CheckCircle, AlertTriangle, XCircle,
  Eye, Loader2, HelpCircle, Wand2, Download
} from "lucide-react";

interface Campaign {
  id: number;
  name: string;
  templateId: number | null;
  subject: string;
  body: string;
  status: string;
  senderName: string | null;
  senderEmail: string | null;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  bouncedCount: number;
  dripSpeed: number;
  createdAt: string;
}

interface Template {
  id: number;
  name: string;
  subject: string;
  body: string;
  variables: string[] | null;
  isHtml: boolean;
  createdAt: string;
}

interface Recipient {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: string;
  sentAt: string | null;
  error: string | null;
}

interface Provider {
  id: number;
  name: string;
  displayName: string;
  host: string;
  port: number;
  secure: boolean;
  authUser: string;
  hasPassword: boolean;
  dailyLimit: number;
  isActive: boolean;
}

export default function EmailPage() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("campaigns");
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showGuideDialog, setShowGuideDialog] = useState(false);
  const [showOptimizerDialog, setShowOptimizerDialog] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [expandedCampaign, setExpandedCampaign] = useState<number | null>(null);
  const [csvText, setCsvText] = useState("");
  const [uploadingCampaign, setUploadingCampaign] = useState<Campaign | null>(null);

  const [newCampaign, setNewCampaign] = useState({
    name: "",
    subject: "",
    body: "",
    senderName: "",
    senderEmail: "",
    dripSpeed: 60,
  });

  const [newTemplate, setNewTemplate] = useState({
    name: "",
    subject: "",
    body: "",
    variables: ["firstName", "lastName", "company", "email"],
    isHtml: true,
  });

  const [newProvider, setNewProvider] = useState({
    name: "",
    displayName: "",
    host: "",
    port: 587,
    secure: false,
    authUser: "",
    authPassword: "",
    dailyLimit: 500,
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/email/campaigns"],
  });

  const { data: templates } = useQuery<Template[]>({
    queryKey: ["/api/email/templates"],
  });

  const { data: providers } = useQuery<Provider[]>({
    queryKey: ["/api/email/providers"],
  });

  const { data: recipients } = useQuery({
    queryKey: ["/api/email/campaigns", expandedCampaign, "recipients"],
    queryFn: async () => {
      if (!expandedCampaign) return [];
      const res = await fetch(`/api/email/campaigns/${expandedCampaign}/recipients`);
      return res.json();
    },
    enabled: !!expandedCampaign,
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/email/campaigns", expandedCampaign, "stats"],
    queryFn: async () => {
      if (!expandedCampaign) return [];
      const res = await fetch(`/api/email/campaigns/${expandedCampaign}/stats`);
      return res.json();
    },
    enabled: !!expandedCampaign,
  });

  const createCampaign = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/email/campaigns", newCampaign);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/campaigns"] });
      setShowCampaignDialog(false);
      setNewCampaign({ name: "", subject: "", body: "", senderName: "", senderEmail: "", dripSpeed: 60 });
      toast({ title: "Campaign created", description: "Your email campaign is ready." });
    },
  });

  const createTemplate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/email/templates", newTemplate);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/templates"] });
      setShowTemplateDialog(false);
      setNewTemplate({ name: "", subject: "", body: "", variables: ["firstName", "lastName", "company", "email"], isHtml: true });
      toast({ title: "Template saved", description: "Template is ready for use." });
    },
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/email/campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/campaigns"] });
      toast({ title: "Campaign deleted" });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/email/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/templates"] });
      toast({ title: "Template deleted" });
    },
  });

  const startCampaign = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/email/campaigns/${id}/start`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/campaigns"] });
      toast({ title: "Campaign started", description: "Emails are being sent." });
    },
  });

  const pauseCampaign = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/email/campaigns/${id}/pause`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/campaigns"] });
      toast({ title: "Campaign paused" });
    },
  });

  const uploadRecipients = useMutation({
    mutationFn: async () => {
      if (!uploadingCampaign) return;
      const lines = csvText.trim().split("\n");
      if (lines.length < 2) throw new Error("CSV needs at least a header row and one data row");
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      const rows = lines.slice(1).map(line => {
        const values = line.split(",");
        const row: any = {};
        headers.forEach((h, i) => {
          row[h] = values[i]?.trim() || "";
        });
        return row;
      }).filter(r => r.email);
      const res = await apiRequest("POST", `/api/email/campaigns/${uploadingCampaign.id}/recipients`, { rows, type: "csv" });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/campaigns", uploadingCampaign?.id, "recipients"] });
      setShowUploadDialog(false);
      setCsvText("");
      toast({ title: "Recipients uploaded", description: `${data.added} recipients added.` });
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "sent": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "sending": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "queued": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "bounced": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "paused": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "sent": return <CheckCircle className="w-3 h-3" />;
      case "sending": return <Send className="w-3 h-3" />;
      case "queued": return <Clock className="w-3 h-3" />;
      case "bounced": return <AlertTriangle className="w-3 h-3" />;
      case "paused": return <Pause className="w-3 h-3" />;
      default: return <Clock className="w-3 h-3" />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className={`px-4 py-3 border-b ${theme.accentBorder}`}>
        <h1 className={`text-lg font-semibold ${theme.accentClass} tracking-tight flex items-center gap-2`}>
          <Mail className="w-5 h-5" />
          Email Outreach
        </h1>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-muted-foreground">
            Human Timing Algorithm — 1,000+ emails/day via Gmail, Outlook, Yahoo rotation
          </p>
          <button
            onClick={() => setShowGuideDialog(true)}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border ${theme.accentBorder} ${theme.accentClass} hover:bg-accent/10 transition-colors`}
            data-testid="button-email-guide"
          >
            <HelpCircle className="w-3 h-3" />
            How-To Guide
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <button
          onClick={() => setShowOptimizerDialog(true)}
          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded border ${theme.accentBorder} ${theme.accentClass} hover:bg-accent/10 transition-colors`}
          data-testid="button-csv-optimizer"
        >
          <Wand2 className="w-3.5 h-3.5" />
          CSV Optimizer
        </button>
        <span className="text-[10px] text-muted-foreground">
          Paste any messy contact CSV → get clean email-ready output
        </span>
      </div>

      <div className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="campaigns">
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="templates">
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="providers">
              <Settings className="w-3.5 h-3.5 mr-1.5" />
              Providers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-foreground">Campaigns</h2>
              <Button size="sm" onClick={() => setShowCampaignDialog(true)} data-testid="button-new-campaign">
                <Plus className="w-3.5 h-3.5 mr-1" />
                New Campaign
              </Button>
            </div>

            {campaignsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : !campaigns?.length ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No campaigns yet. Create your first email campaign.
              </div>
            ) : (
              <div className="space-y-2">
                {(campaigns as Campaign[]).map((campaign) => (
                  <Card key={campaign.id} className="overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium ${statusColor(campaign.status)}`}>
                            {statusIcon(campaign.status)}
                            {campaign.status}
                          </div>
                          <span className="text-sm font-medium">{campaign.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {campaign.status === "sending" ? (
                            <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => pauseCampaign.mutate(campaign.id)} data-testid={`button-pause-${campaign.id}`}>
                              <Pause className="w-3.5 h-3.5" />
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => startCampaign.mutate(campaign.id)} data-testid={`button-start-${campaign.id}`}>
                              <Play className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => { setUploadingCampaign(campaign); setShowUploadDialog(true); }} data-testid={`button-upload-${campaign.id}`}>
                            <Upload className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => setExpandedCampaign(expandedCampaign === campaign.id ? null : campaign.id)} data-testid={`button-expand-${campaign.id}`}>
                            {expandedCampaign === campaign.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </Button>
                          <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive/70 hover:text-destructive" onClick={() => deleteCampaign.mutate(campaign.id)} data-testid={`button-delete-${campaign.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {campaign.recipientCount} recipients
                        </span>
                        <span className="flex items-center gap-1">
                          <Send className="w-3 h-3" />
                          {campaign.sentCount} sent
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {campaign.openedCount} opened
                        </span>
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {campaign.bouncedCount} bounced
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {campaign.dripSpeed}s drip
                        </span>
                      </div>

                      {expandedCampaign === campaign.id && (
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                          <div>
                            <Label className="text-[10px] uppercase text-muted-foreground">Subject</Label>
                            <p className="text-xs text-foreground mt-0.5">{campaign.subject}</p>
                          </div>
                          <div>
                            <Label className="text-[10px] uppercase text-muted-foreground">Body Preview</Label>
                            <p className="text-xs text-foreground mt-0.5 line-clamp-3">{campaign.body.replace(/<[^>]+>/g, " ").substring(0, 200)}</p>
                          </div>
                          {stats && (
                            <div>
                              <Label className="text-[10px] uppercase text-muted-foreground">Status Breakdown</Label>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(stats as { status: string; count: number }[]).map((s) => (
                                  <Badge key={s.status} variant="outline" className="text-[10px]">
                                    {s.status}: {s.count}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {recipients && recipients.length > 0 && (
                            <div>
                              <Label className="text-[10px] uppercase text-muted-foreground">Recipients</Label>
                              <div className="mt-1 max-h-64 overflow-y-auto border rounded">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-[10px]">Email</TableHead>
                                      <TableHead className="text-[10px]">Name</TableHead>
                                      <TableHead className="text-[10px]">Company</TableHead>
                                      <TableHead className="text-[10px]">Status</TableHead>
                                      <TableHead className="text-[10px]">Error</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(recipients as Recipient[]).map((r) => (
                                      <TableRow key={r.id}>
                                        <TableCell className="text-[10px]">{r.email}</TableCell>
                                        <TableCell className="text-[10px]">{r.firstName} {r.lastName}</TableCell>
                                        <TableCell className="text-[10px]">{r.company}</TableCell>
                                        <TableCell className="text-[10px]">
                                          <span className={`flex items-center gap-1 ${statusColor(r.status)}`}>
                                            {statusIcon(r.status)}
                                            {r.status}
                                          </span>
                                        </TableCell>
                                        <TableCell className="text-[10px] text-red-400">{r.error || "—"}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-foreground">Templates</h2>
              <Button size="sm" onClick={() => setShowTemplateDialog(true)} data-testid="button-new-template">
                <Plus className="w-3.5 h-3.5 mr-1" />
                New Template
              </Button>
            </div>

            {!templates?.length ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No templates yet. Create a reusable email template.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(templates as Template[]).map((template) => (
                  <Card key={template.id} className="overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{template.name}</span>
                        <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive/70 hover:text-destructive" onClick={() => deleteTemplate.mutate(template.id)} data-testid={`button-delete-template-${template.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{template.subject}</p>
                      <p className="text-xs text-foreground mt-1 line-clamp-3">{template.body.replace(/<[^>]+>/g, " ").substring(0, 150)}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(template.variables || []).map((v) => (
                          <Badge key={v} variant="outline" className="text-[10px]">
                            {"{"}{"{"}{v}{"}"}{"}"}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="providers">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-foreground">SMTP Providers</h2>
              <Button size="sm" onClick={() => setShowProviderDialog(true)} data-testid="button-new-provider">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Provider
              </Button>
            </div>

            {!providers?.length ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No providers configured. Add your Gmail, Outlook, or Yahoo SMTP credentials.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(providers as Provider[]).map((provider) => (
                  <Card key={provider.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{provider.displayName}</span>
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium ${provider.isActive ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}>
                          {provider.isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {provider.isActive ? "Active" : "Inactive"}
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-2 space-y-1">
                        <p>Host: {provider.host}:{provider.port}</p>
                        <p>User: {provider.authUser}</p>
                        <p>Daily Limit: {provider.dailyLimit}</p>
                        <p>Secure: {provider.secure ? "Yes" : "No"}</p>
                        <p>Password: {provider.hasPassword ? "Configured" : "Not set"}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* New Campaign Dialog */}
      <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">New Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <div>
              <Label className="text-[10px] uppercase">Name</Label>
              <Input value={newCampaign.name} onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })} className="text-xs mt-1" placeholder="Summer Tax Credit Outreach" />
            </div>
            <div>
              <Label className="text-[10px] uppercase">Subject</Label>
              <Input value={newCampaign.subject} onChange={(e) => setNewCampaign({ ...newCampaign, subject: e.target.value })} className="text-xs mt-1" placeholder="Maximize your R&D tax credits — free analysis" />
            </div>
            <div>
              <Label className="text-[10px] uppercase">Body (HTML)</Label>
              <Textarea value={newCampaign.body} onChange={(e) => setNewCampaign({ ...newCampaign, body: e.target.value })} className="text-xs mt-1 min-h-[120px]" placeholder={`Hi {{firstName}},<br><br>We found your company {{company}} may qualify for R&D tax credits worth $50K-$500K. Get a free analysis.<br><br>Best,<br>D.A.T.A. Cloudware`} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase">Sender Name</Label>
                <Input value={newCampaign.senderName} onChange={(e) => setNewCampaign({ ...newCampaign, senderName: e.target.value })} className="text-xs mt-1" placeholder="D.A.T.A. Cloudware" />
              </div>
              <div>
                <Label className="text-[10px] uppercase">Sender Email</Label>
                <Input value={newCampaign.senderEmail} onChange={(e) => setNewCampaign({ ...newCampaign, senderEmail: e.target.value })} className="text-xs mt-1" placeholder="noreply@datacloudware.com" />
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase">Drip Speed (seconds between emails)</Label>
              <Input type="number" value={newCampaign.dripSpeed} onChange={(e) => setNewCampaign({ ...newCampaign, dripSpeed: Number(e.target.value) })} className="text-xs mt-1" min={10} max={600} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" variant="ghost">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={() => createCampaign.mutate()} disabled={!newCampaign.name || !newCampaign.subject || !newCampaign.body}>
              <Send className="w-3.5 h-3.5 mr-1" />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">New Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <div>
              <Label className="text-[10px] uppercase">Name</Label>
              <Input value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} className="text-xs mt-1" placeholder="R&D Tax Credit Outreach" />
            </div>
            <div>
              <Label className="text-[10px] uppercase">Subject</Label>
              <Input value={newTemplate.subject} onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })} className="text-xs mt-1" placeholder="{{company}} — Unclaimed R&D Credits Available" />
            </div>
            <div>
              <Label className="text-[10px] uppercase">Body (HTML)</Label>
              <Textarea value={newTemplate.body} onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })} className="text-xs mt-1 min-h-[120px]" placeholder={`Hi {{firstName}},<br><br>We found {{company}} may qualify for R&D tax credits worth $50K-$500K.<br><br>Best,<br>D.A.T.A. Cloudware`} />
            </div>
            <div className="text-[10px] text-muted-foreground">
              Available variables: {"{"}{"{"}firstName{"}"}{"}"}, {"{"}{"{"}lastName{"}"}{"}"}, {"{"}{"{"}company{"}"}{"}"}, {"{"}{"{"}email{"}"}{"}"}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" variant="ghost">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={() => createTemplate.mutate()} disabled={!newTemplate.name || !newTemplate.subject || !newTemplate.body}>
              <FileText className="w-3.5 h-3.5 mr-1" />
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Provider Dialog */}
      <Dialog open={showProviderDialog} onOpenChange={setShowProviderDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Add SMTP Provider</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase">Name</Label>
                <Input value={newProvider.name} onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })} className="text-xs mt-1" placeholder="gmail" />
              </div>
              <div>
                <Label className="text-[10px] uppercase">Display Name</Label>
                <Input value={newProvider.displayName} onChange={(e) => setNewProvider({ ...newProvider, displayName: e.target.value })} className="text-xs mt-1" placeholder="Gmail" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase">Host</Label>
                <Input value={newProvider.host} onChange={(e) => setNewProvider({ ...newProvider, host: e.target.value })} className="text-xs mt-1" placeholder="smtp.gmail.com" />
              </div>
              <div>
                <Label className="text-[10px] uppercase">Port</Label>
                <Input type="number" value={newProvider.port} onChange={(e) => setNewProvider({ ...newProvider, port: Number(e.target.value) })} className="text-xs mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase">Username</Label>
              <Input value={newProvider.authUser} onChange={(e) => setNewProvider({ ...newProvider, authUser: e.target.value })} className="text-xs mt-1" placeholder="your.email@gmail.com" />
            </div>
            <div>
              <Label className="text-[10px] uppercase">Password / App Password</Label>
              <Input type="password" value={newProvider.authPassword} onChange={(e) => setNewProvider({ ...newProvider, authPassword: e.target.value })} className="text-xs mt-1" placeholder="••••••••" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase">Daily Limit</Label>
                <Input type="number" value={newProvider.dailyLimit} onChange={(e) => setNewProvider({ ...newProvider, dailyLimit: Number(e.target.value) })} className="text-xs mt-1" />
              </div>
              <div>
                <Label className="text-[10px] uppercase">Secure</Label>
                <select value={newProvider.secure ? "true" : "false"} onChange={(e) => setNewProvider({ ...newProvider, secure: e.target.value === "true" })} className="w-full text-xs mt-1 h-9 rounded border border-input bg-background px-2">
                  <option value="false">No (STARTTLS)</option>
                  <option value="true">Yes (SSL/TLS)</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" variant="ghost">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={() => {
              apiRequest("POST", "/api/email/providers", newProvider).then(() => {
                queryClient.invalidateQueries({ queryKey: ["/api/email/providers"] });
                setShowProviderDialog(false);
                setNewProvider({ name: "", displayName: "", host: "", port: 587, secure: false, authUser: "", authPassword: "", dailyLimit: 500 });
                toast({ title: "Provider added" });
              });
            }} disabled={!newProvider.name || !newProvider.host || !newProvider.authUser}>
              <Settings className="w-3.5 h-3.5 mr-1" />
              Add Provider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload CSV Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Upload Recipients</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <p className="text-muted-foreground">
              Paste CSV with columns: email, firstName, lastName, company (optional). First row is header.
            </p>
            <Textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} className="text-xs mt-1 min-h-[160px] font-mono" placeholder={`email,firstName,lastName,company\njohn@example.com,John,Doe,Acme Corp\njane@company.io,Jane,Smith,Widgets Inc`} />
            {uploadingCampaign && (
              <p className="text-muted-foreground">
                Adding to: <span className="font-medium">{uploadingCampaign.name}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" variant="ghost">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={() => uploadRecipients.mutate()} disabled={!csvText.trim() || uploadRecipients.isPending}>
              {uploadRecipients.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
              Upload {uploadRecipients.isPending ? "..." : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* How-To Guide Dialog */}
      <Dialog open={showGuideDialog} onOpenChange={setShowGuideDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              Email Outreach — How-To Guide
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-xs text-foreground">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">1. Configure Your SMTP Providers</h3>
              <p className="text-muted-foreground">
                Go to the <strong>Providers</strong> tab and add your Gmail, Outlook, and Yahoo app passwords. These are NOT your regular passwords — you must generate an app-specific password in your account settings.
              </p>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-muted-foreground">
                <li><strong>Gmail:</strong> Google Account → Security → 2-Step Verification → App passwords → Generate for "Mail"</li>
                <li><strong>Outlook:</strong> Account settings → Security → Advanced security options → App passwords</li>
                <li><strong>Yahoo:</strong> Account Info → Account Security → Generate app password</li>
              </ul>
              <p className="text-muted-foreground mt-1">
                Daily limits: Gmail 500/day, Outlook 300/day, Yahoo 500/day. Total: <strong>1,300/day</strong>.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">2. Create a Template</h3>
              <p className="text-muted-foreground">
                Go to the <strong>Templates</strong> tab and click <strong>New Template</strong>. Use variables like {"{"}{"{"}firstName{"}"}{"}"}, {"{"}{"{"}lastName{"}"}{"}"}, {"{"}{"{"}company{"}"}{"}"}, {"{"}{"{"}email{"}"}{"}"} in your subject and body. These get replaced with actual recipient data at send time.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">3. Create a Campaign</h3>
              <p className="text-muted-foreground">
                Go to the <strong>Campaigns</strong> tab and click <strong>New Campaign</strong>. Fill in the name, subject, body, sender name, and sender email. Set the <strong>drip speed</strong> (seconds between emails). 72 seconds is the sweet spot for looking human.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">4. Upload Recipients</h3>
              <p className="text-muted-foreground">
                Click the <strong>Upload</strong> icon on a campaign. Paste a CSV with header row and columns: <code>email,firstName,lastName,company</code>. The first row is the header. Example:
              </p>
              <pre className="bg-muted/50 rounded p-2 mt-1 font-mono text-[10px]">
email,firstName,lastName,company
alice@techcorp.com,Alice,Johnson,TechCorp
bob@innovate.io,Bob,Williams,Innovate LLC
charlie@startup.co,Charlie,Brown,StartupCo
              </pre>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">5. Start Sending</h3>
              <p className="text-muted-foreground">
                Click the <strong>Play</strong> button on your campaign. The engine will:
              </p>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-muted-foreground">
                <li>Rotate between Gmail, Outlook, and Yahoo based on who has the most daily capacity left</li>
                <li>Wait the configured drip speed between each send (e.g., 72 seconds)</li>
                <li>Skip any provider that has no credentials or hit its daily limit</li>
                <li>Mark recipients as "sent" or "bounced" with error details</li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">6. Monitor & Pause</h3>
              <p className="text-muted-foreground">
                Expand a campaign to see every recipient, their status, and any errors. Click the <strong>Pause</strong> button to stop sending. The engine resumes automatically when you click <strong>Play</strong> again.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Human Timing Algorithm Tips</h3>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-muted-foreground">
                <li>Send only during business hours (9 AM – 5 PM) to avoid spam folders</li>
                <li>Drip speed 60–120 seconds looks human. Under 30 seconds looks like a bot</li>
                <li>Start with 50–100 test sends before a large blast</li>
                <li>Keep the same sender name across all providers for consistency</li>
                <li>Personalize with variables — emails with {"{"}{"{"}firstName{"}"}{"}"} get 2× the reply rate</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm">Got it</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Optimizer Dialog */}
      <Dialog open={showOptimizerDialog} onOpenChange={setShowOptimizerDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Wand2 className="w-4 h-4" />
              CSV List Optimizer
            </DialogTitle>
          </DialogHeader>
          <CsvOptimizer />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CsvOptimizer() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [stats, setStats] = useState({
    total: 0, clean: 0, dupes: 0, empty: 0, invalid: 0,
  });

  const BAD_EMAIL_TLDS = new Set([
    "png", "jpg", "jpeg", "gif", "svg", "ico", "pdf", "doc", "zip",
    "tar", "gz", "css", "js", "html", "json", "xml", "bmp", "webp", "mp4",
  ]);
  const isValidEmail = (email: string) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    const domain = email.split("@")[1] || "";
    const tld = domain.split(".").pop()?.toLowerCase() || "";
    return !BAD_EMAIL_TLDS.has(tld);
  };

  const extractFirstName = (email: string) => {
    const local = email.split("@")[0];
    // Remove trailing digits and common separators
    let name = local.replace(/[\d._+-]+$/, "");
    // Handle patterns like jhiginbothom, mpipitone, shogan1
    if (name.includes(".")) name = name.split(".")[0];
    if (name.includes("_")) name = name.split("_")[0];
    // Capitalize first letter
    if (name.length > 1) return name.charAt(0).toUpperCase() + name.slice(1);
    return name || local;
  };

  const handleOptimize = () => {
    if (!input.trim()) return;

    const lines = input.trim().split(/\r?\n/);
    const headerLine = lines[0] || "";
    const hasHeader = headerLine.toLowerCase().includes("email") || headerLine.includes("@");
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const seen = new Set<string>();
    const clean: { email: string; firstName: string; lastName: string; company: string }[] = [];

    let dupes = 0, empty = 0, invalid = 0;

    // Map columns: try to find email, name, website, phone indices
    const headers = hasHeader ? headerLine.split(",").map(h => h.trim().toLowerCase().replace(/"/g, "")) : [];
    const emailIdx = headers.findIndex(h => h === "email" || h === "emails" || h === "e-mail" || h === "e-mail");
    const nameIdx = headers.findIndex(h => h === "name" || h === "company" || h === "business" || h === "organization" || h === "title");

    for (const line of dataLines) {
      if (!line.trim()) continue;
      const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      // If header identified, use indices; otherwise assume: name, website, phone, email (or email as first)
      let email = emailIdx >= 0 ? cols[emailIdx] : cols[cols.length - 1];
      if (!email || !email.includes("@")) {
        // Try finding the email in any column
        email = cols.find(c => c.includes("@")) || "";
      }
      if (!email.trim()) {
        empty++;
        continue;
      }
      if (!isValidEmail(email)) {
        invalid++;
        continue;
      }
      const lowerEmail = email.toLowerCase();
      if (seen.has(lowerEmail)) {
        dupes++;
        continue;
      }
      seen.add(lowerEmail);
      const company = nameIdx >= 0 ? cols[nameIdx] : (cols[0] || "");
      clean.push({
        email: lowerEmail,
        firstName: extractFirstName(email),
        lastName: "",
        company: company || "",
      });
    }

    const outLines = ["email,firstName,lastName,company", ...clean.map(c =>
      `${c.email},${c.firstName},${c.lastName},${c.company}`
    )];
    setOutput(outLines.join("\n"));
    setStats({
      total: dataLines.length,
      clean: clean.length,
      dupes,
      empty,
      invalid,
    });
  };

  const download = () => {
    const blob = new Blob([output], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "optimized_contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-2">
        <Label className="text-xs">Paste your messy CSV here</Label>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            `name,website,phone,email\n` +
            `Capital Commercial Real Estate,capitalcomre.com,(610) 359-9700,info@capitalcomre.com\n` +
            `M&T Realty Capital Corp,mandtrealtycapital.com,(610) 341-0200,rbarry@mtb.com`
          }
          rows={8}
          className="text-xs font-mono"
          data-testid="csv-optimizer-input"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleOptimize} className="text-xs" data-testid="button-optimize">
            <Wand2 className="w-3 h-3 mr-1" />
            Optimize
          </Button>
          {output && (
            <Button size="sm" variant="outline" onClick={download} className="text-xs" data-testid="button-download-csv">
              <Download className="w-3 h-3 mr-1" />
              Download CSV
            </Button>
          )}
        </div>
      </div>

      {stats.total > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <div className="border rounded p-2 text-center">
            <div className="text-lg font-bold">{stats.total}</div>
            <div className="text-[10px] text-muted-foreground">Total rows</div>
          </div>
          <div className="border rounded p-2 text-center">
            <div className="text-lg font-bold text-green-500">{stats.clean}</div>
            <div className="text-[10px] text-muted-foreground">Clean contacts</div>
          </div>
          <div className="border rounded p-2 text-center">
            <div className="text-lg font-bold text-amber-500">{stats.dupes}</div>
            <div className="text-[10px] text-muted-foreground">Duplicates removed</div>
          </div>
          <div className="border rounded p-2 text-center">
            <div className="text-lg font-bold text-red-500">{stats.empty + stats.invalid}</div>
            <div className="text-[10px] text-muted-foreground">Empty/invalid dropped</div>
          </div>
        </div>
      )}

      {output && (
        <div className="space-y-2">
          <Label className="text-xs">Clean output</Label>
          <Textarea
            value={output}
            readOnly
            rows={8}
            className="text-xs font-mono bg-muted/50"
            data-testid="csv-optimizer-output"
          />
        </div>
      )}
    </div>
  );
}
