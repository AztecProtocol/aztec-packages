// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/flavor_concepts.hpp"
#include <cstddef>
namespace bb {
enum class TamperType {
    MODIFY_SUMCHECK_UNIVARIATE, // Tamper with coefficients of a Sumcheck Round Univariate
    MODIFY_SUMCHECK_EVAL,       // Tamper with a multilinear evaluation of an entity
    MODIFY_Z_PERM_COMMITMENT,   // Tamper with the commitment to z_perm
    MODIFY_GEMINI_WITNESS,      // Tamper with a fold polynomial
    END
};

/**
 * @brief Test method that provides several ways to tamper with a proof.
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1298): Currently, several tests are failing due to
 * challenges not being re-computed after tampering. We need to extend this tool to allow for more elaborate tampering.
 *
 * @tparam InnerProver
 * @tparam InnerFlavor
 * @tparam ProofType
 * @param inner_prover
 * @param inner_proof
 * @param type
 */
template <typename InnerProver, typename InnerFlavor, typename ProofType>
void tamper_with_proof(InnerProver& inner_prover, ProofType& inner_proof, TamperType type)
{
    using InnerFF = typename InnerFlavor::FF;
    static constexpr size_t FIRST_WITNESS_INDEX = InnerFlavor::NUM_PRECOMPUTED_ENTITIES;

    // Deserialize the transcript into the struct so that we can tamper it
    auto num_public_inputs = inner_prover.prover_instance->num_public_inputs();
    inner_prover.transcript->deserialize_full_transcript(num_public_inputs);

    switch (type) {

    case TamperType::MODIFY_SUMCHECK_UNIVARIATE: {
        InnerFF random_value = InnerFF::random_element();
        // Preserve the S_0(0) + S_0(1) = target_total_sum = 0, but the check S_0(u_0) = S_1(0) + S_1(1) would fail whp.
        // The branching is due to the Flavor structure.
        if constexpr (!InnerFlavor::HasZK) {
            inner_prover.transcript->sumcheck_univariates[0].value_at(0) += random_value;
            inner_prover.transcript->sumcheck_univariates[0].value_at(1) -= random_value;
        } else {
            inner_prover.transcript->zk_sumcheck_univariates[0].value_at(0) += random_value;
            inner_prover.transcript->zk_sumcheck_univariates[0].value_at(1) -= random_value;
        }
        break;
    }

    case TamperType::MODIFY_SUMCHECK_EVAL:
        // Corrupt the evaluation of the first witness. Captures that the check full_honk_purported_value =
        // round.target_total_sum is performed in-circuit.
        inner_prover.transcript->sumcheck_evaluations[FIRST_WITNESS_INDEX] = InnerFF::random_element();
        break;

    case TamperType::MODIFY_Z_PERM_COMMITMENT:
        // Tamper with the commitment to z_perm.
        inner_prover.transcript->z_perm_comm = inner_prover.transcript->z_perm_comm * InnerFF::random_element();
        break;

    case TamperType::MODIFY_GEMINI_WITNESS: {
        InnerFF random_scalar = InnerFF::random_element();
        // Tamper with the first fold commitment. In non-ZK cases, could only be captured by the pairing check.
        inner_prover.transcript->gemini_fold_comms[0] = inner_prover.transcript->gemini_fold_comms[0] * random_scalar;
        inner_prover.transcript->gemini_fold_evals[0] *= 0;
        break;
    }
    case TamperType::END: {
        break;
    }
    }

    // Serialize transcript
    // As inner_proof is extracted with export_proof, the internal values of inner_prover.transcript are reset
    // Therefore, if we were to call export_proof without overriding num_frs_written and proof_start, the proof would
    // be empty. This is a hack, we should probably have a better way of tampering with proofs.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1411) Use std::unordered map in Transcript so that we
    // can access/modify elements of a proof more easily
    inner_prover.transcript->serialize_full_transcript();
    inner_prover.transcript->proof_start = 0;
    inner_prover.transcript->num_frs_written = InnerFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() + num_public_inputs;
    if (HasIPAAccumulator<InnerFlavor>) {
        // Exclude the IPA points from the proof - they are added again by export_proof
        inner_prover.transcript->num_frs_written -= IPA_PROOF_LENGTH;
    }

    // Extract the tampered proof
    inner_proof = inner_prover.export_proof();
}

/**
 * @brief Tamper with a proof by modifying the first pairing point to be P+G (where G is the generator).
 * This keeps the point on the curve but makes the proof invalid.
 *
 */
template <typename InnerProver, typename InnerFlavor, typename ProofType>
void tamper_with_proof(ProofType& inner_proof, bool end_of_proof)
{
    using Commitment = typename InnerFlavor::Curve::AffineElement;
    using FF = typename InnerFlavor::FF;
    using ProofFF = typename ProofType::value_type;

    if (!end_of_proof) {
        // Tamper with the first pairing point (P0) by adding the generator
        // The number of field elements per point depends on the curve:
        // - BN254: 8 field elements (4 limbs per coordinate)
        // - Grumpkin: 2 field elements (1 per coordinate)
        constexpr size_t FRS_PER_POINT = Commitment::PUBLIC_INPUTS_SIZE;
        constexpr size_t NUM_LIMB_BITS = bb::stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;

        if (inner_proof.size() >= FRS_PER_POINT) {
            // Deserialize P0 from proof using the native reconstruct_from_public method
            std::array<ProofFF, FRS_PER_POINT> p0_limbs;
            std::copy_n(inner_proof.begin(), FRS_PER_POINT, p0_limbs.begin());
            Commitment P0 = Commitment::reconstruct_from_public(p0_limbs);

            // Tamper: P0 + G (still on curve, but invalid for verification)
            Commitment tampered_point = P0 + Commitment::one();

            // Manually serialize tampered point back to proof based on curve type
            if constexpr (FRS_PER_POINT == 8) {
                // BN254: Serialize using bigfield representation (4 limbs of 68 bits each per coordinate)
                constexpr uint256_t LIMB_MASK = (uint256_t(1) << NUM_LIMB_BITS) - 1;

                uint256_t x_val = uint256_t(tampered_point.x);
                inner_proof[0] = ProofFF(x_val & LIMB_MASK);
                inner_proof[1] = ProofFF((x_val >> NUM_LIMB_BITS) & LIMB_MASK);
                inner_proof[2] = ProofFF((x_val >> (2 * NUM_LIMB_BITS)) & LIMB_MASK);
                inner_proof[3] = ProofFF((x_val >> (3 * NUM_LIMB_BITS)) & LIMB_MASK);

                uint256_t y_val = uint256_t(tampered_point.y);
                inner_proof[4] = ProofFF(y_val & LIMB_MASK);
                inner_proof[5] = ProofFF((y_val >> NUM_LIMB_BITS) & LIMB_MASK);
                inner_proof[6] = ProofFF((y_val >> (2 * NUM_LIMB_BITS)) & LIMB_MASK);
                inner_proof[7] = ProofFF((y_val >> (3 * NUM_LIMB_BITS)) & LIMB_MASK);
            } else if constexpr (FRS_PER_POINT == 2) {
                // Grumpkin: Serialize directly (1 field element per coordinate)
                inner_proof[0] = ProofFF(tampered_point.x);
                inner_proof[1] = ProofFF(tampered_point.y);
            } else {
                static_assert(FRS_PER_POINT == 8 || FRS_PER_POINT == 2,
                              "Unsupported curve: FRS_PER_POINT must be 8 (BN254) or 2 (Grumpkin)");
            }
        }
    } else {
        // Manually deserialize, modify, and serialize the last commitment contained in the proof.
        static constexpr size_t num_frs_comm = FrCodec::calc_num_fields<Commitment>();
        size_t offset = inner_proof.size() - num_frs_comm;

        auto element_frs = std::span{ inner_proof }.subspan(offset, num_frs_comm);
        auto last_commitment = NativeTranscript::deserialize<Commitment>(element_frs);
        last_commitment = last_commitment * FF(2);
        auto last_commitment_reserialized = NativeTranscript::serialize(last_commitment);
        std::copy(last_commitment_reserialized.begin(),
                  last_commitment_reserialized.end(),
                  inner_proof.begin() + static_cast<std::ptrdiff_t>(offset));
    }
}
} // namespace bb
