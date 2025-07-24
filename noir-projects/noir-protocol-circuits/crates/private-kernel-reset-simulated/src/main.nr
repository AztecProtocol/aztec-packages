use dep::private_kernel_lib::{
    PaddedSideEffects, PrivateKernelResetCircuitPrivateInputs, PrivateKernelResetDimensions,
    PrivateKernelResetHints,
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

// The length of the pending read hints array.
global NOTE_HASH_PENDING_READ_HINTS_LEN: u32 = MAX_NOTE_HASH_READ_REQUESTS_PER_TX; // 64
// The number of pending read requests to be verified and reset.
global NOTE_HASH_PENDING_READ_AMOUNT: u32 = MAX_NOTE_HASH_READ_REQUESTS_PER_TX; // 64
// The above two values might be different, because an array can't be empty.
// In the case no read requests are required, number of reads is 0 and the hints array length is larger than 0.
// The same applies to the following variables.

global NOTE_HASH_SETTLED_READ_HINTS_LEN: u32 = MAX_NOTE_HASH_READ_REQUESTS_PER_TX; // 64
global NOTE_HASH_SETTLED_READ_AMOUNT: u32 = MAX_NOTE_HASH_READ_REQUESTS_PER_TX;

global NULLIFIER_PENDING_READ_HINTS_LEN: u32 = MAX_NULLIFIER_READ_REQUESTS_PER_TX; // 64
global NULLIFIER_PENDING_READ_AMOUNT: u32 = MAX_NULLIFIER_READ_REQUESTS_PER_TX;

global NULLIFIER_SETTLED_READ_HINTS_LEN: u32 = MAX_NULLIFIER_READ_REQUESTS_PER_TX;
global NULLIFIER_SETTLED_READ_AMOUNT: u32 = MAX_NULLIFIER_READ_REQUESTS_PER_TX;

global KEY_VALIDATION_HINTS_LEN: u32 = MAX_KEY_VALIDATION_REQUESTS_PER_TX; // 64
global KEY_VALIDATION_AMOUNT: u32 = MAX_KEY_VALIDATION_REQUESTS_PER_TX; // 64

global TRANSIENT_DATA_SQUASHING_HINTS_LEN: u32 = MAX_NULLIFIERS_PER_TX; // 64
global TRANSIENT_DATA_SQUASHING_AMOUNT: u32 = MAX_NULLIFIERS_PER_TX; // 64

global NOTE_HASH_SILOING_AMOUNT: u32 = MAX_NOTE_HASHES_PER_TX; // 64

global NULLIFIER_SILOING_AMOUNT: u32 = MAX_NULLIFIERS_PER_TX; // 64

global PRIVATE_LOG_SILOING_AMOUNT: u32 = MAX_PRIVATE_LOGS_PER_TX; // 32

unconstrained fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs,
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    padded_side_effects: PaddedSideEffects,
    hints: PrivateKernelResetHints<NOTE_HASH_PENDING_READ_HINTS_LEN, NOTE_HASH_SETTLED_READ_HINTS_LEN, NULLIFIER_PENDING_READ_HINTS_LEN, NULLIFIER_SETTLED_READ_HINTS_LEN, KEY_VALIDATION_HINTS_LEN, TRANSIENT_DATA_SQUASHING_HINTS_LEN>,
) -> pub PrivateKernelCircuitPublicInputs {
    let dimensions = PrivateKernelResetDimensions {
        NOTE_HASH_PENDING_READ_AMOUNT: NOTE_HASH_PENDING_READ_AMOUNT,
        NOTE_HASH_SETTLED_READ_AMOUNT: NOTE_HASH_SETTLED_READ_AMOUNT,
        NULLIFIER_PENDING_READ_AMOUNT: NULLIFIER_PENDING_READ_AMOUNT,
        NULLIFIER_SETTLED_READ_AMOUNT: NULLIFIER_SETTLED_READ_AMOUNT,
        KEY_VALIDATION_AMOUNT: KEY_VALIDATION_AMOUNT,
        TRANSIENT_DATA_SQUASHING_AMOUNT: TRANSIENT_DATA_SQUASHING_AMOUNT,
        NOTE_HASH_SILOING_AMOUNT: NOTE_HASH_SILOING_AMOUNT,
        NULLIFIER_SILOING_AMOUNT: NULLIFIER_SILOING_AMOUNT,
        PRIVATE_LOG_SILOING_AMOUNT: PRIVATE_LOG_SILOING_AMOUNT,
    };

    let private_inputs = PrivateKernelResetCircuitPrivateInputs::new(
        previous_kernel,
        previous_kernel_public_inputs,
        padded_side_effects,
        hints,
        dimensions,
    );

    private_inputs.execute()
}
