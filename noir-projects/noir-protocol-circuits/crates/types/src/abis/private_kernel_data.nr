use crate::recursion::{verification_key::VerificationKey, proof::NestedRecursiveProof, traits::Verifiable};
use crate::constants::VK_TREE_HEIGHT;
use crate::abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs;

struct PrivateKernelData {
    public_inputs: PrivateKernelCircuitPublicInputs,

    vk: VerificationKey,

    // TODO(Mike): left a note saying : this index and path are meant to be those of a leaf within the tree of _kernel circuit_ vks; not the tree
    // of functions within the contract tree.
    vk_index: u32,
    vk_path: [Field; VK_TREE_HEIGHT],
}
