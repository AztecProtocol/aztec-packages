
use crate::abis::combined_constant_data::CombinedConstantData;
use crate::abis::combined_accumulated_data::{
    CombinedAccumulatedData,
    CombinedAccumulatedDataBuilder,
};

struct KernelCircuitPublicInputs {

    end : CombinedAccumulatedData,
    constants : CombinedConstantData,

    is_private : bool,
}

struct KernelCircuitPublicInputsBuilder {
    end : CombinedAccumulatedDataBuilder,
    constants : CombinedConstantData,

    is_private : bool,
}

impl KernelCircuitPublicInputsBuilder {
    pub fn finish(self) -> KernelCircuitPublicInputs {
        KernelCircuitPublicInputs {
            end : self.end.finish(),
            constants : self.constants,
            is_private : self.is_private,
        }
    }
}
