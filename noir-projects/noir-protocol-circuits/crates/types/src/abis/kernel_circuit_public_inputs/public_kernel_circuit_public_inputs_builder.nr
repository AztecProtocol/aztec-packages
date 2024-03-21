use crate::abis::{
    accumulated_data::{CombinedAccumulatedData, PublicAccumulatedDataBuilder},
    combined_constant_data::CombinedConstantData,
    kernel_circuit_public_inputs::{
    kernel_circuit_public_inputs::KernelCircuitPublicInputs,
    public_kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs
},
    validation_requests::ValidationRequestsBuilder
};
use crate::mocked::AggregationObject;

struct PublicKernelCircuitPublicInputsBuilder {
    aggregation_object: AggregationObject,
    validation_requests: ValidationRequestsBuilder,
    end_non_revertible: PublicAccumulatedDataBuilder,
    end: PublicAccumulatedDataBuilder,
    constants: CombinedConstantData,
    reverted: bool,
}

impl PublicKernelCircuitPublicInputsBuilder {
    pub fn finish(self) -> PublicKernelCircuitPublicInputs {
        PublicKernelCircuitPublicInputs {
            aggregation_object: self.aggregation_object,
            validation_requests: self.validation_requests.finish(),
            end_non_revertible: self.end_non_revertible.finish(),
            end: self.end.finish(),
            constants: self.constants,
            reverted: self.reverted
        }
    }

    pub fn finish_tail(self) -> KernelCircuitPublicInputs {
        KernelCircuitPublicInputs {
            aggregation_object: self.aggregation_object,
            end: CombinedAccumulatedData::recombine(self.end_non_revertible.finish(), self.end.finish()),
            constants: self.constants,
            reverted: self.reverted
        }
    }
}
