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

#include_code get_node_info_pub_client yarn-project/end-to-end/src/spartan/smoke.test.ts javascript

After importing:

```ts
import { L1FeeJuicePortalManager } from "@aztec/aztec.js";
```

Create a new fee juice portal manager and bridge fee juice publicly to Aztec:

#include_code bridge_fee_juice yarn-project/end-to-end/src/spartan/setup_test_wallets.ts javascript

Bridging can also be done privately with the corresponding function:

#include_code bridge_tokens_private yarn-project/aztec.js/src/ethereum/portal_manager.ts javascript

For the mechanisms to complete bridging between L1 and Aztec, any two other transactions on the sandbox are made. After this, an already deployed account should have its fee juice ready to use in transactions.

Alternatively, the resulting claim object can be used to create a payment method to claim and pay for a transaction in one, where the transaction is the contract's deployment.


## Fee Options

Functions pertaining to sending a transaction, such as `deploy` and `send`, each include a `fee` variable defined with the following (optional) parameters:

#include_code user_fee_options yarn-project/entrypoints/src/interfaces.ts javascript


### Fee Payment Method

The `paymentMethod` is an object for the type of payment. Each of the implementations can be found [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/yarn-project/aztec.js/src/fee). For example:

#include_code fee_juice_method yarn-project/aztec.js/src/fee/fee_juice_payment_method.ts javascript

### Gas Settings

#include_code gas_settings_vars yarn-project/stdlib/src/gas/gas_settings.ts javascript

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

#include_code pay_fee_juice_send yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts javascript

**The equivalent to specify fees via CLI...**

import { CLI_Fees } from '/components/snippets';

<CLI_Fees />

### Claim and deploy

Here we will use the `claim` object previously from the bridging section, and the corresponding `wallet`, to create the payment method. The payment method is then used to claim fee juice and pay for account contract deployment. Note the function used to bridge fee juice (private/public) should correspond to how the fee juice is claimed.

#include_code claim_and_deploy yarn-project/bot/src/factory.ts javascript

#### Claim and Pay

Calling a function, in this case checking the balance of the fee juice contract:

#include_code claim_and_pay yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts javascript

### Fee Paying Contract

Similarly with a fee paying contract, the fee payment method is created and used as follows:

#include_code fpc yarn-project/end-to-end/src/e2e_fees/public_payments.test.ts javascript

In this example, thanks to the FPC's `accepted_asset` being banana tokens, Alice only needs to hold this token and not fee juice. The function being called happens to also be a transfer of banana tokens to Bob.

More on FPCs [here](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts/fpc_contract/src/main.nr)
