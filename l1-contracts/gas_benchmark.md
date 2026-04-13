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
| submitEpochRootProof | 698,976 | 744,776 |         2,820 |       45,120 |
| setupEpoch           |  31,965 | 113,616 |             - |            - |

**Avg Gas Cost per Second**: 3,331.7 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 322,945 | 350,085 |         4,452 |       71,232 |
| submitEpochRootProof | 897,150 | 942,954 |         5,316 |       85,056 |
| aggregate3           | 371,401 | 384,831 |             - |            - |
| setupEpoch           |  46,426 | 547,449 |             - |            - |

**Avg Gas Cost per Second**: 5,284.3 gas/second
*Epoch duration*: 0h 38m 24s
