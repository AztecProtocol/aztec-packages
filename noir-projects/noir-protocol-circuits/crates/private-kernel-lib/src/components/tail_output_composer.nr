mod meter_gas_used;

pub(crate) use meter_gas_used::meter_gas_used;

use crate::components::private_kernel_circuit_public_inputs_composer::PrivateKernelCircuitPublicInputsComposer;
use dep::types::{
    abis::{
        accumulated_data::private_to_rollup_accumulated_data::PrivateToRollupAccumulatedData,
        kernel_circuit_public_inputs::{
            PrivateKernelCircuitPublicInputs, PrivateToRollupKernelCircuitPublicInputs,
        },
        log_hash::LogHash,
        note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier,
        private_log::PrivateLogData,
        side_effect::{counted::Counted, scoped::Scoped},
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    traits::Empty,
};

pub struct TailOutputComposer {
    output_composer: PrivateKernelCircuitPublicInputsComposer,
    include_by_timestamp_upper_bound: u64,
}

impl TailOutputComposer {
    pub unconstrained fn new(
        previous_kernel: PrivateKernelCircuitPublicInputs,
        include_by_timestamp_upper_bound: u64,
    ) -> Self {
        let mut output_composer =
            PrivateKernelCircuitPublicInputsComposer::new_from_previous_kernel(previous_kernel);
        // Q: Why are we sorting in the tail, if sorting has already happened in the Reset?
        output_composer.sort_ordered_values();

        TailOutputComposer { output_composer, include_by_timestamp_upper_bound }
    }

    pub unconstrained fn finish(self) -> PrivateToRollupKernelCircuitPublicInputs {
        let source = self.output_composer.finish();

        let end = self.build_private_to_rollup_accumulated_data();

        let gas_used = meter_gas_used(end);

        let include_by_timestamp = std::cmp::min(
            source.include_by_timestamp,
            self.include_by_timestamp_upper_bound,
        );

        PrivateToRollupKernelCircuitPublicInputs {
            constants: source.constants,
            end,
            gas_used,
            fee_payer: source.fee_payer,
            include_by_timestamp,
        }
    }

    unconstrained fn build_private_to_rollup_accumulated_data(
        self,
    ) -> PrivateToRollupAccumulatedData {
        let source = self.output_composer.public_inputs_builder.end;
        let mut data = PrivateToRollupAccumulatedData::empty();
        data.note_hashes = source.note_hashes.array.map(|n: ScopedNoteHash| n.note_hash.value);
        data.nullifiers = source.nullifiers.array.map(|n: ScopedNullifier| n.nullifier.value);
        data.l2_to_l1_msgs = source.l2_to_l1_msgs.array.map(|m: Scoped<Counted<L2ToL1Message>>| {
            m.expose_to_public()
        });
        data.private_logs =
            source.private_logs.array.map(|l: Scoped<PrivateLogData>| l.expose_to_public());
        data.contract_class_logs_hashes = source
            .contract_class_logs_hashes
            .array
            .map(|l: Scoped<Counted<LogHash>>| l.expose_to_public());
        data
    }
}
