use dep::private_kernel_lib::{
    PaddedSideEffects, PrivateKernelResetCircuitPrivateInputs, PrivateKernelResetHints,
};
use dep::types::{
    constants::{
        MAX_KEY_VALIDATION_REQUESTS_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIERS_PER_TX,
        MAX_PRIVATE_LOGS_PER_TX,
    },
    PrivateKernelCircuitPublicInputs,
};
use types::abis::private_kernel_data::PrivateKernelDataWithoutPublicInputs;

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

fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs, // Separated from the public inputs, because those are passed-in via call_data.
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
