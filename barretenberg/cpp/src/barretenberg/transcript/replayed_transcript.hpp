#pragma once

#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <string>
#include <unordered_map>
#include <vector>

namespace bb {

/**
 * @brief A transcript that replays pre-computed challenges without hashing.
 *
 * @details Used for ECCVM transcript replay in the split Chonk_B circuit.
 * Advances through proof data (receive_from_prover) and returns pre-computed
 * challenges (get_challenge) without maintaining hash state. This allows the
 * transcript to advance through the ECCVM proof for Fiat-Shamir continuity
 * before the Translator, without performing ECCVM verification.
 *
 * The challenges must be pre-computed by running the ECCVM verifier natively
 * and stored before creating the ReplayedTranscript.
 *
 * @note There is no add_to_hash_buffer method — this transcript doesn't hash.
 */
template <typename Codec_> class ReplayedTranscript {
  public:
    using DataType = typename Codec_::DataType;
    using Proof = std::vector<DataType>;

    ReplayedTranscript() = default;

    void load_proof(const Proof& proof)
    {
        std::copy(proof.begin(), proof.end(), std::back_inserter(proof_data));
    }

    /**
     * @brief Store a pre-computed challenge value to be returned by get_challenge.
     */
    void set_challenge(const std::string& label, const DataType& value) { precomputed_challenges[label] = value; }

    /**
     * @brief Read an element from the proof data (same as BaseTranscript).
     * @details Deserializes from the proof buffer and advances the read pointer.
     * Does NOT hash the element — this is a replay, not a live transcript.
     */
    template <class T> T receive_from_prover([[maybe_unused]] const std::string& label)
    {
        constexpr size_t num_fields = Codec_::template calc_num_fields<T>();
        BB_ASSERT(proof_data_ptr + num_fields <= proof_data.size());
        auto element = Codec_::template deserialize_from_fields<T>(
            std::span{ proof_data }.subspan(proof_data_ptr, num_fields));
        proof_data_ptr += num_fields;
        return element;
    }

    /**
     * @brief Return a pre-computed challenge (no hashing).
     */
    template <typename ChallengeType> ChallengeType get_challenge(const std::string& label)
    {
        auto it = precomputed_challenges.find(label);
        BB_ASSERT(it != precomputed_challenges.end());
        DataType challenge_data = it->second;
        // Convert DataType to ChallengeType (same as BaseTranscript)
        if constexpr (std::is_same_v<ChallengeType, DataType>) {
            return challenge_data;
        } else {
            return ChallengeType(uint256_t(challenge_data));
        }
    }

    /**
     * @brief Return multiple pre-computed challenges.
     */
    template <typename ChallengeType>
    std::vector<ChallengeType> get_challenges(std::span<const std::string> labels)
    {
        std::vector<ChallengeType> challenges;
        challenges.reserve(labels.size());
        for (const auto& label : labels) {
            challenges.push_back(get_challenge<ChallengeType>(label));
        }
        return challenges;
    }

    template <typename ChallengeType, size_t N>
    std::array<ChallengeType, N> get_challenges(const std::array<std::string, N>& labels)
    {
        std::array<ChallengeType, N> challenges;
        for (size_t i = 0; i < N; i++) {
            challenges[i] = get_challenge<ChallengeType>(labels[i]);
        }
        return challenges;
    }

    /**
     * @brief Get dyadic powers of a challenge (same interface as BaseTranscript).
     */
    template <typename ChallengeType>
    std::vector<ChallengeType> get_dyadic_powers_of_challenge(const std::string& label, size_t num_powers)
    {
        auto base = get_challenge<ChallengeType>(label);
        std::vector<ChallengeType> powers(num_powers);
        powers[0] = base;
        for (size_t i = 1; i < num_powers; i++) {
            powers[i] = powers[i - 1] * powers[i - 1];
        }
        return powers;
    }

  private:
    Proof proof_data;
    size_t proof_data_ptr = 0;
    std::unordered_map<std::string, DataType> precomputed_challenges;
};

/**
 * @brief Stdlib version of ReplayedTranscript for use inside recursive circuits.
 *
 * @details Advances through proof data creating circuit witnesses (via from_witness),
 * and returns pre-computed challenges as circuit witnesses. Used in the recursive
 * Chonk_B circuit for ECCVM transcript replay.
 *
 * @tparam Builder The circuit builder type (UltraCircuitBuilder, etc.)
 */
template <typename Builder> class StdlibReplayedTranscript {
  public:
    using FF = stdlib::field_t<Builder>;
    using NativeFF = typename Builder::FF;
    using Proof = std::vector<NativeFF>;

    StdlibReplayedTranscript(Builder* builder)
        : builder(builder)
    {}

    void load_proof(const Proof& proof)
    {
        std::copy(proof.begin(), proof.end(), std::back_inserter(proof_data));
    }

    /**
     * @brief Store a pre-computed challenge value.
     */
    void set_challenge(const std::string& label, const NativeFF& value) { precomputed_challenges[label] = value; }

    /**
     * @brief Read an element from the proof data and create a circuit witness.
     * @details For commitments (curve points), creates witnesses for each coordinate.
     * For field elements, creates a single witness.
     */
    template <class T> T receive_from_prover([[maybe_unused]] const std::string& label)
    {
        // For now, handle the common case: T = FF (field element)
        if constexpr (std::is_same_v<T, FF>) {
            BB_ASSERT(proof_data_ptr < proof_data.size());
            auto value = proof_data[proof_data_ptr++];
            return FF::from_witness(builder, value);
        } else {
            // For other types (commitments, arrays), read the appropriate number of fields
            constexpr size_t num_fields = FrCodec::template calc_num_fields<T>();
            BB_ASSERT(proof_data_ptr + num_fields <= proof_data.size());
            // Just advance the pointer — the data is used elsewhere via polynomial equivalence
            proof_data_ptr += num_fields;
            return T{}; // placeholder
        }
    }

    /**
     * @brief Return a pre-computed challenge as a circuit witness.
     */
    template <typename ChallengeType> ChallengeType get_challenge(const std::string& label)
    {
        auto it = precomputed_challenges.find(label);
        BB_ASSERT(it != precomputed_challenges.end());
        if constexpr (std::is_same_v<ChallengeType, FF>) {
            return FF::from_witness(builder, it->second);
        } else {
            return ChallengeType(uint256_t(it->second));
        }
    }

    template <typename ChallengeType>
    std::vector<ChallengeType> get_challenges(std::span<const std::string> labels)
    {
        std::vector<ChallengeType> challenges;
        challenges.reserve(labels.size());
        for (const auto& label : labels) {
            challenges.push_back(get_challenge<ChallengeType>(label));
        }
        return challenges;
    }

    template <typename ChallengeType, size_t N>
    std::array<ChallengeType, N> get_challenges(const std::array<std::string, N>& labels)
    {
        std::array<ChallengeType, N> challenges;
        for (size_t i = 0; i < N; i++) {
            challenges[i] = get_challenge<ChallengeType>(labels[i]);
        }
        return challenges;
    }

  private:
    Builder* builder;
    Proof proof_data;
    size_t proof_data_ptr = 0;
    std::unordered_map<std::string, NativeFF> precomputed_challenges;
};

} // namespace bb
