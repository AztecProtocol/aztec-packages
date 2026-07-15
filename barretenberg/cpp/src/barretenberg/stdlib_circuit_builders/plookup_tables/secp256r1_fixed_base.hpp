#pragma once

#include "./types.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include <array>
#include <mutex>
#include <utility>

namespace bb::plookup::secp256r1_fixed_base {

/**
 * @brief Per-window plookup tables for the secp256r1 fixed-base scalar multiplication.
 *
 * @details Tables back the Pedersen-style fixed-base multiplication used by
 * `element::secp256r1_fixed_base_mul` in biggroup_secp256r1.hpp.
 *
 * The scalar `u` is sliced little-endian into 7-bit "big" windows plus one short tail window per half.
 * For window index w ∈ [0, NUM_WINDOWS), entry k ∈ [0, table_size(w)) holds the point
 *     P_{w,k} := k · 2^(bit_offset(w)) · G + 2^w · H
 * where G is the secp256r1 generator, H is the precomputed "biggroup table offset generator", and
 * bit_offset(w) is the cumulative bit position of window w (sum of window_bits over [0, w)). Adding
 * 2^w · H to every entry per-window keeps the entries distinct across windows so the in-circuit
 * chain-add of the looked-up points never hits an incomplete-addition edge case for honest inputs.
 * The aggregate offset (2^NUM_WINDOWS − 1) · H is constant and is subtracted off at the end of the
 * in-circuit computation.
 *
 * Each point P_{w,k} is split across four basic tables, one per binary-basis limb axis:
 *   - XLO:      (x_limb_0, x_limb_1)
 *   - XHI:      (x_limb_2, x_limb_3)
 *   - YLO:      (y_limb_0, y_limb_1)
 *   - YHI:      (y_limb_2, y_limb_3)
 *
 * The bigfield prime-basis limb (x mod p / y mod p) is recomputed in-circuit from the four binary limbs
 * by the caller, trading 2 add gates per coordinate per window for 8192 fewer preprocessed table rows.
 *
 * Window scheme is **7-bit dominant with short tails**: the bigfield's lo half (136 bits) is sliced
 * into 19 × 7-bit "big" windows plus 1 × 3-bit lo-tail; the hi half (120 bits) is sliced into 17 × 7-bit
 * "big" windows plus 1 × 1-bit hi-tail. That gives 36 × 7-bit windows in total (table size 128 each)
 * plus two small tail tables (size 8 for lo-tail, size 2 for hi-tail). All inter-window boundaries are
 * 7-bit aligned, so the MultiTable column-1 step is uniformly 128 — only the per-window `slice_sizes`
 * vector encodes the tail bit-widths.
 *
 * Four contiguous BasicTableId ranges (NUM_WINDOWS = 38 IDs each) are reserved in `types.hpp`; ID
 * `SECP256R1_FIXED_BASE_<AXIS>_0 + w` is the table for axis `AXIS`, window `w`. The two tail positions
 * within each range are also exposed as named indices `LO_TAIL_WINDOW = NUM_WINDOWS_LO - 1` and
 * `HI_TAIL_WINDOW = NUM_WINDOWS - 1` for use by `window_bits`/`table_size`.
 *
 * Per-axis the 38 BasicTables are bundled into two MultiTables — one over the 20 lo windows and one
 * over the 18 hi windows (4 × 2 = 8 MultiTableIds: `SECP256R1_FIXED_BASE_<AXIS>_<LO|HI>`). Columns 2/3
 * use step 0 so each window's C2/C3 entries are the per-window (limb_a, limb_b) pair (no accumulation).
 *
 * Table data is precomputed once (under std::call_once) at the first lookup. Total preprocessed rows:
 * 4 · (19 · 128 + 8 + 17 · 128 + 2) = 18,472 — down from 32,768 with uniform 8-bit windows.
 */
// Inherits all layout numerics (NUM_WINDOWS*, WINDOW_BITS_*, TABLE_SIZE_*, NUM_AXES, LO_TAIL_WINDOW,
// HI_TAIL_WINDOW, and the `window_bits` / `table_size` helpers) from Secp256r1FixedBaseParams. They live
// in `secp256r1_fixed_base_params.hpp` so the enum in `types.hpp` can reach them without a cycle.
class table : public Secp256r1FixedBaseParams {
  public:
    using G1 = bb::secp256r1::g1;
    using Element = G1::element;
    using AffineElement = G1::affine_element;

    enum AxisIndex : size_t {
        AXIS_XLO = 0,
        AXIS_XHI = 1,
        AXIS_YLO = 2,
        AXIS_YHI = 3,
    };

    /**
     * @brief Maps a per-axis BasicTableId range start to its AxisIndex; used by the create_basic_table dispatch.
     */
    static constexpr BasicTableId axis_start_id(AxisIndex axis)
    {
        switch (axis) {
        case AXIS_XLO:
            return SECP256R1_FIXED_BASE_XLO_0;
        case AXIS_XHI:
            return SECP256R1_FIXED_BASE_XHI_0;
        case AXIS_YLO:
            return SECP256R1_FIXED_BASE_YLO_0;
        case AXIS_YHI:
            return SECP256R1_FIXED_BASE_YHI_0;
        }
        return SECP256R1_FIXED_BASE_XLO_0; // unreachable
    }

    /**
     * @brief Precompute the 32 × 256 native points (idempotent, thread-safe). The (limb_a, limb_b) pairs for each
     * axis are derived on demand by the get_*_values functions.
     */
    static void init_tables();

    /**
     * @brief Sum of all per-window offsets (2^0 + 2^1 + ... + 2^31) · H. Subtracted from the chain-add result of
     * the looked-up points to recover u · G in the in-circuit caller.
     */
    static AffineElement total_offset();

    /**
     * @brief Native lookup callback used by BasicTable::get_values_from_key. `axis_window_packed` encodes the
     * window position in the high 32 bits and the axis index in the low 32 bits; key[0] is the 8-bit window byte.
     * Defined out-of-line because the function pointer is stored by BasicTable rather than the templated
     * generators below.
     */
    template <AxisIndex axis, size_t window_idx> static std::array<bb::fr, 2> get_values(std::array<uint64_t, 2> key);

    /**
     * @brief Construct one BasicTable instance for (axis, window_idx). `id` is the BasicTableId assigned by the
     * caller (= axis_start_id(axis) + window_idx) and `table_index` is the index this table will occupy in the
     * builder's lookup_tables deque.
     */
    template <AxisIndex axis, size_t window_idx>
    static BasicTable generate_basic_table(BasicTableId id, size_t table_index);

    /**
     * @brief Runtime dispatch helper used by plookup_tables.cpp::create_basic_table. Given an axis and a
     * runtime window_idx ∈ [0, NUM_WINDOWS), instantiate the corresponding generator.
     */
    template <AxisIndex axis> static BasicTable generate_basic_table_runtime(BasicTableId id, size_t table_index);

    /**
     * @brief Construct one of the 10 MultiTables described in the file-header docstring.
     * `is_lo = true` chains windows [0, NUM_WINDOWS_LO); `is_lo = false` chains [NUM_WINDOWS_LO, NUM_WINDOWS).
     * Used by `element::secp256r1_fixed_base_mul` via `plookup_read<C>::get_lookup_accumulators`.
     */
    static MultiTable get_multitable(MultiTableId id, AxisIndex axis, bool is_lo);

    /**
     * @brief Access a precomputed entry. The biggroup caller uses this to compute proving-time hint values
     * (val_a, val_b) before emitting create_lookup_gate calls.
     */
    static const AffineElement& get_entry(size_t window_idx, size_t k)
    {
        init_tables();
        BB_ASSERT_LT(window_idx, NUM_WINDOWS);
        BB_ASSERT_LT(k, table_size(window_idx));
        return native_table[window_idx][k];
    }

    /**
     * @brief Split an affine point into the (limb_a, limb_b) pair for the requested axis. Used by the
     * BasicTable generators above and by callers that need to set up lookup-gate hint values.
     */
    static std::array<bb::fr, 2> extract_axis(const AffineElement& point, AxisIndex axis);

  private:
    // Precomputed entries: native_table[w][k] = k · 2^(bit_offset(w)) · G + 2^w · H. The array is sized
    // to the big-window table size (128); tail windows only populate the first table_size(w) entries
    // (8 for the lo tail, 2 for the hi tail), and the trailing slots are unused.
    static std::array<std::array<AffineElement, TABLE_SIZE_BIG>, NUM_WINDOWS> native_table;
    static AffineElement cached_total_offset;
    static std::once_flag init_flag;
};

} // namespace bb::plookup::secp256r1_fixed_base
