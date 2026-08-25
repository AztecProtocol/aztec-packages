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
| propose              | 199,674 |   225,858 |           996 |       15,936 |
| submitEpochRootProof | 991,073 | 1,029,566 |        14,148 |      226,368 |
| setupEpoch           |  32,042 |   113,837 |             - |            - |

**Avg Gas Cost per Second**: 3,647.5 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             |   Avg Gas |   Max Gas | Calldata Size | Calldata Gas |
|----------------------|-----------|-----------|---------------|--------------|
| propose              |   328,086 |   355,904 |         4,516 |       72,256 |
| submitEpochRootProof | 1,572,122 | 1,669,962 |        16,644 |      266,304 |
| aggregate3           |   376,978 |   390,352 |             - |            - |
| setupEpoch           |    46,504 |   547,670 |             - |            - |

**Avg Gas Cost per Second**: 5,941.6 gas/second
*Epoch duration*: 0h 38m 24s

