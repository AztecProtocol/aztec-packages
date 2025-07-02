// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
// #define LOG_CHALLENGES
// #define LOG_INTERACTIONS

#include "barretenberg/common/debug_log.hpp"
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
concept Loggable =
    (std::same_as<T, bb::fr> || std::same_as<T, grumpkin::fr> || std::same_as<T, bb::g1::affine_element> ||
     std::same_as<T, grumpkin::g1::affine_element> || std::same_as<T, uint32_t>);

// class TranscriptManifest;
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
    using Fr = bb::fr;
    using Proof = HonkProof;
    static Fr hash(const std::vector<Fr>& data);
    template <typename T> static inline T convert_challenge(const Fr& challenge)
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
    static inline std::array<Fr, 2> split_challenge(const Fr& challenge)
    {
        // match the parameter used in stdlib, which is derived from cycle_scalar (is 128)
        static constexpr size_t LO_BITS = Fr::Params::MAX_BITS_PER_ENDOMORPHISM_SCALAR;
        static constexpr size_t HI_BITS = Fr::modulus.get_msb() + 1 - LO_BITS;

        auto converted = static_cast<uint256_t>(challenge);
        uint256_t lo = converted.slice(0, LO_BITS);
        uint256_t hi = converted.slice(LO_BITS, LO_BITS + HI_BITS);
        return std::array<Fr, 2>{ Fr(lo), Fr(hi) };
    }
    template <typename T> static constexpr size_t calc_num_bn254_frs()
    {
        return bb::field_conversion::calc_num_bn254_frs<T>();
    }
    template <typename T> static inline T convert_from_bn254_frs(std::span<const Fr> frs)
    {
        return bb::field_conversion::convert_from_bn254_frs<T>(frs);
    }
    template <typename T> static inline std::vector<Fr> convert_to_bn254_frs(const T& element)
    {
        return bb::field_conversion::convert_to_bn254_frs(element);
    }
};

// A template for detecting whether a type is native or in-circuit
template <typename T>
concept InCircuit = !(std::same_as<T, bb::fr> || std::same_as<T, grumpkin::fr>);

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
    using Fr = typename TranscriptParams::Fr;
    using Proof = typename TranscriptParams::Proof;

    // Detects whether the transcript is in-circuit or not
    static constexpr bool in_circuit = InCircuit<Fr>;

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
    Fr previous_challenge{};        // default-initialized to zeros
    std::vector<Fr> current_round_data;

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
    [[nodiscard]] std::array<Fr, 2> get_next_duplex_challenge_buffer(size_t num_challenges)
    {
        // challenges need at least 110 bits in them to match the presumed security parameter of the BN254 curve.
        ASSERT(num_challenges <= 2);
        // Prevent challenge generation if this is the first challenge we're generating,
        // AND nothing was sent by the prover.
        if (is_first_challenge) {
            ASSERT(!current_round_data.empty());
        }

        // concatenate the previous challenge (if this is not the first challenge) with the current round data.
        // TODO(Adrian): Do we want to use a domain separator as the initial challenge buffer?
        // We could be cheeky and use the hash of the manifest as domain separator, which would prevent us from
        // having to domain separate all the data. (See https://safe-hash.dev)
        std::vector<Fr> full_buffer;
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
        Fr new_challenge = TranscriptParams::hash(full_buffer);
        std::array<Fr, 2> new_challenges = TranscriptParams::split_challenge(new_challenge);
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
    void add_element_frs_to_hash_buffer(const std::string& label, std::span<const Fr> element_frs)
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
        auto element_frs = TranscriptParams::template convert_to_bn254_frs(element);
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
        constexpr size_t element_fr_size = TranscriptParams::template calc_num_bn254_frs<T>();
        ASSERT(offset + element_fr_size <= proof_data.size());

        auto element_frs = std::span{ proof_data }.subspan(offset, element_fr_size);
        offset += element_fr_size;

        auto element = TranscriptParams::template convert_from_bn254_frs<T>(element_frs);

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
    std::vector<Fr> export_proof()
    {
        std::vector<Fr> result(num_frs_written);
        std::copy_n(proof_data.begin() + proof_start, num_frs_written, result.begin());
        proof_start += static_cast<std::ptrdiff_t>(num_frs_written);
        num_frs_written = 0;
        return result;
    };

    void load_proof(const std::vector<Fr>& proof)
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
     * @brief After all the prover messages have been sent, finalize the round by hashing all the data and then create
     * the number of requested challenges.
     * @details Challenges are generated by iteratively hashing over the previous challenge, using
     * get_next_challenge_buffer().
     *
     * @param array of labels human-readable names for the challenges for the manifest
     * @return std::array<Fr, num_challenges> challenges for this round.
     */
    template <typename ChallengeType, typename String, size_t NumChallenges>
    std::array<ChallengeType, NumChallenges> get_challenges(const std::array<String, NumChallenges> labels)
    {
        auto call_get_challenges = [&] {
            auto call_fn_with_expanded_parameters =
                [&]<size_t... Indices>([[maybe_unused]] std::index_sequence<Indices...>) {
                    return get_challenges<Fr>(std::get<Indices>(labels)...);
                };
            return call_fn_with_expanded_parameters(std::make_index_sequence<NumChallenges>());
        };
        return call_get_challenges();
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
        // TODO(Adrian): Ensure that serialization of affine elements (including point at infinity) is consistent.
        // TODO(Adrian): Consider restricting serialization (via concepts) to types T for which sizeof(T) reliably
        // returns the size of T in frs. (E.g. this is true for std::array but not for std::vector).
        // convert element to field elements
        auto element_frs = TranscriptParams::convert_to_bn254_frs(element);

#ifdef LOG_INTERACTIONS
        if constexpr (Loggable<T>) {
            info("consumed:     ", label, ": ", element);
        }
#endif
        BaseTranscript::add_element_frs_to_hash_buffer(label, element_frs);
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

        // TODO(Adrian): Ensure that serialization of affine elements (including point at infinity) is consistent.
        // TODO(Adrian): Consider restricting serialization (via concepts) to types T for which sizeof(T) reliably
        // returns the size of T in frs. (E.g. this is true for std::array but not for std::vector).
        // convert element to field elements
        auto element_frs = TranscriptParams::convert_to_bn254_frs(element);
        proof_data.insert(proof_data.end(), element_frs.begin(), element_frs.end());
        num_frs_written += element_frs.size();

#ifdef LOG_INTERACTIONS
        if constexpr (Loggable<T>) {
            info("sent:     ", label, ": ", element);
        }
#endif
        BaseTranscript::add_element_frs_to_hash_buffer(label, element_frs);
        // In case the transcript is used for recursive verification, we can track proper Fiat-Shamir usage
        if constexpr (in_circuit) {
            // The prover is sending data to the verifier. If before this we were in the challenge generation phase,
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
        const size_t element_size = TranscriptParams::template calc_num_bn254_frs<T>();
        ASSERT(num_frs_read + element_size <= proof_data.size());

        auto element_frs = std::span{ proof_data }.subspan(num_frs_read, element_size);
        num_frs_read += element_size;

        BaseTranscript::add_element_frs_to_hash_buffer(label, element_frs);

        auto element = TranscriptParams::template convert_from_bn254_frs<T>(element_frs);
        DEBUG_LOG(label, element);

#ifdef LOG_INTERACTIONS
        if constexpr (Loggable<T>) {
            info("received: ", label, ": ", element);
        }
#endif

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
                for (auto& subelement : element) {
                    subelement.set_origin_tag(OriginTag(transcript_index, round_index, /*is_submitted=*/true));
                }
            } else {
                // If the element is not iterable, then we need to assign an origin tag to the element
                element.set_origin_tag(OriginTag(transcript_index, round_index, /*is_submitted=*/true));
            }
        }
        return element;
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
        [[maybe_unused]] auto _ = verifier_transcript->template receive_from_prover<Fr>("Init");
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
        branched_transcript.transcript_index = unique_transcript_index.fetch_sub(1);
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
inline bb::fr keccak_hash_uint256(std::vector<bb::fr> const& data)
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

    auto result_fr = from_buffer<bb::fr>(result);

    return result_fr;
}

struct KeccakTranscriptParams {
    using Fr = bb::fr;
    using Proof = HonkProof;

    static inline Fr hash(const std::vector<Fr>& data) { return keccak_hash_uint256(data); }

    template <typename T> static inline T convert_challenge(const Fr& challenge)
    {
        return bb::field_conversion::convert_challenge<T>(challenge);
    }
    template <typename T> static constexpr size_t calc_num_bn254_frs()
    {
        return bb::field_conversion::calc_num_bn254_frs<T>();
    }
    template <typename T> static inline T convert_from_bn254_frs(std::span<const Fr> frs)
    {
        return bb::field_conversion::convert_from_bn254_frs<T>(frs);
    }
    template <typename T> static inline std::vector<Fr> convert_to_bn254_frs(const T& element)
    {
        // TODO(md): Need to refactor this to be able to NOT just be field elements - Im working about it in the
        // verifier for keccak resulting in twice as much hashing
        return bb::field_conversion::convert_to_bn254_frs(element);
    }
    static inline std::array<Fr, 2> split_challenge(const Fr& challenge)
    {
        return NativeTranscriptParams::split_challenge(challenge);
    }
};

using KeccakTranscript = BaseTranscript<KeccakTranscriptParams>;

} // namespace bb
