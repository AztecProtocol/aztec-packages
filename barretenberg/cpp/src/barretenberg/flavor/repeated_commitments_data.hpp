// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/throw_or_abort.hpp"
#include <array>
#include <cstddef>
#include <span>

namespace bb {

// Non-constexpr no-return helper used to fail constant evaluation with a readable diagnostic
// when `repeated_commitments_from_pairs` is invoked on a layout it can't represent. Calling a
// non-constexpr function from a constexpr context is ill-formed, so the compiler emits an error
// pointing at this name (and the body's `throw_or_abort` runs at runtime in the unlikely event
// the function is reached non-constexpr).
[[noreturn]] inline void repeated_commitments_too_many_runs()
{
    throw_or_abort("repeated_commitments_from_pairs: layout produces more than 2 non-contiguous runs");
}

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

/**
 * @brief One commitment shared by an unshifted polynomial and its shifted copy.
 *
 * @details The pair-form is the layout-derived source of truth used by codegen: each shifted
 * entity contributes one (original_index, duplicate_index) entry. It works for any layout — no
 * contiguity constraint, no upper bound. `repeated_commitments_from_pairs` collapses a sorted
 * pair list into the legacy two-range `RepeatedCommitmentsData` that Shplemini consumes today,
 * so callers can stay on the existing API while the underlying layout becomes flexible.
 */
struct DuplicatePair {
    size_t original = 0;
    size_t duplicate = 0;
};

/**
 * @brief Collapse a span of (original, duplicate) pairs into a `RepeatedCommitmentsData` of up to
 * two contiguous ranges.
 *
 * @details Pairs are expected in ascending `duplicate` order (which is how the codegen emits
 * them: shifted-suffix order). Adjacent pairs are grouped into a range when both `original` and
 * `duplicate` are sequential. If the layout produces more than two non-contiguous runs the
 * caller must extend `RepeatedCommitmentsData`; today we throw a compile-time error there.
 */
constexpr RepeatedCommitmentsData repeated_commitments_from_pairs(std::span<const DuplicatePair> pairs)
{
    if (pairs.empty()) {
        return {};
    }
    std::array<DuplicateRange, 2> ranges{};
    size_t range_count = 0;
    DuplicateRange current{ pairs[0].original, pairs[0].duplicate, 1 };
    const auto close_range = [&](DuplicateRange r) constexpr {
        if (range_count == 2) {
            // More than two non-contiguous runs — RepeatedCommitmentsData can't represent this.
            // Calling a non-constexpr function from a constexpr context fails compilation; if
            // this fires, either reorder the layout to merge runs or extend
            // RepeatedCommitmentsData to hold more ranges.
            repeated_commitments_too_many_runs();
        }
        ranges[range_count++] = r;
    };
    for (size_t i = 1; i < pairs.size(); ++i) {
        const auto& p = pairs[i];
        if (p.original == current.original_start + current.count &&
            p.duplicate == current.duplicate_start + current.count) {
            ++current.count;
        } else {
            close_range(current);
            current = { p.original, p.duplicate, 1 };
        }
    }
    close_range(current);
    if (range_count == 1) {
        return RepeatedCommitmentsData{ ranges[0].original_start, ranges[0].duplicate_start, ranges[0].count };
    }
    return RepeatedCommitmentsData{ ranges[0].original_start, ranges[0].duplicate_start, ranges[0].count,
                                    ranges[1].original_start, ranges[1].duplicate_start, ranges[1].count };
}

} // namespace bb
