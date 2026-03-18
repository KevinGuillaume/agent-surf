import { Page } from 'playwright';
import { PageSnapshot } from './types';
import { RefCounter } from './refs';

// Shape returned from page.evaluate (plain JSON-serializable objects only)
interface ExtractedDOM {
  links: Array<{ ref: string; text: string; href: string }>;
  inputs: Array<{ ref: string; type: string; name?: string; placeholder?: string; value?: string }>;
  buttons: Array<{ ref: string; text: string }>;
  tables: Array<{ caption?: string; headers: string[]; rows: string[][] }>;
  text: string;
  description?: string;
  finalCount: number;
}

export async function extractSnapshot(page: Page, refs: RefCounter): Promise<PageSnapshot> {
  refs.reset();

  const url = page.url();
  const title = await page.title();

  // All DOM work runs inside the browser via page.evaluate.
  // The callback is pure browser JS — no Node.js APIs, no TypeScript.
  const extracted: ExtractedDOM = await page.evaluate((startCount: number) => {
    let counter = startCount;
    const nextRef = () => `e${++counter}`;

    // Clear any refs from a previous snapshot so clicks still resolve correctly
    document.querySelectorAll('[data-surf-ref]').forEach((el) =>
      el.removeAttribute('data-surf-ref'),
    );

    // ── Links ─────────────────────────────────────────────────────────────
    const links = Array.from(document.querySelectorAll('a[href]'))
      .filter((el) => {
        const a = el as HTMLAnchorElement;
        const text = (a.textContent ?? '').trim();
        return (
          text.length > 0 &&
          a.href &&
          !a.href.startsWith('javascript:') &&
          !a.href.startsWith('mailto:') &&
          !a.href.startsWith('#')
        );
      })
      .slice(0, 80)
      .map((el) => {
        const a = el as HTMLAnchorElement;
        const ref = nextRef();
        a.setAttribute('data-surf-ref', ref);
        return {
          ref,
          text: (a.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120),
          href: a.href,
        };
      });

    // ── Inputs ────────────────────────────────────────────────────────────
    const inputs = Array.from(
      document.querySelectorAll(
        'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), textarea',
      ),
    ).map((el) => {
      const input = el as HTMLInputElement;
      const ref = nextRef();
      input.setAttribute('data-surf-ref', ref);
      return {
        ref,
        type: input.type || 'text',
        name: input.name || undefined,
        placeholder: input.placeholder || undefined,
        value: input.value || undefined,
      };
    });

    // ── Buttons ───────────────────────────────────────────────────────────
    const buttons = Array.from(
      document.querySelectorAll(
        'button, input[type=submit], input[type=button], input[type=reset], [role=button]',
      ),
    )
      .filter((el) => !el.getAttribute('data-surf-ref'))
      .map((el) => {
        const ref = nextRef();
        el.setAttribute('data-surf-ref', ref);
        const text = (
          (el.textContent ?? '').trim() ||
          (el as HTMLInputElement).value ||
          el.getAttribute('aria-label') ||
          ''
        )
          .replace(/\s+/g, ' ')
          .slice(0, 80);
        return { ref, text };
      })
      .filter((b) => b.text.length > 0);

    // ── Tables ────────────────────────────────────────────────────────────
    const tables = Array.from(document.querySelectorAll('table'))
      .slice(0, 5)
      .map((table) => {
        const caption = (table.querySelector('caption')?.textContent ?? '').trim() || undefined;

        const headerRow =
          table.querySelector('thead tr') ||
          table.querySelector('tr');
        const headers = headerRow
          ? Array.from(headerRow.querySelectorAll('th, td')).map(
              (th) => (th.textContent ?? '').trim(),
            )
          : [];

        const bodyRows = Array.from(
          table.querySelectorAll('tbody tr, tr:not(:first-child)'),
        )
          .map((tr) =>
            Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()),
          )
          .filter((row) => row.length > 0)
          .slice(0, 50);

        return { caption, headers, rows: bodyRows };
      });

    // ── Main text ─────────────────────────────────────────────────────────
    const mainEl =
      document.querySelector('main, article, [role=main], #main, #content, .main, .content') ||
      document.body;

    const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'nav', 'footer', 'aside', 'header']);
    const textParts: string[] = [];

    const walker = document.createTreeWalker(mainEl, /* NodeFilter.SHOW_TEXT */ 4, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return /* FILTER_REJECT */ 2;
        if (SKIP_TAGS.has(parent.tagName.toLowerCase())) return 2;
        return /* FILTER_ACCEPT */ 1;
      },
    });

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const t = (node.textContent ?? '').trim();
      if (t.length > 1) textParts.push(t);
    }

    const description =
      (document.querySelector('meta[name=description]') as HTMLMetaElement | null)?.content ||
      undefined;

    return {
      links,
      inputs,
      buttons,
      tables,
      text: textParts.join(' ').replace(/\s{2,}/g, ' ').trim().slice(0, 4000),
      description,
      finalCount: counter,
    };
  }, refs.count);

  refs.advance(extracted.finalCount);

  return {
    url,
    title,
    description: extracted.description,
    text: extracted.text,
    links: extracted.links,
    inputs: extracted.inputs,
    buttons: extracted.buttons,
    tables: extracted.tables,
  };
}
