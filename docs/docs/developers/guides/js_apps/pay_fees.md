---
title: How to Pay Fees
tags: [fees, transactions, developers]
---

There a several ways to pay for transaction fees, thanks to fee abstraction implemented in the Aztec protocol.

This guide shows how this can be done in TypeScript. For more of a background see [Fees on Aztec](../../../aztec/concepts/fees).

## Methods to pay a tx fee

- Natively via previously claimed bridged fee juice
    - Either your own account or someone elses
- Claim bridged funds and pay in the same public/private tx (fee_juice_payments.test.ts)
- Privately or publicly via a Fee Paying Contract (FPC)


## Fee Options

Functions pertaining to sending a transaction, such as `deploy` and `send`, each include a `fee` variable defined with the following (optional) parameters:

#include_code user_fee_options yarn-project/aztec.js/src/entrypoint/payload.ts javascript


### Fee Payment Method

The `paymentMethod` is an object for the type of payment. Each of the implementations can be found [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/yarn-project/aztec.js/src/fee). For example:

#include_code fee_juice_method yarn-project/aztec.js/src/fee/fee_juice_payment_method.ts javascript

### Gas Settings

#include_code gas_settings_vars yarn-project/circuits.js/src/structs/gas_settings.ts javascript

import { Gas_Components, Gas_Settings } from '/components/snippets';

<Gas_Settings />

<Gas_Components />

### Other params

Fee and gas padding params can be left to their default values, and the estimateGas boolean can be used when simulating a tx to calculate gas.

With the fee options explained, lets do a paid transaction.

## Example: Pay with FeeJuice

Using fee juice to deploy a pre-funded account via an AccountManager is as follows.

#include_code pay_fee_juice_deploy yarn-project/end-to-end/src/e2e_fees/account_init.test.ts javascript

Or to send a transaction using fee juice (eg token transfer):

#include_code pay_fee_juice_send yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts javascript


import { CLI_Fees } from '/components/snippets';

<CLI_Fees />

See here to [Bridge Fee Juice](../../../developers/reference/environment_reference/cli_wallet_reference#bridge-fee-juice) via the CLI wallet.

## Claim and pay

After a user has sent fee juice from L1 to be bridged to L2, a transaction can be made that claims this to pay for itself, and make the transaction, in one.

#include_code claim_and_pay yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts javascript

## References

