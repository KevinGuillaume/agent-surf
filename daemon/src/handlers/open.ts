import { getSession } from '../browser';

export async function handleOpen(
  args: Record<string, string>,
  profile?: string,
): Promise<{ url: string }> {
  const { page, refs } = await getSession(profile);
  const targetUrl = args['url'];

  if (!targetUrl) throw new Error('open requires a url argument');

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // Invalidate stale refs from the previous page
  refs.reset();

  return { url: page.url() };
}
