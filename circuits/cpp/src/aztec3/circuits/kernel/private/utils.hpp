#pragma once
#include "index.hpp"
#include "init.hpp"

namespace {
using NT = aztec3::utils::types::NativeTypes;
using aztec3::circuits::abis::PreviousKernelData;
}  // namespace

namespace aztec3::circuits::kernel::private_kernel::utils {

PreviousKernelData<NT> dummy_previous_kernel(bool real_vk_proof = false);

/**
 * @brief Computes the ethereum address from a public key.
 *
 * @param public_key
 * @return NT::address 20-byte ethereum address
 */
NT::address compute_ethereum_address_from_public_key(const NT::secp256k1_point& public_key);

} // namespace aztec3::circuits::kernel::private_kernel::utils
