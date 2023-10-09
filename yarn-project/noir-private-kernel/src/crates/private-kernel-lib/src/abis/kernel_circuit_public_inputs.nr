
use crate::abis::combined_constant_data::CombinedConstantData;
use crate::abis::combined_accumulated_data::CombinedAccumulatedData;

struct KernelCircuitPublicInputs {

    end : CombinedAccumulatedData,
    constants : CombinedConstantData,

    is_private : bool,
}

