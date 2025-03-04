#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include <vector>

namespace bb {

// Where the public inputs start within a proof (after circuit_size, num_pub_inputs, pub_input_offset)
static constexpr size_t HONK_PROOF_PUBLIC_INPUT_OFFSET = 0;

using HonkProof = std::vector<bb::fr>; // this can be fr?
struct ECCVMProof {
    HonkProof pre_ipa_proof;
    HonkProof ipa_proof;

    MSGPACK_FIELDS(pre_ipa_proof, ipa_proof);
};

template <typename Builder> using StdlibProof = std::vector<bb::stdlib::field_t<Builder>>;

} // namespace bb
