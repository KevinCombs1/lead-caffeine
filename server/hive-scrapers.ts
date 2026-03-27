import { hiveProxyFetch, isHiveProxyActive, hasHealthyProxy } from "./hive-proxy";

export interface ScraperLocation {
  city: string;
  state: string;
}

export interface ScraperResult {
  name: string; 
  website?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  sourceUrl?: string;
}

export interface ScraperOutput {
  flowers: Array<ScraperResult & { normalizedUrl: string; isFranchise: boolean }>;
  pollen: ScraperResult[];
}

export interface ScraperResponse {
  results: ScraperResult[];
  log: string[];
}

export type ScraperFn = (searchTerms: string[], location: ScraperLocation) => Promise<ScraperResponse>;

let globalStopSignal = false;
export function setStopSignal(val: boolean) { globalStopSignal = val; }
export function isStopRequested(): boolean { return globalStopSignal; }

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
];

const ACCEPT_LANGUAGES = [
  "en-US,en;q=0.9",
  "en-US,en;q=0.9,es;q=0.8",
  "en-US,en;q=0.8",
  "en-GB,en;q=0.9,en-US;q=0.8",
  "en-CA,en;q=0.9,en-US;q=0.8",
  "en-AU,en;q=0.9,en-US;q=0.8",
  "en-US,en;q=0.9,fr;q=0.7",
  "en-US,en;q=0.9,de;q=0.7",
];

const REFERERS = [
  "https://www.google.com/",
  "https://www.google.com/search?q=",
  "https://www.bing.com/",
  "https://www.bing.com/search?q=",
  "https://search.yahoo.com/",
  "",
  "",
  "",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomHeaders(): Record<string, string> {
  const ua = pick(USER_AGENTS);
  const isFirefox = ua.includes("Firefox");
  const headers: Record<string, string> = {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": pick(ACCEPT_LANGUAGES),
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "DNT": Math.random() > 0.5 ? "1" : "0",
  };
  if (!isFirefox) {
    headers["Sec-Fetch-Dest"] = "document";
    headers["Sec-Fetch-Mode"] = "navigate";
    headers["Sec-Fetch-Site"] = pick(["none", "cross-site"]);
    headers["Sec-Fetch-User"] = "?1";
    headers["sec-ch-ua-platform"] = pick(['"Windows"', '"macOS"', '"Linux"']);
    headers["sec-ch-ua-mobile"] = "?0";
  }
  const ref = pick(REFERERS);
  if (ref) headers["Referer"] = ref;
  if (Math.random() > 0.7) headers["Cache-Control"] = "no-cache";
  if (Math.random() > 0.7) headers["Pragma"] = "no-cache";
  return headers;
}

function getRandomUA(): string {
  return pick(USER_AGENTS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function randomDelay(): Promise<void> {
  if (globalStopSignal) return;
  const usingProxy = isHiveProxyActive() && hasHealthyProxy();
  const ms = usingProxy
    ? 6000 + Math.random() * 6000
    : 15400 + Math.random() * 8800;
  const chunks = Math.ceil(ms / 1000);
  for (let i = 0; i < chunks; i++) {
    if (globalStopSignal) return;
    await sleep(Math.min(1000, ms - i * 1000));
  }
}

export function normalizeUrl(url: string): string {
  try {
    let u = url.trim().toLowerCase();
    if (!u.startsWith("http://") && !u.startsWith("https://")) {
      u = "https://" + u;
    }
    const parsed = new URL(u);
    let hostname = parsed.hostname.replace(/^www\./, "");
    let pathname = parsed.pathname.replace(/\/+$/, "");
    return `https://${hostname}${pathname}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function getDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : "https://" + url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isDotCom(url: string): boolean {
  const domain = getDomain(url);
  return domain.endsWith(".com");
}

const COMMERCIAL_TLDS = [
  ".com", ".co", ".biz", ".io", ".net", ".info", ".shop", ".store", ".online", ".tech", ".app",
  ".co.uk", ".com.au", ".co.jp", ".com.cn", ".co.za", ".com.br", ".com.mx", ".co.in", ".com.sg",
  ".com.hk", ".co.kr", ".com.tw", ".com.my", ".co.nz", ".com.ar", ".com.co", ".com.pe", ".co.il",
  ".com.tr", ".com.eg", ".co.ke", ".com.ng", ".co.th", ".com.ph", ".com.vn", ".com.pk",
  ".de", ".fr", ".it", ".es", ".nl", ".be", ".at", ".ch", ".se", ".dk", ".no", ".fi",
  ".pl", ".cz", ".pt", ".ro", ".hu", ".gr", ".ie", ".ru", ".ua",
  ".jp", ".cn", ".kr", ".tw", ".in", ".sg", ".hk", ".th", ".id", ".my", ".ph", ".vn",
  ".au", ".nz", ".za", ".ae", ".sa", ".qa", ".eg", ".ke", ".ng", ".gh", ".tz", ".ma",
  ".br", ".mx", ".ar", ".cl", ".co", ".pe", ".pa", ".cr",
  ".uk", ".eu", ".asia",
  ".agency", ".law", ".legal", ".consulting", ".group", ".global", ".pro", ".ltd", ".inc",
  ".gmbh", ".company", ".business", ".enterprises", ".solutions", ".services", ".systems",
  ".works", ".studio", ".design", ".digital", ".media", ".marketing", ".expert", ".coach",
  ".tax", ".accountant", ".insurance", ".clinic", ".dental", ".health", ".engineering",
  ".construction", ".energy", ".solar", ".realty", ".properties", ".ventures", ".capital",
  ".finance", ".fund", ".trading", ".supply", ".logistics", ".travel", ".restaurant",
  ".cafe", ".pub", ".bar", ".salon", ".fitness",
];

function isCommercialDomain(url: string): boolean {
  const domain = getDomain(url);
  if (!domain) return false;
  return COMMERCIAL_TLDS.some(tld => domain.endsWith(tld));
}

function isExcludedDomain(url: string): boolean {
  const domain = getDomain(url);
  return domain.endsWith(".gov") || domain.endsWith(".org") || domain.endsWith(".edu");
}

const DIRECTORY_PLACEHOLDER_DOMAINS = [
  "localsearch.com",
  "yellowpages.com",
  "superpages.com",
  "hotfrog.com",
  "ezlocal.com",
  "n49.com",
  "kompass.com",
  "europages.co.uk",
  "europages.com",
  "yell.com",
  "cylex-usa.com",
  "cylex.co.uk",
  "cylex.de",
  "cylex.fr",
  "cylex.it",
  "cylex.es",
  "tradekey.com",
  "exporthub.com",
  "go4worldbusiness.com",
  "tradeford.com",
];

export function isDirectoryPlaceholder(url: string): boolean {
  const domain = getDomain(url);
  if (!domain) return false;
  return DIRECTORY_PLACEHOLDER_DOMAINS.some(
    (placeholder) => domain === placeholder || domain.endsWith("." + placeholder)
  );
}

const FRANCHISE_LOCATOR_DOMAINS = [
  "locations.theupsstore.com",
  "local.fedex.com",
  "stores.staples.com",
  "locations.officedepot.com",
  "locations.subway.com",
  "locations.jiffylube.com",
  "local.walgreens.com",
  "locations.cvs.com",
  "stores.target.com",
  "locations.homedepot.com",
  "stores.lowes.com",
  "locations.panerabread.com",
  "locations.dunkindonuts.com",
  "locations.tacobell.com",
  "locations.pizzahut.com",
  "locations.wendys.com",
  "locations.bk.com",
  "locations.chick-fil-a.com",
  "locations.dominos.com",
  "locations.papajohns.com",
  "locations.sonic.com",
  "locations.jackinthebox.com",
  "locations.arbys.com",
  "locations.popeyes.com",
  "locations.kfc.com",
  "locations.dairyqueen.com",
  "locations.petsmart.com",
  "locations.petco.com",
  "locations.autozone.com",
  "locations.oreillyauto.com",
  "locations.advanceautoparts.com",
  "locations.napaonline.com",
  "locations.hrblock.com",
  "locations.massageenvy.com",
  "locations.greatclips.com",
  "locations.sportclips.com",
  "locations.supercuts.com",
  "locations.anytimefitness.com",
  "locations.planetfitness.com",
  "locations.orangetheory.com",
  "locations.crunchfitness.com",
  "local.acehandyman.com",
  "locations.servpro.com",
  "locations.terminix.com",
  "local.safeway.com",
  "stores.luckybrand.com",
  "stores.champssports.com",
  "stores.bestbuy.com",
  "locations.ajg.com",
  "locations.postnet.com",
  "locations.fascards.com",
  "local.goodwill.org",
  "stores.footlocker.com",
  "stores.gap.com",
  "stores.oldnavy.com",
  "stores.bananarepublic.com",
  "locations.mathnasium.com",
  "locations.kumon.com",
  "locations.starbucks.com",
  "locations.mcdonalds.com",
  "dhl.com",
  "maersk.com",
  "kuehne-nagel.com",
  "dbschenker.com",
  "agility.com",
  "expeditors.com",
  "nipponexpress.com",
  "hsbc.com",
  "standardchartered.com",
  "deutschebank.com",
  "bnpparibas.com",
  "societegenerale.com",
  "barclays.com",
  "unicreditgroup.eu",
];

const FRANCHISE_LOCATOR_PATH_PATTERNS: { domain: string; pathPrefix: string }[] = [
  { domain: "officedepot.com", pathPrefix: "/storelocator" },
  { domain: "walmart.com", pathPrefix: "/store/" },
  { domain: "bestbuy.com", pathPrefix: "/site/store-locator" },
  { domain: "gamestop.com", pathPrefix: "/store/" },
];

export function isFranchiseLocator(url: string): boolean {
  const domain = getDomain(url);
  if (!domain) return false;
  if (FRANCHISE_LOCATOR_DOMAINS.some(
    (loc) => domain === loc || domain.endsWith("." + loc)
  )) return true;
  try {
    const parsed = new URL(url.startsWith("http") ? url : "https://" + url);
    const pathLower = parsed.pathname.toLowerCase();
    return FRANCHISE_LOCATOR_PATH_PATTERNS.some(
      (p) => (domain === p.domain || domain.endsWith("." + p.domain)) && pathLower.startsWith(p.pathPrefix)
    );
  } catch {
    return false;
  }
}

const PARKED_DOMAIN_INDICATORS = [
  "godaddy.com",
  "godaddysites.com",
  "sedoparking.com",
  "sedo.com",
  "afternic.com",
  "hugedomains.com",
  "dan.com",
  "parkingcrew.net",
  "parkingcrew.com",
  "bodis.com",
  "above.com",
  "undeveloped.com",
  "domainnameshop.com",
  "namecheap.com",
  "register.com",
  "networksolutions.com",
  "domains.google",
  "domainmarket.com",
  "buydomains.com",
  "domainlore.com",
  "brandbucket.com",
  "squadhelp.com",
  "domainagents.com",
  "porkbun.com",
  "namesilo.com",
  "dynadot.com",
  "name.com",
  "epik.com",
  "hover.com",
  "1and1.com",
  "ionos.com",
  "hostgator.com",
  "bluehost.com",
  "dreamhost.com",
  "wix.com",
  "weebly.com",
  "squarespace.com",
  "wordpress.com",
  "parklogic.com",
  "domainnamesales.com",
];

export function isParkedDomain(url: string): boolean {
  const domain = getDomain(url);
  if (!domain) return false;
  return PARKED_DOMAIN_INDICATORS.some(
    (parked) => domain === parked || domain.endsWith("." + parked)
  );
}

const GOV_NONPROFIT_SUBSTRING_KEYWORDS = [
  "government", "federal", "nonprofit", "non-profit",
  "church", "ministry", "temple", "mosque", "synagogue", "university",
];

const GOV_NONPROFIT_PHRASE_KEYWORDS = [
  "state of", "county of", "bureau", "secretary",
  "office of", "department of", "board of",
  "city of", "town of", "township", "municipal",
];

const GOV_NONPROFIT_WORD_BOUNDARY_KEYWORDS = [
  "public", "foundation", "association", "society", "institute",
  "college", "school", "district", "branch", "authority", "commission", "county",
];

const FILLER_WORDS = new Set(["the", "a", "an", "of", "for", "and", "in", "at", "by", "to"]);

function countMatchedBoundaryKeywords(lower: string): string[] {
  const matched: string[] = [];
  for (const kw of GOV_NONPROFIT_WORD_BOUNDARY_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(lower)) matched.push(kw);
  }
  return matched;
}

function isGovNonprofit(name: string): boolean {
  const lower = name.toLowerCase();
  if (GOV_NONPROFIT_SUBSTRING_KEYWORDS.some((kw) => lower.includes(kw))) {
    return true;
  }
  if (GOV_NONPROFIT_PHRASE_KEYWORDS.some((kw) => lower.includes(kw))) {
    return true;
  }
  const matchedKeywords = countMatchedBoundaryKeywords(lower);
  if (matchedKeywords.length === 0) return false;

  const GOV_COMBO_KEYWORDS = new Set(["school", "district", "county", "public", "authority", "commission", "branch"]);
  const matchedGovCombos = matchedKeywords.filter(kw => GOV_COMBO_KEYWORDS.has(kw));
  if (matchedGovCombos.length >= 2) return true;

  for (const kw of matchedKeywords) {
    const words = lower.split(/\s+/);
    const kwWords = kw.split(/\s+/);
    const nonKeywordWords = words.filter(w => !kwWords.includes(w) && !FILLER_WORDS.has(w));
    if (nonKeywordWords.length === 0) return true;

    const contextTerms = ["city", "state", "county", "town", "municipal", "federal", "government", "board", "department", "office"]
      .filter(c => c !== kw);
    const contextPattern = new RegExp(`\\b(${contextTerms.join("|")})\\b`, "i");
    if (contextPattern.test(lower)) return true;

    if (kw === "school" && !/(repair|auto|driving school|school of rock|school of|old school)/i.test(lower)) {
      if (/\b(elementary|middle|high|primary|secondary|charter|preparatory|prep)\b/i.test(lower)) return true;
    }
    if (kw === "foundation" && /(charitable|nonprofit|non-profit|charity|relief|humanitarian|red cross|salvation|united way|habitat|goodwill)/i.test(lower)) return true;
    if (kw === "commission" && /\b(planning|zoning|regulatory)\b/i.test(lower)) return true;
    if (kw === "authority" && /\b(housing|transit|port|water|power|regional)\b/i.test(lower)) return true;
  }

  return false;
}

const FRANCHISE_BRANDS = [
  "McDonald's", "Subway", "Starbucks", "Chick-fil-A", "Taco Bell", "Burger King",
  "Wendy's", "Dunkin", "Domino's", "Pizza Hut", "Papa John's", "KFC", "Popeyes",
  "Sonic Drive-In", "Arby's", "Jack in the Box", "Dairy Queen", "Little Caesars",
  "Panda Express", "Chipotle", "Five Guys", "Wingstop", "Jersey Mike's", "Jimmy John's",
  "Firehouse Subs", "Culver's", "Raising Cane's", "Zaxby's", "Whataburger", "In-N-Out",
  "Panera Bread", "Noodles & Company", "McAlister's Deli", "Qdoba", "Moe's Southwest",
  "El Pollo Loco", "Church's Chicken", "Bojangles", "Krystal", "Checkers", "Rally's",
  "Hardee's", "Carl's Jr", "Del Taco", "Tropical Smoothie", "Smoothie King", "Jamba",
  "Baskin-Robbins", "Cold Stone Creamery", "TCBY", "Auntie Anne's", "Cinnabon",
  "Great American Cookies", "Krispy Kreme", "Tim Hortons", "Caribou Coffee",
  "The Coffee Bean", "Peet's Coffee", "Dutch Bros", "Scooter's Coffee",
  "7-Eleven", "Circle K", "Wawa", "Sheetz", "QuikTrip", "RaceTrac", "Pilot",
  "Love's Travel", "Casey's General", "Kum & Go", "Speedway",
  "Walmart", "Target", "Costco", "Sam's Club", "BJ's Wholesale", "Dollar General",
  "Dollar Tree", "Family Dollar", "Five Below", "Big Lots", "Ross", "TJ Maxx",
  "Marshalls", "Burlington", "HomeGoods", "Nordstrom Rack", "Saks Off 5th",
  "CVS", "Walgreens", "Rite Aid", "GNC", "Vitamin Shoppe",
  "Home Depot", "Lowe's", "Menards", "Ace Hardware", "True Value", "Harbor Freight",
  "AutoZone", "O'Reilly Auto Parts", "Advance Auto Parts", "NAPA Auto Parts",
  "Pep Boys", "Jiffy Lube", "Valvoline", "Midas", "Maaco", "Meineke", "Firestone",
  "Goodyear", "Discount Tire", "Big O Tires", "Tire Kingdom", "NTB",
  "Enterprise", "Hertz", "Avis", "Budget", "National", "Alamo",
  "UPS Store", "FedEx Office", "PostNet", "Pak Mail", "iPostal1",
  "H&R Block", "Jackson Hewitt", "Liberty Tax", "TurboTax",
  "State Farm", "Allstate", "Farmers Insurance", "GEICO", "Progressive",
  "Nationwide", "American Family", "Shelter Insurance", "Erie Insurance",
  "RE/MAX", "Keller Williams", "Coldwell Banker", "Century 21", "ERA",
  "Berkshire Hathaway HomeServices", "Sotheby's", "Better Homes and Gardens Real Estate",
  "Weichert", "eXp Realty", "HomeSmart", "EXIT Realty",
  "Planet Fitness", "Anytime Fitness", "Gold's Gym", "LA Fitness", "24 Hour Fitness",
  "Orangetheory", "F45 Training", "CrossFit", "Snap Fitness", "Crunch Fitness",
  "Curves", "Jazzercise", "Club Pilates", "Pure Barre", "CycleBar", "StretchLab",
  "Massage Envy", "Hand & Stone", "Elements Massage", "European Wax Center",
  "Great Clips", "Supercuts", "Sport Clips", "Cost Cutters", "Fantastic Sams",
  "SmartStyle", "Hair Cuttery", "Floyd's 99 Barbershop",
  "Kumon", "Mathnasium", "Sylvan Learning", "Huntington Learning", "Tutor Doctor",
  "Goddard School", "Primrose Schools", "KinderCare", "Kiddie Academy",
  "Bright Horizons", "The Learning Experience", "Lightbridge Academy",
  "Servpro", "ServiceMaster", "Chem-Dry", "Stanley Steemer", "Jan-Pro",
  "Jani-King", "Coverall", "Stratus Building Solutions", "Vanguard Cleaning",
  "Molly Maid", "Merry Maids", "The Cleaning Authority", "MaidPro", "Two Maids",
  "Mr. Handyman", "Handyman Connection", "Ace Handyman Services",
  "Benjamin Moore", "Sherwin-Williams", "CertaPro Painters",
  "Mr. Rooter", "Roto-Rooter", "Benjamin Franklin Plumbing", "ARS/Rescue Rooter",
  "One Hour Heating", "Aire Serv", "Mr. Electric", "Mister Sparky",
  "Terminix", "Orkin", "Truly Nolen", "ABC Home & Commercial",
  "Lawn Doctor", "Weed Man", "TruGreen", "U.S. Lawns", "Grounds Guys",
  "Mosquito Joe", "Mosquito Squad",
  "Budget Blinds", "Gotcha Covered", "Made in the Shade",
  "Window World", "Renewal by Andersen", "Bath Fitter", "Re-Bath",
  "PuroClean", "Rainbow International", "Paul Davis", "Belfor",
  "Sport Clips", "Nothing Bundt Cakes", "Insomnia Cookies", "Crumbl Cookies",
  "Batteries Plus", "uBreakiFix", "CPR Cell Phone Repair",
  "Minuteman Press", "AlphaGraphics", "PostNet", "FASTSIGNS", "Sign-A-Rama",
  "Snap-on Tools", "Matco Tools", "Mac Tools",
  "Ace Handyman", "Glass Doctor", "Dryer Vent Wizard",
  "Pop-A-Lock", "The Flying Locksmiths",
  "Taco Cabana", "Long John Silver's", "Captain D's", "White Castle",
  "Waffle House", "IHOP", "Denny's", "Cracker Barrel", "Bob Evans",
  "Applebee's", "Chili's", "TGI Fridays", "Olive Garden", "Red Lobster",
  "Outback Steakhouse", "LongHorn Steakhouse", "Texas Roadhouse",
  "Ruth's Chris", "The Capital Grille", "Morton's", "Fleming's",
  "Buffalo Wild Wings", "Hooters", "Twin Peaks",
  "Marco's Pizza", "Hungry Howie's", "Round Table Pizza", "Donatos",
  "Wienerschnitzel", "Hot Dog on a Stick", "Auntie Anne's",
  "Kumon", "Code Ninjas", "Engineering For Kids",
  "Comfort Inn", "Holiday Inn", "Hampton Inn", "Hilton", "Marriott",
  "Best Western", "Quality Inn", "Super 8", "Motel 6", "La Quinta",
  "Days Inn", "Ramada", "Wyndham", "Hyatt", "Radisson", "IHG",
  "Choice Hotels", "Extended Stay", "WoodSpring Suites", "Red Roof Inn",
  "Great Harvest Bread", "Atlanta Bread Company",
  "Edible Arrangements", "FTD", "1-800-Flowers", "ProFlowers",
  "Jackson Hewitt", "Padgett Business Services",
  "Express Employment", "Robert Half", "Adecco", "Randstad", "Kelly Services",
  "Manpower", "Spherion", "Staffmark", "Aerotek", "Insight Global",
  "Snap Fitness", "Retro Fitness", "EOS Fitness", "Blink Fitness",
  "The Joint Chiropractic", "HealthMarket", "Senior Helpers", "BrightSpring",
  "Right at Home", "Home Instead", "Visiting Angels", "Comfort Keepers",
  "BrightStar Care", "Always Best Care", "Interim HealthCare", "Amedisys",
  "AAMCO", "Precision Tune", "Christian Brothers Automotive",
  "Take 5 Oil Change", "Express Oil Change", "Grease Monkey",
  "Batteries Plus Bulbs", "Caliber Collision", "Service King",
  "Camping World", "General RV", "Lazydays RV",
  "Aaron's", "Rent-A-Center", "CORT Furniture",
  "1-800-GOT-JUNK", "College Hunks", "Junk King", "Bin There Dump That",
  "Two Men and a Truck", "U-Pack", "PODS", "U-Haul", "Penske",
  "Mathnasium", "Club Z", "Varsity Tutors",
  "School of Rock", "Bach to Rock", "Music & Arts",
  "Little Gym", "My Gym", "Gymboree",
  "Soccer Shots", "i9 Sports", "Amazing Athletes",
  "Pet Supplies Plus", "PetSmart", "Petco", "Pet Valu",
  "Camp Bow Wow", "Dogtopia", "Wag N' Wash",
  "Wild Birds Unlimited", "Petland",
  "GameStop", "Best Buy", "Staples", "Office Depot",
  "Pawn America", "EZCorp", "FirstCash",
  "Title Max", "Check Into Cash", "Advance America", "Check 'n Go",
  "Supercuts", "Floyd's 99", "Birds Barbershop",
  "Palm Beach Tan", "Sun Tan City",
  "The UPS Store", "FedEx Office", "Staples",
  "Signarama", "Image360",
  "Wetzel's Pretzels", "Charleys Philly Steaks", "Charleys Cheesesteaks",
  "Potbelly", "Schlotzsky's", "Jason's Deli", "Which Wich",
  "Penn Station East Coast Subs", "Capriotti's",
  "Smoothie King", "Tropical Smoothie Cafe",
  "Cold Stone", "Marble Slab", "Haagen-Dazs", "Ben & Jerry's",
  "Yogurtland", "Menchie's", "sweetFrog", "Orange Leaf",
  "Sola Salon Studios", "Phenix Salon Suites", "Salon Lofts",
  "Waxing the City", "Deka Lash", "Amazing Lash Studio",
  "Pearle Vision", "LensCrafters", "Visionworks", "MyEyeDr",
  "Aspen Dental", "Heartland Dental", "Pacific Dental",
  "Brightway Insurance", "Goosehead Insurance",
  "Kforce", "TEKsystems", "Hays", "Michael Page", "Modis",
  "PrideStaff", "Snelling", "AppleOne", "Volt",
  "Jackson Hewitt", "Community Tax",
  "DHL", "Maersk", "Kuehne+Nagel", "DB Schenker", "Agility Logistics",
  "Expeditors International", "Nippon Express", "HSBC", "Standard Chartered",
  "Deutsche Bank", "BNP Paribas", "Societe Generale", "Barclays",
  "UniCredit", "UBS", "Credit Suisse", "Santander", "ING",
  "ABN AMRO", "Rabobank", "Commerzbank", "Nordea",
  "Deloitte", "PricewaterhouseCoopers", "PwC", "Ernst & Young", "EY", "KPMG",
  "Accenture", "McKinsey", "Boston Consulting", "BCG", "Bain & Company",
  "TNT Express", "FedEx", "UPS", "Aramex", "SF Express",
];

const SHORT_BRAND_MAX_LENGTH = 3;

const FRANCHISE_BRANDS_MATCHERS = FRANCHISE_BRANDS.map((brand) => {
  const lower = brand.toLowerCase();
  const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (lower.length <= SHORT_BRAND_MAX_LENGTH) {
    return { lower, regex: null, isShort: true };
  }
  const regex = new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, "i");
  return { lower, regex, isShort: false };
});

const FRANCHISE_PATTERN = /(.+?)[\s]*[#\-–—]\s*\d+/i;

const FRANCHISE_EXTRA_WORDS = new Set([
  "store", "stores", "location", "center", "outlet", "plaza", "square",
  "shop", "inc", "llc", "ltd", "corp", "co", "supply", "supplies",
  "plus", "express", "super", "hub", "depot", "zone", "mart", "world",
  "land", "pro", "the", "a", "an", "of", "and", "&", "at", "no", "on",
  "restaurant", "cafe", "grill", "bar", "lounge", "inn", "hotel",
  "pharmacy", "clinic", "dental", "optical", "auto", "tire", "tires",
  "north", "south", "east", "west", "downtown", "uptown", "midtown",
  "main", "street", "st", "ave", "avenue", "blvd", "boulevard", "rd",
  "road", "drive", "dr", "lane", "ln", "way", "place", "ct", "court",
  "parkway", "pkwy", "highway", "hwy", "suite", "ste", "unit", "floor",
]);

function detectFranchise(name: string): boolean {
  const lower = name.toLowerCase().trim();
  for (const matcher of FRANCHISE_BRANDS_MATCHERS) {
    if (matcher.isShort) {
      if (lower === matcher.lower) return true;
      continue;
    }
    if (matcher.regex && matcher.regex.test(lower)) {
      if (lower === matcher.lower) return true;
      const remaining = lower.replace(matcher.regex, "").trim();
      if (remaining.length === 0) return true;
      const extraWords = remaining.split(/\s+/).filter(w => w.length > 0);
      if (extraWords.every(w => FRANCHISE_EXTRA_WORDS.has(w) || /^#?\d+$/.test(w))) {
        return true;
      }
    }
  }
  if (FRANCHISE_PATTERN.test(name)) {
    return true;
  }
  return false;
}

const CATEGORY_RELEVANCE_KEYWORDS: Record<string, string[]> = {
  "Veteran Service Organization": [
    "veteran", "veterans", "vfw", "american legion", "dav", "amvets",
    "marine corps league", "military", "purple heart", "fleet reserve",
    "jewish war veterans", "catholic war veterans", "paralyzed veterans",
    "blinded veterans", "wounded warrior", "vietnam veterans",
    "foreign wars", "legion post", "vfw post", "amvets post",
    "disabled american", "armed forces", "service officer",
    "gold star", "blue star", "silver star",
    "combat veterans", "war veterans", "mil vet",
  ],
};

function isCategoryRelevant(name: string, category: string): boolean {
  const keywords = CATEGORY_RELEVANCE_KEYWORDS[category];
  if (!keywords) return true;
  const lower = name.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function classifyResults(
  results: ScraperResult[],
  category: string
): ScraperOutput {
  const flowers: ScraperOutput["flowers"] = [];
  const pollen: ScraperResult[] = [];

  for (const result of results) {
    if (!result.name || result.name.trim().length === 0) continue;

    if (isGovNonprofit(result.name)) continue;

    const isFranchise = detectFranchise(result.name);
    if (isFranchise) {
      pollen.push({ ...result, website: undefined });
      continue;
    }

    if (!isCategoryRelevant(result.name, category)) {
      continue;
    }

    if (result.website && isDirectoryPlaceholder(result.website)) {
      pollen.push({ ...result, website: undefined });
      continue;
    }

    if (result.website && isFranchiseLocator(result.website)) {
      pollen.push({ ...result, website: undefined });
      continue;
    }

    if (result.website && isParkedDomain(result.website)) {
      pollen.push({ ...result, website: undefined });
      continue;
    }

    if (!result.website) {
      pollen.push({ ...result, city: result.city, state: result.state });
      continue;
    }

    if (isExcludedDomain(result.website)) {
      pollen.push({ ...result, website: undefined });
      continue;
    }

    if (!isCommercialDomain(result.website)) {
      pollen.push(result);
      continue;
    }

    const normalizedUrl = normalizeUrl(result.website);

    flowers.push({
      ...result,
      normalizedUrl,
      isFranchise: false,
    });
  }

  return { flowers, pollen };
}

export interface FetchPageMeta {
  html: string;
  status: number;
  headers: Record<string, string>;
  bodyLength: number;
  redirected: boolean;
}

interface FetchPageMetaExtended extends FetchPageMeta {
  proxyRoute: string;
}

class FetchError extends Error {
  meta: Partial<FetchPageMetaExtended>;
  constructor(message: string, meta: Partial<FetchPageMetaExtended>) {
    super(message);
    this.name = "FetchError";
    this.meta = meta;
  }
}

async function doFetch(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<{ response: Response; proxyRoute: string }> {
  if (isHiveProxyActive()) {
    const result = await hiveProxyFetch(url, { headers, signal, redirect: "follow" });
    return { response: result.response, proxyRoute: result.routeLabel };
  }
  const response = await fetch(url, { headers, signal, redirect: "follow" });
  return { response, proxyRoute: "direct" };
}

async function fetchPageWithMeta(url: string): Promise<FetchPageMetaExtended> {
  if (globalStopSignal) throw new Error("Stop signal received");
  const RETRYABLE = new Set([403, 429, 503]);

  for (let attempt = 0; attempt < 2; attempt++) {
    if (globalStopSignal) throw new Error("Stop signal received");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const { response, proxyRoute } = await doFetch(url, getRandomHeaders(), controller.signal);

      const respHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => { respHeaders[k] = v; });

      if (!response.ok) {
        if (attempt === 0 && RETRYABLE.has(response.status)) {
          clearTimeout(timeout);
          if (globalStopSignal) throw new Error("Stop signal received");
          const backoff = 10000 + Math.random() * 5000;
          const chunks = Math.ceil(backoff / 1000);
          for (let c = 0; c < chunks; c++) {
            if (globalStopSignal) throw new Error("Stop signal received");
            await sleep(Math.min(1000, backoff - c * 1000));
          }
          continue;
        }
        let errBodyLen = 0;
        try { errBodyLen = (await response.text()).length; } catch {}
        const server = respHeaders["server"] || "unknown";
        const errMeta: Partial<FetchPageMetaExtended> = { status: response.status, headers: respHeaders, bodyLength: errBodyLen, redirected: response.redirected, proxyRoute };
        if (response.status === 403 || response.status === 429) {
          throw new FetchError(`HTTP ${response.status} — Access blocked (${errBodyLen} bytes, server: ${server})`, errMeta);
        } else if (response.status === 404) {
          throw new FetchError(`HTTP 404 — Page not found (${errBodyLen} bytes, server: ${server})`, errMeta);
        } else if (response.status >= 300 && response.status < 400) {
          throw new FetchError(`HTTP ${response.status} — Redirect (location: ${respHeaders["location"] || "?"}, ${errBodyLen} bytes)`, errMeta);
        }
        throw new FetchError(`HTTP ${response.status}: ${response.statusText} (${errBodyLen} bytes, server: ${server})`, errMeta);
      }

      const html = await response.text();
      const bodyLength = html.length;

      if (bodyLength === 0) {
        throw new FetchError("Empty response body — site may require JavaScript rendering", { status: response.status, headers: respHeaders, bodyLength: 0, redirected: response.redirected, proxyRoute });
      }
      if (bodyLength < 500) {
        throw new FetchError(`Minimal response (${bodyLength} chars) — may be a block page or CAPTCHA`, { status: response.status, headers: respHeaders, bodyLength, redirected: response.redirected, proxyRoute });
      }

      return {
        html,
        status: response.status,
        headers: respHeaders,
        bodyLength,
        redirected: response.redirected,
        proxyRoute,
      };
    } catch (err: any) {
      if (err?.name === "AbortError" || err?.message?.includes("abort")) {
        if (attempt === 0) {
          clearTimeout(timeout);
          if (globalStopSignal) throw new Error("Stop signal received");
          for (let c = 0; c < 5; c++) {
            if (globalStopSignal) throw new Error("Stop signal received");
            await sleep(1000);
          }
          continue;
        }
        throw new FetchError(`Request timed out after 30s — site too slow or blocking`, { status: 0, headers: {}, bodyLength: 0, redirected: false, proxyRoute: "unknown" });
      }
      if (err instanceof FetchError) throw err;
      const netMeta: Partial<FetchPageMetaExtended> = { status: 0, headers: {}, bodyLength: 0, redirected: false, proxyRoute: "unknown" };
      if (err?.code === "ENOTFOUND" || err?.message?.includes("ENOTFOUND")) {
        throw new FetchError(`DNS failure — domain not found: ${err.message}`, netMeta);
      }
      if (err?.code === "ECONNREFUSED" || err?.message?.includes("ECONNREFUSED")) {
        throw new FetchError(`Network error: connection refused — ${url}`, netMeta);
      }
      if (err?.code === "ECONNRESET" || err?.message?.includes("ECONNRESET")) {
        throw new FetchError(`Network error: connection reset — ${url}`, netMeta);
      }
      if (err?.code === "ERR_TLS" || err?.message?.includes("certificate") || err?.message?.includes("SSL")) {
        throw new FetchError(`Network error: TLS/SSL failure — ${url}`, netMeta);
      }
      if (err?.message?.includes("redirect") && err?.message?.includes("loop")) {
        throw new FetchError(`Redirect loop detected — ${url}`, netMeta);
      }
      if (err?.code?.startsWith?.("E") && !err?.message?.includes("HTTP")) {
        throw new FetchError(`Network error: ${err.code} — ${err.message}`, netMeta);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("fetchPage: max retries reached");
}

let _testMetaCollector: FetchPageMetaExtended[] | null = null;

async function fetchPage(url: string, log?: string[]): Promise<string> {
  try {
    const meta = await fetchPageWithMeta(url);
    if (_testMetaCollector) _testMetaCollector.push(meta);
    if (log) {
      const routePrefix = meta.proxyRoute !== "direct" ? `${meta.proxyRoute}: ` : isHiveProxyActive() ? "direct: " : "";
      log.push(`[fetch] ${routePrefix}${url} → ${meta.status} | ${meta.bodyLength} bytes | server: ${meta.headers["server"] || "n/a"}${meta.redirected ? " | redirected" : ""}`);
    }
    return meta.html;
  } catch (err: any) {
    if (err instanceof FetchError && err.meta) {
      if (_testMetaCollector) _testMetaCollector.push({
        html: err.meta.html || "",
        status: err.meta.status || 0,
        headers: err.meta.headers || {},
        bodyLength: err.meta.bodyLength || 0,
        redirected: err.meta.redirected || false,
        proxyRoute: err.meta.proxyRoute || "unknown",
      });
      if (log) {
        const errRoutePrefix = err.meta.proxyRoute && err.meta.proxyRoute !== "direct" && err.meta.proxyRoute !== "unknown" ? `${err.meta.proxyRoute}: ` : "";
        log.push(`[fetch] ${errRoutePrefix}${url} → ${err.meta.status || "ERR"} | ${err.meta.bodyLength || 0} bytes | ${err.message}`);
      }
    } else if (log) {
      log.push(`[fetch] ${url} → ERR | ${err.message || err}`);
    }
    throw err;
  }
}

export interface TestScraperResult {
  scraperKey: string;
  url: string;
  httpStatus: number;
  bodyLength: number;
  redirected: boolean;
  headers: Record<string, string>;
  totalResults: number;
  withName: number;
  withPhone: number;
  withWebsite: number;
  withAddress: number;
  results: ScraperResult[];
  sample: ScraperResult[];
  log: string[];
  proxyUsed: string;
  error?: string;
}

export async function testScraper(
  scraperKey: string,
  searchTerm: string,
  city: string,
  state: string
): Promise<TestScraperResult> {
  const key = scraperKey.toLowerCase();
  const scraper = SCRAPERS[key];
  if (!scraper) {
    return {
      scraperKey,
      url: "",
      httpStatus: 0,
      bodyLength: 0,
      redirected: false,
      headers: {},
      totalResults: 0,
      withName: 0,
      withPhone: 0,
      withWebsite: 0,
      withAddress: 0,
      results: [],
      sample: [],
      log: [`Unknown scraper key: ${scraperKey}`],
      proxyUsed: "none",
      error: `Unknown scraper key: ${scraperKey}`,
    };
  }

  const location: ScraperLocation = { city, state };
  const oldStop = globalStopSignal;
  globalStopSignal = false;
  const collected: FetchPageMetaExtended[] = [];
  _testMetaCollector = collected;

  try {
    const response = await scraper([searchTerm], location);
    globalStopSignal = oldStop;
    _testMetaCollector = null;

    const results = response.results;
    const firstMeta = collected[0];
    let fetchedUrl = results[0]?.sourceUrl || "";
    if (!fetchedUrl) {
      const fetchLine = response.log.find(l => l.startsWith("[fetch] "));
      if (fetchLine) {
        const urlMatch = fetchLine.match(/\[fetch\] (?:[^:]+: )?(https?:\/\/\S+)/);
        if (urlMatch) fetchedUrl = urlMatch[1].split(" ")[0];
      }
    }
    const proxyUsed = firstMeta?.proxyRoute || "direct";
    return {
      scraperKey,
      url: fetchedUrl,
      httpStatus: firstMeta?.status || (results.length > 0 ? 200 : 0),
      bodyLength: firstMeta?.bodyLength || 0,
      redirected: firstMeta?.redirected || false,
      headers: firstMeta?.headers || {},
      totalResults: results.length,
      withName: results.filter(r => r.name && r.name.length > 0).length,
      withPhone: results.filter(r => r.phone).length,
      withWebsite: results.filter(r => r.website).length,
      withAddress: results.filter(r => r.address).length,
      results,
      sample: results.slice(0, 3),
      log: response.log,
      proxyUsed,
    };
  } catch (err: any) {
    globalStopSignal = oldStop;
    _testMetaCollector = null;
    const fetchErr = err instanceof FetchError ? err.meta : null;
    const firstMeta = collected[0] || fetchErr;
    return {
      scraperKey,
      url: "",
      httpStatus: firstMeta?.status || 0,
      bodyLength: firstMeta?.bodyLength || 0,
      redirected: firstMeta?.redirected || false,
      headers: firstMeta?.headers || {},
      totalResults: 0,
      withName: 0,
      withPhone: 0,
      withWebsite: 0,
      withAddress: 0,
      results: [],
      sample: [],
      log: [`Test failed: ${err.message || err}`],
      proxyUsed: firstMeta?.proxyRoute || "none",
      error: err.message || String(err),
    };
  }
}

function extractText(html: string, startMarker: string, endMarker: string): string {
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return "";
  const contentStart = startIdx + startMarker.length;
  const endIdx = html.indexOf(endMarker, contentStart);
  if (endIdx === -1) return "";
  return html.substring(contentStart, endIdx).trim();
}

function extractAllBetween(html: string, startMarker: string, endMarker: string): string[] {
  const results: string[] = [];
  let pos = 0;
  while (pos < html.length) {
    const startIdx = html.indexOf(startMarker, pos);
    if (startIdx === -1) break;
    const contentStart = startIdx + startMarker.length;
    const endIdx = html.indexOf(endMarker, contentStart);
    if (endIdx === -1) break;
    results.push(html.substring(contentStart, endIdx));
    pos = endIdx + endMarker.length;
  }
  return results;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function extractPhone(text: string): string | undefined {
  const intlMatch = text.match(/\+?\d{1,4}[\s.-]?\(?\d{1,5}\)?[\s.-]?\d{2,5}[\s.-]?\d{2,5}[\s.-]?\d{0,5}/);
  if (intlMatch && intlMatch[0].replace(/\D/g, "").length >= 7) return intlMatch[0].trim();
  const usMatch = text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  return usMatch ? usMatch[0] : undefined;
}


function extractHref(tag: string): string {
  const match = tag.match(/href=["']([^"']+)["']/i);
  return match ? match[1] : "";
}

export async function scrapeYellowPages(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];
  const locationStr = `${location.city}, ${location.state}`;

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`Searching "${term}" in ${locationStr}...`);
    const encodedTerm = encodeURIComponent(term);
    const encodedLocation = encodeURIComponent(locationStr);
    let page = 1;
    const maxPages = 5;
    let termTotal = 0;

    while (page <= maxPages) {
      if (globalStopSignal) break;
      try {
        const url = `https://www.yellowpages.com/search?search_terms=${encodedTerm}&geo_location_terms=${encodedLocation}&page=${page}`;
        const html = await fetchPage(url, log);

        const namePattern = /<a[^>]*class="[^"]*business-name[^"]*"[^>]*>(?:<span[^>]*>)?([^<]+)/g;
        const phonePattern = /class="[^"]*phones?\s[^"]*"[^>]*>([^<]+)/g;
        const phoneAltPattern = /class="[^"]*phones?\s[^"]*"[^>]*href="tel:([^"]+)"/g;
        const addressPattern = /class="[^"]*street-address[^"]*"[^>]*>([^<]+)/g;
        const websitePattern = /class="[^"]*track-visit-website[^"]*"[^>]*href="([^"]+)"/g;
        const websiteAltPattern = /href="([^"]+)"[^>]*class="[^"]*track-visit-website[^"]*"/g;

        const names: string[] = [];
        const phones: string[] = [];
        const addresses: string[] = [];
        const websites: string[] = [];

        let match;
        while ((match = namePattern.exec(html)) !== null) {
          names.push(stripTags(match[1]));
        }

        if (names.length === 0 && page > 1) {
          log.push(`No more results after page ${page - 1}, stopping pagination`);
          break;
        }
        if (names.length === 0) {
          log.push(`No listings found for "${term}"`);
          break;
        }

        while ((match = phonePattern.exec(html)) !== null) {
          phones.push(stripTags(match[1]));
        }
        if (phones.length === 0) {
          while ((match = phoneAltPattern.exec(html)) !== null) {
            phones.push(match[1]);
          }
        }
        while ((match = addressPattern.exec(html)) !== null) {
          addresses.push(stripTags(match[1]));
        }
        while ((match = websitePattern.exec(html)) !== null) {
          websites.push(match[1]);
        }
        if (websites.length === 0) {
          while ((match = websiteAltPattern.exec(html)) !== null) {
            websites.push(match[1]);
          }
        }

        const finalNames = names;

        let pageCount = 0;
        for (let i = 0; i < finalNames.length; i++) {
          const name = finalNames[i];
          if (!name || name.length < 2) continue;

          const entry: ScraperResult = {
            name,
            phone: phones[i] || extractPhone(html),
            address: addresses[i],
            city: location.city,
            state: location.state,
            sourceUrl: `https://www.yellowpages.com/search?search_terms=${encodedTerm}&geo_location_terms=${encodedLocation}&page=${page}`,
          };

          if (websites[i]) {
            let websiteUrl = websites[i];
            if (websiteUrl.startsWith("/")) {
              websiteUrl = "https://www.yellowpages.com" + websiteUrl;
            }
            if (!isDirectoryPlaceholder(websiteUrl)) {
              entry.website = websiteUrl;
            }
          }

          results.push(entry);
          pageCount++;
        }

        log.push(`Page ${page}: found ${pageCount} listings`);
        termTotal += pageCount;

        if (finalNames.length < 5) {
          log.push(`No more results after page ${page}, stopping pagination`);
          break;
        }

        page++;
        await randomDelay();
      } catch (err: any) {
        log.push(`Error on page ${page} for "${term}": ${err.message || err}`);
        break;
      }
    }
    log.push(`Completed "${term}": ${termTotal} results`);
    if (searchTerms.indexOf(term) < searchTerms.length - 1) {
      await randomDelay();
    }
  }

  log.push(`Total: ${results.length} results`);
  return { results, log };
}

export async function scrapeSuperpages(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];
  const locationStr = `${location.city}, ${location.state}`;

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`Searching "${term}" in ${locationStr}...`);
    const encodedTerm = encodeURIComponent(term);
    const encodedLocation = encodeURIComponent(locationStr);
    let page = 1;
    const maxPages = 5;
    let termTotal = 0;

    while (page <= maxPages) {
      if (globalStopSignal) break;
      try {
        const url = `https://www.superpages.com/search?search_terms=${encodedTerm}&geo_location_terms=${encodedLocation}&page=${page}`;
        const html = await fetchPage(url, log);

        const businessNameRegex = /<a[^>]*class="[^"]*business-name[^"]*"[^>]*>(?:<span[^>]*>)?([^<]+)/g;
        const phoneRegex = /class="[^"]*phones?\s[^"]*"[^>]*href="tel:([^"]+)"/g;
        const addressRegex = /class="[^"]*street-address[^"]*"[^>]*>([^<]+)/g;
        const websiteRegex = /href="(https?:\/\/(?!www\.superpages\.com)[^"]+)"[^>]*rel="nofollow[^"]*"/g;

        const names: string[] = [];
        const phones: string[] = [];
        const addresses: string[] = [];
        const websites: string[] = [];

        let match;
        while ((match = businessNameRegex.exec(html)) !== null) names.push(stripTags(match[1]));
        while ((match = phoneRegex.exec(html)) !== null) phones.push(match[1]);
        while ((match = addressRegex.exec(html)) !== null) addresses.push(stripTags(match[1]));
        while ((match = websiteRegex.exec(html)) !== null) websites.push(match[1]);

        if (names.length === 0) {
          log.push(page === 1 ? `No listings found for "${term}"` : `No more results after page ${page - 1}, stopping pagination`);
          break;
        }

        let pageCount = 0;
        for (let i = 0; i < names.length; i++) {
          if (!names[i] || names[i].length < 2) continue;
          const websiteUrl = websites[i] && !isDirectoryPlaceholder(websites[i]) ? websites[i] : undefined;
          results.push({
            name: names[i],
            phone: phones[i],
            address: addresses[i],
            website: websiteUrl,
            city: location.city,
            state: location.state,
            sourceUrl: url,
          });
          pageCount++;
        }

        log.push(`Page ${page}: found ${pageCount} listings`);
        termTotal += pageCount;

        if (names.length < 5) {
          log.push(`No more results after page ${page}, stopping pagination`);
          break;
        }
        page++;
        await randomDelay();
      } catch (err: any) {
        log.push(`Error on page ${page} for "${term}": ${err.message || err}`);
        break;
      }
    }
    log.push(`Completed "${term}": ${termTotal} results`);
    if (searchTerms.indexOf(term) < searchTerms.length - 1) {
      await randomDelay();
    }
  }

  log.push(`Total: ${results.length} results`);
  return { results, log };
}

export const scrapeMapQuest: ScraperFn = () => blockedScraper("MapQuest", "Requires JS — search results are JS-rendered, server HTML contains only site metadata");

export async function scrapeHotfrog(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];
  const stateSlug = location.state.toLowerCase();
  const citySlug = location.city.toLowerCase().replace(/\s+/g, "-");

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`[Hotfrog] Searching "${term}" in ${location.city}, ${location.state}...`);
    let termCount = 0;
    try {
      const termSlug = term.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const url = `https://www.hotfrog.com/search/${stateSlug}/${citySlug}/${termSlug}`;
      const html = await fetchPage(url, log);

      const listingBlocks = extractAllBetween(html, '<div class="ser-card', '</div>');
      let blocks = listingBlocks;
      if (blocks.length === 0) {
        const altBlocks: string[] = [];
        const blockRegex = /href="\/company\/[^"]*"[^>]*data-yext-click="name"[\s\S]*?(?=href="\/company\/|<footer|$)/g;
        let bm;
        while ((bm = blockRegex.exec(html)) !== null) altBlocks.push(bm[0]);
        blocks = altBlocks;
      }

      if (blocks.length === 0) {
        const nameRegex = /data-yext-click="name"[^>]*>(?:<strong>)?([^<]+)/g;
        const phoneRegex = /href="tel:\+?1?([\d-]+)/g;

        const names: string[] = [];
        const phones: string[] = [];
        let match;
        while ((match = nameRegex.exec(html)) !== null) {
          const n = stripTags(match[1]);
          if (n.length > 2) names.push(n);
        }
        while ((match = phoneRegex.exec(html)) !== null) {
          const digits = match[1].replace(/-/g, "");
          if (digits.length >= 10) phones.push(digits);
        }

        for (let i = 0; i < names.length; i++) {
          results.push({
            name: names[i],
            phone: phones[i] ? phones[i].replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3") : undefined,
            city: location.city,
            state: location.state,
            sourceUrl: url,
          });
          termCount++;
        }
      } else {
        for (const block of blocks) {
          if (globalStopSignal) break;
          const nameMatch = block.match(/data-yext-click="name"[^>]*>(?:<strong>)?([^<]+)/i)
            || block.match(/<a[^>]*href="\/company\/[^"]*"[^>]*>(?:<strong>)?([^<]+)/i);
          if (!nameMatch) continue;
          const name = stripTags(nameMatch[1] || nameMatch[2]);
          if (!name || name.length < 2) continue;

          const phoneMatch = block.match(/href="tel:\+?1?([\d-]+)/i);
          const catMatch = block.match(/href="\/company\/[^"]*\/([^"\/]+)"/i);

          const rawPhone = phoneMatch ? phoneMatch[1].replace(/-/g, "") : undefined;
          results.push({
            name,
            phone: rawPhone && rawPhone.length >= 10 ? rawPhone.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3") : undefined,
            city: location.city,
            state: location.state,
            sourceUrl: url,
          });
          termCount++;
        }
      }

      if (termCount === 0) log.push(`[Hotfrog] No listings found for "${term}"`);
      else log.push(`[Hotfrog] Completed "${term}": ${termCount} results`);
      await randomDelay();
    } catch (err: any) {
      log.push(`[Hotfrog] Error for "${term}": ${err.message || err}`);
    }
  }

  log.push(`[Hotfrog] Total: ${results.length} results`);
  return { results, log };
}

export async function scrapeEZLocal(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];
  const stateSlug = location.state.toLowerCase();
  const citySlug = location.city.toLowerCase().replace(/\s+/g, "-");

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`Searching "${term}" in ${location.city}, ${location.state}...`);
    let termCount = 0;
    try {
      const termSlug = term.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const url = `https://ezlocal.com/${stateSlug}/${citySlug}/${termSlug}`;
      const html = await fetchPage(url, log);

      const nameRegex = /<h3[^>]*class="[^"]*fn org[^"]*"[^>]*>\d+\.\s*<a[^>]*>([^<]+)/g;
      const phoneRegex = /class="[^"]*tel[^"]*"[^>]*>([^<]+)/g;
      const addressRegex = /class="[^"]*street-address[^"]*"[^>]*>([^<]+)/g;

      const names: string[] = [];
      const phones: string[] = [];
      const addresses: string[] = [];

      let match;
      while ((match = nameRegex.exec(html)) !== null) names.push(stripTags(match[1]));
      while ((match = phoneRegex.exec(html)) !== null) phones.push(stripTags(match[1]));
      while ((match = addressRegex.exec(html)) !== null) addresses.push(stripTags(match[1]));

      if (names.length === 0) {
        const altNameRegex = /class="result vcard[\s\S]*?<h[2-4][^>]*>(?:\d+\.\s*)?(?:<a[^>]*>)?([^<]+)/g;
        while ((match = altNameRegex.exec(html)) !== null) {
          const name = stripTags(match[1]);
          if (name.length > 2) names.push(name);
        }
      }

      if (names.length === 0) {
        log.push(`No listings found for "${term}"`);
      } else {
        for (let i = 0; i < names.length; i++) {
          if (!names[i] || names[i].length < 2) continue;
          results.push({
            name: names[i],
            phone: phones[i],
            address: addresses[i],
            city: location.city,
            state: location.state,
            sourceUrl: url,
          });
          termCount++;
        }
        log.push(`Completed "${term}": ${termCount} results`);
      }

      await randomDelay();
    } catch (err: any) {
      log.push(`Error for "${term}": ${err.message || err}`);
    }
  }

  log.push(`Total: ${results.length} results`);
  return { results, log };
}

export async function scrapeN49(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];

  const CA_PROVINCES = new Set(["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"]);
  const isCA = CA_PROVINCES.has(location.state.toUpperCase());
  const countrySlug = isCA ? "ca" : "us";
  const stateSlug = location.state.toLowerCase();
  const citySlug = location.city.toLowerCase().replace(/\s+/g, "-");

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`[N49] Searching "${term}" in ${location.city}, ${location.state}...`);
    let termCount = 0;
    try {
      const termSlug = term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const url = `https://www.n49.com/biz/${countrySlug}/${stateSlug}/${citySlug}/${termSlug}/`;
      const html = await fetchPage(url, log);

      const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
      let match;
      while ((match = jsonLdRegex.exec(html)) !== null) {
        try {
          const data = JSON.parse(match[1]);
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (item["@type"] === "LocalBusiness" || item["@type"] === "Organization") {
              if (item.name && !results.some((r) => r.name === item.name)) {
                results.push({
                  name: item.name,
                  phone: item.telephone,
                  website: item.url && !item.url.includes("n49.com") ? item.url : undefined,
                  city: item.address?.addressLocality || location.city,
                  state: item.address?.addressRegion || location.state,
                  address: item.address?.streetAddress,
                  sourceUrl: url,
                });
                termCount++;
              }
            }
          }
        } catch {}
      }

      if (termCount === 0) {
        const listingRegex = /<div[^>]*class="[^"]*search-result[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*search-result[^"]*"|<\/section|$)/g;
        while ((match = listingRegex.exec(html)) !== null) {
          const block = match[1];
          const nameMatch = block.match(/<h[2-4][^>]*>(?:<a[^>]*>)?([^<]+)/);
          const phoneMatch = block.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
          const websiteMatch = block.match(/href="(https?:\/\/(?!www\.n49)[^"]+)"/);
          const addressMatch = block.match(/class="[^"]*address[^"]*"[^>]*>([^<]+)/);
          if (nameMatch) {
            results.push({
              name: stripTags(nameMatch[1]),
              phone: phoneMatch ? phoneMatch[0] : undefined,
              website: websiteMatch ? websiteMatch[1] : undefined,
              address: addressMatch ? stripTags(addressMatch[1]) : undefined,
              city: location.city,
              state: location.state,
              sourceUrl: url,
            });
            termCount++;
          }
        }
      }

      if (termCount === 0) log.push(`[N49] No listings found for "${term}"`);
      else log.push(`[N49] Completed "${term}": ${termCount} results`);
      await randomDelay();
    } catch (err: any) {
      log.push(`[N49] Error for "${term}": ${err.message || err}`);
    }
  }

  log.push(`[N49] Total: ${results.length} results`);
  return { results, log };
}

async function blockedScraper(name: string, reason: string): Promise<ScraperResponse> {
  return { results: [], log: [`${name}: ${reason}`] };
}

export const scrapeKompass: ScraperFn = () => blockedScraper("Kompass", "Blocked — DataDome anti-bot protection (403)");

function parseCompanyTiles(html: string, sourceUrl: string, location: ScraperLocation): ScraperResult[] {
  const results: ScraperResult[] = [];
  const tileChunks = html.split(/company-tile/);

  for (let i = 1; i < tileChunks.length; i++) {
    const chunk = tileChunks[i].substring(0, 3000);

    const nameMatch = chunk.match(/<h2[^>]*class="line-clamp[^"]*"[^>]*>([^<]+)<\/h2>/i)
      || chunk.match(/<h2[^>]*>([^<]{2,})<\/h2>/i);
    if (!nameMatch) continue;
    const name = stripTags(nameMatch[1]).replace(/&amp;/g, "&");
    if (!name || name.length < 2) continue;

    const cityMatch = chunk.match(/<span[^>]*class="city"[^>]*>([^<]+)/i)
      || chunk.match(/<span class="city">([^<]+)/i);
    const countryMatch = chunk.match(/<span>([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)<\/span>/);

    const entry: ScraperResult = {
      name,
      city: cityMatch ? stripTags(cityMatch[1]) : location.city,
      state: countryMatch ? stripTags(countryMatch[1]) : location.state,
      sourceUrl,
    };

    results.push(entry);
  }

  return results;
}

export async function scrapeEuropages(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`[Europages] Searching "${term}"...`);
    try {
      const slug = term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const maxPages = 3;
      let termTotal = 0;

      for (let page = 1; page <= maxPages; page++) {
        if (globalStopSignal) break;
        const url = `https://www.europages.co.uk/companies/pg-${page}/${encodeURIComponent(slug)}.html`;
        const html = await fetchPage(url, log);

        const pageResults = parseCompanyTiles(html, url, location);
        if (pageResults.length === 0) {
          if (page === 1) log.push(`[Europages] No listings for "${term}"`);
          break;
        }

        results.push(...pageResults);
        termTotal += pageResults.length;
        log.push(`[Europages] Page ${page}: ${pageResults.length} listings`);

        if (pageResults.length < 5) break;
        await randomDelay();
      }

      if (termTotal > 0) log.push(`[Europages] "${term}": ${termTotal} total`);
    } catch (err: any) {
      log.push(`[Europages] Error for "${term}": ${err.message || err}`);
    }
  }

  log.push(`[Europages] Total: ${results.length} results`);
  return { results, log };
}

export const scrapeYell: ScraperFn = () => blockedScraper("Yell", "Blocked — Cloudflare protection (403)");

export const scrapeCylex: ScraperFn = () => blockedScraper("Cylex", "Blocked — Cloudflare challenge page");

export const scrapeTradeKey: ScraperFn = () => blockedScraper("TradeKey", "Dead — endpoint returns 410 Gone");
export const scrapeExportHub: ScraperFn = () => blockedScraper("ExportHub", "Dead — search endpoint returns 404");
export const scrapeGo4WorldBusiness: ScraperFn = () => blockedScraper("Go4WorldBusiness", "Blocked — AWS ELB returns 403");
export const scrapeTradeFord: ScraperFn = () => blockedScraper("TradeFord", "Blocked — Cloudflare protection (403)");

export const scrapeTradeIndia: ScraperFn = () => blockedScraper("TradeIndia", "Blocked — Cloudflare protection");
export const scrapeMadeInChina: ScraperFn = () => blockedScraper("Made-in-China", "Blocked — requires authentication");
export const scrapeIndiaMart: ScraperFn = () => blockedScraper("IndiaMart", "Blocked — requires authentication");
export const scrapeEC21: ScraperFn = () => blockedScraper("EC21", "Blocked — Cloudflare protection");
export const scrapeGlobalSources: ScraperFn = () => blockedScraper("GlobalSources", "Blocked — Cloudflare protection");
export async function scrapeWLW(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];

  for (const term of searchTerms) {
    if (globalStopSignal) break;
    log.push(`[WLW] Searching "${term}"...`);
    try {
      const maxPages = 3;
      let termTotal = 0;

      for (let page = 1; page <= maxPages; page++) {
        if (globalStopSignal) break;
        const url = `https://www.wlw.de/en/search?q=${encodeURIComponent(term)}&page=${page}`;
        const html = await fetchPage(url, log);

        const pageResults = parseCompanyTiles(html, url, location);
        if (pageResults.length === 0) {
          if (page === 1) log.push(`[WLW] No listings for "${term}"`);
          break;
        }

        results.push(...pageResults);
        termTotal += pageResults.length;
        log.push(`[WLW] Page ${page}: ${pageResults.length} listings`);

        if (pageResults.length < 5) break;
        await randomDelay();
      }

      if (termTotal > 0) log.push(`[WLW] "${term}": ${termTotal} total`);
    } catch (err: any) {
      log.push(`[WLW] Error for "${term}": ${err.message || err}`);
    }
  }

  log.push(`[WLW] Total: ${results.length} results`);
  return { results, log };
}

export const scrapeYelp: ScraperFn = () => blockedScraper("Yelp", "Blocked — requires API key");
export const scrapeBBB: ScraperFn = () => blockedScraper("BBB", "Blocked — CAPTCHA/anti-bot protection");
export const scrapeAngi: ScraperFn = () => blockedScraper("Angi", "Blocked — requires authentication");
export const scrapeClutch: ScraperFn = () => blockedScraper("Clutch", "Blocked — Cloudflare protection");
export const scrapeManta: ScraperFn = () => blockedScraper("Manta", "Blocked — Cloudflare protection");
export const scrapeChamberOfCommerce: ScraperFn = () => blockedScraper("ChamberOfCommerce", "Blocked — CAPTCHA/anti-bot protection");

export const SCRAPERS: Record<string, ScraperFn> = {
  yellowpages: scrapeYellowPages,
  superpages: scrapeSuperpages,
  mapquest: scrapeMapQuest,
  hotfrog: scrapeHotfrog,
  ezlocal: scrapeEZLocal,
  n49: scrapeN49,
  yelp: scrapeYelp,
  bbb: scrapeBBB,
  angi: scrapeAngi,
  clutch: scrapeClutch,
  manta: scrapeManta,
  chamberofcommerce: scrapeChamberOfCommerce,
  kompass: scrapeKompass,
  europages: scrapeEuropages,
  yell: scrapeYell,
  cylex: scrapeCylex,
  tradekey: scrapeTradeKey,
  exporthub: scrapeExportHub,
  go4worldbusiness: scrapeGo4WorldBusiness,
  tradeford: scrapeTradeFord,
  tradeindia: scrapeTradeIndia,
  madeinchina: scrapeMadeInChina,
  indiamart: scrapeIndiaMart,
  ec21: scrapeEC21,
  globalsources: scrapeGlobalSources,
  wlw: scrapeWLW,
};

export function getScraperByKey(key: string): ScraperFn | undefined {
  return SCRAPERS[key.toLowerCase()];
}

export interface BeautyProbeResult {
  score: number;
  flags: string[];
}

export async function probeBeauty(url: string): Promise<BeautyProbeResult> {
  const flags: string[] = [];
  let score = 100;

  try {
    let probeUrl = url;
    if (!probeUrl.startsWith("http://") && !probeUrl.startsWith("https://")) {
      probeUrl = "https://" + probeUrl;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(probeUrl, {
      method: "GET",
      headers: {
        "User-Agent": getRandomUA(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    const headers: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      headers[key.toLowerCase()] = val.toLowerCase();
    });

    const setCookieCount = response.headers.getSetCookie?.()?.length || 0;
    const allHeadersStr = JSON.stringify(headers);

    if (headers["cf-ray"] || headers["server"]?.includes("cloudflare") || allHeadersStr.includes("__cf_")) {
      flags.push("cloudflare");
      score -= 20;
    } else if (headers["x-sucuri-id"] || headers["server"]?.includes("sucuri")) {
      flags.push("sucuri-waf");
      score -= 20;
    } else if (headers["server"]?.includes("akamaighost") || headers["x-akamai-transformed"]) {
      flags.push("akamai");
      score -= 20;
    } else if (headers["x-iinfo"] || headers["server"]?.includes("incapsula") || headers["x-cdn"]?.includes("imperva")) {
      flags.push("imperva");
      score -= 20;
    } else if (headers["x-datadome"]) {
      flags.push("datadome-waf");
      score -= 20;
    } else if (headers["server"]?.includes("ddos-guard")) {
      flags.push("ddos-guard");
      score -= 20;
    }

    if (setCookieCount > 5) {
      flags.push("excessive-cookies");
      score -= 10;
    }

    const body = await response.text();
    const bodyLower = body.toLowerCase();

    if (bodyLower.includes("recaptcha") || bodyLower.includes("www.google.com/recaptcha") || bodyLower.includes("grecaptcha")) {
      flags.push("recaptcha");
      score -= 25;
    } else if (bodyLower.includes("hcaptcha.com") || bodyLower.includes("h-captcha")) {
      flags.push("hcaptcha");
      score -= 25;
    } else if (bodyLower.includes("challenges.cloudflare.com") || bodyLower.includes("cf-turnstile") || bodyLower.includes("challenge-platform")) {
      flags.push("cloudflare-turnstile");
      score -= 25;
    } else if (bodyLower.includes("captcha-delivery.com")) {
      flags.push("datadome-captcha");
      score -= 25;
    }

    if (bodyLower.includes("onetrust") || bodyLower.includes("optanon")) {
      flags.push("onetrust");
      score -= 10;
    } else if (bodyLower.includes("cookiebot.com") || bodyLower.includes("cookieconsent")) {
      flags.push("cookiebot");
      score -= 10;
    } else if (bodyLower.includes("cookie-banner") || bodyLower.includes("cookie-notice") || bodyLower.includes("cookie-consent")) {
      flags.push("cookie-banner");
      score -= 10;
    } else if (bodyLower.includes("gdpr") && bodyLower.includes("consent")) {
      flags.push("gdpr-consent");
      score -= 10;
    } else if (bodyLower.includes("trustarc.com") || bodyLower.includes("quantcast.com/choice")) {
      flags.push("consent-manager");
      score -= 10;
    }

    if (bodyLower.includes("honeypot") || bodyLower.includes("bot-trap") || bodyLower.includes("hp_field")) {
      flags.push("honeypot");
      score -= 15;
    } else {
      const honeypotPattern = /<input[^>]*type\s*=\s*["']?text["']?[^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>/i;
      if (honeypotPattern.test(body)) {
        flags.push("honeypot-hidden-field");
        score -= 15;
      }
    }

    if (bodyLower.includes("datadome.co")) {
      if (!flags.includes("datadome-waf")) { flags.push("datadome-bot"); score -= 15; }
    } else if (bodyLower.includes("perimeterx.net") || bodyLower.includes("/px.js")) {
      flags.push("perimeterx");
      score -= 15;
    } else if (bodyLower.includes("shapesecurity") || bodyLower.includes("shape.com")) {
      flags.push("shape-security");
      score -= 15;
    } else if (bodyLower.includes("kasada.io")) {
      flags.push("kasada");
      score -= 15;
    } else if (bodyLower.includes("arkoselabs.com")) {
      flags.push("arkose-labs");
      score -= 15;
    }

    const visibleContent = body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "").trim();
    if (visibleContent.length < 100 && (bodyLower.includes("enable javascript") || bodyLower.includes("javascript is required"))) {
      flags.push("js-required");
      score -= 5;
    }

    score = Math.max(0, score);
    return { score, flags };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { score: 0, flags: ["timeout"] };
    }
    return { score: 0, flags: ["unreachable"] };
  }
}
