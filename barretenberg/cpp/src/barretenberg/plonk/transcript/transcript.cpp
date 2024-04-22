#include "transcript.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/net.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/crypto/keccak/keccak.hpp"
#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include "manifest.hpp"
#include <array>
#include <cstddef>
#include <iomanip>
#include <iostream>
#include <vector>

namespace bb::plonk::transcript {

// Set to 1 to enable some logging.
#if 0
template <typename... Args> inline void info_togglable(Args... args)
{
    info("Transcript: ", args...);
}
#else
template <typename... Args> inline void info_togglable(Args...) {}
#endif

std::array<uint8_t, Keccak256Hasher::PRNG_OUTPUT_SIZE> Keccak256Hasher::hash(std::vector<uint8_t> const& buffer)
{
    keccak256 hash_result = ethash_keccak256(&buffer[0], buffer.size());
    for (auto& word : hash_result.word64s) {
        if (is_little_endian()) {
            word = __builtin_bswap64(word);
        }
    }
    std::array<uint8_t, PRNG_OUTPUT_SIZE> result;

    for (size_t i = 0; i < 4; ++i) {
        for (size_t j = 0; j < 8; ++j) {
            uint8_t byte = static_cast<uint8_t>(hash_result.word64s[i] >> (56 - (j * 8)));
            result[i * 8 + j] = byte;
        }
    }
    return result;
}

std::array<uint8_t, Blake3sHasher::PRNG_OUTPUT_SIZE> Blake3sHasher::hash(std::vector<uint8_t> const& buffer)
{
    grumpkin::fq input = grumpkin::fq::serialize_from_buffer(&buffer[0]);
    grumpkin::fq hashed = bb::crypto::pedersen_hash::hash({ input });
    std::vector<uint8_t> res = to_buffer(hashed);
    std::array<uint8_t, PRNG_OUTPUT_SIZE> result;
    for (size_t i = 0; i < PRNG_OUTPUT_SIZE; ++i) {
        result[i] = res[i];
    }
    return result;
}

Transcript::Transcript(const std::vector<uint8_t>& input_transcript,
                       const Manifest input_manifest,
                       const HashType hash_type,
                       const size_t challenge_bytes)
    : num_challenge_bytes(challenge_bytes)
    , hasher(hash_type)
    , manifest(input_manifest)
{
    current_challenge.data = {};
    const size_t num_rounds = input_manifest.get_num_rounds();
    const uint8_t* buffer = &input_transcript[0];
    size_t count = 0;
    // Compute how much data we need according to the manifest
    size_t totalRequiredSize = 0;
    for (size_t i = 0; i < num_rounds; ++i) {
        for (auto manifest_element : input_manifest.get_round_manifest(i).elements) {
            if (!manifest_element.derived_by_verifier) {
                totalRequiredSize += manifest_element.num_bytes;
            }
        }
    }
    // Check that the total required size is equal to the size of the input_transcript
    if (totalRequiredSize != input_transcript.size())
        throw_or_abort(format("Serialized transcript does not contain the required number of bytes: ",
                              totalRequiredSize,
                              " != ",
                              input_transcript.size()));

    for (size_t i = 0; i < num_rounds; ++i) {
        for (auto manifest_element : input_manifest.get_round_manifest(i).elements) {
            if (!manifest_element.derived_by_verifier) {
                // printf("reading element %s ", manifest_element.name.c_str());
                // for (size_t j = 0; j < manifest_element.num_bytes; ++j) {
                //     printf("%x", buffer[count + j]);
                // }
                // printf("\n");

                // This can once again become a buffer overread if
                // someone removes the above checks.
                elements.insert({ manifest_element.name,
                                  std::vector<uint8_t>(buffer + count, buffer + count + manifest_element.num_bytes) });
                count += manifest_element.num_bytes;
            }
        }
    }
    compute_challenge_map();
    // printf("input buffer size = %lu \n", count);
}

/**
 * Insert element names from all rounds of the manifest
 * into the challenge_map.
 * */
void Transcript::compute_challenge_map()
{
    challenge_map = std::map<std::string, int>();
    for (const auto& manifest : manifest.get_round_manifests()) {
        if (manifest.map_challenges) {
            for (const auto& element : manifest.elements) {
                challenge_map.insert({ element.name, element.challenge_map_index });
            }
        }
    }
}

/**
 * @brief Mock prover transcript interactions up to fiat-shamir of a given challenge.
 *
 * @details This is useful for testing individual parts of the prover since all
 * transcript interactions must occur sequentially according to the manifest.
 * Function allows for optional input of circuit_size since this is needed in some
 * test cases, e.g. instantiating a Sumcheck from a mocked transcript.
 *
 * @param challenge_in
 */
void Transcript::mock_inputs_prior_to_challenge(const std::string& challenge_in, size_t circuit_size)
{
    // Perform operations only up to fiat-shamir of challenge_in
    for (auto& manifest : manifest.get_round_manifests()) // loop over RoundManifests
    {
        for (auto& entry : manifest.elements) // loop over ManifestEntrys
        {
            if (entry.name == "circuit_size") {
                add_element("circuit_size",
                            { static_cast<uint8_t>(circuit_size >> 24),
                              static_cast<uint8_t>(circuit_size >> 16),
                              static_cast<uint8_t>(circuit_size >> 8),
                              static_cast<uint8_t>(circuit_size) });
            } else {
                std::vector<uint8_t> buffer(entry.num_bytes, 1); // arbitrary buffer of 1's
                add_element(entry.name, buffer);
            }
        }
        if (challenge_in == manifest.challenge) {
            break;
        } else {
            apply_fiat_shamir(manifest.challenge);
        }
    }
}

void Transcript::add_element(const std::string& element_name, const std::vector<uint8_t>& buffer)
{
    info_togglable("add_element(): ", element_name, "\n");
    elements.insert({ element_name, buffer });
}

/**
 * Apply Fiat-Shamir transform to create challenges for the current round.
 * The challenges are saved to transcript. Round number is increased.
 *
 * @param challenge_name Challenge name (needed to check if the challenge fits the current round).
 * */
void Transcript::apply_fiat_shamir(const std::string& challenge_name /*, const bool info_togglable*/)
{
    // For reference, see the relevant manifest, which is defined in
    // plonk/composer/[standard/ultra]_composer.hpp
    ASSERT(current_round <= manifest.get_num_rounds());
    // TODO(Cody): Coupling: this line insists that the challenges in the manifest
    // are encountered in the order that matches the order of the proof construction functions.
    // Future architecture should specify this data in a single place (?).
    info_togglable("apply_fiat_shamir(): challenge name match:");
    info_togglable("\t challenge_name in: ", challenge_name);
    info_togglable("\t challenge_name expected: ", manifest.get_round_manifest(current_round).challenge, "\n");
    ASSERT(challenge_name == manifest.get_round_manifest(current_round).challenge);

    const size_t num_challenges = manifest.get_round_manifest(current_round).num_challenges;
    if (num_challenges == 0) {
        ++current_round;
        return;
    }

    // Combine the very last challenge from the previous fiat-shamir round (which is, inductively, a hash containing the
    // manifest data of all previous rounds), plus the manifest data for this round, into a buffer. This buffer will
    // ultimately be hashed, to form this round's fiat-shamir challenge(s).
    std::vector<uint8_t> buffer;
    if (current_round > 0) {
        buffer.insert(buffer.end(), current_challenge.data.begin(), current_challenge.data.end());
    }
    for (const auto& manifest_element : manifest.get_round_manifest(current_round).elements) {
        info_togglable("apply_fiat_shamir(): manifest element name match:");
        info_togglable("\t element name: ", manifest_element.name);
        info_togglable(
            "\t element exists and is unique: ", (elements.count(manifest_element.name) == 1) ? "true" : "false", "\n");
        ASSERT(elements.count(manifest_element.name) == 1);

        std::vector<uint8_t>& element_data = elements.at(manifest_element.name);
        if (!manifest_element.derived_by_verifier) {
            ASSERT(manifest_element.num_bytes == element_data.size());
        }
        buffer.insert(buffer.end(), element_data.begin(), element_data.end());
    }

    std::vector<challenge> round_challenges;
    std::array<uint8_t, PRNG_OUTPUT_SIZE> base_hash{};

    switch (hasher) {
    case HashType::Keccak256: {
        base_hash = Keccak256Hasher::hash(buffer);
        break;
    }
    case HashType::PedersenBlake3s: {
        std::vector<uint8_t> hashed_buffer = to_buffer(bb::crypto::pedersen_hash::hash_buffer(buffer));
        base_hash = Blake3sHasher::hash(hashed_buffer);
        break;
    }
    default: {
        throw_or_abort("no hasher was selected for the transcript");
    }
    }

    // Depending on the settings, we might be able to chunk the bytes of a single hash across multiple challenges:
    const size_t challenges_per_hash = PRNG_OUTPUT_SIZE / num_challenge_bytes;

    for (size_t j = 0; j < challenges_per_hash; ++j) {
        if (j < num_challenges) {
            // Each challenge still occupies PRNG_OUTPUT_SIZE number of bytes, but only num_challenge_bytes rhs bytes
            // are nonzero.
            std::array<uint8_t, PRNG_OUTPUT_SIZE> challenge{};
            std::copy(base_hash.begin() + (j * num_challenge_bytes),
                      base_hash.begin() + (j + 1) * num_challenge_bytes,
                      challenge.begin() +
                          (PRNG_OUTPUT_SIZE -
                           num_challenge_bytes)); // Left-pad the challenge with zeros, and then copy the next
                                                  // num_challange_bytes slice of the hash to the rhs of the challenge.
            round_challenges.push_back({ challenge });
        }
    }

    std::vector<uint8_t> rolling_buffer(base_hash.begin(), base_hash.end());
    if (hasher == HashType::Keccak256) {
        rolling_buffer.push_back(0);
    } else {
        rolling_buffer[31] = (0);
    }

    // Compute how many hashes we need so that we have enough distinct chunks of 'random' bytes to distribute
    // across the num_challenges.
    size_t num_hashes = (num_challenges / challenges_per_hash);
    if (num_hashes * challenges_per_hash != num_challenges) {
        ++num_hashes;
    }

    for (size_t i = 1; i < num_hashes; ++i) {
        // Compute hash_output = hash(base_hash, i);
        rolling_buffer[rolling_buffer.size() - 1] = static_cast<uint8_t>(i);
        std::array<uint8_t, PRNG_OUTPUT_SIZE> hash_output{};
        switch (hasher) {
        case HashType::Keccak256: {
            hash_output = Keccak256Hasher::hash(rolling_buffer);
            break;
        }
        case HashType::PedersenBlake3s: {
            hash_output = Blake3sHasher::hash(rolling_buffer);
            break;
        }
        default: {
            throw_or_abort("no hasher was selected for the transcript");
        }
        }
        for (size_t j = 0; j < challenges_per_hash; ++j) {
            // Only produce as many challenges as we need.
            if (challenges_per_hash * i + j < num_challenges) {
                std::array<uint8_t, PRNG_OUTPUT_SIZE> challenge{};
                std::copy(hash_output.begin() + (j * num_challenge_bytes),
                          hash_output.begin() + (j + 1) * num_challenge_bytes,
                          challenge.begin() + (PRNG_OUTPUT_SIZE - num_challenge_bytes));
                round_challenges.push_back({ challenge });
            }
        }
    }

    // Remember the very last challenge, as it will be included in the buffer of the next fiat-shamir round (since this
    // challenge is effectively a hash of _all_ previous rounds' manifest data).
    current_challenge = round_challenges[round_challenges.size() - 1];

    challenges.insert({ challenge_name, round_challenges });
    ++current_round;
}

/**
 * Get the challenge with the given name at index.
 * Will fail if there is no challenge with such name
 * or there are not enough subchallenges in the vector.
 *
 * @param challenge_name    The name of the challenge.
 * @param idx               The idx of subchallenge
 *
 * @return The challenge value
 * */
std::array<uint8_t, Transcript::PRNG_OUTPUT_SIZE> Transcript::get_challenge(const std::string& challenge_name,
                                                                            const size_t idx) const
{
    info_togglable("get_challenge(): ", challenge_name, "\n");
    ASSERT(challenges.count(challenge_name) == 1);
    return challenges.at(challenge_name)[idx].data;
}

/**
 * Get the challenge index from map (needed when we name subchallenges).
 *
 * @param challenge_map_name The name of the subchallenge
 *
 * @return The index of the subchallenge in the vector
 *  corresponding to the challenge.
 * */
int Transcript::get_challenge_index_from_map(const std::string& challenge_map_name) const
{
    const auto key = challenge_map.at(challenge_map_name);
    return key;
}

/**
 * Check if a challenge exists.
 *
 * @param challenge_name The name of the challenge
 *
 * @return true if exists, false if not
 * **/
bool Transcript::has_challenge(const std::string& challenge_name) const
{
    return (challenges.count(challenge_name) > 0);
}

/**
 * Get a particular subchallenge value by the name of the subchallenge.
 * For example, we use it with (nu, r).
 *
 * @param challenge_name The name of the challenge.
 * @param challenge_map_name The name of the subchallenge.
 *
 * @return The value of the subchallenge.
 * */
std::array<uint8_t, Transcript::PRNG_OUTPUT_SIZE> Transcript::get_challenge_from_map(
    const std::string& challenge_name, const std::string& challenge_map_name) const
{
    const auto key = challenge_map.at(challenge_map_name);
    if (key == -1) {
        std::array<uint8_t, Transcript::PRNG_OUTPUT_SIZE> result;
        for (size_t i = 0; i < Transcript::PRNG_OUTPUT_SIZE - 1; ++i) {
            result[i] = 0;
        }
        result[Transcript::PRNG_OUTPUT_SIZE - 1] = 1;
        return result;
    }
    const auto value = challenges.at(challenge_name)[static_cast<size_t>(key)];
    return value.data;
}

/**
 * Get the number of subchallenges for a given challenge.
 * Fails if no such challenge exists.
 * We use it with beta/gamma which need to be created in one
 * Fiat-Shamir transform.
 *
 * @param challenge_name The name of the challenge.
 *
 * @return The number of subchallenges.
 * */
size_t Transcript::get_num_challenges(const std::string& challenge_name) const
{
    ASSERT(challenges.count(challenge_name) == 1);

    return challenges.at(challenge_name).size();
}

/**
 * Get the value of an element.
 * Fails if there is no such element.
 *
 * @param element_name The name of the element.
 *
 * @return The value of the element.
 * */
std::vector<uint8_t> Transcript::get_element(const std::string& element_name) const
{
    ASSERT(elements.count(element_name) == 1);
    return elements.at(element_name);
}

/**
 * Get the size of an element from the manifest.
 *
 * @param element_name The name of the element
 *
 * @return The size of the element if found, otherwise -1.
 * */
size_t Transcript::get_element_size(const std::string& element_name) const
{
    for (size_t i = 0; i < manifest.get_num_rounds(); ++i) {
        for (auto manifest_element : manifest.get_round_manifest(i).elements) {
            if (manifest_element.name == element_name) {
                return manifest_element.num_bytes;
            }
        }
    }
    return static_cast<size_t>(-1);
}

/**
 * Serialize transcript to a vector of bytes.
 *
 * @return Serialized transcript
 * */
std::vector<uint8_t> Transcript::export_transcript() const
{
    std::vector<uint8_t> buffer;

    for (size_t i = 0; i < manifest.get_num_rounds(); ++i) {
        for (auto manifest_element : manifest.get_round_manifest(i).elements) {
            ASSERT(elements.count(manifest_element.name) == 1);
            const std::vector<uint8_t>& element_data = elements.at(manifest_element.name);
            if (!manifest_element.derived_by_verifier) {
                ASSERT(manifest_element.num_bytes == element_data.size());
            }
            if (!manifest_element.derived_by_verifier) {
                // printf("writing element %s ", manifest_element.name.c_str());
                // for (size_t j = 0; j < element_data.size(); ++j) {
                //     printf("%x", element_data[j]);
                // }
                // printf("\n");
                buffer.insert(buffer.end(), element_data.begin(), element_data.end());
            }
        }
    }
    // printf("output buffer size = %lu \n", buffer.size());
    return buffer;
}

} // namespace bb::plonk::transcript
