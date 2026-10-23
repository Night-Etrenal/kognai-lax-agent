import { bodyHash } from './canon.ts';

export type Signer = { address: `0x${string}`; signMessage: (a: { message: string }) => Promise<`0x${string}`> };

/** One line message signed for bids: `LAX bid <METHOD> <path> at <time> body sha256 <hash>`. */
export function bidMessage(method: string, path: string, time: string, body: unknown): string {
  return `LAX bid ${method.toUpperCase()} ${path} at ${time} body sha256 ${bodyHash(body)}`;
}

/** One line message signed for PACT and delivery routes. */
export function pactMessage(method: string, path: string, time: string, body: unknown): string {
  return `LAX pact ${method.toUpperCase()} ${path} at ${time} body sha256 ${bodyHash(body)}`;
}

/** Signed headers for a LAX call. Each signed message is accepted once, so time is fresh per call. */
export async function laxHeaders(signer: Signer, kind: 'bid' | 'pact', method: string, path: string, body: unknown, now = new Date()) {
  const time = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const message = (kind === 'bid' ? bidMessage : pactMessage)(method, path, time, body);
  const signature = await signer.signMessage({ message });
  return { 'x-lax-time': time, 'x-lax-signature': signature };
}
