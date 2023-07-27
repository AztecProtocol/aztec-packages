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
    using Commitment = barretenberg::g1::affine_element;
    using VerifierTranscript = proof_system::honk::VerifierTranscript<FF>;

    VerifierTranscript native_transcript;
    Builder* builder;

    Transcript(Builder* builder, auto proof_data)
        : native_transcript(proof_data)
        , builder(builder){};

    /**
     * @brief Get the underlying native transcript manifest (primarily for debugging)
     * 
     */
    auto get_manifest() const { return native_transcript.get_manifest(); };

    /**
     * @brief Compute the challenges (more than 1) indicated by labels
     * 
     * @tparam Strings 
     * @param labels Names of the challenges to be computed
     * @return std::array<FF, sizeof...(Strings)> Array of challenges
     */
    template <typename... Strings> std::array<FF, sizeof...(Strings)> get_challenges(const Strings&... labels)
    {
        // Compute the indicated challenges from the native transcript
        constexpr size_t num_challenges = sizeof...(Strings);
        std::array<FF, num_challenges> challenges{};
        challenges = native_transcript.get_challenges(labels...);

        // Do stdlib version of fiat-shamir here..

        return challenges;
    }

    /**
     * @brief Compute the single challenge indicated by the input label
     * 
     * @param label Name of challenge
     * @return FF Challenge
     */
    FF get_challenge(const std::string& label)
    {
        // Compute the indicated challenge from the native transcript
        auto challenge = native_transcript.get_challenge(label);

        // Do stdlib version of fiat-shamir here..

        return challenge;
    }

    /**
     * @brief Extract a native element from the transcript and return a corresponding stdlib type
     * 
     * @tparam T Type of the native element to be extracted
     * @param label Name of the element
     * @return The corresponding element of appropriate stdlib type
     */
    template <class T> auto receive_from_prover(const std::string& label)
    {
        // Extract the native element from the native transcript
        T element = native_transcript.template receive_from_prover<T>(label);

        // Add variables corresponding to the witness element and return the corresponding stdlib type
        return stdlib_type_from_witness(element);
    }

    /**
     * @brief Construct stdlib field from uint32_t
     * 
     * @param element 
     * @return field_pt 
     */
    field_pt stdlib_type_from_witness(uint32_t element)
    {
        return witness_pt(builder, element);
    }

    /**
     * @brief Construct stdlib field from native field type
     * 
     * @param element 
     * @return field_pt 
     */
    field_pt stdlib_type_from_witness(FF element)
    {
        return witness_pt(builder, element);
    }

    /**
     * @brief Construct stdlib group from native affine group element type
     * 
     * @param element 
     * @return field_pt 
     */
    group_pt stdlib_type_from_witness(Commitment element)
    {
        return group_pt::from_witness(builder, element);
    }

};
} // namespace proof_system::plonk::stdlib::recursion::honk
