use crate::abis::{accumulated_data::CombinedAccumulatedData, combined_constant_data::CombinedConstantData};
use crate::mocked::AggregationObject;

struct KernelCircuitPublicInputs {
    aggregation_object: AggregationObject,
    end: CombinedAccumulatedData,
    constants: CombinedConstantData,
    reverted: bool,
}
