// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include <vector>

namespace bb {

using PublicInputsVector = std::vector<fr>;
using HonkProof = std::vector<fr>;
template <typename Proof> struct PublicInputsAndProof {
    PublicInputsVector public_inputs;
    Proof proof;

    MSGPACK_FIELDS(public_inputs, proof);
    bool operator==(const PublicInputsAndProof&) const = default;
};
struct ECCVMProof {
    HonkProof pre_ipa_proof;
    HonkProof ipa_proof;

    size_t size() const { return pre_ipa_proof.size() + ipa_proof.size(); }

    MSGPACK_FIELDS(pre_ipa_proof, ipa_proof);
    bool operator==(const ECCVMProof&) const = default;
};
template <typename Builder> using StdlibPublicInputsVector = std::vector<bb::stdlib::field_t<Builder>>;

} // namespace bb
