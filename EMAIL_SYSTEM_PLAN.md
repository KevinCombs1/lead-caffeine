# D.A.T.A. Cloudware — Email Outreach System: The Complete 5,000-Word Implementation Plan

## Table of Contents
1. Executive Summary
2. Architecture Philosophy
3. Phase 1: Infrastructure & Environment Setup
4. Phase 2: Database Schema Design
5. Phase 3: Backend Implementation
6. Phase 4: Frontend Implementation
7. Phase 5: Email Provider Integration
8. Phase 6: Testing & Validation
9. Phase 7: Deployment & Monitoring
10. API Key Questionnaire
11. Code Deep Dive
12. Risk Mitigation & Fallbacks
13. Next Steps Checklist

---

## 1. Executive Summary

This document is the definitive blueprint for integrating a high-volume, free-tier email outreach system into D.A.T.A. Cloudware. The system will enable sending 1,000+ emails per day at zero cost by leveraging a multi-provider rotation architecture, combining free transactional APIs (SendGrid, Brevo, Mailjet), free webmail SMTP relays (Gmail, Outlook, Yahoo), and a programmatic RSS-to-email pipeline for content-driven delivery.

The architecture follows the D.A.T.A. Cloudware manifesto: **precocious, elegant, and gentle**. Every email is tracked, every bounce is logged, every provider is monitored, and the system gracefully degrades when limits are hit.

**Key Numbers:**
- 1,000 emails/day capacity (expandable to 5,000)
- 6 free providers in rotation
- Zero cost for first 100,000 emails/month
- PostgreSQL-backed queue with retry logic
- Real-time dashboard in the existing React frontend

---

## 2. Architecture Philosophy

### 2.1 The Precocious Bee Pattern

The email system inherits the same architecture as the Beauteous Brigade. Instead of 640 bees crawling directories, we have N "sender bees" rotating across M providers. Each bee is a queued job. Each provider is a directory with rate limits. The engine is the same: interleaved round-robin, health tracking, adaptive suspension.

### 2.2 The Graceful Skip Principle

Before sending, the system checks:
- Has this email bounced before? → Skip
- Has this recipient unsubscribed? → Skip
- Is the provider currently suspended? → Rotate to next
- Is the daily quota for this provider exhausted? → Rotate to next

### 2.3 The Closed Loop

Every email is a row in the database. The lifecycle:
1. `queued` → Created from a campaign or single send
2. `composed` → Rendered with template + variables
3. `sending` → Assigned to a provider, dispatched
4. `delivered` → Provider confirms 200 OK
5. `bounced` → Provider reports bounce
6. `opened` → Tracking pixel fires
7. `clicked` → Link tracking redirect

---

## 3. Phase 1: Infrastructure & Environment Setup

### 3.1 Environment Variables Required

The following environment variables must be configured in the Replit Secrets panel (or `.env` for local development):

```
# Primary Email Providers
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAILJET_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAILJET_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# SMTP Providers (Webmail Accounts)
GMAIL_USER=yourcampaign1@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
OUTLOOK_USER=yourcampaign1@outlook.com
OUTLOOK_PASSWORD=yourpassword
YAHOO_USER=yourcampaign1@yahoo.com
YAHOO_APP_PASSWORD=xxxxxxxxxxxxxxxx

# RSS-to-Email Provider
FEEDBURNER_FEED_URL=https://feeds.feedburner.com/yourfeed
FOLLOWIT_FEED_URL=https://follow.it/yourfeed

# Email System Configuration
EMAIL_DAILY_LIMIT=1000
EMAIL_BATCH_SIZE=50
EMAIL_BATCH_INTERVAL_MS=60000
EMAIL_MAX_RETRIES=3
EMAIL_RETRY_BACKOFF_MS=300000

# Tracking Domain
EMAIL_TRACKING_DOMAIN=https://yourapp.com

# Optional: Advanced Providers
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAILGUN_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=sandboxxxxxxxxxxxxxxxxx.mailgun.org
```

### 3.2 Dependencies to Install

```bash
npm install nodemailer @sendgrid/mail sib-api-v3-sdk node-mailjet resend
npm install -D @types/nodemailer
```

**Package Purposes:**
- `nodemailer`: Universal SMTP transport for Gmail, Outlook, Yahoo, custom servers
- `@sendgrid/mail`: SendGrid v3 API client
- `sib-api-v3-sdk`: Brevo (ex-Sendinblue) API client
- `node-mailjet`: Mailjet v3.1 API client
- `resend`: Resend API client (modern, React Email compatible)

---

## 4. Phase 2: Database Schema Design

### 4.1 New Tables Required

Add these to `shared/schema.ts`:

```typescript
export const emailCampaigns = pgTable("email_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  templateId: integer("template_id"),
  senderName: text("sender_name"),
  senderEmail: text("sender_email"),
  status: text("status").notNull().default("draft"), // draft, scheduled, sending, sent, paused
  recipientCount: integer("recipient_count").default(0),
  sentCount: integer("sent_count").default(0),
  deliveredCount: integer("delivered_count").default(0),
  openedCount: integer("opened_count").default(0),
  clickedCount: integer("clicked_count").default(0),
  bouncedCount: integer("bounced_count").default(0),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emailRecipients = pgTable("email_recipients", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => emailCampaigns.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  company: text("company"),
  variables: jsonb("variables"), // JSON object for template personalization
  status: text("status").notNull().default("queued"), // queued, sending, delivered, bounced, opened, clicked, unsubscribed
  provider: text("provider"), // sendgrid, brevo, gmail, outlook, etc.
  providerMessageId: text("provider_message_id"),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  bouncedAt: timestamp("bounced_at"),
  bounceReason: text("bounce_reason"),
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  isHtml: boolean("is_html").default(true),
  variables: jsonb("variables"), // Array of variable names like ["firstName", "company", "creditAmount"]
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emailProviderStats = pgTable("email_provider_stats", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  sentCount: integer("sent_count").default(0),
  deliveredCount: integer("delivered_count").default(0),
  bouncedCount: integer("bounced_count").default(0),
  quotaLimit: integer("quota_limit"), // Daily limit for this provider
  quotaUsed: integer("quota_used").default(0),
  suspendedUntil: timestamp("suspended_until"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const emailUnsubscribes = pgTable("email_unsubscribes", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  campaignId: integer("campaign_id").references(() => emailCampaigns.id),
  unsubscribedAt: timestamp("unsubscribed_at").defaultNow().notNull(),
});

export const emailRssFeeds = pgTable("email_rss_feeds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  feedUrl: text("feed_url").notNull(),
  provider: text("provider").notNull(), // feedburner, followit, mailchimp
  subscriberCount: integer("subscriber_count").default(0),
  lastEntryDate: timestamp("last_entry_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### 4.2 Zod Schemas

```typescript
export const insertEmailCampaignSchema = createInsertSchema(emailCampaigns).omit({ id: true, createdAt: true, sentCount: true, deliveredCount: true, openedCount: true, clickedCount: true, bouncedCount: true, startedAt: true, completedAt: true });
export const insertEmailRecipientSchema = createInsertSchema(emailRecipients).omit({ id: true, createdAt: true, sentAt: true, deliveredAt: true, openedAt: true, clickedAt: true, bouncedAt: true, bounceReason: true, retryCount: true, provider: true, providerMessageId: true });
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true, createdAt: true });
export const insertEmailProviderStatSchema = createInsertSchema(emailProviderStats).omit({ id: true, updatedAt: true });

export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type InsertEmailRecipient = z.infer<typeof insertEmailRecipientSchema>;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type EmailRecipient = typeof emailRecipients.$inferSelect;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type EmailProviderStat = typeof emailProviderStats.$inferSelect;
```

### 4.3 Migration Strategy

Run this after updating schema:

```bash
npx drizzle-kit push
```

Or create a migration file:

```bash
npx drizzle-kit generate
```

---

## 5. Phase 3: Backend Implementation

### 5.1 File Structure

Create the following files:

```
server/email/
  ├── email-engine.ts          # Core orchestrator (like hive-engine)
  ├── email-providers.ts       # Provider abstraction layer
  ├── email-queue.ts           # Queue manager with cron
  ├── email-tracking.ts        # Pixel + link tracking
  ├── email-templates.ts       # Template rendering engine
  └── email-rss.ts             # RSS-to-email generator
```

### 5.2 The Provider Abstraction Layer (email-providers.ts)

This is the most critical file. It abstracts every provider into a common interface.

```typescript
export interface EmailProvider {
  name: string;
  dailyLimit: number;
  sendEmail(params: SendEmailParams): Promise<SendResult>;
  checkHealth(): Promise<HealthStatus>;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  trackingId?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  retryable?: boolean;
}
```

**Provider Implementations:**

1. **SendGrid Provider**
```typescript
class SendGridProvider implements EmailProvider {
  name = "sendgrid";
  dailyLimit = 100;
  private client = sgMail;

  constructor() {
    this.client.setApiKey(process.env.SENDGRID_API_KEY!);
  }

  async sendEmail(params: SendEmailParams): Promise<SendResult> {
    try {
      const [result] = await this.client.send({
        to: params.to,
        from: { name: params.fromName || "D.A.T.A. Cloudware", email: params.fromEmail || "noreply@datacloudware.com" },
        subject: params.subject,
        html: params.html,
        text: params.text,
        customArgs: { trackingId: params.trackingId || "" },
      });
      return { success: true, messageId: result.headers?.["x-message-id"] || "" };
    } catch (err: any) {
      return { success: false, error: err.message, retryable: err.code === 429 || err.code >= 500 };
    }
  }

  async checkHealth(): Promise<HealthStatus> {
    return process.env.SENDGRID_API_KEY ? "healthy" : "unconfigured";
  }
}
```

2. **Gmail SMTP Provider**
```typescript
class GmailProvider implements EmailProvider {
  name = "gmail";
  dailyLimit = 500;
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  async sendEmail(params: SendEmailParams): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: `"${params.fromName || "D.A.T.A."}" <${process.env.GMAIL_USER}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      return { success: false, error: err.message, retryable: err.code === "EAUTH" || err.code === "ECONNREFUSED" };
    }
  }

  async checkHealth(): Promise<HealthStatus> {
    return process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD ? "healthy" : "unconfigured";
  }
}
```

**All Providers:**
- SendGrid (100/day)
- Brevo (300/day)
- Mailjet (200/day)
- Gmail (500/day)
- Outlook (300/day)
- Yahoo (500/day)
- Resend (100/day) — optional
- Mailgun (166/day) — optional

**Total Free Capacity:** 1,900–2,166 emails/day

### 5.3 The Email Engine (email-engine.ts)

This is the brain. Modeled after `hive-engine.ts`.

```typescript
export class EmailEngine {
  private providers: EmailProvider[] = [];
  private providerStats: Map<string, EmailProviderStat> = new Map();
  private dailyLimit: number;
  private batchSize: number;
  private batchIntervalMs: number;
  private stopped = false;

  constructor() {
    this.providers = [
      new SendGridProvider(),
      new BrevoProvider(),
      new MailjetProvider(),
      new GmailProvider(),
      new OutlookProvider(),
      new YahooProvider(),
    ].filter(p => p.checkHealth() !== "unconfigured");

    this.dailyLimit = parseInt(process.env.EMAIL_DAILY_LIMIT || "1000");
    this.batchSize = parseInt(process.env.EMAIL_BATCH_SIZE || "50");
    this.batchIntervalMs = parseInt(process.env.EMAIL_BATCH_INTERVAL_MS || "60000");
  }

  async processQueue(): Promise<void> {
    if (this.stopped) return;

    const queued = await storage.getEmailRecipientsByStatus("queued", this.batchSize);
    if (queued.length === 0) return;

    const provider = this.selectProvider();
    if (!provider) {
      console.log("[email-engine] All providers at quota or suspended.");
      return;
    }

    for (const recipient of queued) {
      if (this.stopped) break;

      const campaign = await storage.getEmailCampaign(recipient.campaignId);
      if (!campaign) continue;

      const html = await this.renderEmail(campaign, recipient);
      const trackingId = `trk-${recipient.id}-${Date.now()}`;
      const trackedHtml = this.injectTracking(html, trackingId, recipient.id);

      const result = await provider.sendEmail({
        to: recipient.email,
        subject: campaign.subject,
        html: trackedHtml,
        fromName: campaign.senderName || "D.A.T.A. Cloudware",
        fromEmail: campaign.senderEmail,
        trackingId,
      });

      if (result.success) {
        await storage.updateEmailRecipient(recipient.id, {
          status: "sending",
          provider: provider.name,
          providerMessageId: result.messageId,
          sentAt: new Date(),
        });
        await this.incrementProviderQuota(provider.name);
      } else {
        await this.handleSendFailure(recipient, provider, result);
      }
    }
  }

  private selectProvider(): EmailProvider | null {
    const today = new Date().toISOString().split("T")[0];
    const available = this.providers.filter(p => {
      const stat = this.providerStats.get(`${p.name}-${today}`);
      if (!stat) return true;
      if (stat.suspendedUntil && stat.suspendedUntil > new Date()) return false;
      return (stat.quotaUsed || 0) < p.dailyLimit;
    });

    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
  }

  private async handleSendFailure(recipient: EmailRecipient, provider: EmailProvider, result: SendResult): Promise<void> {
    if (result.retryable && recipient.retryCount < 3) {
      await storage.updateEmailRecipient(recipient.id, {
        retryCount: (recipient.retryCount || 0) + 1,
        status: "queued",
      });
    } else {
      await storage.updateEmailRecipient(recipient.id, {
        status: "bounced",
        bouncedAt: new Date(),
        bounceReason: result.error,
      });
    }

    if (result.error?.includes("429") || result.error?.includes("quota") || result.error?.includes("limit")) {
      const today = new Date().toISOString().split("T")[0];
      const stat = this.providerStats.get(`${provider.name}-${today}`);
      if (stat) {
        stat.suspendedUntil = new Date(Date.now() + 3600000); // 1 hour
        await storage.updateEmailProviderStat(stat);
      }
    }
  }

  private injectTracking(html: string, trackingId: string, recipientId: number): string {
    const pixelUrl = `${process.env.EMAIL_TRACKING_DOMAIN}/api/email/track/open?trk=${trackingId}&rid=${recipientId}`;
    const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" />`;
    return html.replace("</body>", `${pixel}</body>`);
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }
}
```

### 5.4 The Queue Manager (email-queue.ts)

Uses `node-cron` for scheduling. Runs every minute.

```typescript
import cron from "node-cron";

let emailEngine: EmailEngine | null = null;

export function startEmailQueue(): void {
  if (emailEngine) return;

  emailEngine = new EmailEngine();

  cron.schedule("* * * * *", async () => {
    if (emailEngine) {
      await emailEngine.processQueue();
    }
  });

  console.log("[email-queue] Email queue started. Processing every 60 seconds.");
}

export function stopEmailQueue(): void {
  if (emailEngine) {
    emailEngine.stop();
    emailEngine = null;
  }
}
```

Add to `server/index.ts`:

```typescript
import { startEmailQueue } from "./email/email-queue";

// After server starts
startEmailQueue();
```

### 5.5 API Routes

Add to `server/routes.ts`:

```typescript
// Email Campaigns
app.post("/api/email/campaigns", requireAuth, async (req, res) => {
  const validated = insertEmailCampaignSchema.parse(req.body);
  const campaign = await storage.createEmailCampaign(validated);
  res.json(campaign);
});

app.get("/api/email/campaigns", requireAuth, async (_req, res) => {
  const campaigns = await storage.getEmailCampaigns();
  res.json(campaigns);
});

app.get("/api/email/campaigns/:id", requireAuth, async (req, res) => {
  const campaign = await storage.getEmailCampaign(parseInt(req.params.id));
  if (!campaign) return res.status(404).json({ error: "Not found" });
  res.json(campaign);
});

app.post("/api/email/campaigns/:id/send", requireAuth, async (req, res) => {
  const campaignId = parseInt(req.params.id);
  await storage.updateEmailCampaign(campaignId, { status: "sending", startedAt: new Date() });
  // Recipients are queued by the cron job
  res.json({ message: "Campaign queued for sending" });
});

// Email Recipients
app.post("/api/email/campaigns/:id/recipients", requireAuth, async (req, res) => {
  const campaignId = parseInt(req.params.id);
  const recipients = req.body.recipients as InsertEmailRecipient[];
  const created = await storage.createEmailRecipients(campaignId, recipients);
  await storage.updateEmailCampaign(campaignId, {
    recipientCount: created.length,
    status: "scheduled",
  });
  res.json(created);
});

app.get("/api/email/campaigns/:id/recipients", requireAuth, async (req, res) => {
  const recipients = await storage.getEmailRecipientsByCampaign(parseInt(req.params.id));
  res.json(recipients);
});

// Email Templates
app.post("/api/email/templates", requireAuth, async (req, res) => {
  const validated = insertEmailTemplateSchema.parse(req.body);
  const template = await storage.createEmailTemplate(validated);
  res.json(template);
});

app.get("/api/email/templates", requireAuth, async (_req, res) => {
  const templates = await storage.getEmailTemplates();
  res.json(templates);
});

// Tracking
app.get("/api/email/track/open", async (req, res) => {
  const { trk, rid } = req.query;
  if (rid) {
    await storage.updateEmailRecipient(parseInt(rid as string), {
      status: "opened",
      openedAt: new Date(),
    });
  }
  res.setHeader("Content-Type", "image/gif");
  res.send(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
});

app.get("/api/email/track/click", async (req, res) => {
  const { trk, rid, url } = req.query;
  if (rid) {
    await storage.updateEmailRecipient(parseInt(rid as string), {
      status: "clicked",
      clickedAt: new Date(),
    });
  }
  res.redirect(url as string);
});

// Unsubscribe
app.get("/api/email/unsubscribe", async (req, res) => {
  const { email } = req.query;
  if (email) {
    await storage.createEmailUnsubscribe({ email: email as string });
  }
  res.send("You have been unsubscribed.");
});

// Provider Stats
app.get("/api/email/provider-stats", requireAuth, async (_req, res) => {
  const stats = await storage.getEmailProviderStats();
  res.json(stats);
});

// RSS Feed Generation
app.get("/api/email/rss/:feedId", async (req, res) => {
  const feed = await storage.getEmailRssFeed(parseInt(req.params.feedId));
  if (!feed) return res.status(404).json({ error: "Feed not found" });

  const entries = await storage.getEmailRssEntries(feed.id);
  const rss = generateRssXml(feed, entries);
  res.setHeader("Content-Type", "application/rss+xml");
  res.send(rss);
});
```

### 5.6 Storage Interface Updates

Add to `server/storage.ts`:

```typescript
// Email Campaigns
async createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign>;
async getEmailCampaigns(): Promise<EmailCampaign[]>;
async getEmailCampaign(id: number): Promise<EmailCampaign | null>;
async updateEmailCampaign(id: number, updates: Partial<EmailCampaign>): Promise<EmailCampaign>;

// Email Recipients
async createEmailRecipients(campaignId: number, recipients: InsertEmailRecipient[]): Promise<EmailRecipient[]>;
async getEmailRecipientsByCampaign(campaignId: number): Promise<EmailRecipient[]>;
async getEmailRecipientsByStatus(status: string, limit: number): Promise<EmailRecipient[]>;
async updateEmailRecipient(id: number, updates: Partial<EmailRecipient>): Promise<EmailRecipient>;

// Email Templates
async createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
async getEmailTemplates(): Promise<EmailTemplate[]>;

// Email Provider Stats
async getEmailProviderStats(): Promise<EmailProviderStat[]>;
async updateEmailProviderStat(stat: EmailProviderStat): Promise<EmailProviderStat>;

// Email Unsubscribes
async createEmailUnsubscribe(unsub: { email: string; campaignId?: number }): Promise<void>;
async isEmailUnsubscribed(email: string): Promise<boolean>;

// RSS Feeds
async getEmailRssFeed(id: number): Promise<any>;
async getEmailRssEntries(feedId: number): Promise<any[]>;
```

---

## 6. Phase 4: Frontend Implementation

### 6.1 New Page: Email Dashboard

Create `client/src/pages/email.tsx`:

```typescript
export default function EmailPage() {
  const { data: campaigns } = useQuery<EmailCampaign[]>({ queryKey: ["/api/email/campaigns"] });
  const { data: templates } = useQuery<EmailTemplate[]>({ queryKey: ["/api/email/templates"] });
  const { data: providerStats } = useQuery({ queryKey: ["/api/email/provider-stats"] });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Email Outreach</h1>

        {/* Provider Health Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {providerStats?.map((stat) => (
            <ProviderCard key={stat.provider} name={stat.provider} used={stat.quotaUsed} limit={stat.quotaLimit} />
          ))}
        </div>

        {/* Campaign List */}
        <CampaignTable campaigns={campaigns || []} />

        {/* Template Manager */}
        <TemplateManager templates={templates || []} />
      </div>
    </div>
  );
}
```

### 6.2 Components

- **CampaignTable**: Lists campaigns with status, counts, actions
- **CampaignComposer**: Modal for creating campaigns with recipient upload (CSV)
- **TemplateEditor**: Simple text editor with variable autocomplete
- **ProviderCard**: Shows quota usage, health status, suspension state
- **AnalyticsChart**: Bar chart of opens, clicks, bounces per campaign

### 6.3 Routing

Add to `client/src/App.tsx`:

```typescript
import EmailPage from "@/pages/email";

// In routes
<Route path="/email" component={EmailPage} />
```

Add to navigation sidebar:

```typescript
{ icon: <Mail className="w-4 h-4" />, label: "Email", path: "/email" }
```

### 6.4 CSV Upload for Recipients

```typescript
function RecipientUploader({ campaignId }: { campaignId: number }) {
  const [csvData, setCsvData] = useState<any[]>([]);

  const handleFileUpload = (file: File) => {
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        setCsvData(results.data);
      },
    });
  };

  const uploadMutation = useMutation({
    mutationFn: async (recipients: any[]) => {
      return apiRequest("POST", `/api/email/campaigns/${campaignId}/recipients`, { recipients });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/email/campaigns/${campaignId}/recipients`] });
      toast({ title: "Recipients uploaded", description: `${csvData.length} recipients queued` });
    },
  });

  return (
    <div>
      <input type="file" accept=".csv" onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])} />
      <Button onClick={() => uploadMutation.mutate(csvData)}>Upload {csvData.length} Recipients</Button>
    </div>
  );
}
```

---

## 7. Phase 5: Email Provider Integration

### 7.1 SendGrid Setup

1. Go to https://signup.sendgrid.com/
2. Create a free account (100 emails/day)
3. Verify your sender email (single sender verification)
4. Create an API key: Settings → API Keys → Create API Key → Full Access
5. Copy the key (starts with `SG.`)

### 7.2 Brevo Setup

1. Go to https://www.brevo.com/
2. Sign up for free plan (300 emails/day)
3. Verify your domain (or use single sender)
4. Get API key: SMTP & API → API Keys → Create API Key
5. Copy the key (starts with `xkeysib-`)

### 7.3 Mailjet Setup

1. Go to https://www.mailjet.com/
2. Create free account (200 emails/day)
3. Verify sender email
4. Get API key: Account Settings → API Key Management
5. You'll get an API Key and Secret Key

### 7.4 Gmail Setup

1. Create a Gmail account (or use existing)
2. Enable 2-Factor Authentication
3. Generate App Password: Google Account → Security → 2-Step Verification → App passwords
4. Select "Mail" and "Other" → Name it "D.A.T.A."
5. Copy the 16-character password

### 7.5 Outlook Setup

1. Create Outlook.com account
2. Enable 2-Factor Authentication
3. Generate App Password: Account Settings → Security → App Passwords
4. Copy the password

### 7.6 Yahoo Setup

1. Create Yahoo account
2. Enable 2-Factor Authentication
3. Generate App Password: Account Info → Account Security → Generate App Password
4. Copy the password

### 7.7 Resend Setup (Optional)

1. Go to https://resend.com/
2. Sign up (100 emails/day free)
3. Verify domain
4. Create API key
5. Copy key (starts with `re_`)

### 7.8 FeedBurner Setup (RSS)

1. Go to https://feedburner.google.com/
2. Sign in with Google
3. Burn a feed: Enter your feed URL (e.g., `https://yourapp.com/api/email/rss/1`)
4. Enable "Email Subscriptions" in Publicize tab
5. Get your feed URL

### 7.9 Follow.it Setup (RSS)

1. Go to https://follow.it/
2. Create free account
3. Submit your RSS feed URL
4. Configure email settings
5. Get subscriber widget or direct subscribe URL

---

## 8. Phase 6: Testing & Validation

### 8.1 Unit Tests

Test each provider:

```typescript
describe("Email Providers", () => {
  test("SendGrid sends email", async () => {
    const provider = new SendGridProvider();
    const result = await provider.sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });
    expect(result.success).toBe(true);
  });
});
```

### 8.2 Integration Tests

1. Create a campaign with 10 test recipients (use your own emails)
2. Trigger the queue
3. Verify all 10 receive emails
4. Check tracking pixels fire
5. Click a link, verify click tracking

### 8.3 Load Test

```bash
# Create 100 test recipients
for i in {1..100}; do
  echo "test${i}@mailinator.com,Test,User${i},Company${i}" >> test-recipients.csv
done

# Upload via UI
# Verify queue processes all 100 within 2 minutes
```

### 8.4 Daily Limit Test

1. Set a provider limit to 5
2. Send 10 emails
3. Verify the first 5 use that provider
4. Verify emails 6-10 rotate to other providers
5. Verify the provider is suspended after hitting limit

---

## 9. Phase 7: Deployment & Monitoring

### 9.1 Replit Environment Variables

Set in Replit Secrets panel:

```
SENDGRID_API_KEY
BREVO_API_KEY
MAILJET_API_KEY
MAILJET_SECRET_KEY
GMAIL_USER
GMAIL_APP_PASSWORD
OUTLOOK_USER
OUTLOOK_PASSWORD
YAHOO_USER
YAHOO_APP_PASSWORD
EMAIL_DAILY_LIMIT
EMAIL_BATCH_SIZE
EMAIL_TRACKING_DOMAIN
```

### 9.2 Monitoring

Add to the dashboard:
- Emails sent today (counter)
- Provider quota usage (gauge)
- Queue depth (gauge)
- Bounce rate (percentage)
- Open rate (percentage)
- Click rate (percentage)

### 9.3 Alerts

Log warnings when:
- Any provider quota is at 90%+
- Queue depth exceeds 1,000
- Bounce rate exceeds 5%
- All providers are suspended

---

## 10. API Key Questionnaire

Before you begin, answer these questions and gather these keys:

### 10.1 SendGrid
- [ ] Do you have a SendGrid account? (If no, create one at sendgrid.com)
- [ ] Have you verified a single sender email?
- [ ] **API Key (starts with SG.):** `________________________________`

### 10.2 Brevo
- [ ] Do you have a Brevo account? (If no, create one at brevo.com)
- [ ] Have you verified a sender domain or email?
- [ ] **API Key (starts with xkeysib-):** `________________________________`

### 10.3 Mailjet
- [ ] Do you have a Mailjet account? (If no, create one at mailjet.com)
- [ ] Have you verified a sender email?
- [ ] **API Key:** `________________________________`
- [ ] **Secret Key:** `________________________________`

### 10.4 Gmail
- [ ] Do you have a Gmail account for sending? (If no, create one)
- [ ] Have you enabled 2-Factor Authentication?
- [ ] **Gmail Address:** `________________________________`
- [ ] **App Password (16 chars):** `________________________________`

### 10.5 Outlook
- [ ] Do you have an Outlook.com account for sending? (If no, create one)
- [ ] Have you enabled 2-Factor Authentication?
- [ ] **Outlook Address:** `________________________________`
- [ ] **App Password:** `________________________________`

### 10.6 Yahoo
- [ ] Do you have a Yahoo Mail account for sending? (If no, create one)
- [ ] Have you enabled 2-Factor Authentication?
- [ ] **Yahoo Address:** `________________________________`
- [ ] **App Password:** `________________________________`

### 10.7 Resend (Optional)
- [ ] Do you have a Resend account? (If no, create one at resend.com)
- [ ] Have you verified a domain?
- [ ] **API Key (starts with re_):** `________________________________`

### 10.8 Application Settings
- [ ] **Daily Email Limit:** `________` (default: 1000)
- [ ] **Batch Size:** `________` (default: 50)
- [ ] **Batch Interval (seconds):** `________` (default: 60)
- [ ] **Tracking Domain:** `________________________________` (e.g., https://yourapp.com)
- [ ] **Default Sender Name:** `________________________________` (e.g., D.A.T.A. Cloudware)
- [ ] **Default Sender Email:** `________________________________` (e.g., noreply@yourapp.com)

### 10.9 RSS Configuration
- [ ] Do you want RSS-to-email? (Yes/No)
- [ ] **RSS Provider:** FeedBurner / Follow.it / Both
- [ ] **Feed Name:** `________________________________`

---

## 11. Code Deep Dive

### 11.1 How the Engine Works

The EmailEngine is a state machine. Every minute, the cron job calls `processQueue()`. The engine:

1. Fetches up to `batchSize` queued recipients
2. Checks if the recipient is unsubscribed → skip
3. Checks if the recipient previously bounced → skip
4. Selects a provider using `selectProvider()`:
   - Filters providers by health (not suspended, not unconfigured)
   - Filters by quota (used < limit)
   - Randomly selects from available
5. Renders the email using the template + recipient variables
6. Injects tracking pixel
7. Sends via provider
8. Updates recipient status based on result
9. Increments provider quota
10. Handles failures (retry or bounce)

### 11.2 How the Provider Selection Works

The `selectProvider()` method is a weighted random selector. It:
- Builds a list of healthy providers
- Excludes suspended providers
- Excludes quota-exhausted providers
- Randomly picks from the remainder
- This naturally load-balances across all providers

### 11.3 How Tracking Works

**Open Tracking:**
- A 1x1 transparent GIF is injected before `</body>`
- The image URL is: `/api/email/track/open?trk=TRACKING_ID&rid=RECIPIENT_ID`
- When the email client loads the image, the server logs the open
- Returns a 1-pixel GIF

**Click Tracking:**
- All links are rewritten to: `/api/email/track/click?trk=ID&rid=ID&url=ORIGINAL_URL`
- Server logs the click, updates recipient status
- Redirects to the original URL

### 11.4 How the RSS Generator Works

The RSS endpoint generates a valid RSS 2.0 feed. Each email campaign is an `<item>` in the feed. The RSS-to-email provider polls this feed periodically and sends new items to subscribers.

### 11.5 How the Queue Handles Failures

- **Retryable errors** (429, 5xx, connection errors): Recipient status returns to `queued`, retry count increments. After 3 retries, marked as `bounced`.
- **Non-retryable errors** (invalid email, 400): Immediately marked as `bounced`.
- **Quota errors**: Provider suspended for 1 hour.

### 11.6 How Templates Work

Templates use simple variable substitution:

```html
<p>Hi {{firstName}},</p>
<p>We found {{creditAmount}} in unclaimed credits for {{company}}.</p>
```

Variables are replaced at send time using the `recipient.variables` JSONB field.

---

## 12. Risk Mitigation & Fallbacks

### 12.1 All Providers Suspended

If all providers are suspended or at quota:
- The queue pauses
- An alert is logged
- Recipients remain in `queued` status
- The system resumes when a provider becomes available

### 12.2 High Bounce Rate

If bounce rate exceeds 5%:
- The campaign is automatically paused
- An alert is sent
- Manual review required

### 12.3 Provider Shutdown

If a provider shuts down or changes their API:
- The provider's `checkHealth()` returns `unconfigured`
- The provider is automatically excluded from rotation
- The remaining providers handle the load

### 12.4 Database Failure

If the database is unavailable:
- The queue stops processing
- Recipients are not lost (they remain in the database)
- The system resumes when the database returns

### 12.5 IP Reputation

For Gmail/Outlook/Yahoo:
- Use App Passwords (not your main password)
- Send from dedicated accounts
- Monitor sender reputation
- If an account gets flagged, rotate to a new account

---

## 13. Next Steps Checklist

### Immediate (Today)
- [ ] Fill out the API Key Questionnaire (Section 10)
- [ ] Create accounts for all 6 providers
- [ ] Generate all API keys and app passwords
- [ ] Add all keys to Replit Secrets

### Phase 1 (Day 1–2)
- [ ] Install npm packages (nodemailer, @sendgrid/mail, etc.)
- [ ] Update `shared/schema.ts` with new tables
- [ ] Run `npx drizzle-kit push` to create tables

### Phase 2 (Day 3–5)
- [ ] Create `server/email/email-providers.ts` with all 6 providers
- [ ] Create `server/email/email-engine.ts` with queue logic
- [ ] Create `server/email/email-queue.ts` with cron scheduling
- [ ] Add API routes to `server/routes.ts`
- [ ] Update `server/storage.ts` with email methods

### Phase 3 (Day 6–8)
- [ ] Create `client/src/pages/email.tsx`
- [ ] Create campaign table, composer, and template editor
- [ ] Add CSV upload for recipients
- [ ] Add route and navigation

### Phase 4 (Day 9–10)
- [ ] Test each provider individually
- [ ] Test queue with 10 test emails
- [ ] Test tracking pixel and click tracking
- [ ] Test unsubscribe flow
- [ ] Test provider rotation and quota handling

### Phase 5 (Day 11–12)
- [ ] Add monitoring dashboard
- [ ] Add alerts for quota and bounce rates
- [ ] Load test with 100 emails
- [ ] Document the system

### Phase 6 (Day 13+)
- [ ] Launch first real campaign
- [ ] Monitor open rates and click rates
- [ ] Optimize subject lines and templates
- [ ] Scale to 1,000/day

---

## Appendix A: Quick Reference

### Provider Limits
| Provider | Daily Limit | Free Tier | Setup Time |
|----------|-------------|-----------|------------|
| Gmail | 500 | Yes | 10 min |
| Outlook | 300 | Yes | 10 min |
| Yahoo | 500 | Yes | 10 min |
| SendGrid | 100 | Yes | 15 min |
| Brevo | 300 | Yes | 15 min |
| Mailjet | 200 | Yes | 15 min |
| Resend | 100 | Yes | 10 min |
| **Total** | **2,000** | | **~90 min** |

### File Checklist
| File | Purpose | Status |
|------|---------|--------|
| `shared/schema.ts` | Database tables | ⬜ |
| `server/email/email-providers.ts` | Provider abstraction | ⬜ |
| `server/email/email-engine.ts` | Core engine | ⬜ |
| `server/email/email-queue.ts` | Cron scheduler | ⬜ |
| `server/email/email-tracking.ts` | Pixel/link tracking | ⬜ |
| `server/email/email-templates.ts` | Template renderer | ⬜ |
| `server/email/email-rss.ts` | RSS generator | ⬜ |
| `server/routes.ts` | API endpoints | ⬜ |
| `server/storage.ts` | Storage methods | ⬜ |
| `client/src/pages/email.tsx` | Dashboard page | ⬜ |
| `client/src/App.tsx` | Route registration | ⬜ |

---

*This document is a living blueprint. As you build, update it with your actual API keys, test results, and modifications. The goal is 1,000 emails per day for free, and this plan gives you every step to get there.*
