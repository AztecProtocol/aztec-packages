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
| submitEpochRootProof | 908,757 | 950,203 |        14,212 |      227,392 |
| setupEpoch           |  32,020 | 113,815 |             - |            - |

**Avg Gas Cost per Second**: 3,561.9 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             |   Avg Gas |   Max Gas | Calldata Size | Calldata Gas |
|----------------------|-----------|-----------|---------------|--------------|
| propose              |   327,076 |   354,943 |         4,516 |       72,256 |
| submitEpochRootProof | 1,490,768 | 1,591,582 |        16,708 |      267,328 |
| aggregate3           |   375,964 |   389,343 |             - |            - |
| setupEpoch           |    46,482 |   547,648 |             - |            - |

**Avg Gas Cost per Second**: 5,857.0 gas/second
*Epoch duration*: 0h 38m 24s

