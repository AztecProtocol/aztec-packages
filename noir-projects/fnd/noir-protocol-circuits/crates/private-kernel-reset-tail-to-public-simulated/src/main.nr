use private_kernel_lib::{
    PaddedSideEffectAmounts, PaddedSideEffects, PrivateKernelResetHints,
    PrivateKernelResetTailToPublicCircuitPrivateInputs,
};
use types::abis::{
    kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
    private_kernel_data::PrivateKernelDataWithoutPublicInputs,
};
use types::{
    constants::{
        MAX_KEY_VALIDATION_REQUESTS_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIERS_PER_TX,
        MAX_PRIVATE_LOGS_PER_TX,
    },
    PrivateKernelCircuitPublicInputs,
};

global NOTE_HASH_PENDING_READ_HINTS_LEN: u32 = MAX_NOTE_HASH_READ_REQUESTS_PER_TX;
global NOTE_HASH_PENDING_READ_AMOUNT: u32 = MAX_NOTE_HASH_READ_REQUESTS_PER_TX;
global NOTE_HASH_SETTLED_READ_HINTS_LEN: u32 = MAX_NOTE_HASH_READ_REQUESTS_PER_TX;
global NOTE_HASH_SETTLED_READ_AMOUNT: u32 = MAX_NOTE_HASH_READ_REQUESTS_PER_TX;
global NULLIFIER_PENDING_READ_HINTS_LEN: u32 = MAX_NULLIFIER_READ_REQUESTS_PER_TX;
global NULLIFIER_PENDING_READ_AMOUNT: u32 = MAX_NULLIFIER_READ_REQUESTS_PER_TX;
global NULLIFIER_SETTLED_READ_HINTS_LEN: u32 = MAX_NULLIFIER_READ_REQUESTS_PER_TX;
global NULLIFIER_SETTLED_READ_AMOUNT: u32 = MAX_NULLIFIER_READ_REQUESTS_PER_TX;
global KEY_VALIDATION_HINTS_LEN: u32 = MAX_KEY_VALIDATION_REQUESTS_PER_TX;
global KEY_VALIDATION_AMOUNT: u32 = MAX_KEY_VALIDATION_REQUESTS_PER_TX;
global TRANSIENT_DATA_SQUASHING_HINTS_LEN: u32 = MAX_NULLIFIERS_PER_TX;
global TRANSIENT_DATA_SQUASHING_AMOUNT: u32 = MAX_NULLIFIERS_PER_TX;
global NOTE_HASH_SILOING_AMOUNT: u32 = MAX_NOTE_HASHES_PER_TX;
global NULLIFIER_SILOING_AMOUNT: u32 = MAX_NULLIFIERS_PER_TX;
global PRIVATE_LOG_SILOING_AMOUNT: u32 = MAX_PRIVATE_LOGS_PER_TX;

unconstrained fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs,
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    padded_side_effects: PaddedSideEffects,
    hints: PrivateKernelResetHints<NOTE_HASH_PENDING_READ_HINTS_LEN, NOTE_HASH_SETTLED_READ_HINTS_LEN, NULLIFIER_PENDING_READ_HINTS_LEN, NULLIFIER_SETTLED_READ_HINTS_LEN, KEY_VALIDATION_HINTS_LEN, TRANSIENT_DATA_SQUASHING_HINTS_LEN>,
    padded_side_effect_amounts: PaddedSideEffectAmounts,
    expiration_timestamp_upper_bound: u64,
) -> pub PrivateToPublicKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelResetTailToPublicCircuitPrivateInputs::new(
        previous_kernel,
        previous_kernel_public_inputs,
        padded_side_effects,
        hints,
        padded_side_effect_amounts,
        expiration_timestamp_upper_bound,
    );

    private_inputs
        .execute::<NOTE_HASH_PENDING_READ_AMOUNT, NOTE_HASH_SETTLED_READ_AMOUNT, NULLIFIER_PENDING_READ_AMOUNT, NULLIFIER_SETTLED_READ_AMOUNT, KEY_VALIDATION_AMOUNT, TRANSIENT_DATA_SQUASHING_AMOUNT, NOTE_HASH_SILOING_AMOUNT, NULLIFIER_SILOING_AMOUNT, PRIVATE_LOG_SILOING_AMOUNT>()
}
