import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWriter, readEvents, reportSection, validate } from '../src/ksl.ts';

const file = () => join(mkdtempSync(join(tmpdir(), 'ksl-')), 'events.jsonl');

test('events are validated', () => {
  assert.match(validate({ type: 'bid', at: '2026-10-23T01:00:00Z', offer_id: 'o' } as any)!, /needs job_id/);
  assert.match(validate({ type: 'nope', at: 'x' } as any)!, /unknown type/);
  assert.match(validate({ type: 'listing', at: 'x', offer_id: 'o' })!, /ISO/);
  assert.equal(validate({ type: 'listing', at: '2026-10-23T01:00:00Z', offer_id: 'o' }), null);
});
test('events are append only', () => {
  const f = file(); const w = createWriter(f);
  w.emit({ type: 'listing', at: '2026-10-23T01:00:00Z', offer_id: 'o1' });
  const before = readFileSync(f, 'utf8');
  w.emit({ type: 'listing', at: '2026-10-23T02:00:00Z', offer_id: 'o2' });
  assert.ok(readFileSync(f, 'utf8').startsWith(before));
  assert.throws(() => w.emit({ type: 'listing', at: '2026-10-23T00:00:00Z', offer_id: 'o3' }), /append only/);
  assert.throws(() => createWriter(f).emit({ type: 'listing', at: '2026-10-22T00:00:00Z', offer_id: 'o4' }), /append only/);
  assert.equal(readEvents(f).length, 2);
});
test('daily report counts steps and lists anomalies', () => {
  const f = file(); const w = createWriter(f); const d = '2026-10-23';
  w.emit({ type: 'airlock_decision', at: `${d}T01:00:00Z`, offer_id: 'o1', job_id: 'j1', decision: 'pass' });
  w.emit({ type: 'bid', at: `${d}T02:00:00Z`, offer_id: 'o1', job_id: 'j1', bid_id: 'b1' });
  w.emit({ type: 'bid', at: `${d}T03:00:00Z`, offer_id: 'o2', job_id: 'j1', bid_id: 'b2' });
  w.emit({ type: 'review', at: `${d}T04:00:00Z`, job_id: 'j1', award_ref: 'r1', outcome: 'accepted' });
  w.emit({ type: 'payment', at: `${d}T05:00:00Z`, job_id: 'j1', award_ref: 'r1', amount_usdc: 10 });
  w.emit({ type: 'payment', at: `${d}T06:00:00Z`, job_id: 'j1', award_ref: 'r2', amount_usdc: 10 });
  const md = reportSection(readEvents(f), d);
  assert.match(md, /\| bid \| 2 \|/);
  assert.match(md, /\| payment \| 2 \|/);
  assert.match(md, /bid b2 on job j1 has no passing airlock decision/);
  assert.match(md, /payment for award r2 on job j1 has no accepted review/);
  assert.doesNotMatch(md, /bid b1/);
  assert.match(reportSection([], d), /- none/);
});
