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

*No gas data available*

### Validators (IGNITION)

*No gas data available*


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
| propose              | 196,032 | 222,246 |           932 |       14,912 |
| submitEpochRootProof | 699,535 | 745,418 |         2,820 |       45,120 |
| setupEpoch           |  31,976 | 113,771 |             - |            - |

**Avg Gas Cost per Second**: 6,687.6 gas/second
*Epoch duration*: 0h 19m 12s

### Validators (Alpha)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 323,903 | 351,075 |         4,452 |       71,232 |
| submitEpochRootProof | 898,088 | 944,045 |         5,316 |       85,056 |
| aggregate3           | 372,575 | 385,916 |             - |            - |
| setupEpoch           |  46,437 | 547,604 |             - |            - |

**Avg Gas Cost per Second**: 10,596.8 gas/second
*Epoch duration*: 0h 19m 12s

