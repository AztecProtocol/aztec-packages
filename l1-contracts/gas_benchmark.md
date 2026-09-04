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
| propose              |   200,153 |   226,336 |           996 |       15,936 |
| submitEpochRootProof | 1,035,494 | 1,074,189 |        14,148 |      226,368 |
| setupEpoch           |    32,020 |   113,815 |             - |            - |

**Avg Gas Cost per Second**: 3,692.7 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             |   Avg Gas |   Max Gas | Calldata Size | Calldata Gas |
|----------------------|-----------|-----------|---------------|--------------|
| propose              |   328,561 |   356,377 |         4,516 |       72,256 |
| submitEpochRootProof | 1,616,834 | 1,714,875 |        16,644 |      266,304 |
| aggregate3           |   377,560 |   390,934 |             - |            - |
| setupEpoch           |    46,482 |   547,648 |             - |            - |

**Avg Gas Cost per Second**: 5,987.0 gas/second
*Epoch duration*: 0h 38m 24s

