# Gas Benchmark Report

## IGNITION

### Configuration

| Parameter             | Value |
| --------------------- | ----- |
| Slot Duration         | 192   |
| Epoch Duration        | 48    |
| Target Committee Size | 24    |
| Mana Target           | 0     |
| Proofs per Epoch      | 2.00  |

### No Validators (IGNITION)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
| -------------------- | ------- | ------- | ------------- | ------------ |
| propose              | 152,588 | 169,115 | 1,060         | 16,960       |
| submitEpochRootProof | 813,529 | 834,154 | 3,812         | 60,992       |
| setupEpoch           | 40,851  | 108,494 | -             | -            |

**Avg Gas Cost per Second**: 975.7 gas/second
_Epoch duration_: 2h 33m 36s

### Validators (IGNITION)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
| -------------------- | ------- | ------- | ------------- | ------------ |
| propose              | 210,524 | 227,224 | 2,852         | 45,632       |
| submitEpochRootProof | 923,925 | 944,538 | 5,092         | 81,472       |
| aggregate3           | 257,967 | 281,783 | -             | -            |
| setupEpoch           | 47,411  | 327,181 | -             | -            |

**Avg Gas Cost per Second**: 1,302.1 gas/second
_Epoch duration_: 2h 33m 36s

## Alpha

### Configuration

| Parameter             | Value       |
| --------------------- | ----------- |
| Slot Duration         | 36          |
| Epoch Duration        | 32          |
| Target Committee Size | 48          |
| Mana Target           | 100,000,000 |
| Proofs per Epoch      | 2.00        |

### No Validators (Alpha)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
| -------------------- | ------- | ------- | ------------- | ------------ |
| propose              | 230,543 | 247,509 | 1,060         | 16,960       |
| submitEpochRootProof | 686,839 | 725,699 | 3,812         | 60,992       |
| setupEpoch           | 42,026  | 111,015 | -             | -            |

**Avg Gas Cost per Second**: 7,632.9 gas/second
_Epoch duration_: 0h 19m 12s

### Validators (Alpha)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
| -------------------- | ------- | ------- | ------------- | ------------ |
| propose              | 337,639 | 356,213 | 4,580         | 73,280       |
| submitEpochRootProof | 894,533 | 932,510 | 6,308         | 100,928      |
| aggregate3           | 390,061 | 411,859 | -             | -            |
| setupEpoch           | 59,378  | 544,822 | -             | -            |

**Avg Gas Cost per Second**: 10,983.4 gas/second
_Epoch duration_: 0h 19m 12s
