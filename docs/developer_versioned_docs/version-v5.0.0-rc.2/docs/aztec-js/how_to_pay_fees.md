---
title: Paying Fees
tags: [fees, transactions, accounts, mana, gas]
sidebar_position: 7
description: Pay transaction fees on Aztec, understand mana costs, estimate gas, and retrieve fees from receipts.
---

import { General, Fees } from '@site/src/components/Snippets/general_snippets';

This guide walks you through paying transaction fees on Aztec using various payment methods.

## Prerequisites

- <General.AztecJSPrerequisites />
- Understanding of [fee concepts](../foundational-topics/fees.md)

:::info
<Fees.FeeAsset_NonTransferrable />
:::

## Payment methods overview

| Method              | Use Case                                       | Privacy         | Requirements                 |
| ------------------- | ---------------------------------------------- | --------------- | ---------------------------- |
| Fee Juice (default) | Account already has Fee Juice                  | Public          | Funded account               |
| Sponsored FPC       | Testing, free transactions                     | Public          | None                         |
| Private FPC         | Privacy-preserving fees                        | Private         | Bridged Fee Juice via FPC    |
| Third-party FPC     | Pay in other tokens on testnet/mainnet         | Varies by FPC   | FPC provider's SDK           |
| Bridge + Claim      | Bootstrap from L1                              | Public          | L1 ETH for gas               |

## Mana and Fee Juice

Mana is Aztec's unit of computational effort (like gas on Ethereum), and Fee Juice is the native fee token used to pay for transactions. For a detailed explanation of these concepts, see [Fee Concepts](../foundational-topics/fees.md).

## Estimate mana costs

:::tip Automatic estimation with EmbeddedWallet
When using `EmbeddedWallet`, gas is estimated automatically on every `send()` call. You only need to manually estimate if you want to preview costs before sending, or if you're using a custom wallet implementation.
:::

Before sending a transaction, you can read the mana it will consume by simulating with `includeMetadata: true` and reading `gasUsed` from the result:

```typescript title="estimate_mana" showLineNumbers 
const { gasUsed } = await token.methods
  .transfer_in_public(aliceAddress, bobAddress, 1n, 0n)
  .simulate({ from: aliceAddress, includeMetadata: true });
// Pad the raw usage yourself to leave headroom for variance, e.g. 10%.
const estimatedGasLimits = gasUsed!.totalGas.mul(1.1);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_advanced/index.ts#L378-L384" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L378-L384</a></sub></sup>


The `gasUsed` object contains the raw gas the simulation consumed:

- `totalGas.daGas` / `totalGas.l2Gas` - DA and L2 mana consumed across the whole transaction
- `teardownGas.daGas` / `teardownGas.l2Gas` - DA and L2 mana consumed in the teardown phase

It is up to you to derive the gas limits you declare from this raw usage (typically by padding it, as shown above). If you don't declare any gas limits, the wallet fills in the network's per-tx admission limits for you.

### Calculate expected fee from estimate

To calculate the expected fee from the padded gas, use the `computeFee` method with current network fees:

```typescript title="compute_fee_from_estimate" showLineNumbers 
const currentFees = await node.getCurrentMinFees();
const estimatedFee = estimatedGasLimits.computeFee(currentFees).toBigInt();
console.log("Estimated fee:", estimatedFee);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_advanced/index.ts#L386-L390" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L386-L390</a></sub></sup>


:::tip
Pad the raw `gasUsed` yourself to leave a safety margin. Multiplying by `1.1` adds 10%; use higher padding for transactions with variable gas costs. The wallet rejects any declared limit above the network's per-tx admission limit.
:::

## Get transaction fee from receipt

After a transaction is mined, you can retrieve the fee paid from the receipt:

```typescript title="get_fee_from_receipt" showLineNumbers 
const { receipt: feeReceipt } = await token.methods
  .mint_to_public(aliceAddress, 1n)
  .send({ from: aliceAddress });
console.log("Transaction fee:", feeReceipt.transactionFee);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_advanced/index.ts#L392-L397" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L392-L397</a></sub></sup>


The `transactionFee` field is a `bigint` representing the total fee paid in the fee token (Fee Juice). You can also check execution status:

```typescript title="check_receipt_status" showLineNumbers 
console.log("Succeeded:", feeReceipt.hasExecutionSucceeded());
console.log("Block:", feeReceipt.blockNumber);
console.log("Fee paid:", feeReceipt.transactionFee);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_advanced/index.ts#L399-L403" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L399-L403</a></sub></sup>


## Pay with Fee Juice

Fee Juice is the native fee token on Aztec.

If your account has Fee Juice (for example, from a faucet), is [deployed](./how_to_create_account.md), and is registered in your wallet, it will be used automatically to pay for the fee of the transaction:

```typescript title="pay_with_fee_juice" showLineNumbers 
// contract is a deployed contract instance; aliceAddress is from the connection guide
const { receipt: feeJuiceReceipt } = await token.methods
  .mint_to_public(aliceAddress, 1n)
  .send({
    from: aliceAddress,
    // no fee payment method needed; Fee Juice is used automatically
  });
console.log("Transaction fee:", feeJuiceReceipt.transactionFee);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_advanced/index.ts#L405-L414" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L405-L414</a></sub></sup>


## Use Fee Payment Contracts

Fee Payment Contracts (FPCs) pay Fee Juice on your behalf. An FPC holds its own Fee Juice balance to pay the protocol and can accept other tokens from users in exchange. Some FPCs operate privately by design, routing fee payments through private notes rather than public function calls.

:::note
The SDK includes `PrivateFeePaymentMethod` and `PublicFeePaymentMethod` classes for the built-in reference FPC, but these are **deprecated** and do not work on mainnet alpha. For custom-token fee payment, use a third-party FPC with its own SDK (see [below](#third-party-fpcs-on-testnet-and-mainnet)).
:::

### Sponsored FPC



The Sponsored FPC pays fees unconditionally, enabling free transactions. It is available on testnet, devnet, and local network.

You can derive the Sponsored FPC address from its deployment parameters, register it with your wallet, and use it to pay for transactions:

```typescript title="deploy_sponsored_fpc_contract" showLineNumbers 
// Set up the Sponsored FPC (see fees guide for full setup)
const sponsoredFPCInstance = await getContractInstanceFromInstantiationParams(
  SponsoredFPCContract.artifact,
  { salt: new Fr(0) },
);
await wallet.registerContract(
  sponsoredFPCInstance,
  SponsoredFPCContract.artifact,
);
const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(
  sponsoredFPCInstance.address,
);

// wallet is from the connection guide; sponsoredPaymentMethod is from the fees guide
const { contract: sponsoredContract } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "SponsoredToken",
  "SPT",
  18,
).send({ from: aliceAddress, fee: { paymentMethod: sponsoredPaymentMethod } });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_advanced/index.ts#L50-L72" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L50-L72</a></sub></sup>


Here's a simpler example from the test suite:

```typescript title="sponsored_fpc_simple" showLineNumbers 
const bananasToSendToBob = 10n;
const { receipt: tx } = await bananaCoin.methods
  .transfer_in_public(aliceAddress, bobAddress, bananasToSendToBob, 0)
  .send({
    from: aliceAddress,
    fee: {
      gasSettings,
      paymentMethod: new SponsoredFeePaymentMethod(sponsoredFPC.address),
    },
  });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/yarn-project/end-to-end/src/e2e_fees/sponsored_payments.test.ts#L71-L82" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_fees/sponsored_payments.test.ts#L71-L82</a></sub></sup>


### Private fee payment

For transactions where the fee payment itself should be private, you can use a fully private FPC, one that holds Fee Juice claimed from L1 as an internal private balance, works on every network, and never needs an onchain deployment. See [Pay Fees Privately](./how_to_use_private_fee_juice.md) for how this pattern works and a walkthrough using a community-built example.

:::tip Shared salt for privacy
When multiple apps derive the same private FPC address (using the same artifact and salt), every private fee payment joins a single, larger privacy set. See [recommended salt](./how_to_use_private_fee_juice.md#recommended-salt-0) for details.
:::

### Third-party FPCs on testnet and mainnet

On networks where the Sponsored FPC is unavailable, third-party FPCs deployed by ecosystem teams let you pay fees in tokens other than Fee Juice. Each FPC provider typically offers an SDK or API that handles payment method construction on the client side. This may include quote fetching and authwit creation, though the exact flow depends on the FPC design. For background on how FPCs work at the protocol level, see [how FPCs work](../foundational-topics/fees.md#how-fpcs-work).

#### Example: Nethermind Private Multi Asset FPC

To illustrate how a third-party FPC integration works, the following walkthrough uses Nethermind's [Private Multi Asset FPC](https://github.com/NethermindEth/aztec-fpc) as a reference. This is one implementation, other FPCs may differ in design and API.

This FPC is quote-based and operates privately:

- A single deployment accepts many tokens. The asset is selected per quote rather than hard-coded at deploy time.
- Fee payments are transferred as private notes, so fee activity is not visible onchain.
- An operator-run attestation service signs per-user quotes binding the FPC address, accepted asset, amounts, expiry, and user.
- A cold-start entrypoint allows a brand-new account to bridge tokens from L1, claim on L2, and pay the fee in a single transaction. Note that the cold-start path calls `Token::mint_to_private`, which enqueues a public call to update the token's total supply, so the minted amount is visible onchain even though the user's identity and balances remain private.

:::warning Third-party software
This FPC is developed and maintained by Nethermind, not by Aztec Labs. The SDK (`@nethermindeth/aztec-fpc-sdk`) may not yet be published to npm; check the [repository README](https://github.com/NethermindEth/aztec-fpc/blob/main/sdk/README.md) for current install instructions. Review the [protocol spec](https://github.com/NethermindEth/aztec-fpc/blob/main/docs/spec/protocol-spec.md) and evaluate independently before integrating.
:::

The SDK wraps the quote-and-pay flow into a single call. The snippet below shows the general shape of the integration (illustrative; verify against the current SDK API before using):

```ts
import { FpcClient } from "@nethermindeth/aztec-fpc-sdk";

// Point the client at the FPC's attestation service
const fpcClient = new FpcClient({
  fpcAddress,       // the deployed FPC contract address
  operator,         // operator's Aztec address
  node,             // PXE or node connection
  attestationBaseUrl: "https://...",  // attestation service URL from the FPC provider
});

// Estimate gas, fetch a signed quote, and build the payment method
const payment = await fpcClient.createPaymentMethod({
  wallet,
  user: aliceAddress, // the account paying the fee
  tokenAddress,     // the token you want to pay in
  estimatedGas,     // gas limits derived from a prior simulation's gasUsed
});

// Use it like any other payment method
const tx = await myContract.methods.myMethod(args).send({ fee: payment.fee });
await tx.wait();
```

For the cold-start flow, deployment addresses, and the full API, see the [`aztec-fpc` repository](https://github.com/NethermindEth/aztec-fpc).

## Bridge Fee Juice from L1

Fee Juice is non-transferable on L2, but you can bridge it from L1, claim it on L2, and use it. This involves a few components that are part of a running network's infrastructure:

- An L1 fee juice contract
- An L1 fee juice portal
- An L2 fee juice portal
- An L2 fee juice contract

`aztec.js` provides helpers to simplify the process:

```typescript title="bridge_fee_juice_setup" showLineNumbers 
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { L1FeeJuicePortalManager } from "@aztec/aztec.js/ethereum";
import { createLogger } from "@aztec/aztec.js/log";

// Create an L1 client (accepts a mnemonic or 0x-prefixed private key)
const l1RpcUrl = process.env.ETHEREUM_HOST ?? "http://localhost:8545";
const l1Mnemonic =
  "test test test test test test test test test test test junk";
const l1Client = createExtendedL1Client([l1RpcUrl], l1Mnemonic);

// Create a portal manager to interact with the L1 fee juice portal
const logger = createLogger("docs:fee-juice-bridge");
const portalManager = await L1FeeJuicePortalManager.new(node, l1Client, logger);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_connection/index.ts#L96-L110" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L96-L110</a></sub></sup>


Under the hood, `L1FeeJuicePortalManager` gets the L1 addresses from the node `aztec_getNodeInfo` endpoint. It then exposes an easy method `bridgeTokensPublic` which mints fee juice on L1 and sends it to an L2 address via the L1 portal:

```typescript title="bridge_fee_juice_execute" showLineNumbers 
// portalManager is from the L1FeeJuicePortalManager setup above
// feeJuiceAccount.address is an Aztec address from createSchnorrAccount
const claim = await portalManager.bridgeTokensPublic(
  feeJuiceAccount.address, // the L2 address
  1000000000000000000000n, // the amount to send to the L1 portal
  true, // whether to mint or not (set to false if your L1 account already has fee juice!)
);

console.log("Claim secret:", claim.claimSecret);
console.log("Claim amount:", claim.claimAmount);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_connection/index.ts#L112-L123" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L112-L123</a></sub></sup>


After this transaction is minted on L1 and a few blocks pass, you can claim the message on L2 and use it directly to pay for fees:

```typescript title="bridge_fee_juice_claim" showLineNumbers 
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";

// claim is from the bridgeTokensPublic step above
// Create a payment method that claims the bridged Fee Juice and uses it to pay
const bridgePaymentMethod = new FeeJuicePaymentMethodWithClaim(
  feeJuiceAccount.address,
  claim,
);

// Use it to pay for any transaction; here we deploy the account in one step
const deployMethodBridged = await feeJuiceAccount.getDeployMethod();
await deployMethodBridged.send({
  from: NO_FROM,
  fee: { paymentMethod: bridgePaymentMethod },
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_connection/index.ts#L163-L179" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L163-L179</a></sub></sup>


## Configure gas settings

### Understanding gas dimensions

Gas settings specify limits and fees for both DA and L2 dimensions:

- **gasLimits**: Maximum mana for main execution phase
- **teardownGasLimits**: Maximum mana for teardown phase (used by FPCs for refunds)
- **maxFeesPerGas**: Maximum price you're willing to pay per mana unit
- **maxPriorityFeesPerGas**: Priority fee for faster inclusion

The fee limit is calculated as `gasLimits × maxFeesPerGas` for each dimension.

### Set custom gas limits

Set custom gas limits by importing from `stdlib`:

```typescript title="custom_gas_settings" showLineNumbers 
// Query current network fees to set realistic limits
const networkFees = await node.getCurrentMinFees();
// Declare at most what the network admits per tx; these limits vary by network geometry,
// so read them from the node rather than hardcoding values that may exceed a given network's maximum.
const { txsLimits } = await node.getNodeInfo();
const gasLimits = Gas.from(txsLimits.gas);
const gasSettings = GasSettings.from({
  gasLimits,
  // Teardown must be strictly less than the total limits so app logic has gas to run.
  teardownGasLimits: {
    daGas: Math.floor(gasLimits.daGas / 2),
    l2Gas: Math.floor(gasLimits.l2Gas / 8),
  },
  maxFeesPerGas: {
    feePerDaGas: networkFees.feePerDaGas * 2n,
    feePerL2Gas: networkFees.feePerL2Gas * 2n,
  },
  maxPriorityFeesPerGas: { feePerDaGas: 0n, feePerL2Gas: 0n },
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_advanced/index.ts#L416-L436" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L416-L436</a></sub></sup>


Then pass the settings when sending:

```typescript title="send_with_gas_settings" showLineNumbers 
const { receipt: gsReceipt } = await token.methods
  .mint_to_public(aliceAddress, 1n)
  .send({
    from: aliceAddress,
    fee: { gasSettings },
  });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_advanced/index.ts#L438-L445" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L438-L445</a></sub></sup>


Note that `gasLimits` and `teardownGasLimits` use `daGas`/`l2Gas` field names, while `maxFeesPerGas` and `maxPriorityFeesPerGas` use `feePerDaGas`/`feePerL2Gas`.

### Use automatic gas estimation

:::note
When using `EmbeddedWallet`, gas estimation happens automatically on every `send()`; you don't need to declare gas limits at all. Reading `gasUsed` from a `simulate({ includeMetadata: true })` result is useful when you want to preview costs before sending, or to set explicit limits with a custom wallet implementation.
:::

```typescript title="auto_gas_estimation" showLineNumbers 
// Read the gas a transaction would consume before sending, and pad it yourself.
const { gasUsed: autoGasUsed } = await token.methods
  .mint_to_public(aliceAddress, 1n)
  .simulate({ from: aliceAddress, includeMetadata: true });
const autoEstimate = autoGasUsed!.totalGas.mul(1.2); // 20% padding
console.log("Auto-estimated L2 gas:", autoEstimate.l2Gas);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_advanced/index.ts#L474-L481" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L474-L481</a></sub></sup>


:::tip
Gas estimation runs a simulation first to determine actual gas usage, then adds padding for safety. This works with all payment methods, including FPCs.
:::

## Next steps

- Learn about [fee concepts](../foundational-topics/fees.md) in detail
- Explore [authentication witnesses](./how_to_use_authwit.md) for delegated payments
- See [testing guide](./how_to_test.md) for fee testing strategies
