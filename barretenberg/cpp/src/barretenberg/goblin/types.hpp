// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

namespace bb {
struct GoblinAccumulationOutput {
    HonkProof proof;
    std::shared_ptr<MegaFlavor::VerificationKey> verification_key;
};

struct GoblinProof {
    HonkProof merge_proof;      // Merge proof on the shared Goblin transcript
    HonkProof eccvm_proof;      // ECCVM proof on the shared Goblin transcript
    HonkProof ipa_proof;        // TripleIPA proof on a separate transcript
    HonkProof translator_proof; // Translator proof on the shared Goblin transcript

    size_t size() const
    {
        return merge_proof.size() + eccvm_proof.size() + ipa_proof.size() + translator_proof.size();
    };

    SERIALIZATION_FIELDS(merge_proof, eccvm_proof, ipa_proof, translator_proof);
    bool operator==(const GoblinProof& other) const = default;
};

struct GoblinStdlibProof {
    using Proof = stdlib::Proof<UltraCircuitBuilder>;
    Proof merge_proof;
    Proof eccvm_proof;
    Proof ipa_proof;
    Proof translator_proof;

    size_t size() const
    {
        return merge_proof.size() + eccvm_proof.size() + ipa_proof.size() + translator_proof.size();
    };
    GoblinStdlibProof() = default;
    GoblinStdlibProof(UltraCircuitBuilder& builder, const GoblinProof& goblin_proof)
        : merge_proof(builder, goblin_proof.merge_proof)
        , eccvm_proof(builder, goblin_proof.eccvm_proof)
        , ipa_proof(builder, goblin_proof.ipa_proof)
        , translator_proof(builder, goblin_proof.translator_proof)
    {}
    bool operator==(const GoblinStdlibProof& other) const = default;
};
} // namespace bb
