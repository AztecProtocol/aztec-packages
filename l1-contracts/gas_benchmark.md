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
| submitEpochRootProof | 569,702 | 592,918 |         3,812 |       60,992 |
| setupEpoch           |  40,827 | 108,414 |             - |            - |

**Avg Gas Cost per Second**: 923.0 gas/second
*Epoch duration*: 2h 33m 36s

### Validators (IGNITION)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 210,504 | 227,206 |         2,852 |       45,632 |
| submitEpochRootProof | 680,098 | 703,302 |         5,092 |       81,472 |
| aggregate3           | 257,879 | 281,656 |             - |            - |
| setupEpoch           |  47,388 | 327,101 |             - |            - |

**Avg Gas Cost per Second**: 1,249.1 gas/second
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
| submitEpochRootProof | 689,363 | 728,218 |         3,812 |       60,992 |
| setupEpoch           |  42,002 | 110,935 |             - |            - |

**Avg Gas Cost per Second**: 7,638.6 gas/second
*Epoch duration*: 0h 19m 12s

### Validators (Alpha)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 337,553 | 355,991 |         4,580 |       73,280 |
| submitEpochRootProof | 897,057 | 935,029 |         6,308 |      100,928 |
| aggregate3           | 389,910 | 411,588 |             - |            - |
| setupEpoch           |  59,354 | 544,742 |             - |            - |

**Avg Gas Cost per Second**: 10,985.4 gas/second
*Epoch duration*: 0h 19m 12s

