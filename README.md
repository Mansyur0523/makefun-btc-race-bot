# BTC Race Bot — Momentum Burst

[![make.fun · btc-race-24h-20261115-0828](https://make.fun/badge/btc-race-24h-20261115-0828.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![rank](https://make.fun/badge/btc-race-24h-20261115-0828/Mansyur0523/makefun-btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![reward](https://make.fun/badge/btc-race-24h-20261115-0828/Mansyur0523/makefun-btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)

Bot trading long-only untuk lomba BTC 24 jam di make.fun: memperdagangkan
cbBTC/USDC dari 1.000 USDC modal kertas, satu bar per menit, lewat protokol
`agent-fun/bars-replay/v1`.

## Strategi: momentum burst

Diukur di dev window (1.440 bar, BTC turun 4% hari itu): mean reversion
rugi (menangkap pisau jatuh) dan EMA-cross rugi besar (63 trade, −$135).
Yang berhasil adalah diam di cash saat pasar hanyut, lalu masuk penuh
hanya saat ada lonjakan naik yang nyata, dan membiarkan pemenang berjalan
dengan trailing stop lebar + batas waktu.

- **Masuk**: close naik > 50 bps dalam 8 bar terakhir DAN naik dari bar
  sebelumnya. Ukuran penuh (100% cash), satu posisi saja.
- **Keluar** (seluruh posisi): stop-loss 120 bps di bawah harga fill masuk,
  trailing stop 200 bps di bawah close tertinggi sejak masuk, atau sudah
  dipegang 120 bar — mana yang lebih dulu.
- **Disiplin**: tidak masuk lagi dalam 15 bar setelah jual (tidak mengejar
  puncak), dan tidak buka posisi baru di 45 bar terakhir window (posisi
  yang dibuka di sana tidak sempat matang sebelum flatten akhir).

Tanpa lookahead (hanya close sampai bar berjalan), tanpa randomness,
tanpa jam dinding, tanpa network, tanpa model call — deterministik penuh.

## Hasil di dev window (grader lokal kit, `grade-local --driver process`)

| | Net PnL | Trade | Max drawdown |
|---|---|---|---|
| Paruh 1 (720 bar) | +$2,26 | — | — |
| Paruh 2 (720 bar) | +$17,33 | — | — |
| **Window penuh (1.440 bar)** | **+$19,60** | **8** | **2,91%** |

Pembanding baseline (grader yang sama): buy-and-hold −$44,01, momentum
−$40,92, RSI-Bollinger −$57,37, ADX-momentum −$86,60, EMA-cross −$134,95,
hold-cash $0 (tidak lolos gate).

## Cara jalan

Entrypoint: `main.ts` (Node 22, type stripping, erasable TS). `vendor/`
berisi salinan byte-identik SDK kit (`makefun-bars.ts`).

```sh
# grading lokal dengan kit (dari direktori kit yang sudah di-download):
node cli/makefun.mjs grade-local --kit . --bot <path-ke-repo-ini> --driver process
```

## Lisensi

MIT — lihat `LICENSE`.
