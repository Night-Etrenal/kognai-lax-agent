/**
 * Prototype for the CEO ranking scorer (SEAT6). Pure and deterministic.
 * Weights: price 20, approach 40 (tests 20, scope 20), record 25, Cerberus tier 15.
 * Price points are only awarded to bids that plan tests, so a cheaper untested bid
 * can never outrank a tested one on price alone.
 */
export type Bundle = { id: string; ceiling_usdc: number };
export type Bid = { bid_id: string; agent: string; price_usdc: number; approach_md: string; delivery_by?: string };
export type AgentRecord = { delivered?: number; accepted?: number; rejected?: number; late?: number; cerberus_tier?: 0 | 1 | 2 | 3 };
export type Ranked = { bid_id: string; rank: number; score: number; reason: string };

const TEST_RE = /\b(tests?|testing|node:test|vitest|jest|unit|coverage|acceptance)\b/i;
const SCOPE_HINTS = [/\bA\d+\b/, /\bmilestones?\b|\bM1\b/i, /https:\/\/github\.com\//i, /\binterface\b|\bapi\b|\bmodule\b/i, /\b(edge|error|invalid|reject)/i];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function scoreBid(bundle: Bundle, bid: Bid, rec: AgentRecord | undefined) {
  const notes: string[] = [];
  const text = bid.approach_md ?? '';
  const overCeiling = !(bid.price_usdc > 0) || bid.price_usdc > bundle.ceiling_usdc;
  const tested = TEST_RE.test(text);

  const testPts = tested ? 20 : 0;
  notes.push(tested ? 'plans tests' : 'names no tests');

  const hits = SCOPE_HINTS.filter((r) => r.test(text)).length;
  const scopePts = (hits / SCOPE_HINTS.length) * 20;
  notes.push(`covers ${hits} of ${SCOPE_HINTS.length} scope signals`);

  let pricePts = 0;
  if (overCeiling) notes.push('price is missing or above the ceiling so the bid is ineligible');
  else if (!tested) notes.push('price earns nothing without planned tests');
  else {
    pricePts = (1 - bid.price_usdc / bundle.ceiling_usdc) * 15 + 5;
    notes.push(`asks ${bid.price_usdc} of a ${bundle.ceiling_usdc} USDC ceiling`);
  }

  const d = rec?.delivered ?? 0;
  const acc = rec?.accepted ?? 0;
  const bad = (rec?.rejected ?? 0) + (rec?.late ?? 0);
  const recordPts = d === 0 ? 8 : Math.max(0, Math.min(25, (acc / d) * 25 - bad * 3));
  notes.push(d === 0 ? 'has no delivery record yet, scored neutral' : `accepted ${acc} of ${d} past deliveries`);

  const tier = rec?.cerberus_tier ?? 0;
  const tierPts = tier * 5;
  notes.push(`holds Cerberus tier ${tier}`);

  const score = overCeiling ? 0 : round2(testPts + scopePts + pricePts + recordPts + tierPts);
  return { score, tested, overCeiling, notes };
}

export function rankBids(bundle: Bundle, bids: Bid[], records: Record<string, AgentRecord> = {}): Ranked[] {
  const scored = bids.map((b) => ({ b, s: scoreBid(bundle, b, records[b.agent]) }));
  scored.sort((x, y) =>
    Number(x.s.overCeiling) - Number(y.s.overCeiling) ||
    y.s.score - x.s.score ||
    x.b.price_usdc - y.b.price_usdc ||
    (x.b.bid_id < y.b.bid_id ? -1 : x.b.bid_id > y.b.bid_id ? 1 : 0));
  return scored.map(({ b, s }, i) => ({
    bid_id: b.bid_id,
    rank: i + 1,
    score: s.score,
    reason: `Bid ${b.bid_id} from ${b.agent} scores ${s.score} of 100 because it ${s.notes.join(', ')}.`,
  }));
}
