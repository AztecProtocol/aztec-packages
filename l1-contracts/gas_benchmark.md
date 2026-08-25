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

| Function             | Avg Gas |   Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|-----------|---------------|--------------|
| propose              | 197,781 |   223,965 |           996 |       15,936 |
| submitEpochRootProof | 980,266 | 1,018,730 |        14,148 |      226,368 |
| setupEpoch           |  32,042 |   113,837 |             - |            - |

**Avg Gas Cost per Second**: 3,611.8 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             |   Avg Gas |   Max Gas | Calldata Size | Calldata Gas |
|----------------------|-----------|-----------|---------------|--------------|
| propose              |   326,198 |   354,016 |         4,516 |       72,256 |
| submitEpochRootProof | 1,561,332 | 1,659,142 |        16,644 |      266,304 |
| aggregate3           |   375,090 |   388,464 |             - |            - |
| setupEpoch           |    46,504 |   547,670 |             - |            - |

**Avg Gas Cost per Second**: 5,906.0 gas/second
*Epoch duration*: 0h 38m 24s

