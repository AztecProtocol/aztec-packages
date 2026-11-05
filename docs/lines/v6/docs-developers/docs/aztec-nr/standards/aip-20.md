---
title: "AIP-20: Fungible Token"
sidebar_position: 1
description: Fungible token standard with private balances, partial-note transfers, and recursive note consumption.
---

[Source](https://github.com/defi-wonderland/aztec-standards/tree/dev/src/token_contract)

AIP-20 defines a fungible token with support for private balances (stored as notes in the note hash tree), public balances (stored in contract public storage), and a hybrid transfer path between the two.

## Storage layout

The token contract stores its name, symbol, and decimals as immutable public fields. Private balances are held in an `Owned<BalanceSet>` that restricts note access to the balance owner. Public balances use a simple `Map` keyed by address.

```rust
#[storage]
struct Storage<Context> {
    name: PublicImmutable<FieldCompressedString, Context>,
    symbol: PublicImmutable<FieldCompressedString, Context>,
    decimals: PublicImmutable<u8, Context>,
    private_balances: Owned<BalanceSet<Context>, Context>,
    total_supply: PublicMutable<u128, Context>,
    public_balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
    minter: PublicImmutable<AztecAddress, Context>,
    upgrade_authority: PublicImmutable<AztecAddress, Context>,
    asset: PublicImmutable<AztecAddress, Context>,
    vault_offset: PublicImmutable<u128, Context>,
}
```

The `asset` and `vault_offset` fields exist to support the [AIP-4626 vault pattern](./aip-4626.md). A standalone AIP-20 token that is not used as a vault underlying asset does not need to populate these fields.

## Note count constants

In Aztec, every time a user receives private tokens, a new encrypted note is added to their balance. Over time, a user's balance can be spread across dozens of small notes. A transfer must consume enough of these notes to cover the amount, but each note consumed adds computational overhead (gates) to the zero-knowledge proof the user's device must generate. Without a bound, a single transfer could take minutes to prove. Two constants cap how many notes a single proof handles, keeping proving times practical:

```rust
global INITIAL_TRANSFER_CALL_MAX_NOTES: u32 = 2;
global RECURSIVE_TRANSFER_CALL_MAX_NOTES: u32 = 8;
```

The initial call attempts to settle the transfer with at most two notes. If that is not enough to cover the amount, the contract recurses into itself and tries up to eight notes per recursive call.

A **placeholder address** is used in partial-note flows to signal that a transfer destination is not yet known at the time the sender initiates the operation. This distinguishes "recipient not yet determined" from "recipient is the zero address," and allows offchain indexers to detect [partial-note transfers](#partial-note-transfers) in event logs without decrypting the note contents:

```rust
global PRIVATE_ADDRESS_MAGIC_VALUE: AztecAddress =
    AztecAddress::from_field(0x1ea7e01501975545617c2e694d931cb576b691a4a867fed81ebd3264);
```

## Partial-note transfers

AIP-20 supports partial-note (or "commitment-based") transfers. In Aztec, private functions execute on the user's device before the transaction reaches the network, so they cannot read public state (like a DEX order book or auction result). Partial notes solve this by splitting the operation: the sender privately locks funds into a commitment, and later a public function — which *can* read public state — completes the transfer to the correct recipient. This is what makes private DeFi composability possible.

Concretely, the sender locks funds in a note whose destination address is not yet known. A completer — typically a contract acting as a relayer or settlement layer — later fills in the recipient and finalizes the note.

The sender calls `initialize_transfer_commitment` to create the commitment:

```rust
#[external("private")]
fn initialize_transfer_commitment(to: AztecAddress, completer: AztecAddress) -> Field {
    let commitment = self.internal._initialize_transfer_commitment(to, completer);
    commitment.to_field()
}
```

The returned `Field` is an opaque commitment to the destination and completer. A separate call then subtracts the balance and completes the note:

```rust
#[external("private")]
fn transfer_private_to_commitment(
    from: AztecAddress,
    commitment: Field,
    amount: u128,
    _nonce: Field,
) {
    _validate_from_private::<4>(self.context, from);

    self.internal._decrease_private_balance(from, amount, INITIAL_TRANSFER_CALL_MAX_NOTES);

    let completer = self.msg_sender();
    PartialUintNote::from_field(commitment).complete_from_private(
        self.context,
        completer,
        amount,
    );
}
```

This two-step design is useful in DeFi protocols where the recipient of funds depends on some offchain or asynchronous computation.

## Recursive balance subtraction

When `INITIAL_TRANSFER_CALL_MAX_NOTES` notes are insufficient to cover a transfer, the contract calls itself recursively until the full amount is consumed:

```rust
#[internal("private")]
fn _subtract_balance(account: AztecAddress, amount: u128, max_notes: u32) -> u128 {
    let subtracted = self.storage.private_balances.at(account).try_sub(amount, max_notes);
    if subtracted >= amount {
        subtracted - amount
    } else {
        assert(subtracted > 0, "Balance too low");
        let remaining = amount - subtracted;
        self.call_self.recurse_subtract_balance_internal(account, remaining)
    }
}
```

The recursion terminates when either the full amount has been deducted or the assertion fires.

Without recursion, you would have to either size every circuit for the worst-case note count (making the common case expensive to prove) or fail transfers when the note count exceeds a fixed limit. Recursion gives the best of both worlds: the common case (2 notes) proves fast, while larger balances are handled by chaining multiple smaller proofs. Each recursive call is a separate private kernel circuit, so proving cost scales with the actual note count rather than the worst case.
