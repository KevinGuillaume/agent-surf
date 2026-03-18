import { getSession } from '../browser';

export async function handleType(
  args: Record<string, string>,
  profile?: string,
): Promise<{ typed: string; into: string }> {
  const { page } = await getSession(profile);
  const target = args['target'];
  const text = args['text'];

  if (!target) throw new Error('type requires a target argument');
  if (text === undefined) throw new Error('type requires a text argument');

  // Try ref first (e.g. "e3" → [data-surf-ref="e3"])
  if (/^e\d+$/.test(target)) {
    const byRef = page.locator(`[data-surf-ref="${target}"]`);
    if ((await byRef.count()) > 0) {
      await byRef.first().fill(text);
      return { typed: text, into: target };
    }
  }

  // Fall back to label/placeholder match
  const byLabel = page.getByLabel(target, { exact: false });
  if ((await byLabel.count()) > 0) {
    await byLabel.first().fill(text);
    return { typed: text, into: target };
  }

  const byPlaceholder = page.getByPlaceholder(target, { exact: false });
  if ((await byPlaceholder.count()) > 0) {
    await byPlaceholder.first().fill(text);
    return { typed: text, into: target };
  }

  throw new Error(`No input found for target: "${target}"`);
}
