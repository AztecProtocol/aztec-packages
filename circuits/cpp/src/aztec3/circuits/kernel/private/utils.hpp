#pragma once
#include "index.hpp"
#include "init.hpp"

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/plonk/proof_system/verification_key/verification_key.hpp"

namespace {
using NT = aztec3::utils::types::NativeTypes;
using aztec3::circuits::abis::PreviousKernelData;
}  // namespace

namespace aztec3::circuits::kernel::private_kernel::utils {

void write_buffer_to_file(const std::vector<uint8_t>& vec, const std::string& filename);
std::vector<uint8_t> read_buffer_from_file(const std::string&);
NT::Proof get_proof_from_file();
std::shared_ptr<NT::VK> fake_vk();
PreviousKernelData<NT> dummy_previous_kernel(bool real_vk_proof = false);

}  // namespace aztec3::circuits::kernel::private_kernel::utils