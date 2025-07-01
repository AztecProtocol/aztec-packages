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
struct PublicInputsAndProof {
    PublicInputsVector public_inputs;
    HonkProof proof;

    MSGPACK_FIELDS(public_inputs, proof);
};
struct ECCVMProof {
    HonkProof pre_ipa_proof;
    HonkProof ipa_proof;

    MSGPACK_FIELDS(pre_ipa_proof, ipa_proof);
};
template <typename Builder> using StdlibPublicInputsVector = std::vector<bb::stdlib::field_t<Builder>>;
template <typename Builder> using StdlibProof = std::vector<bb::stdlib::field_t<Builder>>;

} // namespace bb
