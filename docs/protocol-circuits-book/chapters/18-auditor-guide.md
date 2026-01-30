# Chapter 18: Auditor's Guide to Protocol Circuits

Security-focused guidance for auditing Aztec protocol circuits,
with code examples and common vulnerability patterns.

## Security Architecture Overview

The protocol's security relies on a chain of constrained validations:

```
User Input -> App Circuit -> Kernels -> Rollups -> L1
                  |             |          |
                  v             v          v
             App proves   Kernel proves  Rollup proves
             correct exec correct accum  correct agg
```

**Key principle**: Each circuit validates its inputs and constrains
its outputs. Missing validation lets malicious data propagate.

## Critical Files to Review

### Private Kernel Validation

```
noir-projects/.../private-kernel-lib/src/
  components/
    private_call_data_validator.nr
    private_kernel_circuit_output_validator.nr
  accumulated_data/
    assert_array_prepended.nr
    assert_array_appended.nr
  reset/.../validate_squashable_note_hash_nullifier_pair.nr
```

### Hash Functions and Siloing

```
noir-projects/noir-protocol-circuits/crates/types/src/
    hash.nr                                  <- Siloing, nullifier computation
```

## Code Deep Dive: Private Call Validation

The `PrivateCallDataValidator` is security-critical. Here's the actual code:

### First Call Validation (Init)

```noir
// From: private_call_data_validator.nr

/// Called by the Init circuit.
pub fn validate_as_first_call(
    self,
    tx_request: TxRequest,
    protocol_contracts: ProtocolContracts,
    first_nullifier_hint: Field,
    claimed_revertible_counter: u32,
) {
    self.validate_common(
        true /* is_first_function_call */,
        protocol_contracts,
        claimed_revertible_counter,
    );

    // There must be at least one nullifier for the private execution,
    // which is used to compute note hash nonces.
    assert(!first_nullifier_hint.is_empty(), "first_nullifier_hint cannot be empty");

    self.validate_against_tx_request(tx_request);

    // Validate properties specific to the first call.
    let this_call = self.data.public_inputs;

    // The first function call has no caller, so msg_sender must be the "null" address.
    assert_eq(
        this_call.call_context.msg_sender,
        NULL_MSG_SENDER_CONTRACT_ADDRESS,
        "Users cannot set msg_sender in first call",
    );

    // The first function call in a tx cannot be static.
    assert_eq(
        this_call.call_context.is_static_call,
        false,
        "First call in a tx cannot be static",
    );

    // Counters 0 and 1 are reserved: counter 0 is unused, counter 1 is for the protocol nullifier.
    assert(
        this_call.start_side_effect_counter > 1,
        "start_side_effect_counter must be greater than 1",
    );
}
```

**Security considerations:**
1. `first_nullifier_hint` cannot be empty - prevents nonce collision
2. `msg_sender` must be null for first call - prevents impersonation
3. First call cannot be static - prevents useless transactions
4. Counter must be > 1 - reserves counters 0 and 1 for protocol

### Transaction Request Validation

```noir
// From: private_call_data_validator.nr

/// Validates that the first private call matches the tx_request (user's intent).
fn validate_against_tx_request(self, tx_request: TxRequest) {
    let this_call = self.data.public_inputs;
    
    assert_eq(
        tx_request.origin,
        this_call.call_context.contract_address,
        "contract address does not match origin",
    );
    assert_eq(
        tx_request.function_data.selector,
        this_call.call_context.function_selector,
        "function_selector in call_context does not match the value in tx_request",
    );
    assert(
        tx_request.function_data.is_private,
        "tx_request does not indicate the first function is private",
    );
    assert_eq(
        tx_request.args_hash,
        this_call.args_hash,
        "args_hash in private call does not match the value in tx_request",
    );
    assert_eq(
        tx_request.tx_context,
        this_call.tx_context,
        "tx_context in private call does not match the value in tx_request",
    );
}
```

**Security considerations:**
- All 5 fields must match exactly
- Prevents executing different code than user requested
- `args_hash` check prevents argument manipulation

### Static Call Enforcement

```rust
// From: private_call_data_validator.nr

fn validate_for_static_call(self) {
    let call = self.data.public_inputs;

    // Claimed lengths must be zero
    assert_eq(call.note_hashes.length, 0,
        "note_hashes must be empty for static calls");
    assert_eq(call.nullifiers.length, 0,
        "nullifiers must be empty for static calls");
    assert_eq(call.l2_to_l1_msgs.length, 0,
        "l2_to_l1_msgs must be empty for static calls");
    assert_eq(call.private_logs.length, 0,
        "private_logs must be empty for static calls");
    assert_eq(call.contract_class_logs_hashes.length, 0,
        "contract_class_logs must be empty");

    // All nested calls must also be static
    call.private_call_requests.for_each(|req| {
        assert_eq(req.call_context.is_static_call, true,
            "nested private call must be static");
    });
    call.public_call_requests.for_each(|req| {
        assert_eq(req.inner.is_static_call, true,
            "nested public call must be static");
    });
}
```

**Security considerations:**
- Static calls must produce NO state changes
- Nested calls must also be static (prevents bypassing)
- Only checks `length`, not array contents (optimization)

## Code Deep Dive: Array Validation

Array validation is where many subtle bugs can occur.

### The Scoping Pattern

```rust
// From: assert_array_appended.nr

/// Validates source items are appended and scoped.
pub fn assert_array_appended_and_scoped<T, N, M>(
    dest: ClaimedLengthArray<Scoped<T>, N>,
    source: ClaimedLengthArray<T, M>,
    num_prepended_items: u32,
    contract_address: AztecAddress,
)
where
    T: Empty,
{
    std::static_assert(M <= N, "Source array larger than dest array");

    source.for_each_i(|source_item, i| {
        let dest_item = dest.array[num_prepended_items + i];
        assert_eq(dest_item.inner, source_item, "source item does not append to dest");
        assert_eq(
            dest_item.contract_address,
            contract_address,
            "propagated contract address does not match",
        );
    });

    assert_eq(num_prepended_items + source.length, dest.length, "Length mismatch");
}
```

**What this validates:**
1. Each source item appears in dest at correct position
2. Each item is tagged with correct contract address
3. Total length is correct

**What this does NOT validate:**
- Items beyond `dest.length` (intentional optimization)
- Those are validated later in the Tail circuit

### The Delayed Validation Pattern

This comment from the codebase explains a critical optimization:

```rust
// From: assert_array_appended.nr

// A malicious user could try to sneak-in nonempty items
// after dest.length. However, in the next kernel iteration,
// we copy from the starting dest.length position, so we
// overwrite any malicious items. If this is the last
// kernel iteration, the tail circuit iterates over `dest`
// and asserts everything beyond dest.length is empty.
```

**Auditor note**: Verify the Tail circuit actually performs this check!

## Code Deep Dive: Nullifier Squashing

Squashing removes transient note-nullifier pairs. This is security-critical:

```rust
// From: validate_squashable_note_hash_nullifier_pair.nr

pub fn validate_squashable_note_hash_nullifier_pair(
    note_hash: Scoped<Counted<NoteHash>>,
    nullifier: Scoped<Counted<Nullifier>>,
    split_counter: u32,
) {
    // 1. Nullifier must reference this note hash
    assert_eq(
        note_hash.innermost(),
        nullifier.innermost().note_hash,
        "note hash does not match"
    );

    // 2. Same contract
    assert_eq(
        note_hash.contract_address,
        nullifier.contract_address,
        "contract address mismatch"
    );

    // 3. Nullifier created after note hash
    assert(
        nullifier.counter() > note_hash.counter(),
        "cannot nullify note created after"
    );

    // 4. Revertibility must be consistent
    if nullifier.counter() >= split_counter {
        assert(
            note_hash.counter() >= split_counter,
            "non-revertible note + revertible nullifier"
        );
    }
}
```

**Security considerations:**
1. **Value match**: Nullifier must actually reference this note hash
2. **Contract match**: Same contract must own both (prevents cross-contract attacks)
3. **Counter ordering**: Can't nullify something that doesn't exist yet
4. **Revertibility**: Non-revertible notes can't be squashed with revertible nullifiers

**Why check #4 matters**: If a non-revertible note hash is squashed with a revertible nullifier, and the transaction reverts, the note hash would be lost (it was squashed) but should have been kept (it was non-revertible).

## Code Deep Dive: Siloing

Siloing prevents cross-contract note/nullifier collisions:

```noir
// From: hash.nr

pub fn compute_siloed_nullifier(
    contract_address: AztecAddress,
    nullifier: Field
) -> Field {
    poseidon2_hash_with_separator(
        [contract_address.to_field(), nullifier],
        DOM_SEP__SILOED_NULLIFIER,
    )
}

pub fn silo_nullifier(nullifier: Scoped<Counted<Nullifier>>) -> Field {
    let value = nullifier.innermost().value;
    if nullifier.contract_address.is_zero() {
        value // Return `value` instead of 0 because an already-siloed nullifier's
              // contract address is zero.
    } else {
        compute_siloed_nullifier(nullifier.contract_address, value)
    }
}
```

**Security considerations:**
- Uses domain separator (`DOM_SEP__SILOED_NULLIFIER`) to prevent collisions
- Zero contract address means already siloed (don't double-silo)
- Returns value unchanged for pre-siloed nullifiers

## Code Deep Dive: Output Validation

The output validator ensures the composer generated correct outputs:

```noir
// From: private_kernel_circuit_output_validator.nr

fn validate_propagated_from_previous_kernel(
    self,
    previous_kernel: PrivateKernelCircuitPublicInputs,
) {
    // Validate constants propagated unchanged
    assert_eq(self.output.constants, previous_kernel.constants, "mismatch constants");

    // Validate arrays are correctly prepended
    assert_array_prepended(
        self.output.end.note_hashes,
        previous_kernel.end.note_hashes,
    );
    assert_array_prepended(
        self.output.end.nullifiers,
        previous_kernel.end.nullifiers,
    );
    // ... more arrays ...

    // Private call stack excludes the top item (the call we just processed)
    assert_array_prepended_up_to_some_length(
        self.output.end.private_call_stack,
        previous_kernel.end.private_call_stack,
        previous_kernel.end.private_call_stack.length - 1,
    );
}
```

**Security considerations:**
- All arrays from previous kernel must be prepended exactly
- Call stack length decreases by 1 (we popped the current call)
- Constants must be unchanged (prevents mid-transaction manipulation)

## Common Vulnerability Patterns

### 1. Missing Array Bounds Check

```noir
// VULNERABLE: No length validation
fn process_array(arr: [Field; N]) {
    for i in 0..N {
        process(arr[i]);  // Processes garbage beyond actual length
    }
}

// SECURE: Uses claimed length
fn process_array(arr: ClaimedLengthArray<Field, N>) {
    arr.for_each(|item| {
        process(item);  // Only processes valid items
    });
}
```

### 2. Missing Contract Address Scoping

```noir
// VULNERABLE: Items not scoped
fn propagate(dest: &mut [NoteHash], source: [NoteHash]) {
    for i in 0..source.len() {
        dest[i] = source[i];  // No contract address!
    }
}

// SECURE: Items scoped with contract address
fn propagate(dest: &mut [Scoped<NoteHash>], source: [NoteHash], contract: AztecAddress) {
    for i in 0..source.len() {
        dest[i] = Scoped { inner: source[i], contract_address: contract };
    }
}
```

### 3. Missing Counter Validation

```noir
// VULNERABLE: Counters not validated
fn add_note_hash(note_hash: NoteHash) {
    accumulated.push(note_hash);  // Counter could be anything!
}

// SECURE: Counter validated
fn add_note_hash(note_hash: Counted<NoteHash>, start: u32, end: u32) {
    assert(note_hash.counter > start, "counter too low");
    assert(note_hash.counter < end, "counter too high");
    accumulated.push(note_hash);
}
```

### 4. Unconstrained Output Not Validated

```noir
// VULNERABLE: Trusting unconstrained output
unconstrained fn compute_output(input) -> Output {
    // Complex computation...
    output
}

fn main(input) -> Output {
    let output = compute_output(input);
    output  // No validation! Prover could return anything.
}

// SECURE: Validate unconstrained output
fn main(input) -> Output {
    let output = compute_output(input);  // Unconstrained
    validate_output(input, output);       // Constrained validation
    output
}
```

## Checklist for Auditors

### For Each Circuit

- [ ] Are all inputs validated before use?
- [ ] Are all outputs constrained (not just generated)?
- [ ] Are proof verifications present and using correct VK indices?
- [ ] Are array lengths validated against bounds?
- [ ] Are arrays beyond claimed length checked to be empty (at appropriate point)?

### For Kernel Circuits

- [ ] Are side effects properly scoped with contract addresses?
- [ ] Are counters validated for uniqueness and bounds?
- [ ] Is the call stack correctly managed (pop/push)?
- [ ] Are static call restrictions enforced?
- [ ] Is the msg_sender correctly propagated/validated?

### For Rollup Circuits

- [ ] Is state continuity validated (end == next start)?
- [ ] Are VK indices checked against allowed sets?
- [ ] Is greedy tree structure validated?
- [ ] Are blob accumulations correct?

### For Hash Functions

- [ ] Are domain separators used correctly?
- [ ] Are all inputs included in the hash?
- [ ] Is siloing applied consistently?

## Test Vectors

When auditing, create test vectors for:

1. **Boundary conditions**: Empty arrays, max-length arrays
2. **Malicious inputs**: Garbage after claimed length, wrong contract addresses
3. **Counter attacks**: Duplicate counters, out-of-order counters
4. **Cross-contract attacks**: Same nullifier from different contracts
5. **Revertibility attacks**: Non-revertible/revertible mixing

## Tools and Commands

### Running Tests

```bash
cd noir-projects/noir-protocol-circuits

# Run all tests
./scripts/test.sh

# Run specific crate tests
nargo test --package private-kernel-lib

# Run with verbose output
nargo test --package private-kernel-lib --show-output
```

### Generating Flamegraphs

```bash
# Profile a circuit
./scripts/flamegraph.sh private-kernel-init
```

### Checking Constraint Counts

```bash
# Get constraint count for a circuit
nargo info --package private-kernel-init
```

\newpage
