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
| propose              | 122,894 | 138,053 | 1,060         | 16,960       |
| submitEpochRootProof | 587,851 | 611,082 | 3,812         | 60,992       |
| setupEpoch           | 31,585  | 108,397 | -             | -            |

**Avg Gas Cost per Second**: 771.1 gas/second
_Epoch duration_: 2h 33m 36s

### Validators (IGNITION)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
| -------------------- | ------- | ------- | ------------- | ------------ |
| propose              | 187,303 | 206,641 | 2,852         | 45,632       |
| submitEpochRootProof | 699,663 | 721,613 | 5,092         | 81,472       |
| aggregate3           | 237,138 | 266,897 | -             | -            |
| setupEpoch           | 38,145  | 327,074 | -             | -            |

**Avg Gas Cost per Second**: 1,131.5 gas/second
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
| propose              | 221,792 | 239,181 | 1,060         | 16,960       |
| submitEpochRootProof | 707,115 | 746,009 | 3,812         | 60,992       |
| setupEpoch           | 32,376  | 108,397 | -             | -            |

**Avg Gas Cost per Second**: 7,416.6 gas/second
_Epoch duration_: 0h 19m 12s

### Validators (Alpha)

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
| -------------------- | ------- | ------- | ------------- | ------------ |
| propose              | 335,905 | 355,031 | 4,580         | 73,280       |
| submitEpochRootProof | 914,969 | 953,053 | 6,308         | 100,928      |
| aggregate3           | 388,154 | 415,662 | -             | -            |
| setupEpoch           | 49,728  | 542,190 | -             | -            |

**Avg Gas Cost per Second**: 10,962.3 gas/second
_Epoch duration_: 0h 19m 12s
