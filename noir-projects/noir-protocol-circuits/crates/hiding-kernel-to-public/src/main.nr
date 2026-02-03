use dep::private_kernel_lib::{hiding_kernel_to_public, HidingKernelToPublicPrivateInputs};
use dep::types::{
    abis::kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
    constants::MEGA_VK_LENGTH_IN_FIELDS, proof::vk_data::VkData,
};

fn main(
    previous_kernel_public_inputs: call_data(0) PrivateToPublicKernelCircuitPublicInputs,
    previous_kernel_vk_data: VkData<MEGA_VK_LENGTH_IN_FIELDS>,
) -> pub PrivateToPublicKernelCircuitPublicInputs {
    let inputs = HidingKernelToPublicPrivateInputs {
        previous_kernel_public_inputs,
        previous_kernel_vk_data,
    };
    hiding_kernel_to_public::execute(inputs)
}
