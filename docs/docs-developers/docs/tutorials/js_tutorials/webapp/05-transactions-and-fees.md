---
title: "5. Transactions & Fees"
sidebar_position: 5
description: "Understand the transaction lifecycle and fee payment with SponsoredFPC"
---

# Transactions & Fees

This section covers what happens when you send a transaction on Aztec and how fee payment works with SponsoredFPC.

## Transaction lifecycle

When you call `.send()` on a contract method, it handles the entire lifecycle automatically — proving, submission, and waiting for confirmation:

```
.send() → PXE proves locally → Sent to node → Included in block → Receipt returned
```

1. **Private execution**: PXE simulates the function locally using your private state and decryption keys, producing new notes, nullifiers (which mark old notes as spent), and any enqueued public function calls.
2. **Proof generation**: Barretenberg (Aztec's proving system) generates a ZK-SNARK proving that the execution was valid — without revealing your private inputs to anyone.
3. **Submission**: The proof, encrypted notes, nullifiers, and any public function calls are bundled together and sent to the Aztec node.
4. **Inclusion**: The node's sequencer validates the proof, executes any enqueued public functions, and includes the transaction in the next block.
5. **Confirmation**: The block is published to L1 (Ethereum), and a receipt with the transaction hash is returned to your app.

## Tracking transaction status

Create `src/components/TxStatus.tsx`:

#include_code tx-status-component /docs/examples/webapp-tutorial/src/components/TxStatus.tsx typescript

Integrate with contract calls:

```typescript
setTxState('sending');
try {
  const receipt = await contract.methods
    .play_round(gameId, round, t1, t2, t3, t4, t5)
    .send({ from: account });
  setTxState('confirmed');
  setTxHash(receipt.txHash.toString());
} catch (err) {
  setTxState('error');
  setTxError(err.message);
}
```

`.send()` handles the full lifecycle: it generates a proof, submits the transaction to the node, waits for it to be included in a block, and returns the receipt. If you need to send without waiting, pass `wait: NO_WAIT` in the options to get a `TxHash` back immediately instead.

## Fee payment with SponsoredFPC

Every Aztec transaction requires fee payment, similar to gas on Ethereum. Without a fee, the sequencer won't include your transaction. **SponsoredFPC** (Fee Payment Contract) is a special contract that agrees to pay fees on behalf of any transaction. This is useful for onboarding new users who don't yet have fee tokens.

### How it works

#include_code get-sponsored-fpc /docs/examples/webapp-tutorial/src/fees.ts typescript

`SPONSORED_FPC_SALT` is a fixed constant so that the SponsoredFPC contract is deployed at a deterministic, well-known address across all networks (local sandbox, devnet, and beyond). Your app can always compute where it lives without querying a registry.

### Registering with PXE

PXE needs the SponsoredFPC contract artifact registered so it can include fee payment logic when constructing transaction proofs. Without registration, PXE wouldn't know how to interact with the fee contract.

#include_code register-fpc /docs/examples/webapp-tutorial/src/fees.ts typescript

### Manual fee payment

For explicit control:

#include_code create-fee-payment /docs/examples/webapp-tutorial/src/fees.ts typescript

```typescript
const paymentMethod = await createSponsoredFeePayment();

await contract.methods
  .play_round(gameId, round, t1, t2, t3, t4, t5)
  .send({
    from: account,
    fee: { paymentMethod },
  });
```

The `EmbeddedWallet` handles this automatically via `completeFeeOptions` — you don't need to pass `fee` options manually when using it.

:::info
SponsoredFPC is for development and testnet. Production apps use their own fee payment strategy.
:::

## Next steps

Let's [put everything together](./06-putting-it-together.md).
