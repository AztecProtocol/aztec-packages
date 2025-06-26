// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"

namespace bb {
struct GoblinAccumulationOutput {
    HonkProof proof;
    std::shared_ptr<MegaFlavor::VerificationKey> verification_key;
};

struct GoblinProof {
    HonkProof merge_proof;
    ECCVMProof eccvm_proof;
    HonkProof translator_proof;

    size_t size() const
    {
        return merge_proof.size() + eccvm_proof.pre_ipa_proof.size() + eccvm_proof.ipa_proof.size() +
               translator_proof.size();
    };

    bool operator==(const GoblinProof& other) const = default;
    MSGPACK_FIELDS(merge_proof, eccvm_proof, translator_proof);
};
} // namespace bb
