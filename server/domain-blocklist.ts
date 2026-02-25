const REGISTRAR_DOMAINS = new Set([
  "namecheap.com", "godaddy.com", "porkbun.com", "hover.com", "name.com",
  "register.com", "dynadot.com", "enom.com", "tucows.com", "gandi.net",
  "1and1.com", "ionos.com", "networksolutions.com", "markmonitor.com",
  "key-systems.net", "onlinenic.com", "one.com", "epik.com", "domainpeople.com",
  "dotster.com", "moniker.com", "fabulous.com", "above.com", "domainsite.com",
  "internetbs.net", "101domain.com", "uniregistrar.com",
]);

const HOSTING_DOMAINS = new Set([
  "hostinger.com", "bluehost.com", "dreamhost.com", "siteground.com",
  "hostgator.com", "a2hosting.com", "inmotionhosting.com", "ipage.com",
  "greengeeks.com", "liquidweb.com", "wpengine.com", "kinsta.com",
  "flywheel.com", "pagely.com", "pressable.com", "convesio.com",
  "cloudways.com", "nexcess.net", "rackspace.com",
]);

const WEBSITE_BUILDER_DOMAINS = new Set([
  "squarespace.com", "wix.com", "shopify.com", "weebly.com",
  "wordpress.com", "wordpress.org", "blogger.com", "tumblr.com",
  "medium.com", "ghost.io", "webflow.com", "strikingly.com",
  "jimdo.com", "site123.com", "duda.co", "cargo.site",
  "carrd.co", "format.com", "portfoliobox.net",
]);

const PARKING_DOMAINS = new Set([
  "sedoparking.com", "parkingcrew.net", "bodis.com", "dan.com",
  "afternic.com", "hugedomains.com", "undeveloped.com", "sedo.com",
  "parked.com", "parklogic.com", "skenzo.com", "domainactive.com",
  "above.com", "domainnamesales.com", "buydomains.com", "brandbucket.com",
  "domainmarket.com", "flippa.com", "squadhelp.com", "namerific.com",
  "yours.com", "web.com", "networksolutions.com",
]);

const CDN_INFRASTRUCTURE_DOMAINS = new Set([
  "cloudflare.com", "fastly.com", "akamai.com", "cloudfront.net",
  "maxcdn.com", "stackpath.com", "jsdelivr.net", "unpkg.com",
  "cdnjs.cloudflare.com", "bootstrapcdn.com", "googleapis.com",
  "gstatic.com", "googlesyndication.com", "googletagmanager.com",
  "google-analytics.com", "doubleclick.net", "fbcdn.net",
  "amazonaws.com", "azureedge.net", "azurewebsites.net",
  "herokuapp.com", "netlify.app", "vercel.app", "pages.dev",
  "workers.dev", "digitalocean.com", "linode.com", "vultr.com",
  "hetzner.com", "ovh.com", "ovhcloud.com",
]);

const GENERIC_PLATFORMS = new Set([
  "google.com", "facebook.com", "twitter.com", "youtube.com",
  "linkedin.com", "instagram.com", "pinterest.com", "reddit.com",
  "github.com", "stackoverflow.com", "wikipedia.org", "amazon.com",
  "apple.com", "microsoft.com", "gravatar.com", "wp.com",
  "w3.org", "schema.org", "jquery.com", "fontawesome.com",
  "fonts.googleapis.com", "fonts.gstatic.com", "x.com", "tiktok.com",
  "snapchat.com", "whatsapp.com", "telegram.org", "discord.com",
  "slack.com", "zoom.us", "dropbox.com", "box.com",
]);

const SSL_CA_DOMAINS = new Set([
  "letsencrypt.org", "digicert.com", "comodo.com", "globalsign.com",
  "sectigo.com", "entrust.com", "geotrust.com", "thawte.com",
  "symantec.com", "rapidssl.com", "godaddy.com", "starfieldtech.com",
]);

const ALL_BLOCKED_DOMAINS = new Set([
  ...Array.from(REGISTRAR_DOMAINS),
  ...Array.from(HOSTING_DOMAINS),
  ...Array.from(WEBSITE_BUILDER_DOMAINS),
  ...Array.from(PARKING_DOMAINS),
  ...Array.from(CDN_INFRASTRUCTURE_DOMAINS),
  ...Array.from(GENERIC_PLATFORMS),
  ...Array.from(SSL_CA_DOMAINS),
]);

export function extractRootDomain(domain: string): string {
  const parts = domain.toLowerCase().trim().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const twoPartTlds = ["co.uk", "com.au", "co.nz", "co.za", "com.br", "co.jp", "co.kr", "com.mx", "org.uk", "net.au"];
  const lastTwo = parts.slice(-2).join(".");
  if (twoPartTlds.includes(lastTwo)) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

export function isInfrastructureDomain(domain: string): boolean {
  if (!domain) return true;
  const clean = domain.toLowerCase().trim().replace(/^www\./, "");
  if (ALL_BLOCKED_DOMAINS.has(clean)) return true;
  const root = extractRootDomain(clean);
  if (ALL_BLOCKED_DOMAINS.has(root)) return true;
  const suffixPatterns = [
    /\.amazonaws\.com$/, /\.cloudfront\.net$/, /\.cloudflare\.com$/,
    /\.azureedge\.net$/, /\.azurewebsites\.net$/, /\.herokuapp\.com$/,
    /\.netlify\.app$/, /\.vercel\.app$/, /\.pages\.dev$/, /\.workers\.dev$/,
    /\.firebaseapp\.com$/, /\.appspot\.com$/, /\.replit\.app$/, /\.replit\.dev$/,
    /\.render\.com$/, /\.railway\.app$/, /\.fly\.dev$/,
    /\.digitaloceanspaces\.com$/, /\.r2\.dev$/,
  ];
  for (const pattern of suffixPatterns) {
    if (pattern.test(clean)) return true;
  }
  return false;
}

export function getBlockedDomainCategory(domain: string): string | null {
  const clean = domain.toLowerCase().trim().replace(/^www\./, "");
  const root = extractRootDomain(clean);
  const check = (set: Set<string>) => set.has(clean) || set.has(root);
  if (check(REGISTRAR_DOMAINS)) return "registrar";
  if (check(HOSTING_DOMAINS)) return "hosting";
  if (check(WEBSITE_BUILDER_DOMAINS)) return "website_builder";
  if (check(PARKING_DOMAINS)) return "parking";
  if (check(CDN_INFRASTRUCTURE_DOMAINS)) return "cdn_infrastructure";
  if (check(GENERIC_PLATFORMS)) return "generic_platform";
  if (check(SSL_CA_DOMAINS)) return "ssl_ca";
  return null;
}
