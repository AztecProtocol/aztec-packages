# Gas Benchmark Report

## Configuration

| Parameter             |       Value |
|-----------------------|-------------|
| Slot Duration         |          72 |
| Epoch Duration        |          32 |
| Target Committee Size |          48 |
| Mana Target           | 100,000,000 |
| Proofs per Epoch      |        2.00 |

## No Validators

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 195,201 | 221,411 |           932 |       14,912 |
| submitEpochRootProof | 698,954 | 744,754 |         2,820 |       45,120 |
| setupEpoch           |  32,010 | 113,661 |             - |            - |

**Avg Gas Cost per Second**: 3,331.7 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 322,945 | 350,085 |         4,452 |       71,232 |
| submitEpochRootProof | 897,128 | 942,932 |         5,316 |       85,056 |
| aggregate3           | 371,446 | 384,876 |             - |            - |
| setupEpoch           |  46,471 | 547,494 |             - |            - |

**Avg Gas Cost per Second**: 5,284.3 gas/second
*Epoch duration*: 0h 38m 24s
