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
    using byte_array = byte_array<Builder>;
    using Key = verification_key<stdlib::bn254<Builder>>;
    using FF = barretenberg::fr;
    using Commitment = barretenberg::g1::affine_element;
    using VerifierTranscript = proof_system::honk::VerifierTranscript<FF>;

    static constexpr size_t HASH_OUTPUT_SIZE = 32; // WORKTODO: Duplicated from native transcript

    VerifierTranscript native_transcript;
    Builder* builder;
    // maximum number of bytes we can store in a field element w/o wrapping modulus is 31.
    // while we could store more *bits*, we want `preimage_buffer` to mirror how data is formatted
    // when we serialize field/group elements natively (i.e. a byte array)
    static constexpr size_t NUM_BITS_PER_PREIMAGE_ELEMENT = 31UL * 8UL;
    PedersenPreimageBuilder<Builder, NUM_BITS_PER_PREIMAGE_ELEMENT> preimage_buffer;

    Transcript(Builder* builder, auto proof_data)
        : native_transcript(proof_data)
        , builder(builder)
        , preimage_buffer(builder){};

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
    field_pt get_challenge(const std::string& label)
    {
        // Compute the indicated challenge from the native transcript
        // WORKTODO: need to call this to update native transcript but maybe dont need the native challenge itself
        [[maybe_unused]] auto native_challenge = native_transcript.get_challenge(label);

        // Stdlib Fiat-Shamir
        // Compress buffer via pedersen then hash the result using Blake3s
        field_pt compressed_buffer = preimage_buffer.compress(0);
        auto buffer_bytes = byte_array(compressed_buffer);
        auto challenge_buffer = blake3s(buffer_bytes);

        auto current_challenge = field_pt(challenge_buffer.slice(0, HASH_OUTPUT_SIZE));

        info("native_challenge = ", native_challenge);
        info("current_challenge = ", current_challenge.get_value());


        preimage_buffer.clear();
        preimage_buffer.add_element(current_challenge);

        return current_challenge;
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
    field_pt stdlib_type_from_witness(uint32_t native_element)
    {
        auto element = witness_pt(builder, native_element);

        // WORKTODO: do something special here for the uint32_t?
        preimage_buffer.add_element(element);

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

        preimage_buffer.add_element(element);

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

        add_commitment_to_preimage_buffer(element);

        return element; 
    }

    /**
     * @brief Add an EC point / commitment to the pedersen preimage buffer
     * 
     * @param point 
     */
    void add_commitment_to_preimage_buffer(group_pt& point)
    {
        const auto& x = point.x;
        const auto& y = point.y;
        constexpr size_t last_limb_bits = 256 - (fq_pt::NUM_LIMB_BITS * 3);
        preimage_buffer.add_element_with_existing_range_constraint(y.binary_basis_limbs[3].element,
                                                                    last_limb_bits);
        preimage_buffer.add_element_with_existing_range_constraint(y.binary_basis_limbs[2].element,
                                                                    fq_pt::NUM_LIMB_BITS);
        preimage_buffer.add_element_with_existing_range_constraint(y.binary_basis_limbs[1].element,
                                                                    fq_pt::NUM_LIMB_BITS);
        preimage_buffer.add_element_with_existing_range_constraint(y.binary_basis_limbs[0].element,
                                                                    fq_pt::NUM_LIMB_BITS);
        preimage_buffer.add_element_with_existing_range_constraint(x.binary_basis_limbs[3].element,
                                                                    last_limb_bits);
        preimage_buffer.add_element_with_existing_range_constraint(x.binary_basis_limbs[2].element,
                                                                    fq_pt::NUM_LIMB_BITS);
        preimage_buffer.add_element_with_existing_range_constraint(x.binary_basis_limbs[1].element,
                                                                    fq_pt::NUM_LIMB_BITS);
        preimage_buffer.add_element_with_existing_range_constraint(x.binary_basis_limbs[0].element,
                                                                    fq_pt::NUM_LIMB_BITS);
    }

};
} // namespace proof_system::plonk::stdlib::recursion::honk
