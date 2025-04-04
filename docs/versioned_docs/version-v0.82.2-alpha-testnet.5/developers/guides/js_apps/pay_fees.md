---
title: How to Pay Fees
tags: [fees, transactions, developers]
sidebar_position: 3
---

There a several ways to pay for transaction fees, thanks to fee abstraction implemented in the Aztec protocol.

This guide shows the various ways this can be done. For more of a background see [Fees on Aztec](../../../aztec/concepts/fees).

## Methods to pay a tx fee

### Natively via an existing balance of fee juice

Either your own account or someone else's address has a balance of fee juice, and the transaction is paid for from this balance.

### Natively via a balance of fee juice to be claimed

Processing this transaction first claims bridged fee juice then is paid for from the balance, all in the same public/private tx.

### Privately or publicly via a Fee Paying Contract

A fee paying contract (FPC) is created and nominates a token that it accepts to then pay for txs in fee juice. So a user doesn't need to hold fee juice, they only need the token that the FPC accepts.

### Sponsored Fee Paying Contract (SponsoredFPC)

The most straightforward way to pay for a transaction is via the sponsored fee payment method, bootstrapping some transactions by skipping the need to bridge fee juice to the account. This method uses a type of fee paying contract configured to pay for a number of transactions without requiring payment.

## Bridging fee-juice

To first get fee juice into an account it needs to be bridged from L1. You can skip this section if you want to first make a transaction via the SponsoredFPC.

:::note
See here to [Bridge Fee Juice](../../../developers/reference/environment_reference/cli_wallet_reference#bridge-fee-juice) via the CLI wallet.

:::

One way of bridging of tokens is described fully [here](../../../developers/tutorials/codealong/contract_tutorials/token_bridge#deposit-to-aztec). Below summarises specifically bridging fee juice on the sandbox.

First get the node info and create a public client pointing to the sandbox's anvil L1 node (from foundry):

```javascript title="get_node_info_pub_client" showLineNumbers 
const info = await pxe.getNodeInfo();
const publicClient = getPublicClient({
  l1RpcUrls: ['http://localhost:8545'],
  l1ChainId: foundry.id,
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/end-to-end/src/spartan/smoke.test.ts#L50-L56" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/spartan/smoke.test.ts#L50-L56</a></sub></sup>


After importing:

```ts
import { L1FeeJuicePortalManager } from "@aztec/aztec.js";
```

Create a new fee juice portal manager and bridge fee juice publicly to Aztec:

```javascript title="bridge_fee_juice" showLineNumbers 
const portal = await L1FeeJuicePortalManager.new(pxe, publicClient, walletClient, log);
const claim = await portal.bridgeTokensPublic(recipient, amount, true /* mint */);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/end-to-end/src/spartan/setup_test_wallets.ts#L109-L112" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/spartan/setup_test_wallets.ts#L109-L112</a></sub></sup>


Bridging can also be done privately with the corresponding function:

```javascript title="bridge_tokens_private" showLineNumbers 
/**
 * Bridges tokens from L1 to L2 privately. Handles token approvals. Returns once the tx has been mined.
 * @param to - Address to send the tokens to on L2.
 * @param amount - Amount of tokens to send.
 * @param mint - Whether to mint the tokens before sending (only during testing).
 */
public async bridgeTokensPrivate(
  to: AztecAddress,
  amount: bigint,
  mint = false,
): Promise<L2AmountClaimWithRecipient> {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/aztec.js/src/ethereum/portal_manager.ts#L312-L324" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/ethereum/portal_manager.ts#L312-L324</a></sub></sup>


For the mechanisms to complete bridging between L1 and Aztec, any two other transactions on the sandbox are made. After this, an already deployed account should have its fee juice ready to use in transactions.

Alternatively, the resulting claim object can be used to create a payment method to claim and pay for a transaction in one, where the transaction is the contract's deployment.


## Fee Options

Functions pertaining to sending a transaction, such as `deploy` and `send`, each include a `fee` variable defined with the following (optional) parameters:

```javascript title="user_fee_options" showLineNumbers 
/** Fee options as set by a user. */
export type UserFeeOptions = {
  /** The fee payment method to use */
  paymentMethod?: FeePaymentMethod;
  /** The gas settings */
  gasSettings?: Partial<FieldsOf<GasSettings>>;
  /** Percentage to pad the base fee by, if empty, defaults to 0.5 */
  baseFeePadding?: number;
  /** Whether to run an initial simulation of the tx with high gas limit to figure out actual gas settings. */
  estimateGas?: boolean;
  /** Percentage to pad the estimated gas limits by, if empty, defaults to 0.1. Only relevant if estimateGas is set. */
  estimatedGasPadding?: number;
};
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/entrypoints/src/interfaces.ts#L79-L93" target="_blank" rel="noopener noreferrer">Source code: yarn-project/entrypoints/src/interfaces.ts#L79-L93</a></sub></sup>



### Fee Payment Method

The `paymentMethod` is an object for the type of payment. Each of the implementations can be found [here](https://github.com/AztecProtocol/aztec-packages/blob/v0.82.2/yarn-project/aztec.js/src/fee). For example:

```javascript title="fee_juice_method" showLineNumbers 
/**
 * Pay fee directly in the Fee Juice.
 */
export class FeeJuicePaymentMethod implements FeePaymentMethod {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/aztec.js/src/fee/fee_juice_payment_method.ts#L6-L11" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/fee/fee_juice_payment_method.ts#L6-L11</a></sub></sup>


### Gas Settings

```javascript title="gas_settings_vars" showLineNumbers 
/** Gas usage and fees limits set by the transaction sender for different dimensions and phases. */
export class GasSettings {
  constructor(
    public readonly gasLimits: Gas,
    public readonly teardownGasLimits: Gas,
    public readonly maxFeesPerGas: GasFees,
    public readonly maxPriorityFeesPerGas: GasFees,
  ) {}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/stdlib/src/gas/gas_settings.ts#L11-L20" target="_blank" rel="noopener noreferrer">Source code: yarn-project/stdlib/src/gas/gas_settings.ts#L11-L20</a></sub></sup>


import { Gas_Settings_Components, Gas_Settings } from '/components/snippets';

<Gas_Settings />

<Gas_Settings_Components />


### Other params

Fee and gas padding params can be left to their default values, and the estimateGas boolean can be used when simulating a tx to calculate gas.

With the fee options explained, lets do a paid transaction.

## Examples

### Sponsored Fee Paying Contract

Creating the SponsoredFPC is as simple as passing it the PXE:
```ts
const paymentMethod = await SponsoredFeePaymentMethod.new(pxe);
```

Then a transaction can specify this as the `paymentMethod` in the fee object.
For example, a contract can be deployed with an fpc as follows:

```ts
const paymentMethod = await SponsoredFeePaymentMethod.new(pxe);
myAccountManager.deploy({ fee: { paymentMethod } });
```

### Pay with FeeJuice

To send a transaction from an already deployed account already holding fee juice:
(Note: this example is a public token transfer call, but can equally be a private function call)

```javascript title="pay_fee_juice_send" showLineNumbers 
const paymentMethod = new FeeJuicePaymentMethod(aliceAddress);
const { transactionFee } = await bananaCoin.methods
  .transfer_in_public(aliceAddress, bobAddress, 1n, 0n)
  .send({ fee: { gasSettings, paymentMethod } })
  .wait();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts#L86-L92" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts#L86-L92</a></sub></sup>


**The equivalent to specify fees via CLI...**

import { CLI_Fees } from '/components/snippets';

<CLI_Fees />

### Claim and deploy

Here we will use the `claim` object previously from the bridging section, and the corresponding `wallet`, to create the payment method. The payment method is then used to claim fee juice and pay for account contract deployment. Note the function used to bridge fee juice (private/public) should correspond to how the fee juice is claimed.

```javascript title="claim_and_deploy" showLineNumbers 
const wallet = await account.getWallet();
const paymentMethod = new FeeJuicePaymentMethodWithClaim(wallet, claim);
const sentTx = account.deploy({ fee: { paymentMethod } });
const txHash = await sentTx.getTxHash();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/bot/src/factory.ts#L121-L126" target="_blank" rel="noopener noreferrer">Source code: yarn-project/bot/src/factory.ts#L121-L126</a></sub></sup>


#### Claim and Pay

Calling a function, in this case checking the balance of the fee juice contract:

```javascript title="claim_and_pay" showLineNumbers 
const paymentMethod = new FeeJuicePaymentMethodWithClaim(bobWallet, claim);
const receipt = await feeJuiceContract
  .withWallet(bobWallet)
  .methods.check_balance(0n)
  .send({ fee: { gasSettings, paymentMethod } })
  .wait();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts#L67-L74" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts#L67-L74</a></sub></sup>


### Fee Paying Contract

Similarly with a fee paying contract, the fee payment method is created and used as follows:

```javascript title="fpc" showLineNumbers 
const tx = await bananaCoin.methods
  .transfer_in_public(aliceAddress, bobAddress, bananasToSendToBob, 0)
  .send({
    fee: {
      gasSettings,
      paymentMethod: new PublicFeePaymentMethod(bananaFPC.address, aliceWallet),
    },
  })
  .wait();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/end-to-end/src/e2e_fees/public_payments.test.ts#L59-L69" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_fees/public_payments.test.ts#L59-L69</a></sub></sup>


In this example, thanks to the FPC's `accepted_asset` being banana tokens, Alice only needs to hold this token and not fee juice. The function being called happens to also be a transfer of banana tokens to Bob.

More on FPCs [here](https://github.com/AztecProtocol/aztec-packages/tree/v0.82.2/noir-projects/noir-contracts/contracts/fpc_contract/src/main.nr)
