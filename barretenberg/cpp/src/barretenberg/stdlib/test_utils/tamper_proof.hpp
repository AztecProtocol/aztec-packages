#pragma once

#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/flavor/test_utils/proof_structures.hpp"
#include "barretenberg/honk/proof_length.hpp"

namespace bb {

enum class TamperType {
    MODIFY_SUMCHECK_UNIVARIATE, // Tamper with coefficients of a Sumcheck Round Univariate
    MODIFY_SUMCHECK_EVAL,       // Tamper with a multilinear evaluation of an entity
    MODIFY_Z_PERM_COMMITMENT,   // Tamper with the commitment to z_perm
    MODIFY_GEMINI_WITNESS,      // Tamper with a fold polynomial
    END
};

/**
 * @brief Compute the proof length for re-exporting after tampering
 * @details ProofLayout::Honk excludes IPA (handled separately by prover/verifier for rollup flavors)
 * @param num_public_inputs Number of public inputs in the proof
 * @param log_n Log of circuit size (use VIRTUAL_LOG_N for padded flavors, actual log_dyadic_size for non-padded)
 */
template <typename Flavor> size_t compute_proof_length_for_export(size_t num_public_inputs, size_t log_n)
{
    return ProofLayout::Honk<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(log_n) + num_public_inputs;
}

/**
 * @brief Test method that provides several ways to tamper with a proof.
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1298): Currently, several tests are failing due to
 * challenges not being re-computed after tampering. We need to extend this tool to allow for more elaborate tampering.
 */
template <typename InnerProver, typename InnerFlavor, typename ProofType>
void tamper_with_proof(InnerProver& inner_prover, ProofType& inner_proof, TamperType type)
{
    using FF = typename InnerFlavor::FF;
    static constexpr size_t FIRST_WITNESS_INDEX = InnerFlavor::NUM_PRECOMPUTED_ENTITIES;

    // Deserialize proof into structured form
    StructuredProof<InnerFlavor> structured_proof;
    const auto num_public_inputs = inner_prover.prover_instance->num_public_inputs();
    const size_t log_n =
        InnerFlavor::USE_PADDING ? CONST_PROOF_SIZE_LOG_N : inner_prover.prover_instance->log_dyadic_size();
    structured_proof.deserialize(inner_prover.transcript->test_get_proof_data(), num_public_inputs, log_n);

    // Apply tampering based on type
    switch (type) {
    case TamperType::MODIFY_SUMCHECK_UNIVARIATE: {
        FF delta = FF::random_element();
        // Preserve S_0(0) + S_0(1) = target_total_sum, but S_0(u_0) = S_1(0) + S_1(1) will fail
        structured_proof.sumcheck_univariates[0].value_at(0) += delta;
        structured_proof.sumcheck_univariates[0].value_at(1) -= delta;
        break;
    }
    case TamperType::MODIFY_SUMCHECK_EVAL:
        structured_proof.sumcheck_evaluations[FIRST_WITNESS_INDEX] = FF::random_element();
        break;
    case TamperType::MODIFY_Z_PERM_COMMITMENT:
        structured_proof.z_perm_comm = structured_proof.z_perm_comm * FF::random_element();
        break;
    case TamperType::MODIFY_GEMINI_WITNESS:
        structured_proof.gemini_fold_comms[0] = structured_proof.gemini_fold_comms[0] * FF::random_element();
        structured_proof.gemini_fold_evals[0] = FF::zero();
        break;
    case TamperType::END:
        break;
    }

    // Serialize back and re-export the tampered proof
    structured_proof.serialize(inner_prover.transcript->test_get_proof_data(), log_n);
    inner_prover.transcript->test_set_proof_parsing_state(
        0, compute_proof_length_for_export<InnerFlavor>(num_public_inputs, log_n));
    inner_proof = inner_prover.export_proof();
}

/**
 * @brief Tamper with a proof by modifying curve points directly in the proof vector.
 * @param inner_proof The proof vector to tamper with
 * @param end_of_proof If true, tamper with the last commitment; if false, tamper with the first pairing point
 */
template <typename InnerFlavor, typename ProofType = typename InnerFlavor::Transcript::Proof>
void tamper_with_proof(ProofType& inner_proof, bool end_of_proof)
{
    using Commitment = typename InnerFlavor::Curve::AffineElement;
    using FF = typename InnerFlavor::FF;
    using Codec = typename InnerFlavor::Transcript::Codec;

    static constexpr size_t NUM_FRS_PER_COMMITMENT = Codec::template calc_num_fields<Commitment>();

    if (end_of_proof) {
        // Tamper with the last commitment in the proof
        size_t offset = inner_proof.size() - NUM_FRS_PER_COMMITMENT;
        auto element_span = std::span{ inner_proof }.subspan(offset, NUM_FRS_PER_COMMITMENT);
        auto commitment = Codec::template deserialize_from_fields<Commitment>(element_span);
        commitment = commitment * FF(2);
        auto serialized = Codec::serialize_to_fields(commitment);
        std::copy(serialized.begin(), serialized.end(), inner_proof.begin() + static_cast<std::ptrdiff_t>(offset));
    } else {
        // Tamper with the first pairing point (P0) by adding the generator
        using PP = bb::PairingPoints<typename InnerFlavor::Curve>;
        static constexpr size_t NUM_FRS = Codec::template calc_num_fields<PP>();

        if (inner_proof.size() >= NUM_FRS) {
            auto pp_span = std::span{ inner_proof }.subspan(0, NUM_FRS);
            PP pairing_points = Codec::template deserialize_from_fields<PP>(pp_span);
            pairing_points.P0() = pairing_points.P0() + Commitment::one();
            auto serialized = Codec::serialize_to_fields(pairing_points);
            std::copy(serialized.begin(), serialized.end(), inner_proof.begin());
        }
    }
}

} // namespace bb
