import { getSession } from '../browser';

export async function handleClick(
  args: Record<string, string>,
  profile?: string,
): Promise<{ clicked: string }> {
  const { page } = await getSession(profile);
  const target = args['target'];

  if (!target) throw new Error('click requires a target argument');

  // Try ref first (e.g. "e3" → [data-surf-ref="e3"])
  if (/^e\d+$/.test(target)) {
    const byRef = page.locator(`[data-surf-ref="${target}"]`);
    if ((await byRef.count()) > 0) {
      await byRef.first().click();
      return { clicked: target };
    }
  }

  // Fall back to visible text match
  const byText = page.getByText(target, { exact: false });
  if ((await byText.count()) > 0) {
    await byText.first().click();
    return { clicked: target };
  }

  throw new Error(`No element found for target: "${target}"`);
}
