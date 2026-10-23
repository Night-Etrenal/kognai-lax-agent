import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { createChallenge, verifyChallenge, challengeMessage } from '../src/challenge.ts';

// Test-only keys (well known Hardhat dev keys, never funded on mainnet).
const owner = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const other = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const now = new Date('2026-10-23T10:00:00.000Z');
const did = 'did:web:agent.example.com';
const mk = () => createChallenge({ did, listingId: 'L-1', now, nonce: '0123456789abcdef0123456789abcdef' });

test('valid signature passes', async () => {
  const c = mk();
  const r = await verifyChallenge({ challenge: c, signature: await owner.signMessage({ message: c.message }), ownerAddress: owner.address, now });
  assert.deepEqual(r, { ok: true, reason: 'ok' });
});
test('wrong signer fails', async () => {
  const c = mk();
  const r = await verifyChallenge({ challenge: c, signature: await other.signMessage({ message: c.message }), ownerAddress: owner.address, now });
  assert.equal(r.reason, 'wrong_signer');
});
test('expired fails', async () => {
  const c = mk();
  const sig = await owner.signMessage({ message: c.message });
  const r = await verifyChallenge({ challenge: c, signature: sig, ownerAddress: owner.address, now: new Date(now.getTime() + 5 * 60 * 1000) });
  assert.equal(r.reason, 'expired');
});
test('not yet valid fails', async () => {
  const c = mk();
  const sig = await owner.signMessage({ message: c.message });
  assert.equal((await verifyChallenge({ challenge: c, signature: sig, ownerAddress: owner.address, now: new Date(now.getTime() - 1) })).reason, 'not_yet_valid');
});
test('replayed nonce fails the second time', async () => {
  const c = mk(); const seen = new Set<string>();
  const sig = await owner.signMessage({ message: c.message });
  assert.equal((await verifyChallenge({ challenge: c, signature: sig, ownerAddress: owner.address, now, seen })).ok, true);
  assert.equal((await verifyChallenge({ challenge: c, signature: sig, ownerAddress: owner.address, now, seen })).reason, 'replayed');
});
test('tampered DID fails', async () => {
  const c = mk();
  const sig = await owner.signMessage({ message: c.message });
  const r = await verifyChallenge({ challenge: { ...c, did: 'did:web:evil.example.com' }, signature: sig, ownerAddress: owner.address, now });
  assert.equal(r.reason, 'tampered');
});
test('tampered DID with recomputed message fails on signer', async () => {
  const c = mk();
  const sig = await owner.signMessage({ message: c.message });
  const t = { ...c, did: 'did:web:evil.example.com' }; t.message = challengeMessage(t);
  assert.equal((await verifyChallenge({ challenge: t, signature: sig, ownerAddress: owner.address, now })).reason, 'wrong_signer');
});
test('malformed inputs are refused with a reason', async () => {
  const c = mk();
  const sig = await owner.signMessage({ message: c.message });
  const v = (o: object) => verifyChallenge({ challenge: c, signature: sig, ownerAddress: owner.address, now, ...o });
  assert.equal((await v({ challenge: null })).reason, 'malformed_challenge');
  assert.equal((await v({ challenge: { ...c, did: 'nope' } })).reason, 'bad_did');
  assert.equal((await v({ challenge: { ...c, nonce: 'zz' } })).reason, 'bad_nonce');
  assert.equal((await v({ ownerAddress: '0x123' })).reason, 'bad_owner_address');
  assert.equal((await v({ signature: '0xdead' })).reason, 'bad_signature_format');
  assert.equal((await v({ signature: '0x' + '00'.repeat(65) })).reason, 'bad_signature');
  const bt = { ...c, expiresAt: c.issuedAt }; bt.message = challengeMessage(bt);
  assert.equal((await v({ challenge: bt })).reason, 'bad_times');
});
test('createChallenge validates and defaults', () => {
  assert.throws(() => createChallenge({ did: 'x', listingId: 'L', now }));
  assert.throws(() => createChallenge({ did, listingId: '', now }));
  assert.throws(() => createChallenge({ did, listingId: 'L', now, ttlMs: 0 }));
  assert.throws(() => createChallenge({ did, listingId: 'L', now, nonce: 'abc' }));
  const c = createChallenge({ did, listingId: 'L', now });
  assert.match(c.nonce, /^[0-9a-f]{32}$/);
  assert.equal(Date.parse(c.expiresAt) - Date.parse(c.issuedAt), 300000);
});
