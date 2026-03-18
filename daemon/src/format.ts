import { PageSnapshot } from './types';

// @toon-format/toon is ESM-only. We load it at runtime via dynamic import
// so the rest of the daemon can stay in CommonJS.
type EncodeFn = (input: unknown) => string;
let _encode: EncodeFn | null = null;

async function getEncoder(): Promise<EncodeFn> {
  if (_encode) return _encode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import('@toon-format/toon')) as any;
  _encode = mod.encode as EncodeFn;
  return _encode!;
}

export async function formatSnapshot(snapshot: PageSnapshot, format: string): Promise<string> {
  switch (format) {
    case 'toon':
      return toToon(snapshot);
    case 'plain':
      return toPlain(snapshot);
    default:
      return JSON.stringify(snapshot, null, 2);
  }
}

async function toToon(snapshot: PageSnapshot): Promise<string> {
  const encode = await getEncoder();

  // Build a filtered object — omit empty arrays so TOON output stays lean
  const data: Record<string, unknown> = {
    url: snapshot.url,
    title: snapshot.title,
  };

  if (snapshot.description) data.description = snapshot.description;
  if (snapshot.text) data.text = snapshot.text;
  if (snapshot.links.length > 0) data.links = snapshot.links;
  if (snapshot.inputs.length > 0) data.inputs = snapshot.inputs;
  if (snapshot.buttons.length > 0) data.buttons = snapshot.buttons;
  if (snapshot.tables.length > 0) data.tables = snapshot.tables;

  return encode(data);
}

function toPlain(snapshot: PageSnapshot): string {
  const lines: string[] = [];

  lines.push(`=== ${snapshot.url} ===`);
  lines.push(snapshot.title);

  if (snapshot.description) {
    lines.push('');
    lines.push(snapshot.description);
  }

  if (snapshot.text) {
    lines.push('');
    lines.push(snapshot.text);
  }

  if (snapshot.links.length > 0) {
    lines.push('');
    lines.push('LINKS:');
    for (const link of snapshot.links) {
      lines.push(`  [${link.ref}] ${link.text} → ${link.href}`);
    }
  }

  if (snapshot.inputs.length > 0) {
    lines.push('');
    lines.push('INPUTS:');
    for (const input of snapshot.inputs) {
      const meta = [
        input.name && `name="${input.name}"`,
        input.placeholder && `placeholder="${input.placeholder}"`,
      ]
        .filter(Boolean)
        .join(', ');
      lines.push(`  [${input.ref}] ${input.type}${meta ? ` (${meta})` : ''}`);
    }
  }

  if (snapshot.buttons.length > 0) {
    lines.push('');
    lines.push('BUTTONS:');
    for (const button of snapshot.buttons) {
      lines.push(`  [${button.ref}] ${button.text}`);
    }
  }

  if (snapshot.tables.length > 0) {
    lines.push('');
    lines.push('TABLES:');
    for (const table of snapshot.tables) {
      if (table.caption) lines.push(`  # ${table.caption}`);
      if (table.headers.length > 0) {
        lines.push(`  | ${table.headers.join(' | ')} |`);
        lines.push(`  | ${table.headers.map(() => '---').join(' | ')} |`);
      }
      for (const row of table.rows.slice(0, 20)) {
        lines.push(`  | ${row.join(' | ')} |`);
      }
    }
  }

  return lines.join('\n');
}
