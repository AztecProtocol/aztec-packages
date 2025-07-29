# Gas Benchmark Report

## IGNITION

### Configuration

| Parameter             | Value |
|-----------------------|-------|
| Slot Duration         |    60 |
| Epoch Duration        |    48 |
| Target Committee Size |    24 |
| Mana Target           |     0 |
| Proofs per Epoch      |  2.00 |

### No Validators (IGNITION)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 192,119 | 207,397 |         1,060 |       16,960 |
| submitEpochRootProof | 813,442 | 834,067 |         3,812 |       60,992 |
| setupEpoch           |  40,849 | 108,446 |             - |            - |

**Avg Gas Cost per Second**: 3,781.1 gas/second
*Epoch duration*: 0h 48m 0s

### Validators (IGNITION)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 250,072 | 265,515 |         2,852 |       45,632 |
| submitEpochRootProof | 923,880 | 944,511 |         5,092 |       81,472 |
| aggregate3           | 297,537 | 316,779 |             - |            - |
| setupEpoch           |  48,233 | 354,577 |             - |            - |

**Avg Gas Cost per Second**: 4,826.2 gas/second
*Epoch duration*: 0h 48m 0s


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
| propose              | 230,021 | 246,987 |         1,060 |       16,960 |
| submitEpochRootProof | 686,752 | 725,612 |         3,812 |       60,992 |
| setupEpoch           |  42,024 | 110,967 |             - |            - |

**Avg Gas Cost per Second**: 7,618.2 gas/second
*Epoch duration*: 0h 19m 12s

### Validators (Alpha)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 337,105 | 355,679 |         4,580 |       73,280 |
| submitEpochRootProof | 894,446 | 932,423 |         6,308 |      100,928 |
| aggregate3           | 389,549 | 411,347 |             - |            - |
| setupEpoch           |  61,573 | 599,674 |             - |            - |

**Avg Gas Cost per Second**: 10,970.3 gas/second
*Epoch duration*: 0h 19m 12s

