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
| submitEpochRootProof | 925,461 | 966,507 |        14,212 |      227,392 |
| setupEpoch           |  32,020 | 113,815 |             - |            - |

**Avg Gas Cost per Second**: 3,576.4 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             |   Avg Gas |   Max Gas | Calldata Size | Calldata Gas |
|----------------------|-----------|-----------|---------------|--------------|
| propose              |   327,074 |   354,847 |         4,516 |       72,256 |
| submitEpochRootProof | 1,505,353 | 1,605,843 |        16,708 |      267,328 |
| aggregate3           |   376,090 |   389,450 |             - |            - |
| setupEpoch           |    46,482 |   547,648 |             - |            - |

**Avg Gas Cost per Second**: 5,869.6 gas/second
*Epoch duration*: 0h 38m 24s

