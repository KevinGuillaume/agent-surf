export interface LinkRef {
  ref: string;
  text: string;
  href: string;
}

export interface InputRef {
  ref: string;
  type: string;
  name?: string;
  placeholder?: string;
  value?: string;
}

export interface ButtonRef {
  ref: string;
  text: string;
}

export interface TableSnapshot {
  caption?: string;
  headers: string[];
  rows: string[][];
}

export interface PageSnapshot {
  url: string;
  title: string;
  description?: string;
  text: string;
  links: LinkRef[];
  inputs: InputRef[];
  buttons: ButtonRef[];
  tables: TableSnapshot[];
}

export interface Command {
  command: string;
  args: Record<string, string>;
  format: 'json' | 'toon' | 'plain';
  profile?: string;
}

export interface DaemonResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}
