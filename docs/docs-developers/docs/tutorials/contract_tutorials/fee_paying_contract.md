---
title: Fee Paying Contracts
description: Build contracts that pay transaction fees on behalf of users, from simple self-paying patterns to full-featured FPCs accepting different tokens.
sidebar_position: 2
tags: [fees, payments, contracts, advanced]
references: ["docs/examples/contracts/self_paying_counter/src/main.nr", "docs/examples/contracts/tutorial_fpc/src/main.nr", "docs/examples/contracts/tutorial_fpc/src/config.nr"]
---

In this tutorial, you'll learn how to build contracts that pay transaction fees. We'll cover two patterns:

1. **Pattern 1 (Simple)**: A self-paying counter contract that pays its own fees
2. **Pattern 2 (Advanced)**: A Fee Paying Contract (FPC) that accepts a different token and pays fees on behalf of any user

## Prerequisites

This is an advanced tutorial that assumes you have:

- Completed the [Counter Contract tutorial](./counter_contract.md)
- A running Aztec local network
- Basic understanding of Aztec.nr syntax and structure
- Aztec toolchain installed (`bash -i <(curl -s https://install.aztec.network/#include_version_without_prefix/)`)

:::note[Local Network Only]
This tutorial requires funding contracts with Fee Juice. Since Fee Juice is non-transferable on L2, contracts can only be funded via the faucet (local network) or by bridging from L1. These patterns are currently practical only on local networks.
:::

## Understanding Fee Payment on Aztec

Before building, let's understand how fees work on Aztec.

### Transaction Flow

Every transaction on Aztec goes through an account contract's entrypoint. The account receives:

- **app_payload**: The actual function calls to execute (your contract logic)
- **fee_payment_method**: How fees will be paid

### Fee Payment Methods

The account contract supports three fee payment methods:

| Method | Value | Description |
|--------|-------|-------------|
| `EXTERNAL` | 0 | Another contract (FPC) pays - account does nothing for fees |
| `PREEXISTING_FEE_JUICE` | 1 | Account pays with existing Fee Juice balance |
| `FEE_JUICE_WITH_CLAIM` | 2 | Account pays with Fee Juice bridged from Ethereum being claimed in same tx |

When using `EXTERNAL`, your contract becomes responsible for calling `set_as_fee_payer()` and `end_setup()`.

### Transaction Phases

Every Aztec transaction has three phases:

1. **Setup** (non-revertible): Fee payer is registered, `end_setup()` is called
2. **Execution** (revertible): Your app logic runs
3. **Teardown** (non-revertible): Fee calculation and refunds

The key insight: `end_setup()` transitions from setup to execution phase. Without it, everything stays non-revertible!

## Part 1: Self-Paying Counter (Simple Pattern)

Let's build a counter contract that pays its own transaction fees. This is useful for:

- Sponsored interactions (contract owner pays for user activity)
- Gas abstraction (users don't need Fee Juice)
- Simplified UX (one less thing for users to worry about)

### Project Setup

Create a new contract project:

```bash
aztec new --contract self_paying_counter
cd self_paying_counter
```

Update `Nargo.toml` with dependencies:

```toml
[package]
name = "self_paying_counter_contract"
type = "contract"

[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-nr/", tag="#include_aztec_version", directory="aztec" }
balance_set = { git="https://github.com/AztecProtocol/aztec-nr/", tag="#include_aztec_version", directory="balance-set" }
```

### The Contract

Replace `src/main.nr` with:

```rust
#include_code all /docs/examples/contracts/self_paying_counter/src/main.nr raw
```

### Understanding the Key Function

The magic happens in `increment`. Let's break it down:

#include_code increment /docs/examples/contracts/self_paying_counter/src/main.nr rust

**Key points:**

1. **`#[nophasecheck]`**: Private functions normally include a check to validate that they're being called in the correct transaction phase. Since `set_as_fee_payer()` must be called in the setup phase but our function also does work in the execution phase (after `end_setup()`), this decorator skips the automatic phase validation and lets our function handle the phase transition itself.

2. **`set_as_fee_payer()`**: Registers this contract as the fee payer. The protocol will deduct Fee Juice from the contract's balance.

3. **`end_setup()`**: Transitions from setup to execution phase. Everything after this line is revertible.

4. **App logic after `end_setup()`**: The actual counter increment runs in the revertible execution phase.

### Funding the Contract

Before the contract can pay fees, it needs Fee Juice. Fund it using the faucet:

```bash
aztec faucet drip-fee-juice <CONTRACT_ADDRESS>
```

### Compile and Deploy

```bash
aztec compile
aztec codegen target --outdir artifacts
```

### Using the Self-Paying Counter

When calling this contract, you need to tell the account to use `EXTERNAL` fee payment. The contract itself handles the fee registration.

The simplest approach is to use the existing `SponsoredFeePaymentMethod` pattern, but since the counter's `increment` function already handles fee payment internally (unlike SponsoredFPC which has a separate sponsorship function), you need a custom payment method:

```typescript
import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import type { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";

/**
 * A fee payment method for contracts that handle fee payment within their own functions.
 * Unlike SponsoredFeePaymentMethod (which calls a separate sponsor function), this is for
 * contracts where the main function itself calls set_as_fee_payer() and end_setup().
 */
class SelfPayingContractMethod implements FeePaymentMethod {
  constructor(private contractAddress: AztecAddress) {}

  getAsset(): Promise<AztecAddress> {
    // Not applicable - the contract uses its own Fee Juice balance
    throw new Error("Asset is not required for self-paying contracts.");
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.contractAddress);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    // Return empty payload - the contract's function already handles fee payment
    // The feePayer field tells the wallet to use EXTERNAL fee payment method
    return new ExecutionPayload([], [], [], [], this.contractAddress);
  }

  getGasSettings(): GasSettings | undefined {
    return undefined;
  }
}

// Usage:
const paymentMethod = new SelfPayingContractMethod(counterContract.address);

await counterContract.methods.increment(owner.address)
  .send({ fee: { paymentMethod } })
  .wait();
```

**How it works:**
1. The wallet sees `feePayer = counterContract.address` (different from sender)
2. This triggers `EXTERNAL` fee payment mode in the account contract
3. The account doesn't call `set_as_fee_payer()` - it expects the app to handle it
4. Your `increment()` function runs and handles `set_as_fee_payer()` + `end_setup()`

## Part 2: Fee Paying Contract (Advanced Pattern)

Now let's build a more sophisticated FPC that:

- Accepts a different token (like a stablecoin) from users
- Uses its own Fee Juice balance to pay the actual network fee
- Refunds unused fees back to the user

This pattern is powerful because users can pay fees in any token, not just Fee Juice.

### Project Setup

```bash
aztec new --contract tutorial_fpc
cd tutorial_fpc
```

Update `Nargo.toml`:

```toml
[package]
name = "tutorial_fpc_contract"
type = "contract"

[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-nr/", tag="#include_aztec_version", directory="aztec" }
uint_note = { git="https://github.com/AztecProtocol/aztec-nr/", tag="#include_aztec_version", directory="uint-note" }
```

The FPC also needs the token contract interface. Since this isn't published as a standalone package, you'll need to copy the [token contract](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts/app/token_contract) into your project and reference it locally:

```toml
token = { path = "./token_contract" }
```

### Helper Utilities

Create `src/utils.nr` with a helper function for safe casting:

#include_code utils /docs/examples/contracts/tutorial_fpc/src/utils.nr rust

### Configuration

Create `src/config.nr` for the FPC configuration:

#include_code config /docs/examples/contracts/tutorial_fpc/src/config.nr rust

### The FPC Contract

Create `src/main.nr`:

```rust
#include_code all /docs/examples/contracts/tutorial_fpc/src/main.nr raw
```

### Understanding Private Fee Payment

The private fee payment flow is sophisticated. Let's walk through `fee_entrypoint_private`:

#include_code fee_entrypoint_private /docs/examples/contracts/tutorial_fpc/src/main.nr rust

**The flow:**

1. **Pull max fee**: Transfer tokens from user's private balance to FPC's public balance. This requires an [authwit](../../aztec-nr/framework-description/how_to_use_authwit.md) from the user.

2. **Prepare partial note**: Create an incomplete note that will hold the refund. We don't know the actual fee yet!

3. **Set teardown**: Register a function to run in the teardown phase. This is where we'll calculate the actual fee and complete the refund.

4. **Register as fee payer**: Tell the protocol this contract will pay.

5. **End setup**: Transition to revertible execution.

### The Refund Mechanism

In teardown, we finalize the refund:

#include_code complete_refund /docs/examples/contracts/tutorial_fpc/src/main.nr rust

**Key insight**: `transaction_fee()` is only available during teardown - that's when the protocol has calculated the actual cost.

### Public Fee Payment

The public flow is simpler since we don't need partial notes:

#include_code fee_entrypoint_public /docs/examples/contracts/tutorial_fpc/src/main.nr rust

### Admin Functions

The FPC accumulates user tokens as payment. The admin can withdraw these:

#include_code pull_funds /docs/examples/contracts/tutorial_fpc/src/main.nr rust

### Compile

```bash
aztec compile
aztec codegen target --outdir artifacts
```

## Using the FPC in TypeScript

Aztec.js provides `PrivateFeePaymentMethod` to work with FPCs:

```typescript
import { PrivateFeePaymentMethod } from "@aztec/aztec.js/fee";
import { GasSettings } from "@aztec/stdlib/gas";

// Create the payment method
const gasSettings = GasSettings.default({ maxFeesPerGas: await node.getCurrentMinFees() });

const paymentMethod = new PrivateFeePaymentMethod(
  fpc.address,      // The FPC contract address
  user.address,     // The user who will pay
  wallet,           // Wallet for creating authwits
  gasSettings,      // Gas settings for computing max fee
);

// Use it with any contract call
await someContract.methods.someFunction()
  .send({ fee: { paymentMethod, gasSettings } })
  .wait();
```

The `PrivateFeePaymentMethod` handles:

1. Computing the max fee from gas settings
2. Creating the authwit for the token transfer
3. Building the execution payload with the FPC entrypoint

## Verification and Testing

### Testing the Self-Paying Counter

1. Deploy the counter contract
2. Fund it with Fee Juice via faucet
3. Call `increment` - verify the counter's Fee Juice balance decreases

```typescript
const initialFeeJuice = await feeJuiceContract.methods
  .balance_of_public(counter.address).simulate();

await counter.methods.increment(owner.address)
  .send({ fee: { paymentMethod, gasSettings } })
  .wait();

const finalFeeJuice = await feeJuiceContract.methods
  .balance_of_public(counter.address).simulate();

// Fee Juice should have decreased
console.log(`Fee paid: ${initialFeeJuice - finalFeeJuice}`);
```

### Testing the FPC

1. Deploy the FPC with an accepted token
2. Fund the FPC with Fee Juice
3. Have a user call a contract using the FPC
4. Verify: user's token balance decreased, FPC's Fee Juice decreased, user received refund

## Summary

You've learned two patterns for fee payment on Aztec:

### Self-Paying Pattern
- Contract calls `set_as_fee_payer()` and `end_setup()` within its own functions
- Simple to implement, good for sponsored interactions
- Contract must have Fee Juice balance

### Full FPC Pattern
- Dedicated contract accepts arbitrary tokens for fees
- Handles refunds via teardown functions
- Uses partial notes for private refunds
- More complex but more flexible

### Key Concepts

- **`set_as_fee_payer()`**: Registers a contract as the fee payer
- **`end_setup()`**: Critical! Transitions from non-revertible to revertible phase
- **`#[nophasecheck]`**: Allows setup-phase calls from any function
- **Teardown functions**: Run after execution to handle refunds
- **Partial notes**: Allow creating notes with unknown values, finalized later

## Next Steps

- Explore the production [FPC implementation](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts/fees/fpc_contract)
- Learn about [authentication witnesses](../../aztec-nr/framework-description/how_to_use_authwit.md) for authorizing transfers
- Read about [transaction fees](../../foundational-topics/fees.md) in depth
