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
| propose              | 142,569 | 157,723 |         1,060 |       16,960 |
| submitEpochRootProof | 567,842 | 591,073 |         3,812 |       60,992 |
| setupEpoch           |  31,585 | 108,397 |             - |            - |

**Avg Gas Cost per Second**: 869.2 gas/second
*Epoch duration*: 2h 33m 36s

### Validators (IGNITION)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 207,888 | 227,249 |         2,852 |       45,632 |
| submitEpochRootProof | 679,690 | 701,700 |         5,092 |       81,472 |
| aggregate3           | 245,657 | 265,021 |             - |            - |
| setupEpoch           |  38,145 | 327,074 |             - |            - |

**Avg Gas Cost per Second**: 1,234.4 gas/second
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
| propose              | 219,926 | 235,984 |         1,060 |       16,960 |
| submitEpochRootProof | 687,107 | 726,001 |         3,812 |       60,992 |
| setupEpoch           |  32,376 | 108,397 |             - |            - |

**Avg Gas Cost per Second**: 7,330.1 gas/second
*Epoch duration*: 0h 19m 12s

### Validators (Alpha)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 334,960 | 352,320 |         4,580 |       73,280 |
| submitEpochRootProof | 895,025 | 933,081 |         6,308 |      100,928 |
| aggregate3           | 373,092 | 390,455 |             - |            - |
| setupEpoch           |  49,728 | 542,190 |             - |            - |

**Avg Gas Cost per Second**: 10,901.5 gas/second
*Epoch duration*: 0h 19m 12s

