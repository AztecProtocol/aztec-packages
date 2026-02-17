// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <cstddef>

namespace bb {

/**
 * @brief Identifies contiguous ranges of duplicate commitments in the AllEntities ordering so that Shplemini can merge
 * their scalar multiplications before the final MSM.
 *
 * @details A "shifted" polynomial shares the same commitment as its unshifted original (it is the same multilinear
 * polynomial, just evaluated at the next row of the execution trace). Without this optimization the verifier would
 * perform two separate scalar muls against the same group element. Each DuplicateRange pairs the originals with their
 * duplicates so Shplemini can add their scalars and erase the duplicate entries.
 *
 * Up to two contiguous ranges are supported (sufficient for all current flavors).
 */
struct DuplicateRange {
    size_t original_start = 0;  // start index of the original (unshifted) polynomials in AllEntities
    size_t duplicate_start = 0; // start index of the duplicate (shifted) entries in AllEntities
    size_t count = 0;           // number of polynomials in this range
};

struct RepeatedCommitmentsData {
    DuplicateRange first;
    DuplicateRange second;

    RepeatedCommitmentsData() = default;

    constexpr RepeatedCommitmentsData(size_t first_original_start, size_t first_duplicate_start, size_t first_count)
        : first{ first_original_start, first_duplicate_start, first_count }
    {}

    constexpr RepeatedCommitmentsData(size_t first_original_start,
                                      size_t first_duplicate_start,
                                      size_t first_count,
                                      size_t second_original_start,
                                      size_t second_duplicate_start,
                                      size_t second_count)
        : first{ first_original_start, first_duplicate_start, first_count }
        , second{ second_original_start, second_duplicate_start, second_count }
    {}
};
} // namespace bb
