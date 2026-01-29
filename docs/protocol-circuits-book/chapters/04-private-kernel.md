# Chapter 4: Private Kernel Circuits

## What is a "Kernel"?

In operating systems, the "kernel" is the core that manages everything - it's the middleman between applications and hardware.

In Aztec, the **kernel circuits** play a similar role: they're the middleman between your application code and the rollup. The kernel:

1. **Validates** that your application ran correctly
2. **Accumulates** all the side effects (note hashes, nullifiers, etc.)
3. **Enforces** protocol rules (correct scoping, proper ordering)
4. **Produces** a proof that can be verified without seeing private inputs

Think of it as a "wrapper" around your transaction that ensures everything follows the rules.

## Purpose

The private kernel circuits validate private function execution and accumulate side effects. They run on the user's device after each private function call, building up a proof that all private execution was correct.

This is the **only** circuit family that truly requires zero-knowledge. Other circuits use SNARKs for succinctness, but the private kernel must **hide**:
- Which contract functions were executed
- The user's address
- The function inputs and outputs

## The Kernel Circuit Family

There are five private kernel circuit variants:

| Circuit | When Used | Purpose |
|---------|-----------|---------|
| **Init** | First private call | Initialize kernel state |
| **Inner** | Subsequent calls | Process additional calls |
| **Reset** | Optimization pass | Squash transient data |
| **Tail** | Private-only TX end | Finalize for rollup |
| **TailToPublic** | TX with public calls | Prepare for public phase |

## Private Kernel Init

The Init circuit processes the **first** private function call in a transaction.

### Inputs

```
Private Kernel Init Inputs
+------------------------------------------+
| tx_request: The transaction request      |
| private_call: Data from the first call   |
|   - call_stack_item: Function + args     |
|   - proof: App circuit proof             |
|   - contract_data: Contract information  |
+------------------------------------------+
```

### Validation

The Init circuit validates:

1. **Transaction Request Match**
   - The called function matches what was requested
   - The arguments hash matches
   - The origin matches the account contract

2. **Call Context**
   - This is marked as the first call (no caller)
   - The function is marked as private
   - Static call restrictions are enforced

3. **Proof Verification**
   - The app circuit proof is valid
   - The verification key is in the allowed set

### Output Generation

After validation, the circuit generates outputs by:

1. **Scoping Side Effects**
   - Each note hash, nullifier, log, etc. is tagged with the contract address
   - This prevents contracts from impersonating other contracts

2. **Initializing Accumulators**
   - Empty arrays are populated with the first call's side effects
   - A protocol nullifier may be added (prevents replay attacks)

3. **Setting Up Call Stack**
   - Any nested private call requests are added to the stack (in reverse order)

### Example Flow

```
Transaction: Transfer 10 tokens privately

1. User calls token.transfer(recipient, 10)
2. PXE executes transfer() -> produces app proof
3. Init kernel receives:
   - tx_request: {origin: user, function: transfer, args: [recipient, 10]}
   - private_call: {proof, note_hashes: [new_note], nullifiers: [old_note]}
4. Init kernel validates and outputs:
   - note_hashes: [Scoped(new_note, token_address)]
   - nullifiers: [protocol_nullifier, Scoped(old_note, token_address)]
   - private_call_stack: [] (no nested calls)
```

## Private Kernel Inner

The Inner circuit processes **subsequent** private function calls.

### Inputs

```
Private Kernel Inner Inputs
+------------------------------------------+
| previous_kernel: Output from prev kernel |
| private_call: Data from the current call |
+------------------------------------------+
```

### Processing

The Inner circuit:

1. **Verifies Previous Kernel Proof**
   - Ensures the chain of proofs is valid
   - Checks verification key membership

2. **Pops Call from Stack**
   - Takes the top call request from `private_call_stack`
   - Validates it matches the current `private_call`

3. **Validates Current Call**
   - Same validations as Init (proof, context, etc.)
   - Additionally validates the `msg_sender` matches the caller

4. **Accumulates Data**
   - **Prepends** previous kernel's accumulated data
   - **Appends** current call's data (scoped with contract address)

### Data Accumulation Example

```
After Init:
  note_hashes: [A]
  nullifiers: [N1]
  
After Inner (call 2):
  note_hashes: [A, B, C]      // B, C from call 2
  nullifiers: [N1, N2]        // N2 from call 2
  
After Inner (call 3):
  note_hashes: [A, B, C, D]   // D from call 3
  nullifiers: [N1, N2, N3]    // N3 from call 3
```

The Inner circuit can run multiple times as the call stack grows and shrinks.

## Private Kernel Reset

The Reset circuit is an **optimization pass** that can run one or more times before finalization.

### Purpose

1. **Squash Transient Data**
   - If a note is created and nullified in the same transaction, both can be removed
   - This saves on-chain data and tree insertions

2. **Validate Read Requests**
   - Prove that note hash read requests point to existing notes
   - Prove that nullifier read requests reference non-existent nullifiers

3. **Validate Key Requests**
   - Verify that key validation requests are correct

4. **Prepare for Tail**
   - Optionally silo note hashes and nullifiers (add contract address to hash)
   - Sort side effects by counter
   - Pad arrays to fixed sizes

### Transient Note Squashing

```
Before Reset:
  note_hashes: [A, B, C, D]
  nullifiers: [N1, N_B, N2]   // N_B nullifies note B
  
Reset identifies: B and N_B are transient pair

After Reset:
  note_hashes: [A, C, D]      // B removed
  nullifiers: [N1, N2]        // N_B removed
```

This optimization is crucial for complex transactions that create temporary notes.

### Siloing

Siloing adds the contract address to hashes, preventing cross-contract collisions:

```
Siloed Note Hash = poseidon2([contract_address, note_hash])
Siloed Nullifier = poseidon2([contract_address, nullifier])
```

After siloing, notes from different contracts cannot be confused.

## Private Kernel Tail

The Tail circuit **finalizes** a private-only transaction (no public calls).

### Processing

1. **Verify Previous Kernel**
   - Must be a valid Reset kernel proof
   - Private call stack must be empty

2. **Sort and Transform**
   - Sort L2-to-L1 messages by counter
   - Sort contract class logs by counter
   - Transform all data to rollup format (remove counters, scopes where appropriate)

3. **Produce Final Output**
   - `PrivateToRollupKernelCircuitPublicInputs`
   - Ready for the hiding kernel and rollup circuits

### Data Transformation

```
Before Tail:
  note_hashes: [Scoped<Counted<NoteHash>>]
  nullifiers: [Scoped<Counted<Nullifier>>]
  
After Tail:
  note_hashes: [Field]        // Just the hash values
  nullifiers: [Field]         // Just the nullifier values
```

The tail strips metadata needed for kernel processing but not for rollup.

## Private Kernel Tail to Public

The TailToPublic circuit finalizes transactions that **include public function calls**.

### Key Difference from Tail

The output must be split into:
- **Non-revertible** data: Side effects from setup phase (cannot be undone)
- **Revertible** data: Side effects from app logic (can be reverted if AVM fails)

### Splitting Logic

```
min_revertible_side_effect_counter = X

Side effects with counter < X  -> non_revertible_accumulated_data
Side effects with counter >= X -> revertible_accumulated_data
```

This split is essential for atomic fee payment - even if app logic fails, fee payment succeeds.

### Output

```
PrivateToPublicKernelCircuitPublicInputs
+------------------------------------------+
| non_revertible_accumulated_data:         |
|   - note_hashes, nullifiers, logs, ...   |
| revertible_accumulated_data:             |
|   - note_hashes, nullifiers, logs, ...   |
| public_call_requests:                    |
|   - setup_calls                          |
|   - app_logic_calls                      |
|   - teardown_calls                       |
+------------------------------------------+
```

## Side Effects Accumulated

Throughout kernel processing, the following are accumulated:

| Side Effect | Description |
|-------------|-------------|
| `note_hashes` | Commitments to new private notes |
| `nullifiers` | Markers invalidating notes |
| `l2_to_l1_msgs` | Messages to Ethereum |
| `private_logs` | Encrypted log data |
| `contract_class_logs_hashes` | Contract deployment logs |
| `public_call_requests` | Queued public function calls |

Each is wrapped with:
- **Counter**: Ordering within the transaction
- **Contract Address**: Which contract emitted it (scope)

## Verification Key Tree

Each kernel circuit variant has a known verification key. The protocol maintains a **VK Tree** containing all valid verification keys:

```
VK Tree
+------------------------------------------+
| Index 0: Private Kernel Init VK          |
| Index 1: Private Kernel Inner VK         |
| Index 2: Private Kernel Reset VK         |
| Index 3: Private Kernel Tail VK          |
| ...                                      |
+------------------------------------------+
```

When verifying a previous kernel proof, the circuit checks:
1. The VK is valid (proof verifies)
2. The VK exists in the VK tree at an allowed index

This prevents malicious proofs using fake verification keys.

## Real Code: Private Call Validation

Here's actual validation code from `private_call_data_validator.nr`:

### First Call Validation

```rust
/// Called by the Init circuit.
pub fn validate_as_first_call(
    self,
    tx_request: TxRequest,
    protocol_contracts: ProtocolContracts,
    first_nullifier_hint: Field,
    claimed_revertible_counter: u32,
) {
    self.validate_common(true, protocol_contracts, claimed_revertible_counter);

    // Must have a nullifier for computing nonces
    assert(!first_nullifier_hint.is_empty(), "first_nullifier_hint cannot be empty");

    self.validate_against_tx_request(tx_request);

    let this_call = self.data.public_inputs;

    // First call has no caller
    assert_eq(
        this_call.call_context.msg_sender,
        NULL_MSG_SENDER_CONTRACT_ADDRESS,
        "Users cannot set msg_sender in first call",
    );

    // First call cannot be static (would make entire tx a no-op)
    assert_eq(
        this_call.call_context.is_static_call,
        false,
        "First call in a tx cannot be static",
    );

    // Counters 0 and 1 are reserved
    assert(
        this_call.start_side_effect_counter > 1,
        "start_side_effect_counter must be greater than 1",
    );
}
```

### Transaction Request Matching

```rust
/// Validates that the first private call matches the tx_request.
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
        "function_selector does not match",
    );
    assert(
        tx_request.function_data.is_private,
        "tx_request does not indicate the first function is private",
    );
    assert_eq(
        tx_request.args_hash,
        this_call.args_hash,
        "args_hash does not match",
    );
}
```

### Call Request Validation (Inner)

```rust
/// Validates the call request matches the current private call.
fn validate_against_call_request(self, request: PrivateCallRequest) {
    let this_call = self.data.public_inputs;
    
    assert_eq(
        request.call_context,
        this_call.call_context,
        "call_context does not match call request",
    );
    assert_eq(
        request.args_hash,
        this_call.args_hash,
        "args_hash does not match call request",
    );
    assert_eq(
        request.returns_hash,
        this_call.returns_hash,
        "returns_hash does not match call request",
    );
    assert_eq(
        request.start_side_effect_counter,
        this_call.start_side_effect_counter,
        "start_side_effect_counter does not match",
    );
    assert_eq(
        request.end_side_effect_counter,
        this_call.end_side_effect_counter,
        "end_side_effect_counter does not match",
    );

    if this_call.call_context.is_static_call {
        self.validate_for_static_call();
    }
}
```

These validation functions ensure that:
- The executed code matches what the user requested
- Call context is properly propagated
- Side effect counters are correctly bounded
- Static calls produce no state changes

\newpage
