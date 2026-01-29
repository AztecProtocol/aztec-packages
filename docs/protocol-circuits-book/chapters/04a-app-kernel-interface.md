# Chapter 4a: The App-to-Kernel Interface

This chapter explains how application circuits (private functions written by developers) interface with the kernel circuits. Understanding this interface is crucial for both developers and auditors.

## Overview

When a developer writes a private function in Aztec.nr, their code doesn't directly interact with kernel circuits. Instead:

1. **Developer writes** a private function using the `context` object
2. **Compiler generates** an app circuit with `PrivateCircuitPublicInputs`
3. **PXE executes** the function and generates a proof
4. **Kernel receives** the proof wrapped in `PrivateCallData`
5. **Kernel validates** the proof and accumulates the side effects

```
Developer Code       Generated Circuit       Kernel Circuit
--------------       -----------------       --------------
                     
#[private]           PrivateCircuit-         PrivateCallData
fn transfer() {      PublicInputs            +--------------+
  push_note(h);      +---------------+       | public_inputs|
  emit_null(n);      | call_context  | proof | vk           |
}             ---->  | args_hash     | ----> | vk_hints     |
                     | note_hashes   |       +--------------+
                     | nullifiers    |              |
                     +---------------+              v
                                           Kernel validates
```

## The PrivateContext Object

Every private function has access to a `context` object of type `PrivateContext`. This is automatically injected by the `#[private]` macro.

### What the Context Provides

```rust
/// The main interface between a private function and Aztec.
pub struct PrivateContext {
    // Contextual Data
    pub inputs: PrivateContextInputs,
    
    // Side Effect Tracking
    pub side_effect_counter: u32,
    pub min_revertible_side_effect_counter: u32,
    
    // Function Call Data
    pub args_hash: Field,
    pub return_hash: Field,
    
    // Accumulated Side Effects
    pub note_hashes: BoundedVec<Counted<NoteHash>, MAX>,
    pub nullifiers: BoundedVec<Counted<Nullifier>, MAX>,
    pub l2_to_l1_msgs: BoundedVec<Counted<L2ToL1Message>, MAX>,
    pub private_logs: BoundedVec<Counted<PrivateLogData>, MAX>,
    
    // Call Requests
    pub private_call_requests: BoundedVec<PrivateCallRequest, MAX>,
    pub public_call_requests: BoundedVec<Counted<PublicCallRequest>, MAX>,
    
    // Validation Requests
    pub note_hash_read_requests: BoundedVec<...>,
    pub nullifier_read_requests: BoundedVec<...>,
    pub key_validation_requests: BoundedVec<...>,
    // ... more fields
}
```

### How Developers Use It

```rust
// Example private function
#[private]
fn transfer(recipient: AztecAddress, amount: Field) {
    // Read current state
    let sender = context.msg_sender();
    let sender_note = storage.balances.at(sender).get_note();
    
    // Nullify the old note (marks it as spent)
    storage.balances.at(sender).nullify_note(sender_note);
    
    // Create new notes
    let change = sender_note.amount - amount;
    storage.balances.at(sender).create_note(change);
    storage.balances.at(recipient).create_note(amount);
    
    // Behind the scenes, these call:
    // - context.push_nullifier(...)
    // - context.push_note_hash(...)
}
```

### Side Effect Emission

When developers interact with storage, the context accumulates side effects:

```rust
// What the developer writes:
storage.balances.at(recipient).create_note(amount);

// What happens internally:
impl<T> PrivateContext {
    pub fn push_note_hash(&mut self, note_hash: Field) {
        // Increment counter
        let counter = self.side_effect_counter;
        self.side_effect_counter += 1;
        
        // Add to accumulated note hashes
        self.note_hashes.push(
            Counted::new(NoteHash::new(note_hash), counter)
        );
    }
    
    pub fn push_nullifier(&mut self, nullifier: Field) {
        let counter = self.side_effect_counter;
        self.side_effect_counter += 1;
        
        self.nullifiers.push(
            Counted::new(Nullifier::new(nullifier, 0), counter)
        );
    }
}
```

## PrivateCircuitPublicInputs

At the end of function execution, the context is converted to `PrivateCircuitPublicInputs` - the standardized output format that kernel circuits expect.

### Structure

```rust
pub struct PrivateCircuitPublicInputs {
    // Call Context
    pub call_context: CallContext,
    pub args_hash: Field,
    pub returns_hash: Field,
    
    // Execution Context
    pub anchor_block_header: BlockHeader,
    pub tx_context: TxContext,
    
    // Counter Bounds
    pub start_side_effect_counter: u32,
    pub end_side_effect_counter: u32,
    
    // Revertibility
    pub min_revertible_side_effect_counter: u32,
    pub is_fee_payer: bool,
    pub include_by_timestamp: u64,
    
    // Validation Requests
    pub note_hash_read_requests: ClaimedLengthArray<...>,
    pub nullifier_read_requests: ClaimedLengthArray<...>,
    pub key_validation_requests: ClaimedLengthArray<...>,
    
    // Call Requests
    pub private_call_requests: ClaimedLengthArray<..., 8>,
    pub public_call_requests: ClaimedLengthArray<..., 16>,
    pub public_teardown_call_request: PublicCallRequest,
    
    // Side Effects (TX Effects)
    pub note_hashes: ClaimedLengthArray<..., 16>,
    pub nullifiers: ClaimedLengthArray<..., 16>,
    pub l2_to_l1_msgs: ClaimedLengthArray<..., 2>,
    pub private_logs: ClaimedLengthArray<..., 16>,
    pub contract_class_logs_hashes: ClaimedLengthArray<..., 1>,
}
```

### Key Fields Explained

**Call Context:**
```rust
pub struct CallContext {
    pub msg_sender: AztecAddress,        // Who initiated
    pub contract_address: AztecAddress,  // Contract
    pub function_selector: FunctionSelector,
    pub is_static_call: bool,            // Read-only?
}
```

**Counted Items:**
Every side effect has a counter for ordering:
```rust
pub struct Counted<T> {
    pub inner: T,
    pub counter: u32,
}
```

**ClaimedLengthArray:**
Fixed-size arrays with a claimed valid length:
```rust
pub struct ClaimedLengthArray<T, N> {
    pub array: [T; N],   // Fixed-size array
    pub length: u32,     // How many items are valid
}
```

## PrivateCallData

The kernel doesn't receive `PrivateCircuitPublicInputs` directly.
It receives `PrivateCallData`, which wraps the public inputs with proof.

### Structure

```rust
pub struct PrivateCallData {
    // The app circuit's public inputs
    pub public_inputs: PrivateCircuitPublicInputs,
    
    // Verification key for the app circuit
    pub vk: ChonkVerificationKey,
    
    // Hints for verification
    pub verification_key_hints: PrivateVerificationKeyHints,
}
```

### Proof Verification

The kernel verifies the app circuit proof:

```rust
impl PrivateCallData {
    pub fn verify(self, is_first_function_call: bool) {
        let proof_type = if is_first_function_call {
            PROOF_TYPE_OINK  // First call uses OINK proof
        } else {
            PROOF_TYPE_HN    // Subsequent calls use Honk proof
        };
        
        // This call adds constraints to recursively verify the proof
        std::verify_proof_with_type(
            self.vk.key,
            [],              // No explicit public inputs (uses databus)
            [],
            self.vk.hash,
            proof_type
        );
    }
}
```

**Why two proof types?**

- **OINK (first call):** No previous kernel proof to fold with
- **Honk (subsequent):** Folds with the previous kernel's proof

## Private Call Requests

When a private function calls another private function,
it creates a `PrivateCallRequest`:

### Structure

```rust
pub struct PrivateCallRequest {
    pub call_context: CallContext,
    pub args_hash: Field,
    pub returns_hash: Field,
    pub start_side_effect_counter: u32,
    pub end_side_effect_counter: u32,
}
```

### How Nested Calls Work

```rust
// Contract A calls Contract B
#[private]
fn function_in_contract_a() {
    // This creates a PrivateCallRequest
    let result = ContractB::at(address_b).some_function(arg1, arg2);
}
```

What happens internally:

1. **Counter allocation:** Parent allocates counter range for child
2. **Request creation:** PrivateCallRequest added to call stack
3. **Child execution:** PXE executes the child function
4. **Kernel processing:** Kernel validates the child's proof

```
Parent Function (counter 10-50)
    |
    +-- Creates PrivateCallRequest {
            args_hash: hash(arg1, arg2),
            start_counter: 20,
            end_counter: 40
        }
    |
    v
Child Function (counter 20-40)
    |
    +-- Executes with counters in [20, 40]
    +-- Returns with returns_hash
```

### Kernel Validation of Nested Calls

The kernel validates that the child matches the request:

```rust
fn validate_against_call_request(
    self,
    request: PrivateCallRequest
) {
    let this_call = self.data.public_inputs;
    
    // Call context must match exactly
    assert_eq(request.call_context, this_call.call_context);
    assert_eq(request.args_hash, this_call.args_hash);
    assert_eq(request.returns_hash, this_call.returns_hash);
    
    // Counter bounds must match
    let start = this_call.start_side_effect_counter;
    let end = this_call.end_side_effect_counter;
    assert_eq(request.start_side_effect_counter, start);
    assert_eq(request.end_side_effect_counter, end);
}
```

## args_hash and returns_hash

### Computing args_hash

Arguments are hashed to create a binding commitment:

```rust
// Developer calls a function with arguments
let result = OtherContract::at(addr).transfer(recipient, amount);

// Behind the scenes:
let args = [recipient.to_field(), amount];
let args_hash = poseidon2_hash(args);

// The call request includes this hash
PrivateCallRequest {
    args_hash,
    // ...
}
```

### Why Hash Arguments?

1. **Binding:** The hash commits to specific arguments
2. **Privacy:** The actual arguments aren't in the request
3. **Verification:** The called function proves it used the right arguments

### Verification Flow

```
Caller                          Callee
------                          ------
args_hash = hash(args)
                    -->
                                receives args
                                computes hash(args)
                                asserts hash == args_hash
```

## Public Call Requests

Private functions can enqueue public function calls:

```rust
pub struct PublicCallRequest {
    pub msg_sender: AztecAddress,
    pub contract_address: AztecAddress,
    pub is_static_call: bool,
    pub calldata_hash: Field,  // Hash of the call data
}
```

### Enqueueing a Public Call

```rust
#[private]
fn private_to_public() {
    // Enqueue a public call
    PublicContract::at(address).public_function(arg1, arg2).enqueue();
}
```

These are processed later by the AVM during public execution.

## The Complete Flow

```
1. Developer writes function using context
                |
                v
2. Compiler generates app circuit
                |
                v
3. PXE executes function
   - Populates context with side effects
   - Generates PrivateCircuitPublicInputs
                |
                v
4. PXE generates proof
   - Creates PrivateCallData with proof
                |
                v
5. Kernel receives PrivateCallData
   - Verifies proof
   - Validates call context
   - Validates against call request (if inner)
   - Scopes side effects with contract address
   - Accumulates into kernel output
                |
                v
6. Process continues for next function
```

## Security Considerations for Auditors

### 1. args_hash Binding

Ensure that:
- The called function actually uses the arguments it claims
- The args_hash is computed correctly
- No argument manipulation between caller and callee

### 2. Counter Bounds

Verify that:
- Counter ranges don't overlap between calls
- All side effects have counters within their function's range
- Counters are strictly increasing

### 3. Call Context Propagation

Check that:
- `msg_sender` is correctly set (parent's contract address)
- `contract_address` matches the called contract
- Static call restrictions are enforced

### 4. Side Effect Scoping

Ensure that:
- Side effects are scoped with the correct contract address
- No cross-contract state manipulation
- Scoping happens in the kernel, not the app

## Summary

| Component | Purpose |
|-----------|---------|
| `PrivateContext` | Developer interface |
| `PrivateCircuitPublicInputs` | App circuit output |
| `PrivateCallData` | Kernel input |
| `PrivateCallRequest` | Nested call info |
| `CallContext` | Call metadata |

The app-to-kernel interface is the boundary where developer code
meets protocol code. Understanding this boundary is essential for:
- Developers: To know what side effects their code produces
- Auditors: To verify the kernel correctly validates app outputs

\newpage
