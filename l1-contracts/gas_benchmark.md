# Gas Benchmark Report

## IGNITION

### Configuration

| Parameter             | Value |
|-----------------------|-------|
| Slot Duration         |   192 |
| Epoch Duration        |    48 |
| Target Committee Size |    24 |
| Mana Target           |     0 |
| Proofs per Epoch      |  2.00 |

### No Validators (IGNITION)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 141,065 | 157,701 |         1,060 |       16,960 |
| submitEpochRootProof | 556,226 | 591,073 |         3,812 |       60,992 |
| setupEpoch           |  31,172 | 110,940 |             - |            - |

**Avg Gas Cost per Second**: 858.8 gas/second
*Epoch duration*: 2h 33m 36s

### Validators (IGNITION)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 208,357 | 227,227 |         2,852 |       45,632 |
| submitEpochRootProof | 668,084 | 701,700 |         5,092 |       81,472 |
| aggregate3           | 266,755 | 282,020 |             - |            - |
| setupEpoch           |  36,638 | 329,613 |             - |            - |

**Avg Gas Cost per Second**: 1,234.2 gas/second
*Epoch duration*: 2h 33m 36s


## Alpha

### Configuration

| Parameter             |       Value |
|-----------------------|-------------|
| Slot Duration         |          36 |
| Epoch Duration        |          32 |
| Target Committee Size |          48 |
| Mana Target           | 100,000,000 |
| Proofs per Epoch      |        2.00 |

### No Validators (Alpha)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 219,686 | 235,962 |         1,060 |       16,960 |
| submitEpochRootProof | 682,260 | 726,001 |         3,812 |       60,992 |
| setupEpoch           |  31,832 | 110,940 |             - |            - |

**Avg Gas Cost per Second**: 7,314.5 gas/second
*Epoch duration*: 0h 19m 12s

### Validators (Alpha)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 335,463 | 352,298 |         4,580 |       73,280 |
| submitEpochRootProof | 890,592 | 933,081 |         6,308 |      100,928 |
| aggregate3           | 393,732 | 406,787 |             - |            - |
| setupEpoch           |  46,292 | 544,725 |             - |            - |

**Avg Gas Cost per Second**: 10,904.8 gas/second
*Epoch duration*: 0h 19m 12s

