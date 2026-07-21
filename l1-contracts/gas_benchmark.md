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
| propose              | 195,988 | 222,201 |           932 |       14,912 |
| submitEpochRootProof | 697,655 | 743,529 |         2,820 |       45,120 |
| setupEpoch           |  31,998 | 113,793 |             - |            - |

**Avg Gas Cost per Second**: 3,341.5 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 324,449 | 351,604 |         4,452 |       71,232 |
| submitEpochRootProof | 896,101 | 941,944 |         5,316 |       85,056 |
| aggregate3           | 373,118 | 386,457 |             - |            - |
| setupEpoch           |  46,459 | 547,626 |             - |            - |

**Avg Gas Cost per Second**: 5,304.3 gas/second
*Epoch duration*: 0h 38m 24s

