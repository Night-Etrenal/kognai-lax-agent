/**
 * List the agent on LAX: POST the offer, read the x402 terms, verify them, sign an
 * EIP-3009 transferWithAuthorization for exactly the quoted amount, and resend.
 * Refuses anything other than USDC on Base to Kognai's published wallet, at most MAX_ATOMIC.
 * Usage: LAX_KEY_FILE=/path/key.json npx tsx scripts/list.ts docs/offer.json [--pay]
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { loadKey } from '../src/key.ts';

const URL_ = 'https://lax.kognai.ai/registry/offers';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const KOGNAI_PAYTO = '0xF62fb064F9d9D03B8013E5b6023e3501805BA973';
const MAX_ATOMIC = 20000n; // 0.02 USDC hard cap

const offerText = readFileSync(process.argv[2], 'utf8');
const pay = process.argv.includes('--pay');
const r1 = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: offerText });
const terms = await r1.json();
if (r1.status !== 402) { console.log(r1.status, JSON.stringify(terms)); process.exit(1); }
const a = terms.accepts?.[0];
const checks = {
  scheme: a?.scheme === 'exact',
  network: a?.network === 'eip155:8453',
  asset: getAddress(a?.asset) === USDC_BASE,
  payTo: getAddress(a?.payTo) === KOGNAI_PAYTO,
  amount: BigInt(a?.amount) > 0n && BigInt(a?.amount) <= MAX_ATOMIC,
};
console.log('terms', { amount: a?.amount, asset: a?.asset, payTo: a?.payTo, network: a?.network, checks });
if (!Object.values(checks).every(Boolean)) { console.log('ABORT: terms failed verification'); process.exit(2); }
if (!pay) { console.log('dry run only; pass --pay to sign'); process.exit(0); }

const acct = privateKeyToAccount(loadKey());
const now = Math.floor(Date.now() / 1000);
const authorization = {
  from: acct.address, to: getAddress(a.payTo), value: String(a.amount),
  validAfter: String(now - 600), validBefore: String(now + Number(a.maxTimeoutSeconds ?? 120)),
  nonce: ('0x' + randomBytes(32).toString('hex')) as `0x${string}`,
};
const signature = await acct.signTypedData({
  domain: { name: a.extra?.name ?? 'USD Coin', version: a.extra?.version ?? '2', chainId: 8453, verifyingContract: getAddress(a.asset) },
  types: { TransferWithAuthorization: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] },
  primaryType: 'TransferWithAuthorization',
  message: { ...authorization, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) },
});
const payload = { x402Version: 2, resource: terms.resource, accepted: a, payload: { signature, authorization } };
const header = Buffer.from(JSON.stringify(payload)).toString('base64');
const r2 = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json', 'PAYMENT-SIGNATURE': header }, body: offerText });
console.log('status', r2.status);
for (const h of ['payment-response', 'x-payment-response']) { const v = r2.headers.get(h); if (v) console.log(h, Buffer.from(v, 'base64').toString()); }
console.log(await r2.text());
