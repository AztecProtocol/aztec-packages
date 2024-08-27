#pragma once
#include "barretenberg/common/serialize.hpp"
// #include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>

namespace acir_format {

class ProofSurgeon {

    // Where the public inputs start within a proof (after circuit_size, num_pub_inputs, pub_input_offset)
    static constexpr size_t HONK_RECURSION_PUBLIC_INPUT_OFFSET = 3;

  public:
    /**
     * @brief Move the aggregation object witness indices from a proof to the public inputs
     * @details A proof passed into the constraint should be stripped of its inner public inputs, but not the nested
     * aggregation object itself. The verifier circuit requires that the indices to a nested proof aggregation state are
     * a circuit constant. The user tells us they how they want these constants set by keeping the nested aggregation
     * object attached to the proof as public inputs.
     *
     * @param proof
     * @param public_inputs
     */
    static void move_aggregation_object_from_proof_to_public_inputs(std::vector<uint32_t>& proof,
                                                                    std::vector<uint32_t>& public_inputs)
    {
        // Add aggregation object indices into the public input indices
        for (size_t i = 0; i < bb::AGGREGATION_OBJECT_SIZE; ++i) {
            public_inputs.emplace_back(proof[HONK_RECURSION_PUBLIC_INPUT_OFFSET + i]);
        }
        // Remove the aggregation object indices from the proof so that they can be handled as normal public inputs in
        // they way that the recursion constraint expects
        proof.erase(proof.begin() + HONK_RECURSION_PUBLIC_INPUT_OFFSET,
                    proof.begin() +
                        static_cast<std::ptrdiff_t>(HONK_RECURSION_PUBLIC_INPUT_OFFSET + bb::AGGREGATION_OBJECT_SIZE));
    }

    /**
     * @brief Reconstruct a bberg style proof from a acir style proof + public inputs
     * @details Insert the public inputs in the middle the proof fields after 'inner_public_input_offset' because this
     * is how the core barretenberg library processes proofs (with the public inputs starting at the third element and
     * not separate from the rest of the proof)
     *
     * @param proof_in A proof stripped of its public inputs
     * @param public_inputs The public inputs to be reinserted into the proof
     * @return std::vector<uint32_t> The witness indices of the complete proof
     */
    static std::vector<uint32_t> construct_indices_for_proof_with_public_inputs(
        const std::vector<uint32_t>& proof_in, const std::vector<uint32_t>& public_inputs)
    {
        std::vector<uint32_t> proof;
        proof.reserve(proof_in.size() + public_inputs.size());

        // Construct a the complete proof as the concatenation {"initial data" | public_inputs | proof_in}
        proof.insert(proof.end(), proof_in.begin(), proof_in.begin() + HONK_RECURSION_PUBLIC_INPUT_OFFSET);
        proof.insert(proof.end(), public_inputs.begin(), public_inputs.end());
        proof.insert(proof.end(), proof_in.begin() + HONK_RECURSION_PUBLIC_INPUT_OFFSET, proof_in.end());

        return proof;
    }

    /**
     * @brief Extract then remove the public inputs from a proof (excluding the aggregation object)
     *
     * @param proof_witnesses Witness values of a bberg style proof containing public inputs
     * @param num_public_inputs The number of public inputs contained in the proof
     * @return std::vector<bb::fr> The extracted public input witness values
     */
    static std::vector<bb::fr> extract_and_remove_public_inputs_from_proof(std::vector<bb::fr>& proof_witnesses,
                                                                           const size_t num_public_inputs_sans_agg)
    {
        // Construct iterators pointing to the start and end of the public inputs within the proof
        auto pub_inputs_begin_itr =
            proof_witnesses.begin() + static_cast<std::ptrdiff_t>(HONK_RECURSION_PUBLIC_INPUT_OFFSET);
        auto pub_inputs_end_itr =
            proof_witnesses.begin() +
            static_cast<std::ptrdiff_t>(HONK_RECURSION_PUBLIC_INPUT_OFFSET + num_public_inputs_sans_agg);

        // Extract the public inputs
        std::vector<bb::fr> public_input_witnesses(pub_inputs_begin_itr, pub_inputs_end_itr);

        // Erase the public inputs from the proof (with the exception of the aggregation object)
        proof_witnesses.erase(pub_inputs_begin_itr, pub_inputs_end_itr);

        return public_input_witnesses;
    }

    struct RecursionWitnessData {
        std::vector<uint32_t> key_indices;
        std::vector<uint32_t> proof_indices;
        std::vector<uint32_t> public_inputs_indices;
    };

    static RecursionWitnessData populate_recursion_witness_data(bb::SlabVector<bb::fr>& witness,
                                                                std::vector<bb::fr>& proof_witnesses,
                                                                const std::vector<bb::fr>& key_witnesses,
                                                                const size_t num_public_inputs)
    {
        const size_t num_public_inputs_sans_agg = num_public_inputs - bb::AGGREGATION_OBJECT_SIZE;

        std::vector<bb::fr> public_input_witnesses =
            extract_and_remove_public_inputs_from_proof(proof_witnesses, num_public_inputs_sans_agg);

        std::vector<uint32_t> proof_indices;
        std::vector<uint32_t> key_indices;
        std::vector<uint32_t> public_inputs_indices;

        for (size_t i = 0; i < HONK_RECURSION_PUBLIC_INPUT_OFFSET; ++i) {
            witness.push_back(proof_witnesses[i]);
            proof_indices.push_back(static_cast<uint32_t>(witness.size() - 1));
        }

        for (const auto& value : public_input_witnesses) {
            witness.push_back(value);
            public_inputs_indices.push_back(static_cast<uint32_t>(witness.size() - 1));
        }

        for (size_t i = HONK_RECURSION_PUBLIC_INPUT_OFFSET; i < proof_witnesses.size(); ++i) {
            witness.push_back(proof_witnesses[i]);
            proof_indices.push_back(static_cast<uint32_t>(witness.size() - 1));
        }

        for (const auto& value : key_witnesses) {
            witness.push_back(value);
            key_indices.push_back(static_cast<uint32_t>(witness.size() - 1));
        }

        return { key_indices, proof_indices, public_inputs_indices };
    }
};

} // namespace acir_format
