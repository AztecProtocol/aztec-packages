#pragma once

#include <cstddef>

enum class TamperType {
    MODIFY_SUMCHECK_UNIVARIATE,
    MODIFY_SUMCHECK_EVAL,     // Change a sumcheck evaluation
    MODIFY_Z_PERM_COMMITMENT, // Tamper with commitment
    MODIFY_GEMINI_WITNESS,
    END
};

template <typename InnerProver, typename InnerFlavor, typename ProofType>
void tamper_proof(InnerProver& inner_prover, ProofType& inner_proof, TamperType type)
{
    using InnerCommitment = typename InnerFlavor::Commitment;
    using InnerFF = typename InnerFlavor::FF;
    static constexpr size_t FIRST_WITNESS_INDEX = InnerFlavor::NUM_PRECOMPUTED_ENTITIES;
    switch (type) {

    case TamperType::MODIFY_SUMCHECK_UNIVARIATE: {
        inner_prover.transcript->deserialize_full_transcript(inner_prover.proving_key->proving_key.num_public_inputs);
        InnerFF random_value = InnerFF::random_element();
        // Preserve the sum of evaluations. Must fail in the second round of sumcheck.
        inner_prover.transcript->sumcheck_univariates[0].value_at(0) += random_value;
        inner_prover.transcript->sumcheck_univariates[0].value_at(1) -= random_value;
        inner_prover.transcript->serialize_full_transcript();
        break;
    }

    case TamperType::MODIFY_SUMCHECK_EVAL:
        inner_prover.transcript->deserialize_full_transcript(inner_prover.proving_key->proving_key.num_public_inputs);
        // Corrupt the evaluation of the first witness. Must lead to full_honk_purported_value not being equal to the
        // evaluation of the last sumcheck univariate at the challenge.
        inner_prover.transcript->sumcheck_evaluations[FIRST_WITNESS_INDEX + 1] = InnerFF::random_element();
        inner_prover.transcript->serialize_full_transcript();
        break;

    case TamperType::MODIFY_Z_PERM_COMMITMENT:
        inner_prover.transcript->deserialize_full_transcript(inner_prover.proving_key->proving_key.num_public_inputs);
        // Tamper with the commitment to z_perm. Should break the PCS round
        inner_prover.transcript->z_perm_comm = InnerCommitment::one() * InnerFF::random_element();
        inner_prover.transcript->serialize_full_transcript();
        break;

    case TamperType::MODIFY_GEMINI_WITNESS: {
        inner_prover.transcript->deserialize_full_transcript(inner_prover.proving_key->proving_key.num_public_inputs);
        InnerFF random_scalar = InnerFF::random_element();
        // Tamper with the first fold commitment.
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
