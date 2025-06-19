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
 * @param tag_a
 * @param tag_b
 */
void check_child_tags(const uint256_t& tag_a, const uint256_t& tag_b)
{
    const uint128_t* challenges_a = (const uint128_t*)(&tag_a.data[2]);
    const uint128_t* challenges_b = (const uint128_t*)(&tag_b.data[2]);

    const uint128_t* submitted_a = (const uint128_t*)(&tag_a.data[0]);
    const uint128_t* submitted_b = (const uint128_t*)(&tag_b.data[0]);

    if (*challenges_a == 0 && *challenges_b == 0 && *submitted_a != 0 && *submitted_b != 0 &&
        *submitted_a != *submitted_b) {
        throw_or_abort("Submitted values from 2 different rounds are mixing without challenges");
    }
}

bool OriginTag::operator==(const OriginTag& other) const
{
    return this->parent_tag == other.parent_tag && this->child_tag == other.child_tag &&
           this->instant_death == other.instant_death;
}
OriginTag::OriginTag(const OriginTag& tag_a, const OriginTag& tag_b)
{
    // Elements with instant death should not be touched
    if (tag_a.instant_death || tag_b.instant_death) {
        throw_or_abort("Touched an element that should not have been touched");
    }
    // If one of the tags is a constant, just use the other tag
    if (tag_a.parent_tag == CONSTANT) {
        *this = tag_b;
        return;
    }
    if (tag_b.parent_tag == CONSTANT) {
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
#ifndef DISABLE_DIFFERENT_TRANSCRIPT_CHECKS
    if (tag_a.parent_tag != tag_b.parent_tag) {
        throw_or_abort("Tags from different transcripts were involved in the same computation");
    }
#endif
#ifndef DISABLE_CHILD_TAG_CHECKS
    check_child_tags(tag_a.child_tag, tag_b.child_tag);
#endif
    parent_tag = tag_a.parent_tag;
    child_tag = tag_a.child_tag | tag_b.child_tag;
}

#else
bool OriginTag::operator==(const OriginTag&) const
{
    return true;
}

#endif
} // namespace bb