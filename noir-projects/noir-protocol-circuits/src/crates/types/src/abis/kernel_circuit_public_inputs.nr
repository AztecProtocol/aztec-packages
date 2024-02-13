use crate::abis::{
    combined_accumulated_data::{
    CombinedAccumulatedData, FinalAccumulatedData, AccumulatedNonRevertibleData,
    AccumulatedNonRevertibleDataBuilder, CombinedAccumulatedDataBuilder, FinalAccumulatedDataBuilder
},
    combined_constant_data::CombinedConstantData
};
use dep::std::{unsafe};
use crate::constants::{MAX_NEW_COMMITMENTS_PER_TX, MAX_NEW_NULLIFIERS_PER_TX, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX};

use crate::mocked::AggregationObject;

struct PrivateKernelInnerCircuitPublicInputs {
    aggregation_object: AggregationObject,
    max_non_revertible_side_effect_counter: u32,
    end: CombinedAccumulatedData,
    constants: CombinedConstantData,
    is_private: bool,
}

struct PrivateKernelTailCircuitPublicInputs {
    aggregation_object: AggregationObject,
    end_non_revertible: AccumulatedNonRevertibleData,
    end: FinalAccumulatedData,
    constants: CombinedConstantData,
    is_private: bool,
}

struct PublicKernelCircuitPublicInputs {
    aggregation_object: AggregationObject,
    end_non_revertible: AccumulatedNonRevertibleData,
    end: CombinedAccumulatedData,
    constants: CombinedConstantData,
    is_private: bool,
}

struct PrivateKernelCircuitPublicInputsBuilder {
    aggregation_object: AggregationObject,
    max_non_revertible_side_effect_counter: u32,
    end: CombinedAccumulatedDataBuilder,
    constants: CombinedConstantData,
    is_private: bool,
}

impl PrivateKernelCircuitPublicInputsBuilder {
    pub fn to_inner(self) -> PrivateKernelInnerCircuitPublicInputs {
        PrivateKernelInnerCircuitPublicInputs {
            aggregation_object: self.aggregation_object,
            max_non_revertible_side_effect_counter: self.max_non_revertible_side_effect_counter,
            end: self.end.finish(),
            constants: self.constants,
            is_private: self.is_private
        }
    }

    pub fn to_tail(self) -> PrivateKernelTailCircuitPublicInputs {
        PrivateKernelTailCircuitPublicInputs {
            aggregation_object: self.aggregation_object,
            end_non_revertible: self.end.to_accumulated_non_revertible_data(self.max_non_revertible_side_effect_counter),
            end: self.end.to_accumulated_revertible_data(self.max_non_revertible_side_effect_counter),
            constants: self.constants,
            is_private: self.is_private
        }
    }
}

struct PublicKernelCircuitPublicInputsBuilder {
    aggregation_object: AggregationObject,
    end_non_revertible: AccumulatedNonRevertibleDataBuilder,
    end: CombinedAccumulatedDataBuilder,
    constants: CombinedConstantData,
    is_private: bool,
}

impl PublicKernelCircuitPublicInputsBuilder {
    pub fn to_inner(self) -> PublicKernelCircuitPublicInputs {
        PublicKernelCircuitPublicInputs {
            aggregation_object: self.aggregation_object,
            end_non_revertible: self.end_non_revertible.finish(),
            end: self.end.finish(),
            constants: self.constants,
            is_private: self.is_private
        }
    }
}
