#pragma once

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/honk/sumcheck/polynomials/univariate.hpp"
#include "barretenberg/honk/transcript/transcript.hpp"

#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

//TODO(luke): this namespace will be sensible once stdlib is moved out of the plonk namespace
namespace proof_system::plonk::stdlib::recursion::honk {
template <typename Builder> class Transcript {
  public:
    using field_pt = field_t<Builder>;
    using witness_pt = witness_t<Builder>;
    using fq_pt = bigfield<Builder, barretenberg::Bn254FqParams>;
    using group_pt = element<Builder, fq_pt, field_pt, barretenberg::g1>;
    using FF = barretenberg::fr;
    using Commitment = barretenberg::g1::affine_element;
    using VerifierTranscript = proof_system::honk::VerifierTranscript<FF>;
    template <size_t LENGTH> using Univariate = proof_system::honk::sumcheck::Univariate<FF, LENGTH>;

    static constexpr size_t HASH_OUTPUT_SIZE = 32; // WORKTODO: Duplicated from native transcript

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
    template <typename... Strings> std::array<field_pt, sizeof...(Strings)> get_challenges(const Strings&... labels)
    {
        // Compute the indicated challenges from the native transcript
        constexpr size_t num_challenges = sizeof...(Strings);
        std::array<FF, num_challenges> native_challenges{};
        native_challenges = native_transcript.get_challenges(labels...);

        /*
         * TODO(luke): Do stdlib hashing here. E.g., for the current pedersen/blake setup, we could write data into a
         * byte_array as it is received from prover, then compress via pedersen and apply blake3s. Not doing this now
         * since it's a pain and we'll be revamping our hashing anyway. For now, simply convert the native hashes to
         * stdlib types without adding any hashing constraints.
         */
        std::array<field_pt, num_challenges> challenges;
        for (size_t i = 0; i < num_challenges; ++i) {
            challenges[i] = native_challenges[i];
        }

        return challenges;
    }

    /**
     * @brief Compute the single challenge indicated by the input label
     *
     * @param label Name of challenge
     * @return field_pt Challenge
     */
    field_pt get_challenge(const std::string& label)
    {
        // Compute the indicated challenge from the native transcript
        auto native_challenge = native_transcript.get_challenge(label);

        // TODO(luke): Stdlib hashing here...

        return field_pt(native_challenge);
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

  private:
    // Series of overloaded methods for converting native types extracted from the native transcript to the
    // corresponding stdlib type for output.
    // TODO(luke): Eventually these can also add data to a buffer (byte_array) to be hashed.

    /**
     * @brief Construct stdlib field from uint32_t
     *
     * @param element
     * @return field_pt
     */
    field_pt stdlib_type_from_witness(uint32_t native_element)
    {
        auto element = witness_pt(builder, native_element);

        return element;
    }

    /**
     * @brief Construct stdlib field from native field type
     *
     * @param native_element
     * @return field_pt
     */
    field_pt stdlib_type_from_witness(FF native_element)
    {
        auto element = witness_pt(builder, native_element);

        return element;
    }

    /**
     * @brief Construct stdlib group from native affine group element type
     *
     * @param native_element
     * @return field_pt
     */
    group_pt stdlib_type_from_witness(Commitment native_element)
    {
        auto element = group_pt::from_witness(builder, native_element);

        return element;
    }

    /**
     * @brief Construct field_t array from native field array
     * @param native_element Array of FF
     * @return std::array<field_pt, LENGTH>
     */
    template <size_t LENGTH> std::array<field_pt, LENGTH> stdlib_type_from_witness(std::array<FF, LENGTH> native_element)
    {
        std::array<field_pt, LENGTH> element;
        for (size_t i = 0; i < LENGTH; ++i) {
            element[i] = witness_pt(builder, native_element[i]);
        }
        return element;
    }

    /**
     * @brief Construct field_t array from native Univariate type
     * TODO(luke): do we need a stdlib Univariate or is std::array<field_t> good enough?
     * @param native_element
     * @return std::array<field_pt, LENGTH>
     */
    template <size_t LENGTH> std::array<field_pt, LENGTH> stdlib_type_from_witness(Univariate<LENGTH> native_element)
    {
        std::array<field_pt, LENGTH> element;
        for (size_t i = 0; i < LENGTH; ++i) {
            element[i] = witness_pt(builder, native_element.value_at(i));
        }
        return element;
    }
};
} // namespace proof_system::plonk::stdlib::recursion::honk
