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
| propose              | 152,610 | 169,137 |         1,060 |       16,960 |
| submitEpochRootProof | 813,442 | 834,067 |         3,812 |       60,992 |
| setupEpoch           |  40,849 | 108,446 |             - |            - |

**Avg Gas Cost per Second**: 975.8 gas/second
*Epoch duration*: 2h 33m 36s

### Validators (IGNITION)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 210,546 | 227,246 |         2,852 |       45,632 |
| submitEpochRootProof | 923,838 | 944,451 |         5,092 |       81,472 |
| aggregate3           | 258,011 | 281,827 |             - |            - |
| setupEpoch           |  48,233 | 354,577 |             - |            - |

**Avg Gas Cost per Second**: 1,302.3 gas/second
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
| propose              | 230,565 | 247,531 |         1,060 |       16,960 |
| submitEpochRootProof | 686,752 | 725,612 |         3,812 |       60,992 |
| setupEpoch           |  42,024 | 110,967 |             - |            - |

**Avg Gas Cost per Second**: 7,633.3 gas/second
*Epoch duration*: 0h 19m 12s

### Validators (Alpha)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 337,661 | 356,235 |         4,580 |       73,280 |
| submitEpochRootProof | 894,446 | 932,423 |         6,308 |      100,928 |
| aggregate3           | 390,106 | 411,903 |             - |            - |
| setupEpoch           |  61,573 | 599,674 |             - |            - |

**Avg Gas Cost per Second**: 10,985.8 gas/second
*Epoch duration*: 0h 19m 12s

