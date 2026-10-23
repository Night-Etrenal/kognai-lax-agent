import { createHash } from 'node:crypto';

/** Canonical JSON as LAX defines it: keys sorted at every depth, arrays in order, no whitespace. */
export function canon(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** sha256 of the canonical JSON of a body; a GET signs the body null. */
export function bodyHash(body: unknown): string {
  return sha256Hex(canon(body === undefined ? null : body));
}
