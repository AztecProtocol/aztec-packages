---
title: "5. Transaction Handling"
description: The sendTx flow, proof generation, and SponsoredFPC fee payment in Aztec wallet extensions
sidebar_position: 5
---

# Transaction Handling

Transaction handling is the core purpose of a wallet. This section explains how transactions flow through the extension, from dApp request to onchain settlement.

## Transaction Flow Overview

```text
1. dApp calls wallet.sendTx(payload, options)
   ↓
2. Content script encrypts and forwards to background
   ↓
3. Background stores as pending, shows in popup
   ↓
4. User reviews and clicks "Approve"
   ↓
5. Background forwards to offscreen
   ↓
6. Offscreen:
   a. Deserializes ExecutionPayload
   b. Gets fee options (SponsoredFPC)
   c. Creates TxExecutionRequest
   d. Generates proof (WASM, 10-60 seconds)
   e. Submits to node
   ↓
7. Response flows back to dApp
```

## ExecutionPayload

The dApp sends an `ExecutionPayload` containing:

```typescript
interface ExecutionPayload {
  calls: FunctionCall[];      // Contract calls to execute
  authWitnesses: AuthWitness[]; // Pre-signed authorizations
  capsules: any[];            // Encrypted data capsules
  feePayer?: AztecAddress;    // Optional explicit fee payer
}

interface FunctionCall {
  to: AztecAddress;           // Target contract
  functionSelector: FunctionSelector;
  args: Fr[];                 // Function arguments
  isStatic: boolean;          // View call?
}
```

Example from a Pod Racing dApp:

```typescript
const payload = new ExecutionPayload([
  {
    to: gameContractAddress,
    functionSelector: FunctionSelector.fromSignature('boost()'),
    args: [],
    isStatic: false,
  },
]);

const receipt = await wallet.sendTx(payload, {
  from: playerAddress,
});
```

## Approval Flow

When a wallet message arrives, the background checks whether it needs approval:

```typescript
// sendTx always requires approval — it's a state-changing operation.
// batch requires approval only if it contains a sendTx.
// Read-only calls (simulateTx, getAccounts, etc.) auto-execute.
const needsApproval =
  message.type === 'sendTx' ||
  (message.type === 'batch' &&
    Array.isArray(message.args?.[0]) &&
    message.args[0].some((m: any) => m.name === 'sendTx'));

if (needsApproval) {
  const pending = {
    sessionId: session.sessionId,
    messageId: message.messageId,
    method: message.type,
    args: message.args,
    from,
    origin: session.origin,
    timestamp: Date.now(),
  };

  pendingTransactions.push(pending);
  updateBadge();
  // User must approve in popup
}
```

The badge shows the pending count, alerting the user.

## Approval UI

The popup displays transaction details:

```typescript
function TransactionApproval({ transaction, onApprove, onReject }) {
  return (
    <div className="approval-card">
      <div className="approval-header">
        <div className="approval-origin">{new URL(transaction.origin).host}</div>
        <div className="approval-type">Send Transaction</div>
      </div>

      <div className="approval-details">
        <div className="detail-row">
          <span>From</span>
          <span>{truncateAddress(transaction.from)}</span>
        </div>

        {/* Show function calls */}
        {transaction.args?.executionPayload?.calls?.map((call, i) => (
          <div key={i} className="tx-call">
            <div>{call.functionSelector?.name || 'Unknown'}</div>
            <div>To: {truncateAddress(call.to)}</div>
          </div>
        ))}
      </div>

      <div className="btn-group">
        <button onClick={onReject}>Reject</button>
        <button onClick={onApprove}>Approve</button>
      </div>
    </div>
  );
}
```

## Processing Approved Transactions

When the user approves:

```typescript
async function handleTransactionApproval(pending) {
  // Forward to offscreen for execution
  const result = await sendToOffscreen({
    type: MessageTypes.WALLET_METHOD,
    method: pending.method,
    args: pending.args,
    from: pending.from,
  });

  // Send response back to dApp
  await handler.sendResponse(pending.sessionId, {
    messageId: pending.messageId,
    result,
    walletId: WALLET_CONFIG.walletId,
  });

  return result;
}
```

## Offscreen Execution

The offscreen document handles the actual transaction:

```typescript
case 'sendTx': {
  const { executionPayload, options } = args;

  // 1. Deserialize the payload
  const payload = deserializeExecutionPayload(executionPayload);
  const fromAddress = AztecAddress.fromStringUnsafe(from || options.from);

  // 2. Call wallet.sendTx (inherited from BaseWallet)
  const result = await wallet.sendTx(payload, {
    ...options,
    from: fromAddress,
  });

  // 3. Serialize the result
  if (typeof result === 'object' && 'txHash' in result) {
    return {
      txHash: result.txHash.toString(),
      status: result.status,
      blockNumber: result.blockNumber?.toString(),
    };
  }
  return { txHash: result.toString() };
}
```

:::note
The actual implementation uses `WalletSchema` to parse arguments in a type-safe way, as described in [PXE Integration](./03-pxe-integration.md). The above is a simplified view of the logic.
:::

## BaseWallet.sendTx

For details on how `BaseWallet.sendTx` works with `completeFeeOptions`, see [PXE Integration](./03-pxe-integration.md#sponsoredfpc-fee-payment).

The inherited `sendTx` method does the heavy lifting:

```typescript
// In BaseWallet (inherited by OffscreenWallet)
async sendTx(executionPayload, opts) {
  // 1. Get fee options (our override uses SponsoredFPC!)
  const feeOptions = await this.completeFeeOptions(
    opts.from,
    executionPayload.feePayer,
    opts.fee?.gasSettings
  );

  // 2. Create execution request
  const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(
    executionPayload,
    opts.from,
    feeOptions
  );

  // 3. Generate proof (this is the slow part)
  const provenTx = await this.pxe.proveTx(txRequest);

  // 4. Convert to onchain transaction
  const tx = await provenTx.toTx();
  const txHash = tx.getTxHash();

  // 5. Submit to node
  await this.aztecNode.sendTx(tx);

  // 6. Optionally wait for confirmation
  if (opts.wait !== NO_WAIT) {
    return await waitForTx(this.aztecNode, txHash, opts.wait);
  }
  return txHash;
}
```

## SponsoredFPC Integration

Our `completeFeeOptions` override in `OffscreenWallet` ensures SponsoredFPC is used:

```typescript
protected async completeFeeOptions(from, feePayer, gasSettings) {
  const base = await super.completeFeeOptions(from, feePayer, gasSettings);

  // If the payload already includes a fee payer, don't inject another one
  if (feePayer) {
    return {
      ...base,
      accountFeePaymentMethodOptions: 0, // EXTERNAL
    };
  }

  // Otherwise, lazily register and use SponsoredFPC
  const address = await this.ensureSponsoredFPC();
  return {
    ...base,
    walletFeePaymentMethod: new SponsoredFeePaymentMethod(address),
    accountFeePaymentMethodOptions: 0, // EXTERNAL: sponsored FPC pays
  };
}
```

The `SponsoredFeePaymentMethod`:
1. Creates a fee payment execution payload
2. Gets merged with the user's transaction
3. Calls the SponsoredFPC contract to pay fees
4. User transaction executes with paid fees

## Proof Generation

Proof generation is the slowest part (10-60 seconds):

```typescript
const provenTx = await this.pxe.proveTx(txRequest);
```

This:
1. Executes private functions locally
2. Generates WASM-based zero-knowledge proofs
3. Creates the kernel proofs
4. Packages everything for submission

The offscreen document handles this well because it:
- Doesn't have service worker timeouts
- Supports WASM
- Can use IndexedDB for intermediate state

## Simulation

For gas estimation or validation, dApps use `simulateTx`:

```typescript
case 'simulateTx': {
  const { executionPayload, options } = args;
  const payload = deserializeExecutionPayload(executionPayload);
  const fromAddress = AztecAddress.fromStringUnsafe(from || options.from);

  const result = await wallet.simulateTx(payload, {
    ...options,
    from: fromAddress,
  });

  return serializeTxSimulationResult(result);
}
```

Simulation:
- Executes the transaction locally
- Estimates gas usage
- Detects revert conditions
- Doesn't generate full proofs
- Much faster than `sendTx`

## Error Handling

Transactions can fail at several points:

```typescript
try {
  const result = await wallet.sendTx(payload, options);
  return { success: true, result };
} catch (error) {
  // Could be:
  // - Simulation failure (contract revert)
  // - Proof generation failure
  // - Node rejection (already settled, insufficient gas)
  // - Network error
  return { success: false, error: error.message };
}
```

Errors are serialized and returned to the dApp, which should handle them gracefully.

## Authorization Witnesses

For delegated actions (like approving token spending), the wallet creates auth witnesses:

```typescript
case 'createAuthWit': {
  const { from: authFrom, messageHashOrIntent } = args;
  const fromAddress = AztecAddress.fromStringUnsafe(authFrom);

  const authWit = await wallet.createAuthWit(fromAddress, messageHashOrIntent);

  return {
    requestHash: authWit.requestHash.toString(),
    witness: Array.from(authWit.witness),
  };
}
```

The account signs the authorization, which can be used by other contracts to verify permission.

## Transaction Status

After submission, transactions go through states:

1. **Pending** - Submitted, waiting for sequencer
2. **Included** - In a block, but not proven
3. **Proven** - Epoch proof submitted
4. **Finalized** - L1 finality achieved

The wallet can track status:

```typescript
const receipt = await waitForTx(this.aztecNode, txHash, {
  timeout: 60_000,  // 60 seconds
  interval: 1_000,  // Check every second
});

console.log(receipt.status); // 'success' | 'reverted'
console.log(receipt.blockNumber);
```

## Next Steps

With transactions flowing, let's build the [Approval UI](./06-approval-ui.md) - the React popup that makes all this user-friendly.
