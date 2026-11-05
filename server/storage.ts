import { db } from "./db";
import { eq, desc, asc, and, sql, count } from "drizzle-orm";
import {
  users, type User, type InsertUser,
  scrapeJobs, type ScrapeJob, type InsertScrapeJob,
  scrapedResults, type ScrapedResult, type InsertScrapedResult,
  discoveredPaths, type DiscoveredPath, type InsertDiscoveredPath,
  domainIntel, type DomainIntel, type InsertDomainIntel,
  scanConfigs, type ScanConfig, type InsertScanConfig,
  discoveryGraphs, type DiscoveryGraph, type InsertDiscoveryGraph,
  fiscalIntel, type FiscalIntel, type InsertFiscalIntel,
  fiscalLeads, type FiscalLead, type InsertFiscalLead,
  portfolioAllocations, type PortfolioAllocation, type InsertPortfolioAllocation,
  hiveDirectories, type HiveDirectory, type InsertHiveDirectory,
  hiveCategories, type HiveCategory, type InsertHiveCategory,
  hiveLocations, type HiveLocation, type InsertHiveLocation,
  hiveCrawlJobs, type HiveCrawlJob, type InsertHiveCrawlJob,
  hiveFlowers, type HiveFlower, type InsertHiveFlower,
  hivePollen, type HivePollen, type InsertHivePollen,
  hiveCompletedCombos, type HiveCompletedCombo,
  carpenterAntJobs, type CarpenterAntJob, type InsertCarpenterAntJob,
  carpenterAntResults, type CarpenterAntResult, type InsertCarpenterAntResult,
  emailTemplates, type EmailTemplate, type InsertEmailTemplate,
  emailCampaigns, type EmailCampaign, type InsertEmailCampaign,
  emailRecipients, type EmailRecipient, type InsertEmailRecipient,
  emailProviderConfigs, type EmailProviderConfig, type InsertEmailProviderConfig,
  compassSources, type CompassSource, type InsertCompassSource,
  compassQueryJobs, type CompassQueryJob, type InsertCompassQueryJob,
  compassDiscoveries, type CompassDiscovery, type InsertCompassDiscovery,
  compassProfiles, type CompassProfile, type InsertCompassProfile,
  compassEventTypes, type CompassEventType, type InsertCompassEventType,
  compassIndustries, type CompassIndustry, type InsertCompassIndustry,
  stage32Profiles, type Stage32Profile, type InsertStage32Profile,
  stage32Jobs, type Stage32Job, type InsertStage32Job,
  supremeJobs, type SupremeJob, type InsertSupremeJob,
  supremeCompanies, type SupremeCompany, type InsertSupremeCompany,
  geofences, type Geofence, type InsertGeofence,
  capturedDevices, type CapturedDevice, type InsertCapturedDevice,
  audienceSegments, type AudienceSegment, type InsertAudienceSegment,
  campaigns, type Campaign, type InsertCampaign,
  creatives, type Creative, type InsertCreative,
  campaignGeofences, type CampaignGeofence,
} from "@shared/schema";
import { ilike, or, count, inArray } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  createJob(job: InsertScrapeJob): Promise<ScrapeJob>;
  getJob(id: string): Promise<ScrapeJob | undefined>;
  getJobs(status?: string): Promise<ScrapeJob[]>;
  updateJob(id: string, updates: Partial<ScrapeJob>): Promise<ScrapeJob | undefined>;
  deleteJob(id: string): Promise<void>;

  createResult(result: InsertScrapedResult): Promise<ScrapedResult>;
  createResultsBatch(results: InsertScrapedResult[]): Promise<void>;
  getResults(filters?: { jobId?: string; domain?: string; extractorType?: string; category?: string }, limit?: number, offset?: number): Promise<ScrapedResult[]>;
  getResultsCount(filters?: { jobId?: string; domain?: string; extractorType?: string; category?: string }): Promise<number>;
  getResultCount(jobId: string): Promise<number>;
  deleteResultsByJob(jobId: string): Promise<void>;

  createPath(path: InsertDiscoveredPath): Promise<DiscoveredPath>;
  createPathsBatch(paths: InsertDiscoveredPath[]): Promise<void>;
  getPaths(filters?: { jobId?: string; domain?: string; statusCode?: number }, limit?: number, offset?: number): Promise<DiscoveredPath[]>;
  getPathsCount(filters?: { jobId?: string; domain?: string; statusCode?: number }): Promise<number>;
  getPathCount(jobId: string): Promise<number>;
  deletePathsByJob(jobId: string): Promise<void>;

  getDomainIntel(domain: string): Promise<DomainIntel | undefined>;
  upsertDomainIntel(intel: InsertDomainIntel): Promise<DomainIntel>;

  createConfig(config: InsertScanConfig): Promise<ScanConfig>;
  getConfigs(): Promise<ScanConfig[]>;
  deleteConfig(id: string): Promise<void>;

  saveGraph(graph: InsertDiscoveryGraph): Promise<DiscoveryGraph>;
  getGraphByJob(jobId: string): Promise<DiscoveryGraph | undefined>;
  getGraphByDomain(domain: string): Promise<DiscoveryGraph | undefined>;
  getGraphs(): Promise<DiscoveryGraph[]>;
  deleteGraphByJob(jobId: string): Promise<void>;

  createFiscalIntel(item: InsertFiscalIntel): Promise<FiscalIntel>;
  createFiscalIntelBatch(items: InsertFiscalIntel[]): Promise<void>;
  getFiscalIntel(company: string, filters?: { source?: string; category?: string }): Promise<FiscalIntel[]>;
  getFiscalIntelByDomain(domain: string): Promise<FiscalIntel[]>;
  getFiscalIntelCached(company: string, source: string): Promise<FiscalIntel | undefined>;
  deleteFiscalIntel(company: string, source?: string): Promise<void>;

  createFiscalLead(lead: InsertFiscalLead): Promise<FiscalLead>;
  getFiscalLead(id: string): Promise<FiscalLead | undefined>;
  getFiscalLeadByCompany(company: string): Promise<FiscalLead | undefined>;
  getFiscalLeads(filters?: { opportunityLevel?: string; pipelineStage?: string }, limit?: number, offset?: number): Promise<FiscalLead[]>;
  getFiscalLeadsCount(filters?: { opportunityLevel?: string; pipelineStage?: string }): Promise<number>;
  updateFiscalLead(id: string, updates: Partial<FiscalLead>): Promise<FiscalLead | undefined>;
  deleteFiscalLead(id: string): Promise<void>;

  allocateToPortfolio(allocation: InsertPortfolioAllocation): Promise<PortfolioAllocation>;
  allocateToPortfolioBatch(allocations: InsertPortfolioAllocation[]): Promise<void>;
  getPortfolioAllocations(): Promise<PortfolioAllocation[]>;
  getPortfolioAllocation(leadId: string): Promise<PortfolioAllocation | undefined>;
  removeFromPortfolio(leadId: string): Promise<void>;
  clearPortfolio(): Promise<void>;

  getHiveDirectories(): Promise<HiveDirectory[]>;
  getHiveCategories(): Promise<HiveCategory[]>;
  getHiveLocations(): Promise<HiveLocation[]>;
  createHiveCrawlJob(job: InsertHiveCrawlJob): Promise<HiveCrawlJob>;
  updateHiveCrawlJob(id: string, updates: Partial<HiveCrawlJob>): Promise<HiveCrawlJob | undefined>;
  getHiveCrawlJobs(): Promise<HiveCrawlJob[]>;
  getHiveCrawlJob(id: string): Promise<HiveCrawlJob | undefined>;
  getHiveCrawlJobMeta(id: string): Promise<Omit<HiveCrawlJob, 'log'> | undefined>;
  getHiveCrawlJobLogTail(id: string, limit: number): Promise<string[]>;
  getHiveCrawlJobShouldStop(id: string): Promise<boolean>;
  interruptAllRunningCrawlJobs(): Promise<number>;
  appendCrawlLog(jobId: string, message: string): Promise<void>;
  appendCrawlLogBatch(jobId: string, messages: string[]): Promise<void>;
  bulkInsertFlowers(flowers: InsertHiveFlower[]): Promise<number>;
  bulkInsertPollen(pollen: InsertHivePollen[]): Promise<number>;
  getHiveFlowers(filters: { directory?: string; category?: string; categories?: string; city?: string; state?: string; search?: string; isAlive?: boolean; phoneValid?: string; sortBy?: string; beauteousOnly?: boolean; tag?: string; crawlJobId?: string; page?: number; limit?: number }): Promise<{ flowers: HiveFlower[]; total: number }>;
  getHivePollen(filters: { search?: string; category?: string; categories?: string; state?: string; directory?: string; crawlJobId?: string; phoneValid?: string; sortBy?: string; page?: number; limit?: number }): Promise<{ pollen: HivePollen[]; total: number }>;
  deleteFlower(id: string): Promise<void>;
  updateFlowerHealth(id: string, isAlive: boolean): Promise<void>;
  updateFlowerBeauty(id: string, beautyScore: number, beautyFlags: string): Promise<void>;
  getFlowersForBeautyScan(rescan: boolean): Promise<{ id: string; website: string }[]>;
  getFlowersForPhoneScan(rescan: boolean): Promise<{ id: string; phone: string | null; state: string | null; name: string; category: string }[]>;
  updateFlowerPhoneAuth(id: string, phoneValid: boolean): Promise<void>;
  getPollenForPhoneScan(rescan: boolean): Promise<{ id: string; phone: string | null; state: string | null; name: string; category: string }[]>;
  updatePollenPhoneAuth(id: string, phoneValid: boolean): Promise<void>;
  getHiveStats(): Promise<{ totalFlowers: number; totalPollen: number; byDirectory: Record<string, number>; byCategory: Record<string, number> }>;
  getHiveCoverage(): Promise<{ category: string; city: string; state: string; count: number }[]>;
  getHiveDirectoryCount(): Promise<number>;
  getHiveCategoryCount(): Promise<number>;
  getHiveLocationCount(): Promise<number>;
  markComboCompleted(directoryId: string, categoryId: string, locationId: string, flowersFound: number, pollenFound: number): Promise<void>;
  isComboCompleted(directoryId: string, categoryId: string, locationId: string): Promise<boolean>;
  getCompletedCombosCount(): Promise<number>;
  clearCompletedCombos(): Promise<void>;
  deleteHaulData(): Promise<{ flowers: number; pollen: number; combos: number }>;
  createCarpenterJob(data: InsertCarpenterAntJob): Promise<CarpenterAntJob>;
  getCarpenterJob(id: string): Promise<CarpenterAntJob | undefined>;
  updateCarpenterJob(id: string, data: Partial<CarpenterAntJob>): Promise<void>;
  getCarpenterJobs(): Promise<CarpenterAntJob[]>;
  deleteCarpenterJob(id: string): Promise<void>;
  createCarpenterResult(data: InsertCarpenterAntResult): Promise<CarpenterAntResult>;
  bulkCreateCarpenterResults(data: InsertCarpenterAntResult[]): Promise<CarpenterAntResult[]>;
  updateCarpenterResult(id: string, data: Partial<CarpenterAntResult>): Promise<void>;
  getCarpenterResults(jobId: string): Promise<CarpenterAntResult[]>;
  getCarpenterResult(id: string): Promise<CarpenterAntResult | undefined>;

  // Email Outreach
  createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
  getEmailTemplates(): Promise<EmailTemplate[]>;
  getEmailTemplate(id: number): Promise<EmailTemplate | undefined>;
  deleteEmailTemplate(id: number): Promise<void>;

  createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign>;
  getEmailCampaigns(): Promise<EmailCampaign[]>;
  getEmailCampaign(id: number): Promise<EmailCampaign | undefined>;
  updateEmailCampaign(id: number, updates: Partial<EmailCampaign>): Promise<EmailCampaign | undefined>;
  deleteEmailCampaign(id: number): Promise<void>;

  createEmailRecipients(recipients: InsertEmailRecipient[]): Promise<EmailRecipient[]>;
  getEmailRecipientsByCampaign(campaignId: number): Promise<EmailRecipient[]>;
  getEmailRecipientsByStatus(status: string, limit: number): Promise<EmailRecipient[]>;
  updateEmailRecipient(id: number, updates: Partial<EmailRecipient>): Promise<EmailRecipient | undefined>;
  getEmailRecipientStats(campaignId: number): Promise<{ status: string; count: number }[]>;

  createEmailProviderConfig(config: InsertEmailProviderConfig): Promise<EmailProviderConfig>;
  getEmailProviderConfigs(): Promise<EmailProviderConfig[]>;
  updateEmailProviderConfig(id: number, updates: Partial<EmailProviderConfig>): Promise<EmailProviderConfig | undefined>;
  deleteEmailProviderConfig(id: number): Promise<void>;

  // Compass — Cal.com Intelligence
  getCompassSources(platform?: string): Promise<CompassSource[]>;
  getCompassIndustries(): Promise<CompassIndustry[]>;
  createCompassQueryJob(job: InsertCompassQueryJob): Promise<CompassQueryJob>;
  updateCompassQueryJob(id: string, updates: Partial<CompassQueryJob>): Promise<CompassQueryJob | undefined>;
  getCompassQueryJobs(platform?: string): Promise<CompassQueryJob[]>;
  getCompassQueryJob(id: string): Promise<CompassQueryJob | undefined>;
  getCompassQueryJobShouldStop(id: string): Promise<boolean>;
  interruptAllRunningCompassJobs(): Promise<number>;
  appendCompassLog(jobId: string, message: string): Promise<void>;
  appendCompassLogBatch(jobId: string, messages: string[]): Promise<void>;
  bulkInsertDiscoveries(discoveries: InsertCompassDiscovery[]): Promise<number>;
  getPendingDiscoveries(limit: number, jobId?: string, platform?: string): Promise<CompassDiscovery[]>;
  getCompassDiscoveries(filters: { search?: string; searchMode?: string; source?: string; status?: string; sortBy?: string; page?: number; limit?: number; platform?: string }): Promise<{ discoveries: CompassDiscovery[]; total: number }>;
  markDiscoveryEnriched(id: string): Promise<void>;
  markDiscoveryFailed(id: string): Promise<void>;
  isDiscoveryUrlExists(url: string): Promise<boolean>;
  createCompassProfile(profile: InsertCompassProfile): Promise<CompassProfile>;
  bulkInsertEventTypes(eventTypes: InsertCompassEventType[]): Promise<void>;
  getCompassProfiles(filters: { search?: string; searchMode?: string; industry?: string; bundle?: string; scope?: string; minQuality?: number; source?: string; isTeam?: boolean; sortBy?: string; page?: number; limit?: number; platform?: string }): Promise<{ profiles: CompassProfile[]; total: number }>;
  getCompassProfile(id: string): Promise<CompassProfile | undefined>;
  getCompassEventTypes(profileId: string): Promise<CompassEventType[]>;
  updateCompassProfile(id: string, updates: Partial<CompassProfile>): Promise<CompassProfile | undefined>;
  replaceCompassEventTypes(profileId: string, eventTypes: InsertCompassEventType[]): Promise<void>;
  getCompassStats(platform?: string): Promise<{ totalProfiles: number; totalDiscoveries: number; bySource: Record<string, number>; byIndustry: Record<string, number> }>;
  updateProfileHealth(id: string, isAlive: boolean): Promise<void>;

  // Stage 32
  createStage32Profile(profile: InsertStage32Profile): Promise<Stage32Profile>;
  getStage32ProfileByStage32Id(stage32Id: number): Promise<Stage32Profile | undefined>;
  getStage32Profiles(filters: { search?: string; location?: string; hasContact?: boolean; isServiceProvider?: boolean; page?: number; limit?: number }): Promise<{ profiles: Stage32Profile[]; total: number }>;
  getStage32Profile(id: string): Promise<Stage32Profile | undefined>;
  updateStage32ProfileWebsiteContact(stage32Id: number, phone: string | null, email: string | null, calendlyUrl: string | null): Promise<void>;
  updateStage32ProfileWebsiteContactByUrl(stage32Url: string, phone: string | null, email: string | null, calendlyUrl: string | null): Promise<void>;
  getStage32Stats(): Promise<{ total: number; scraped: number; withContact: number; withWebsite: number; serviceProviders: number }>;
  createStage32Job(job: InsertStage32Job): Promise<Stage32Job>;
  getStage32Job(id: string): Promise<Stage32Job | undefined>;
  getStage32Jobs(): Promise<Stage32Job[]>;
  updateStage32Job(id: string, updates: Partial<Stage32Job>): Promise<Stage32Job | undefined>;

  // Parallel Supreme
  createSupremeJob(job: InsertSupremeJob): Promise<SupremeJob>;
  updateSupremeJob(id: string, updates: Partial<SupremeJob>): Promise<SupremeJob | undefined>;
  getSupremeJobs(): Promise<SupremeJob[]>;
  getSupremeJob(id: string): Promise<SupremeJob | undefined>;
  getSupremeJobLogTail(id: string, limit: number): Promise<string[]>;
  getSupremeJobShouldStop(id: string): Promise<boolean>;
  interruptSupremeJobs(): Promise<number>;
  appendSupremeLogBatch(jobId: string, messages: string[]): Promise<void>;
  bulkInsertSupremeCompanies(companies: InsertSupremeCompany[]): Promise<number>;
  updateSupremeCompany(id: string, updates: Partial<SupremeCompany>): Promise<void>;
  bulkUpdateSupremeCompanies(updates: { id: string; data: Partial<SupremeCompany> }[]): Promise<void>;
  getSupremeCompanies(filters: { jobId?: string; line?: string; status?: string; search?: string; hasCoords?: boolean; page?: number; limit?: number }): Promise<{ companies: SupremeCompany[]; total: number }>;
  getSupremeCompaniesForExport(jobId?: string, onlyGeocoded?: boolean): Promise<SupremeCompany[]>;
  getSupremeSourceStats(jobId?: string): Promise<Array<{ source: string; total: number; withWebsite: number; withAddress: number; withPhone: number; withCoords: number }>>;

  // ── Geofencing Platform ──────────────────────────────────────────────
  createGeofence(geofence: InsertGeofence): Promise<Geofence>;
  createGeofencesBulk(geofences: InsertGeofence[]): Promise<number>;
  getGeofences(filters?: { active?: boolean; jobId?: string; source?: string }): Promise<Geofence[]>;
  getGeofence(id: string): Promise<Geofence | undefined>;
  updateGeofence(id: string, updates: Partial<Geofence>): Promise<Geofence | undefined>;
  deleteGeofence(id: string): Promise<void>;
  // Find which geofence a lat/lng point falls inside
  findGeofencesForPoint(lat: number, lng: number): Promise<Array<{ id: string; name: string; radius_m: number }>>;
  // Generate geofences from supreme companies with coordinates
  generateGeofencesFromSupreme(jobId?: string, radiusM?: number): Promise<{ created: number; skipped: number }>;
  // Captured devices
  captureDevice(device: InsertCapturedDevice): Promise<{ created: boolean; device: CapturedDevice }>;
  getCapturedDevices(filters?: { synced?: boolean; geofenceId?: string; limit?: number }): Promise<CapturedDevice[]>;
  getCapturedDeviceCount(): Promise<number>;
  markDevicesSynced(deviceIds: string[], syncedTo: string): Promise<void>;
  // Audience segments
  createAudienceSegment(segment: InsertAudienceSegment): Promise<AudienceSegment>;
  getAudienceSegments(): Promise<AudienceSegment[]>;
  updateAudienceSegment(id: string, updates: Partial<AudienceSegment>): Promise<AudienceSegment | undefined>;

  // ── Campaign Builder ────────────────────────────────────────────────
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  getCampaigns(filters?: { status?: string }): Promise<Campaign[]>;
  updateCampaign(id: string, updates: Partial<Campaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: string): Promise<void>;
  incrementCampaignStats(id: string, stats: { impressions?: number; clicks?: number; wins?: number; spent?: number }): Promise<void>;

  // Creatives
  createCreative(creative: InsertCreative): Promise<Creative>;
  getCreative(id: string): Promise<Creative | undefined>;
  getCreativesByCampaign(campaignId: string): Promise<Creative[]>;
  updateCreative(id: string, updates: Partial<Creative>): Promise<Creative | undefined>;
  deleteCreative(id: string): Promise<void>;

  // Campaign-Geofence links
  linkGeofenceToCampaign(campaignId: string, geofenceId: string): Promise<void>;
  unlinkGeofenceFromCampaign(campaignId: string, geofenceId: string): Promise<void>;
  getCampaignGeofenceIds(campaignId: string): Promise<string[]>;
  getActiveCampaignsForGeofence(geofenceId: string): Promise<Campaign[]>;

  // CSV upload geofences
  createGeofencesFromCsv(rows: Array<{ name: string; latitude: number; longitude: number; radiusM: number; address?: string; city?: string; state?: string }>, campaignId?: string, groupName?: string): Promise<{ created: number; skipped: number }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createJob(job: InsertScrapeJob): Promise<ScrapeJob> {
    const [created] = await db.insert(scrapeJobs).values(job).returning();
    return created;
  }

  async getJob(id: string): Promise<ScrapeJob | undefined> {
    const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id));
    return job;
  }

  async getJobs(status?: string): Promise<ScrapeJob[]> {
    if (status) {
      return db.select().from(scrapeJobs).where(eq(scrapeJobs.status, status)).orderBy(desc(scrapeJobs.startedAt));
    }
    return db.select().from(scrapeJobs).orderBy(desc(scrapeJobs.startedAt));
  }

  async updateJob(id: string, updates: Partial<ScrapeJob>): Promise<ScrapeJob | undefined> {
    const [updated] = await db.update(scrapeJobs).set(updates).where(eq(scrapeJobs.id, id)).returning();
    return updated;
  }

  async deleteJob(id: string): Promise<void> {
    await db.delete(scrapedResults).where(eq(scrapedResults.jobId, id));
    await db.delete(discoveredPaths).where(eq(discoveredPaths.jobId, id));
    await db.delete(discoveryGraphs).where(eq(discoveryGraphs.jobId, id));
    await db.delete(scrapeJobs).where(eq(scrapeJobs.id, id));
  }

  async createResult(result: InsertScrapedResult): Promise<ScrapedResult> {
    const [created] = await db.insert(scrapedResults).values(result).returning();
    return created;
  }

  async createResultsBatch(results: InsertScrapedResult[]): Promise<void> {
    if (results.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < results.length; i += batchSize) {
      await db.insert(scrapedResults).values(results.slice(i, i + batchSize));
    }
  }

  async getResults(filters?: { jobId?: string; domain?: string; extractorType?: string; category?: string }, limit: number = 1000, offset: number = 0): Promise<ScrapedResult[]> {
    const conditions = [];
    if (filters?.jobId) conditions.push(eq(scrapedResults.jobId, filters.jobId));
    if (filters?.domain) conditions.push(eq(scrapedResults.domain, filters.domain));
    if (filters?.extractorType) conditions.push(eq(scrapedResults.extractorType, filters.extractorType));
    if (filters?.category) conditions.push(eq(scrapedResults.category, filters.category));

    const query = db.select().from(scrapedResults);
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(desc(scrapedResults.scrapedAt)).limit(limit).offset(offset);
    }
    return query.orderBy(desc(scrapedResults.scrapedAt)).limit(limit).offset(offset);
  }

  async getResultsCount(filters?: { jobId?: string; domain?: string; extractorType?: string; category?: string }): Promise<number> {
    const conditions = [];
    if (filters?.jobId) conditions.push(eq(scrapedResults.jobId, filters.jobId));
    if (filters?.domain) conditions.push(eq(scrapedResults.domain, filters.domain));
    if (filters?.extractorType) conditions.push(eq(scrapedResults.extractorType, filters.extractorType));
    if (filters?.category) conditions.push(eq(scrapedResults.category, filters.category));

    const query = db.select({ count: sql<number>`count(*)` }).from(scrapedResults);
    if (conditions.length > 0) {
      const [row] = await query.where(and(...conditions));
      return Number(row?.count || 0);
    }
    const [row] = await query;
    return Number(row?.count || 0);
  }

  async getResultCount(jobId: string): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(scrapedResults).where(eq(scrapedResults.jobId, jobId));
    return Number(row?.count || 0);
  }

  async deleteResultsByJob(jobId: string): Promise<void> {
    await db.delete(scrapedResults).where(eq(scrapedResults.jobId, jobId));
  }

  async createPath(path: InsertDiscoveredPath): Promise<DiscoveredPath> {
    const [created] = await db.insert(discoveredPaths).values(path).returning();
    return created;
  }

  async createPathsBatch(paths: InsertDiscoveredPath[]): Promise<void> {
    if (paths.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < paths.length; i += batchSize) {
      await db.insert(discoveredPaths).values(paths.slice(i, i + batchSize));
    }
  }

  async getPaths(filters?: { jobId?: string; domain?: string; statusCode?: number }, limit: number = 1000, offset: number = 0): Promise<DiscoveredPath[]> {
    const conditions = [];
    if (filters?.jobId) conditions.push(eq(discoveredPaths.jobId, filters.jobId));
    if (filters?.domain) conditions.push(eq(discoveredPaths.domain, filters.domain));
    if (filters?.statusCode) conditions.push(eq(discoveredPaths.statusCode, filters.statusCode));

    const query = db.select().from(discoveredPaths);
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(discoveredPaths.statusCode).limit(limit).offset(offset);
    }
    return query.orderBy(discoveredPaths.statusCode).limit(limit).offset(offset);
  }

  async getPathsCount(filters?: { jobId?: string; domain?: string; statusCode?: number }): Promise<number> {
    const conditions = [];
    if (filters?.jobId) conditions.push(eq(discoveredPaths.jobId, filters.jobId));
    if (filters?.domain) conditions.push(eq(discoveredPaths.domain, filters.domain));
    if (filters?.statusCode) conditions.push(eq(discoveredPaths.statusCode, filters.statusCode));

    const query = db.select({ count: sql<number>`count(*)` }).from(discoveredPaths);
    if (conditions.length > 0) {
      const [row] = await query.where(and(...conditions));
      return Number(row?.count || 0);
    }
    const [row] = await query;
    return Number(row?.count || 0);
  }

  async getPathCount(jobId: string): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(discoveredPaths).where(eq(discoveredPaths.jobId, jobId));
    return Number(row?.count || 0);
  }

  async deletePathsByJob(jobId: string): Promise<void> {
    await db.delete(discoveredPaths).where(eq(discoveredPaths.jobId, jobId));
  }

  async getDomainIntel(domain: string): Promise<DomainIntel | undefined> {
    const [intel] = await db.select().from(domainIntel).where(eq(domainIntel.domain, domain));
    return intel;
  }

  async upsertDomainIntel(intel: InsertDomainIntel): Promise<DomainIntel> {
    const existing = await this.getDomainIntel(intel.domain);
    if (existing) {
      const [updated] = await db.update(domainIntel).set({ ...intel, lastScannedAt: new Date() }).where(eq(domainIntel.domain, intel.domain)).returning();
      return updated;
    }
    const [created] = await db.insert(domainIntel).values(intel).returning();
    return created;
  }

  async createConfig(config: InsertScanConfig): Promise<ScanConfig> {
    const [created] = await db.insert(scanConfigs).values(config).returning();
    return created;
  }

  async getConfigs(): Promise<ScanConfig[]> {
    return db.select().from(scanConfigs).orderBy(desc(scanConfigs.createdAt));
  }

  async deleteConfig(id: string): Promise<void> {
    await db.delete(scanConfigs).where(eq(scanConfigs.id, id));
  }

  async saveGraph(graph: InsertDiscoveryGraph): Promise<DiscoveryGraph> {
    await db.delete(discoveryGraphs).where(
      and(eq(discoveryGraphs.jobId, graph.jobId), eq(discoveryGraphs.domain, graph.domain))
    );
    const [created] = await db.insert(discoveryGraphs).values(graph).returning();
    return created;
  }

  async getGraphByJob(jobId: string): Promise<DiscoveryGraph | undefined> {
    const [graph] = await db.select().from(discoveryGraphs).where(eq(discoveryGraphs.jobId, jobId));
    return graph;
  }

  async getGraphByDomain(domain: string): Promise<DiscoveryGraph | undefined> {
    const [graph] = await db.select().from(discoveryGraphs).where(eq(discoveryGraphs.domain, domain)).orderBy(desc(discoveryGraphs.createdAt)).limit(1);
    return graph;
  }

  async getGraphs(): Promise<DiscoveryGraph[]> {
    return db.select().from(discoveryGraphs).orderBy(desc(discoveryGraphs.createdAt)).limit(50);
  }

  async deleteGraphByJob(jobId: string): Promise<void> {
    await db.delete(discoveryGraphs).where(eq(discoveryGraphs.jobId, jobId));
  }

  async createFiscalIntel(item: InsertFiscalIntel): Promise<FiscalIntel> {
    const [created] = await db.insert(fiscalIntel).values(item).returning();
    return created;
  }

  async createFiscalIntelBatch(items: InsertFiscalIntel[]): Promise<void> {
    if (items.length === 0) return;
    const BATCH_SIZE = 100;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      await db.insert(fiscalIntel).values(items.slice(i, i + BATCH_SIZE));
    }
  }

  async getFiscalIntel(company: string, filters?: { source?: string; category?: string }): Promise<FiscalIntel[]> {
    const normalizedCompany = company.toLowerCase().trim();
    const conditions = [sql`lower(${fiscalIntel.company}) = ${normalizedCompany}`];
    if (filters?.source) conditions.push(eq(fiscalIntel.source, filters.source));
    if (filters?.category) conditions.push(eq(fiscalIntel.category, filters.category));
    return db.select().from(fiscalIntel).where(and(...conditions)).orderBy(desc(fiscalIntel.fetchedAt)).limit(200);
  }

  async getFiscalIntelByDomain(domain: string): Promise<FiscalIntel[]> {
    return db.select().from(fiscalIntel).where(eq(fiscalIntel.domain, domain)).orderBy(desc(fiscalIntel.fetchedAt)).limit(200);
  }

  async getFiscalIntelCached(company: string, source: string): Promise<FiscalIntel | undefined> {
    const normalizedCompany = company.toLowerCase().trim();
    const [cached] = await db.select().from(fiscalIntel)
      .where(and(
        sql`lower(${fiscalIntel.company}) = ${normalizedCompany}`,
        eq(fiscalIntel.source, source),
        sql`${fiscalIntel.expiresAt} > now()`
      ))
      .orderBy(desc(fiscalIntel.fetchedAt))
      .limit(1);
    return cached;
  }

  async deleteFiscalIntel(company: string, source?: string): Promise<void> {
    const normalizedCompany = company.toLowerCase().trim();
    const conditions = [sql`lower(${fiscalIntel.company}) = ${normalizedCompany}`];
    if (source) conditions.push(eq(fiscalIntel.source, source));
    await db.delete(fiscalIntel).where(and(...conditions));
  }

  async createFiscalLead(lead: InsertFiscalLead): Promise<FiscalLead> {
    const [created] = await db.insert(fiscalLeads).values(lead).returning();
    return created;
  }

  async getFiscalLead(id: string): Promise<FiscalLead | undefined> {
    const [lead] = await db.select().from(fiscalLeads).where(eq(fiscalLeads.id, id));
    return lead;
  }

  async getFiscalLeadByCompany(company: string): Promise<FiscalLead | undefined> {
    const normalizedCompany = company.toLowerCase().trim();
    const [lead] = await db.select().from(fiscalLeads)
      .where(sql`lower(${fiscalLeads.company}) = ${normalizedCompany}`)
      .limit(1);
    return lead;
  }

  async getFiscalLeads(filters?: { opportunityLevel?: string; pipelineStage?: string }, limit = 100, offset = 0): Promise<FiscalLead[]> {
    const conditions: any[] = [];
    if (filters?.opportunityLevel) conditions.push(eq(fiscalLeads.opportunityLevel, filters.opportunityLevel));
    if (filters?.pipelineStage) conditions.push(eq(fiscalLeads.pipelineStage, filters.pipelineStage));
    const query = conditions.length > 0
      ? db.select().from(fiscalLeads).where(and(...conditions)).orderBy(desc(fiscalLeads.createdAt)).limit(limit).offset(offset)
      : db.select().from(fiscalLeads).orderBy(desc(fiscalLeads.createdAt)).limit(limit).offset(offset);
    return query;
  }

  async getFiscalLeadsCount(filters?: { opportunityLevel?: string; pipelineStage?: string }): Promise<number> {
    const conditions: any[] = [];
    if (filters?.opportunityLevel) conditions.push(eq(fiscalLeads.opportunityLevel, filters.opportunityLevel));
    if (filters?.pipelineStage) conditions.push(eq(fiscalLeads.pipelineStage, filters.pipelineStage));
    const query = conditions.length > 0
      ? db.select({ count: sql`count(*)` }).from(fiscalLeads).where(and(...conditions))
      : db.select({ count: sql`count(*)` }).from(fiscalLeads);
    const [row] = await query;
    return Number(row?.count || 0);
  }

  async updateFiscalLead(id: string, updates: Partial<FiscalLead>): Promise<FiscalLead | undefined> {
    const [updated] = await db.update(fiscalLeads).set({ ...updates, updatedAt: new Date() }).where(eq(fiscalLeads.id, id)).returning();
    return updated;
  }

  async deleteFiscalLead(id: string): Promise<void> {
    await db.delete(fiscalLeads).where(eq(fiscalLeads.id, id));
  }

  async allocateToPortfolio(allocation: InsertPortfolioAllocation): Promise<PortfolioAllocation> {
    const [created] = await db.insert(portfolioAllocations).values(allocation).returning();
    return created;
  }

  async allocateToPortfolioBatch(allocations: InsertPortfolioAllocation[]): Promise<void> {
    if (allocations.length === 0) return;
    await db.insert(portfolioAllocations).values(allocations);
  }

  async getPortfolioAllocations(): Promise<PortfolioAllocation[]> {
    return db.select().from(portfolioAllocations).orderBy(desc(portfolioAllocations.allocatedAt));
  }

  async getPortfolioAllocation(leadId: string): Promise<PortfolioAllocation | undefined> {
    const [alloc] = await db.select().from(portfolioAllocations).where(eq(portfolioAllocations.leadId, leadId));
    return alloc;
  }

  async removeFromPortfolio(leadId: string): Promise<void> {
    await db.delete(portfolioAllocations).where(eq(portfolioAllocations.leadId, leadId));
  }

  async clearPortfolio(): Promise<void> {
    await db.delete(portfolioAllocations);
  }

  async getHiveDirectories(): Promise<HiveDirectory[]> {
    return db.select().from(hiveDirectories);
  }

  async getHiveCategories(): Promise<HiveCategory[]> {
    return db.select().from(hiveCategories);
  }

  async getHiveLocations(): Promise<HiveLocation[]> {
    return db.select().from(hiveLocations);
  }

  async createHiveCrawlJob(job: InsertHiveCrawlJob): Promise<HiveCrawlJob> {
    const [created] = await db.insert(hiveCrawlJobs).values(job).returning();
    return created;
  }

  async updateHiveCrawlJob(id: string, updates: Partial<HiveCrawlJob>): Promise<HiveCrawlJob | undefined> {
    const [updated] = await db.update(hiveCrawlJobs).set(updates).where(eq(hiveCrawlJobs.id, id)).returning();
    return updated;
  }

  async getHiveCrawlJobs(): Promise<HiveCrawlJob[]> {
    return db.select({
      id: hiveCrawlJobs.id,
      status: hiveCrawlJobs.status,
      directoryIds: hiveCrawlJobs.directoryIds,
      categoryIds: hiveCrawlJobs.categoryIds,
      locationIds: hiveCrawlJobs.locationIds,
      flowersFound: hiveCrawlJobs.flowersFound,
      pollenFound: hiveCrawlJobs.pollenFound,
      totalCombos: hiveCrawlJobs.totalCombos,
      completedCombos: hiveCrawlJobs.completedCombos,
      shouldStop: hiveCrawlJobs.shouldStop,
      log: sql<string[] | null>`'{}'::text[]`.as('log'),
      startedAt: hiveCrawlJobs.startedAt,
      completedAt: hiveCrawlJobs.completedAt,
    }).from(hiveCrawlJobs).orderBy(desc(hiveCrawlJobs.startedAt)).limit(20);
  }

  async getHiveCrawlJob(id: string): Promise<HiveCrawlJob | undefined> {
    const [job] = await db.select().from(hiveCrawlJobs).where(eq(hiveCrawlJobs.id, id));
    return job;
  }

  async getHiveCrawlJobMeta(id: string): Promise<Omit<HiveCrawlJob, 'log'> | undefined> {
    const [job] = await db.select({
      id: hiveCrawlJobs.id,
      status: hiveCrawlJobs.status,
      directoryIds: hiveCrawlJobs.directoryIds,
      categoryIds: hiveCrawlJobs.categoryIds,
      locationIds: hiveCrawlJobs.locationIds,
      flowersFound: hiveCrawlJobs.flowersFound,
      pollenFound: hiveCrawlJobs.pollenFound,
      totalCombos: hiveCrawlJobs.totalCombos,
      completedCombos: hiveCrawlJobs.completedCombos,
      shouldStop: hiveCrawlJobs.shouldStop,
      startedAt: hiveCrawlJobs.startedAt,
      completedAt: hiveCrawlJobs.completedAt,
    }).from(hiveCrawlJobs).where(eq(hiveCrawlJobs.id, id));
    return job;
  }

  async getHiveCrawlJobLogTail(id: string, limit: number): Promise<string[]> {
    const result = await db.execute(sql`
      SELECT (SELECT ARRAY(
        SELECT unnest(log) AS entry
        FROM hive_crawl_jobs WHERE id = ${id}
        OFFSET GREATEST(0, (SELECT COALESCE(array_length(log, 1), 0) FROM hive_crawl_jobs WHERE id = ${id}) - ${limit})
      )) AS tail
    `);
    const rows = result.rows as { tail: string[] | null }[];
    return rows[0]?.tail || [];
  }

  async interruptAllRunningCrawlJobs(): Promise<number> {
    const result = await db.update(hiveCrawlJobs)
      .set({ status: "interrupted", completedAt: new Date() })
      .where(eq(hiveCrawlJobs.status, "running"))
      .returning({ id: hiveCrawlJobs.id });
    return result.length;
  }

  async getHiveCrawlJobShouldStop(id: string): Promise<boolean> {
    const [row] = await db.select({ shouldStop: hiveCrawlJobs.shouldStop }).from(hiveCrawlJobs).where(eq(hiveCrawlJobs.id, id));
    return row?.shouldStop ?? false;
  }

  async appendCrawlLog(jobId: string, message: string): Promise<void> {
    await db.execute(sql`UPDATE hive_crawl_jobs SET log = array_append(log, ${message}) WHERE id = ${jobId}`);
  }

  async appendCrawlLogBatch(jobId: string, messages: string[]): Promise<void> {
    if (messages.length === 0) return;
    const pgArray = `{${messages.map(m => `"${m.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
    await db.execute(sql`UPDATE hive_crawl_jobs SET log = log || ${pgArray}::text[] WHERE id = ${jobId}`);
  }

  async bulkInsertFlowers(flowers: InsertHiveFlower[]): Promise<number> {
    if (flowers.length === 0) return 0;
    let inserted = 0;
    const batchSize = 50;
    for (let i = 0; i < flowers.length; i += batchSize) {
      const batch = flowers.slice(i, i + batchSize);
      const result = await db.insert(hiveFlowers).values(batch).onConflictDoNothing({ target: hiveFlowers.normalizedUrl }).returning();
      inserted += result.length;
    }
    return inserted;
  }

  async bulkInsertPollen(pollen: InsertHivePollen[]): Promise<number> {
    if (pollen.length === 0) return 0;
    let inserted = 0;
    const batchSize = 50;
    for (let i = 0; i < pollen.length; i += batchSize) {
      const batch = pollen.slice(i, i + batchSize);
      const result = await db.insert(hivePollen).values(batch).onConflictDoNothing().returning();
      inserted += result.length;
    }
    return inserted;
  }

  async getHiveFlowers(filters: { directory?: string; category?: string; categories?: string; city?: string; state?: string; search?: string; isAlive?: boolean; phoneValid?: string; sortBy?: string; beauteousOnly?: boolean; tag?: string; crawlJobId?: string; page?: number; limit?: number }): Promise<{ flowers: HiveFlower[]; total: number }> {
    const conditions: any[] = [];
    if (filters.directory) conditions.push(eq(hiveFlowers.sourceDirectory, filters.directory));
    if (filters.categories) conditions.push(inArray(hiveFlowers.category, filters.categories.split(",")));
    else if (filters.category) conditions.push(eq(hiveFlowers.category, filters.category));
    if (filters.city) conditions.push(eq(hiveFlowers.city, filters.city));
    if (filters.state) conditions.push(eq(hiveFlowers.state, filters.state));
    if (filters.isAlive !== undefined) conditions.push(eq(hiveFlowers.isAlive, filters.isAlive));
    if (filters.phoneValid === "true") conditions.push(eq(hiveFlowers.phoneValid, true));
    else if (filters.phoneValid === "false") conditions.push(eq(hiveFlowers.phoneValid, false));
    else if (filters.phoneValid === "nophone") conditions.push(sql`phone IS NULL OR phone = ''`);
    else if (filters.phoneValid === "unchecked") conditions.push(sql`phone_checked IS NULL AND phone IS NOT NULL AND phone != ''`);
    if (filters.beauteousOnly) conditions.push(sql`beauty_score >= 90`);
    if (filters.tag) conditions.push(sql`(${hiveFlowers.city}, ${hiveFlowers.state}) IN (SELECT city, state FROM hive_locations WHERE tag = ${filters.tag})`);
    if (filters.crawlJobId) conditions.push(eq(hiveFlowers.crawlJobId, filters.crawlJobId));
    if (filters.search) {
      conditions.push(or(
        ilike(hiveFlowers.name, `%${filters.search}%`),
        ilike(hiveFlowers.website, `%${filters.search}%`)
      ));
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(hiveFlowers).where(whereClause);
    const total = Number(countRow?.count || 0);

    let orderClause;
    if (filters.sortBy === "beauty") {
      orderClause = sql`beauty_score DESC NULLS LAST`;
    } else if (filters.sortBy === "phone") {
      orderClause = sql`phone_valid DESC NULLS LAST, phone ASC`;
    } else if (filters.sortBy === "name") {
      orderClause = sql`name ASC`;
    } else if (filters.sortBy === "category") {
      orderClause = sql`category ASC, name ASC`;
    } else if (filters.sortBy === "state") {
      orderClause = sql`state ASC, city ASC, name ASC`;
    } else {
      orderClause = sql`created_at DESC`;
    }

    const flowers = await db.select().from(hiveFlowers).where(whereClause).orderBy(orderClause).limit(limit).offset(offset);

    return { flowers, total };
  }

  async getHivePollen(filters: { search?: string; category?: string; categories?: string; state?: string; directory?: string; crawlJobId?: string; phoneValid?: string; sortBy?: string; page?: number; limit?: number }): Promise<{ pollen: HivePollen[]; total: number }> {
    const conditions: any[] = [];
    if (filters.search) {
      conditions.push(ilike(hivePollen.name, `%${filters.search}%`));
    }
    if (filters.phoneValid === "true") conditions.push(eq(hivePollen.phoneValid, true));
    else if (filters.phoneValid === "false") conditions.push(eq(hivePollen.phoneValid, false));
    else if (filters.phoneValid === "nophone") conditions.push(sql`phone IS NULL OR phone = ''`);
    else if (filters.phoneValid === "unchecked") conditions.push(sql`phone_checked IS NULL AND phone IS NOT NULL AND phone != ''`);
    if (filters.category) {
      if (filters.category.startsWith("bundle:")) {
        const bundleName = filters.category.slice(7);
        const cats = await db.select({ name: hiveCategories.name }).from(hiveCategories).where(eq(hiveCategories.bundle, bundleName));
        if (cats.length > 0) {
          conditions.push(inArray(hivePollen.category, cats.map(c => c.name)));
        }
      } else {
        conditions.push(eq(hivePollen.category, filters.category));
      }
    }
    if (filters.categories) {
      const catList = filters.categories.split(",").map(s => s.trim()).filter(Boolean);
      if (catList.length > 0) conditions.push(inArray(hivePollen.category, catList));
    }
    if (filters.state) {
      conditions.push(eq(hivePollen.state, filters.state));
    }
    if (filters.directory) {
      conditions.push(eq(hivePollen.sourceDirectory, filters.directory));
    }
    if (filters.crawlJobId) {
      conditions.push(eq(hivePollen.crawlJobId, filters.crawlJobId));
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(hivePollen).where(whereClause);
    const total = Number(countRow?.count || 0);

    let orderBy: any = desc(hivePollen.createdAt);
    if (filters.sortBy === "category") orderBy = asc(hivePollen.category);
    else if (filters.sortBy === "state") orderBy = asc(hivePollen.state);
    else if (filters.sortBy === "name") orderBy = asc(hivePollen.name);
    else if (filters.sortBy === "phone") orderBy = sql`phone_valid DESC NULLS LAST, phone ASC`;

    const pollen = await db.select().from(hivePollen).where(whereClause).orderBy(orderBy).limit(limit).offset(offset);

    return { pollen, total };
  }

  async deleteFlower(id: string): Promise<void> {
    await db.delete(hiveFlowers).where(eq(hiveFlowers.id, id));
  }

  async updateFlowerHealth(id: string, isAlive: boolean): Promise<void> {
    await db.update(hiveFlowers).set({ isAlive, lastChecked: new Date() }).where(eq(hiveFlowers.id, id));
  }

  async updateFlowerBeauty(id: string, beautyScore: number, beautyFlags: string): Promise<void> {
    await db.update(hiveFlowers).set({ beautyScore, beautyFlags }).where(eq(hiveFlowers.id, id));
  }

  async getFlowersForBeautyScan(rescan: boolean): Promise<{ id: string; website: string }[]> {
    if (rescan) {
      return db.select({ id: hiveFlowers.id, website: hiveFlowers.website }).from(hiveFlowers);
    }
    return db.select({ id: hiveFlowers.id, website: hiveFlowers.website }).from(hiveFlowers).where(sql`beauty_score IS NULL`);
  }

  async getFlowersForPhoneScan(rescan: boolean): Promise<{ id: string; phone: string | null; state: string | null; name: string; category: string }[]> {
    const cols = { id: hiveFlowers.id, phone: hiveFlowers.phone, state: hiveFlowers.state, name: hiveFlowers.name, category: hiveFlowers.category };
    if (rescan) return db.select(cols).from(hiveFlowers);
    return db.select(cols).from(hiveFlowers).where(sql`phone_checked IS NULL`);
  }

  async updateFlowerPhoneAuth(id: string, phoneValid: boolean): Promise<void> {
    await db.update(hiveFlowers).set({ phoneValid, phoneChecked: new Date() }).where(eq(hiveFlowers.id, id));
  }

  async getPollenForPhoneScan(rescan: boolean): Promise<{ id: string; phone: string | null; state: string | null; name: string; category: string }[]> {
    const cols = { id: hivePollen.id, phone: hivePollen.phone, state: hivePollen.state, name: hivePollen.name, category: hivePollen.category };
    if (rescan) return db.select(cols).from(hivePollen);
    return db.select(cols).from(hivePollen).where(sql`phone_checked IS NULL`);
  }

  async updatePollenPhoneAuth(id: string, phoneValid: boolean): Promise<void> {
    await db.update(hivePollen).set({ phoneValid, phoneChecked: new Date() }).where(eq(hivePollen.id, id));
  }

  async getHiveStats(): Promise<{ totalFlowers: number; totalPollen: number; byDirectory: Record<string, number>; byCategory: Record<string, number> }> {
    const [flowerCount] = await db.select({ count: sql<number>`count(*)` }).from(hiveFlowers);
    const [pollenCount] = await db.select({ count: sql<number>`count(*)` }).from(hivePollen);

    const dirCounts = await db.select({
      dir: hiveFlowers.sourceDirectory,
      count: sql<number>`count(*)`
    }).from(hiveFlowers).groupBy(hiveFlowers.sourceDirectory);

    const catCounts = await db.select({
      cat: hiveFlowers.category,
      count: sql<number>`count(*)`
    }).from(hiveFlowers).groupBy(hiveFlowers.category);

    const byDirectory: Record<string, number> = {};
    for (const r of dirCounts) byDirectory[r.dir] = Number(r.count);

    const byCategory: Record<string, number> = {};
    for (const r of catCounts) byCategory[r.cat] = Number(r.count);

    return {
      totalFlowers: Number(flowerCount?.count || 0),
      totalPollen: Number(pollenCount?.count || 0),
      byDirectory,
      byCategory
    };
  }

  async getHiveCoverage(): Promise<{ category: string; city: string; state: string; count: number }[]> {
    const rows = await db.select({
      category: hiveFlowers.category,
      city: hiveFlowers.city,
      state: hiveFlowers.state,
      count: sql<number>`count(*)`
    }).from(hiveFlowers).groupBy(hiveFlowers.category, hiveFlowers.city, hiveFlowers.state);

    return rows.map(r => ({
      category: r.category,
      city: r.city || "",
      state: r.state || "",
      count: Number(r.count)
    }));
  }

  async getHiveDirectoryCount(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(hiveDirectories);
    return Number(row?.count || 0);
  }

  async getHiveCategoryCount(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(hiveCategories);
    return Number(row?.count || 0);
  }

  async getHiveLocationCount(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(hiveLocations);
    return Number(row?.count || 0);
  }

  async markComboCompleted(directoryId: string, categoryId: string, locationId: string, flowersFound: number, pollenFound: number): Promise<void> {
    await db.insert(hiveCompletedCombos).values({ directoryId, categoryId, locationId, flowersFound, pollenFound }).onConflictDoUpdate({
      target: [hiveCompletedCombos.directoryId, hiveCompletedCombos.categoryId, hiveCompletedCombos.locationId],
      set: { flowersFound, pollenFound, completedAt: new Date() },
    });
  }

  async isComboCompleted(directoryId: string, categoryId: string, locationId: string): Promise<boolean> {
    const [row] = await db.select({ id: hiveCompletedCombos.id }).from(hiveCompletedCombos).where(
      and(eq(hiveCompletedCombos.directoryId, directoryId), eq(hiveCompletedCombos.categoryId, categoryId), eq(hiveCompletedCombos.locationId, locationId))
    );
    return !!row;
  }

  async getCompletedCombosCount(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(hiveCompletedCombos);
    return Number(row?.count || 0);
  }

  async clearCompletedCombos(): Promise<void> {
    await db.delete(hiveCompletedCombos);
  }

  async deleteHaulData(): Promise<{ flowers: number; pollen: number; combos: number }> {
    const [fCount] = await db.select({ count: sql<number>`count(*)` }).from(hiveFlowers);
    const [pCount] = await db.select({ count: sql<number>`count(*)` }).from(hivePollen);
    const [cCount] = await db.select({ count: sql<number>`count(*)` }).from(hiveCompletedCombos);
    await db.delete(hiveFlowers);
    await db.delete(hivePollen);
    await db.delete(hiveCompletedCombos);
    return {
      flowers: Number(fCount?.count || 0),
      pollen: Number(pCount?.count || 0),
      combos: Number(cCount?.count || 0),
    };
  }

  async createCarpenterJob(data: InsertCarpenterAntJob): Promise<CarpenterAntJob> {
    const [job] = await db.insert(carpenterAntJobs).values(data).returning();
    return job;
  }

  async getCarpenterJob(id: string): Promise<CarpenterAntJob | undefined> {
    const [job] = await db.select().from(carpenterAntJobs).where(eq(carpenterAntJobs.id, id));
    return job;
  }

  async updateCarpenterJob(id: string, data: Partial<CarpenterAntJob>): Promise<void> {
    await db.update(carpenterAntJobs).set(data).where(eq(carpenterAntJobs.id, id));
  }

  async getCarpenterJobs(): Promise<CarpenterAntJob[]> {
    return db.select().from(carpenterAntJobs).orderBy(desc(carpenterAntJobs.createdAt));
  }

  async deleteCarpenterJob(id: string): Promise<void> {
    await db.delete(carpenterAntResults).where(eq(carpenterAntResults.jobId, id));
    await db.delete(carpenterAntJobs).where(eq(carpenterAntJobs.id, id));
  }

  async createCarpenterResult(data: InsertCarpenterAntResult): Promise<CarpenterAntResult> {
    const [result] = await db.insert(carpenterAntResults).values(data).returning();
    return result;
  }

  async bulkCreateCarpenterResults(data: InsertCarpenterAntResult[]): Promise<CarpenterAntResult[]> {
    if (data.length === 0) return [];
    return db.insert(carpenterAntResults).values(data).returning();
  }

  async updateCarpenterResult(id: string, data: Partial<CarpenterAntResult>): Promise<void> {
    await db.update(carpenterAntResults).set(data).where(eq(carpenterAntResults.id, id));
  }

  async getCarpenterResults(jobId: string): Promise<CarpenterAntResult[]> {
    return db.select().from(carpenterAntResults).where(eq(carpenterAntResults.jobId, jobId)).orderBy(asc(carpenterAntResults.createdAt));
  }

  async getCarpenterResult(id: string): Promise<CarpenterAntResult | undefined> {
    const [result] = await db.select().from(carpenterAntResults).where(eq(carpenterAntResults.id, id));
    return result;
  }

  // Email Outreach
  async createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate> {
    const [result] = await db.insert(emailTemplates).values(template).returning();
    return result;
  }

  async getEmailTemplates(): Promise<EmailTemplate[]> {
    return db.select().from(emailTemplates).orderBy(desc(emailTemplates.createdAt));
  }

  async getEmailTemplate(id: number): Promise<EmailTemplate | undefined> {
    const [result] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
    return result;
  }

  async deleteEmailTemplate(id: number): Promise<void> {
    await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  }

  async createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign> {
    const [result] = await db.insert(emailCampaigns).values(campaign).returning();
    return result;
  }

  async getEmailCampaigns(): Promise<EmailCampaign[]> {
    return db.select().from(emailCampaigns).orderBy(desc(emailCampaigns.createdAt));
  }

  async getEmailCampaign(id: number): Promise<EmailCampaign | undefined> {
    const [result] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, id));
    return result;
  }

  async updateEmailCampaign(id: number, updates: Partial<EmailCampaign>): Promise<EmailCampaign | undefined> {
    const [result] = await db.update(emailCampaigns).set(updates).where(eq(emailCampaigns.id, id)).returning();
    return result;
  }

  async deleteEmailCampaign(id: number): Promise<void> {
    await db.delete(emailCampaigns).where(eq(emailCampaigns.id, id));
  }

  async createEmailRecipients(recipients: InsertEmailRecipient[]): Promise<EmailRecipient[]> {
    if (recipients.length === 0) return [];
    return db.insert(emailRecipients).values(recipients).returning();
  }

  async getEmailRecipientsByCampaign(campaignId: number): Promise<EmailRecipient[]> {
    return db.select().from(emailRecipients).where(eq(emailRecipients.campaignId, campaignId)).orderBy(asc(emailRecipients.createdAt));
  }

  async getEmailRecipientsByStatus(status: string, limit: number): Promise<EmailRecipient[]> {
    return db.select().from(emailRecipients).where(eq(emailRecipients.status, status)).limit(limit).orderBy(asc(emailRecipients.createdAt));
  }

  async updateEmailRecipient(id: number, updates: Partial<EmailRecipient>): Promise<EmailRecipient | undefined> {
    const [result] = await db.update(emailRecipients).set(updates).where(eq(emailRecipients.id, id)).returning();
    return result;
  }

  async getEmailRecipientStats(campaignId: number): Promise<{ status: string; count: number }[]> {
    const stats = await db.select({ status: emailRecipients.status, count: count() }).from(emailRecipients).where(eq(emailRecipients.campaignId, campaignId)).groupBy(emailRecipients.status);
    return stats.map(s => ({ status: s.status || "unknown", count: Number(s.count) }));
  }

  async createEmailProviderConfig(config: InsertEmailProviderConfig): Promise<EmailProviderConfig> {
    const [result] = await db.insert(emailProviderConfigs).values(config).returning();
    return result;
  }

  async getEmailProviderConfigs(): Promise<EmailProviderConfig[]> {
    return db.select().from(emailProviderConfigs).orderBy(asc(emailProviderConfigs.name));
  }

  async updateEmailProviderConfig(id: number, updates: Partial<EmailProviderConfig>): Promise<EmailProviderConfig | undefined> {
    const [result] = await db.update(emailProviderConfigs).set(updates).where(eq(emailProviderConfigs.id, id)).returning();
    return result;
  }

  async deleteEmailProviderConfig(id: number): Promise<void> {
    await db.delete(emailProviderConfigs).where(eq(emailProviderConfigs.id, id));
  }

  // ─── Compass — Cal.com Intelligence ──────────────────────────────────────

  async getCompassSources(platform?: string): Promise<CompassSource[]> {
    if (platform) {
      return db.select().from(compassSources).where(eq(compassSources.platform, platform));
    }
    return db.select().from(compassSources);
  }

  async getCompassIndustries(): Promise<CompassIndustry[]> {
    return db.select().from(compassIndustries);
  }

  async createCompassQueryJob(job: InsertCompassQueryJob): Promise<CompassQueryJob> {
    const [created] = await db.insert(compassQueryJobs).values(job).returning();
    return created;
  }

  async updateCompassQueryJob(id: string, updates: Partial<CompassQueryJob>): Promise<CompassQueryJob | undefined> {
    const [updated] = await db.update(compassQueryJobs).set(updates).where(eq(compassQueryJobs.id, id)).returning();
    return updated;
  }

  async getCompassQueryJobs(platform?: string): Promise<CompassQueryJob[]> {
    if (platform) {
      return db.select().from(compassQueryJobs).where(eq(compassQueryJobs.platform, platform)).orderBy(desc(compassQueryJobs.startedAt));
    }
    return db.select().from(compassQueryJobs).orderBy(desc(compassQueryJobs.startedAt));
  }

  async getCompassQueryJob(id: string): Promise<CompassQueryJob | undefined> {
    const [job] = await db.select().from(compassQueryJobs).where(eq(compassQueryJobs.id, id));
    return job;
  }

  async getCompassQueryJobShouldStop(id: string): Promise<boolean> {
    const [job] = await db.select({ shouldStop: compassQueryJobs.shouldStop }).from(compassQueryJobs).where(eq(compassQueryJobs.id, id));
    return job?.shouldStop ?? false;
  }

  async interruptAllRunningCompassJobs(): Promise<number> {
    const result = await db.update(compassQueryJobs).set({ status: "interrupted" }).where(eq(compassQueryJobs.status, "running")).returning({ id: compassQueryJobs.id });
    return result.length;
  }

  async appendCompassLog(jobId: string, message: string): Promise<void> {
    await db.update(compassQueryJobs).set({ log: sql`array_append(${compassQueryJobs.log}, ${message})` }).where(eq(compassQueryJobs.id, jobId));
  }

  async appendCompassLogBatch(jobId: string, messages: string[]): Promise<void> {
    if (messages.length === 0) return;
    const escaped = messages.map(m => `'${m.replace(/'/g, "''")}'`).join(",");
    await db.execute(sql`UPDATE compass_query_jobs SET log = log || ARRAY[${sql.raw(escaped)}]::text[] WHERE id = ${jobId}`);
  }

  async bulkInsertDiscoveries(discoveries: InsertCompassDiscovery[]): Promise<number> {
    if (discoveries.length === 0) return 0;
    const batchSize = 100;
    let inserted = 0;
    for (let i = 0; i < discoveries.length; i += batchSize) {
      const batch = discoveries.slice(i, i + batchSize);
      try {
        const result = await db.insert(compassDiscoveries).values(batch).onConflictDoNothing().returning({ id: compassDiscoveries.id });
        inserted += result.length;
      } catch {
        // Continue on conflict — dedup handled by unique index
      }
    }
    return inserted;
  }

  async getPendingDiscoveries(limit: number, jobId?: string, platform?: string): Promise<CompassDiscovery[]> {
    const conditions = [eq(compassDiscoveries.status, "pending")];
    if (jobId) conditions.push(eq(compassDiscoveries.queryJobId, jobId));
    if (platform) conditions.push(eq(compassDiscoveries.platform, platform));
    return db.select().from(compassDiscoveries).where(and(...conditions)).limit(limit);
  }

  async getCompassDiscoveries(filters: { search?: string; searchMode?: string; source?: string; status?: string; sortBy?: string; page?: number; limit?: number; platform?: string }): Promise<{ discoveries: CompassDiscovery[]; total: number }> {
    const conditions = [];
    if (filters.search) {
      const searchLower = `%${filters.search.toLowerCase()}%`;
      if (filters.searchMode === "url") {
        // URL/username only
        conditions.push(
          or(
            ilike(compassDiscoveries.url, searchLower),
            ilike(compassDiscoveries.username, searchLower),
          )!
        );
      } else {
        // Search everything (includes source, sourceQuery)
        conditions.push(
          or(
            ilike(compassDiscoveries.url, searchLower),
            ilike(compassDiscoveries.username, searchLower),
            ilike(compassDiscoveries.source, searchLower),
            ilike(compassDiscoveries.sourceQuery, searchLower),
          )!
        );
      }
    }
    if (filters.source) conditions.push(eq(compassDiscoveries.source, filters.source));
    if (filters.status) conditions.push(eq(compassDiscoveries.status, filters.status));
    if (filters.platform) conditions.push(eq(compassDiscoveries.platform, filters.platform));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters.page || 1;
    const limit = filters.limit || 50;

    let orderBy;
    switch (filters.sortBy) {
      case "oldest": orderBy = asc(compassDiscoveries.discoveredAt); break;
      case "source": orderBy = asc(compassDiscoveries.source); break;
      case "username": orderBy = asc(compassDiscoveries.username); break;
      case "recent":
      default: orderBy = desc(compassDiscoveries.discoveredAt); break;
    }

    const [countResult] = await db.select({ count: count() }).from(compassDiscoveries).where(whereClause);
    const discoveries = await db.select().from(compassDiscoveries).where(whereClause).orderBy(orderBy).limit(limit).offset((page - 1) * limit);
    return { discoveries, total: Number(countResult.count) };
  }

  async markDiscoveryEnriched(id: string): Promise<void> {
    await db.update(compassDiscoveries).set({ status: "enriched", enrichedAt: new Date() }).where(eq(compassDiscoveries.id, id));
  }

  async markDiscoveryFailed(id: string): Promise<void> {
    await db.update(compassDiscoveries).set({ status: "failed", enrichedAt: new Date() }).where(eq(compassDiscoveries.id, id));
  }

  async isDiscoveryUrlExists(url: string): Promise<boolean> {
    const [existing] = await db.select({ id: compassDiscoveries.id }).from(compassDiscoveries).where(eq(compassDiscoveries.url, url)).limit(1);
    return !!existing;
  }

  async createCompassProfile(profile: InsertCompassProfile): Promise<CompassProfile> {
    const [created] = await db.insert(compassProfiles).values(profile).onConflictDoNothing().returning();
    if (!created) {
      const [existing] = await db.select().from(compassProfiles).where(eq(compassProfiles.calUrl, profile.calUrl));
      return existing!;
    }
    return created;
  }

  async bulkInsertEventTypes(eventTypes: InsertCompassEventType[]): Promise<void> {
    if (eventTypes.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < eventTypes.length; i += batchSize) {
      await db.insert(compassEventTypes).values(eventTypes.slice(i, i + batchSize));
    }
  }

  async getCompassProfiles(filters: { search?: string; searchMode?: string; industry?: string; bundle?: string; scope?: string; minQuality?: number; source?: string; isTeam?: boolean; sortBy?: string; page?: number; limit?: number; platform?: string }): Promise<{ profiles: CompassProfile[]; total: number }> {
    const conditions = [];
    if (filters.search) {
      const searchLower = `%${filters.search.toLowerCase()}%`;
      if (filters.searchMode === "url") {
        // URL/username only
        conditions.push(
          or(
            ilike(compassProfiles.username, searchLower),
            ilike(compassProfiles.calUrl, searchLower),
          )!
        );
      } else {
        // Search everything
        conditions.push(
          or(
            ilike(compassProfiles.name, searchLower),
            ilike(compassProfiles.bio, searchLower),
            ilike(compassProfiles.username, searchLower),
            ilike(compassProfiles.companyName, searchLower),
            ilike(compassProfiles.industry, searchLower),
            ilike(compassProfiles.calUrl, searchLower),
            sql`EXISTS (SELECT 1 FROM compass_event_types et WHERE et.profile_id = ${compassProfiles.id} AND et.title ILIKE ${searchLower})`
          )!
        );
      }
    }
    if (filters.industry) conditions.push(eq(compassProfiles.industry, filters.industry));
    if (filters.bundle) conditions.push(eq(compassProfiles.industryBundle, filters.bundle));
    if (filters.scope) conditions.push(eq(compassProfiles.scope, filters.scope));
    if (filters.source) conditions.push(eq(compassProfiles.source, filters.source));
    if (filters.isTeam !== undefined) conditions.push(eq(compassProfiles.isTeamProfile, filters.isTeam));
    if (filters.minQuality !== undefined) conditions.push(sql`${compassProfiles.qualityScore} >= ${filters.minQuality}`);
    if (filters.platform) conditions.push(eq(compassProfiles.platform, filters.platform));

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let orderBy;
    switch (filters.sortBy) {
      case "quality": orderBy = desc(compassProfiles.qualityScore); break;
      case "name": orderBy = asc(compassProfiles.name); break;
      case "industry": orderBy = asc(compassProfiles.industry); break;
      case "events": orderBy = desc(compassProfiles.eventCount); break;
      case "recent": orderBy = desc(compassProfiles.createdAt); break;
      default: orderBy = desc(compassProfiles.qualityScore);
    }

    const baseQuery = db.select().from(compassProfiles);
    const countQuery = db.select({ count: count() }).from(compassProfiles);

    if (whereClause) {
      const profiles = await baseQuery.where(whereClause).orderBy(orderBy).limit(limit).offset(offset);
      const [totalResult] = await countQuery.where(whereClause);
      return { profiles, total: Number(totalResult.count) };
    }
    const profiles = await baseQuery.orderBy(orderBy).limit(limit).offset(offset);
    const [totalResult] = await countQuery;
    return { profiles, total: Number(totalResult.count) };
  }

  async getCompassProfile(id: string): Promise<CompassProfile | undefined> {
    const [profile] = await db.select().from(compassProfiles).where(eq(compassProfiles.id, id));
    return profile;
  }

  async getCompassEventTypes(profileId: string): Promise<CompassEventType[]> {
    return db.select().from(compassEventTypes).where(eq(compassEventTypes.profileId, profileId));
  }

  async getCompassStats(platform?: string): Promise<{ totalProfiles: number; totalDiscoveries: number; bySource: Record<string, number>; byIndustry: Record<string, number> }> {
    const profileCond = platform ? eq(compassProfiles.platform, platform) : undefined;
    const discoveryCond = platform ? eq(compassDiscoveries.platform, platform) : undefined;

    const [profileCount] = await db.select({ count: count() }).from(compassProfiles).where(profileCond);
    const [discoveryCount] = await db.select({ count: count() }).from(compassDiscoveries).where(discoveryCond);

    const sourceStats = await db.select({ source: compassProfiles.source, count: count() }).from(compassProfiles).where(profileCond).groupBy(compassProfiles.source);
    const industryStats = await db.select({ industry: compassProfiles.industry, count: count() }).from(compassProfiles).where(profileCond && sql`${compassProfiles.industry} IS NOT NULL`).groupBy(compassProfiles.industry);

    return {
      totalProfiles: Number(profileCount.count),
      totalDiscoveries: Number(discoveryCount.count),
      bySource: Object.fromEntries(sourceStats.map(s => [s.source, Number(s.count)])),
      byIndustry: Object.fromEntries(industryStats.map(s => [s.industry || "Unclassified", Number(s.count)])),
    };
  }

  async updateProfileHealth(id: string, isAlive: boolean): Promise<void> {
    await db.update(compassProfiles).set({ isAlive, lastChecked: new Date() }).where(eq(compassProfiles.id, id));
  }

  async updateCompassProfile(id: string, updates: Partial<CompassProfile>): Promise<CompassProfile | undefined> {
    const [updated] = await db.update(compassProfiles).set(updates).where(eq(compassProfiles.id, id)).returning();
    return updated;
  }

  async replaceCompassEventTypes(profileId: string, eventTypes: InsertCompassEventType[]): Promise<void> {
    await db.delete(compassEventTypes).where(eq(compassEventTypes.profileId, profileId));
    if (eventTypes.length > 0) {
      await db.insert(compassEventTypes).values(eventTypes);
    }
  }

  // ── Stage 32 ────────────────────────────────────────────────────────────
  async createStage32Profile(profile: InsertStage32Profile): Promise<Stage32Profile> {
    const [created] = await db.insert(stage32Profiles).values(profile).onConflictDoNothing().returning();
    return created;
  }

  async getStage32ProfileByStage32Id(stage32Id: number): Promise<Stage32Profile | undefined> {
    const [result] = await db.select().from(stage32Profiles).where(eq(stage32Profiles.stage32Id, stage32Id)).limit(1);
    return result;
  }

  async getStage32Profiles(filters: { search?: string; location?: string; hasContact?: boolean; isServiceProvider?: boolean; page?: number; limit?: number }): Promise<{ profiles: Stage32Profile[]; total: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 25;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (filters.search) {
      conditions.push(
        or(
          ilike(stage32Profiles.name, `%${filters.search}%`),
          ilike(stage32Profiles.bio, `%${filters.search}%`),
          ilike(stage32Profiles.profession, `%${filters.search}%`),
        )
      );
    }
    if (filters.location) {
      conditions.push(ilike(stage32Profiles.location, `%${filters.location}%`));
    }
    if (filters.hasContact) {
      conditions.push(
        or(
          sql`${stage32Profiles.websiteEmail} IS NOT NULL`,
          sql`${stage32Profiles.websitePhone} IS NOT NULL`,
          sql`${stage32Profiles.bioEmail} IS NOT NULL`,
          sql`${stage32Profiles.bioPhone} IS NOT NULL`,
        )
      );
    }
    if (filters.isServiceProvider) {
      conditions.push(eq(stage32Profiles.isServiceProvider, true));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalResult] = await db.select({ count: count() }).from(stage32Profiles).where(where);
    const total = totalResult?.count || 0;

    const profiles = await db.select().from(stage32Profiles)
      .where(where)
      .orderBy(desc(stage32Profiles.createdAt))
      .limit(limit)
      .offset(offset);

    return { profiles, total };
  }

  async getStage32Profile(id: string): Promise<Stage32Profile | undefined> {
    const [result] = await db.select().from(stage32Profiles).where(eq(stage32Profiles.id, id)).limit(1);
    return result;
  }

  async updateStage32ProfileWebsiteContact(stage32Id: number, phone: string | null, email: string | null, calendlyUrl: string | null): Promise<void> {
    await db.update(stage32Profiles)
      .set({ websitePhone: phone, websiteEmail: email, websiteCalendlyUrl: calendlyUrl, websiteCheckedAt: new Date() })
      .where(eq(stage32Profiles.stage32Id, stage32Id));
  }

  async updateStage32ProfileWebsiteContactByUrl(stage32Url: string, phone: string | null, email: string | null, calendlyUrl: string | null): Promise<void> {
    await db.update(stage32Profiles)
      .set({ websitePhone: phone, websiteEmail: email, websiteCalendlyUrl: calendlyUrl, websiteCheckedAt: new Date() })
      .where(eq(stage32Profiles.stage32Url, stage32Url));
  }

  async getStage32Stats(): Promise<{ total: number; scraped: number; withContact: number; withWebsite: number; serviceProviders: number }> {
    const [totalResult] = await db.select({ count: count() }).from(stage32Profiles);
    const [scrapedResult] = await db.select({ count: count() }).from(stage32Profiles).where(eq(stage32Profiles.status, "scraped"));
    const [contactResult] = await db.select({ count: count() }).from(stage32Profiles).where(
      or(
        sql`${stage32Profiles.websiteEmail} IS NOT NULL`,
        sql`${stage32Profiles.websitePhone} IS NOT NULL`,
        sql`${stage32Profiles.bioEmail} IS NOT NULL`,
        sql`${stage32Profiles.bioPhone} IS NOT NULL`,
      )
    );
    const [websiteResult] = await db.select({ count: count() }).from(stage32Profiles).where(sql`${stage32Profiles.website} IS NOT NULL`);
    const [svcResult] = await db.select({ count: count() }).from(stage32Profiles).where(eq(stage32Profiles.isServiceProvider, true));

    return {
      total: totalResult?.count || 0,
      scraped: scrapedResult?.count || 0,
      withContact: contactResult?.count || 0,
      withWebsite: websiteResult?.count || 0,
      serviceProviders: svcResult?.count || 0,
    };
  }

  async createStage32Job(job: InsertStage32Job): Promise<Stage32Job> {
    const [created] = await db.insert(stage32Jobs).values(job).returning();
    return created;
  }

  async getStage32Job(id: string): Promise<Stage32Job | undefined> {
    const [result] = await db.select().from(stage32Jobs).where(eq(stage32Jobs.id, id)).limit(1);
    return result;
  }

  async getStage32Jobs(): Promise<Stage32Job[]> {
    return await db.select().from(stage32Jobs).orderBy(desc(stage32Jobs.startedAt)).limit(10);
  }

  async updateStage32Job(id: string, updates: Partial<Stage32Job>): Promise<Stage32Job | undefined> {
    const [updated] = await db.update(stage32Jobs).set(updates).where(eq(stage32Jobs.id, id)).returning();
    return updated;
  }

  // ── Parallel Supreme ──────────────────────────────────────────────────
  async createSupremeJob(job: InsertSupremeJob): Promise<SupremeJob> {
    const [created] = await db.insert(supremeJobs).values(job).returning();
    return created;
  }

  async updateSupremeJob(id: string, updates: Partial<SupremeJob>): Promise<SupremeJob | undefined> {
    const [updated] = await db.update(supremeJobs).set(updates).where(eq(supremeJobs.id, id)).returning();
    return updated;
  }

  async getSupremeJobs(): Promise<SupremeJob[]> {
    return await db.select().from(supremeJobs).orderBy(desc(supremeJobs.startedAt)).limit(20);
  }

  async getSupremeJob(id: string): Promise<SupremeJob | undefined> {
    const [result] = await db.select().from(supremeJobs).where(eq(supremeJobs.id, id)).limit(1);
    return result;
  }

  async getSupremeJobLogTail(id: string, limit: number): Promise<string[]> {
    const result = await db.execute(sql`
      SELECT (SELECT ARRAY(
        SELECT unnest(log) AS entry
        FROM supreme_jobs WHERE id = ${id}
        OFFSET GREATEST(0, (SELECT COALESCE(array_length(log, 1), 0) FROM supreme_jobs WHERE id = ${id}) - ${limit})
      )) AS tail
    `);
    return (result.rows[0] as any)?.tail ?? [];
  }

  async getSupremeJobShouldStop(id: string): Promise<boolean> {
    const [job] = await db.select({ shouldStop: supremeJobs.shouldStop }).from(supremeJobs).where(eq(supremeJobs.id, id)).limit(1);
    return job?.shouldStop ?? false;
  }

  async interruptSupremeJobs(): Promise<number> {
    const result = await db.update(supremeJobs)
      .set({ status: "interrupted", completedAt: new Date() })
      .where(eq(supremeJobs.status, "running"))
      .returning({ id: supremeJobs.id });
    return result.length;
  }

  async appendSupremeLogBatch(jobId: string, messages: string[]): Promise<void> {
    if (messages.length === 0) return;
    const pgArray = `{${messages.map(m => `"${m.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
    await db.execute(sql`UPDATE supreme_jobs SET log = log || ${pgArray}::text[] WHERE id = ${jobId}`);
  }

  async bulkInsertSupremeCompanies(companies: InsertSupremeCompany[]): Promise<number> {
    if (companies.length === 0) return 0;
    let inserted = 0;
    const batchSize = 100;
    for (let i = 0; i < companies.length; i += batchSize) {
      const batch = companies.slice(i, i + batchSize);
      const result = await db.insert(supremeCompanies).values(batch).onConflictDoNothing().returning();
      inserted += result.length;
    }
    return inserted;
  }

  async updateSupremeCompany(id: string, updates: Partial<SupremeCompany>): Promise<void> {
    await db.update(supremeCompanies).set(updates).where(eq(supremeCompanies.id, id));
  }

  async bulkUpdateSupremeCompanies(updates: { id: string; data: Partial<SupremeCompany> }[]): Promise<void> {
    if (updates.length === 0) return;
    for (const { id, data } of updates) {
      await db.update(supremeCompanies).set(data).where(eq(supremeCompanies.id, id));
    }
  }

  async getSupremeCompanies(filters: { jobId?: string; line?: string; status?: string; search?: string; hasCoords?: boolean; page?: number; limit?: number }): Promise<{ companies: SupremeCompany[]; total: number }> {
    const conditions: any[] = [];
    if (filters.jobId) conditions.push(eq(supremeCompanies.jobId, filters.jobId));
    if (filters.line) conditions.push(eq(supremeCompanies.line, filters.line));
    if (filters.status) conditions.push(eq(supremeCompanies.status, filters.status));
    if (filters.hasCoords) conditions.push(sql`${supremeCompanies.latitude} IS NOT NULL`);
    if (filters.search) {
      conditions.push(or(
        ilike(supremeCompanies.name, `%${filters.search}%`),
        ilike(supremeCompanies.website, `%${filters.search}%`),
        ilike(supremeCompanies.address, `%${filters.search}%`),
        ilike(supremeCompanies.city, `%${filters.search}%`),
      )!);
    }
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;

    const whereClause = conditions.length > 0 ? and(...conditions) : sql`true`;
    const [countResult] = await db.select({ count: count() }).from(supremeCompanies).where(whereClause);
    const companies = await db.select().from(supremeCompanies)
      .where(whereClause)
      .orderBy(desc(supremeCompanies.createdAt))
      .limit(limit)
      .offset(offset);

    return { companies, total: countResult?.count ?? 0 };
  }

  async getSupremeCompaniesForExport(jobId?: string, onlyGeocoded?: boolean): Promise<SupremeCompany[]> {
    const conditions: any[] = [];
    if (jobId) {
      conditions.push(eq(supremeCompanies.jobId, jobId));
    } else {
      // Only filter by line when no specific jobId — for Line 1 "all runs" export
      conditions.push(eq(supremeCompanies.line, "line1"));
    }
    if (onlyGeocoded) {
      conditions.push(sql`${supremeCompanies.latitude} IS NOT NULL`);
      conditions.push(sql`${supremeCompanies.longitude} IS NOT NULL`);
    }
    return await db.select().from(supremeCompanies).where(and(...conditions)).orderBy(asc(supremeCompanies.createdAt));
  }

  async getSupremeSourceStats(jobId?: string): Promise<Array<{ source: string; total: number; withWebsite: number; withAddress: number; withPhone: number; withCoords: number }>> {
    const conditions: any[] = [eq(supremeCompanies.line, "line1")];
    if (jobId) {
      conditions.push(eq(supremeCompanies.jobId, jobId));
    }
    const rows = await db
      .select({
        source: supremeCompanies.source,
        total: count(),
        withWebsite: count(sql`CASE WHEN ${supremeCompanies.website} IS NOT NULL AND ${supremeCompanies.website} != '' THEN 1 END`),
        withAddress: count(sql`CASE WHEN ${supremeCompanies.address} IS NOT NULL AND ${supremeCompanies.address} != '' THEN 1 END`),
        withPhone: count(sql`CASE WHEN ${supremeCompanies.phone} IS NOT NULL AND ${supremeCompanies.phone} != '' THEN 1 END`),
        withCoords: count(sql`CASE WHEN ${supremeCompanies.latitude} IS NOT NULL THEN 1 END`),
      })
      .from(supremeCompanies)
      .where(and(...conditions))
      .groupBy(supremeCompanies.source);
    return rows.map(r => ({
      source: r.source ?? "unknown",
      total: Number(r.total),
      withWebsite: Number(r.withWebsite),
      withAddress: Number(r.withAddress),
      withPhone: Number(r.withPhone),
      withCoords: Number(r.withCoords),
    }));
  }

  // ── Geofencing Platform ──────────────────────────────────────────────

  async createGeofence(geofence: InsertGeofence): Promise<Geofence> {
    const [created] = await db.insert(geofences).values(geofence).returning();
    return created;
  }

  async createGeofencesBulk(geofencesList: InsertGeofence[]): Promise<number> {
    if (geofencesList.length === 0) return 0;
    const result = await db.insert(geofences).values(geofencesList).returning();
    return result.length;
  }

  async getGeofences(filters?: { active?: boolean; jobId?: string; source?: string }): Promise<Geofence[]> {
    const conditions: any[] = [];
    if (filters?.active !== undefined) {
      conditions.push(eq(geofences.active, filters.active));
    }
    if (filters?.jobId) {
      conditions.push(eq(geofences.jobId, filters.jobId));
    }
    if (filters?.source) {
      conditions.push(eq(geofences.source, filters.source));
    }
    const query = db.select().from(geofences);
    if (conditions.length > 0) {
      return await query.where(and(...conditions)).orderBy(desc(geofences.createdAt));
    }
    return await query.orderBy(desc(geofences.createdAt));
  }

  async getGeofence(id: string): Promise<Geofence | undefined> {
    const [g] = await db.select().from(geofences).where(eq(geofences.id, id));
    return g;
  }

  async updateGeofence(id: string, updates: Partial<Geofence>): Promise<Geofence | undefined> {
    const [updated] = await db.update(geofences).set(updates).where(eq(geofences.id, id)).returning();
    return updated;
  }

  async deleteGeofence(id: string): Promise<void> {
    await db.delete(geofences).where(eq(geofences.id, id));
  }

  async findGeofencesForPoint(lat: number, lng: number): Promise<Array<{ id: string; name: string; radius_m: number }>> {
    // Raw SQL using PostGIS ST_Contains — drizzle can't express this
    const result = await db.execute(sql`
      SELECT id, name, radius_m
      FROM geofences
      WHERE active = true
        AND ST_Contains(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
    `);
    return result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      radius_m: r.radius_m,
    }));
  }

  async generateGeofencesFromSupreme(jobId?: string, radiusM?: number): Promise<{ created: number; skipped: number }> {
    const radius = radiusM ?? 250;
    // Find supreme companies with coordinates that don't have a geofence yet
    const conditions: any[] = [
      sql`${supremeCompanies.latitude} IS NOT NULL`,
      sql`${supremeCompanies.longitude} IS NOT NULL`,
    ];
    if (jobId) {
      conditions.push(eq(supremeCompanies.jobId, jobId));
    }

    const companies = await db
      .select({
        id: supremeCompanies.id,
        name: supremeCompanies.name,
        address: supremeCompanies.address,
        city: supremeCompanies.city,
        state: supremeCompanies.state,
        latitude: supremeCompanies.latitude,
        longitude: supremeCompanies.longitude,
        jobId: supremeCompanies.jobId,
      })
      .from(supremeCompanies)
      .where(and(...conditions));

    // Check which already have geofences
    const existing = await db.select({ companyId: geofences.companyId }).from(geofences);
    const existingCompanyIds = new Set(existing.map((e: any) => e.companyId));

    const toCreate: InsertGeofence[] = [];
    let skipped = 0;
    for (const c of companies) {
      if (existingCompanyIds.has(c.id)) {
        skipped++;
        continue;
      }
      toCreate.push({
        name: c.name,
        companyId: c.id,
        jobId: c.jobId,
        latitude: c.latitude!,
        longitude: c.longitude!,
        radiusM: radius,
        address: c.address,
        city: c.city,
        state: c.state,
        source: "supreme_line2",
      });
    }

    let created = 0;
    if (toCreate.length > 0) {
      created = await this.createGeofencesBulk(toCreate);
    }
    return { created, skipped };
  }

  // ── Captured Devices ──────────────────────────────────────────────────

  async captureDevice(device: InsertCapturedDevice): Promise<{ created: boolean; device: CapturedDevice }> {
    // Upsert by MAID — if exists, update last_seen and hit_count
    if (!device.maid) {
      // No MAID — just insert
      const [created] = await db.insert(capturedDevices).values(device).returning();
      return { created: true, device: created };
    }

    const [existing] = await db.select().from(capturedDevices).where(eq(capturedDevices.maid, device.maid));
    if (existing) {
      const [updated] = await db
        .update(capturedDevices)
        .set({
          lastSeen: new Date(),
          hitCount: existing.hitCount + 1,
          latitude: device.latitude ?? existing.latitude,
          longitude: device.longitude ?? existing.longitude,
          geofenceId: device.geofenceId ?? existing.geofenceId,
          geofenceName: device.geofenceName ?? existing.geofenceName,
          ip: device.ip ?? existing.ip,
        })
        .where(eq(capturedDevices.id, existing.id))
        .returning();
      return { created: false, device: updated };
    }

    const [created] = await db.insert(capturedDevices).values(device).returning();
    return { created: true, device: created };
  }

  async getCapturedDevices(filters?: { synced?: boolean; geofenceId?: string; limit?: number }): Promise<CapturedDevice[]> {
    const conditions: any[] = [];
    if (filters?.synced !== undefined) {
      conditions.push(eq(capturedDevices.synced, filters.synced));
    }
    if (filters?.geofenceId) {
      conditions.push(eq(capturedDevices.geofenceId, filters.geofenceId));
    }
    const limit = filters?.limit ?? 100;
    const query = db.select().from(capturedDevices);
    if (conditions.length > 0) {
      return await query.where(and(...conditions)).orderBy(desc(capturedDevices.lastSeen)).limit(limit);
    }
    return await query.orderBy(desc(capturedDevices.lastSeen)).limit(limit);
  }

  async getCapturedDeviceCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(capturedDevices);
    return Number(result.count);
  }

  async markDevicesSynced(deviceIds: string[], syncedTo: string): Promise<void> {
    if (deviceIds.length === 0) return;
    await db
      .update(capturedDevices)
      .set({ synced: true, syncedAt: new Date(), syncedTo })
      .where(inArray(capturedDevices.id, deviceIds));
  }

  // ── Audience Segments ─────────────────────────────────────────────────

  async createAudienceSegment(segment: InsertAudienceSegment): Promise<AudienceSegment> {
    const [created] = await db.insert(audienceSegments).values(segment).returning();
    return created;
  }

  async getAudienceSegments(): Promise<AudienceSegment[]> {
    return await db.select().from(audienceSegments).orderBy(desc(audienceSegments.createdAt));
  }

  async updateAudienceSegment(id: string, updates: Partial<AudienceSegment>): Promise<AudienceSegment | undefined> {
    const [updated] = await db.update(audienceSegments).set(updates).where(eq(audienceSegments.id, id)).returning();
    return updated;
  }

  // ── Campaigns ─────────────────────────────────────────────────────────

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const [created] = await db.insert(campaigns).values(campaign).returning();
    return created;
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return c;
  }

  async getCampaigns(filters?: { status?: string }): Promise<Campaign[]> {
    const query = db.select().from(campaigns);
    if (filters?.status) {
      return await query.where(eq(campaigns.status, filters.status)).orderBy(desc(campaigns.createdAt));
    }
    return await query.orderBy(desc(campaigns.createdAt));
  }

  async updateCampaign(id: string, updates: Partial<Campaign>): Promise<Campaign | undefined> {
    const [updated] = await db.update(campaigns).set({ ...updates, updatedAt: new Date() }).where(eq(campaigns.id, id)).returning();
    return updated;
  }

  async deleteCampaign(id: string): Promise<void> {
    // cascade handles creatives + campaign_geofences
    await db.delete(campaigns).where(eq(campaigns.id, id));
  }

  async incrementCampaignStats(id: string, stats: { impressions?: number; clicks?: number; wins?: number; spent?: number }): Promise<void> {
    const sets: Record<string, any> = {};
    if (stats.impressions) sets.totalImpressions = sql`${campaigns.totalImpressions} + ${stats.impressions}`;
    if (stats.clicks) sets.totalClicks = sql`${campaigns.totalClicks} + ${stats.clicks}`;
    if (stats.wins) sets.totalWins = sql`${campaigns.totalWins} + ${stats.wins}`;
    if (stats.spent) sets.totalSpent = sql`${campaigns.totalSpent} + ${stats.spent}`;
    if (Object.keys(sets).length === 0) return;
    sets.updatedAt = new Date();
    await db.update(campaigns).set(sets).where(eq(campaigns.id, id));
  }

  // ── Creatives ──────────────────────────────────────────────────────────

  async createCreative(creative: InsertCreative): Promise<Creative> {
    const [created] = await db.insert(creatives).values(creative).returning();
    return created;
  }

  async getCreative(id: string): Promise<Creative | undefined> {
    const [c] = await db.select().from(creatives).where(eq(creatives.id, id));
    return c;
  }

  async getCreativesByCampaign(campaignId: string): Promise<Creative[]> {
    return await db.select().from(creatives).where(eq(creatives.campaignId, campaignId)).orderBy(desc(creatives.createdAt));
  }

  async updateCreative(id: string, updates: Partial<Creative>): Promise<Creative | undefined> {
    const [updated] = await db.update(creatives).set(updates).where(eq(creatives.id, id)).returning();
    return updated;
  }

  async deleteCreative(id: string): Promise<void> {
    await db.delete(creatives).where(eq(creatives.id, id));
  }

  // ── Campaign-Geofence links ───────────────────────────────────────────

  async linkGeofenceToCampaign(campaignId: string, geofenceId: string): Promise<void> {
    // Insert, ignore if link already exists (unique constraint)
    try {
      await db.insert(campaignGeofences).values({ campaignId, geofenceId });
    } catch {
      // already linked — ignore duplicate key violation
    }
  }

  async unlinkGeofenceFromCampaign(campaignId: string, geofenceId: string): Promise<void> {
    await db.delete(campaignGeofences).where(
      and(eq(campaignGeofences.campaignId, campaignId), eq(campaignGeofences.geofenceId, geofenceId)),
    );
  }

  async getCampaignGeofenceIds(campaignId: string): Promise<string[]> {
    const rows = await db.select({ geofenceId: campaignGeofences.geofenceId })
      .from(campaignGeofences)
      .where(eq(campaignGeofences.campaignId, campaignId));
    return rows.map((r) => r.geofenceId);
  }

  async getActiveCampaignsForGeofence(geofenceId: string): Promise<Campaign[]> {
    // Join campaign_geofences → campaigns, filter active
    const rows = await db.select({
      id: campaigns.id,
      name: campaigns.name,
      description: campaigns.description,
      status: campaigns.status,
      bidPriceCpm: campaigns.bidPriceCpm,
      dailyBudget: campaigns.dailyBudget,
      totalBudget: campaigns.totalBudget,
      totalSpent: campaigns.totalSpent,
      totalImpressions: campaigns.totalImpressions,
      totalClicks: campaigns.totalClicks,
      totalWins: campaigns.totalWins,
      startDate: campaigns.startDate,
      endDate: campaigns.endDate,
      createdAt: campaigns.createdAt,
      updatedAt: campaigns.updatedAt,
    })
      .from(campaignGeofences)
      .innerJoin(campaigns, eq(campaignGeofences.campaignId, campaigns.id))
      .where(and(eq(campaignGeofences.geofenceId, geofenceId), eq(campaigns.status, "active")));
    return rows;
  }

  // ── CSV upload geofences ───────────────────────────────────────────────

  async createGeofencesFromCsv(
    rows: Array<{ name: string; latitude: number; longitude: number; radiusM: number; address?: string; city?: string; state?: string }>,
    campaignId?: string,
    groupName?: string,
  ): Promise<{ created: number; skipped: number }> {
    if (rows.length === 0) return { created: 0, skipped: 0 };

    const toCreate: InsertGeofence[] = rows.map((r) => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      radiusM: r.radiusM,
      address: r.address,
      city: r.city,
      state: r.state,
      source: "csv_upload",
      jobId: groupName || undefined,
    }));

    let created = 0;
    let skipped = 0;
    const createdIds: string[] = [];

    for (const g of toCreate) {
      try {
        const [row] = await db.insert(geofences).values(g).returning({ id: geofences.id });
        createdIds.push(row.id);
        created++;
      } catch {
        skipped++;
      }
    }

    if (campaignId && createdIds.length > 0) {
      for (const gid of createdIds) {
        try {
          await db.insert(campaignGeofences).values({ campaignId, geofenceId: gid });
        } catch {
          // ignore duplicate
        }
      }
    }

    return { created, skipped };
  }
}

export const storage = new DatabaseStorage();
