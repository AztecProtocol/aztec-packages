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

| Function             |     Avg |     Max |
|----------------------|---------|---------|
| propose              | 192,119 | 207,397 |
| setupEpoch           |  40,849 | 108,446 |
| submitEpochRootProof | 813,442 | 834,067 |

**Avg Gas Cost per Second**: 3,781.1 gas/second
*Epoch duration*: 0h 48m 0s

### Validators (IGNITION)

| Function             |     Avg |     Max |
|----------------------|---------|---------|
| propose              | 250,072 | 265,515 |
| setupEpoch           |  48,233 | 354,577 |
| submitEpochRootProof | 923,880 | 944,511 |
| aggregate3           | 297,537 | 316,779 |

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

| Function             |     Avg |     Max |
|----------------------|---------|---------|
| propose              | 230,021 | 246,987 |
| setupEpoch           |  42,024 | 110,967 |
| submitEpochRootProof | 686,752 | 725,612 |

**Avg Gas Cost per Second**: 7,618.2 gas/second
*Epoch duration*: 0h 19m 12s

### Validators (Alpha)

| Function             |     Avg |     Max |
|----------------------|---------|---------|
| propose              | 337,105 | 355,679 |
| setupEpoch           |  61,573 | 599,674 |
| submitEpochRootProof | 894,446 | 932,423 |
| aggregate3           | 389,549 | 411,347 |

**Avg Gas Cost per Second**: 10,970.3 gas/second
*Epoch duration*: 0h 19m 12s

