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

| Method              | Use Case                      | Privacy | Requirements               |
| ------------------- | ----------------------------- | ------- | -------------------------- |
| Fee Juice (default) | Account already has Fee Juice | Public  | Funded account             |
| Sponsored FPC       | Testing, free transactions    | Public  | None                       |
| Private FPC         | Pay with tokens privately     | Private | Token balance, FPC address |
| Public FPC          | Pay with tokens publicly      | Public  | Token balance, FPC address |
| Bridge + Claim      | Bootstrap from L1             | Public  | L1 ETH for gas             |

## Mana and Fee Juice

Mana is Aztec's unit of computational effort (like gas on Ethereum), and Fee Juice is the native fee token used to pay for transactions. For a detailed explanation of these concepts, see [Fee Concepts](../foundational-topics/fees.md).

## Estimate mana costs

:::tip Automatic estimation with EmbeddedWallet
When using `EmbeddedWallet`, gas is estimated automatically on every `send()` call. You only need to manually estimate if you want to preview costs before sending, or if you're using a custom wallet implementation.
:::

Before sending a transaction, you can estimate the mana it will consume by simulating with `estimateGas: true`:

```typescript
const { estimatedGas } = await token.methods
  .transfer_in_public(aliceAddress, bobAddress, 1n, 0n)
  .simulate({
    from: aliceAddress,
    fee: { estimateGas: true, estimatedGasPadding: 0.1 },
  });
```

The `estimatedGas` object contains:

- `gasLimits.daGas` - Estimated DA mana for main execution
- `gasLimits.l2Gas` - Estimated L2 mana for main execution
- `teardownGasLimits.daGas` - Estimated DA mana for teardown phase
- `teardownGasLimits.l2Gas` - Estimated L2 mana for teardown phase

### Calculate expected fee from estimate

To calculate the expected fee from estimated gas, use the `computeFee` method with current network fees:

```typescript
const currentFees = await node.getCurrentMinFees();
const estimatedFee = estimatedGas.gasLimits.computeFee(currentFees).toBigInt();
console.log("Estimated fee:", estimatedFee);
```

:::tip
The `estimatedGasPadding` parameter adds a safety margin to the estimate. A value of `0.1` adds 10% padding. Use higher padding for transactions with variable gas costs.
:::

## Get transaction fee from receipt

After a transaction is mined, you can retrieve the fee paid from the receipt:

```typescript
const { receipt: feeReceipt } = await token.methods
  .mint_to_public(aliceAddress, 1n)
  .send({ from: aliceAddress });
console.log("Transaction fee:", feeReceipt.transactionFee);
```

The `transactionFee` field is a `bigint` representing the total fee paid in the fee token (Fee Juice). You can also check execution status:

```typescript
console.log("Succeeded:", feeReceipt.hasExecutionSucceeded());
console.log("Block:", feeReceipt.blockNumber);
console.log("Fee paid:", feeReceipt.transactionFee);
```

## Pay with Fee Juice

Fee Juice is the native fee token on Aztec.

If your account has Fee Juice (for example, from a faucet), is [deployed](./how_to_create_account.md), and is registered in your wallet, it will be used automatically to pay for the fee of the transaction:

```typescript
// contract is a deployed contract instance; aliceAddress is from the connection guide
const { receipt: feeJuiceReceipt } = await token.methods
  .mint_to_public(aliceAddress, 1n)
  .send({
    from: aliceAddress,
    // no fee payment method needed — Fee Juice is used automatically
  });
console.log("Transaction fee:", feeJuiceReceipt.transactionFee);
```

## Use Fee Payment Contracts

Fee Payment Contracts (FPC) pay fees on your behalf, typically accepting a different token than Fee Juice. Since Fee Juice is non-transferable on L2, FPCs are the most common fee payment method.

### Sponsored Fee Payment Contracts

:::note
The Sponsored FPC is **not** deployed on mainnet or testnet. It is only available on devnet and local network. To pay fees on mainnet, you must either [bridge Fee Juice from L1](#bridge-fee-juice-from-l1) or deploy your own fee-paying contract.
:::

The Sponsored FPC pays for fees unconditionally without requiring payment in return. It is available on the local network and devnet (deployed by Aztec Labs), but **not on mainnet or testnet**.

You can derive the Sponsored FPC address from its deployment parameters, register it with your wallet, and use it to pay for transactions:

```typescript title="deploy_sponsored_fpc_contract" showLineNumbers 
// Set up the Sponsored FPC (see fees guide for full setup)
const sponsoredFPCInstance = await getContractInstanceFromInstantiationParams(
  SponsoredFPCContract.artifact,
  { salt: new Fr(0) },
);
await wallet.registerContract(sponsoredFPCInstance, SponsoredFPCContract.artifact);
const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPCInstance.address);

// wallet is from the connection guide; sponsoredPaymentMethod is from the fees guide
const { contract: sponsoredContract } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "SponsoredToken",
  "SPT",
  18,
).send({ from: aliceAddress, fee: { paymentMethod: sponsoredPaymentMethod } });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.2.0-aztecnr-rc.2/docs/examples/ts/aztecjs_advanced/index.ts#L42-L59" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L42-L59</a></sub></sup>


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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.2.0-aztecnr-rc.2/yarn-project/end-to-end/src/e2e_fees/sponsored_payments.test.ts#L57-L68" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_fees/sponsored_payments.test.ts#L57-L68</a></sub></sup>


### Use other Fee Paying Contracts

Third-party FPCs can pay for your fees using custom logic, such as accepting different tokens instead of Fee Juice.

#### Set gas settings

```typescript
import { GasSettings } from "@aztec/stdlib/gas";

// node is from createAztecNodeClient() in the connection guide (see prerequisites)
const maxFeesPerGas = (await node.getCurrentMinFees()).mul(1.5); //adjust this to your needs
const gasSettings = GasSettings.default({ maxFeesPerGas });
```

Private FPCs enable fee payments without revealing the payer's identity onchain:

```typescript title="private_fpc_payment" showLineNumbers 
// The private fee paying method assembled on the app side requires knowledge of the maximum
// fee the user is willing to pay
const maxFeesPerGas = (await node.getCurrentMinFees()).mul(1.5);
const gasSettings = GasSettings.default({ maxFeesPerGas });
const paymentMethod = new PrivateFeePaymentMethod(bananaFPCAddress, alice, wallet, gasSettings);
const { receipt: receiptForAlice } = await bananaCoin.methods
  .transfer(bob, amountTransferToBob)
  .send({ from: alice, fee: { paymentMethod } });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.2.0-aztecnr-rc.2/yarn-project/end-to-end/src/composed/e2e_local_network_example.test.ts#L185-L194" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/e2e_local_network_example.test.ts#L185-L194</a></sub></sup>


Public FPCs can be used in the same way:

```typescript
import { PublicFeePaymentMethod } from "@aztec/aztec.js/fee";

// wallet is from the connection guide; fpcAddress is the FPC contract address
// senderAddress is the account paying; gasSettings is from the step above
const paymentMethod = new PublicFeePaymentMethod(
  fpcAddress,
  senderAddress,
  wallet,
  gasSettings,
);
```

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

Under the hood, `L1FeeJuicePortalManager` gets the L1 addresses from the node `node_getNodeInfo` endpoint. It then exposes an easy method `bridgeTokensPublic` which mints fee juice on L1 and sends it to an L2 address via the L1 portal:

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

After this transaction is minted on L1 and a few blocks pass, you can claim the message on L2 and use it directly to pay for fees:

```typescript title="bridge_fee_juice_claim" showLineNumbers
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";

// claim is from the bridgeTokensPublic step above
// Create a payment method that claims the bridged Fee Juice and uses it to pay
const bridgePaymentMethod = new FeeJuicePaymentMethodWithClaim(feeJuiceAccount.address, claim);

// Use it to pay for any transaction — here we deploy the account in one step
const deployMethodBridged = await feeJuiceAccount.getDeployMethod();
await deployMethodBridged.send({
  from: NO_FROM,
  fee: { paymentMethod: bridgePaymentMethod },
});
```

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
const gasSettings = GasSettings.from({
  gasLimits: { daGas: 100_000, l2Gas: 2_000_000 },
  teardownGasLimits: { daGas: 100_000, l2Gas: 2_000_000 },
  maxFeesPerGas: { feePerDaGas: networkFees.feePerDaGas * 2n, feePerL2Gas: networkFees.feePerL2Gas * 2n },
  maxPriorityFeesPerGas: { feePerDaGas: 0n, feePerL2Gas: 0n },
});
```

```typescript
const { receipt: gsReceipt } = await token.methods.mint_to_public(aliceAddress, 1n).send({
  from: aliceAddress,
  fee: { gasSettings },
});
```

Note that `gasLimits` and `teardownGasLimits` use `daGas`/`l2Gas` field names, while `maxFeesPerGas` and `maxPriorityFeesPerGas` use `feePerDaGas`/`feePerL2Gas`.

### Use automatic gas estimation

:::note
When using `EmbeddedWallet`, gas estimation happens automatically on every `send()` — you don't need to pass `estimateGas`. This option is useful for custom wallet implementations or when you want to estimate gas during a `simulate()` call.
:::

```typescript title="auto_gas_estimation" showLineNumbers
// Estimate gas for a transaction before sending
const { estimatedGas: autoEstimate } = await token.methods
  .mint_to_public(aliceAddress, 1n)
  .simulate({
    from: aliceAddress,
    fee: {
      estimateGas: true,
      estimatedGasPadding: 0.2, // 20% padding
    },
  });
console.log("Auto-estimated L2 gas:", autoEstimate.gasLimits.l2Gas);
```

:::tip
Gas estimation runs a simulation first to determine actual gas usage, then adds padding for safety. This works with all payment methods, including FPCs.
:::

## Next steps

- Learn about [fee concepts](../foundational-topics/fees.md) in detail
- Explore [authentication witnesses](./how_to_use_authwit.md) for delegated payments
- See [testing guide](./how_to_test.md) for fee testing strategies
