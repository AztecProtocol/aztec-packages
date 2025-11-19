// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/transcript/origin_tag.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

namespace bb {
using namespace numeric;
#ifndef AZTEC_NO_ORIGIN_TAGS

/**
 * @brief Detect if two elements from the same transcript are performing a suspicious interaction
 *
 * @details For now this detects that 2 elements from 2 different round can't mingle without a challenge in between
 *
 * @param provenance_a Round provenance of first element
 * @param provenance_b Round provenance of second element
 */
void check_round_provenance(const uint256_t& provenance_a, const uint256_t& provenance_b)
{
    const uint128_t* challenges_a = (const uint128_t*)(&provenance_a.data[2]);
    const uint128_t* challenges_b = (const uint128_t*)(&provenance_b.data[2]);

    const uint128_t* submitted_a = (const uint128_t*)(&provenance_a.data[0]);
    const uint128_t* submitted_b = (const uint128_t*)(&provenance_b.data[0]);

    if (*challenges_a == 0 && *challenges_b == 0 && *submitted_a != 0 && *submitted_b != 0 &&
        *submitted_a != *submitted_b) {
        throw_or_abort("Submitted values from 2 different rounds are mixing without challenges");
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