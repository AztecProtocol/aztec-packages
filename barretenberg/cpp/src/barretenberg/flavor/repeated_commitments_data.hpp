// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <cstddef>

namespace bb {
// Indices into the Shplemini commitments vector identifying contiguous ranges of to-be-shifted and shifted commitments.
// These are absolute indices that already account for any entries preceding the polynomial commitments (e.g. Shplonk:Q,
// Gemini:masking_poly_comm).
struct RepeatedCommitmentsData {
    size_t first_range_to_be_shifted_start = 0;
    size_t first_range_shifted_start = 0;
    size_t first_range_size = 0;
    size_t second_range_to_be_shifted_start = 0;
    size_t second_range_shifted_start = 0;
    size_t second_range_size = 0;

    RepeatedCommitmentsData() = default;
    // Constructor for a single range
    constexpr RepeatedCommitmentsData(size_t first_to_be_shifted_start, size_t first_shifted_start, size_t first_size)
        : first_range_to_be_shifted_start(first_to_be_shifted_start)
        , first_range_shifted_start(first_shifted_start)
        , first_range_size(first_size)
    {}

    // Constructor for both ranges
    constexpr RepeatedCommitmentsData(size_t first_to_be_shifted_start,
                                      size_t first_shifted_start,
                                      size_t first_size,
                                      size_t second_to_be_shifted_start,
                                      size_t second_shifted_start,
                                      size_t second_size)
        : first_range_to_be_shifted_start(first_to_be_shifted_start)
        , first_range_shifted_start(first_shifted_start)
        , first_range_size(first_size)
        , second_range_to_be_shifted_start(second_to_be_shifted_start)
        , second_range_shifted_start(second_shifted_start)
        , second_range_size(second_size)
    {}
};
} // namespace bb
