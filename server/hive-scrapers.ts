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

function randomDelay(): Promise<void> {
  const ms = 7000 + Math.random() * 2000;
  return sleep(ms);
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

const GOV_NONPROFIT_KEYWORDS = [
  "government", "federal", "county", "state of", "district", "bureau", "branch",
  "secretary", "office of", "department of", "authority", "commission", "board of",
  "city of", "town of", "township", "municipal", "public", "nonprofit", "foundation",
  "association", "society", "institute", "university", "college", "school", "church",
  "ministry", "temple", "mosque", "synagogue",
];

function isGovNonprofit(name: string): boolean {
  const lower = name.toLowerCase();
  return GOV_NONPROFIT_KEYWORDS.some((kw) => lower.includes(kw));
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
];

const FRANCHISE_BRANDS_LOWER = FRANCHISE_BRANDS.map((b) => b.toLowerCase());

const FRANCHISE_PATTERN = /(.+?)[\s]*[#\-–—]\s*\d+/i;

function detectFranchise(name: string): boolean {
  const lower = name.toLowerCase();
  if (FRANCHISE_BRANDS_LOWER.some((brand) => lower.includes(brand))) {
    return true;
  }
  if (FRANCHISE_PATTERN.test(name)) {
    return true;
  }
  return false;
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

    if (!isDotCom(result.website)) {
      pollen.push(result);
      continue;
    }

    const normalizedUrl = normalizeUrl(result.website);
    const isFranchise = detectFranchise(result.name);

    flowers.push({
      ...result,
      normalizedUrl,
      isFranchise,
    });
  }

  return { flowers, pollen };
}

async function fetchPage(url: string): Promise<string> {
  const RETRYABLE = new Set([403, 429, 503]);

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        headers: getRandomHeaders(),
        signal: controller.signal,
        redirect: "follow",
      });
      if (!response.ok) {
        if (attempt === 0 && RETRYABLE.has(response.status)) {
          clearTimeout(timeout);
          const backoff = 10000 + Math.random() * 5000;
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.text();
    } catch (err: any) {
      if (attempt === 0 && err?.message?.includes("abort")) {
        clearTimeout(timeout);
        await sleep(5000);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("fetchPage: max retries reached");
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
  const match = text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  return match ? match[0] : undefined;
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
    log.push(`Searching "${term}" in ${locationStr}...`);
    const encodedTerm = encodeURIComponent(term);
    const encodedLocation = encodeURIComponent(locationStr);
    let page = 1;
    const maxPages = 5;
    let termTotal = 0;

    while (page <= maxPages) {
      try {
        const url = `https://www.yellowpages.com/search?search_terms=${encodedTerm}&geo_location_terms=${encodedLocation}&page=${page}`;
        const html = await fetchPage(url);

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
    log.push(`Searching "${term}" in ${locationStr}...`);
    const encodedTerm = encodeURIComponent(term);
    const encodedLocation = encodeURIComponent(locationStr);
    let page = 1;
    const maxPages = 5;
    let termTotal = 0;

    while (page <= maxPages) {
      try {
        const url = `https://www.superpages.com/search?search_terms=${encodedTerm}&geo_location_terms=${encodedLocation}&page=${page}`;
        const html = await fetchPage(url);

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

export async function scrapeMapQuest(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];
  const locationStr = `${location.city}+${location.state}`;

  for (const term of searchTerms) {
    log.push(`Searching "${term}" in ${location.city}, ${location.state}...`);
    try {
      const encodedTerm = encodeURIComponent(`${term} ${location.city} ${location.state}`);
      const url = `https://www.mapquest.com/search/results?query=${encodedTerm}&boundingBox=&page=0`;
      const html = await fetchPage(url);
      let termCount = 0;

      const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
      let match;
      while ((match = jsonLdRegex.exec(html)) !== null) {
        try {
          const data = JSON.parse(match[1]);
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (item["@type"] === "LocalBusiness" || item["@type"] === "Organization") {
              const entry: ScraperResult = {
                name: item.name || "",
                phone: item.telephone,
                website: item.url,
                city: item.address?.addressLocality || location.city,
                state: item.address?.addressRegion || location.state,
                address: item.address?.streetAddress,
                sourceUrl: url,
              };
              if (entry.name) {
                results.push(entry);
                termCount++;
              }
            }
          }
        } catch {
        }
      }

      const cardRegex = /<div[^>]*class="[^"]*search-result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
      while ((match = cardRegex.exec(html)) !== null) {
        const block = match[1];
        const nameMatch = block.match(/<h[2-6][^>]*>([^<]+)/);
        const phoneMatch = block.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
        const linkMatch = block.match(/href="(https?:\/\/[^"]+)"/);

        if (nameMatch) {
          results.push({
            name: stripTags(nameMatch[1]),
            phone: phoneMatch ? phoneMatch[0] : undefined,
            website: linkMatch ? linkMatch[1] : undefined,
            city: location.city,
            state: location.state,
            sourceUrl: url,
          });
          termCount++;
        }
      }

      log.push(`Completed "${term}": ${termCount} results`);
      await randomDelay();
    } catch (err: any) {
      log.push(`Error for "${term}": ${err.message || err}`);
    }
  }

  log.push(`Total: ${results.length} results`);
  return { results, log };
}

export async function scrapeHotfrog(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];
  const stateSlug = location.state.toLowerCase();
  const citySlug = location.city.toLowerCase().replace(/\s+/g, "-");

  for (const term of searchTerms) {
    log.push(`Searching "${term}" in ${location.city}, ${location.state}...`);
    let termCount = 0;
    try {
      const termSlug = term.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const url = `https://www.hotfrog.com/search/${stateSlug}/${citySlug}/${termSlug}`;
      const html = await fetchPage(url);

      const nameRegex = /data-yext-click="name"[^>]*><strong>([^<]+)<\/strong>/g;
      const phoneRegex = /href="tel:\+?1?([^"]+)"/g;
      const websiteRegex = /href="(https?:\/\/(?!(?:www\.)?hotfrog\.com|assets\.centralindex|maxcdn|blog\.hotfrog|support\.hotfrog|legal\.hotfrog|jooble)[^"]+)"/g;

      const names: string[] = [];
      const phones: string[] = [];
      const websites: string[] = [];

      let match;
      while ((match = nameRegex.exec(html)) !== null) names.push(stripTags(match[1]));
      while ((match = phoneRegex.exec(html)) !== null) phones.push(match[1]);
      while ((match = websiteRegex.exec(html)) !== null) websites.push(match[1]);

      if (names.length === 0) {
        const altNameRegex = /<h[2-4][^>]*>(?:<a[^>]*>)?(?:<strong>)?([^<]+)/g;
        while ((match = altNameRegex.exec(html)) !== null) {
          const name = stripTags(match[1]).replace(/^\d+\.\s*/, "");
          if (name.length > 2 && !name.includes("Business Owners") && !name.includes("Hotfrog")) {
            names.push(name);
          }
        }
      }

      if (names.length === 0) {
        log.push(`No listings found for "${term}"`);
      } else {
        for (let i = 0; i < names.length; i++) {
          if (!names[i] || names[i].length < 2) continue;
          const websiteUrl = websites[i] && !isDirectoryPlaceholder(websites[i]) ? websites[i] : undefined;
          results.push({
            name: names[i],
            phone: phones[i],
            website: websiteUrl,
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

export async function scrapeEZLocal(
  searchTerms: string[],
  location: ScraperLocation
): Promise<ScraperResponse> {
  const results: ScraperResult[] = [];
  const log: string[] = [];
  const stateSlug = location.state.toLowerCase();
  const citySlug = location.city.toLowerCase().replace(/\s+/g, "-");

  for (const term of searchTerms) {
    log.push(`Searching "${term}" in ${location.city}, ${location.state}...`);
    let termCount = 0;
    try {
      const termSlug = term.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const url = `https://ezlocal.com/${stateSlug}/${citySlug}/${termSlug}`;
      const html = await fetchPage(url);

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
  const locationStr = `${location.city}, ${location.state}`;

  for (const term of searchTerms) {
    log.push(`Searching "${term}" in ${locationStr}...`);
    let termCount = 0;
    try {
      const encodedTerm = encodeURIComponent(term);
      const encodedLocation = encodeURIComponent(locationStr);
      const url = `https://www.n49.com/search/?q=${encodedTerm}&loc=${encodedLocation}`;
      const html = await fetchPage(url);

      const listingRegex = /<div[^>]*class="[^"]*search-result[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*search-result[^"]*"|<\/section|$)/g;
      let match;
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

      const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
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
                  website: item.url,
                  city: item.address?.addressLocality || location.city,
                  state: item.address?.addressRegion || location.state,
                  address: item.address?.streetAddress,
                  sourceUrl: url,
                });
                termCount++;
              }
            }
          }
        } catch {
        }
      }

      if (termCount === 0) log.push(`No listings found for "${term}"`);
      else log.push(`Completed "${term}": ${termCount} results`);
      await randomDelay();
    } catch (err: any) {
      log.push(`Error for "${term}": ${err.message || err}`);
    }
  }

  log.push(`Total: ${results.length} results`);
  return { results, log };
}

async function stubScraper(name: string, _searchTerms: string[], _location: ScraperLocation): Promise<ScraperResponse> {
  return { results: [], log: [`${name}: Stub scraper — source blocked/requires API key`] };
}

export const scrapeYelp: ScraperFn = (s, l) => stubScraper("Yelp", s, l);
export const scrapeBBB: ScraperFn = (s, l) => stubScraper("BBB", s, l);
export const scrapeAngi: ScraperFn = (s, l) => stubScraper("Angi", s, l);
export const scrapeClutch: ScraperFn = (s, l) => stubScraper("Clutch", s, l);
export const scrapeManta: ScraperFn = (s, l) => stubScraper("Manta", s, l);
export const scrapeChamberOfCommerce: ScraperFn = (s, l) => stubScraper("ChamberOfCommerce", s, l);

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
