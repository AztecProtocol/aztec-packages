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

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 198,659 | 224,842 |           996 |       15,936 |
| submitEpochRootProof | 925,549 | 966,595 |        14,212 |      227,392 |
| setupEpoch           |  32,020 | 113,815 |             - |            - |

**Avg Gas Cost per Second**: 3,576.5 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             |   Avg Gas |   Max Gas | Calldata Size | Calldata Gas |
|----------------------|-----------|-----------|---------------|--------------|
| propose              |   327,076 |   354,943 |         4,516 |       72,256 |
| submitEpochRootProof | 1,505,420 | 1,605,835 |        16,708 |      267,328 |
| aggregate3           |   376,117 |   389,496 |             - |            - |
| setupEpoch           |    46,482 |   547,648 |             - |            - |

**Avg Gas Cost per Second**: 5,869.7 gas/second
*Epoch duration*: 0h 38m 24s

