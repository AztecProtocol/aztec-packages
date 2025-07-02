#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

FF unconstrained_root_from_path(const FF& leaf_value, const uint64_t leaf_index, std::span<const FF> path);

FF unconstrained_compute_leaf_slot(const AztecAddress& contract_address, const FF& slot);

FF unconstrained_silo_nullifier(const AztecAddress& contract_address, const FF& nullifier);

FF unconstrained_silo_note_hash(const AztecAddress& contract_address, const FF& note_hash);

FF unconstrained_make_unique_note_hash(const FF& siloed_note_hash,
                                       const FF& first_nullifier,
                                       uint64_t note_hash_counter);

} // namespace bb::avm2::simulation
