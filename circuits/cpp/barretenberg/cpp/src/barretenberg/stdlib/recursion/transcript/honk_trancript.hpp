#pragma once

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
// #include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/honk/transcript/transcript.hpp"

#include "../../commitment/pedersen/pedersen.hpp"
#include "../../commitment/pedersen/pedersen_plookup.hpp"
#include "../../hash/blake3s/blake3s.hpp"
#include "../../primitives/bigfield/bigfield.hpp"
#include "../../primitives/biggroup/biggroup.hpp"
#include "../../primitives/bool/bool.hpp"
#include "../../primitives/curves/bn254.hpp"
#include "../../primitives/field/field.hpp"
#include "../../primitives/witness/witness.hpp"
#include "../verification_key/verification_key.hpp"

namespace proof_system::plonk::stdlib::recursion::honk {
template <typename Builder> class Transcript {
  public:
    using field_pt = field_t<Builder>;
    using witness_pt = witness_t<Builder>;
    using fq_pt = bigfield<Builder, barretenberg::Bn254FqParams>;
    using group_pt = element<Builder, fq_pt, field_pt, barretenberg::g1>;
    using Key = verification_key<stdlib::bn254<Builder>>;
    using FF = barretenberg::fr;
    using VerifierTranscript = proof_system::honk::VerifierTranscript<FF>;

    VerifierTranscript native_transcript;

    Transcript(auto proof_data)
        : native_transcript(proof_data){};

    auto get_manifest() const { return native_transcript.get_manifest(); };

    template <typename... Strings> std::array<FF, sizeof...(Strings)> get_challenges(const Strings&... labels)
    {
        constexpr size_t num_challenges = sizeof...(Strings);
        std::array<FF, num_challenges> challenges{};
        challenges = native_transcript.get_challenges(labels...);
        return challenges;
    }

    FF get_challenge(const std::string& label) 
    {
      auto challenge = native_transcript.get_challenge(label);
      return challenge;
    }

    template <class T> T receive_from_prover(const std::string& label)
    {
        T element = native_transcript.template receive_from_prover<T>(label);
        return element;
    }
};
} // namespace proof_system::plonk::stdlib::recursion::honk
