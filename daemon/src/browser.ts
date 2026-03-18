import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { RefCounter } from './refs';

interface Session {
  context: BrowserContext;
  page: Page;
  refs: RefCounter;
}

let browser: Browser | null = null;
const sessions = new Map<string, Session>();

const DEFAULT_PROFILE = '__default__';

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

export async function getSession(profile?: string): Promise<Session> {
  const key = profile ?? DEFAULT_PROFILE;

  if (!sessions.has(key)) {
    const b = await getBrowser();
    const context = await b.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    sessions.set(key, { context, page, refs: new RefCounter() });
  }

  return sessions.get(key)!;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    sessions.clear();
  }
}
