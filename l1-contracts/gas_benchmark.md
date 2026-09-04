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
| propose              |   200,097 |   226,280 |           996 |       15,936 |
| submitEpochRootProof | 1,035,434 | 1,074,129 |        14,148 |      226,368 |
| setupEpoch           |    32,020 |   113,815 |             - |            - |

**Avg Gas Cost per Second**: 3,691.8 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             |   Avg Gas |   Max Gas | Calldata Size | Calldata Gas |
|----------------------|-----------|-----------|---------------|--------------|
| propose              |   328,507 |   356,323 |         4,516 |       72,256 |
| submitEpochRootProof | 1,616,774 | 1,714,815 |        16,644 |      266,304 |
| aggregate3           |   377,506 |   390,880 |             - |            - |
| setupEpoch           |    46,482 |   547,648 |             - |            - |

**Avg Gas Cost per Second**: 5,986.2 gas/second
*Epoch duration*: 0h 38m 24s

