#pragma once

#include <cstddef>

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
    switch (type) {

    case TamperType::MODIFY_SUMCHECK_UNIVARIATE: {
        inner_prover.transcript->deserialize_full_transcript(inner_prover.proving_key->proving_key.num_public_inputs);
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
        inner_prover.transcript->serialize_full_transcript();
        break;
    }

    case TamperType::MODIFY_SUMCHECK_EVAL:
        inner_prover.transcript->deserialize_full_transcript(inner_prover.proving_key->proving_key.num_public_inputs);
        // Corrupt the evaluation of the first witness. Captures that the check full_honk_purported_value =
        // round.target_total_sum is performed in-circuit.
        inner_prover.transcript->sumcheck_evaluations[FIRST_WITNESS_INDEX] = InnerFF::random_element();
        inner_prover.transcript->serialize_full_transcript();
        break;

    case TamperType::MODIFY_Z_PERM_COMMITMENT:
        inner_prover.transcript->deserialize_full_transcript(inner_prover.proving_key->proving_key.num_public_inputs);
        // Tamper with the commitment to z_perm.
        inner_prover.transcript->z_perm_comm = inner_prover.transcript->z_perm_comm * InnerFF::random_element();
        inner_prover.transcript->serialize_full_transcript();
        break;

    case TamperType::MODIFY_GEMINI_WITNESS: {
        inner_prover.transcript->deserialize_full_transcript(inner_prover.proving_key->proving_key.num_public_inputs);
        InnerFF random_scalar = InnerFF::random_element();
        // Tamper with the first fold commitment. In non-ZK cases, could only be captured by the pairing check.
        inner_prover.transcript->gemini_fold_comms[0] = inner_prover.transcript->gemini_fold_comms[0] * random_scalar;
        inner_prover.transcript->gemini_fold_evals[0] *= 0;
        inner_prover.transcript->serialize_full_transcript();
        break;
    }
    case TamperType::END: {
        break;
    }
    }
    // Re-export proof after tampering
    inner_proof = inner_prover.export_proof();
}
