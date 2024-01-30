use crate::abis::{
    combined_accumulated_data::{
        CombinedAccumulatedData,
        FinalAccumulatedData,
        CombinedAccumulatedDataBuilder,
    },
    combined_constant_data::CombinedConstantData,
};

use crate::mocked::AggregationObject;

struct KernelCircuitPublicInputs {
    aggregation_object: AggregationObject,
    end_fee_prep: CombinedAccumulatedData,
    end_app_logic: CombinedAccumulatedData,
    constants: CombinedConstantData,
    is_private: bool,
}

struct KernelCircuitPublicInputsFinal {
    aggregation_object: AggregationObject,
    end_fee_prep: FinalAccumulatedData,
    end_app_logic: FinalAccumulatedData,
    constants: CombinedConstantData,
    is_private: bool,
}

struct KernelCircuitPublicInputsBuilder {
    aggregation_object: AggregationObject,
    end_fee_prep: CombinedAccumulatedDataBuilder,
    end_app_logic: CombinedAccumulatedDataBuilder,
    constants: CombinedConstantData,
    is_private: bool,
}

impl KernelCircuitPublicInputsBuilder {
    pub fn finish(self) -> KernelCircuitPublicInputs {
        KernelCircuitPublicInputs {
            aggregation_object: self.aggregation_object,
            end_fee_prep: self.end_fee_prep.finish(),
            end_app_logic: self.end_app_logic.finish(),
            constants: self.constants,
            is_private: self.is_private,
        }
    }

    pub fn to_final(self) -> KernelCircuitPublicInputsFinal {
        KernelCircuitPublicInputsFinal {
            aggregation_object: self.aggregation_object,
            end_fee_prep: self.end_fee_prep.to_final(),
            end_app_logic: self.end_app_logic.to_final(),
            constants: self.constants,
            is_private: self.is_private,
        }
    }
}
