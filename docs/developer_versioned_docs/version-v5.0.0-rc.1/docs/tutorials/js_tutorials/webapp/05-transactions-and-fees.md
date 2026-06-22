---
title: "5. Transactions & Fees"
sidebar_position: 6
description: "Learn about the Aztec transaction lifecycle and fee payment with SponsoredFPC"
---

# Transactions & Fees

This section covers what happens when you send a transaction on Aztec and how fee payment works with SponsoredFPC.

## Transaction lifecycle

When you call `.send()` on a contract method, it handles the entire lifecycle automatically — proving, submission, and waiting for confirmation:

```text
.send() → PXE proves locally → Sent to node → Included in block → Receipt returned
```

1. **Private execution**: PXE (Private eXecution Environment) simulates the function locally using your private state and decryption keys, producing new notes, nullifiers (which mark old notes as spent), and any enqueued public function calls.
2. **Proof generation**: Barretenberg (Aztec's proving system) generates a ZK-SNARK proving that the execution was valid — without revealing your private inputs to anyone.
3. **Submission**: The proof, encrypted notes, nullifiers, and any public function calls are bundled together and sent to the Aztec node.
4. **Inclusion**: The node's sequencer validates the proof, executes any enqueued public functions, and includes the transaction in the next block.
5. **Confirmation**: The block is published to L1 (Ethereum), and a receipt with the transaction hash is returned to your app.

## Tracking transaction status

Open `src/components/TxStatus.tsx`:

```typescript title="tx-status-component" showLineNumbers 
/**
 * Displays the current transaction lifecycle stage.
 * Transactions flow: send() -> proving -> confirmed (or error).
 */
export function TxStatus({ state, txHash, error }: TxStatusProps) {
  if (state === 'idle') return null;

  const messages: Record<TxState, string> = {
    idle: '',
    sending: 'Sending transaction...',
    proving: 'Proving transaction (generating ZK proof)...',
    confirmed: 'Transaction confirmed!',
    error: `Transaction failed: ${error}`,
  };

  return (
    <div className={`tx-status tx-status-${state}`}>
      <p>{messages[state]}</p>
      {txHash && <p className="tx-hash">Tx: {txHash.slice(0, 10)}...</p>}
    </div>
  );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/components/TxStatus.tsx#L11-L34" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/components/TxStatus.tsx#L11-L34</a></sub></sup>


Integrate with contract calls:

```typescript
setTxState('sending');
try {
  const receipt = await contract.methods
    .play_round(gameId, round, t1, t2, t3, t4, t5)
    .send({ from: account });
  setTxState('confirmed');
  setTxHash(receipt.receipt.txHash.toString());
} catch (err) {
  setTxState('error');
  setTxError(err.message);
}
```

`.send()` handles the full lifecycle: it generates a proof, submits the transaction to the node, waits for it to be included in a block, and returns the receipt. If you need to send without waiting, pass `wait: NO_WAIT` in the options to get a `TxHash` back immediately instead. `NO_WAIT` is exported from `@aztec/aztec.js/contracts`.

## Fee payment with SponsoredFPC

Every Aztec transaction requires fee payment, similar to gas on Ethereum. Without a fee, the sequencer won't include your transaction. **SponsoredFPC** (Fee Payment Contract) is a special contract that agrees to pay fees on behalf of any transaction. This is useful for onboarding new users who don't yet have fee tokens.

### How it works

```typescript title="get-sponsored-fpc" showLineNumbers 
/**
 * Returns the SponsoredFPC contract details.
 * The SponsoredFPC (Fee Payment Contract) pays transaction fees on behalf of users.
 * This is deployed at a well-known address derived from a fixed salt.
 */
export async function getSponsoredFPCContract() {
  const { SponsoredFPCContractArtifact } = await import(
    '@aztec/noir-contracts.js/SponsoredFPC'
  );
  const instance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContractArtifact,
    { salt: new Fr(SPONSORED_FPC_SALT) }
  );
  return { instance, artifact: SponsoredFPCContractArtifact };
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/fees.ts#L8-L24" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/fees.ts#L8-L24</a></sub></sup>


`SPONSORED_FPC_SALT` is a fixed constant so that the SponsoredFPC contract is deployed at a deterministic, well-known address across all networks (local network and beyond). Your app can always compute where it lives without querying a registry.

### Registering with PXE

PXE needs the SponsoredFPC contract artifact registered so it can include fee payment logic when constructing transaction proofs. Without registration, PXE wouldn't know how to interact with the fee contract.

```typescript title="register-fpc" showLineNumbers 
/**
 * Registers the SponsoredFPC contract with PXE so it can be used for fee payment.
 * This must be called before sending any transactions.
 */
export async function registerSponsoredFPC(pxe: PXE) {
  const contract = await getSponsoredFPCContract();
  await pxe.registerContract(contract);
  return contract.instance.address;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/fees.ts#L26-L36" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/fees.ts#L26-L36</a></sub></sup>


### Manual fee payment

For explicit control:

```typescript title="create-fee-payment" showLineNumbers 
/**
 * Creates a SponsoredFeePaymentMethod that can be passed as the
 * `paymentMethod` option when sending transactions.
 */
export async function createSponsoredFeePayment() {
  const contract = await getSponsoredFPCContract();
  return new SponsoredFeePaymentMethod(contract.instance.address);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/src/fees.ts#L38-L47" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/src/fees.ts#L38-L47</a></sub></sup>


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
SponsoredFPC is for development. Production apps use their own fee payment strategy.
:::

## Next steps

Now [put everything together](./06-putting-it-together.md).
