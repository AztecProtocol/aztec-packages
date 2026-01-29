// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/transcript/origin_tag.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <sstream>

namespace bb {
using namespace numeric;
#ifndef AZTEC_NO_ORIGIN_TAGS

/**
 * @brief Find the position of the highest set bit in a uint128_t
 * @return -1 if no bits are set, otherwise the bit position (0-127)
 */
static inline int highest_set_bit_128(uint128_t value)
{
    if (value == 0) {
        return -1;
    }
    // Check high 64 bits first
    auto high = static_cast<uint64_t>(value >> 64);
    if (high != 0) {
        return 127 - __builtin_clzll(high);
    }
    // Check low 64 bits
    auto low = static_cast<uint64_t>(value);
    return 63 - __builtin_clzll(low);
}

/**
 * @brief Convert a round bitmask to a human-readable string listing the set rounds
 * @param bitmask The bitmask where bit i indicates round i is set
 * @return String like "{0, 2, 5}" or "{}" if empty
 */
static std::string rounds_to_string(uint128_t bitmask)
{
    if (bitmask == 0) {
        return "{}";
    }
    std::ostringstream oss;
    oss << "{";
    bool first = true;
    for (int i = 0; i <= highest_set_bit_128(bitmask); ++i) {
        if ((bitmask >> i) & 1) {
            if (!first) {
                oss << ", ";
            }
            oss << i;
            first = false;
        }
    }
    oss << "}";
    return oss.str();
}

/**
 * @brief Detect if two elements from the same transcript are performing a suspicious interaction
 *
 * @details Checks that submitted values from different rounds are properly bound by challenges.
 * The key invariant: a challenge from round N binds all data from rounds 0..N (via Fiat-Shamir hash chain).
 * Therefore, max(challenge_rounds) must be >= max(submitted_rounds).
 *
 * @param provenance_a Round provenance of first element
 * @param provenance_b Round provenance of second element
 */
void check_round_provenance(const uint256_t& provenance_a, const uint256_t& provenance_b)
{
    const auto challenges_a = *reinterpret_cast<const uint128_t*>(&provenance_a.data[2]);
    const auto challenges_b = *reinterpret_cast<const uint128_t*>(&provenance_b.data[2]);
    const auto submitted_a = *reinterpret_cast<const uint128_t*>(&provenance_a.data[0]);
    const auto submitted_b = *reinterpret_cast<const uint128_t*>(&provenance_b.data[0]);

    // If either has no submitted data, nothing to check
    if (submitted_a == 0 || submitted_b == 0) {
        return;
    }

    // If both have the exact same submitted pattern, they're from the same round(s) - OK to combine
    // (This preserves the original behavior: two round-0 values can combine before any challenge)
    if (submitted_a == submitted_b) {
        return;
    }

    // Different submitted patterns - need challenge coverage
    const uint128_t merged_challenges = challenges_a | challenges_b;
    const uint128_t merged_submitted = submitted_a | submitted_b;

    if (merged_challenges == 0) {
        info("");
        info("=== ORIGIN TAG ROUND PROVENANCE CHECK FAILED ===");
        info("Failure reason: No challenges present when mixing values from different rounds");
        info("");
        info("Element A:");
        info("  Submitted rounds: ", rounds_to_string(submitted_a));
        info("  Challenge rounds: ", rounds_to_string(challenges_a));
        info("Element B:");
        info("  Submitted rounds: ", rounds_to_string(submitted_b));
        info("  Challenge rounds: ", rounds_to_string(challenges_b));
        info("");
        info("Merged state:");
        info("  All submitted rounds: ", rounds_to_string(merged_submitted));
        info("  All challenge rounds: {} (NONE!)");
        info("");
        info("Problem: Values from different submitted rounds are being combined,");
        info("but no challenge has been incorporated to bind them.");
        info("=================================================");
        info("");
        throw_or_abort("Round provenance check failed: mixing submitted values from different rounds without any "
                       "challenge coverage");
    }

    const int max_submitted_round = highest_set_bit_128(merged_submitted);
    const int max_challenge_round = highest_set_bit_128(merged_challenges);

    // The highest challenge round must be >= the highest submitted round
    // This ensures all submitted data is bound by a challenge from at least that round
    if (max_challenge_round < max_submitted_round) {
        info("");
        info("=== ORIGIN TAG ROUND PROVENANCE CHECK FAILED ===");
        info("Failure reason: Challenge coverage insufficient for submitted rounds");
        info("");
        info("Element A:");
        info("  Submitted rounds: ", rounds_to_string(submitted_a));
        info("  Challenge rounds: ", rounds_to_string(challenges_a));
        info("Element B:");
        info("  Submitted rounds: ", rounds_to_string(submitted_b));
        info("  Challenge rounds: ", rounds_to_string(challenges_b));
        info("");
        info("Merged state:");
        info("  All submitted rounds: ", rounds_to_string(merged_submitted));
        info("  All challenge rounds: ", rounds_to_string(merged_challenges));
        info("  Max submitted round: ", max_submitted_round);
        info("  Max challenge round: ", max_challenge_round);
        info("");
        info("Problem: The highest challenge round (", max_challenge_round, ") is less than");
        info("the highest submitted round (", max_submitted_round, ").");
        info("A value submitted in round ", max_submitted_round, " is being combined with earlier data,");
        info("but no challenge from round ", max_submitted_round, " or later has been incorporated.");
        info("This means a malicious prover could choose the round-", max_submitted_round, " value");
        info("after seeing the challenges, potentially breaking soundness.");
        info("=================================================");
        info("");
        throw_or_abort("Round provenance check failed: max challenge round < max submitted round");
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
        throw_or_abort("Touched an element that should not have been touched");
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
            throw_or_abort("A free witness element should not interact with an element that has an origin");
        } else {
            // If both are free witnesses or one of them is empty, just use tag_a
            *this = tag_a;
            return;
        }
    }
    if (tag_b.is_free_witness()) {
        if (!tag_a.is_free_witness() && !tag_a.is_empty()) {
            throw_or_abort("A free witness element should not interact with an element that has an origin");
        } else {
            // If both are free witnesses or one of them is empty, just use tag_b
            *this = tag_b;
            return;
        }
    }
    // Elements from different transcripts shouldn't interact
    if (tag_a.transcript_index != tag_b.transcript_index) {
        throw_or_abort("Tags from different transcripts were involved in the same computation");
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
