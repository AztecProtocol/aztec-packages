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
| propose              | 152,636 | 169,163 |         1,060 |       16,960 |
| submitEpochRootProof | 569,680 | 592,896 |         3,812 |       60,992 |
| setupEpoch           |  40,851 | 108,516 |             - |            - |

**Avg Gas Cost per Second**: 923.0 gas/second
*Epoch duration*: 2h 33m 36s

### Validators (IGNITION)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 210,572 | 227,272 |         2,852 |       45,632 |
| submitEpochRootProof | 680,076 | 703,280 |         5,092 |       81,472 |
| aggregate3           | 258,015 | 281,831 |             - |            - |
| setupEpoch           |  47,412 | 327,203 |             - |            - |

**Avg Gas Cost per Second**: 1,249.5 gas/second
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
| propose              | 230,591 | 247,557 |         1,060 |       16,960 |
| submitEpochRootProof | 689,341 | 728,196 |         3,812 |       60,992 |
| setupEpoch           |  42,027 | 111,037 |             - |            - |

**Avg Gas Cost per Second**: 7,638.6 gas/second
*Epoch duration*: 0h 19m 12s

### Validators (Alpha)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 337,687 | 356,261 |         4,580 |       73,280 |
| submitEpochRootProof | 897,035 | 935,007 |         6,308 |      100,928 |
| aggregate3           | 390,110 | 411,907 |             - |            - |
| setupEpoch           |  59,379 | 544,844 |             - |            - |

**Avg Gas Cost per Second**: 10,989.1 gas/second
*Epoch duration*: 0h 19m 12s

