// Momentum-burst bot for the BTC 24h race (cbBTC/USDC, 1-minute bars).
//
// Idea, measured on the published dev window (1440 bars, BTC -4% that day):
// mean reversion loses (it catches falling knives) and plain EMA crosses
// whipsaw (63 trades, -$135). What works is staying in cash through the
// drift and buying only a sharp upward burst, then letting a winner run
// with a wide trailing stop and a hard time cap. Every trade must clear a
// ~26 bps round trip, so the entry needs a real move, not noise.
//
//   - Entry: the close is up more than 50 bps over the last 8 closes and
//     up on the latest bar. Full size (100% of cash), one position only.
//   - Exit (whole position): stop-loss 120 bps under the entry fill price,
//     trailing stop 200 bps under the highest close since entry, or 120
//     bars held, whichever comes first.
//   - Discipline: no re-entry within 15 bars of a sell (stops chasing a
//     top right after an exit), and no new entries in the last 45 bars
//     (a position opened there cannot mature before the final flatten).
//
// No lookahead: only closes up to the bar being answered. No randomness,
// no clock, no network, no model calls. Deterministic float64 math only,
// so the two graded executions produce identical action logs.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Entry: close up more than this over the last BURST_BARS closes. */
const BURST_BARS = 8;
const BURST_BPS = 50;
/** Exit: stop-loss under the entry fill price, in bps. */
const STOP_BPS = 120;
/** Exit: trailing stop under the highest close since entry, in bps. */
const TRAIL_BPS = 200;
/** Exit: maximum bars held. */
const MAX_HOLD_BARS = 120;
/** No re-entry within this many bars of a sell decision. */
const COOLDOWN_BARS = 15;
/** No new entries once this many scored bars remain in the window. */
const NO_ENTRY_LAST_BARS = 45;
/** The race window is 1440 one-minute bars. */
const WINDOW_BARS = 1440;
/** Slippage cap on every order (1% past the close it was decided on). */
const MAX_SLIPPAGE_BPS = 100;

const closes: number[] = [];
/** Scored (non-warm-up) bars seen so far. */
let bar = 0;
/** Entry fill price (price-scale units) once a buy has filled. */
let entryPx: number | null = null;
/** Scored-bar index of the buy decision that opened the position. */
let entryBar = -1;
/** Highest close since entry (starts at the fill price). */
let peakPx: number | null = null;
/** Scored-bar index of the latest sell decision. */
let lastSellBar = -1e9;
/** Scored-bar index of a buy decision whose fill has not arrived yet. */
let pendingBuyBar = -1;

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    // Fold this batch's fills in first: a buy that filled sets the entry
    // price the stop-loss and trailing stop are measured from.
    for (const fill of batch.fills) {
      if (fill.symbol !== SYMBOL) continue;
      if (fill.side === 'buy' && fill.status === 'filled') {
        entryPx = Number(fill.price);
        entryBar = pendingBuyBar;
        peakPx = entryPx;
        pendingBuyBar = -1;
      } else if (fill.side === 'buy' && fill.status === 'rejected') {
        // A rejected buy must not leave a stale decision bar behind: the
        // max-hold clock of a later fill starts at its own decision.
        pendingBuyBar = -1;
      } else if (fill.side === 'sell' && fill.status === 'filled') {
        entryPx = null;
        entryBar = -1;
        peakPx = null;
      }
    }

    const held = state.positions.get(SYMBOL);
    let fresh = false;
    for (const b of batch.bars) {
      if (b.symbol !== SYMBOL) continue;
      fresh = true;
      const c = Number(b.c);
      closes.push(c);
      if (held !== undefined && peakPx !== null && c > peakPx) peakPx = c;
    }

    if (state.warmingUp) return [];
    bar++;
    // A batch with no bar for this symbol carries no new information:
    // never decide an entry or an exit on a stale close.
    if (!fresh) return [];

    // --- exits: whole position, checked in order -------------------------
    if (held !== undefined && entryPx !== null) {
      const px = closes[closes.length - 1]!;
      const stopPx = (entryPx * (10_000 - STOP_BPS)) / 10_000;
      const trailPx = peakPx !== null ? (peakPx * (10_000 - TRAIL_BPS)) / 10_000 : -Infinity;
      if (px <= stopPx || px <= trailPx || bar - entryBar >= MAX_HOLD_BARS) {
        lastSellBar = bar;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }

    // --- entries ----------------------------------------------------------
    if (bar >= WINDOW_BARS - NO_ENTRY_LAST_BARS) return [];
    if (bar - lastSellBar < COOLDOWN_BARS) return [];
    if (closes.length < BURST_BARS + 1) return [];
    const now = closes[closes.length - 1]!;
    const prev = closes[closes.length - 2]!;
    const eightAgo = closes[closes.length - 1 - BURST_BARS]!;
    const burst = now * 10_000 > eightAgo * (10_000 + BURST_BPS);
    if (burst && now > prev) {
      const cash = state.cash;
      if (cash < 1_000_000n) return [];
      pendingBuyBar = bar;
      const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS };
      return [buy];
    }
    return [];
  },
});
