use crate::abis::combined_constant_data::CombinedConstantData;
use crate::abis::final_accumulated_data::FinalAccumulatedData;

struct KernelCircuitPublicInputsFinal {
    end : FinalAccumulatedData,
    constants : CombinedConstantData,

    // TODO(Jean): Left a note saying that this might need to be a witness
    // In the context of Noir, this is already a witness. 
    is_private : bool,
}
