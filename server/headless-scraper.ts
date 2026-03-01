import puppeteer, { Browser, Page } from "puppeteer";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

export interface HeadlessFormField {
  tag: string;
  name: string;
  type: string;
  placeholder: string;
  required: boolean;
}

export interface HeadlessForm {
  action: string;
  method: string;
  fields: HeadlessFormField[];
  hiddenFields: HeadlessFormField[];
  fieldCount: number;
  hiddenFieldCount: number;
  source: string;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) return browserInstance;
  browserInstance = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-sync",
      "--no-first-run",
      "--single-process",
    ],
  });
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try { await browserInstance.close(); } catch {}
    browserInstance = null;
  }
}

async function extractFormsFromPage(page: Page, sourceUrl: string): Promise<HeadlessForm[]> {
  return page.evaluate((src: string) => {
    const results: any[] = [];
    const formElements = document.querySelectorAll("form");
    formElements.forEach(form => {
      const action = form.getAttribute("action") || "";
      const method = (form.getAttribute("method") || "POST").toUpperCase();
      const fields: any[] = [];
      const hiddenFields: any[] = [];
      form.querySelectorAll("input, textarea, select").forEach(inp => {
        const el = inp as HTMLInputElement;
        const f = {
          tag: el.tagName.toLowerCase(),
          name: el.getAttribute("name") || "",
          type: el.getAttribute("type") || "text",
          placeholder: el.getAttribute("placeholder") || "",
          required: el.hasAttribute("required"),
        };
        if (f.type === "hidden") hiddenFields.push(f);
        else fields.push(f);
      });
      if (fields.length > 0) {
        results.push({ action, method, fields, hiddenFields, fieldCount: fields.length, hiddenFieldCount: hiddenFields.length, source: src });
      }
    });
    return results;
  }, sourceUrl);
}

export async function scrapeWithHeadless(domain: string, paths: string[]): Promise<HeadlessForm[]> {
  const browser = await getBrowser();
  const allForms: HeadlessForm[] = [];
  const seenActions = new Set<string>();

  let page: Page | null = null;
  try {
    page = await browser.newPage();
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    await page.setUserAgent(ua);
    await page.setViewport({ width: 1280 + Math.floor(Math.random() * 200), height: 800 + Math.floor(Math.random() * 200) });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    for (const path of paths) {
      if (allForms.length >= 5) break;
      const url = `https://${domain}${path}`;
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 1500));

        const forms = await extractFormsFromPage(page, `headless:${url}`);
        for (const form of forms) {
          const actionKey = form.action || form.source;
          if (!seenActions.has(actionKey)) {
            seenActions.add(actionKey);
            allForms.push(form);
          }
        }
      } catch {}

      if (paths.indexOf(path) < paths.length - 1) {
        await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
      }
    }
  } finally {
    if (page) await page.close().catch(() => {});
  }

  return allForms;
}

export function isSpaHtml(html: string): boolean {
  const lower = html.toLowerCase();
  const indicators = [
    '<div id="root"',
    '<div id="app"',
    '<div id="__next"',
    '<div id="__nuxt"',
    "bundle.js",
    "chunk.js",
    "react",
    "angular",
    "vue.js",
    "vue.min.js",
    "__NEXT_DATA__",
    "window.__NUXT__",
    "_app.js",
    "main.js",
  ];
  let score = 0;
  for (const ind of indicators) {
    if (lower.includes(ind)) score++;
  }
  const hasMinimalBody = (lower.match(/<form/g) || []).length === 0;
  return score >= 2 || (score >= 1 && hasMinimalBody);
}
