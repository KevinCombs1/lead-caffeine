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
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
];

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): Promise<void> {
  const ms = 3000 + Math.random() * 2000;
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

    if (!result.website) {
      pollen.push({ ...result, city: result.city, state: result.state });
      continue;
    }

    if (isExcludedDomain(result.website)) continue;

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": getRandomUA(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
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

        const listings = extractAllBetween(html, '<div class="srp-listing"', "</div>\n");
        if (listings.length === 0 && page > 1) {
          log.push(`No more results after page ${page - 1}, stopping pagination`);
          break;
        }
        if (listings.length === 0) {
          const altListings = extractAllBetween(html, '<div class="result"', "</div>\n");
          if (altListings.length === 0) {
            log.push(`No listings found for "${term}"`);
            break;
          }
        }

        const namePattern = /class="business-name"[^>]*>(?:<a[^>]*>)?([^<]+)/g;
        const phonePattern = /class="phones[^"]*"[^>]*>([^<]+)/g;
        const addressPattern = /class="street-address"[^>]*>([^<]+)/g;
        const localityPattern = /class="locality"[^>]*>([^<]+)/g;
        const websitePattern = /class="track-visit-website"[^>]*href="([^"]+)"/g;
        const linkPattern = /href="\/([^"]*?)"[^>]*class="track-visit-website"/g;

        const names: string[] = [];
        const phones: string[] = [];
        const addresses: string[] = [];
        const localities: string[] = [];
        const websites: string[] = [];

        let match;
        while ((match = namePattern.exec(html)) !== null) {
          names.push(stripTags(match[1]));
        }
        while ((match = phonePattern.exec(html)) !== null) {
          phones.push(stripTags(match[1]));
        }
        while ((match = addressPattern.exec(html)) !== null) {
          addresses.push(stripTags(match[1]));
        }
        while ((match = localityPattern.exec(html)) !== null) {
          localities.push(stripTags(match[1]));
        }
        while ((match = websitePattern.exec(html)) !== null) {
          websites.push(match[1]);
        }
        if (websites.length === 0) {
          while ((match = linkPattern.exec(html)) !== null) {
            websites.push(match[1]);
          }
        }

        const businessNameRegex = /<a[^>]*class="business-name"[^>]*>(?:<span[^>]*>)?([^<]+)/g;
        const altNames: string[] = [];
        while ((match = businessNameRegex.exec(html)) !== null) {
          altNames.push(stripTags(match[1]));
        }
        const finalNames = names.length > 0 ? names : altNames;

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
            entry.website = websiteUrl;
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

        const businessNameRegex = /<a[^>]*class="[^"]*business-name[^"]*"[^>]*>([^<]+)/g;
        const phoneRegex = /class="[^"]*phones?[^"]*"[^>]*>([^<]+)/g;
        const addressRegex = /class="[^"]*street-address[^"]*"[^>]*>([^<]+)/g;
        const websiteRegex = /class="[^"]*track-visit-website[^"]*"[^>]*href="([^"]+)"/g;

        const names: string[] = [];
        const phones: string[] = [];
        const addresses: string[] = [];
        const websites: string[] = [];

        let match;
        while ((match = businessNameRegex.exec(html)) !== null) names.push(stripTags(match[1]));
        while ((match = phoneRegex.exec(html)) !== null) phones.push(stripTags(match[1]));
        while ((match = addressRegex.exec(html)) !== null) addresses.push(stripTags(match[1]));
        while ((match = websiteRegex.exec(html)) !== null) websites.push(match[1]);

        if (names.length === 0) {
          log.push(page === 1 ? `No listings found for "${term}"` : `No more results after page ${page - 1}, stopping pagination`);
          break;
        }

        let pageCount = 0;
        for (let i = 0; i < names.length; i++) {
          if (!names[i] || names[i].length < 2) continue;
          results.push({
            name: names[i],
            phone: phones[i],
            address: addresses[i],
            website: websites[i],
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
      const encodedTerm = encodeURIComponent(term);
      const url = `https://www.mapquest.com/search/results?query=${encodedTerm}&boundingBox=&page=0&centerLat=&centerLng=`;
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

      const listingBlocks = extractAllBetween(html, '<div class="listing-item', "</article>");
      if (listingBlocks.length === 0) {
        const altBlocks = extractAllBetween(html, '<div class="result-item', "</div>\n</div>");
        if (altBlocks.length === 0) {
          log.push(`No listings found for "${term}"`);
        }
        for (const block of altBlocks) {
          const nameMatch = block.match(/<h[2-4][^>]*>(?:<a[^>]*>)?([^<]+)/);
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
      }

      for (const block of listingBlocks) {
        const nameMatch = block.match(/<h[2-4][^>]*>(?:<a[^>]*>)?([^<]+)/);
        const phoneMatch = block.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
        const websiteMatch = block.match(/href="(https?:\/\/(?!www\.hotfrog)[^"]+)"/);
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

      log.push(`Completed "${term}": ${termCount} results`);
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
      const url = `https://www.ezlocal.com/search/${stateSlug}/${citySlug}/${termSlug}`;
      const html = await fetchPage(url);

      const listingRegex = /<div[^>]*class="[^"]*listing[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*listing[^"]*"|$)/g;
      let match;
      while ((match = listingRegex.exec(html)) !== null) {
        const block = match[1];
        const nameMatch = block.match(/<h[2-4][^>]*>(?:<a[^>]*>)?([^<]+)/);
        const phoneMatch = block.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
        const websiteMatch = block.match(/href="(https?:\/\/(?!www\.ezlocal)[^"]+)"/);
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

      const nameBlocks = extractAllBetween(html, '<a class="listing-name"', "</a>");
      if (nameBlocks.length > 0) {
        for (const block of nameBlocks) {
          const name = stripTags(block);
          if (name && name.length > 1) {
            results.push({
              name,
              city: location.city,
              state: location.state,
              sourceUrl: url,
            });
            termCount++;
          }
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
