use private_kernel_lib::{hiding_kernel_to_rollup, HidingKernelToRollupPrivateInputs};
use types::{
    abis::kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
    constants::MEGA_KERNEL_VK_LENGTH_IN_FIELDS, proof::vk_data::VkData,
};

fn main(
    previous_kernel_public_inputs: call_data(0) PrivateToRollupKernelCircuitPublicInputs,
    previous_kernel_vk_data: VkData<MEGA_KERNEL_VK_LENGTH_IN_FIELDS>,
) -> pub PrivateToRollupKernelCircuitPublicInputs {
    let inputs = HidingKernelToRollupPrivateInputs {
        previous_kernel_public_inputs,
        previous_kernel_vk_data,
    };
    hiding_kernel_to_rollup::execute(inputs)
}
