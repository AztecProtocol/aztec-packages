---
title: How to Pay Fees
tags: [fees, transactions, developers]
---

There a several ways to pay for transaction fees, thanks to fee abstraction implemented in the Aztec protocol.

This guide shows how this can be done in TypeScript. For more of a background see [Fees on Aztec](../../../aztec/concepts/fees).

## Methods to pay a tx fee

- Natively via previously claimed bridged fee juice (account_init.test.ts)
    - Either your own account or someone elses
- Claim bridged funds and pay in the same public/private tx (fee_juice_payments.test.ts)
- Privately or publicly via a Fee Paying Contract (FPC)


## Fee Options

Functions pertaining to sending a transaction, such as `deploy` and `send`, each include a `fee` variable that is:

import { Fee_Components, Gas_Settings } from '/components/snippets';

#include_code user_fee_options yarn-project/aztec.js/src/entrypoint/payload.ts javascript

### Fee Payment Method interface

The interface is an object for the type of payment. Each of the implementations can be found [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/yarn-project/aztec.js/src/fee)


<Fee_Components />

<Gas_Settings />

#include_code gas_settings_vars yarn-project/circuits.js/src/structs/gas_settings.ts javascript


## Claim and pay

#include_code claim_and_pay yarn-project/end-to-end/src/e2e_fees/fee_juice_payments.test.ts javascript

## References



