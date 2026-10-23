/**
 * Prototype for KSL tender events and the daily report (SEAT7).
 * emit() validates and appends one JSON line; nothing is ever rewritten.
 */
import { appendFileSync, openSync, closeSync, readFileSync, existsSync } from 'node:fs';

export const STEPS = ['listing', 'airlock_decision', 'bid', 'selection', 'award', 'delivery', 'review', 'payment'] as const;
export type Step = (typeof STEPS)[number];
export type KslEvent = {
  type: Step; at: string; job_id?: string; offer_id?: string; bid_id?: string; award_ref?: string;
  decision?: 'pass' | 'refuse'; outcome?: 'accepted' | 'rejected'; amount_usdc?: number; tx?: string;
};

const NEEDS: Record<Step, (keyof KslEvent)[]> = {
  listing: ['offer_id'],
  airlock_decision: ['offer_id', 'job_id', 'decision'],
  bid: ['offer_id', 'job_id', 'bid_id'],
  selection: ['job_id', 'bid_id'],
  award: ['job_id', 'bid_id', 'award_ref'],
  delivery: ['job_id', 'award_ref'],
  review: ['job_id', 'award_ref', 'outcome'],
  payment: ['job_id', 'award_ref', 'amount_usdc'],
};

export function validate(e: KslEvent): string | null {
  if (!e || typeof e !== 'object') return 'event must be an object';
  if (!STEPS.includes(e.type)) return `unknown type ${String(e.type)}`;
  if (typeof e.at !== 'string' || Number.isNaN(Date.parse(e.at))) return 'at must be an ISO time';
  for (const k of NEEDS[e.type]) if (e[k] === undefined || e[k] === '') return `${e.type} needs ${k}`;
  if (e.decision !== undefined && !['pass', 'refuse'].includes(e.decision)) return 'decision must be pass or refuse';
  if (e.outcome !== undefined && !['accepted', 'rejected'].includes(e.outcome)) return 'outcome must be accepted or rejected';
  if (e.amount_usdc !== undefined && !(typeof e.amount_usdc === 'number' && e.amount_usdc > 0)) return 'amount_usdc must be positive';
  return null;
}

export function createWriter(path: string) {
  if (!existsSync(path)) closeSync(openSync(path, 'a'));
  let last = '';
  for (const line of readFileSync(path, 'utf8').split('\n')) if (line) last = (JSON.parse(line) as KslEvent).at;
  return {
    emit(e: KslEvent): KslEvent {
      const err = validate(e);
      if (err) throw new TypeError(err);
      if (last && Date.parse(e.at) < Date.parse(last)) throw new RangeError('events are append only: at is older than the last event');
      appendFileSync(path, JSON.stringify(e) + '\n', { flag: 'a' });
      last = e.at;
      return e;
    },
  };
}

export function readEvents(path: string): KslEvent[] {
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function reportSection(events: KslEvent[], day: string): string {
  const today = events.filter((e) => e.at.slice(0, 10) === day);
  const counts = Object.fromEntries(STEPS.map((s) => [s, 0])) as Record<Step, number>;
  for (const e of today) counts[e.type]++;
  const anomalies: string[] = [];
  const airlock = new Set(events.filter((e) => e.type === 'airlock_decision' && e.decision === 'pass' && e.at <= `${day}T23:59:59.999Z`).map((e) => `${e.offer_id}|${e.job_id}`));
  for (const b of today.filter((e) => e.type === 'bid'))
    if (!airlock.has(`${b.offer_id}|${b.job_id}`)) anomalies.push(`bid ${b.bid_id} on job ${b.job_id} has no passing airlock decision`);
  const accepted = new Set(events.filter((e) => e.type === 'review' && e.outcome === 'accepted').map((e) => `${e.job_id}|${e.award_ref}`));
  for (const p of today.filter((e) => e.type === 'payment'))
    if (!accepted.has(`${p.job_id}|${p.award_ref}`)) anomalies.push(`payment for award ${p.award_ref} on job ${p.job_id} has no accepted review`);
  const lines = [`### Tender activity ${day}`, '', '| Step | Count |', '| --- | --- |', ...STEPS.map((s) => `| ${s} | ${counts[s]} |`), '', '#### Anomalies', ''];
  lines.push(...(anomalies.length ? anomalies.map((a) => `- ${a}`) : ['- none']));
  return lines.join('\n') + '\n';
}
