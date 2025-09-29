// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
// #define LOG_CHALLENGES
// #define LOG_INTERACTIONS

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/debug_log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include <concepts>

#include <atomic>

namespace bb {

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1226): univariates should also be logged
template <typename T, typename... U>
concept Loggable = (IsAnyOf<T, bb::fr, grumpkin::fr, bb::g1::affine_element, grumpkin::g1::affine_element, uint32_t>);

class TranscriptManifest {
    struct RoundData {
        std::vector<std::string> challenge_label;
        std::vector<std::pair<std::string, size_t>> entries;

        void print()
        {
            for (auto& label : challenge_label) {
                info("\tchallenge: ", label);
            }
            for (auto& entry : entries) {
                info("\telement (", entry.second, "): ", entry.first);
            }
        }

        bool operator==(const RoundData& other) const = default;
    };

    std::map<size_t, RoundData> manifest;

  public:
    void print()
    {
        for (auto& round : manifest) {
            info("Round: ", round.first);
            round.second.print();
        }
    }

    template <typename... Strings> void add_challenge(size_t round, Strings&... labels)
    {
        manifest[round].challenge_label = { labels... };
    }
    template <typename String, size_t NumChallenges>
    void add_challenge(size_t round, std::array<String, NumChallenges> labels)
    {
        auto call_add_challenge = [&] {
            auto call_fn_with_expanded_parameters =
                [&]<size_t... Indices>([[maybe_unused]] std::index_sequence<Indices...>) {
                    return add_challenge(round, std::get<Indices>(labels)...);
                };
            return call_fn_with_expanded_parameters(std::make_index_sequence<NumChallenges>());
        };
        call_add_challenge();
    }

    void add_entry(size_t round, const std::string& element_label, size_t element_size)
    {
        manifest[round].entries.emplace_back(element_label, element_size);
    }

    [[nodiscard]] size_t size() const { return manifest.size(); }

    RoundData operator[](const size_t& round) { return manifest[round]; };

    bool operator==(const TranscriptManifest& other) const = default;
};

struct NativeTranscriptParams {
    using DataType = bb::fr;
    using Proof = HonkProof;

    static DataType hash(const std::vector<DataType>& data);
    template <typename T> static T convert_challenge(const DataType& challenge)
    {
        return bb::field_conversion::convert_challenge<T>(challenge);
    }
    /**
     * @brief Split a challenge field element into two half-width challenges
     * @details `lo` is 128 bits and `hi` is 126 bits.
     * This should provide significantly more than our security parameter bound: 100 bits
     *
     * @param challenge
     * @return std::array<Fr, 2>
     */
    static std::array<DataType, 2> split_challenge(const DataType& challenge)
    {
        // match the parameter used in stdlib, which is derived from cycle_scalar (is 128)
        static constexpr size_t LO_BITS = DataType::Params::MAX_BITS_PER_ENDOMORPHISM_SCALAR;
        static constexpr size_t HI_BITS = DataType::modulus.get_msb() + 1 - LO_BITS;

        auto converted = static_cast<uint256_t>(challenge);
        uint256_t lo = converted.slice(0, LO_BITS);
        uint256_t hi = converted.slice(LO_BITS, LO_BITS + HI_BITS);
        return std::array<DataType, 2>{ DataType(lo), DataType(hi) };
    }
    template <typename T> static constexpr size_t calc_num_data_types()
    {
        return bb::field_conversion::calc_num_bn254_frs<T>();
    }
    template <typename T> static T deserialize(std::span<const DataType> frs)
    {
        return bb::field_conversion::convert_from_bn254_frs<T>(frs);
    }
    template <typename T> static std::vector<DataType> serialize(const T& element)
    {
        return bb::field_conversion::convert_to_bn254_frs(element);
    }
};

// A concept for detecting whether a type is native or in-circuit
template <typename T>
concept InCircuit = !(std::same_as<T, bb::fr> || std::same_as<T, grumpkin::fr> || std::same_as<T, uint256_t>);

template <typename T, typename = void> struct is_iterable : std::false_type {};

// this gets used only when we can call std::begin() and std::end() on that type
template <typename T>
struct is_iterable<T, std::void_t<decltype(std::begin(std::declval<T&>())), decltype(std::end(std::declval<T&>()))>>
    : std::true_type {};

template <typename T> constexpr bool is_iterable_v = is_iterable<T>::value;

// A static counter for the number of transcripts created
// This is used to generate unique labels for the transcript origin tags

// ‘inline’ (since C++17) ensures a single shared definition with external linkage.
inline std::atomic<size_t> unique_transcript_index{ 0 };
/**
 * @brief Common transcript class for both parties. Stores the data for the current round, as well as the
 * manifest.
 */
template <typename TranscriptParams> class BaseTranscript {
  public:
    using DataType = TranscriptParams::DataType;
    using Proof = typename TranscriptParams::Proof;

    // Detects whether the transcript is in-circuit or not
    static constexpr bool in_circuit = InCircuit<DataType>;

    // The unique index of the transcript
    size_t transcript_index = 0;

    // The index of the current round of the transcript (used for the origin tag, round is only incremented if we switch
    // from generating to receiving)
    size_t round_index = 0;

    // Indicates whether the transcript is receiving data from the prover
    bool reception_phase = true;

    BaseTranscript()
    {
        // If we are in circuit, we need to get a unique index for the transcript
        if constexpr (in_circuit) {
            transcript_index = unique_transcript_index.fetch_add(1);
        }
    }

    static constexpr size_t HASH_OUTPUT_SIZE = 32;

    std::ptrdiff_t proof_start = 0;
    size_t num_frs_written = 0; // the number of bb::frs written to proof_data by the prover
    size_t num_frs_read = 0;    // the number of bb::frs read from proof_data by the verifier
    size_t round_number = 0;    // current round for manifest

  private:
    bool is_first_challenge = true; // indicates if this is the first challenge this transcript is generating
    DataType previous_challenge{};  // default-initialized to zeros
    std::vector<DataType>
        current_round_data; // the data for the current round that will be hashed to generate challenges
    std::vector<DataType>
        independent_hash_buffer; // data that will be independently hashed to get the hash of an object

    bool use_manifest = false; // indicates whether the manifest is turned on, currently only on for manifest tests.

    // "Manifest" object that records a summary of the transcript interactions
    TranscriptManifest manifest;

    /**
     * @brief Compute next challenge c_next = H( Compress(c_prev || round_buffer) )
     * @details This function computes a new challenge for the current round using the previous challenge
     * and the current round data, if they exist. It clears the current_round_data if nonempty after
     * computing the challenge to minimize how much we compress. It also sets previous_challenge
     * to the current challenge buffer to set up next function call.
     * @return std::array<Fr, HASH_OUTPUT_SIZE>
     */
    [[nodiscard]] std::array<DataType, 2> get_next_duplex_challenge_buffer(size_t num_challenges)
    {
        // challenges need at least 110 bits in them to match the presumed security parameter of the BN254 curve.
        BB_ASSERT_LTE(num_challenges, 2U);
        // Prevent challenge generation if this is the first challenge we're generating,
        // AND nothing was sent by the prover.
        if (is_first_challenge) {
            ASSERT(!current_round_data.empty());
        }

        // concatenate the previous challenge (if this is not the first challenge) with the current round data.
        // TODO(Adrian): Do we want to use a domain separator as the initial challenge buffer?
        // We could be cheeky and use the hash of the manifest as domain separator, which would prevent us from
        // having to domain separate all the data. (See https://safe-hash.dev)
        std::vector<DataType> full_buffer;
        if (!is_first_challenge) {
            // if not the first challenge, we can use the previous_challenge
            full_buffer.emplace_back(previous_challenge);
        } else {
            // Update is_first_challenge for the future
            is_first_challenge = false;
        }
        if (!current_round_data.empty()) {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/832): investigate why
            // full_buffer.insert(full_buffer.end(), current_round_data.begin(), current_round_data.end()); fails to
            // compile with gcc
            std::copy(current_round_data.begin(), current_round_data.end(), std::back_inserter(full_buffer));
            current_round_data.clear(); // clear the round data buffer since it has been used
        }

        // Hash the full buffer with poseidon2, which is believed to be a collision resistant hash function and a
        // random oracle, removing the need to pre-hash to compress and then hash with a random oracle, as we
        // previously did with Pedersen and Blake3s.
        DataType new_challenge = TranscriptParams::hash(full_buffer);
        std::array<DataType, 2> new_challenges = TranscriptParams::split_challenge(new_challenge);
        // update previous challenge buffer for next time we call this function
        previous_challenge = new_challenge;
        return new_challenges;
    };

  protected:
    Proof proof_data; // Contains the raw data sent by the prover.

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
        auto element_frs = TranscriptParams::serialize(element);
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
        constexpr size_t element_fr_size = TranscriptParams::template calc_num_data_types<T>();
        BB_ASSERT_LTE(offset + element_fr_size, proof_data.size());

        auto element_frs = std::span{ proof_data }.subspan(offset, element_fr_size);
        offset += element_fr_size;

        auto element = TranscriptParams::template deserialize<T>(element_frs);

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

    void load_proof(const std::vector<DataType>& proof)
    {
        std::copy(proof.begin(), proof.end(), std::back_inserter(proof_data));
    }

    /**
     * @brief Return the size of proof_data
     *
     * @return size_t
     */
    size_t size_proof_data() { return proof_data.size(); }

    /**
     * @brief Enables the manifest
     *
     */
    void enable_manifest() { use_manifest = true; }

    /**
     * @brief Static hash method that forwards to TranscriptParams hash.
     * @details This method allows hash to be called on the Transcript class directly,
     * which is needed for verification key hashing.
     *
     * @param data Vector of field elements to hash
     * @return Fr Hash result
     */
    static DataType hash(const std::vector<DataType>& data) { return TranscriptParams::hash(data); }

    /**
     * @brief Serialize a size_t to a vector of field elements
     *
     * @param element
     * @return std::vector<DataType>
     */
    template <typename T> static std::vector<DataType> serialize(const T& element)
    {
        return TranscriptParams::serialize(element);
    }

    template <typename T> static T deserialize(std::span<const DataType> frs)
    {
        return TranscriptParams::template deserialize<T>(frs);
    }

    template <typename T> static size_t calc_num_data_types()
    {
        return TranscriptParams::template calc_num_data_types<T>();
    }

    /**
     * @brief After all the prover messages have been sent, finalize the round by hashing all the data and then
     * create the number of requested challenges.
     * @details Challenges are generated by iteratively hashing over the previous challenge, using
     * get_next_challenge_buffer(). Note that the pairs of challenges will be 128 and 126 bits, as in they will be
     * [128, 126, 128, 126, ...].
     *
     * @param labels human-readable names for the challenges for the manifest
     * @return std::array<Fr, num_challenges> challenges for this round.
     */
    template <typename ChallengeType, typename... Strings>
    std::array<ChallengeType, sizeof...(Strings)> get_challenges(const Strings&... labels)
    {
        constexpr size_t num_challenges = sizeof...(Strings);

        if (use_manifest) {
            // Add challenge labels for current round to the manifest
            manifest.add_challenge(round_number, labels...);
        }

        // In case the transcript is used for recursive verification, we need to sanitize current round data so we don't
        // get an origin tag violation inside the hasher. We are doing this to ensure that the free witness tagged
        // elements that are sent to the transcript and are assigned tags externally, don't trigger the origin tag
        // security mechanism while we are hashing them
        if constexpr (in_circuit) {
            for (auto& element : current_round_data) {
                element.unset_free_witness_tag();
            }
        }
        // Compute the new challenge buffer from which we derive the challenges.

        // Create challenges from Frs.
        std::array<ChallengeType, num_challenges> challenges{};

        // Generate the challenges by iteratively hashing over the previous challenge.
        for (size_t i = 0; i < num_challenges / 2; i += 1) {
            auto challenge_buffer = get_next_duplex_challenge_buffer(2);
            challenges[2 * i] = TranscriptParams::template convert_challenge<ChallengeType>(challenge_buffer[0]);
            challenges[2 * i + 1] = TranscriptParams::template convert_challenge<ChallengeType>(challenge_buffer[1]);
        }
        if ((num_challenges & 1) == 1) {
            auto challenge_buffer = get_next_duplex_challenge_buffer(1);
            challenges[num_challenges - 1] =
                TranscriptParams::template convert_challenge<ChallengeType>(challenge_buffer[0]);
        }

        // In case the transcript is used for recursive verification, we can track proper Fiat-Shamir usage
        if constexpr (in_circuit) {
            // We are in challenge generation mode
            if (reception_phase) {
                reception_phase = false;
            }
            // Assign origin tags to the challenges
            for (size_t i = 0; i < num_challenges; i++) {
                challenges[i].set_origin_tag(OriginTag(transcript_index, round_index, /*is_submitted=*/false));
            }
        }
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
    template <typename ChallengeType, typename String, std::size_t N>
    std::array<ChallengeType, N> get_challenges(std::array<String, N> const& labels)
    {
        // Expand the array elements into the existing variadic get_challenges
        return std::apply([this](auto const&... xs) { return this->get_challenges<ChallengeType>(xs...); }, labels);
    }

    /**
     * @brief Given δ, compute the vector [δ, δ^2,..., δ^2^num_powers].
     * @details This is Step 2 of the protocol as written in the paper.
     */
    template <typename ChallengeType>
    std::vector<ChallengeType> compute_round_challenge_pows(const size_t num_powers,
                                                            const ChallengeType& round_challenge)
    {
        std::vector<ChallengeType> pows(num_powers);
        pows[0] = round_challenge;
        for (size_t i = 1; i < num_powers; i++) {
            pows[i] = pows[i - 1].sqr();
        }
        return pows;
    }

    template <typename ChallengeType, typename String>
    std::vector<ChallengeType> get_powers_of_challenge(const String& label, size_t num_challenges)
    {
        return compute_round_challenge_pows(num_challenges, get_challenge<ChallengeType>(label));
    }

    /**
     * @brief Adds an element to an independent hash buffer.
     * @details Serializes the element to frs and adds it to the independent hash buffer. Does NOT add the element to
     * the proof.
     *
     * @param label Human-readable name for the challenge.
     * @param element Element to be added.
     */
    template <class T> void add_to_independent_hash_buffer([[maybe_unused]] const std::string& label, const T& element)
    {
        DEBUG_LOG(label, element);
        // In case the transcript is used for recursive verification, we can track proper Fiat-Shamir usage
        if constexpr (in_circuit) {
            // The verifier is receiving data from the prover. If before this we were in the challenge generation phase,
            // then we need to increment the round index
            if (!reception_phase) {
                reception_phase = true;
                round_index++;
            }
            // If the element is iterable, then we need to assign origin tags to all the elements
            if constexpr (is_iterable_v<T>) {
                for (const auto& subelement : element) {
                    subelement.set_origin_tag(OriginTag(transcript_index, round_index, /*is_submitted=*/true));
                }
            } else {
                // If the element is not iterable, then we need to assign an origin tag to the element
                element.set_origin_tag(OriginTag(transcript_index, round_index, /*is_submitted=*/true));
            }
        }
        auto element_frs = TranscriptParams::serialize(element);

#ifdef LOG_INTERACTIONS
        if constexpr (Loggable<T>) {
            info("independent hash buffer consumed:     ", label, ": ", element);
        }
#endif
        independent_hash_buffer.insert(independent_hash_buffer.end(), element_frs.begin(), element_frs.end());
    }

    /**
     * @brief Hashes the independent hash buffer and clears it.
     *
     * @return Fr The hash of the independent hash buffer.
     */
    DataType hash_independent_buffer()
    {
        // In case the transcript is used for recursive verification, we need to sanitize current round data so we don't
        // get an origin tag violation inside the hasher
        if constexpr (in_circuit) {
            for (auto& element : independent_hash_buffer) {
                element.unset_free_witness_tag();
            }
        }
        DataType buffer_hash = TranscriptParams::hash(independent_hash_buffer);
        independent_hash_buffer.clear();
        return buffer_hash;
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
        if constexpr (in_circuit) {
            // The verifier is receiving data from the prover. If before this we were in the challenge generation phase,
            // then we need to increment the round index
            if (!reception_phase) {
                reception_phase = true;
                round_index++;
            }
            // If the element is iterable, then we need to assign origin tags to all the elements
            if constexpr (is_iterable_v<T>) {
                for (const auto& subelement : element) {
                    subelement.set_origin_tag(OriginTag(transcript_index, round_index, /*is_submitted=*/true));
                }
            } else {
                // If the element is not iterable, then we need to assign an origin tag to the element
                element.set_origin_tag(OriginTag(transcript_index, round_index, /*is_submitted=*/true));
            }
        }
        auto elements = TranscriptParams::serialize(element);

#ifdef LOG_INTERACTIONS
        if constexpr (Loggable<T>) {
            info("consumed:     ", label, ": ", element);
        }
#endif
        BaseTranscript::add_element_frs_to_hash_buffer(label, elements);
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
        auto element_frs = TranscriptParams::serialize(element);
        proof_data.insert(proof_data.end(), element_frs.begin(), element_frs.end());
        num_frs_written += element_frs.size();

#ifdef LOG_INTERACTIONS
        if constexpr (Loggable<T>) {
            info("sent:     ", label, ": ", element);
        }
#endif
        BaseTranscript::add_element_frs_to_hash_buffer(label, element_frs);
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
        const size_t element_size = TranscriptParams::template calc_num_data_types<T>();
        BB_ASSERT_LTE(num_frs_read + element_size, proof_data.size());

        auto element_frs = std::span{ proof_data }.subspan(num_frs_read, element_size);
        // In case the transcript is used for recursive verification, we can track proper Fiat-Shamir usage
        if constexpr (in_circuit) {
            // The verifier is receiving data from the prover. If before this we were in the challenge generation phase,
            // then we need to increment the round index
            if (!reception_phase) {
                reception_phase = true;
                round_index++;
            }
            // Assign an origin tag to the elements going into the hash buffer
            const auto element_origin_tag = OriginTag(transcript_index, round_index, /*is_submitted=*/true);
            for (auto& subelement : element_frs) {
                subelement.set_origin_tag(element_origin_tag);
            }
        }
        num_frs_read += element_size;

        BaseTranscript::add_element_frs_to_hash_buffer(label, element_frs);

        auto element = TranscriptParams::template deserialize<T>(element_frs);
        DEBUG_LOG(label, element);

        // Ensure that the element got assigned an origin tag
        if constexpr (in_circuit) {
            const auto element_origin_tag = OriginTag(transcript_index, round_index, /*is_submitted=*/true);
            // If the element is iterable, then we need to check origin tags to all the elements
            if constexpr (is_iterable_v<T>) {
                for (auto& subelement : element) {
                    ASSERT(subelement.get_origin_tag() == element_origin_tag);
                }
            } else {
                // If the element is not iterable, then we need to check an origin tag of the element
                ASSERT(element.get_origin_tag() == element_origin_tag);
            }
        }
#ifdef LOG_INTERACTIONS
        if constexpr (Loggable<T>) {
            info("received: ", label, ": ", element);
        }
#endif

        return element;
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
        BB_ASSERT_EQ(prover_transcript->num_frs_written, static_cast<size_t>(0), "Expected to be empty");
        auto verifier_transcript = std::make_shared<BaseTranscript>(*prover_transcript);
        verifier_transcript->num_frs_read = static_cast<size_t>(verifier_transcript->proof_start);
        verifier_transcript->proof_start = 0;
        return verifier_transcript;
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
        auto verifier_transcript = std::make_shared<BaseTranscript>();
        verifier_transcript->load_proof(transcript->proof_data);
        [[maybe_unused]] auto _ = verifier_transcript->template receive_from_prover<DataType>("Init");
        return verifier_transcript;
    };

    template <typename ChallengeType> ChallengeType get_challenge(const std::string& label)
    {
        ChallengeType result = get_challenges<ChallengeType>(label)[0];
#if defined LOG_CHALLENGES || defined LOG_INTERACTIONS
        info("challenge: ", label, ": ", result);
#endif
        DEBUG_LOG(label, result);
        return result;
    }

    [[nodiscard]] TranscriptManifest get_manifest() const { return manifest; };

    void print()
    {
        if (!use_manifest) {
            info("Warning: manifest is not enabled!");
        }
        manifest.print();
    }

    /**
     * @brief Branch a transcript to perform verifier-only computations
     * @details This function takes the current state of a transcript and creates a new transcript that starts from that
     * state. In this way, computations that are not part of the prover's transcript (e.g., computations that can be
     * used to perform calculations more efficiently) will not affect the verifier's transcript.
     *
     * If `transcript = (.., previous_challenge)`, then for soundness it is enough that `branched_transcript =
     * (previous_challenge, ...)` However, there are a few implementation details we need to take into account:
     *  1. `branched_transcript` will interact with witnesses that come from `transcript`. To prevent the tool that
     *      detects FS bugs from raising an error, we must ensure that `branched_transcript.transcript_index =
     *      transcript.transcript_index`.
     *  2. To aid debugging, we set `branched_transcript.round_index = transcript.round_index`, so that it is clear that
     *      `branched_transcript` builds on the current state of `transcript`.
     *  3. To aid debugging, we increase `transcript.round_index` by `BRANCHING_JUMP`, so that there is a gap between
     *      what happens before and after the transcript is branched.
     *  4. To ensure soundness:
     *      a. We add to the hash buffer of `branched_transcript` the value `transcript.previous_challenge`
     *      b. We enforce ASSERT(current_round_data.empty())
     *
     * @note We could remove 4.b and add to the hash buffer of `branched_transcript` both
     * `transcript.previous_challenge` and `transcript.current_round_data`. However, this would conflict with 3 (as the
     * round in `transcript` is not finished yet). There seems to be no reason why the branching cannot happen after the
     * round is concluded, so we choose this implementation.
     *
     * The relation between the transcript and the branched transcript is the following:
     *
     *   round_index      transcript      branched_transcript
     *        0               *
     *        1               |
     *        |               |
     *        |               |
     *        n               * ================= *
     *        |                                   |
     *        |                                   |
     *        |                                   |
     * n+BRANCHING_JUMP       *                   |
     *       n+6              |                   |
     *        |               |                   |
     *       ...             ...                 ...
     *
     *
     * @return BaseTranscript
     */
    BaseTranscript branch_transcript()
    {
        ASSERT(current_round_data.empty(), "Branching a transcript with non empty round data");

        BaseTranscript branched_transcript;

        // Need to fetch_sub because the constructor automatically increases unique_transcript_index by 1
        unique_transcript_index.fetch_sub(1);
        branched_transcript.transcript_index = transcript_index;
        branched_transcript.round_index = round_index;
        branched_transcript.add_to_hash_buffer("init", previous_challenge);
        round_index += BRANCHING_JUMP;

        return branched_transcript;
    }
};

using NativeTranscript = BaseTranscript<NativeTranscriptParams>;

///////////////////////////////////////////
// Solidity Transcript
///////////////////////////////////////////

// This is a compatible wrapper around the keccak256 function from ethash
inline bb::fr keccak_hash_uint256(std::vector<uint256_t> const& data)
// Losing 2 bits of this is not an issue -> we can just reduce mod p
{
    // cast into uint256_t
    std::vector<uint8_t> buffer = to_buffer(data);

    keccak256 hash_result = ethash_keccak256(&buffer[0], buffer.size());
    for (auto& word : hash_result.word64s) {
        if (is_little_endian()) {
            word = __builtin_bswap64(word);
        }
    }
    std::array<uint8_t, 32> result;

    for (size_t i = 0; i < 4; ++i) {
        for (size_t j = 0; j < 8; ++j) {
            uint8_t byte = static_cast<uint8_t>(hash_result.word64s[i] >> (56 - (j * 8)));
            result[i * 8 + j] = byte;
        }
    }

    return from_buffer<bb::fr>(result);
}

struct KeccakTranscriptParams {
    using Fr = bb::fr;
    using DataType = uint256_t;
    using Proof = std::vector<uint256_t>;

    static inline Fr hash(const std::vector<DataType>& data) { return keccak_hash_uint256(data); }

    template <typename T> static inline T convert_challenge(const DataType& challenge)
    {
        return bb::field_conversion::convert_challenge<T>(challenge);
    }

    template <typename T> static constexpr size_t calc_num_data_types()
    {
        return bb::field_conversion::calc_num_uint256_ts<T>();
    }
    template <typename T> static inline T deserialize(std::span<const DataType> elements)
    {
        return bb::field_conversion::convert_from_uint256_ts<T>(elements);
    }
    template <typename T> static inline std::vector<DataType> serialize(const T& element)
    {
        return bb::field_conversion::convert_to_uint256(element);
    }
    static inline std::array<DataType, 2> split_challenge(const DataType& challenge)
    {
        // Challenges sizes are matched with the challenge sizes used in bb::fr
        // match the parameter used in stdlib, which is derived from cycle_scalar (is 128)
        static constexpr size_t LO_BITS = bb::fr::Params::MAX_BITS_PER_ENDOMORPHISM_SCALAR;
        static constexpr size_t HI_BITS = bb::fr::modulus.get_msb() + 1 - LO_BITS;

        auto converted = static_cast<uint256_t>(challenge);
        uint256_t lo = converted.slice(0, LO_BITS);
        uint256_t hi = converted.slice(LO_BITS, LO_BITS + HI_BITS);
        return std::array<DataType, 2>{ DataType(lo), DataType(hi) };
    }
};

using KeccakTranscript = BaseTranscript<KeccakTranscriptParams>;

} // namespace bb
