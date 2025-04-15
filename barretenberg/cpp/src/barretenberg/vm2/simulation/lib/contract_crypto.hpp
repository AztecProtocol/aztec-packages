#pragma once

#include <cstdint>
#include <span>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

std::vector<FF> encode_bytecode(std::span<const uint8_t> bytecode);
FF compute_public_bytecode_commitment(std::span<const uint8_t> bytecode);
FF compute_contract_class_id(const FF& artifact_hash, const FF& private_fn_root, const FF& public_bytecode_commitment);
FF hash_public_keys(const PublicKeys& public_keys);
FF compute_contract_address(const ContractInstance& contract_instance);

} // namespace bb::avm2::simulation
