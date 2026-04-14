mod split_to_public;

pub(crate) use split_to_public::split_to_public;

use crate::{
    abis::PaddedSideEffectAmounts,
    components::{
        gas_meter::meter_gas_used,
        private_kernel_circuit_output_composer::PrivateKernelCircuitOutputComposer,
    },
};
use types::{
    abis::kernel_circuit_public_inputs::{
        PrivateKernelCircuitPublicInputs, PrivateToPublicKernelCircuitPublicInputs,
    },
    constants::MAX_TX_LIFETIME,
};

pub struct TailToPublicOutputComposer {
    previous_kernel: PrivateKernelCircuitPublicInputs,
    padded_side_effect_amounts: PaddedSideEffectAmounts,
    expiration_timestamp_upper_bound: u64,
}

impl TailToPublicOutputComposer {
    pub unconstrained fn new(
        previous_kernel: PrivateKernelCircuitPublicInputs,
        padded_side_effect_amounts: PaddedSideEffectAmounts,
        expiration_timestamp_upper_bound: u64,
    ) -> Self {
        TailToPublicOutputComposer {
            previous_kernel,
            padded_side_effect_amounts,
            expiration_timestamp_upper_bound,
        }
    }

    pub unconstrained fn finish(self) -> PrivateToPublicKernelCircuitPublicInputs {
        let mut output_composer =
            PrivateKernelCircuitOutputComposer::new_from_previous_kernel(self.previous_kernel);
        output_composer.sort_ordered_values();
        let source = output_composer.finish();

        let (non_revertible_accumulated_data, revertible_accumulated_data) = split_to_public(
            source.end,
            source.min_revertible_side_effect_counter,
            self.padded_side_effect_amounts,
        );

        let gas_used = meter_gas_used(self.previous_kernel, true /* is_for_public */);

        let max_timestamp =
            source.constants.anchor_block_header.global_variables.timestamp + MAX_TX_LIFETIME;
        let expiration_timestamp = std::cmp::min(
            std::cmp::min(
                source.expiration_timestamp,
                self.expiration_timestamp_upper_bound,
            ),
            max_timestamp,
        );

        let output = PrivateToPublicKernelCircuitPublicInputs {
            constants: source.constants.to_tx_constant_data(),
            non_revertible_accumulated_data,
            revertible_accumulated_data,
            public_teardown_call_request: source.public_teardown_call_request,
            gas_used,
            fee_payer: source.fee_payer,
            expiration_timestamp,
        };

        output
    }
}
