#pragma once

#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/flavor/test_utils/proof_structures.hpp"
#include "barretenberg/honk/proof_layout.hpp"

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
 * @details Excludes IPA proof length for flavors with IPA accumulator since it's added again by export_proof
 */
template <typename Flavor> size_t compute_proof_length_for_export(size_t num_public_inputs)
{
    size_t num_frs = ProofLayout::Honk<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(Flavor::VIRTUAL_LOG_N) + num_public_inputs;
    // ProofLayout::Honk already includes IPA for rollup flavors, but export_proof adds it again,
    // so we subtract it here
    if constexpr (HasIPAAccumulator<Flavor>) {
        num_frs -= IPA_PROOF_LENGTH;
    }
    return num_frs;
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
        0, compute_proof_length_for_export<InnerFlavor>(num_public_inputs));
    inner_proof = inner_prover.export_proof();
}

/**
 * @brief Tamper with a proof by modifying curve points directly in the proof vector.
 * @param inner_proof The proof vector to tamper with
 * @param end_of_proof If true, tamper with the last commitment; if false, tamper with the first pairing point
 */
template <typename InnerProver, typename InnerFlavor, typename ProofType = typename InnerFlavor::Transcript::Proof>
void tamper_with_proof(ProofType& inner_proof, bool end_of_proof)
{
    using Commitment = typename InnerFlavor::Curve::AffineElement;
    using FF = typename InnerFlavor::FF;
    using ProofFF = typename ProofType::value_type;
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
        // Pairing points use a different encoding (reconstruct_from_public) than regular commitments
        static constexpr size_t FRS_PER_POINT = Commitment::PUBLIC_INPUTS_SIZE;
        static constexpr size_t NUM_LIMB_BITS = bb::stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;

        if (inner_proof.size() >= FRS_PER_POINT) {
            // Deserialize P0 using the native reconstruct_from_public method
            std::array<ProofFF, FRS_PER_POINT> p0_limbs;
            std::copy_n(inner_proof.begin(), FRS_PER_POINT, p0_limbs.begin());
            Commitment P0 = Commitment::reconstruct_from_public(p0_limbs);

            // Tamper: P0 + G (still on curve, but invalid for verification)
            Commitment tampered = P0 + Commitment::one();

            // Serialize back based on curve type
            if constexpr (FRS_PER_POINT == 8) {
                // BN254: 4 limbs per coordinate
                constexpr uint256_t LIMB_MASK = (uint256_t(1) << NUM_LIMB_BITS) - 1;
                uint256_t x_val = uint256_t(tampered.x);
                uint256_t y_val = uint256_t(tampered.y);
                for (size_t i = 0; i < 4; ++i) {
                    inner_proof[i] = ProofFF((x_val >> (i * NUM_LIMB_BITS)) & LIMB_MASK);
                    inner_proof[i + 4] = ProofFF((y_val >> (i * NUM_LIMB_BITS)) & LIMB_MASK);
                }
            } else if constexpr (FRS_PER_POINT == 2) {
                // Grumpkin: 1 field element per coordinate
                inner_proof[0] = ProofFF(tampered.x);
                inner_proof[1] = ProofFF(tampered.y);
            } else {
                static_assert(FRS_PER_POINT == 8 || FRS_PER_POINT == 2,
                              "Unsupported curve: FRS_PER_POINT must be 8 (BN254) or 2 (Grumpkin)");
            }
        }
    }
}

} // namespace bb
