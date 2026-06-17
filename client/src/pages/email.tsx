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
  Eye, Loader2
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

  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ["/api/email/campaigns"],
  });

  const { data: templates } = useQuery({
    queryKey: ["/api/email/templates"],
  });

  const { data: providers } = useQuery({
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
        <p className="text-xs text-muted-foreground mt-0.5">
          Human Timing Algorithm — 1,000+ emails/day via Gmail, Outlook, Yahoo rotation
        </p>
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
                          <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => setUploadingCampaign(campaign) || setShowUploadDialog(true)} data-testid={`button-upload-${campaign.id}`}>
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
    </div>
  );
}
