use ::private_kernel_lib::{
    PaddedSideEffects, PrivateKernelResetCircuitPrivateInputs, PrivateKernelResetHints,
};
use ::types::{
    constants::{
        MAX_KEY_VALIDATION_REQUESTS_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIERS_PER_TX,
        MAX_PRIVATE_LOGS_PER_TX,
    },
    PrivateKernelCircuitPublicInputs,
};
use types::abis::private_kernel_data::PrivateKernelDataWithoutPublicInputs;

// Note: We generate lots of variants of this reset circuit.
// The variants are simply re-compilations of this circuit but with different global constants.
// The global constants that we re-configure are mostly related to array lengths: the shorter an
// array, the fewer iterations over that array, and hence fewer constraints.
// When a user requests for a particular tx to be proven, we have typescript orchestration code which:
// simulates the many private functions of the tx; collects all nonempty side-effects emitted by those
// functions; and then intelligently figures out which reset circuit variant has the smallest array
// lengths that would still have capacity to accommodate and iterate-over all of those side-effects.
//
// See `noir-projects/noir-protocol-circuits/scripts/generate_variants.js` to understand:
// - how the circuit variants are generated;
// - the configuration parameters for the many variants;
// - where the noir source code for the generated variants is stored.
//
// The globals listed here are those which can be reconfigured:

// The length of the hints array used to validate read requests for pending note hashes.
global NOTE_HASH_PENDING_READ_HINTS_LEN: u32 = MAX_NOTE_HASH_READ_REQUESTS_PER_TX;
// The actual number of iterations for verifying and removing read requests for pending note hashes.
global NOTE_HASH_PENDING_READ_AMOUNT: u32 = MAX_NOTE_HASH_READ_REQUESTS_PER_TX;
// These two values may differ because an array cannot be empty.
// If no read requests are required, `_READ_AMOUNT` will be 0, while the hints array length will still be > 0.
// The same rule applies to the following variables.

// The length of the hints array used to validate read requests for settled note hashes.
global NOTE_HASH_SETTLED_READ_HINTS_LEN: u32 = MAX_NOTE_HASH_READ_REQUESTS_PER_TX;
// The actual number of iterations for verifying and removing read requests for settled note hashes.
global NOTE_HASH_SETTLED_READ_AMOUNT: u32 = MAX_NOTE_HASH_READ_REQUESTS_PER_TX;

// The length of the hints array used to validate read requests for pending nullifiers.
global NULLIFIER_PENDING_READ_HINTS_LEN: u32 = MAX_NULLIFIER_READ_REQUESTS_PER_TX;
// The actual number of iterations for verifying and removing read requests for pending nullifiers.
global NULLIFIER_PENDING_READ_AMOUNT: u32 = MAX_NULLIFIER_READ_REQUESTS_PER_TX;

// The length of the hints array used to validate read requests for settled nullifiers.
global NULLIFIER_SETTLED_READ_HINTS_LEN: u32 = MAX_NULLIFIER_READ_REQUESTS_PER_TX;
// The actual number of iterations for verifying and removing read requests for settled nullifiers.
global NULLIFIER_SETTLED_READ_AMOUNT: u32 = MAX_NULLIFIER_READ_REQUESTS_PER_TX;

// The length of the hints array used to validate key validation requests.
global KEY_VALIDATION_HINTS_LEN: u32 = MAX_KEY_VALIDATION_REQUESTS_PER_TX;
// The actual number of iterations for verifying and removing key validation requests.
global KEY_VALIDATION_AMOUNT: u32 = MAX_KEY_VALIDATION_REQUESTS_PER_TX;

// The length of the hints array used to squash transient data.
global TRANSIENT_DATA_SQUASHING_HINTS_LEN: u32 = MAX_NULLIFIERS_PER_TX;
// The actual number of iterations for squashing transient data.
global TRANSIENT_DATA_SQUASHING_AMOUNT: u32 = MAX_NULLIFIERS_PER_TX;

// The number of note hashes to silo.
global NOTE_HASH_SILOING_AMOUNT: u32 = MAX_NOTE_HASHES_PER_TX;
// The number of nullifiers to silo.
global NULLIFIER_SILOING_AMOUNT: u32 = MAX_NULLIFIERS_PER_TX;
// The number of private logs to silo.
global PRIVATE_LOG_SILOING_AMOUNT: u32 = MAX_PRIVATE_LOGS_PER_TX;

/*
 * Notice: The previous kernel's public inputs are always returned from that circuit as `return_data` and passed-into
 * the next kernel via `call_data(0)`.
 * Behind the scenes, barretenberg matches the previous kernel proof's `return_data` commitment with this kernel circuit's 
 * `call_data(0)` commitment (see `chonk.cpp` and `chonk_verifier.cpp`).
 */
fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs, // Separated from the previous kernel public inputs, because those are passed-in via databus call_data. Recombined within the circuit.
    previous_kernel_public_inputs: call_data(0) PrivateKernelCircuitPublicInputs,
    padded_side_effects: PaddedSideEffects,
    hints: PrivateKernelResetHints<NOTE_HASH_PENDING_READ_HINTS_LEN, NOTE_HASH_SETTLED_READ_HINTS_LEN, NULLIFIER_PENDING_READ_HINTS_LEN, NULLIFIER_SETTLED_READ_HINTS_LEN, KEY_VALIDATION_HINTS_LEN, TRANSIENT_DATA_SQUASHING_HINTS_LEN>,
) -> return_data PrivateKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelResetCircuitPrivateInputs::new(
        previous_kernel,
        previous_kernel_public_inputs,
        padded_side_effects,
        hints,
    );

    private_inputs
        .execute::<NOTE_HASH_PENDING_READ_AMOUNT, NOTE_HASH_SETTLED_READ_AMOUNT, NULLIFIER_PENDING_READ_AMOUNT, NULLIFIER_SETTLED_READ_AMOUNT, KEY_VALIDATION_AMOUNT, TRANSIENT_DATA_SQUASHING_AMOUNT, NOTE_HASH_SILOING_AMOUNT, NULLIFIER_SILOING_AMOUNT, PRIVATE_LOG_SILOING_AMOUNT>()
}
