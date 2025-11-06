use crate::components::{
    gas_meter::meter_gas_used,
    private_kernel_circuit_public_inputs_composer::PrivateKernelCircuitPublicInputsComposer,
};
use dep::types::{
    abis::{
        accumulated_data::{
            private_accumulated_data::PrivateAccumulatedData,
            private_to_rollup_accumulated_data::PrivateToRollupAccumulatedData,
        },
        kernel_circuit_public_inputs::{
            PrivateKernelCircuitPublicInputs, PrivateToRollupKernelCircuitPublicInputs,
        },
    },
    traits::Empty,
};

pub struct TailOutputComposer {
    previous_kernel: PrivateKernelCircuitPublicInputs,
    include_by_timestamp_upper_bound: u64,
}

impl TailOutputComposer {
    pub unconstrained fn new(
        previous_kernel: PrivateKernelCircuitPublicInputs,
        include_by_timestamp_upper_bound: u64,
    ) -> Self {
        TailOutputComposer { previous_kernel, include_by_timestamp_upper_bound }
    }

    pub unconstrained fn finish(self) -> PrivateToRollupKernelCircuitPublicInputs {
        let mut output_composer = PrivateKernelCircuitPublicInputsComposer::new_from_previous_kernel(
            self.previous_kernel,
        );
        output_composer.sort_ordered_values();
        let source = output_composer.finish();

        let end = self.build_private_to_rollup_accumulated_data(source.end);

        let gas_used = meter_gas_used(self.previous_kernel, false /* is_for_public */);

        let include_by_timestamp = std::cmp::min(
            source.include_by_timestamp,
            self.include_by_timestamp_upper_bound,
        );

        PrivateToRollupKernelCircuitPublicInputs {
            constants: source.constants.to_tx_constant_data(),
            end,
            gas_used,
            fee_payer: source.fee_payer,
            include_by_timestamp,
        }
    }

    unconstrained fn build_private_to_rollup_accumulated_data(
        _self: Self,
        source: PrivateAccumulatedData,
    ) -> PrivateToRollupAccumulatedData {
        let mut data = PrivateToRollupAccumulatedData::empty();
        data.note_hashes = source.note_hashes.array.map(|n| n.expose_to_public());
        data.nullifiers = source.nullifiers.array.map(|n| n.expose_to_public());
        data.l2_to_l1_msgs = source.l2_to_l1_msgs.array.map(|m| m.expose_to_public());
        data.private_logs = source.private_logs.array.map(|l| l.expose_to_public());
        data.contract_class_logs_hashes =
            source.contract_class_logs_hashes.array.map(|l| l.expose_to_public());
        data
    }
}
