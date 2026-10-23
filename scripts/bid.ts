/**
 * Place or edit a bid on a LAX job, signed by the listing owner (EIP-191).
 * Usage: LAX_KEY_FILE=/path/key.json npx tsx scripts/bid.ts <job_id> <bid.json>
 */
import { readFileSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { laxHeaders } from '../src/lax-sign.ts';

const [jobId, bidFile] = process.argv.slice(2);
const body = JSON.parse(readFileSync(bidFile, 'utf8'));
const acct = privateKeyToAccount(JSON.parse(readFileSync(process.env.LAX_KEY_FILE!, 'utf8')).private_key);
const path = `/jobs/${jobId}/bids`;
const headers = await laxHeaders(acct, 'bid', 'POST', path, body);
const r = await fetch(`https://lax.kognai.ai/registry${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});
console.log(r.status, await r.text());
