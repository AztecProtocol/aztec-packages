# Gas Benchmark Report

## IGNITION

### Configuration

| Parameter             | Value |
|-----------------------|-------|
| Slot Duration         |    60 |
| Epoch Duration        |    48 |
| Target Committee Size |    24 |
| Mana Target           |     0 |

### No Validators (IGNITION)

| Function             |     Avg |     Max |
|----------------------|---------|---------|
| propose              | 180,182 | 195,380 |
| setupEpoch           |  40,785 | 103,864 |
| submitEpochRootProof | 799,356 | 819,960 |

**Avg Gas Cost per Second**: 3,294.7 gas/second
*(Epoch duration: 0h 48m 0s)*

### Validators (IGNITION)

| Function             |     Avg |     Max |
|----------------------|---------|---------|
| propose              | 284,434 | 300,076 |
| setupEpoch           |  48,311 | 354,729 |
| submitEpochRootProof | 799,356 | 819,960 |
| aggregate3           | 331,654 | 351,870 |

**Avg Gas Cost per Second**: 5,034.9 gas/second
*(Epoch duration: 0h 48m 0s)*


## Alpha

### Configuration

| Parameter             |       Value |
|-----------------------|-------------|
| Slot Duration         |          36 |
| Epoch Duration        |          32 |
| Target Committee Size |          48 |
| Mana Target           | 100,000,000 |

### No Validators (Alpha)

| Function             |     Avg |     Max |
|----------------------|---------|---------|
| propose              | 219,022 | 235,012 |
| setupEpoch           |  41,912 | 106,381 |
| submitEpochRootProof | 671,999 | 710,831 |

**Gas Cost per Second**: 6,703.7 gas/second
*(Epoch duration: 0h 19m 12s)*

### Validators (Alpha)

| Function             |     Avg |     Max |
|----------------------|---------|---------|
| propose              | 419,406 | 435,627 |
| setupEpoch           |  61,658 | 600,014 |
| submitEpochRootProof | 671,999 | 710,831 |
| aggregate3           | 471,485 | 495,734 |

**Gas Cost per Second**: 12,287.0 gas/second
*(Epoch duration: 0h 19m 12s)*

