// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/debug_log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include "origin_tag.hpp"
#include "transcript_manifest.hpp"
#include <atomic>
#include <concepts>

namespace bb {

// A concept for detecting whether a type is native or in-circuit
template <typename T>
concept InCircuit = !IsAnyOf<T, bb::fr, grumpkin::fr, uint256_t>;

// A static counter for the number of transcripts created
// This is used to generate unique labels for the transcript origin tags

// 'inline' (since C++17) ensures a single shared definition with external linkage.
inline std::atomic<size_t> unique_transcript_index{ 0 };

/**
 * @brief Common transcript class for both parties. Stores the data for the current round, as well as the
 * manifest.
 */
template <typename Codec_, typename HashFunction_> class BaseTranscript {
  public:
    using Codec = Codec_;
    using HashFunction = HashFunction_;
    using DataType = typename Codec::DataType;
    using Proof = std::vector<DataType>;

    // Detects whether the transcript is in-circuit or not
    static constexpr bool in_circuit = InCircuit<DataType>;
    // A `DataType` challenge is split into two limbs that consitute challenge buffer
    static constexpr size_t CHALLENGE_BUFFER_SIZE = 2;

    BaseTranscript()
    {
        // If we are in circuit, we need to get a unique index for the transcript
        if constexpr (in_circuit) {
            transcript_index = unique_transcript_index.fetch_add(1);
        }
    }

    // Verifier-specific constructor.
    explicit BaseTranscript(const Proof& proof) { load_proof(proof); }

  protected:
    Proof proof_data; // Contains the raw data sent by the prover.

  private:
    // Friend function for secure tag context extraction
    template <typename T> friend OriginTag bb::extract_transcript_tag(const T& transcript);

    // Fiat-Shamir Round Tracking
    size_t transcript_index = 0; // Unique transcript ID (PRIVATE - access via extract_transcript_tag)
    size_t round_index = 0;      // Current FS round (PRIVATE - access via extract_transcript_tag)
    bool reception_phase = true; // Whether receiving from prover or generating challenges

    // Challenge generatopm state==
    bool is_first_challenge = true;           // Indicates if this is the first challenge this transcript is generating
    DataType previous_challenge{};            // Previous challenge buffer (default-initialized to zeros)
    std::vector<DataType> current_round_data; // Data for the current round that will be hashed to generate challenges

    // Proof parsing state
    std::ptrdiff_t proof_start = 0;
    size_t num_frs_written = 0; // Number of frs written to proof_data by the prover
    size_t num_frs_read = 0;    // Number of frs read from proof_data by the verifier
    size_t round_number = 0;    // Current round number for manifest

    // Manifest (debugging tool)
    bool use_manifest = false;   // Indicates whether the manifest is turned on (only for manifest tests)
    TranscriptManifest manifest; // Records a summary of the transcript interactions

    /**
     * @brief Compute next challenge c_next = H( Compress(c_prev || round_buffer) )
     * @details This function computes a new challenge for the current round using the previous challenge
     * and the current round data, if they exist. It clears the current_round_data if nonempty after
     * computing the challenge to minimize how much we compress. It also sets previous_challenge
     * to the current challenge buffer to set up next function call.
     * @return std::array<DataType, CHALLENGE_BUFFER_SIZE>
     */
    [[nodiscard]] std::array<DataType, CHALLENGE_BUFFER_SIZE> get_next_duplex_challenge_buffer()
    {

        std::vector<DataType> full_buffer;

        const size_t size_bump = (is_first_challenge) ? 0 : 1;

        full_buffer.resize(current_round_data.size() + size_bump);

        // concatenate the previous challenge (if this is not the first challenge) with the current round data.
        if (!is_first_challenge) {
            // if not the first challenge, we can use the previous_challenge
            full_buffer[0] = previous_challenge;
        } else {
            // Prevent challenge generation if this is the first challenge we're generating,
            // AND nothing was sent by the prover.
            BB_ASSERT(!current_round_data.empty());
            // Update is_first_challenge for the future
            is_first_challenge = false;
        }

        std::copy(current_round_data.begin(),
                  current_round_data.end(),
                  full_buffer.begin() + static_cast<std::ptrdiff_t>(size_bump));
        current_round_data.clear();

        // Hash the full buffer
        DataType new_challenge = HashFunction::hash(full_buffer);
        std::array<DataType, CHALLENGE_BUFFER_SIZE> new_challenges = Codec::split_challenge(new_challenge);
        // update previous challenge buffer for next time we call this function
        previous_challenge = new_challenge;
        return new_challenges;
    }

  protected:
    /**
     * @brief Adds challenge elements to the current_round_buffer and updates the manifest.
     *
     * @param label of the element sent
     * @param element_frs serialized
     */
    void add_element_frs_to_hash_buffer(const std::string& label, std::span<const DataType> element_frs)
    {
        if (use_manifest) {
            // Add an entry to the current round of the manifest
            manifest.add_entry(round_number, label, element_frs.size());
        }

        current_round_data.insert(current_round_data.end(), element_frs.begin(), element_frs.end());
    }

    /**
     * @brief Serializes object and appends it to proof_data
     * @details Calls to_buffer on element to serialize, and modifies proof_data object by appending the serialized
     * frs to it.
     * @tparam T
     * @param element
     * @param proof_data
     */
    template <typename T> void serialize_to_buffer(const T& element, Proof& proof_data)
    {
        auto element_frs = Codec::serialize_to_fields(element);
        proof_data.insert(proof_data.end(), element_frs.begin(), element_frs.end());
    }
    /**
     * @brief Deserializes the frs starting at offset into the typed element and returns that element.
     * @details Using the template parameter and the offset argument, this function deserializes the frs with
     * from_buffer and then increments the offset appropriately based on the number of frs that were deserialized.
     * @tparam T
     * @param proof_data
     * @param offset
     * @return T
     */
    template <typename T> T deserialize_from_buffer(const Proof& proof_data, size_t& offset) const
    {
        constexpr size_t element_fr_size = Codec::template calc_num_fields<T>();
        BB_ASSERT_LTE(offset + element_fr_size, proof_data.size());

        auto element_frs = std::span{ proof_data }.subspan(offset, element_fr_size);
        offset += element_fr_size;

        auto element = Codec::template deserialize_from_fields<T>(element_frs);

        return element;
    }

  public:
    /**
     * @brief Return the proof data starting at proof_start
     * @details This function returns the elements of the transcript in the interval [proof_start : proof_start +
     * num_frs_written] and then updates proof_start. It is useful for when two provers share a transcript, as calling
     * export_proof at the end of each provers' code returns the slices T_1, T_2 of the transcript that must be loaded
     * by the verifiers via load_proof.
     */
    std::vector<DataType> export_proof()
    {
        std::vector<DataType> result(num_frs_written);
        std::copy_n(proof_data.begin() + proof_start, num_frs_written, result.begin());
        proof_start += static_cast<std::ptrdiff_t>(num_frs_written);
        num_frs_written = 0;
        return result;
    };

    /**
     * @brief Verifier-specific method. The verifier needs to load a proof or its segment before the verification.
     *
     * @param proof
     */
    void load_proof(const std::vector<DataType>& proof)
    {
        std::copy(proof.begin(), proof.end(), std::back_inserter(proof_data));
    }

    // Return the size of proof_data
    size_t get_proof_size() { return proof_data.size(); }

    // Enables the manifest
    void enable_manifest() { use_manifest = true; }

    /**
     * @brief After all the prover messages have been sent, finalize the round by hashing all the data and then
     * create the number of requested challenges.
     * @details Challenges are generated by iteratively hashing over the previous challenge, using
     * get_next_challenge_buffer(). Note that the pairs of challenges will be 127 bits each, as in they will be
     * [127, 127, 127, 127, ...].
     *
     * @param labels human-readable names for the challenges for the manifest
     * @return std::vector<ChallengeType> challenges for this round.
     */
    template <typename ChallengeType> std::vector<ChallengeType> get_challenges(std::span<const std::string> labels)
    {
        const size_t num_challenges = labels.size();

        if (use_manifest) {
            // Add challenge labels for current round to the manifest
            for (const auto& label : labels) {
                manifest.add_challenge(round_number, label);
            }
        }

        // In case the transcript is used for recursive verification, we need to sanitize current round data so we don't
        // get an origin tag violation inside the hasher. We are doing this to ensure that the free witness tagged
        // elements that are sent to the transcript and are assigned tags externally, don't trigger the origin tag
        // security mechanism while we are hashing them
        bb::unset_free_witness_tags<in_circuit, DataType>(current_round_data);
        // Compute the new challenge buffer from which we derive the challenges.

        // Create challenges from Frs.
        std::vector<ChallengeType> challenges;
        challenges.resize(num_challenges);

        // Generate the challenges by iteratively hashing over the previous challenge.
        for (size_t i = 0; i < num_challenges / 2; i += 1) {
            std::array<DataType, CHALLENGE_BUFFER_SIZE> challenge_buffer = get_next_duplex_challenge_buffer();
            challenges[2 * i] = Codec::template convert_challenge<ChallengeType>(challenge_buffer[0]);
            challenges[(2 * i) + 1] = Codec::template convert_challenge<ChallengeType>(challenge_buffer[1]);
        }
        if ((num_challenges & 1) == 1) {
            std::array<DataType, CHALLENGE_BUFFER_SIZE> challenge_buffer = get_next_duplex_challenge_buffer();
            challenges[num_challenges - 1] = Codec::template convert_challenge<ChallengeType>(challenge_buffer[0]);
        }

        // In case the transcript is used for recursive verification, we can track proper Fiat-Shamir usage
        // We are in challenge generation mode
        if (reception_phase) {
            reception_phase = false;
        }

        // Assign origin tags to the challenges
        bb::assign_origin_tag<in_circuit>(challenges, OriginTag(transcript_index, round_index, /*is_submitted=*/false));

        // Prepare for next round.
        ++round_number;

        return challenges;
    }

    /**
     * @brief Wrapper around get_challenges to handle array of challenges
     *
     * @param array of labels human-readable names for the challenges for the manifest
     * @return std::array<ChallengeType, N> challenges for this round.
     */
    template <typename ChallengeType, size_t N>
    std::array<ChallengeType, N> get_challenges(const std::array<std::string, N>& labels)
    {
        std::span<const std::string> labels_span{ labels.data(), labels.size() };
        auto vec = get_challenges<ChallengeType>(labels_span); // calls the const-span overload
        std::array<ChallengeType, N> out{};
        std::move(vec.begin(), vec.end(), out.begin());
        return out;
    }

    /**
     * @brief Get a challenge and compute its dyadic powers [δ, δ², δ⁴, ..., δ^(2^(num_challenges-1))].
     * @details Generates num_challenges elements where each element is the square of the previous one.
     * This is Step 2 of the protocol as written in the Protogalaxy paper.
     * @param label Human-readable name for the challenge
     * @param num_challenges Number of power-of-2 powers to generate
     * @return Vector of num_challenges elements: [δ, δ², δ⁴, δ⁸, ...]
     */
    template <typename ChallengeType>
    std::vector<ChallengeType> get_dyadic_powers_of_challenge(const std::string& label, size_t num_challenges)
    {
        ChallengeType challenge = get_challenge<ChallengeType>(label);
        std::vector<ChallengeType> pows(num_challenges);
        pows[0] = challenge;
        for (size_t i = 1; i < num_challenges; i++) {
            pows[i] = pows[i - 1].sqr();
        }
        return pows;
    }

    /**
     * @brief Adds an element to the transcript.
     * @details Serializes the element to frs and adds it to the current_round_data buffer. Does NOT add the element to
     * the proof.
     *
     * @param label Human-readable name for the challenge.
     * @param element Element to be added.
     */
    template <class T> void add_to_hash_buffer(const std::string& label, const T& element)
    {
        DEBUG_LOG(label, element);
        // In case the transcript is used for recursive verification, we can track proper Fiat-Shamir usage
        // The verifier is receiving data from the prover. If before this we were in the challenge generation phase,
        // then we need to increment the round index
        if (!reception_phase) {
            reception_phase = true;
            round_index++;
        }

        bb::assign_origin_tag<in_circuit>(element, OriginTag(transcript_index, round_index, /*is_submitted=*/true));
        auto elements = Codec::serialize_to_fields(element);

        add_element_frs_to_hash_buffer(label, elements);
    }

    /**
     * @brief Adds a prover message to the transcript, only intended to be used by the prover.
     *
     * @details Serializes the provided object into `proof_data`, and updates the current round state in
     * add_element_frs_to_hash_buffer.
     *
     * @param label Description/name of the object being added.
     * @param element Serializable object that will be added to the transcript
     *
     * @todo Use a concept to only allow certain types to be passed. Requirements are that the object should be
     * serializable.
     *
     */
    template <class T> void send_to_verifier(const std::string& label, const T& element)
    {
        DEBUG_LOG(label, element);
        auto element_frs = Codec::template serialize_to_fields<T>(element);
        proof_data.insert(proof_data.end(), element_frs.begin(), element_frs.end());
        num_frs_written += element_frs.size();

        add_element_frs_to_hash_buffer(label, element_frs);
    }

    /**
     * @brief Reads the next element of type `T` from the transcript, with a predefined label, only used by
     * verifier.
     *
     * @param label Human readable name for the challenge.
     * @return deserialized element of type T
     */
    template <class T> T receive_from_prover(const std::string& label)
    {
        const size_t element_size = Codec::template calc_num_fields<T>();
        BB_ASSERT_LTE(num_frs_read + element_size, proof_data.size());

        auto element_frs = std::span{ proof_data }.subspan(num_frs_read, element_size);
        // In case the transcript is used for recursive verification, we can track proper Fiat-Shamir usage
        // The verifier is receiving data from the prover. If before this we were in the challenge generation phase,
        // then we need to increment the round index
        if (!reception_phase) {
            reception_phase = true;
            round_index++;
        }
        // Assign an origin tag to the elements going into the hash buffer
        bb::assign_origin_tag<in_circuit>(element_frs, OriginTag(transcript_index, round_index, /*is_submitted=*/true));

        num_frs_read += element_size;

        add_element_frs_to_hash_buffer(label, element_frs);

        auto element = Codec::template deserialize_from_fields<T>(element_frs);
        DEBUG_LOG(label, element);

        // Ensure that the element got assigned an origin tag
        bb::check_origin_tag<in_circuit>(element, OriginTag(transcript_index, round_index, /*is_submitted=*/true));

        return element;
    }

    template <typename ChallengeType> ChallengeType get_challenge(const std::string& label)
    {
        std::span<const std::string> label_span(&label, 1);
        auto result = get_challenges<ChallengeType>(label_span);

        DEBUG_LOG(label, result);
        return result[0];
    }

    /**
     * @brief Convert a prover transcript to a verifier transcript
     *
     * @param prover_transcript The prover transcript to convert
     * @return std::shared_ptr<BaseTranscript> The verifier transcript
     */
    static std::shared_ptr<BaseTranscript> convert_prover_transcript_to_verifier_transcript(
        const std::shared_ptr<BaseTranscript>& prover_transcript)
    {
        // We expect this function to only be used when the transcript has just been exported.
        BB_ASSERT_EQ(prover_transcript->num_frs_written, 0UL, "Expected to be empty");
        auto verifier_transcript = std::make_shared<BaseTranscript>(*prover_transcript);
        verifier_transcript->num_frs_read = static_cast<size_t>(verifier_transcript->proof_start);
        verifier_transcript->proof_start = 0;
        return verifier_transcript;
    }

    // Serialize an element of type T to a vector of fields
    template <typename T> static std::vector<DataType> serialize(const T& element)
    {
        return Codec::serialize_to_fields(element);
    }

    template <typename T> static T deserialize(std::span<const DataType> frs)
    {
        return Codec::template deserialize_from_fields<T>(frs);
    }
    /**
     * @brief For testing: initializes transcript with some arbitrary data so that a challenge can be generated
     * after initialization. Only intended to be used by Prover.
     *
     * @return BaseTranscript
     */
    static std::shared_ptr<BaseTranscript> prover_init_empty()
    {
        auto transcript = std::make_shared<BaseTranscript>();
        constexpr uint32_t init{ 42 }; // arbitrary
        transcript->send_to_verifier("Init", init);
        return transcript;
    };

    /**
     * @brief For testing: initializes transcript based on proof data then receives junk data produced by
     * BaseTranscript::prover_init_empty(). Only intended to be used by Verifier.
     *
     * @param transcript
     * @return BaseTranscript
     */
    static std::shared_ptr<BaseTranscript> verifier_init_empty(const std::shared_ptr<BaseTranscript>& transcript)
    {
        auto verifier_transcript = std::make_shared<BaseTranscript>(transcript->proof_data);
        [[maybe_unused]] auto _ = verifier_transcript->template receive_from_prover<DataType>("Init");
        return verifier_transcript;
    };
    [[nodiscard]] TranscriptManifest get_manifest() const { return manifest; };

    void print()
    {
        if (!use_manifest) {
            info("Warning: manifest is not enabled!");
        }
        manifest.print();
    }

    // Test-specific utils

    /**
     * @brief Test utility: Set proof parsing state for export after deserialization
     * @details Used by test utilities that need to re-export proofs after tampering
     */
    void test_set_proof_parsing_state(std::ptrdiff_t start, size_t written)
    {
        this->proof_start = start;
        this->num_frs_written = written;
    }

    /**
     * @brief Test utility: Get proof_start for validation
     * @details Used by test fixtures to verify transcript conversion
     */
    std::ptrdiff_t test_get_proof_start() const { return proof_start; }
};

using NativeTranscript = BaseTranscript<FrCodec, bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>>;
using KeccakTranscript = BaseTranscript<U256Codec, bb::crypto::Keccak>;

template <typename Builder>
using StdlibTranscript = BaseTranscript<stdlib::StdlibCodec<stdlib::field_t<Builder>>, stdlib::poseidon2<Builder>>;
using UltraStdlibTranscript =
    BaseTranscript<stdlib::StdlibCodec<stdlib::field_t<UltraCircuitBuilder>>, stdlib::poseidon2<UltraCircuitBuilder>>;
using MegaStdlibTranscript =
    BaseTranscript<stdlib::StdlibCodec<stdlib::field_t<MegaCircuitBuilder>>, stdlib::poseidon2<MegaCircuitBuilder>>;

/**
 * @brief Helper to get the appropriate Transcript type for a given Curve
 * @details Maps native curves to NativeTranscript and stdlib curves to StdlibTranscript<Builder>
 */
template <typename Curve, bool = Curve::is_stdlib_type> struct TranscriptFor {
    using type = NativeTranscript;
};

template <typename Curve> struct TranscriptFor<Curve, true> {
    using type = StdlibTranscript<typename Curve::Builder>;
};

template <typename Curve> using TranscriptFor_t = typename TranscriptFor<Curve>::type;

} // namespace bb
