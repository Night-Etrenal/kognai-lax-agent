import { readFileSync } from 'node:fs';
/** Read a hex private key from the JSON file named by LAX_KEY_FILE; never logs it. */
export function loadKey(): `0x${string}` {
  const k = String(JSON.parse(readFileSync(process.env.LAX_KEY_FILE!, 'utf8')).private_key).trim();
  return (k.startsWith('0x') ? k : `0x${k}`) as `0x${string}`;
}
