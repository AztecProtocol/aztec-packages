# Gas Benchmark Report

## Configuration

| Parameter             |       Value |
|-----------------------|-------------|
| Slot Duration         |          72 |
| Epoch Duration        |          32 |
| Target Committee Size |          48 |
| Mana Target           | 100,000,000 |
| Proofs per Epoch      |        2.00 |

## Methodology

Each scenario runs `BenchmarkRollupTest` end-to-end across a long slot range and records
one sample per measured call (`setupEpoch`, `propose`, `proposeAndVote`, `submitEpochRootProof`)
via `gasleft()` deltas. Raw per-sample data is in `bench-out/raw_<scenario>.jsonl`.

- Forge runs **without** `FORGE_GAS_REPORT` so the EVM trace does not inflate per-call gas
  accounting. Numbers reflect real L1 execution gas, which means they may differ from older
  reports that were generated with the tracer enabled.
- The proposer-side `propose` call has `skipBlobCheck` applied beforehand, so the live
  `blobhash()` equality check is *not* charged. Add ~50k gas per blob for production cost.
- The slashing scenario reports both `propose` (rounds before tally voting becomes active)
  and `proposeAndVote` (the multicall transaction once tally voting is active).
- Calldata gas uses real zero/non-zero byte counts. The EIP-7623 column applies the floor
  pricing rule using the median execution gas of the same flow.

## No Validators

| Flow                 | Samples |  Median |     p95 |     Min |     Max |    Mean | Calldata Bytes | Calldata Gas (EIP-7623) |
|----------------------|---------|---------|---------|---------|---------|---------|----------------|-------------------------|
| setupEpoch           |     150 |   2,244 |   2,244 |   2,244 |  66,492 |   4,295 |              - |                       - |
| propose              |     150 |  94,512 | 110,657 |  90,362 | 130,093 | 100,023 |            932 |                   7,052 |
| submitEpochRootProof |       4 | 436,163 | 499,452 | 430,012 | 510,621 | 452,969 |          2,820 |                  22,368 |

**Median Gas/Second**: 1,692.3 gas/second
*Epoch duration*: 0h 38m 24s

## 100 Validators

| Flow                 | Samples |  Median |     p95 |     Min |     Max |    Mean | Calldata Bytes | Calldata Gas (EIP-7623) |
|----------------------|---------|---------|---------|---------|---------|---------|----------------|-------------------------|
| setupEpoch           |     150 |   2,244 |   2,244 |   2,244 | 303,305 |  12,263 |              - |                       - |
| propose              |     150 | 253,834 | 318,394 | 182,472 | 330,917 | 256,371 |          4,452 |                  59,268 |
| submitEpochRootProof |       4 | 713,068 | 745,824 | 671,075 | 751,604 | 711,850 |          5,316 |                  61,704 |

**Median Gas/Second**: 4,145.4 gas/second
*Epoch duration*: 0h 38m 24s

## 100 Validators + Slashing

| Flow                 | Samples |  Median |     p95 |     Min |     Max |    Mean | Calldata Bytes | Calldata Gas (EIP-7623) |
|----------------------|---------|---------|---------|---------|---------|---------|----------------|-------------------------|
| setupEpoch           |     150 |   2,244 |   2,244 |   2,244 | 303,305 |  12,263 |              - |                       - |
| propose              |      95 | 234,753 | 264,034 | 182,462 | 276,973 | 231,593 |          4,452 |                  59,268 |
| proposeAndVote       |      55 | 370,112 | 411,115 | 324,495 | 414,213 | 369,903 |          5,092 |                  63,616 |
| submitEpochRootProof |       4 | 713,299 | 756,778 | 670,405 | 764,451 | 714,938 |          5,316 |                  61,704 |

**Median Gas/Second**: 5,760.6 gas/second
*Epoch duration*: 0h 38m 24s
