// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include <barretenberg/common/container.hpp>
#include <cstdint>

namespace acir_format {

class ProofSurgeon {
    using FF = bb::fr;

    // construct a string of the form "[<fr_0 hex>, <fr_1 hex>, ...]"
    static std::string to_json(const std::vector<bb::fr>& data)
    {
        return format(
            "[", bb::join(bb::transform::map(data, [](auto fr) { return format("\"", fr, "\""); }), ", "), "]");
    }

  public:
    /**
     * @brief Construct a string containing the inputs to a noir verify_proof call (to be written to a .toml)
     *
     * @param proof A complete bberg style proof (i.e. contains the public inputs)
     * @param verification_key
     * @param toml_path
     */
    template <typename VerificationKey>
    static std::string construct_recursion_inputs_toml_data(std::vector<FF>& proof,
                                                            const std::shared_ptr<VerificationKey>& verification_key,
                                                            bool ipa_accumulation)
    {
        // Convert verification key to fields
        std::vector<FF> vk_fields = verification_key->to_field_elements();

        // Get public inputs by cutting them out of the proof
        size_t num_public_inputs_to_extract =
            static_cast<uint32_t>(verification_key->num_public_inputs) - bb::PAIRING_POINTS_SIZE;
        if (ipa_accumulation) {
            num_public_inputs_to_extract -= bb::IPA_CLAIM_SIZE;
        }
        debug("proof size: ", proof.size());
        debug("number of public inputs to extract: ", num_public_inputs_to_extract);
        std::vector<FF> public_inputs =
            acir_format::ProofSurgeon::cut_public_inputs_from_proof(proof, num_public_inputs_to_extract);

        // Construct json-style output for each component
        std::string proof_json = to_json(proof);
        std::string pub_inputs_json = to_json(public_inputs);
        std::string vk_json = to_json(vk_fields);

        // Format with labels for noir recursion input
        std::string toml_content = "key_hash = " + format("\"", FF(0), "\"") + "\n"; // not used by honk
        toml_content += "proof = " + proof_json + "\n";
        toml_content += "public_inputs = " + pub_inputs_json + "\n";
        toml_content += "verification_key = " + vk_json + "\n";

        return toml_content;
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
    static std::vector<uint32_t> create_indices_for_reconstructed_proof(const std::vector<uint32_t>& proof_in,
                                                                        const std::vector<uint32_t>& public_inputs)
    {
        std::vector<uint32_t> proof;
        proof.reserve(proof_in.size() + public_inputs.size());

        // Construct the complete proof as the concatenation {"initial data" | public_inputs | proof_in}
        proof.insert(proof.end(), public_inputs.begin(), public_inputs.end());
        proof.insert(proof.end(), proof_in.begin(), proof_in.end());

        return proof;
    }

    /**
     * @brief Extract then remove a given number of public inputs from a proof
     *
     * @param proof_witnesses Witness values of a bberg style proof containing public inputs
     * @param num_public_inputs The number of public inputs to extract from the proof
     * @return std::vector<bb::fr> The extracted public input witness values
     */
    static std::vector<bb::fr> cut_public_inputs_from_proof(std::vector<bb::fr>& proof_witnesses,
                                                            const size_t num_public_inputs_to_extract)
    {
        // Construct iterators pointing to the start and end of the public inputs within the proof
        auto pub_inputs_begin_itr = proof_witnesses.begin();
        auto pub_inputs_end_itr = proof_witnesses.begin() + static_cast<std::ptrdiff_t>(num_public_inputs_to_extract);

        // Construct the isolated public inputs
        std::vector<bb::fr> public_input_witnesses{ pub_inputs_begin_itr, pub_inputs_end_itr };

        // Erase the public inputs from the proof
        proof_witnesses.erase(pub_inputs_begin_itr, pub_inputs_end_itr);

        return public_input_witnesses;
    }

    /**
     * @brief Get the witness indices for a given number of public inputs contained within a stdlib proof
     *
     * @param proof A bberg style stdlib proof (contains public inputs)
     * @param num_public_inputs The number of public input witness indices to get from the proof
     * @return std::vector<bb::fr> The corresponding public input witness indices
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

    struct RecursionWitnessData {
        std::vector<uint32_t> key_indices;
        uint32_t key_hash_index;
        std::vector<uint32_t> proof_indices;
        std::vector<uint32_t> public_inputs_indices;
    };

    /**
     * @brief Populate a witness vector with key, proof, and public inputs; track witness indices for each component
     * @details This method is used to constuct acir-style inputs to a recursion constraint. It is assumed that the
     * provided proof contains all of its public inputs (i.e. the conventional bberg format) which are extracted herein.
     * Each component is appended to the witness which may already contain data. The order in which they are added is
     * arbitrary as long as the corresponding witness indices are correct.
     *
     * @param witness
     * @param proof_witnesses
     * @param key_witnesses
     * @param num_public_inputs
     * @return RecursionWitnessData
     */
    static RecursionWitnessData populate_recursion_witness_data(bb::SlabVector<bb::fr>& witness,
                                                                std::vector<bb::fr>& proof_witnesses,
                                                                const std::vector<bb::fr>& key_witnesses,
                                                                const bb::fr& key_hash_witness,
                                                                const size_t num_public_inputs_to_extract)
    {
        // Extract all public inputs except for those corresponding to the aggregation object
        std::vector<bb::fr> public_input_witnesses =
            cut_public_inputs_from_proof(proof_witnesses, num_public_inputs_to_extract);

        // Helper to append some values to the witness vector and return their corresponding indices
        auto add_to_witness_and_track_indices = [](bb::SlabVector<bb::fr>& witness,
                                                   const std::vector<bb::fr>& input) -> std::vector<uint32_t> {
            std::vector<uint32_t> indices;
            indices.reserve(input.size());
            auto witness_idx = static_cast<uint32_t>(witness.size());
            for (const auto& value : input) {
                witness.push_back(value);
                indices.push_back(witness_idx++);
            }
            return indices;
        };

        // Append key, proof, and public inputs while storing the associated witness indices
        std::vector<uint32_t> key_indices = add_to_witness_and_track_indices(witness, key_witnesses);
        uint32_t key_hash_index = add_to_witness_and_track_indices(witness, { key_hash_witness })[0];
        std::vector<uint32_t> proof_indices = add_to_witness_and_track_indices(witness, proof_witnesses);
        std::vector<uint32_t> public_input_indices = add_to_witness_and_track_indices(witness, public_input_witnesses);

        return { key_indices, key_hash_index, proof_indices, public_input_indices };
    }
};

} // namespace acir_format
