mod meter_gas_used;
mod split_to_public;

use crate::components::{
    private_kernel_circuit_public_inputs_composer::PrivateKernelCircuitPublicInputsComposer,
    tail_to_public_output_composer::{
        meter_gas_used::{meter_gas_used_non_revertible, meter_gas_used_revertible},
        split_to_public::split_to_public,
    },
};
use dep::types::abis::{
    kernel_circuit_public_inputs::{
        PrivateKernelCircuitPublicInputs, PrivateToPublicKernelCircuitPublicInputs,
    },
    validation_requests::PublicValidationRequests,
};

pub struct TailToPublicOutputComposer {
    output_composer: PrivateKernelCircuitPublicInputsComposer,
}

impl TailToPublicOutputComposer {
    pub unconstrained fn new(previous_kernel: PrivateKernelCircuitPublicInputs) -> Self {
        let mut output_composer =
            PrivateKernelCircuitPublicInputsComposer::new_from_previous_kernel(previous_kernel);
        output_composer.sort_ordered_values();

        TailToPublicOutputComposer { output_composer }
    }

    pub unconstrained fn finish(self) -> PrivateToPublicKernelCircuitPublicInputs {
        let source = self.output_composer.public_inputs;

        let mut (non_revertible_accumulated_data, revertible_accumulated_data) =
            split_to_public(source.end, source.min_revertible_side_effect_counter);

        non_revertible_accumulated_data.gas_used =
            meter_gas_used_non_revertible(non_revertible_accumulated_data);

        revertible_accumulated_data.gas_used =
            meter_gas_used_revertible(revertible_accumulated_data);

        let mut output = PrivateToPublicKernelCircuitPublicInputs {
            constants: source.constants,
            rollup_validation_requests: source.validation_requests.for_rollup(),
            non_revertible_accumulated_data,
            revertible_accumulated_data,
            public_teardown_call_request: source.public_teardown_call_request,
            fee_payer: source.fee_payer,
        };

        output
    }
}
