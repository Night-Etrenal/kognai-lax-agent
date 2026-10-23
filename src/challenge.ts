/**
 * Prototype for Cerberus chamber 1 (SEAT1): prove a bidding agent controls its LAX listing.
 * Pure: no network, no clock reads (now is passed in), viem only for EIP-191 recovery.
 */
import { recoverMessageAddress, isAddress, getAddress } from 'viem';
import { randomBytes } from 'node:crypto';

export type Challenge = {
  did: string;
  listingId: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  message: string;
};

export type VerifyResult = { ok: true; reason: 'ok' } | { ok: false; reason: string };

export const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DID_RE = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;
const NONCE_RE = /^[0-9a-f]{32}$/;

export function challengeMessage(c: Omit<Challenge, 'message'>): string {
  return [
    'LAX Cerberus chamber 1: prove control of a listing',
    `DID: ${c.did}`,
    `Listing: ${c.listingId}`,
    `Nonce: ${c.nonce}`,
    `Issued: ${c.issuedAt}`,
    `Expires: ${c.expiresAt}`,
  ].join('\n');
}

export function createChallenge(args: { did: string; listingId: string; now: Date; ttlMs?: number; nonce?: string }): Challenge {
  const { did, listingId, now } = args;
  if (!DID_RE.test(did)) throw new TypeError('did must look like did:method:identifier');
  if (typeof listingId !== 'string' || listingId.length === 0) throw new TypeError('listingId is required');
  const ttl = args.ttlMs ?? DEFAULT_TTL_MS;
  if (!(ttl > 0)) throw new TypeError('ttlMs must be positive');
  const nonce = args.nonce ?? randomBytes(16).toString('hex');
  if (!NONCE_RE.test(nonce)) throw new TypeError('nonce must be 32 lowercase hex characters');
  const base = { did, listingId, nonce, issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + ttl).toISOString() };
  return { ...base, message: challengeMessage(base) };
}

/**
 * Verify the listing owner's EIP-191 signature over the challenge.
 * `seen` is the nonce store: a nonce verifies once; the caller keeps the set between calls.
 */
export async function verifyChallenge(args: {
  challenge: Challenge; signature: string; ownerAddress: string; now: Date; seen?: Set<string>;
}): Promise<VerifyResult> {
  const { challenge: c, signature, ownerAddress, now, seen } = args;
  if (!c || typeof c !== 'object') return { ok: false, reason: 'malformed_challenge' };
  if (!DID_RE.test(String(c.did))) return { ok: false, reason: 'bad_did' };
  if (!NONCE_RE.test(String(c.nonce))) return { ok: false, reason: 'bad_nonce' };
  if (c.message !== challengeMessage(c)) return { ok: false, reason: 'tampered' };
  if (!isAddress(ownerAddress)) return { ok: false, reason: 'bad_owner_address' };
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return { ok: false, reason: 'bad_signature_format' };
  const issued = Date.parse(c.issuedAt);
  const expires = Date.parse(c.expiresAt);
  if (Number.isNaN(issued) || Number.isNaN(expires) || expires <= issued) return { ok: false, reason: 'bad_times' };
  if (now.getTime() < issued) return { ok: false, reason: 'not_yet_valid' };
  if (now.getTime() >= expires) return { ok: false, reason: 'expired' };
  if (seen?.has(c.nonce)) return { ok: false, reason: 'replayed' };
  let signer: string;
  try {
    signer = await recoverMessageAddress({ message: c.message, signature: signature as `0x${string}` });
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }
  if (getAddress(signer) !== getAddress(ownerAddress)) return { ok: false, reason: 'wrong_signer' };
  seen?.add(c.nonce);
  return { ok: true, reason: 'ok' };
}
