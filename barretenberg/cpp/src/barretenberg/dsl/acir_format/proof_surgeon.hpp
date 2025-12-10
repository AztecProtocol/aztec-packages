// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include <barretenberg/common/container.hpp>
#include <cstdint>

namespace acir_format {

template <typename FF> class ProofSurgeon {
  public:
    /**
     * @brief Get the witness indices for a given number of public inputs contained within a stdlib proof
     *
     * @param proof A bberg style stdlib proof (contains public inputs)
     * @param num_public_inputs The number of public input witness indices to get from the proof
     * @return std::vector<FF> The corresponding public input witness indices
     */
    static std::vector<uint32_t> get_public_inputs_witness_indices_from_proof(
        const bb::stdlib::Proof<bb::MegaCircuitBuilder>& proof, const size_t num_public_inputs_to_extract)
    {
        std::vector<uint32_t> public_input_witness_indices;
        public_input_witness_indices.reserve(num_public_inputs_to_extract);

        const size_t start = 0;
        const size_t end = start + num_public_inputs_to_extract;
        for (size_t i = start; i < end; ++i) {
            public_input_witness_indices.push_back(proof[i].get_witness_index());
        }

        return public_input_witness_indices;
    }
};
} // namespace acir_format
