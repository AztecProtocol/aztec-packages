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
| propose              |   203,758 |   229,942 |           996 |       15,936 |
| submitEpochRootProof | 1,137,731 | 1,172,632 |        14,148 |      226,368 |
| setupEpoch           |    32,042 |   113,837 |             - |            - |

**Avg Gas Cost per Second**: 3,831.5 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             |   Avg Gas |   Max Gas | Calldata Size | Calldata Gas |
|----------------------|-----------|-----------|---------------|--------------|
| propose              |   332,170 |   359,988 |         4,516 |       72,256 |
| submitEpochRootProof | 1,719,902 | 1,814,124 |        16,644 |      266,304 |
| aggregate3           |   380,770 |   394,144 |             - |            - |
| setupEpoch           |    46,504 |   547,670 |             - |            - |

**Avg Gas Cost per Second**: 6,126.6 gas/second
*Epoch duration*: 0h 38m 24s

