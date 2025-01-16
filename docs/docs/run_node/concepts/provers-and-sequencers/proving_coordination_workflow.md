---
sidebar_position: 1
title: Proving Coordination Workflow
---

Proposers run RFQs to obtain quotes from provers. Quotes are binding promises from provers to prove an entire epoch. The exact channel over which provers send quotes to proposers is **NOT** enshrined by the protocol.

However, Aztec Nodes will support two optional mechanisms that provers can use to submit quotes to proposers:

- Gossip quotes via the P2P
- Send a quote directly via HTTP (i.e. http://aztec-node:8000)

To send a quote via the P2P, do not set the environment variable `PROVER_COORDINATION_NODE_URL` and make sure that `P2P_ENABLED` is set to `true`.

:::note
For S&P Testnet, please make sure that you are gossiping quotes via the P2P. Set `P2P_ENABLED` to `true` and do not use `PROVER_COORDINATION_NODE_URL`.
:::


```rust
struct EpochProofQuote {
    Signature signature;
    address prover;
    uint256 epochNumber;
    uint256 epochInitBlock;
    uint256 epochFinalBlock;
    uint256 totalFees;
    address rollupAddress;
    uint32 basisPointFee;
    uint256 bondAmount;
}
```

To accomplish this coordination through the Aztec node software, we extend both the `P2PClient` and `ProverNode`.

## P2P client

The `P2PClient` will be extended by:

```typescript
class P2PClient {
    //...

    async addEpochProofQuote(quote: EpochProofQuote): Promise<void> {
        // Add quote to quote memory pool
        this.epochProofQuotePool.addQuote(quote);

        // Propagate quote via P2P
        this.broadcastEpochProofQuote(quote);
    }
}
```

This is called by the Prover Node inside `ProverNode.sendEpochProofQuote()` after it detects an epoch has ended.

## Prover Node

As for the Prover Node, we add `QuoteProvider` and `BondManager` interfaces. Also an `EpochMonitor` which sits on the main start loop of the Prover Node. It fetches the most recent completed epochs and checks whether the proposer accepted an `EpochProofQuote`.

If no quote has been accepted yet, the `EpochMonitor` will call on `BondManager` and `QuoteProvider` to provide a valid quote. If the claim detected belongs to the prover, the monitor will kick off a `handleCall()` to create proving jobs.

```typescript
interface BondManager {
  ensureBond(amount: number): Promise<void>;
}
interface QuoteProvider {
  getQuote(epoch: number): Promise<EpochProofQuote | undefined>;
}
```

When the prover node first starts up, it will call `BondManager.ensureBond` to ensure it has the minimum deposit amount `PROVER_MINIMUM_ESCROW_AMOUNT` deposited in the escrow contract. If it does not, it will top up to the target deposit amount `PROVER_TARGET_ESCROW_AMOUNT`.

Both `PROVER_MINIMUM_ESCROW_AMOUNT` and `PROVER_TARGET_ESCROW_AMOUNT` are customizable environment variables.

The `EpochMonitor` will then get the last completed, unproven epoch and will call the `QuoteProvider` to generate a quote if the epoch has not been claimed by any provers yet. The `QuoteProvider` will be provided with all the blocks in the unproven epoch so it could perform any custom logic to determine the quote parameters, i.e., `bondAmount`, `basisPointFee`, etc.

Alternatively, the quote provider can issue an HTTP POST to a configurable `QUOTE_PROVIDER_URL` to get the quote. The request body is JSON-encoded and contains the following fields:

- `epochNumber`: The epoch number to prove
- `fromBlock`: The first block number of the epoch to prove
- `endBlock`: The last block number (inclusive) of the epoch to prove
- `txCount`: The total number of txs in the epoch
- `totalFees`: The accumulated total fees across all txs in the epoch

The response is also expected in JSON and to contain `basisPointFee` and `bondAmount` fields. Optionally, the request can include a `validUntilSlot` parameter, which specifies for how many slots the quote remains valid. For example, an `EpochProofQuote` with parameters `epochProofQuote#80` and `validUntilSlot#5` means that any of the first 5 proposers in epoch 101 can “claim” this quote.

If no `QUOTE_PROVIDER_URL` is passed along to the Prover Node, then a `SimpleQuoteProvider` is used, which always returns the same `basisPointFee` and `bondAmount` as set in the `QUOTE_PROVIDER_BASIS_POINT_FEE` and `QUOTE_PROVIDER_BOND_AMOUNT` environment variables.

:::warning
If the `QuoteProvider` does not return a `bondAmount` or a `basisPointFee`, the Prover Node will not generate nor submit a quote to the proposer.
:::

Separately, the Prover Node needs a watcher on L1 to detect if its quote has been selected.

To this end, the `L1Publisher` will be extended with a new method to retrieve proof claims.

```typescript
interface L1Publisher {
  getProofClaim(): Promise<EpochProofClaim>;
}
```

The Prover Node will call this method at least once per L2 slot to check for unclaimed accepted quotes if its quotes have been accepted. You can update the polling interval using the environment variable `PROVER_NODE_POLLING_INTERVAL_MS`.

## Run a prover

Go to the [Prover Guide](../../guides/how_to_run_prover.md) to run a prover.