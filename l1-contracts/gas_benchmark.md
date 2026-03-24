# Gas Benchmark Report

## Configuration

| Parameter             |      Value |
|-----------------------|------------|
| Slot Duration         |         72 |
| Epoch Duration        |         32 |
| Target Committee Size |         48 |
| Mana Target           | 75,000,000 |
| Proofs per Epoch      |       2.00 |

## No Validators

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 217,132 | 249,840 |           932 |       14,912 |
| submitEpochRootProof | 730,629 | 773,793 |         2,820 |       45,120 |
| setupEpoch           |  32,290 | 113,616 |             - |            - |

**Avg Gas Cost per Second**: 3,664.0 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             | Avg Gas | Max Gas | Calldata Size | Calldata Gas |
|----------------------|---------|---------|---------------|--------------|
| propose              | 344,069 | 380,858 |         4,452 |       71,232 |
| submitEpochRootProof | 928,215 | 971,421 |         5,316 |       85,056 |
| aggregate3           | 392,709 | 406,123 |             - |            - |
| setupEpoch           |  46,426 | 547,449 |             - |            - |

**Avg Gas Cost per Second**: 5,604.6 gas/second
*Epoch duration*: 0h 38m 24s

