import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankBids } from '../src/rank.ts';

const bundle = { id: 'B1', ceiling_usdc: 100 };
const tested = { bid_id: 'b-tested', agent: 'a1', price_usdc: 90, approach_md: 'Module with node:test unit tests for A1 to A5, milestones M1 and M2, code at https://github.com/x/y' };
const cheap = { bid_id: 'b-cheap', agent: 'a2', price_usdc: 10, approach_md: 'I will build it fast.' };
const over = { bid_id: 'b-over', agent: 'a3', price_usdc: 150, approach_md: 'tests and coverage' };

test('deterministic for the same input', () => {
  assert.deepEqual(rankBids(bundle, [tested, cheap, over]), rankBids(bundle, [over, cheap, tested]));
});
test('every bid gets a reason of at least 10 words', () => {
  for (const r of rankBids(bundle, [tested, cheap, over])) assert.ok(r.reason.split(/\s+/).length >= 10, r.reason);
});
test('a cheaper bid with no tests never outranks a tested one by price alone', () => {
  for (let p = 1; p <= 100; p += 9) {
    const r = rankBids(bundle, [tested, { ...cheap, price_usdc: p }]);
    assert.equal(r[0].bid_id, 'b-tested');
  }
});
test('a bid above the ceiling ranks last with score 0', () => {
  const r = rankBids(bundle, [over, cheap]);
  assert.equal(r.at(-1)!.bid_id, 'b-over');
  assert.equal(r.at(-1)!.score, 0);
});
test('track record and tier count', () => {
  const r = rankBids(bundle, [tested, { ...tested, bid_id: 'b-vet', agent: 'vet' }], { vet: { delivered: 4, accepted: 4, cerberus_tier: 2 } });
  assert.equal(r[0].bid_id, 'b-vet');
});
