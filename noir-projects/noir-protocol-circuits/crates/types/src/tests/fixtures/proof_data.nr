use crate::{proof::proof_data::ProofData, tests::{fixtures::vk_tree::get_vk_data, utils::pad_end}};

pub fn make_proof<let ProofLen: u32>(vk_index: u32) -> [Field; ProofLen] {
    let value_offset = vk_index as Field * 193268;
    pad_end([
        value_offset + 79427943,
        value_offset + 94340,
        value_offset + 4789150,
        value_offset + 524,
    ])
}

pub fn make_proof_data<T, let ProofLen: u32, let VkLen: u32>(
    public_inputs: T,
    vk_index: u32,
) -> ProofData<T, ProofLen, VkLen> {
    ProofData { public_inputs, proof: make_proof(vk_index), vk_data: get_vk_data(vk_index) }
}
