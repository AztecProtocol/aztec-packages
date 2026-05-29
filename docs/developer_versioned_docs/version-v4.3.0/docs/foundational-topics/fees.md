---
title: Fees
sidebar_position: 4
tags: [fees, mana, gas]
description: Understand Aztec's fee system including mana-based transaction pricing, Aztec token and Fee Juice payments, and how L1 and L2 costs are transparently calculated for users.
references: ["yarn-project/stdlib/src/gas/gas_settings.ts"]
---

import { Why_Fees } from '@site/src/components/Snippets/general_snippets';

<Why_Fees />

In a nutshell, the pricing of transactions transparently accounts for:

- L1 costs, including L1 execution of a block, and data availability via blobs,
- L2 node operating costs, including proving

This is achieved through multiple variables and calculations.

## Terminology

Familiar terms from Ethereum mainnet as referred to on the Aztec network:

| Ethereum Mainnet | Aztec              | Description                                                    |
| ---------------- | ------------------ | -------------------------------------------------------------- |
| gas              | mana               | Unit measuring computational effort for transaction operations |
| fee per gas      | Fee Juice per mana | Price per unit of mana                                         |
| fee (wei)        | Fee Juice          | Total fee paid for a transaction                               |

## What is mana?

Mana is Aztec's unit of computational effort, equivalent to gas on Ethereum. Every transaction consumes mana based on the operations it performs.

Mana has two dimensions:

- **Data Availability (DA) mana**: Cost of publishing transaction data to the data availability layer
- **L2 mana**: Cost of executing the transaction on Aztec

The total transaction fee is calculated as:

```
fee = (daMana × feePerDaMana) + (l2Mana × feePerL2Mana)
```

:::note
The SDK and protocol code use "gas" in variable names (e.g., `daGas`, `l2Gas`, `feePerDaGas`, `feePerL2Gas`) rather than "mana". When reading code, `Gas` and mana refer to the same concept.
:::

## What is Fee Juice?

Fee Juice is the native fee token on Aztec, used to pay for transaction fees. It is bridged Aztec tokens from Ethereum and is **non-transferable** on Aztec - it can only be used to pay fees, not sent between accounts.

Aztec borrows ideas from EIP-1559, including congestion multipliers and the ability to specify base and priority fees per mana.

## Factors affecting fees

Other fields used in mana and fee calculations are determined in various ways:

- hard-coded constants (eg congestion update fraction)
- values assumed constant (eg L1 gas cost of publishing a block, blobs per block)
- informed from previous block header and/or L1 rollup contract (eg base fee per mana)
- informed via an oracle (eg wei per mana)

Most constants are defined by the protocol, while others are part of the rollup contract on L1.

### User-defined settings

Users can define the following settings as part of a transaction:

import { Gas_Settings_Components, Gas_Settings, Tx_Teardown_Phase } from '@site/src/components/Snippets/general_snippets';

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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.0/yarn-project/stdlib/src/gas/gas_settings.ts#L26-L35" target="_blank" rel="noopener noreferrer">Source code: yarn-project/stdlib/src/gas/gas_settings.ts#L26-L35</a></sub></sup>


<Gas_Settings_Components />

## Fee payment

A fee payer obtains Fee Juice by bridging Aztec tokens from Ethereum. The fee payer can be the account itself or a fee-paying contract (FPC), which functions similarly to a paymaster on Ethereum. On Aztec, Fee Juice is non-transferable and only deducted by the protocol to pay for fees. A user can claim bridged Fee Juice and use it to pay for transaction fees in the same transaction.

Fee Juice uses an enshrined `FeeJuicePortal` contract on Ethereum for bridging, unlike user-deployed token portals. The underlying cross-chain messaging mechanism is similar to other tokens - for more on this concept see the [Token Bridge Tutorial](../tutorials/js_tutorials/token_bridge.md) which describes portal contracts and [cross-chain messaging](../aztec-nr/framework-description/ethereum_aztec_messaging.md).

### Payment methods

An account with Fee Juice can pay for its transactions directly. A new account can even pay for its own deployment transaction, provided Fee Juice was bridged to its address before deployment.

Alternatively, accounts can use [fee-paying contracts (FPCs)](../aztec-js/how_to_pay_fees.md#use-fee-payment-contracts) to pay for transactions. An FPC holds its own Fee Juice balance to pay the protocol, and can accept other tokens from users in exchange.

The **Sponsored FPC** pays fees unconditionally, enabling free transactions. It is available on testnet, devnet, and local network. On mainnet, ecosystem-deployed FPCs are the practical option: the built-in reference FPC contract does not work on mainnet alpha because custom token class IDs are not included in the default public setup allowlist. As an example, Nethermind's [Private Multi Asset FPC](https://github.com/NethermindEth/aztec-fpc) demonstrates one such design; it accepts multiple tokens and routes fee payments as private notes.

### How FPCs work

An FPC acts as a fee payer on the user's behalf. Simpler FPCs (like the Sponsored FPC) just call `set_as_fee_payer()` with no user payment at all. More sophisticated FPCs accept user tokens in exchange for paying Fee Juice. A common pattern for quote-based FPCs works as follows:

1. **Quote.** The user requests a fee quote from the FPC operator, specifying the token they want to pay with and the estimated gas cost. The operator signs the quote, binding it to the user, asset, amounts, and an expiry.
2. **Authorization.** The user creates an [authentication witness](./advanced/authwit.md) authorizing the FPC to transfer tokens from their balance. This is the same authwit mechanism used for any delegated token transfer.
3. **Setup phase (non-revertible).** The FPC's entrypoint runs during the transaction's [setup phase](./transactions.md#setup-phase-non-revertible). It verifies the quote, collects the user's payment, declares itself as the fee payer via `set_as_fee_payer()`, and calls `end_setup()` to mark the boundary between non-revertible and revertible execution. Because this runs in the non-revertible phase, the payment is **irrevocably committed** before application logic executes: the user pays regardless of whether the app-logic phase reverts.
4. **App phase (revertible).** The user's actual transaction logic runs here. In the common fee-entrypoint flow the FPC is not involved in this phase, though some FPC designs (such as cold-start flows) perform additional app-phase work like claiming bridged tokens.

:::note Setup-phase allowlist
Setup-phase execution is restricted by a protocol-level allowlist of permitted public function calls. Public token functions such as `transfer_in_public` and `_increase_public_balance` have been removed from the default allowlist; custom FPCs may only call protocol-contract setup functions (for example those on `AuthRegistry` and `FeeJuice`). See the [migration note](../resources/migration_notes.md#custom-token-fpcs-removed-from-default-public-setup-allowlist) for details.
:::

Key properties for developers integrating with an FPC:

- **Authwit scope.** The authwit authorizes a specific action hash (typically covering the transfer amount). A nonce can be included when otherwise-identical actions need to be distinguishable. The authwit is single-use, consumed by a nullifier onchain.
- **Token interface.** On networks that use the default setup allowlist, an FPC cannot call arbitrary public token functions during setup (see the callout above). Fee collection for quote-based FPCs therefore typically happens in the private domain: the user privately transfers an agreed amount to the FPC (or its operator) under the authwit from step 2, and the FPC separately declares itself the fee payer during setup using only protocol-contract calls. Any token that implements the standard Aztec token interface with authwit verification is compatible with this private-note pattern.
- **Gas estimation first.** The Fee Juice amount in the quote is typically derived from the transaction's gas estimate. Simulate and estimate gas _before_ requesting a quote, then pass the estimated cost to the FPC operator.
- **Quote expiry.** Quotes are time-bound and single-use. Fetch a fresh quote per transaction.
- **Cold-start variant.** Some FPCs offer a cold-start entrypoint where a brand-new account can bridge tokens from L1, claim them on L2, and pay the fee in one transaction, with no prior L2 balance or authwit needed, because the FPC itself claims and distributes the bridged tokens. The user still needs L1 tokens and ETH for the initial bridge transaction.

Fee payments themselves can also be made private via a fully private FPC that holds Fee Juice internally and nominates itself as the fee payer during the setup phase, without revealing who initiated the transaction. See [Pay Fees Privately](../aztec-js/how_to_use_private_fee_juice.md) for how this pattern works and an example implementation.

### Teardown phase

<Tx_Teardown_Phase />

This enables FPCs to calculate the actual transaction cost and refund any overpayment to the user. Not all FPC designs use the teardown phase; some charge a fixed quoted amount with no refund, keeping unused Fee Juice in the FPC's balance for future transactions.

### Operator rewards

The calculated fee of a transaction is deducted from the fee payer (nominated account or fee-paying contract), then pooled together across transactions, blocks, and epochs. Once an epoch is proven, the total collected fees (minus any burnt congestion amount) are distributed to the provers and block proposers that contributed to the epoch.

## Next steps

For a guide on paying fees programmatically, see [How to Pay Fees](../aztec-js/how_to_pay_fees.md).
