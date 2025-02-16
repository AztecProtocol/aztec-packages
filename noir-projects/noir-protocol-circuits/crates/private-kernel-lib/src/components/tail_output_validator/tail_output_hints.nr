use dep::types::{
    abis::{
        contract_class_log::ContractClassLogData,
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs, side_effect::scoped::Scoped,
    },
    constants::{MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX},
    utils::arrays::{get_order_hints_asc, OrderHint, sort_by_counter_asc},
};

pub struct TailOutputHints {
    // L2 to l1 msgs.
    pub sorted_l2_to_l1_msg_hints: [OrderHint; MAX_L2_TO_L1_MSGS_PER_TX],
    // Contract class log hashes.
    pub sorted_contract_class_logs: [Scoped<ContractClassLogData>; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    pub sorted_contract_class_log_hints: [OrderHint; MAX_CONTRACT_CLASS_LOGS_PER_TX],
}

pub unconstrained fn generate_tail_output_hints(
    previous_kernel: PrivateKernelCircuitPublicInputs,
) -> TailOutputHints {
    // l2_to_l1_msgs
    let sorted_l2_to_l1_msg_hints = get_order_hints_asc(previous_kernel.end.l2_to_l1_msgs);

    // contract_class_logs
    let sorted_contract_class_logs = sort_by_counter_asc(previous_kernel.end.contract_class_logs);
    let sorted_contract_class_log_hints =
        get_order_hints_asc(previous_kernel.end.contract_class_logs);

    TailOutputHints {
        sorted_l2_to_l1_msg_hints,
        sorted_contract_class_logs,
        sorted_contract_class_log_hints,
    }
}
