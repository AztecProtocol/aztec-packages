# Gas Benchmark Report

## Configuration

| Parameter             |       Value |
|-----------------------|-------------|
| Slot Duration         |          72 |
| Epoch Duration        |          32 |
| Target Committee Size |          48 |
| Mana Target           | 100,000,000 |
| Proofs per Epoch      |        2.00 |

## No Validators

| Function             |   Avg Gas |   Max Gas | Calldata Size | Calldata Gas |
|----------------------|-----------|-----------|---------------|--------------|
| propose              |   198,220 |   224,403 |           996 |       15,936 |
| submitEpochRootProof | 1,007,926 | 1,046,916 |        14,148 |      226,368 |
| setupEpoch           |    32,020 |   113,815 |             - |            - |

**Avg Gas Cost per Second**: 3,641.9 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             |   Avg Gas |   Max Gas | Calldata Size | Calldata Gas |
|----------------------|-----------|-----------|---------------|--------------|
| propose              |   326,630 |   354,402 |         4,516 |       72,256 |
| submitEpochRootProof | 1,588,977 | 1,687,377 |        16,644 |      266,304 |
| aggregate3           |   375,623 |   388,983 |             - |            - |
| setupEpoch           |    46,482 |   547,648 |             - |            - |

**Avg Gas Cost per Second**: 5,936.0 gas/second
*Epoch duration*: 0h 38m 24s

