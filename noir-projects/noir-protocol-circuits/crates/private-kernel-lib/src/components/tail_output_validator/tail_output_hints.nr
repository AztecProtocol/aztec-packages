use dep::types::{
    abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    constants::{MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX},
    utils::arrays::{get_order_hints, OrderHint},
};

pub struct TailOutputHints {
    // L2 to l1 msgs.
    pub sorted_l2_to_l1_msg_hints: [OrderHint; MAX_L2_TO_L1_MSGS_PER_TX],
    // Contract class log hashes.
    pub sorted_contract_class_log_hash_hints: [OrderHint; MAX_CONTRACT_CLASS_LOGS_PER_TX],
}

pub unconstrained fn generate_tail_output_hints(
    previous_kernel: PrivateKernelCircuitPublicInputs,
) -> TailOutputHints {
    // l2_to_l1_msgs
    let sorted_l2_to_l1_msg_hints = get_order_hints(previous_kernel.end.l2_to_l1_msgs.array);

    // contract_class_logs
    let sorted_contract_class_log_hash_hints =
        get_order_hints(previous_kernel.end.contract_class_logs_hashes.array);

    TailOutputHints { sorted_l2_to_l1_msg_hints, sorted_contract_class_log_hash_hints }
}
