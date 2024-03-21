use crate::abis::{
    accumulated_data::CombinedAccumulatedDataBuilder, combined_constant_data::CombinedConstantData,
    kernel_circuit_public_inputs::kernel_circuit_public_inputs::KernelCircuitPublicInputs
};
use crate::mocked::AggregationObject;

struct KernelCircuitPublicInputsBuilder {
    aggregation_object: AggregationObject,
    end: CombinedAccumulatedDataBuilder,
    constants: CombinedConstantData,
    reverted: bool,
}

impl KernelCircuitPublicInputsBuilder {
    pub fn finish(self) -> KernelCircuitPublicInputs {
        KernelCircuitPublicInputs {
            aggregation_object: self.aggregation_object,
            end: self.end.finish(),
            constants: self.constants,
            reverted: self.reverted
        }
    }
}
