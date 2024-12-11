#include "barretenberg/transcript/origin_tag.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

namespace bb {
using namespace numeric;
#ifndef NDEBUG

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
#else
bool OriginTag::operator==(const OriginTag&) const
{
    return true;
}
#endif
} // namespace bb