// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include <cstddef>

namespace bb::plookup {

/**
 * @brief Layout parameters for the secp256r1 fixed-base plookup decomposition.
 *
 * Pure numerics (window counts, bit widths, table sizes, tail positions, the bit-budget invariants, and the
 * `window_bits` / `table_size` per-window helpers). Nothing here depends on the curve type or on
 * `BasicTableId`, so this header can be included by `types.hpp` without pulling in
 * `secp256r1_fixed_base.hpp` (which itself depends on `types.hpp`). `table` inherits from this struct so
 * call sites continue to write `table::NUM_WINDOWS`, `table::TABLE_SIZE_BIG`, etc.
 */
struct Secp256r1FixedBaseParams {
    // 7-bit-dominant window layout with short tails per half.
    // Lo half (20 windows = 19 × 7 + 1 × 3 = 136 bits) covers the bigfield's lo half (= 2·NUM_LIMB_BITS).
    // Hi half (18 windows = 17 × 7 + 1 × 1 = 120 bits) covers the bigfield's hi half
    // (= NUM_LIMB_BITS + NUM_LAST_LIMB_BITS).
    //
    // The "big" windows are all 7-bit (128 entries); each half ends in a short tail window so the
    // per-half bit count matches the bigfield's invariant exactly. Inter-window steps are uniformly
    // 128 across both halves (every transition is at a 7-bit boundary), so the MultiTable column-1
    // coefficient is uniformly 128 — the tail's smaller `slice_size` is what distinguishes it.
    static constexpr size_t NUM_WINDOWS_LO = 20;
    static constexpr size_t NUM_WINDOWS_HI = 18;
    static constexpr size_t NUM_WINDOWS = NUM_WINDOWS_LO + NUM_WINDOWS_HI;
    static constexpr size_t WINDOW_BITS = 7;
    static constexpr size_t WINDOW_BITS_LO_TAIL = 3;
    static constexpr size_t WINDOW_BITS_HI_TAIL = 1;
    static constexpr size_t TABLE_SIZE_BIG = 1ULL << WINDOW_BITS;             // 128
    static constexpr size_t TABLE_SIZE_LO_TAIL = 1ULL << WINDOW_BITS_LO_TAIL; // 8
    static constexpr size_t TABLE_SIZE_HI_TAIL = 1ULL << WINDOW_BITS_HI_TAIL; // 2
    static constexpr size_t NUM_AXES = 4;

    // Named indices of the two tail windows within the global [0, NUM_WINDOWS) range.
    static constexpr size_t LO_TAIL_WINDOW = NUM_WINDOWS_LO - 1; // 19
    static constexpr size_t HI_TAIL_WINDOW = NUM_WINDOWS - 1;    // 37

    static_assert((NUM_WINDOWS_LO - 1) * WINDOW_BITS + WINDOW_BITS_LO_TAIL == 136,
                  "lo half must cover 2·NUM_LIMB_BITS = 136 bits");
    static_assert((NUM_WINDOWS_HI - 1) * WINDOW_BITS + WINDOW_BITS_HI_TAIL == 120,
                  "hi half must cover NUM_LIMB_BITS + NUM_LAST_LIMB_BITS = 120 bits");

    // Per-window helpers: window position w ∈ [0, NUM_WINDOWS) → (bit-width, table-size).
    static constexpr size_t window_bits(size_t w)
    {
        if (w == LO_TAIL_WINDOW) {
            return WINDOW_BITS_LO_TAIL;
        }
        if (w == HI_TAIL_WINDOW) {
            return WINDOW_BITS_HI_TAIL;
        }
        return WINDOW_BITS;
    }
    static constexpr size_t table_size(size_t w)
    {
        if (w == LO_TAIL_WINDOW) {
            return TABLE_SIZE_LO_TAIL;
        }
        if (w == HI_TAIL_WINDOW) {
            return TABLE_SIZE_HI_TAIL;
        }
        return TABLE_SIZE_BIG;
    }
};

} // namespace bb::plookup
