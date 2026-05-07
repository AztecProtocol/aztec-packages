// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/transcript/origin_tag.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <cstring>
#include <string>

namespace bb {
using namespace numeric;
#ifndef AZTEC_NO_ORIGIN_TAGS

namespace {
/**
 * @brief Find the position of the highest set bit in a uint256_t
 * @return -1 if no bits are set, otherwise the bit position (0-255)
 */
inline int highest_set_bit_256(uint256_t value)
{
    if (value == 0) {
        return -1;
    }
    // Check high bits first, then go down
    for (int idx = 0; idx < 3; idx++) {
        auto chunk = static_cast<uint64_t>(value >> 64 * (3 - idx));
        if (chunk != 0) {
            return 255 - (idx * 64) - __builtin_clzll(chunk);
        }
    }

    // Lowest bits
    auto chunk = static_cast<uint64_t>(value);
    return 63 - __builtin_clzll(chunk);
}

/**
 * @brief Safely extract uint256_t from uint512_t data array using memcpy to avoid strict aliasing issues
 */
inline uint256_t extract_uint256(const uint256_t& data)
{
    uint256_t result = 0;
    for (size_t idx = 0; idx < 4; ++idx) {
        std::memcpy(&result.data[idx], &data.data[idx], sizeof(uint64_t));
    }
    return result;
}
} // namespace

/**
 * @brief Detect if two elements from the same transcript are performing a suspicious interaction
 *
 * @details Checks that submitted values from different rounds are properly bound by challenges.
 * The key invariant: a challenge from round N binds all data from rounds 0..N (via Fiat-Shamir hash chain).
 * Therefore, max(challenge_rounds) must be >= max(submitted_rounds).
 *
 * @note A failure in this check indicates a potentially insecure pattern but there are many legitimate sources of false
 * positives. E.g. PCS openings bind evaluations to commitments across rounds; the pattern C*z + v is actually safe if
 * v is the evaluation of the committed polynomial at challenge z. In such cases, the evaluation can be re-tagged
 * with the challenge that binds it after PCS verification to correctly avoid triggering an error here.
 *
 * @param provenance_a Round provenance of first element
 * @param provenance_b Round provenance of second element
 */
void check_round_provenance(const uint512_t& provenance_a, const uint512_t& provenance_b)
{
    // Lower 256 bits = submitted rounds, Upper 256 bits = challenge rounds
    const auto submitted_a = extract_uint256(provenance_a.lo);
    const auto submitted_b = extract_uint256(provenance_b.lo);

    // Nothing to check if either has no submitted data or both are from the same round(s)
    if (submitted_a == 0 || submitted_b == 0 || submitted_a == submitted_b) {
        return;
    }

    // Ensure that values from different rounds are not mixing without max challenge round >= max submitted round
    const auto challenges_a = extract_uint256(provenance_a.hi);
    const auto challenges_b = extract_uint256(provenance_b.hi);
    const int max_challenge_round = highest_set_bit_256(challenges_a | challenges_b);
    const int max_submitted_round = highest_set_bit_256(submitted_a | submitted_b);

    if (max_challenge_round < max_submitted_round) {
        throw_or_abort("Round provenance check failed: max challenge round (" + std::to_string(max_challenge_round) +
                       ") < max submitted round (" + std::to_string(max_submitted_round) + ")");
    }
}

bool OriginTag::operator==(const OriginTag& other) const
{
    return this->transcript_index == other.transcript_index && this->round_provenance == other.round_provenance &&
           this->instant_death == other.instant_death;
}
OriginTag::OriginTag(const OriginTag& tag_a, const OriginTag& tag_b)
{
    // Elements with instant death should not be touched
    if (tag_a.instant_death || tag_b.instant_death) {
        throw_or_abort("Touched an element that should not have been touched. tag_a id: " +
                       std::to_string(tag_a.tag_id) + ", tag_b id: " + std::to_string(tag_b.tag_id));
    }
    // If one of the tags is a constant, just use the other tag
    if (tag_a.transcript_index == CONSTANT) {
        *this = tag_b;
        return;
    }
    if (tag_b.transcript_index == CONSTANT) {
        *this = tag_a;
        return;
    }

    // A free witness element should not interact with an element that has an origin
    if (tag_a.is_free_witness()) {
        if (!tag_b.is_free_witness() && !tag_b.is_empty()) {
            throw_or_abort(
                "A free witness element (id: " + std::to_string(tag_a.tag_id) +
                ") should not interact with an element that has an origin (id: " + std::to_string(tag_b.tag_id) + ")");
        } else {
            // If both are free witnesses or one of them is empty, just use tag_a
            *this = tag_a;
            return;
        }
    }
    if (tag_b.is_free_witness()) {
        if (!tag_a.is_free_witness() && !tag_a.is_empty()) {
            throw_or_abort(
                "A free witness element (id: " + std::to_string(tag_b.tag_id) +
                ") should not interact with an element that has an origin (id: " + std::to_string(tag_a.tag_id) + ")");
        } else {
            // If both are free witnesses or one of them is empty, just use tag_b
            *this = tag_b;
            return;
        }
    }
    // Elements from different transcripts shouldn't interact
    if (tag_a.transcript_index != tag_b.transcript_index) {
        throw_or_abort("Tags from different transcripts were involved in the same computation. tag_a: { id: " +
                       std::to_string(tag_a.tag_id) + ", transcript: " + std::to_string(tag_a.transcript_index) +
                       " } tag_b: { id: " + std::to_string(tag_b.tag_id) +
                       ", transcript: " + std::to_string(tag_b.transcript_index) + " }");
    }
    // Check that submitted values from different rounds don't mix without challenges
    check_round_provenance(tag_a.round_provenance, tag_b.round_provenance);

    transcript_index = tag_a.transcript_index;
    round_provenance = tag_a.round_provenance | tag_b.round_provenance;
}

#else
bool OriginTag::operator==(const OriginTag&) const
{
    return true;
}

#endif
} // namespace bb
