// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

namespace bb {

struct GoblinWithoutMergeProof {

    HonkProof eccvm_proof;
    HonkProof ipa_proof;
    HonkProof translator_proof;

    size_t size() const { return eccvm_proof.size() + ipa_proof.size() + translator_proof.size(); };

    SERIALIZATION_FIELDS(eccvm_proof, ipa_proof, translator_proof);
    bool operator==(const GoblinWithoutMergeProof& other) const = default;
};
using GoblinAvmProof = GoblinWithoutMergeProof;

template <typename BuilderType = UltraCircuitBuilder> struct GoblinWithoutMergeStdlibProof_ {
    using Proof = stdlib::Proof<BuilderType>;
    Proof eccvm_proof;
    Proof ipa_proof;
    Proof translator_proof;

    size_t size() const { return eccvm_proof.size() + ipa_proof.size() + translator_proof.size(); };
    GoblinWithoutMergeStdlibProof_() = default;
    GoblinWithoutMergeStdlibProof_(BuilderType& builder, const GoblinWithoutMergeProof& goblin_proof)
        : eccvm_proof(builder, goblin_proof.eccvm_proof)
        , ipa_proof(builder, goblin_proof.ipa_proof)
        , translator_proof(builder, goblin_proof.translator_proof)
    {}
    bool operator==(const GoblinWithoutMergeStdlibProof_& other) const = default;
};
using GoblinWithoutMergeStdlibProof = GoblinWithoutMergeStdlibProof_<UltraCircuitBuilder>;
using GoblinAvmStdlibProof = GoblinWithoutMergeStdlibProof;
} // namespace bb
