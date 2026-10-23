import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canon, bodyHash, sha256Hex } from '../src/canon.ts';
import { bidMessage, laxHeaders } from '../src/lax-sign.ts';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage } from 'viem';

test('canonical JSON sorts keys at every depth and keeps arrays', () => {
  assert.equal(canon({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'x' } }), '{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}');
  assert.equal(bodyHash(undefined), sha256Hex('null'));
});
test('bid message and headers verify against the signer', async () => {
  const acct = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const body = { offer_id: 'o', price_usdc: 50 };
  const now = new Date('2026-10-23T10:00:00.123Z');
  const h = await laxHeaders(acct, 'bid', 'POST', '/jobs/j/bids', body, now);
  assert.equal(h['x-lax-time'], '2026-10-23T10:00:00Z');
  const message = bidMessage('POST', '/jobs/j/bids', h['x-lax-time'], body);
  assert.ok(message.startsWith('LAX bid POST /jobs/j/bids at 2026-10-23T10:00:00Z body sha256 '));
  assert.ok(await verifyMessage({ address: acct.address, message, signature: h['x-lax-signature'] }));
});
