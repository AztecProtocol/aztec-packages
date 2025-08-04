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
| propose              | 152,658 | 169,185 |         1,060 |       16,960 |
| submitEpochRootProof | 569,593 | 592,809 |         3,812 |       60,992 |
| setupEpoch           |  40,850 | 108,458 |             - |            - |

**Avg Gas Cost per Second**: 923.1 gas/second
*Epoch duration*: 2h 33m 36s

### Validators (IGNITION)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 210,594 | 227,294 |         2,852 |       45,632 |
| submitEpochRootProof | 679,989 | 703,193 |         5,092 |       81,472 |
| aggregate3           | 258,059 | 281,875 |             - |            - |
| setupEpoch           |  47,418 | 327,409 |             - |            - |

**Avg Gas Cost per Second**: 1,249.6 gas/second
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
| propose              | 230,613 | 247,579 |         1,060 |       16,960 |
| submitEpochRootProof | 689,254 | 728,109 |         3,812 |       60,992 |
| setupEpoch           |  42,025 | 110,979 |             - |            - |

**Avg Gas Cost per Second**: 7,639.0 gas/second
*Epoch duration*: 0h 19m 12s

### Validators (Alpha)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 337,709 | 356,283 |         4,580 |       73,280 |
| submitEpochRootProof | 896,948 | 934,920 |         6,308 |      100,928 |
| aggregate3           | 390,155 | 411,951 |             - |            - |
| setupEpoch           |  59,398 | 545,314 |             - |            - |

**Avg Gas Cost per Second**: 10,989.6 gas/second
*Epoch duration*: 0h 19m 12s

