// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

namespace bb {

struct GoblinAvmProof {

    HonkProof eccvm_proof;
    HonkProof ipa_proof;
    HonkProof translator_proof;

    size_t size() const { return eccvm_proof.size() + ipa_proof.size() + translator_proof.size(); };

    MSGPACK_FIELDS(eccvm_proof, ipa_proof, translator_proof);
    bool operator==(const GoblinAvmProof& other) const = default;
};

struct GoblinAvmStdlibProof {
    using Proof = stdlib::Proof<UltraCircuitBuilder>;
    Proof eccvm_proof;
    Proof ipa_proof;
    Proof translator_proof;

    size_t size() const { return eccvm_proof.size() + ipa_proof.size() + translator_proof.size(); };
    GoblinAvmStdlibProof() = default;
    GoblinAvmStdlibProof(UltraCircuitBuilder& builder, const GoblinAvmProof& goblin_proof)
        : eccvm_proof(builder, goblin_proof.eccvm_proof)
        , ipa_proof(builder, goblin_proof.ipa_proof)
        , translator_proof(builder, goblin_proof.translator_proof)
    {}
    bool operator==(const GoblinAvmStdlibProof& other) const = default;
};
} // namespace bb
