import { getSession } from '../browser';
import { extractSnapshot } from '../extract';
import { formatSnapshot } from '../format';

export async function handleSnapshot(format: string, profile?: string): Promise<string> {
  const { page, refs } = await getSession(profile);

  if (!page.url() || page.url() === 'about:blank') {
    throw new Error('No page loaded. Run `open <url>` first.');
  }

  const snapshot = await extractSnapshot(page, refs);
  return formatSnapshot(snapshot, format);
}
