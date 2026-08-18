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

| Function             |   Avg Gas |   Max Gas | Calldata Size | Calldata Gas |
|----------------------|-----------|-----------|---------------|--------------|
| propose              |   196,596 |   222,810 |           964 |       15,424 |
| submitEpochRootProof | 1,000,225 | 1,038,384 |        14,084 |      225,344 |
| setupEpoch           |    32,042 |   113,837 |             - |            - |

**Avg Gas Cost per Second**: 3,612.7 gas/second
*Epoch duration*: 0h 38m 24s

## Validators

| Function             |   Avg Gas |   Max Gas | Calldata Size | Calldata Gas |
|----------------------|-----------|-----------|---------------|--------------|
| propose              |   324,981 |   352,180 |         4,484 |       71,744 |
| submitEpochRootProof | 1,581,276 | 1,678,797 |        16,580 |      265,280 |
| aggregate3           |   373,892 |   387,303 |             - |            - |
| setupEpoch           |    46,504 |   547,670 |             - |            - |

**Avg Gas Cost per Second**: 5,906.4 gas/second
*Epoch duration*: 0h 38m 24s

