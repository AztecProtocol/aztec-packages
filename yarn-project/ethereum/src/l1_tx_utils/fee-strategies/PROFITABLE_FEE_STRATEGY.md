# Profitable Priority Fee Strategy

## Overview

The `ProfitablePriorityFeeStrategy` is an oracle-aware fee strategy that ensures sequencer profitability by capping L1 priority fees based on L2 transaction revenue.

## Problem Statement

Sequencers face a profitability challenge:

- **Costs (in ETH)**: L1 gas fees (base + priority) + blob fees to publish checkpoints
- **Revenue (in Fee Asset)**: 
  - L2 transaction fees from users
  - Checkpoint rewards (280 $AZTEC per slot, divided by blocks in checkpoint)

When the priority fee is too high relative to total revenue (converted to ETH), sequencers lose money on checkpoint publication.

## Solution

This strategy leverages the Uniswap V4 price oracle to:

1. Query real-time ETH/FeeAsset market price
2. Calculate total revenue (L2 transaction fees + checkpoint rewards)
3. Convert total revenue from Fee Asset to ETH
4. Calculate the maximum priority fee that maintains profitability
5. Choose the **minimum** of competitive and profitable fees

## Formula

```typescript
// Calculate total revenue in Fee Asset
total_revenue = l2_fees + checkpoint_reward_per_block

// Convert total revenue to ETH
revenue_eth = total_revenue * (eth_per_fee_asset / 1e12)

// Calculate base L1 costs (excluding priority fee)
l1_base_cost = (estimated_gas × base_fee) + (blob_gas × blob_fee)

// Calculate max affordable priority fee
max_priority_fee_per_gas = (revenue_eth - l1_base_cost) / estimated_gas

// Choose minimum to protect profitability
final_fee = min(competitive_fee, max_priority_fee_per_gas)
```

## Integration Example

```typescript
import { FeeAssetPriceOracle } from '@aztec/ethereum/contracts';
import { ProfitablePriorityFeeStrategy, type ProfitableFeeStrategyContext } from '@aztec/ethereum/l1_tx_utils/fee-strategies';

// In your sequencer publisher class:
class SequencerPublisher {
  private feeAssetPriceOracle: FeeAssetPriceOracle;
  
  constructor(/* ... */) {
    this.feeAssetPriceOracle = new FeeAssetPriceOracle(
      this.l1Client,
      this.rollupContract,
      this.logger
    );
  }

  async publishCheckpoint(checkpoint: Checkpoint) {
    // Calculate L2 fees collected in this checkpoint
    const l2FeesCollected = checkpoint.blocks.reduce(
      (total, block) => total + block.header.totalFees.toBigInt(),
      0n
    );

    // Calculate checkpoint reward per block
    // Sequencers get 70% of 400 $AZTEC per slot = 280 $AZTEC
    // Divided by number of blocks in checkpoint
    const SEQUENCER_CHECKPOINT_REWARD = 280n * 10n ** 18n; // 280 $AZTEC in wei
    const checkpointRewardPerBlock = SEQUENCER_CHECKPOINT_REWARD / BigInt(checkpoint.blocks.length);

    // Estimate L1 gas needed for propose transaction
    const estimatedL1Gas = 500_000n; // Approximate, can be more precise
    const estimatedBlobGas = 3n * 2n ** 17n; // 3 blobs

    // Build extended context
    const context: ProfitableFeeStrategyContext = {
      gasConfig: this.gasConfig,
      isBlobTx: true,
      logger: this.logger,
      feeAssetPriceOracle: this.feeAssetPriceOracle,
      l2FeesCollected,
      checkpointRewardPerBlock,
      estimatedL1Gas,
      estimatedBlobGas,
    };

    // Execute strategy
    const result = await ProfitablePriorityFeeStrategy.execute(
      this.l1Client,
      context
    );

    this.logger.info('Priority fee selected', result.debugInfo);

    // Use result.priorityFee for your L1 transaction
    const tx = await this.rollup.propose(/* ... */, {
      maxPriorityFeePerGas: result.priorityFee,
      // ... other gas settings
    });
  }
}
```

## Behavior Examples

### Scenario 1: Profitable and Competitive

```
L2 fees collected: 10 Fee Asset
Checkpoint reward per block: 56 Fee Asset (280 / 5 blocks)
Total revenue: 66 Fee Asset
Oracle price: 0.001 ETH per Fee Asset
Revenue in ETH: 0.066 ETH
L1 base cost: 0.003 ETH (base fee + blob fee)
Remaining: 0.063 ETH
Estimated gas: 500,000
Max profitable fee: 0.063 / 500,000 = 126 gwei

Competitive fee: 5 gwei (from market analysis)

✅ Final fee: 5 gwei (competitive < profitable, so use competitive)
```

### Scenario 2: Low Transaction Volume (Checkpoint Reward Matters)

```
L2 fees collected: 1 Fee Asset
Checkpoint reward per block: 56 Fee Asset (280 / 5 blocks)
Total revenue: 57 Fee Asset
Oracle price: 0.001 ETH per Fee Asset
Revenue in ETH: 0.057 ETH
L1 base cost: 0.003 ETH
Remaining: 0.054 ETH
Estimated gas: 500,000
Max profitable fee: 0.054 / 500,000 = 108 gwei

Competitive fee: 5 gwei

✅ Final fee: 5 gwei (checkpoint reward makes it profitable!)
```

### Scenario 3: High Revenue Allows Higher Priority

```
L2 fees collected: 100 Fee Asset
Checkpoint reward per block: 56 Fee Asset (280 / 5 blocks)
Total revenue: 156 Fee Asset
Oracle price: 0.001 ETH per Fee Asset
Revenue in ETH: 0.156 ETH
L1 base cost: 0.003 ETH
Remaining: 0.153 ETH
Estimated gas: 500,000
Max profitable fee: 0.153 / 500,000 = 306 gwei

Competitive fee: 10 gwei

✅ Final fee: 10 gwei (competitive is affordable, use it for faster inclusion)
```

### Scenario 4: Oracle Unavailable (Testnet/Degradation)

```
Oracle price: undefined (not on mainnet or oracle failed)

✅ Falls back to competitive fee only (same as P75AllTxsPriorityFeeStrategy)
```

## Benefits

1. **Profitability Protection**: Never pay more in L1 fees than you earn in L2 revenue
2. **Market-Aware**: Uses real-time oracle data for accurate ETH/FeeAsset conversions
3. **Competitive When Profitable**: Still prioritizes fast inclusion when margins allow
4. **Graceful Degradation**: Falls back to competitive-only pricing if oracle unavailable
5. **Transparent**: Rich debug info shows all calculations

## Considerations

1. **Oracle Accuracy**: Relies on Uniswap V4 liquidity and the oracle's manipulation resistance
2. **Gas Estimation**: Accuracy of `estimatedL1Gas` affects profitability calculations
3. **Block Building**: Should calculate `l2FeesCollected` accurately (including all fees in checkpoint)
4. **Checkpoint Rewards**: Must correctly calculate checkpoint reward per block (280 $AZTEC / blocks_in_checkpoint)
5. **Mainnet Only**: Oracle only works on mainnet; falls back on other networks

## Future Enhancements

- Add configurable profit margin (e.g., target 20% profit instead of break-even)
- Support multiple oracle sources for redundancy
- Dynamic gas estimation based on checkpoint size
- Historical profitability tracking and reporting
