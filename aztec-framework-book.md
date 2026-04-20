# The Aztec Developer Framework: A Complete Technical Reference

**Version:** 1.2 | **Date:** April 16, 2026 | **Oracle Version:** 22.1 (major.minor) | **Branch:** v4

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [aztec-nr: The Noir Smart Contract Framework](#2-aztec-nr-the-noir-smart-contract-framework)
   - 2.1 [Directory Structure](#21-directory-structure)
   - 2.2 [The Macro System](#22-the-macro-system)
   - 2.3 [State Variables](#23-state-variables)
   - 2.4 [The Note System](#24-the-note-system)
   - 2.5 [msg_sender: Caller Identity Across Execution Contexts](#25-msg_sender-caller-identity-across-execution-contexts)
   - 2.6 [Execution Contexts](#26-execution-contexts)
   - 2.7 [The Oracle System](#27-the-oracle-system)
   - 2.8 [Events](#28-events)
   - 2.9 [Message Delivery and Offchain Messages](#29-message-delivery-and-offchain-messages)
   - 2.10 [Authorization Witnesses (AuthWit)](#210-authorization-witnesses-authwit)
   - 2.11 [Historical State Access](#211-historical-state-access)
   - 2.12 [Key Management](#212-key-management)
3. [aztec.js: The TypeScript Client SDK](#3-aztecjs-the-typescript-client-sdk)
   - 3.1 [Package Structure](#31-package-structure)
   - 3.2 [Contract Interaction](#32-contract-interaction)
   - 3.3 [Account System](#33-account-system)
   - 3.4 [Transaction Lifecycle](#34-transaction-lifecycle)
   - 3.5 [Fee Payment](#35-fee-payment)
   - 3.6 [Contract Deployment](#36-contract-deployment)
   - 3.7 [Events and Notes](#37-events-and-notes)
4. [PXE: The Private Execution Environment](#4-pxe-the-private-execution-environment)
   - 4.1 [What PXE Is](#41-what-pxe-is)
   - 4.2 [Core Architecture](#42-core-architecture)
   - 4.3 [Oracle Implementations](#43-oracle-implementations)
   - 4.4 [Note Management](#44-note-management)
   - 4.5 [Block Synchronization](#45-block-synchronization)
   - 4.6 [Kernel Proving](#46-kernel-proving)
   - 4.7 [Database Layer](#47-database-layer)
   - 4.8 [Browser Support](#48-browser-support)
   - 4.9 [Performance Issues](#49-performance-issues)
5. [Wallet SDK and Account Contracts](#5-wallet-sdk-and-account-contracts)
   - 5.1 [Wallet Architecture](#51-wallet-architecture)
   - 5.2 [Account Contract Types](#52-account-contract-types)
   - 5.3 [Entrypoint Mechanism](#53-entrypoint-mechanism)
   - 5.4 [Browser Extension Model](#54-browser-extension-model)
6. [Testing Infrastructure](#6-testing-infrastructure)
   - 6.1 [TXE (Test Execution Environment)](#61-txe-test-execution-environment)
   - 6.2 [E2E Testing](#62-e2e-testing)
7. [CLI Tooling](#7-cli-tooling)
8. [Cross-Component Integration](#8-cross-component-integration)
   - 8.1 [Full Transaction Lifecycle](#81-full-transaction-lifecycle)
   - 8.2 [The Artifact System](#82-the-artifact-system)
   - 8.3 [The Oracle Bridge](#83-the-oracle-bridge)
   - 8.4 [L1-L2 Messaging](#84-l1-l2-messaging)
   - 8.5 [Note Discovery Flow](#85-note-discovery-flow)
9. [Common Gotchas](#9-common-gotchas)
10. [Known Shortcomings](#10-known-shortcomings)

---

## 1. Architecture Overview

The Aztec developer framework is two layers coupled through compiled artifacts, a versioned oracle interface, and shared protocol constants:

```
Layer 1 (Noir): aztec-nr
  - Contract macros (#[aztec], #[storage], #[external], #[note], #[event])
  - State variables (PrivateSet, PublicMutable, Map, DelayedPublicMutable, etc.)
  - 25 oracle modules (FFI to PXE)
  - TestEnvironment (in-process test harness via TXE)
  - ~215 files, ~22,500 lines

Layer 2 (TypeScript): aztec.js + PXE + wallet-sdk
  - Contract/Wallet/AccountManager abstractions
  - Fee payment methods (FeeJuice, Sponsored)
  - PXE: oracle implementations, kernel proving, block sync, note/event storage
  - wallet-sdk: concrete Wallet backed by PXE, browser extension protocol
  - ~250 files combined

Coupling points:
  - Compiled contract artifacts (JSON)
  - Oracle version (`ORACLE_VERSION_MAJOR=22`, `ORACLE_VERSION_MINOR=1`) + interface hash. Major bumps signal incompatible changes; minor bumps signal additive changes only.
  - @aztec/constants (shared Noir + TS)
```

**Mental model:** *"The contract decides what the world sees; the user decides what the contract knows."*

All private computation happens locally on the user's device via the PXE. Only commitments (note hashes) and nullifiers are published on-chain. Public state is stored in a public data tree accessible to all.

---

## 2. aztec-nr: The Noir Smart Contract Framework

### 2.1 Directory Structure

```
noir-projects/aztec-nr/
+-- aztec/                    # Core framework (~215 Noir files)
|   +-- src/
|       +-- macros/           # Contract and function macros
|       +-- state_vars/       # 11 state variable types
|       +-- context/          # PrivateContext, PublicContext, UtilityContext
|       +-- oracle/           # 25 oracle modules (FFI to PXE)
|       +-- note/             # Note system (lifecycle, getter, interface)
|       +-- event/            # Event emission and commitment
|       +-- authwit/          # Authorization witness system
|       +-- keys/             # Privacy key management
|       +-- messages/         # Message encryption and discovery
|       +-- history/          # Historical state proofs
|       +-- hash.nr           # Hashing utilities
|       +-- capsules/         # CapsuleArray for PXE persistent storage
|       +-- contract_self/    # Self-call interfaces
|       +-- test/             # TestEnvironment and mocks
+-- uint-note/                # UintNote (u128 value) and PartialUintNote (commitment-based private receipt)
+-- field-note/               # Single field note type (minimal note for simple use cases)
+-- balance-set/              # BalanceSet: optimized PrivateSet<UintNote> with recursive subtraction (2+8 note batching)
+-- address-note/             # AddressNote: stores an AztecAddress as a private note
+-- compressed-string/        # FieldCompressedString: up to 31 ASCII chars packed into a single field element
```

### 2.2 The Macro System

#### `#[aztec]` -- The Contract Macro

Applied to a module to mark it as an Aztec contract. Performs these transformations:

1. **Validates** all functions have required macro attributes (`#[external]`, `#[internal]`, or `#[test]`)
2. **Transforms functions** into internal versions prefixed `__aztec_nr_internals__`
3. **Generates contract interface struct** with methods for cross-contract calls
4. **Generates self-call helpers** (`CallSelf`, `EnqueueSelf`, `CallInternal`)
5. **Creates ABI exports** for all external functions
6. **Auto-generates** `_compute_note_hash_and_nullifier`, `sync_state(scope)`, `offchain_receive` (the legacy `process_message` helper was removed in 4.2.0)
7. **Generates public dispatch** function for routing public calls by selector

#### `#[storage]` -- Storage Declaration

Declares contract storage and auto-assigns slots starting at 1:

```noir
#[storage]
struct Storage<Context> {
    admin: PublicMutable<AztecAddress, Context>,          // slot 1
    total_supply: PublicMutable<u128, Context>,            // slot 2
    balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>, // slot 3
}
```

**What it generates:**
- Sequential slot allocation (slot 0 is reserved)
- `Storage::init(context)` constructor that wires each field to its slot
- `StorageLayoutFields` struct exposed in artifact ABI
- A compile-time check that every field's type implements the `StateVariable` trait (which supplies a `STORAGE_SIZE` constant and a `new(context, slot)` constructor)

For manual slot control, use `#[storage_no_init]` and provide your own `init()`.

#### Function Attribute Macros

Every contract function must have exactly one of:

| Macro | Execution | Description |
|-------|-----------|-------------|
| `#[external("private")]` | Client-side (PXE) | Private circuit function, preserves privacy |
| `#[external("public")]` | Sequencer (AVM) | Public function, visible to all |
| `#[external("utility")]` | Off-chain only | View function, never on-chain |
| `#[internal("private")]` | Client-side (PXE) | Internally callable private function |
| `#[internal("public")]` | Sequencer (AVM) | Internally callable public function |

**Marker attributes** (combinable with the above):

| Attribute | Purpose |
|-----------|---------|
| `#[initializer]` | Contract constructor that can only be called once. The **init nullifier** is a special nullifier emitted by the initializer so that subsequent calls (which verify non-membership of the initialized-flag) fail if the contract was already constructed. A private initializer emits a private init nullifier; if any public functions exist that must check initialization, the private initializer also enqueues a call to emit a **separate public init nullifier** (since private nullifiers aren't visible to public reads on the current tip). As of 4.2.0 the private init nullifier is `poseidon2([address, init_hash])` (formerly just `address`), so `assert_contract_was_initialized_by` / `_not_initialized_by` take an additional `init_hash` parameter |
| `#[noinitcheck]` | Skip initialization nullifier check. `#[only_self]` external functions also implicitly skip the init check, and any external public function called *during* a private init must itself be `#[only_self]` |
| `#[view]` | Read-only, cannot modify state |
| `#[only_self]` | Can only be called by the contract itself |
| `#[authorize_once]` | Requires authorization via authwit |
| `#[allow_phase_change]` | Allow phase transition (private only) -- the function may call `context.end_setup()` to end the non-revertible *setup* phase and enter the revertible *app logic* phase |

#### Function Transformation

When the macro processes a private function:

```noir
// What you write:
#[external("private")]
fn transfer(to: AztecAddress, amount: u128) {
    // user code
}

// What the macro generates:
unconstrained fn __aztec_nr_internals__transfer(
    inputs: PrivateContextInputs,
    to: AztecAddress,
    amount: u128,
) -> PrivateCircuitPublicInputs {
    let args_hash = hash_args([to.to_field(), amount as Field]);
    let mut context = PrivateContext::new(inputs, args_hash);
    let storage = Storage::init(&mut context);
    let mut self = ContractSelfPrivate::new(&mut context, storage, ...);
    assert_is_initialized_private(&context);
    // USER CODE HERE
    context.finish()
}

// Original becomes uncallable:
fn transfer(_to: AztecAddress, _amount: u128) {
    static_assert(false, "Direct invocation not supported...");
}
```

#### `#[note]` -- Note Type Macro

Transforms a struct into a private note type:

```noir
#[note]
struct TokenNote {
    amount: u128,
    owner: AztecAddress,
}
```

**Generates:**
1. `NoteType` impl with unique ID (0-127 per contract)
2. `NoteHash` impl with:
   - `compute_note_hash(owner, storage_slot, randomness)` = `poseidon2(pack(note) || owner || slot || randomness)`
   - `compute_nullifier(context, owner, note_hash)` = `poseidon2(note_hash || owner.nhk_app)`
   - `compute_nullifier_unconstrained(...)` for off-chain use
3. `NoteProperties` impl with `PropertySelector` for each field
4. Static assertion: packed length <= `MAX_NOTE_PACKED_LEN` (9 fields)

Use `#[custom_note]` if you need custom hash/nullifier logic.

#### `#[event]` -- Event Macro

```noir
#[event]
struct Transfer {
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
}
```

**Generates:**
- `EventInterface` impl with deterministic `EventSelector` (via `poseidon2_hash_bytes` of signature)
- `Serialize` impl for encoding
- Compile-time collision detection between event selectors

### 2.3 State Variables

Aztec contracts have 11 state variable types across public, private, and cross-context domains.

#### Public State Variables

##### `PublicMutable<T, Context>`

Basic mutable public state. Equivalent to a Solidity state variable.

```noir
#[storage]
struct Storage<Context> {
    total_supply: PublicMutable<u128, Context>,
}

#[external("public")]
fn mint(amount: u128) {
    let current = self.storage.total_supply.read();
    self.storage.total_supply.write(current + amount);
}
```

- **Read/write:** Public functions only
- **Privacy:** None (visible to all)
- **Cannot** be read from private functions

##### `PublicImmutable<T, Context>`

Write-once public state, readable from private functions.

```noir
#[external("public")]
#[initializer]
fn constructor(decimals: u8) {
    self.storage.config.initialize(decimals);
}

#[external("private")]
fn transfer(to: AztecAddress, amount: u128) {
    let decimals = self.storage.config.read(); // Private read!
}
```

- **Initialize once**, then read from anywhere
- Occupies `M + 1` slots (M for value, 1 for hash enabling efficient private reads)
- Private reads use historical inclusion proof + nullifier existence check

##### `DelayedPublicMutable<T, InitialDelay, Context>`

Mutable public state readable from private functions, with a time delay for changes:

```noir
global DAY: u64 = 86400;

#[storage]
struct Storage<Context> {
    fee_rate: DelayedPublicMutable<u128, DAY, Context>,
}

#[external("public")]
fn schedule_fee_change(new_rate: u128) {
    self.storage.fee_rate.schedule_value_change(new_rate);
    // Takes effect after DAY seconds
}

#[external("private")]
fn compute_fee(amount: u128) -> u128 {
    let rate = self.storage.fee_rate.get_current_value(); // Safe private read
    amount * rate / 100
}
```

- Changes are **scheduled**, not immediate
- Private reads constrain transaction timestamp (sets max valid time)
- Delay can itself be changed (also delayed)

#### Private State Variables (Owned -- Per-Account)

These must be wrapped in `Owned<V, Context>` in storage and accessed via `.at(owner_address)`.

##### `PrivateSet<Note, Context>`

Multiple notes per owner. Used for token balances (UTXO model).

```noir
#[storage]
struct Storage<Context> {
    balances: Owned<PrivateSet<TokenNote, Context>, Context>,
}

#[external("private")]
fn transfer(to: AztecAddress, amount: u128) {
    let sender = self.msg_sender();

    // Pop (read + nullify) notes from sender
    let notes = self.storage.balances.at(sender).pop_notes(
        NoteGetterOptions::new().sort([0]).order(Order::DESC).limit(10)
    );

    let mut total = 0;
    for note in notes { total += note.amount; }
    assert(total >= amount, "Insufficient balance");

    // Insert note for recipient
    self.storage.balances.at(to).insert(
        TokenNote { amount }
    ).deliver_to(to);

    // Insert change back to sender
    if total > amount {
        self.storage.balances.at(sender).insert(
            TokenNote { amount: total - amount }
        ).deliver_to(sender);
    }
}
```

- **Anyone** can insert notes; only **owner** can nullify
- `pop_notes` = read + nullify (most efficient)
- `get_notes` = read without nullifying, then `remove` individually

##### `PrivateMutable<Note, Context>`

Exactly one note per owner at any time. Reading nullifies and recreates.

```noir
let user_nonce = self.storage.nonce.at(sender);
user_nonce.replace(|current| NonceNote { value: current.value + 1 })
    .deliver_to(sender);
```

- `get_note()` nullifies current note, creates replacement with fresh randomness
- `replace(f)` nullifies current, applies transform, inserts result
- **Race condition risk:** two concurrent txs can't both read the same note

##### `PrivateImmutable<Note, Context>`

Write-once per-account private state. Unlike `PrivateMutable`, calling `get_note()` does NOT nullify the note -- it returns the note without consuming it, since the value can never change. Used for storing per-user configuration that is set once (e.g., vesting parameters, signing public keys).

```noir
// Initialize once:
self.storage.signing_key.at(owner).initialize(KeyNote { key: pubkey }).deliver_to(owner);

// Read many times without side effects:
let key = self.storage.signing_key.at(owner).get_note();
```

##### `SingleUseClaim<Context>`

One-time right per owner. No actual note stored -- only a nullifier.

```noir
self.storage.vote_rights.at(voter).claim(); // Emits nullifier, can only call once
```

#### Private State Variables (Contract-Wide)

##### `SinglePrivateMutable<Note, Context>` / `SinglePrivateImmutable<Note, Context>`

Like `PrivateMutable`/`PrivateImmutable` but contract-wide (not per-account). A single note exists for the entire contract rather than one per owner.

**Requires the contract to have associated keys:** The contract address itself must have a nullifier hiding key (NHK) registered. This is automatically the case for account contracts (which derive keys from the user's secret). For non-account contracts, keys must be associated at deployment by passing `publicKeys` to the deployer. Because nullifying contract-wide notes uses this single NHK -- which is known to whoever holds the secret behind it -- associating keys with a non-account contract effectively grants one entity (the admin/deployer) sole authority to nullify notes stored in these variables. Without keys, the contract cannot compute nullifiers and these state variables will fail at runtime.

#### Container Types

##### `Map<K, V, Context>`

Key-value container. Slot derivation: `poseidon2_hash([base_slot, key.to_field()])`.

```noir
balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
// Access: self.storage.balances.at(user_address).read()
```

- No way to enumerate keys
- The value type `V` may be any `StateVariable` -- e.g. `PublicMutable`, `PrivateSet`, `Owned<...>`, or even another `Map` (nested)

##### `Owned<V, Context>`

Wrapper that makes a state variable per-account. Adds `.at(owner: AztecAddress) -> V` method which instantiates the inner state variable with a storage slot derived from `poseidon2_hash([base_slot, owner.to_field()])`. Each owner gets an independent instance of the wrapped variable.

```noir
// Declaration:
balances: Owned<PrivateSet<TokenNote, Context>, Context>,

// Usage:
let sender_balance = self.storage.balances.at(sender); // PrivateSet for sender
let recipient_balance = self.storage.balances.at(recipient); // Different PrivateSet for recipient
```

#### Context-Dependent API Summary

| Variable | Public | Private | Utility |
|----------|--------|---------|---------|
| PublicMutable | read, write | -- | unconstrained read |
| PublicImmutable | initialize, read | read (historical) | unconstrained read |
| DelayedPublicMutable | schedule, get_current | get_current | unconstrained read |
| PrivateMutable | -- | initialize, replace, get_note | unconstrained view |
| PrivateImmutable | -- | initialize, get_note (non-consuming) | unconstrained view |
| PrivateSet | -- | insert, pop_notes, get_notes, remove | unconstrained view |
| SingleUseClaim | -- | claim, assert_claimed | unconstrained has_claimed |
| SinglePrivateMutable | -- | initialize, replace, get_note | unconstrained view |
| SinglePrivateImmutable | -- | initialize, get_note (non-consuming) | unconstrained view |
| Map\<K, V\> | delegates to V | delegates to V | delegates to V |
| Owned\<V\> | delegates to V (via `.at(owner)`) | delegates to V (via `.at(owner)`) | delegates to V (via `.at(owner)`) |

### 2.4 The Note System

Notes are the fundamental mechanism for private state in Aztec -- immutable encrypted commitments implementing a UTXO model.

#### Note Lifecycle

```
1. CREATE  -> Application creates note with values
2. ENCRYPT -> Note encrypted to recipient's public key, tagged for discovery
3. EMIT    -> Encrypted log emitted as private log in transaction
4. DISCOVER -> Recipient's PXE decrypts logs, finds matching notes
5. READ    -> Application proves note exists via kernel read request
6. NULLIFY -> Application emits nullifier to mark note as spent
```

#### Note Hashing (Three Levels)

1. **Inner Note Hash** (computed in private function):
   `hash(packed_note || owner || storage_slot || randomness)`

2. **Siloed Note Hash** (computed by kernel):
   `hash(inner_note_hash || contract_address)`

3. **Unique Note Hash** (computed by kernel):
   `hash(note_nonce || siloed_note_hash)` -- what goes into the state tree

#### Nullifier Computation

Default: `poseidon2(note_hash_for_nullification || owner.nhk_app)`

The nullifier hiding key (NHK) is requested from the kernel via `context.request_nhk_app()`, which validates key ownership. This prevents applications from computing incorrect nullifiers.

Each entity that can create nullifiers in a given app has its *own* NHK for that app: the NHK is derived per `(account, contract)` pair, so a user's NHK for token A is distinct from their NHK for token B, and from another user's NHK for either. This is what lets `Owned<...>` state give each owner independent authority to nullify the notes stored under their address.

#### Note Getter Options

`NoteGetterOptions` tells the getter *which* notes to read and in *what* order to hand them back. Because a `PrivateSet` (e.g. a user's balance split across many UTXO-style notes) can contain far more notes than a single transaction should pull in, an app uses these options to tune the selection -- e.g. a token can sort ascending to spend the smallest "dust" notes first and consolidate balance, or sort descending to cover a large transfer with the fewest note reads.

```noir
let mut options = NoteGetterOptions::new();
options = options
    .select(PropertySelector { index: 0, offset: 0, length: 16 }, Comparator.GTE, 100)
    .sort(PropertySelector { index: 0, offset: 0, length: 16 }, SortOrder.DESC)
    .set_limit(10)
    .set_offset(0)
    .set_owner(owner);

let notes = get_notes(context, storage_slot, options);
```

Supports: equality, less than, greater than comparisons; ascending/descending sort; limit/offset pagination; owner filtering; note status filtering (active vs nullified).

#### Partial Notes

Create notes privately with incomplete data, complete them publicly. The canonical implementation is `PartialUintNote` from the `uint-note` crate, used by Wonderland's AIP-20 and AIP-721 standards.

*Two-step hashing* (updated in 4.2.0 -- `storage_slot` moved into the completion hash):
```noir
// Step 1 (private): Commitment hides only owner + randomness
commitment = poseidon2_hash([owner, randomness], DOM_SEP__NOTE_HASH);

// Step 2 (public or private, when completing): Storage slot AND value are added
note_hash = poseidon2_hash([commitment, storage_slot, value], DOM_SEP__NOTE_HASH);
```

This change enables cleaner partial-note flows where the same commitment can be completed at different storage slots without re-running private code (for example, completing into a per-recipient `Owned<...>` slot computed in public).

*Validity commitment mechanism* (prevents malicious completers):
```noir
// Private phase: emit validity commitment as a nullifier
validity_commitment = poseidon2_hash([partial_commitment, completer_address]);
context.push_nullifier(validity_commitment);

// Public phase: verify the nullifier exists before accepting completion
assert(context.nullifier_exists_unsafe(validity_commitment, context.this_address()));
```

*Usage:*
```noir
// Private: Create partial note (storage_slot AND value unknown, both supplied at completion)
let partial = UintNote::partial(owner, context, recipient, completer);

// Later, in a public call: Complete with storage slot + value derived from public state
// (e.g., AMM output, oracle price)
partial.complete(context, completer, storage_slot, computed_amount);

// There is also a `complete_from_private(...)` variant for completing the note in a follow-up private call
// (uses an existing settled validity-commitment nullifier).
```

*Limitations:*
- `value = 0` is not supported (trailing zero fields are trimmed from logs)
- Each partial note type supports only one variant
- The `token_id = 0` sentinel in AIP-721 NFTs means NFT #0 cannot exist

#### Note Size Limit

**MAX_NOTE_PACKED_LEN = 9 fields.** Derived from:
- MAX_MESSAGE_CONTENT_LEN (12) - PRIVATE_NOTE_MSG_PLAINTEXT_RESERVED_FIELDS_LEN (3 for owner, storage_slot, randomness)

This forces developers to pack data efficiently or split across multiple notes.

### 2.5 msg_sender: Caller Identity Across Execution Contexts

Understanding how the caller's identity propagates through Aztec transactions is critical for writing correct access control. Aztec's `msg_sender` is analogous to Solidity's `msg.sender`, but behaves differently due to account abstraction, the private/public split, and the absence of externally-owned accounts (EOAs).

#### Access API

Both `ContractSelfPrivate` and `ContractSelfPublic` expose:

```noir
// Panics if there is no sender (i.e. at the transaction entrypoint)
self.msg_sender() -> AztecAddress

// Returns Option::none() when there is no sender
self.context.maybe_msg_sender() -> Option<AztecAddress>
```

Internally, `NULL_MSG_SENDER_CONTRACT_ADDRESS` (the BN254 field element `-1`, i.e. `p - 1`) represents "no sender". The `maybe_msg_sender()` method translates this sentinel into `Option::none()`.

#### Scenario-by-Scenario Reference

##### 1. Transaction Entrypoint (First Private Call)

**msg_sender = `None` (NULL_MSG_SENDER_CONTRACT_ADDRESS)**

There are no EOAs in Aztec. Every transaction begins by calling an account contract's `entrypoint()` function. Since no contract called the entrypoint, there is no sender.

```
User Device
  -> PXE constructs TxExecutionRequest targeting account contract
  -> Kernel Init circuit enforces: msg_sender == NULL_MSG_SENDER_CONTRACT_ADDRESS
  -> Account contract's entrypoint() executes with msg_sender = None
```

The kernel circuit (V-Init-3) explicitly validates that the first call's `msg_sender` equals `NULL_MSG_SENDER_CONTRACT_ADDRESS`. This is not a convention -- it is a protocol-level constraint.

Account contract developers should use `context.maybe_msg_sender()` to handle this case. Calling `self.msg_sender()` at the entrypoint will panic.

##### 2. Account Contract Calls Target Function (Private -> Private)

**msg_sender = account contract's address**

After the account contract validates the user's signature, it calls the actual target function (e.g., `Token.transfer()`). The target sees `msg_sender` = the account contract's address. This is how the protocol identifies "who" authorized the transaction.

```noir
// Inside account contract entrypoint:
// self.address = 0xAlice_Account_Contract
context.call_private_function(token_address, transfer_selector, args_hash, false);

// Inside Token.transfer():
// self.msg_sender() == 0xAlice_Account_Contract
```

This is enforced by the kernel circuit (V-Init-8): all outgoing private call requests from a function MUST have `msg_sender` equal to that function's contract address.

##### 3. Nested Private -> Private Cross-Contract Calls

**msg_sender = the immediate caller's contract address**

Each level of nesting sees only its direct caller, never the original transaction initiator.

```
Account (0xAlice) calls Token (0xToken) calls Registry (0xReg)
                         ^                        ^
                msg_sender = 0xAlice      msg_sender = 0xToken
```

```noir
// In private_context.nr, when pushing a nested call request:
self.private_call_requests.push(
    PrivateCallRequest {
        call_context: CallContext {
            msg_sender: self.this_address(),  // Always the current contract
            contract_address,                  // The target being called
            ...
        },
        ...
    },
);
```

There is no `tx.origin` equivalent in Aztec. If a deeply nested contract needs to know the original account, it must be passed explicitly as a parameter.

##### 4. Private -> Public (Enqueued Calls)

**msg_sender = calling contract's address, OR `None` if hidden**

When a private function enqueues a public call, the `msg_sender` in the public execution is the private contract that enqueued it -- unless `hide_msg_sender` is set to `true`.

```noir
// Default: msg_sender visible to public function
self.enqueue_self.increase_supply(amount);
// Public function sees msg_sender = this private contract's address

// Incognito: msg_sender hidden for privacy
self.enqueue_incognito(Token::at(address).increase_supply(amount));
// Public function sees msg_sender = None (NULL_MSG_SENDER_CONTRACT_ADDRESS)
```

**Privacy implications:** The `msg_sender` in a `PublicCallRequest` is visible to the sequencer and all network observers. If the sender is the user's account contract, it directly reveals their identity. If it is an application contract, it reveals which contract they interacted with privately.

**Kernel enforcement:** The kernel validates that for enqueued public calls, `msg_sender` is either `NULL_MSG_SENDER_CONTRACT_ADDRESS` or the current function's contract address. You cannot spoof an arbitrary address.

**Public function handling:** Public functions receiving a hidden sender must handle `Option::none()`:
```noir
#[external("public")]
fn increase_supply(amount: u128) {
    // This function may be called with a hidden sender
    match self.context.maybe_msg_sender() {
        Option::some(sender) => { /* sender is known */ },
        Option::none() => { /* incognito call -- decide if this is acceptable */ },
    }
}
```

##### 5. Public -> Public (Synchronous Nested Calls)

**msg_sender = the calling public contract's address**

Behaves like Solidity. When a public function calls another public function via `CALL` or `STATICCALL`, the AVM creates a nested execution context where `sender` = the caller's contract address.

```
AVM execution:
  Public contract A (0xA) executes CALL to contract B (0xB)
  -> New context: sender = 0xA, address = 0xB
  -> B sees msg_sender = 0xA
```

This is standard EVM-like behavior, handled directly by the AVM opcodes.

##### 6. Public -> Private: NOT POSSIBLE

Public functions cannot call private functions. Private execution happens on the user's device (PXE); public execution happens on the sequencer. By the time public functions run, all private execution has already completed and been proven.

##### 7. Static Calls (View Calls)

**msg_sender = same as non-static calls**

Static calls (`STATICCALL` in public, `call_private_function(..., is_static_call: true)` in private) do not change how `msg_sender` is set. The only difference is that the called function cannot emit state-modifying side effects (note hashes, nullifiers, storage writes).

The `is_static_call` flag propagates to all nested calls -- a static call frame cannot spawn a non-static nested call.

##### 8. Delegate Calls: NOT SUPPORTED

The AVM does not support `DELEGATECALL`. There is no mechanism to execute another contract's code in the caller's storage context. Every call creates an independent execution context with its own address and msg_sender.

#### Access Control Patterns

##### `#[only_self]` -- External Self-Calls

The `#[only_self]` attribute generates a macro-injected assertion:

```noir
assert(self.msg_sender() == self.address, "Function can only be called by the same contract");
```

This makes the function callable only when msg_sender equals the contract's own address -- i.e., the contract must call itself via `self.call_self.my_function(args)` or `self.enqueue_self.my_function(args)`. External contracts cannot invoke it.

**Common pattern:** A private function that needs to trigger a public side effect enqueues a call to an `#[only_self]` public function, preventing external callers from invoking the public function directly:

```noir
#[external("private")]
fn transfer(to: AztecAddress, amount: u128) {
    // ... private note operations ...
    self.enqueue_self.finalize_transfer(to, amount); // msg_sender = self.address
}

#[external("public")]
#[only_self]
fn finalize_transfer(to: AztecAddress, amount: u128) {
    // Safe: only this contract can call this
    self.storage.public_balances.at(to).write(...);
}
```

##### `#[internal]` -- Inlined Functions

`#[internal("private")]` and `#[internal("public")]` functions are **not compiled as separate entry points**. They are inlined as library methods (`#[contract_library_method]`) within the calling external function's circuit or public function. Because they share the caller's execution context (they receive `context: &mut PrivateContext` or `&mut PublicContext` directly), there is no separate msg_sender check -- the internal function runs within the same call frame as the external function that invokes it.

For `#[internal("private")]`, the function is inlined as Noir library code into the caller's private circuit. For `#[internal("public")]`, the function is still compiled to bytecode but gets **no entry in the public dispatch function** through which all external public calls are routed -- so it cannot be invoked as a top-level public call; it can only be called from other public functions in the same contract that hold a direct reference to it.

This is different from `#[only_self]`: an `#[only_self]` external function is a separate call with its own call context (and msg_sender validation), while an `#[internal]` function is inlined code that doesn't create a new call frame.

##### `#[authorize_once]` -- Delegated Execution

```noir
#[authorize_once("from", "authwit_nonce")]
#[external("private")]
fn transfer_from(from: AztecAddress, to: AztecAddress, amount: u128, authwit_nonce: Field) {
    // msg_sender = whoever called this (e.g., a DEX contract)
    // "from" = the account that authorized the transfer (verified via AuthWit)
    // These are intentionally different addresses
}
```

With AuthWit, `msg_sender` is the immediate caller (e.g., a DEX contract), while `from` is the account that signed the authorization. The macro auto-generates a static call to the `from` account's `verify_private_authwit()` and emits a nullifier to prevent replay.

#### Summary Table

| Scenario | msg_sender value | Enforcement |
|----------|-----------------|-------------|
| Transaction entrypoint (first call) | `None` (NULL sentinel) | Kernel Init circuit (V-Init-3) |
| Account -> target function | Account contract address | Kernel Init (V-Init-8) |
| Private -> private (nested) | Caller's contract address | Kernel Inner circuit validates |
| Private -> public (enqueue, visible) | Caller's contract address | Kernel validates sender = self or NULL |
| Private -> public (enqueue, hidden) | `None` (NULL sentinel) | Kernel permits NULL for public calls |
| Public -> public (nested) | Caller's contract address | AVM CALL opcode sets sender |
| Public -> private | **Not possible** | Architectural constraint |
| Static calls | Same as non-static | Only is_static_call flag differs |
| Delegate calls | **Not supported** | AVM omits DELEGATECALL |

### 2.6 Execution Contexts

#### PrivateContext

The main interface for private function execution. Key capabilities:

**State Mutations:**
- `push_note_hash(note_hash)` -- Commit new note
- `push_nullifier(nullifier)` -- Mark note as spent
- `push_nullifier_for_note_hash(nullifier, note_hash)` -- Link nullifier to specific note

**Logs and Messages:**
- `emit_private_log_unsafe(tag, log_data, length)` -- Low-level encrypted log emission. Requires the caller to pass an explicit `tag` as the first parameter. Prefer the high-level `self.emit(...)` / `MessageDelivery` APIs, which compute tags correctly and choose between offchain / unconstrained / constrained delivery for you.
- `emit_raw_note_log_unsafe(tag, log_data, length)` -- Same as above for note logs.
- `emit_contract_class_log(log)` -- Contract class broadcast
- `message_portal(recipient, content)` -- L2-to-L1 message

The `_unsafe` suffix (introduced in 4.2.0) marks these as low-level: bypassing them means the caller is responsible for tag derivation, recipient discovery, and length encoding.

Public logs **cannot** be emitted from private: they are only available through `PublicContext::emit_public_log_unsafe` (or the higher-level `self.emit(event)` in a public function). To surface something publicly from a private flow, enqueue a public call that emits the log there.

**Cross-Context:**
- `call_private_function_with_args_hash(target, selector, args_hash, is_static)` -- Call another private function
- `call_public_function_with_calldata_hash(target, calldata_hash, ...)` -- Enqueue public function
- `set_public_teardown_function_with_calldata_hash(...)` -- Set teardown (fee payment)

**Key Validation:**
- `request_nhk_app(npk_m_hash)` -- Request nullifier hiding key from kernel
- `request_ovsk_app(ovpk_m_hash)` -- Request outgoing viewing secret key

**Phase Management:**
- `end_setup()` -- Transition from non-revertible setup to revertible app logic
- `set_as_fee_payer()` -- Designate this account as fee payer
- `set_expiration_timestamp(timestamp)` -- Set max valid time for tx

**Side Effect Counter:** Every mutation gets a unique monotonic counter for ordering.

#### PublicContext

Interface for AVM (Aztec Virtual Machine) public execution. Unlike PrivateContext which accumulates side effects for later kernel processing, PublicContext directly executes AVM opcodes on the current tip of the chain. Public functions are executed by the block proposer within a zkVM (the AVM), which allows them to revert while still ensuring payment to the proposer and prover. Private functions, by contrast, cannot revert -- they either succeed or cannot be included.

Key differences from PrivateContext:
- **No privacy** -- all storage reads, writes, and logs are visible to all network participants
- **Direct state tree access** via `storage_read(slot)` / `storage_write(slot, value)` AVM opcodes (no oracle indirection)
- **Operates on current state** at the tip of the chain, not a historical anchor block
- **Synchronous calls** to other public functions via `call_public_function()` (not enqueued)
- **Can revert** (private functions cannot)
- **`transaction_fee()` is only nonzero during the teardown phase**

**Public Storage (Key-Value):**
- `storage_read<T>(slot) -> T` -- Read typed value from public storage (deserialized via `Packable`)
- `storage_write<T>(slot, value)` -- Write typed value to public storage (takes effect immediately)
- `raw_storage_read<N>(slot) -> [Field; N]` -- Read N consecutive raw storage slots
- `raw_storage_write<N>(slot, values)` -- Write N consecutive raw storage slots

**Note Hashes & Nullifiers:**
- `push_note_hash(note_hash)` -- Insert note hash into the note hash tree. Used by partial note completion (a note created in private can be completed with public data).
- `push_nullifier(nullifier)` -- Push a nullifier. Used for L1->L2 message consumption, contract initialization, and public one-time actions (cheaper than public storage for single-use flags).
- `note_hash_exists(note_hash, leaf_index) -> bool` -- Check if a note hash exists at a given leaf index
- `nullifier_exists_unsafe(nullifier, contract_address) -> bool` -- Check if a nullifier exists. Reliable in public (unlike private, which only sees the anchor block). **Safety caveat**: a nullifier emitted alongside an enqueued public call does not mean that public call has already executed -- all private side effects are committed before any enqueued public functions run.

**Logs and Messages:**
- `emit_public_log_unsafe(tag, log)` -- Emit a public log visible to everyone on-chain. The `tag` at `fields[0]` is used by nodes for indexing. Should be domain-separated; prefer `self.emit(event)` which handles tagging automatically.
- `message_portal(recipient, content)` -- Send L2->L1 message to an Ethereum portal contract. Available for consumption on L1 once the epoch proof is verified.
- `consume_l1_to_l2_message(content, secret, sender, leaf_index)` -- Consume an L1->L2 message: verifies existence in the message tree, checks not already consumed, pushes nullifier to prevent reuse. The `secret` acts as a claim key (the message hash includes `secret_hash`, but the nullifier uses the raw `secret`).
- `l1_to_l2_msg_exists(msg_hash, leaf_index) -> bool` -- Check L1->L2 message existence without consuming (messages are never deleted from the tree; use this for unlimited reads)

**Public Function Calls:**
- `call_public_function(addr, selector, args, gas_opts) -> [Field]` -- Call another contract's public function synchronously. Reverts propagate. Optional gas allocation via `GasOpts`.
- `static_call_public_function(addr, selector, args, gas_opts) -> [Field]` -- Read-only call (like Solidity's `staticcall`). Called function cannot modify state or emit logs.

**Environment Accessors:**
- `maybe_msg_sender() -> Option<AztecAddress>` -- Caller address (None if the private enqueuer used `hide_msg_sender`)
- `this_address() -> AztecAddress` -- This contract's address
- `selector() -> FunctionSelector` -- Current function selector
- `get_args_hash() -> Field` -- Hash of function arguments
- `chain_id() -> Field` / `version() -> Field` -- Chain and protocol identifiers
- `block_number() -> u32` -- Current block number (not reliably spaced; use `timestamp()` for time-based logic)
- `timestamp() -> u64` -- Current block timestamp (Unix seconds, shared by all txs in a block)
- `transaction_fee() -> Field` -- Final tx fee (returns 0 during setup and app phases; only nonzero in teardown)
- `is_static_call() -> bool` -- Whether executing in a read-only staticcall context

**Gas Metering:**
- `l2_gas_left() -> u32` / `da_gas_left() -> u32` -- Remaining gas
- `min_fee_per_l2_gas() -> u128` / `min_fee_per_da_gas() -> u128` -- User-chosen gas prices (privacy note: gas price choices can leak wallet identity, urgency, or proving time)

#### UtilityContext

Read-only, unconstrained context for `#[external("utility")]` functions. These functions execute off-chain in the user's PXE without generating proofs. They cannot modify state -- no note creation, nullifier emission, or storage writes.

Common uses:
- **Balance queries:** `balance_of_private(owner)` iterates notes in PXE to compute aggregate balance
- **Configuration reads:** `get_decimals()` reads `PublicImmutable` via historical state
- **Note discovery:** `sync_state()` triggers PXE to process pending encrypted logs

Available APIs:
- `block_header()` -- Current anchor block state
- `this_address()` -- Contract address
- `timestamp()`, `block_number()`, `chain_id()`, `version()`
- `storage_read<T>(storage_slot) -> T` -- Unconstrained public state read at anchor block
- `raw_storage_read<N>(storage_slot) -> [Field; N]` -- Raw field read

### 2.7 The Oracle System

Oracles are unconstrained functions that bridge Noir execution to the PXE runtime. There are **25 oracle modules**.

**A note on AVM opcodes.** Public functions also reach their execution environment (storage, call context, block info, L1->L2 messages) through Noir's `#[oracle(...)]` mechanism, but these are *not* oracles in the private sense. Each `avm_*` call is a thin Noir shim that, at bytecode-generation time, is lowered to a real AVM opcode. At prove time, every one of those opcodes is fully constrained by the AVM circuit -- so even though aztec-nr calls them through the same `#[oracle]` ABI that private oracles use, there is no "trust the PXE" assumption for their results. They are also **only callable during public execution**; attempting to call them from a private function is a compile-time or runtime error. In the table below the `avm` row groups these under a common `avm_*` prefix; for the full opcode set see the AVM specification.

#### Oracle Pattern

```noir
#[oracle(oracleName)]
unconstrained fn oracle_internal(_param: Field) -> ReturnType {}

pub unconstrained fn public_wrapper(param: Field) -> ReturnType {
    oracle_internal(param)
}

// Constrained caller acknowledges trust assumption
pub fn constrained_caller(param: Field) -> ReturnType {
    unsafe { public_wrapper(param) }
}
```

#### Oracle Version

```noir
pub global ORACLE_VERSION_MAJOR: Field = 22;
pub global ORACLE_VERSION_MINOR: Field = 1;
```

Checked at the start of every function execution. The PXE rejects contracts whose **major** version differs from its own (incompatible) and warns when the minor version is ahead of the PXE's (caller may use newer additive features). This split (introduced in 4.2.0) replaces the prior single `ORACLE_VERSION` constant and lets PXE upgrades roll forward without re-compiling every contract.

#### Complete Oracle Module Reference

| Module | Key Functions | Purpose |
|--------|--------------|---------|
| `notes` | `get_notes`, `notify_created_note`, `notify_nullified_note`, `get_next_app_tag_as_sender` | Note CRUD and tagging |
| `nullifiers` | `notify_created_nullifier`, `check_nullifier_exists`, `is_nullifier_pending` | Nullifier operations |
| `keys` | `get_public_keys_and_partial_address` | Public key retrieval |
| `key_validation_request` | `get_key_validation_request` | Kernel key validation |
| `block_header` | `get_block_header_at` | Historical block state |
| `get_membership_witness` | `get_note_hash_membership_witness` | Note hash inclusion proofs |
| `get_nullifier_membership_witness` | `get_low_nullifier_membership_witness` | Nullifier non-inclusion proofs |
| `get_public_data_witness` | `get_public_data_witness` | Public data Merkle proofs |
| `get_l1_to_l2_membership_witness` | `get_l1_to_l2_membership_witness` | Cross-chain message proofs |
| `storage` | `raw_storage_read`, `storage_read` | Public state reads |
| `get_contract_instance` | `get_contract_instance` | Contract metadata |
| `auth_witness` | `get_auth_witness` | Authorization data |
| `call_private_function` | `call_private_function_internal` | Nested private calls |
| `message_processing` | `notify_enqueued_public_function_call`, `notify_set_min_revertible_side_effect_counter` | Public call scheduling |
| `logs` | `notify_created_contract_class_log`, `fetch_tagged_logs`, `validate_and_store_enqueued_notes_and_events` | Log management |
| `execution` | `get_utility_context` | Context bootstrapping |
| `execution_cache` | `store`, `load` | Ephemeral tx-scoped cache |
| `capsules` | `store`, `load`, `delete`, `copy` | Persistent per-contract storage. As of 4.2.0 every operation (and `CapsuleArray::at`) requires an explicit `scope: AztecAddress` argument; the PXE enforces scope access at runtime so a capsule written for one account cannot be read from a different scope |
| `avm_*` | `address`, `sender`, `timestamp`, `storage_read`, `storage_write`, `emit_public_log`, ... | AVM opcodes for public execution (fully constrained by the AVM circuit; public-only). See the AVM spec for the full opcode set |
| `aes128_decrypt` | `aes128_decrypt_oracle` | AES decryption (does not fail on bad key) |
| `shared_secret` | `get_shared_secret` | ECDH shared secret computation |
| `random` | `random` | Unconstrained randomness |
| `version` | `assert_compatible_oracle_version` | Version compatibility check |
| `offchain_effect` | `emit_offchain_effect` | Arbitrary off-chain data emission |

#### Oracle Security Model

| Oracle | Trust Model |
|--------|-------------|
| Membership witnesses | **Constrained** -- Merkle proofs verified in circuit |
| Notes/nullifiers | **Hint-based** -- PXE returns hints, kernel validates |
| Random values | **Honest PXE** -- assumes non-adversarial |
| Key derivation | **Kernel-validated** -- PXE provides sk_app, kernel proves relationship |
| AVM opcodes | **AVM-constrained** -- public execution is proven |

### 2.8 Events

#### Private Events

```noir
#[external("private")]
fn transfer(to: AztecAddress, amount: u128) {
    self.emit(Transfer { from: self.msg_sender(), to, amount })
        .deliver_to(to, MessageDelivery::ONCHAIN_UNCONSTRAINED);
}
```

Private event commitment = `poseidon2(randomness || event_type_id || event_data)`. The `#[must_use]` attribute on `EventMessage` ensures events are always delivered -- the compiler rejects code that discards the `self.emit(...)` return value, which forces the author to chain a `.deliver_to(recipient, mode)` call and actually send the event somewhere.

**Message delivery modes:**

| Mode | Cost | Guarantee |
|------|------|-----------|
| `MessageDelivery::ONCHAIN_UNCONSTRAINED` | Cheaper | Optimistic -- log sent without proving hash matches private commitment |
| `MessageDelivery::CONSTRAINED_ONCHAIN` | More expensive | Proven -- message hash constrained to match private execution commitment. Prevents sequencer message substitution. **Recommended for token transfers.** |

Wonderland's AIP-20 standard uses `CONSTRAINED_ONCHAIN` for all balance-affecting operations.

#### Public Events

```noir
#[external("public")]
fn mint(to: AztecAddress, amount: u128) {
    self.emit(Mint { to, amount }); // Emitted as public log
}
```

#### Event Size Limits

Private and public events have practical payload limits (~90 bytes of structured data per emission). When events carry large structs (e.g., a full cross-chain order), split across multiple events and reassemble client-side:

```noir
// Pattern: split large payloads across numbered events
self.emit(OrderOpened1 { order_id, field_a, field_b, field_c });
self.emit(OrderOpened2 { order_id, field_d, field_e, field_f });
// Client correlates by order_id
```

This pattern is used by Substance Labs' ERC-7683 bridge gateway for order data that exceeds single-event capacity.

### 2.9 Message Delivery and Offchain Messages

The message delivery system controls how encrypted notes and events reach their intended recipients. This is one of the most architecturally significant subsystems -- it determines the cost, privacy, and reliability of private state communication.

#### Three Delivery Modes

Defined in `messages/message_delivery.nr`:

| Mode | Value | On-chain Data | Cost | Guarantee |
|------|-------|--------------|------|-----------|
| `OFFCHAIN` | 1 | None | Zero DA gas, zero encryption gates | **None** -- sender can alter content or not deliver at all |
| `ONCHAIN_UNCONSTRAINED` | 2 | Encrypted log in private logs | DA gas, no encryption gates | **Medium** -- stored on-chain but sender can alter ciphertext contents |
| `ONCHAIN_CONSTRAINED` | 3 | Encrypted log + constrained tags | DA gas + nullifiers for tags | **High** -- content correctness proven in circuit. Tag prefixing still unconstrained (issue #14565) |

#### How Each Mode Works

**OFFCHAIN delivery:**
```noir
// Developer code:
note_message.deliver_to(recipient, MessageDelivery::OFFCHAIN);
```

Internally:
1. Plaintext encoded via `encode_private_note_message()` (fields: owner, storage_slot, randomness, packed_note, type_id)
2. Encrypted with AES-128 using the recipient's address-derived key
3. Ciphertext passed to `emit_offchain_effect()` oracle (unconstrained)
4. PXE collects effect as part of `PrivateCallExecutionResult.offchainEffects`
5. Offchain effects travel with the transaction metadata but are **never posted to L2 block data**
6. Sender must relay the ciphertext to recipient through an external channel (P2P, server, etc.)

**ONCHAIN_UNCONSTRAINED delivery:**
```noir
note_message.deliver_to(recipient, MessageDelivery::ONCHAIN_UNCONSTRAINED);
```

Internally:
1. Plaintext encoded and encrypted (same as offchain)
2. A **tag** is prepended via `prefix_with_tag()` -- derived from sender-recipient shared secret + index
3. Tagged ciphertext emitted as a private log via `context.emit_raw_note_log()` (for notes) or `context.emit_private_log()` (for events)
4. Log is included in the L2 block's private logs section
5. Recipient's PXE discovers the log during block sync via tag matching

**ONCHAIN_CONSTRAINED delivery:**
```noir
note_message.deliver_to(recipient, MessageDelivery::CONSTRAINED_ONCHAIN);
```

Same as unconstrained but additionally:
1. Encryption is proven correct in-circuit (message hash matches commitment)
2. Tag computation emits a nullifier binding it to the correct sender-recipient pair
3. Prevents a malicious sequencer from substituting a different ciphertext

#### Message Encoding Format

All messages follow a standard encoding in `messages/logs/encoding.nr`:

```
[msg_expanded_metadata, ...msg_content]

msg_expanded_metadata = (msg_type_id << 64) | msg_metadata

msg_type_id values:
  0 = PRIVATE_NOTE_MSG_TYPE_ID       (full private note)
  1 = PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID (private part of hybrid note)
  2 = PRIVATE_EVENT_MSG_TYPE_ID       (private event)
```

**Maximum plaintext:** 12 fields of content. After reserving 3 fields for note metadata (owner, storage_slot, randomness), **9 fields remain for note data** -- this is why `MAX_NOTE_PACKED_LEN = 9`.

#### Tagging System (Recipient Discovery)

Tags allow recipients to efficiently find their messages without scanning all logs:

**Sender side** (during `prefix_with_tag()`):
1. Query oracle for current sender identity: `get_sender_for_tags()`
2. Get next tag index for this sender-recipient pair: `get_next_app_tag_as_sender(sender, recipient)`
3. Compute tag from shared secret + index
4. Prepend tag as first field of private log

**Recipient side** (during PXE block sync):
1. For each known sender in the `SenderAddressBookStore`, derive the shared tagging secret
2. Compute expected tags for index range `[last_finalized_index .. last_finalized_index + WINDOW_LEN]`
3. Query node for private logs matching these tags (`getAllPrivateLogsByTags()`)
4. Attempt AES-128 decryption of matching logs
5. On success: extract note/event plaintext and proceed to validation

**Window length:** 20 tags per sender-recipient pair are checked per sync cycle. This handles the case where some logs were squashed (removed by the kernel when notes are created and nullified in the same tx).

#### Message Processing Pipeline in PXE

When the PXE processes a discovered message:

```
1. process_message_ciphertext()
   -> Decrypt with recipient's AES key
   -> On failure: skip (not for this recipient)

2. process_message_plaintext()
   -> Decode header (msg_type_id, metadata)
   -> Route to handler:

3a. process_private_note_msg()          [type 0]
    -> Extract owner, storage_slot, randomness, packed_note
    -> attempt_note_nonce_discovery():
       nonce = compute_note_hash_nonce(first_nullifier, index)
       Verify: unique_note_hash matches transaction's recorded hashes
    -> Enqueue validated note for storage

3b. process_partial_note_private_msg()  [type 1]
    -> Store as DeliveredPendingPartialNote in capsule
    -> Later: fetch public completion log via bulk_retrieve_logs()
    -> Combine private + public content, then run nonce discovery

3c. process_private_event_msg()         [type 2]
    -> Extract event data
    -> Enqueue validated event for storage

4. validate_and_store_enqueued_notes_and_events()
   -> Verify siloed unique note hash exists in note hash tree
   -> Verify nullifier is not yet spent
   -> Store note in NoteStore (available for get_notes() oracle)
   -> Store event in PrivateEventStore (available for getPrivateEvents() API)
```

#### Auto-Generated Discovery Functions

The `#[aztec]` macro generates these utility functions per contract:

**`sync_state(scope: AztecAddress)`** -- Triggers the full discovery pipeline. Now takes an explicit scope (the account whose notes are being synced):
1. Fetches tagged logs for all registered sender-recipient pairs reachable from `scope`
2. Processes each ciphertext through the pipeline above
3. Validates and stores discovered notes/events
4. Drains the offchain message inbox via auto-injected `offchain_receive` handlers

**`offchain_receive(...)`** -- Auto-injected by the macro; users cannot define this function themselves. It pushes inbound offchain ciphertexts (delivered out-of-band, see Section 2.9) into the contract's message inbox where they are picked up on the next `sync_state`.

Both use the contract's `_compute_note_hash_and_nullifier` (also auto-generated) to reconstruct note hashes for validation. As of 4.2.0 the helper takes separate `compute_note_hash` and `compute_note_nullifier` functions instead of a combined helper, so contracts with custom nullification logic can override one without the other.

**Removed in 4.2.0:** the prior `process_message(ciphertext, context)` auto-generated helper. Callers that previously invoked it must use `offchain_receive(...)` (for offchain delivery) followed by `sync_state(scope)` (for processing).

**`CustomMessageHandler`** -- Contracts that register a custom handler must now accept a `scope: AztecAddress` parameter; the framework passes the syncing account through so the handler can decide what to do per-account.

#### Capsule Arrays as IPC

The message processing pipeline uses capsule arrays as an inter-invocation communication mechanism between Noir code and PXE:

| Capsule Slot | Purpose |
|-------------|---------|
| `PENDING_TAGGED_LOG_ARRAY_BASE_SLOT` | Unprocessed private logs fetched from node |
| `NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT` | Notes pending PXE validation |
| `EVENT_VALIDATION_REQUESTS_ARRAY_BASE_SLOT` | Events pending PXE validation |
| `DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT` | Partial notes awaiting public completion |
| `LOG_RETRIEVAL_REQUESTS_ARRAY_BASE_SLOT` | Requests for public completion logs |
| `LOG_RETRIEVAL_RESPONSES_ARRAY_BASE_SLOT` | Responses from node with completion data |

This capsule-based IPC allows the Noir discovery code to enqueue work items that the PXE fulfills in batch, avoiding expensive per-item oracle round-trips.

#### When to Use Each Delivery Mode

| Scenario | Recommended Mode | Rationale |
|----------|-----------------|-----------|
| Self-transfer (change notes) | `ONCHAIN_CONSTRAINED` | Must guarantee correct delivery to yourself |
| Token transfer to known recipient | `ONCHAIN_UNCONSTRAINED` | Recipient can validate on-chain; sender generally trusted |
| P2P payment with direct channel | `OFFCHAIN` | Cheapest; sender relays ciphertext directly |
| Fee payment / protocol operations | `ONCHAIN_CONSTRAINED` | Cannot trust the counterparty |
| Game state updates | `OFFCHAIN` | Low-cost, real-time; re-sync from chain if lost |
| NFT minting to buyer | `ONCHAIN_UNCONSTRAINED` | Buyer needs to discover without sender cooperation |

### 2.10 Authorization Witnesses (AuthWit)


AuthWit enables delegated transaction execution. Two paths:

**Private AuthWit:** Signature-based, verified via static call to account contract.

```noir
#[authorize_once("from", "authwit_nonce")]
#[external("private")]
fn transfer_from(from: AztecAddress, to: AztecAddress, amount: u128, authwit_nonce: Field) {
    // Macro auto-generates:
    // 1. Compute message hash from (from, chain_id, version, inner_hash)
    // 2. Static-call from.verify_private_authwit(inner_hash)
    // 3. Emit nullifier to prevent replay (bound to authwit_nonce)
    // User code executes only if verification succeeds
}
```

**Nonce convention:** Wonderland's AIP-20 standard established the convention that every delegated function takes an explicit `authwit_nonce: Field` parameter (not just `nonce`). The macro's first argument names the "on behalf of" address field, the second names the nonce field. The nonce is consumed as a nullifier, preventing the same authorization from being used twice.

**TypeScript side:**
```typescript
const authwit = await wallet.createAuthWit({
  caller: spenderAddress,
  action: token.methods.transfer_from(owner, recipient, amount, nonce)
});
// authwit is passed alongside the transaction
```

Message hash = `poseidon2(consumer || chain_id || version || inner_hash)` where inner_hash = `hash(caller || consumer || selector || args_hash)`.

**Public AuthWit:** Registry-based, used when the authorization is checked during public execution rather than private. It reuses most of the private AuthWit machinery -- the `#[authorize_once("from", "authwit_nonce")]` macro, the same message-hash construction (`poseidon2(consumer || chain_id || version || inner_hash)` with `inner_hash = hash(caller || consumer || selector || args_hash)`), and the nonce-as-nullifier replay protection. What differs is *how* the "is the caller authorized?" check is answered: instead of a static call to the account contract's `verify_private_authwit`, the account has previously called `AuthRegistry.set_authorized(hash, true)` to flip an on-chain flag, and the consumer calls `AuthRegistry.consume(hash)` which asserts the flag is set and clears it. No TypeScript-side `createAuthWit` signing is involved; the authorization is published as public on-chain state rather than handed over as a signed witness.

### 2.11 Historical State Access

Private functions can prove facts about past block state by requesting Merkle membership witnesses from the PXE oracle and verifying them in-circuit against the anchor block header's state roots.

```noir
// Read a public storage value at a historical block
// Internally: fetches PublicDataWitness from oracle, verifies Merkle proof against
// block_header.state.partial.public_data_tree.root
let value = public_storage_historical_read(block_header, storage_slot, contract_address);

// Prove a note hash existed in the note hash tree at a given block
// Internally: fetches note hash membership witness, verifies against
// block_header.state.partial.note_hash_tree.root
let confirmed = assert_note_existed_by(block_header, hinted_note);

// Prove a note was not nullified at a given block (non-membership proof)
// Internally: fetches low nullifier witness, verifies the target nullifier falls
// between two adjacent nullifiers in the indexed nullifier tree
assert_note_was_not_nullified_by(block_header, confirmed_note, context);

// Prove a contract was deployed (its bytecode nullifier exists)
assert_contract_bytecode_was_published_by(block_header, contract_address);
```

**Cost:** Each historical proof adds ~3-4k constraints for the Merkle path verification. The block header itself is available as `context.get_anchor_block_header()` (current anchor) or `context.get_block_header_at(block_number)` (specific historical block, requires additional archive tree proof).

**Constraint:** Archive nodes prune old state after ~2 hours. Historical proofs for blocks older than the prune window will fail because the oracle cannot provide the membership witness.

### 2.12 Key Management

Four key types, each with master and app-siloed variants:

| Key | Index | Purpose |
|-----|-------|---------|
| Nullifier Key (NHK) | 0 | Derive nullifiers for notes |
| Incoming Viewing Key (IVK) | 1 | Decrypt notes sent to you |
| Outgoing Viewing Key (OVK) | 2 | Decrypt notes you sent |
| Tagging Key (TK) | 3 | Discover tagged logs |

```
User Secret Key (Fr)
  -> Master Public Key (Point)
     +-- npk_m (Nullifier Public Key Master)
     +-- ivpk_m (Incoming Viewing Public Key Master)
     +-- ovpk_m (Outgoing Viewing Public Key Master)
     +-- tpk_m (Tagging Public Key Master)
```

App-specific keys are derived by siloing with contract address, preventing cross-contract key leakage.

---

## 3. aztec.js: The TypeScript Client SDK

### 3.1 Package Structure

Published as `@aztec/aztec.js` with subpath exports:

```typescript
import { Contract } from '@aztec/aztec.js/contracts';
import { AccountManager } from '@aztec/aztec.js/account';
import { AztecAddress, Fr } from '@aztec/aztec.js/fields';
```

20+ subpaths: `abi`, `account`, `addresses`, `contracts`, `crypto`, `deployment`, `events`, `fee`, `fields`, `keys`, `node`, `note`, `tx`, `wallet`, etc.

### 3.2 Contract Interaction

#### The Contract Class

```typescript
// Attach to deployed contract
const contract = Contract.at(address, MyContractArtifact, wallet);

// Call methods
const balance = await contract.methods.balanceOf(owner).simulate({ from });
const receipt = await contract.methods.transfer(to, amount).send({ from });
const profile = await contract.methods.mint(amount).profile({ from, profileMode: 'gates' });

// Batch calls
const batch = new BatchCall(wallet, [
  contract.methods.transfer(addr1, 100),
  contract.methods.transfer(addr2, 200),
]);
await batch.send({ from });
```

`ContractFunctionInteraction` returned by `contract.methods.*()` supports:
- `.send(opts)` -- Send transaction
- `.simulate(opts)` -- Simulate without sending
- `.profile(opts)` -- Profile gate counts
- `.request(opts)` -- Get execution payload for batching
- `.getFunctionCall()` -- Get encoded function call (for authwits)

### 3.3 Account System

#### Account Abstraction

Every Aztec transaction goes through an account contract's `entrypoint()` function, which validates that the account owner authorized the specific set of function calls in the transaction. This is integrated directly into the protocol -- there is no separate "bundler" or "entry point" contract as in Ethereum's ERC-4337. The account contract IS the entry point, and it is the first function executed in every transaction.

#### AccountManager

```typescript
const accountManager = await AccountManager.create(wallet, secretKey, accountContract, salt);
const completeAddress = await accountManager.getCompleteAddress();
const deployMethod = await accountManager.getDeployMethod();
await deployMethod.send({ from: address });
```

Addresses are deterministically derived from `poseidon2(salt, public_keys_hash, contract_class_id, constructor_hash)`. This means the same secret key + salt always produces the same address, even before deployment. Users can receive notes at an address before the account contract is deployed.

#### Account Contract Implementations

| Type | Curve | Key Feature | Production Ready? |
|------|-------|-------------|-------------------|
| **Schnorr** | Grumpkin | Most efficient in circuits | Yes |
| **ECDSA-k1** | secp256k1 | Ethereum wallet compatible | Yes |
| **ECDSA-r1** | secp256r1 (P-256) | HSM/mobile hardware support | Yes |
| **SSH ECDSA-r1** | secp256r1 | SSH agent integration | Yes |
| **SingleKey** | Grumpkin | Single key for encryption + auth | **Removed in 4.2.0** (security vulnerability F-244 -- `SchnorrSingleKeyAccount` no longer ships) |
| **Stub** | None | Testing/kernelless simulation | Testing only |

### 3.4 Transaction Lifecycle

```
1. contract.methods.transfer(...) -> ContractFunctionInteraction
2. .request(options)              -> ExecutionPayload (calls + authwits + capsules)
3. wallet.sendTx(payload, opts)   -> account wraps in entrypoint call
4. pxe.proveTx(txRequest)         -> private simulation + kernel proving
5. node.sendTx(tx)                -> submitted to network
6. sequencer includes in block    -> public execution + state update
```

#### ExecutionPayload

```typescript
class ExecutionPayload {
  calls: FunctionCall[];           // What to execute
  authWitnesses: AuthWitness[];    // Signed authorizations
  capsules: Capsule[];             // Read-only data
  extraHashedArgs: HashedValues[]; // Additional hashed arguments
  feePayer?: AztecAddress;         // Who pays fees
}
```

#### Wait Options

```typescript
const receipt = await contract.methods.transfer(to, amount).send({
  from: sender,        // Pass NO_FROM (the new sentinel as of 4.2.0; replaces AztecAddress.ZERO)
                       // when you want to bypass the account-contract entrypoint entirely.
                       // Multi-call flows that previously relied on AztecAddress.ZERO must now wrap
                       // their payloads via DefaultMultiCallEntrypoint manually.
  wait: { timeout: 120_000, interval: 1_000 },
  // OR wait: 'NO_WAIT' to return immediately with TxHash
});
```

`.send()` now performs gas estimation automatically (4.2.0); callers no longer need to call `.estimateGas()` separately before submitting unless they want a custom gas profile. For pure-simulation callers, use `GasSettings.forEstimation()` to build a settings object that pairs naturally with `skipTxValidation: true`.

#### Gas settings naming changes

- `GasSettings.default()` was renamed to `GasSettings.fallback()` to avoid implying that the returned values are sensible defaults.
- The `DEFAULT_GAS_LIMIT` and `DEFAULT_TEARDOWN_GAS_LIMIT` constants were removed; the runtime now derives limits from the protocol maxima.

### 3.5 Fee Payment

```typescript
interface FeePaymentMethod {
  getAsset(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getFeePayer(): Promise<AztecAddress>;
  getGasSettings(): GasSettings | undefined;
}
```

| Method | Status | Description |
|--------|--------|-------------|
| `FeeJuicePaymentMethodWithClaim` | **Active** | Pay with FeeJuice (canonical fee token). For users who hold fee tokens |
| `SponsoredFeePaymentMethod` | **Active** | Third party sponsors unconditionally. **Most important for dApp UX** |
| `PrivateFeePaymentMethod` | **Broken on public networks** | Custom-token FPCs were removed from the default public-setup allowlist in 4.2.0; this method (and the `fpc-private` CLI flag) only works on local sandboxes. Switch to `FeeJuicePaymentMethodWithClaim` for any public-network deployment |
| `PublicFeePaymentMethod` | **Broken on public networks** | Same as above; `fpc-public` CLI flag is similarly local-only now |

**SponsoredFPC in practice:** Every ecosystem dApp targeting users who don't hold Aztec fee tokens uses `SponsoredFeePaymentMethod`. Deploy a `SponsoredFeePaymentContract` (FPC), fund it with FeeJuice, and pass it to every transaction:

```typescript
const fpc = new SponsoredFeePaymentMethod(sponsoredFPCAddress);

// All transactions use sponsored fees -- user never sees gas
await contract.methods.transfer(to, amount).send({ from, fee: fpc });
await contract.methods.mint(amount).send({ from, fee: fpc });
```

Recover costs at the application level (bridge fees, swap spreads, subscriptions). This pattern is used by DeFi Wonderland's Bridge-and-Seek and is the recommended approach for onboarding EVM-native users.

### 3.6 Contract Deployment

```typescript
// Deploy a contract: publishes class, publishes instance, calls constructor, registers in PXE
// As of 4.2.0, DeployMethod.send() always returns { contract, receipt, instance } -- the prior
// returnReceipt flag, DeployTxReceipt type, and DeployWaitOptions type were all removed.
const { contract, receipt, instance } = await Contract.deploy(wallet, artifact, [arg1, arg2]).send({ from });

// Deployment is a multi-step process (each step can be skipped):
{
  contractAddressSalt?: Fr,          // Deterministic address (default: random)
  skipClassPublication?: boolean,    // Skip if contract class already on-chain (common for redeployments).
                                     // **Restricted in 4.2.0:** contracts that expose any external public function
                                     // can no longer be deployed with this flag set to true; the class must be on-chain.
  skipInstancePublication?: boolean, // Skip instance registration on-chain
  skipInitialization?: boolean,      // Skip calling the #[initializer] constructor
  skipRegistration?: boolean,        // Skip registering artifact in local PXE ContractStore
  universalDeploy?: boolean,         // Don't include deployer address in address derivation
                                     // (allows anyone to deploy the same artifact to the same address)
}
```

**Deployment steps in order:**
1. **Publish contract class** -- Broadcasts the artifact (bytecode + ABI) to the network via a contract class log. Other PXEs can now fetch the artifact. Skippable if class was already published
2. **Publish contract instance** -- Records the `(address, class_id, salt, public_keys, init_hash)` tuple on-chain. This makes the contract discoverable
3. **Call initializer** -- Executes the `#[initializer]` function (constructor). As of 4.2.0 this emits **two** initialization nullifiers (one private, one public) -- both `poseidon2([address, init_hash])` -- which together prevent re-initialization from either execution context. Functions marked `#[only_self]` skip the init check on the caller side
4. **Register in PXE** -- Stores the artifact and instance in the local PXE's ContractStore so future interactions can load the ABI

### 3.7 Events and Notes

```typescript
// Private events (encrypted, stored in PXE) -- `scopes` is now mandatory (no ALL_SCOPES fallback)
const events = await wallet.getPrivateEvents(
  MyContract.events.Transfer,
  { contractAddress, scopes: [myAddress] }
);

// Public events (queryable from node) -- as of 4.2.0 returns { events, maxLogsHit }.
// Use `afterLog` from the response (rather than a separate continuation token) for pagination.
const { events, maxLogsHit } = await getPublicEvents(
  node,
  MyContract.events.Mint,
  { contractAddress, fromBlock: 100 }
);
```

#### Other event/contract API changes in 4.2.0

- `ContractMetadata.isContractInitialized` (boolean) was replaced by `initializationStatus`, a tri-state enum (`INITIALIZED` / `UNINITIALIZED` / `UNKNOWN`) so callers can distinguish "we know it isn't initialized" from "we don't yet know".
- `computeL2ToL1MembershipWitness` no longer requires the caller to pass an epoch; it resolves the epoch internally from the `txHash` and returns it on the witness. A new optional `messageIndexInTx` parameter disambiguates duplicate messages within the same tx.
- `TxReceipt` now carries `epochNumber` so callers can correlate confirmations with the rollup epoch directly.

---

## 4. PXE: The Private Execution Environment

### 4.1 What PXE Is

The PXE is the client-side runtime that manages private transaction execution, state synchronization, and key management. It runs on the user's device and never shares private data with the network.

**Core responsibilities:**
1. Simulate private function execution locally
2. Discover, decrypt, and store notes encrypted for the user
3. Orchestrate kernel circuit proving
4. Manage user keys and accounts
5. Implement the oracle interface that Noir contracts call during execution
6. Synchronize with the network via block streaming

### 4.2 Core Architecture

```
yarn-project/pxe/src/
+-- pxe.ts                           # Main PXEService class
+-- storage/                         # Multi-store persistence
|   +-- note_store/                  # Note storage & indexing
|   +-- contract_store/              # Contract artifacts & instances
|   +-- anchor_block_store/          # Synced block header
|   +-- address_store/               # User account addresses
|   +-- capsule_store/               # Transient capsule storage
|   +-- tagging_store/               # Sender/recipient tagging indexes
|   +-- private_event_store/         # Private event log storage
+-- contract_function_simulator/     # Private execution simulation
|   +-- oracle/                      # Oracle implementations
+-- block_synchronizer/              # Network sync layer
+-- private_kernel/                  # Kernel proving orchestration
+-- notes/                           # Note queries & nullification
+-- tagging/                         # Log tagging for encryption
+-- events/                          # Event management
+-- job_coordinator/                 # Staged writes coordinator
```

**Job Queue Pattern:** PXE uses a `SerialQueue` to prevent concurrent execution -- two transactions cannot be simulated in parallel because they may read/write overlapping note state. Each operation is assigned a unique `jobId`. All store writes during the job are staged (buffered in memory). On success, `jobCoordinator.commitJob(jobId)` atomically flushes all staged writes to persistent storage. On failure, `jobCoordinator.abortJob(jobId)` discards them. This prevents partial state corruption from failed simulations.

**Explicit scopes (4.2.0):** The convenience `ALL_SCOPES` sentinel was removed from the PXE API. Every call to `simulateTx`, `executeUtility`, `profileTx`, `proveTx`, and the wallet-side `getPrivateEvents` now requires an explicit `AztecAddress[]` for `scopes`. Pass the registered accounts that are allowed to see notes for the operation; the PXE will reject log retrieval for any contract not in the current execution context. `ExecuteUtilityOptions.scope` was also renamed to `scopes` to match.

**Sender validation (4.2.0):** The PXE rejects attempts to register invalid addresses (e.g. infinity points) as senders, because such addresses produced silent tag-computation failures and made notes undiscoverable. Tag computation itself no longer aborts on invalid recipients -- it logs and skips, so a single malformed entry no longer breaks the whole sync.

### 4.3 Oracle Implementations

Three oracle handler types correspond to the three execution contexts:

| Handler | Available In | Capabilities |
|---------|-------------|--------------|
| `IMiscOracle` | All contexts | Random, logging, version check |
| `IUtilityExecutionOracle` | Utility functions | State queries, membership witnesses, capsules, auth witnesses |
| `IPrivateExecutionOracle` | Private functions | All utility + note creation/nullification, log emission, public call enqueuing, key access |

The `Oracle` class wraps handlers and exposes all methods via `toACIRCallback()` for the circuit simulator.

### 4.4 Note Management

**NoteStore** uses multi-level indexing:
- Primary: `nullifier -> StoredNote` (main storage)
- Index: `contract_address -> nullifier` (per-contract lookup)
- Index: `block_number -> nullifier` (for rollback handling)
- Staged: `jobId -> nullifier -> StoredNote` (in-flight writes)

**Note Selection (pickNotes):**
1. Fetch all active notes for `(contractAddress, owner, storageSlot)`
2. Apply filters based on note field values and comparators
3. Sort by specified indexes and order
4. Return top `limit` notes starting at `offset`

### 4.5 Block Synchronization

**BlockSynchronizer** processes L2BlockStream events:
- `blocks-added` -- New blocks proposed
- `chain-checkpointed` / `chain-proven` / `chain-finalized` -- Finality levels
- `chain-pruned` -- Reorg detected, rollback notes and events atomically

**Log Tagging System:**
- **Sender Sync:** Track which tags a sender has used (prevents reuse)
- **Recipient Sync:** Decrypt logs tagged for the recipient, store in PrivateEventStore

### 4.6 Kernel Proving

After private execution simulation, `PrivateKernelExecutionProver` orchestrates a pipeline of kernel circuits that validate protocol rules and produce the final proof:

1. **PrivateKernelInit** -- Processes the entrypoint function call. Validates the transaction request matches the execution result. Creates initial accumulated data (note hashes, nullifiers, logs)
2. **PrivateKernelInner** (repeated for each nested call) -- Validates each nested private function call. Aggregates its side effects into the accumulated data. Verifies call stack ordering
3. **PrivateKernelReset** (repeated as needed) -- Squashes transient notes (notes created and nullified in the same tx, removing both from the proof). Reorders side effects. Removes duplicates. This is where note hash / nullifier pairs are matched and eliminated
4. **PrivateKernelTail** -- Final aggregation. Validates all side effects conform to protocol limits (`MAX_NOTE_HASHES_PER_TX`, `MAX_NULLIFIERS_PER_TX`, etc.). Siloes note hashes and nullifiers with the contract address. Produces `PrivateKernelTailCircuitPublicInputs` containing the complete set of side effects + proof

**Proof modes:** Set `simulate: true` to skip actual proof generation (returns valid public inputs but no cryptographic proof). Set `profileMode: 'gates'` to count constraint gates per circuit for optimization.

**Kernelless simulations (default in 4.2.0):** dApp UI calls (`.simulate(...)` and `executeUtility`) now skip the kernel pipeline entirely by default and run only the contract circuit. This collapses simulation time from seconds to tens of milliseconds for typical balance/state queries, which is the dominant interaction pattern in dApp UIs. Kernel simulation can still be requested explicitly when the caller needs the same accumulated public-inputs as a real submission (e.g. to drive gas estimation hints).

**Oracle version handshake:** With the move to major/minor oracle versions, the PXE now produces actionable error pages when a contract's required oracle major differs from the PXE's. A minor mismatch (contract requires a newer minor than the PXE has) emits a structured warning rather than aborting, since minor bumps are additive.

### 4.7 Database Layer

All stores use `AztecAsyncKVStore` abstraction with implementations for:
- **LMDB** (server/desktop)
- **IndexedDB** (browser)

Schema version: `PXE_DATA_SCHEMA_VERSION = 3`. Checked at initialization.

### 4.8 Browser Support

**Current challenges:**
- IndexedDB transactions auto-commit on non-DB awaits (PXE uses staged writes pattern)
- WASM compilation of Barretenberg is ~100MB (impractical for browsers)
- Inline web workers have bundler compatibility issues
- Cross-tab synchronization not supported

**Workarounds:**
- `proverEnabled: false` for browser -- simulates proofs without generating them
- **`nemi-fi/vite-plugin-aztec`** -- Community Vite plugin that handles WASM loading, Web Worker instantiation, and release-specific bundling heuristics. Required for any Vite-based dApp. Must be version-pinned to each Aztec release
- **`nemi-fi/gaztec`** -- Community version manager that fills gaps in the official `aztec-up` tool for multi-version management

### 4.9 Performance Issues

**Baseline:** A standard token transfer takes ~25 seconds on the official PXE. The bottleneck is not proving -- it is oracle calls, database writes, and sequential RPC requests during simulation.

**Obsidion's PXE Fork** (`obsidionlabs/pxe`) identified and patched four specific bottlenecks, reducing transfer time to ~12.8 seconds:

| Optimization | Time Saved | Root Cause |
|-------------|-----------|------------|
| Parallelize `getPublicStorageAt` calls | **9.3s** | Sequential RPC requests to node for each public storage slot. Fix: batch into concurrent promises |
| Batch `storePendingTaggedLogs` | **3.3s** | Per-log database writes during note sync. Fix: single DB transaction for all logs in a batch |
| Cache contract artifacts in memory | **3.4s** | Repeated deserialization of contract JSON on every oracle call. Fix: LRU cache keyed by class ID |
| Parallelize kernel hint generation | **0.3s** | Sequential hint computation for kernel inputs. Fix: concurrent promise execution |

These are the most impactful, lowest-risk performance improvements available. They require no protocol changes.

**Note Sync:** `balance_of_private()` triggers 70+ network requests because each note's nullifier must be checked individually against the node. Root cause: no batch nullifier existence check API. Each call to `findLeavesIndexes` is a separate RPC round-trip.

**Browser IndexedDB:** Async iteration over notes is 3-5x slower than LMDB. Each note lookup requires opening and committing an IndexedDB transaction. Large note sets (>100 notes) can take seconds to iterate.

---

## 5. Wallet SDK and Account Contracts

### 5.1 Wallet Architecture

```
Wallet Interface (dApp-facing)
    |
    v
BaseWallet (wallet-sdk)
    |
    +-- Account (EntrypointInterface + AuthorizationProvider)
    +-- PXE (private execution runtime)
```

The `Wallet` type provides: `simulateTx`, `sendTx`, `createAuthWit`, `registerContract`, `getPrivateEvents`, `batch`, and more.

**Iframe wallets SDK (new in 4.2.0):** Ships an additional embedding surface that hosts the wallet UI in an iframe so that dApps can integrate a wallet flow without owning the keys. Communication uses the same ECDH-secured `MessagePort` channel as the browser-extension model (Section 5.4). This is the building block ecosystem teams have been using to converge on a hosted-wallet UX.

**`EmbeddedWalletOptions` consolidation:** The previously-split `pxeConfig` + `pxeOptions` fields were merged into a single `pxe` field (the old fields remain as deprecated shims). The wallet SDK also now accepts a custom `PrivateKernelProver`, allowing teams to plug in optimized proving backends (for example, Obsidion's parallelized hint-generation prover) without forking the SDK.

**`getPrivateEvents` migration:** Now requires the same explicit `scopes: AztecAddress[]` argument as the rest of the PXE API.

### 5.2 Account Contract Types

All account contracts extend `DefaultAccountContract` which uses `DefaultAccountEntrypoint`.

**Noir-side entrypoint signature:**
```noir
fn entrypoint(app_payload: AppPayload, fee_payment_method: u8, cancellable: bool)
```

The account validates the transaction by:
1. Computing hash of the app payload
2. Retrieving auth witness for that hash via oracle
3. Verifying signature against stored signing public key
4. Emitting a nullifier for one-time use

### 5.3 Entrypoint Mechanism

`DefaultAccountEntrypoint.createTxExecutionRequest()`:
1. Encodes dApp calls into `EncodedAppEntrypointCalls`
2. Computes payload hash
3. Creates `AuthWitness` for the hash (proves account authorized these specific calls)
4. Assembles `TxExecutionRequest` with all hashed arguments, auth witnesses, and capsules

**Fee payment options:**
- `PREEXISTING_FEE_JUICE` -- Account has FeeJuice balance
- `FEE_JUICE_WITH_CLAIM` -- Claim fresh FeeJuice in same tx
- `EXTERNAL` -- Third party pays

### 5.4 Browser Extension Model

**Discovery Protocol:**
1. Content script broadcasts `aztec-wallet-discovery`
2. Extension responds with wallet info
3. MessagePort pair created for communication

**Secure Channel (ECDH):**
1. Both sides generate ephemeral ECDH key pairs
2. Exchange public keys via MessagePort
3. Derive shared secret, compute verification hash
4. User visually verifies emoji representation on both sides (MITM defense)
5. All subsequent calls encrypted with AES-256-GCM

#### Ecosystem Wallet Standard (EIP-1193)

The official wallet-sdk defines the ECDH protocol above, but the ecosystem has independently converged on **EIP-1193** as the practical dApp-wallet boundary. Four independent projects (Nemi, Azguard, WalletMesh, Shinami) all use the same `request(method, params)` pattern:

```typescript
// De facto standard across all ecosystem wallets
interface AztecWalletProvider {
  request(method: string, params: any[]): Promise<any>;
  on(event: string, handler: Function): void;
}

// Aztec-specific method names:
// aztec_getAccount, aztec_sendTransaction, aztec_simulateTransaction,
// aztec_createAuthWit, aztec_registerContract, etc.
```

**Serialization gap:** Each wallet project writes its own Aztec type serialization for the RPC boundary (`serde.ts` in Nemi, `serializers/` in WalletMesh, Zod schemas in Azguard). A future `@aztec/wire-types` package would eliminate this duplication.

**WalletMesh** has the most complete protocol design with 34 RPC methods, granular per-method permissions, and transport-agnostic JSON-RPC layer. It is the strongest foundation for a future official wallet standard.

---

## 6. Testing Infrastructure

### 6.1 TXE (Test Execution Environment)

Lightweight runtime for unit testing contracts without a full sandbox.

| Aspect | TXE | Full Sandbox |
|--------|-----|--------------|
| Setup time | Milliseconds | Seconds to minutes |
| State | Per-test only | Cross-test |
| L1 integration | Simulated | Real (Anvil) |
| Proofs | None | Full kernel proofs |
| Best for | Unit tests | E2E integration |

**TestEnvironment API:**

```noir
#[test]
unconstrained fn test_token_transfer() {
    let env = TestEnvironment::new();
    let owner = env.create_light_account();
    let recipient = env.create_light_account();
    let token = env.deploy("Token").with_constructor_args([SUPPLY]).call_constructor();

    env.call_private(owner, Token::at(token).transfer(recipient.address(), 100));

    // Assert via utility context
    let balance = env.call_private(recipient, Token::at(token).balance_of(recipient.address()));
    assert_eq(balance, 100);
}

#[test(should_fail_with = "Insufficient balance")]
unconstrained fn test_insufficient_balance() {
    // This should fail with the specified message
    env.call_private(owner, Token::at(token).transfer(recipient, 1_000_000));
}
```

**TXE Server:** Runs on port 8080 (default), receives JSON-RPC `resolve_foreign_call` requests from Noir tests. Each test gets its own session with isolated state.

### 6.2 E2E Testing

Located in `yarn-project/end-to-end/`. Uses full Aztec stack including nodes and L1.

```typescript
describe('e2e_token', () => {
  let wallet: AccountWallet;
  let token: Contract;

  beforeEach(async () => {
    const harness = await setup();
    wallet = harness.wallet;
    token = await Token.deploy(wallet).send().deployed();
  });

  it('should transfer tokens', async () => {
    const receipt = await token.methods.transfer(recipient, amount).send().wait();
    expect(receipt.status).toBe('mined');
  });
});
```

---

## 7. CLI Tooling

### Commands

| Command | Purpose |
|---------|---------|
| `aztec compile [nargo-args]` | Compile contracts: runs `nargo compile`, then `bb aztec_process` for VK generation and Brillig transpilation, then strips `__aztec_nr_internals__` prefixes |
| `aztec codegen` | Generate TypeScript bindings from compiled contract artifacts (typed Contract classes with method signatures) |
| `aztec start --local-network` | Start full local L2 with Anvil L1 (Ethereum), Aztec node, PXE, and optionally test accounts |
| `aztec start --node` | Start standalone Aztec node (requires separate L1 RPC URL) |
| `aztec start --txe` | Start TXE server on port 8080 for Noir unit test execution |
| `aztec start --sequencer` | Start sequencer (block production). Requires running node |
| `aztec start --prover-node` | Start prover node for proof generation |
| `aztec init [folder]` | Scaffold new project: creates Noir contract, TXE tests, and TypeScript frontend with aztec.js integration |
| `aztec wallet [...]` | First-class `cli-wallet` package (4.2.0) for scripting wallet operations from the terminal: account creation, transaction signing, claiming fees, calling deployed contracts. Replaces ad-hoc shell wrappers around aztec.js |

### Compilation Pipeline

```
.nr source
  -> nargo compile                    # Noir -> ACIR bytecode + ABI JSON
  -> bb aztec_process                 # Barretenberg post-processing:
     - Generate verification keys (VKs) for each private/internal function
     - Transpile public functions from ACIR to Brillig (AVM bytecode)
     - Strip __aztec_nr_internals__ prefix from function names
  -> contract-artifact.json           # Final artifact with bytecode, VKs, ABI, storage layout
  -> aztec codegen                    # (Optional) Generate MyContract.ts with typed methods
```

**Environment variables:**
- `NARGO` -- Path to nargo executable (default: `nargo` from PATH)
- `BB` -- Path to Barretenberg CLI (default: `bb` from PATH)

### aztec-up

Version management and installation:
```bash
aztec-up                    # Install latest version
aztec-up --version 0.47.0  # Install specific version
```

**Ecosystem alternative:** `nemi-fi/gaztec` provides more robust multi-version management, including switching between versions and managing per-project version pinning. Fills gaps in the official `aztec-up` for teams working across multiple Aztec versions.

---

## 8. Cross-Component Integration

### 8.1 Full Transaction Lifecycle

**Step 1: User creates execution request (aztec.js)**
```
contract.methods.transfer(to, amount) -> ContractFunctionInteraction
  -> encodeArguments() -> FunctionCall
  -> wallet.sendTx(payload, opts)
```

**Step 2: Account wraps in entrypoint (wallet-sdk)**
```
account.createTxExecutionRequest(payload, gasSettings, chainInfo)
  -> Encode calls into AppPayload
  -> Sign payload hash (create AuthWitness)
  -> Build TxExecutionRequest
```

**Step 3: PXE simulates private execution**
```
pxe.simulateTx(txRequest)
  -> Load contract artifact from ContractStore
  -> Create PrivateExecutionOracle with all stores
  -> Execute via ACVM (Noir bytecode) with oracle callback
  -> Oracle calls intercepted: getNotes, getKeys, getMembershipWitness, ...
  -> Collect: new note hashes, nullifiers, enqueued public calls, logs
```

**Step 4: Kernel proves execution**
```
PrivateKernelExecutionProver.proveWithKernels()
  -> PrivateKernelInit (first call)
  -> PrivateKernelInner (each nested call)
  -> PrivateKernelReset (process effects)
  -> PrivateKernelTail (final aggregation)
  -> Output: PrivateKernelTailCircuitPublicInputs + proof
```

**Step 5: Submit to network**
```
node.sendTx(tx)
  -> Validate proof
  -> Add to pending pool
  -> Sequencer picks up, executes public calls
  -> Block produced, published to L1
```

**Step 6: PXE syncs block**
```
BlockSynchronizer processes new block:
  -> Decrypt encrypted logs using user's viewing keys
  -> Store discovered notes in NoteStore
  -> Check if any owned notes were nullified
  -> Update anchor block header
```

### 8.2 The Artifact System

Contract artifacts flow from Noir compilation to deployment:

```
Noir source (.nr)
  -> nargo compile -> ACIR bytecode + ABI
  -> bb aztec_process -> VKs + transpiled Brillig
  -> contract-artifact.json:
     {
       name, functions: [{ name, type, selector, parameters, bytecode, vk }],
       events: [{ name, selector, fields }],
       storage: { fields: [{ name, slot }] }
     }
  -> aztec codegen -> TypeScript bindings (MyContract.ts)
  -> Registration in PXE ContractStore
```

### 8.3 The Oracle Bridge

When Noir calls an oracle function, it crosses the FFI boundary:

```
Noir circuit (ACIR) -> oracle_call::<GetNotes>(args)
  -> ACIR simulator intercepts foreign call
  -> Dispatches to Oracle.toACIRCallback()
  -> Handler fetches from NoteStore/ContractStore/Node
  -> Serializes result via toACVMField()
  -> Returns to ACIR as Field array
```

### 8.4 L1-L2 Messaging

**L1 to L2:**
1. User calls `Inbox.sendL2Message(target, content, secret)` on L1
2. Message stored in L1 Merkle tree
3. Archiver syncs message tree to L2 nodes
4. L2 contract calls `context.consume_l1_to_l2_message(content, secret, sender, leaf_index)`
5. Membership proof verified, nullifier emitted to prevent replay

**L2 to L1:**
1. L2 contract calls `context.message_portal(recipient, content)`
2. Message included in block, published to L1 rollup contract
3. L1 contract calls `rollup.consumeL2Message(message)`

**SHA-256 to BN254 Truncation (critical interop pattern):**

SHA-256 produces 256-bit hashes, but Aztec's BN254 scalar field is only 254 bits. Every cross-chain project must right-shift by 8 bits:

```solidity
// Solidity side (L1):
bytes32 contentHash = bytes32(uint256(sha256(abi.encodePacked(message))) >> 8);
inbox.sendL2Message(target, contentHash, secretHash);
```

```noir
// Noir side (L2):
// content_hash is already truncated to fit in a Field
self.context.consume_l1_to_l2_message(content_hash, secret, sender, leaf_index);
```

This `>> 8` pattern is used by Substance Labs (ERC-7683 bridge), WakeUp Labs (Wormhole relay), and Holonym (Human Bridge). Failure to truncate causes field overflow and silent hash mismatches.

### 8.5 Note Discovery Flow

```
1. Block published containing encrypted private logs

2. PXE BlockSynchronizer downloads all logs from the block via archiver

3. Tag matching (efficient pre-filter):
   For each registered (sender, recipient) pair in SenderAddressBookStore:
     shared_secret = ECDH(sender_tagging_key, recipient_ivpk)
     For index in [last_known_index .. last_known_index + WINDOW]:
       tag = poseidon2(shared_secret || index)
       If any log in the block has this tag: mark for decryption

4. Decryption (only for tag-matched logs):
   sym_key = derive_aes_key(shared_secret)
   plaintext = AES-128-decrypt(log_ciphertext, sym_key, iv)
   If decryption produces valid structure:
     Extract: owner, storage_slot, randomness, packed_note, note_type_id

5. Validation:
   note_hash = poseidon2(packed_note || owner || storage_slot || randomness)
   Verify note_hash appears in the block's note hash commitments
   (If it doesn't match, the log is corrupt or for a different contract)

6. Storage:
   Store in NoteStore keyed by nullifier (derived from note hash + owner NHK)
   Associate with scopes (which registered accounts can see this note)
   Index by (contract_address, storage_slot) for efficient get_notes() queries

7. Availability:
   Note is now available for future get_notes() oracle calls during private execution
```

**Performance bottleneck:** Step 3 is O(senders x recipients x window_size) per block. For a user who interacts with many counterparties, this explodes. The 70+ RPC requests for `balance_of_private()` stem from step 3 and the subsequent nullifier existence checks in step 6.

**Relationship to delivery modes:** Steps 2-6 above only apply to `ONCHAIN_UNCONSTRAINED` and `ONCHAIN_CONSTRAINED` delivery modes (see Section 2.8). For `OFFCHAIN` delivery, the sender must relay the ciphertext to the recipient through an external channel -- the PXE never discovers it from block data. The recipient pushes the ciphertext into the contract's offchain inbox via the auto-generated `offchain_receive(...)` function, and the next call to `sync_state(scope)` drains the inbox through the same processing pipeline.

---

## 9. Common Gotchas

### Private vs Public Execution

Private functions execute on the user's PXE (client-side, never shared with the network). Public functions execute on the sequencer (server-side, visible to all). **A private function cannot directly call a public function** -- it must **enqueue** it via `self.enqueue_self.my_public_fn(args)`. The enqueued public call executes later, after all private execution completes and the kernel proof is generated. This means the private function cannot read the return value of the public call -- it has already finished executing by the time the public call runs.

### Note Hash Levels

Don't confuse inner hash (what your contract computes), siloed hash (what the kernel computes), and unique hash (what's in the state tree). When nullifying settled notes, use the unique hash.

### Side Effect Ordering

Private kernel circuits may reorder side effects between revertible and non-revertible phases. Specifically: side effects emitted during `setup` (before `end_setup()`) are non-revertible and may be reordered relative to side effects emitted during the `app logic` phase (after `end_setup()`). Within a single phase, ordering is preserved. Don't rely on cross-phase ordering.

### Nullifiers Reveal Information

If `nullifier = hash(note, msg_sender)`, an observer who knows the note can compute who spent it. Better: `nullifier = hash(note_hash, secret_key)` where only the owner knows the key.

### Oracle Results Are Hints

Oracle data is unconstrained. The kernel validates critical oracle outputs (note existence, key relationships) but application developers must understand which oracle calls are trusted vs. hint-based.

### AES Decryption Doesn't Fail Loudly

`aes128_decrypt_oracle` returns `Option<plaintext>` (changed in 4.2.0; previously returned raw garbage on a wrong key). Callers must still validate the decoded plaintext semantically -- a `Some(...)` only means decryption produced *some* bytes, not that those bytes form a valid note. Always verify the reconstructed note hash matches what the kernel saw before trusting the contents.

### Fee Enforcement in Simulation

Simulating with `skipFeeEnforcement: true` can succeed when the real tx would fail for insufficient fees. Always test with enforcement enabled before submitting.

### Capsules Are Not Secret

Capsules (`oracle/capsules.nr`) provide persistent per-contract key-value storage in the PXE database. They are **not encrypted on-chain** -- capsule data is stored in the user's local PXE and is never published to the network. However, capsule values are passed as unconstrained oracle inputs during circuit execution, meaning the prover (PXE) could theoretically substitute different values. Use capsules for auxiliary hints and cached data, not for values that must be cryptographically bound to the proof.

---

## 10. Known Shortcomings

### Note Size Limit (9 Fields)

Notes are limited to 9 packed fields due to private log size constraints. Forces unnatural data structures. Workarounds: array packing, auxiliary notes, custom serialization.

### No Contract Inheritance

Noir doesn't support inheritance. Planned for Noir 1.0. Workaround: shared libraries and internal function calls.

### PXE Note Sync Performance

`balance_of_private()` triggers 70+ RPC requests. Each note's nullifier must be checked individually. Batch nullifier checks planned.

### PXE Browser Support

IndexedDB deadlocks, inline worker bundler issues, 100MB WASM payload. Multiple wallet teams blocked.

### Wallet SDK Fragmentation -- Largely Resolved (Q1 2026)

Major ecosystem wallet projects have converged on the official `wallet-sdk`, and 4.2.0 added the iframe SDK as a hosted variant. The remaining fragmentation lives at the **dApp ↔ wallet RPC** layer (see Section 5.4) where each project still ships its own type serialization. A canonical `@aztec/wire-types` package would close the gap.

### Breaking Changes

No formal versioning cadence. Teams go offline for weeks after unannounced changes. CI migration note enforcement planned.

### Missing Constrained (Guaranteed) Delivery

Even with `ONCHAIN_CONSTRAINED` delivery mode, the tag prefixing step is still unconstrained (GitHub issue #14565). This means a malicious sender can use a wrong tag, preventing the recipient from discovering the message during block sync. The recipient can still validate notes directly on-chain as a fallback, but this requires knowing which transaction contained the note.

The broader "guaranteed delivery" feature (F-317) -- where a smart contract can force a sender to deliver private data to a recipient -- remains unimplemented. This requires: a registry contract, key management decisions, constrained encryption, and storage proofs. Without it, all three delivery modes ultimately depend on sender cooperation for discovery.

### SingleKeyAccount Security Vulnerability (F-244) -- Resolved in 4.2.0

The insecure `SchnorrSingleKeyAccount` contract was removed entirely in 4.2.0. Sharing a viewing key for any account contract still implies the ability to transact from it (this is inherent to single-key designs), but no SingleKey account ships in the framework anymore. Teams that depended on it must migrate to one of the production-ready account contracts in Section 5.2.

### Partial Notes Limitations

- Can't complete partial notes with value = 0 (trailing zeros trimmed from logs)
- Each partial note type supports only one variant
- Implementation is manual and error-prone
- AIP-721 NFTs cannot have `token_id = 0` (used as sentinel in partial note mechanism)

### No Mobile BB Target

Barretenberg has no official iOS or Android build target. Both Obsidion and ZK Passport independently fork `aztec-packages` to cross-compile BB for mobile. This is a framework gap affecting all mobile wallet and identity projects.

### No State Migration Primitive

When Aztec upgrades deploy new rollup instances, user state on the old rollup becomes inaccessible. Cardinal Cryptography and Raven House independently built state migration tools. The "Secure Turnstile" pattern (lock on old rollup, prove inclusion via L1 archive root, claim on new rollup) should be a framework primitive.

### Wallet Type Serialization Duplication

Every ecosystem wallet project writes its own serialization layer for Aztec types over JSON-RPC. Nemi uses custom `serde.ts`, WalletMesh uses `serializers/`, Azguard uses Zod schemas. A canonical `@aztec/wire-types` package is needed.

### No Official Vite/Bundler Plugin

aztec.js cannot be bundled in Vite without `nemi-fi/vite-plugin-aztec`, a community plugin that must be updated with each Aztec release. The plugin handles WASM loading and Web Worker patterns that aztec.js itself does not manage correctly for browser environments.

---

*This document was compiled from direct source code analysis of the aztec-nr (Noir), aztec.js (TypeScript), PXE, wallet-sdk, TXE, and CLI codebases on the v4 branch. All claims were cross-verified against actual implementations. Ecosystem patterns from 30+ external repositories (Wonderland standards, wallet projects, DeFi protocols, identity systems) informed practical guidance and workarounds throughout.*

**Companion documents:**
- `aztec-ecosystem-patterns-book.md` -- Real-world patterns from 15+ ecosystem teams
- `defi-wonderland-reference.md` -- Deep dive on AIP-20/721/4626 standards
- `wallet-ecosystem-reference.md` -- Deep dive on wallet ecosystem and PXE optimization
