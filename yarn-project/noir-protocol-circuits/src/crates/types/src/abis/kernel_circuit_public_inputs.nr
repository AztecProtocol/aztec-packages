use crate::abis::{
    combined_accumulated_data::{
        CombinedAccumulatedData,
        FinalAccumulatedData,
        CombinedAccumulatedDataBuilder,
    },
    combined_constant_data::CombinedConstantData
};
use crate::mocked::AggregationObject;

struct KernelCircuitPublicInputs {
    aggregation_object: AggregationObject,
    end: CombinedAccumulatedData,
    constants: CombinedConstantData,
    is_private: bool,
}

struct KernelCircuitPublicInputsFinal {
    aggregation_object: AggregationObject,
    end_meta: FinalAccumulatedData,
    // TODO(fees) change this to end_app_logic
    end: FinalAccumulatedData,
    constants: CombinedConstantData,
    is_private: bool,
}

struct KernelCircuitPublicInputsBuilder {
    aggregation_object: AggregationObject,
    end_meta: CombinedAccumulatedDataBuilder,
    end: CombinedAccumulatedDataBuilder,
    constants: CombinedConstantData,
    is_private: bool,
}

impl KernelCircuitPublicInputsBuilder {
    pub fn finish(self) -> KernelCircuitPublicInputs {
        KernelCircuitPublicInputs {
            aggregation_object: self.aggregation_object,
            end: self.end.finish(),
            constants: self.constants,
            is_private: self.is_private,
        }
    }

    pub fn to_final(self) -> KernelCircuitPublicInputsFinal {
        let meta = self.end_meta.to_final();
        let app = self.end.to_final();
        KernelCircuitPublicInputsFinal {
            aggregation_object: self.aggregation_object,
            end_meta: meta,
            end: app,
            constants: self.constants,
            is_private: self.is_private,
        }
    }
}
