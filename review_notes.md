# Core Contracts Review

## RollupCore

### checkBlob storage var
Since it's only for testing purposes and simulations would just like to confirm that this is not forgotten.

### isRewardsClaimable storage var
It mentions that it's a temporary mechanism.
--> Should be either removed or not mention that it's only temporary.

### constructor
Is it expected to happen that `_feeAsset` would ever be different from `_stakingAsset`?
