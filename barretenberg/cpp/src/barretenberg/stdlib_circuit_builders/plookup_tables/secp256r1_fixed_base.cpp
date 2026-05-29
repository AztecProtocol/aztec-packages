#include "./secp256r1_fixed_base.hpp"

#include "./types.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/ecc/groups/precomputed_generators.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_secp256r1_impl.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"

namespace bb::plookup::secp256r1_fixed_base {

// Static storage for the precomputed table entries.
std::array<std::array<table::AffineElement, table::TABLE_SIZE_BIG>, table::NUM_WINDOWS> table::native_table;
table::AffineElement table::cached_total_offset;
std::once_flag table::init_flag;

void table::init_tables()
{
    std::call_once(init_flag, []() {
        constexpr AffineElement H =
            bb::get_precomputed_generators<G1, "biggroup table offset generator", 1UL, 0UL>()[0];

        // Step per window: 2^(8w) · G.
        Element window_step = Element(G1::affine_one);

        // Total offset accumulator: sums all 2^w · H contributions.
        Element offset_total = Element::infinity();

        for (size_t w = 0; w < NUM_WINDOWS; ++w) {
            // Per-window offset: 2^w · H. We compute it by doubling H w times rather than scalar-mul to keep this
            // straightforward; this code runs once per process so the cost is irrelevant.
            const G1::Fr offset_scalar(uint256_t(1) << w);
            const Element window_offset = Element(H) * offset_scalar;
            offset_total += window_offset;

            // Build the entries for this window: T[k] = k · window_step + window_offset. The per-window
            // size and step are determined by table_size(w) and window_bits(w) (7-bit "big" windows
            // plus a 3-bit lo-tail and a 1-bit hi-tail).
            const size_t ts = table_size(w);
            const size_t wb = window_bits(w);
            std::array<Element, TABLE_SIZE_BIG> projective;
            projective[0] = window_offset;
            for (size_t k = 1; k < ts; ++k) {
                projective[k] = projective[k - 1] + window_step;
            }
            Element::batch_normalize(projective.data(), ts);
            for (size_t k = 0; k < ts; ++k) {
                native_table[w][k] = AffineElement(projective[k].x, projective[k].y);
            }

            // Advance the step for the next window: window_step *= 2^window_bits(w).
            for (size_t i = 0; i < wb; ++i) {
                window_step = window_step.dbl();
            }
        }

        cached_total_offset = AffineElement(offset_total);
    });
}

table::AffineElement table::total_offset()
{
    init_tables();
    return cached_total_offset;
}

std::array<bb::fr, 2> table::extract_axis(const AffineElement& point, AxisIndex axis)
{
    constexpr uint64_t NUM_LIMB_BITS = stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;
    constexpr uint256_t LIMB_MASK = (uint256_t(1) << NUM_LIMB_BITS) - uint256_t(1);

    auto limb_pair = [&](const uint256_t& val, size_t low_limb_idx) {
        return std::array<bb::fr, 2>{ bb::fr((val >> (low_limb_idx * NUM_LIMB_BITS)) & LIMB_MASK),
                                      bb::fr((val >> ((low_limb_idx + 1) * NUM_LIMB_BITS)) & LIMB_MASK) };
    };

    const uint256_t x_uint(point.x);
    const uint256_t y_uint(point.y);

    switch (axis) {
    case AXIS_XLO:
        return limb_pair(x_uint, 0);
    case AXIS_XHI:
        return limb_pair(x_uint, 2);
    case AXIS_YLO:
        return limb_pair(y_uint, 0);
    case AXIS_YHI:
        return limb_pair(y_uint, 2);
    }
    return { bb::fr(0), bb::fr(0) }; // unreachable
}

template <table::AxisIndex axis, size_t window_idx> std::array<bb::fr, 2> table::get_values(std::array<uint64_t, 2> key)
{
    init_tables();
    const size_t index = static_cast<size_t>(key[0]);
    BB_ASSERT_LT(index, table_size(window_idx));
    return extract_axis(native_table[window_idx][index], axis);
}

template <table::AxisIndex axis, size_t window_idx>
BasicTable table::generate_basic_table(BasicTableId id, size_t table_index)
{
    init_tables();

    constexpr size_t TS = table_size(window_idx);

    BasicTable t;
    t.id = id;
    t.table_index = table_index;
    t.use_twin_keys = false;
    t.column_1.reserve(TS);
    t.column_2.reserve(TS);
    t.column_3.reserve(TS);
    for (size_t k = 0; k < TS; ++k) {
        const auto [val_a, val_b] = extract_axis(native_table[window_idx][k], axis);
        t.column_1.emplace_back(k);
        t.column_2.emplace_back(val_a);
        t.column_3.emplace_back(val_b);
    }
    t.get_values_from_key = &get_values<axis, window_idx>;
    t.column_1_step_size = bb::fr(0);
    t.column_2_step_size = bb::fr(0);
    t.column_3_step_size = bb::fr(0);
    return t;
}

namespace {
// Returns `&table::generate_basic_table<axis, window_idx>` for a runtime window_idx. The 32-entry
// function-pointer array is built once at compile time and shared across calls.
using generate_fn_ptr = BasicTable (*)(BasicTableId, size_t);

template <table::AxisIndex axis> generate_fn_ptr generate_fn_for_window(size_t window_idx)
{
    static constexpr auto fns = []() {
        std::array<generate_fn_ptr, table::NUM_WINDOWS> arr{};
        [&]<size_t... Is>(std::index_sequence<Is...>) {
            ((arr[Is] = &table::generate_basic_table<axis, Is>), ...);
        }(std::make_index_sequence<table::NUM_WINDOWS>{});
        return arr;
    }();
    return fns[window_idx];
}
} // namespace

template <table::AxisIndex axis> BasicTable table::generate_basic_table_runtime(BasicTableId id, size_t window_idx)
{
    BB_ASSERT_LT(window_idx, NUM_WINDOWS);
    return generate_fn_for_window<axis>(window_idx)(id, window_idx);
}

// Explicit instantiations for the four axes.
template BasicTable table::generate_basic_table_runtime<table::AXIS_XLO>(BasicTableId, size_t);
template BasicTable table::generate_basic_table_runtime<table::AXIS_XHI>(BasicTableId, size_t);
template BasicTable table::generate_basic_table_runtime<table::AXIS_YLO>(BasicTableId, size_t);
template BasicTable table::generate_basic_table_runtime<table::AXIS_YHI>(BasicTableId, size_t);

namespace {
// Returns `&table::get_values<axis, window_idx>` for a runtime (axis, window_idx). The per-axis 32-entry
// function-pointer array is built once at compile time and shared across calls.
using get_values_fn_ptr = std::array<bb::fr, 2> (*)(std::array<uint64_t, 2>);

template <table::AxisIndex axis> get_values_fn_ptr get_values_fn_for_window(size_t window_idx)
{
    static constexpr auto fns = []() {
        std::array<get_values_fn_ptr, table::NUM_WINDOWS> arr{};
        [&]<size_t... Is>(std::index_sequence<Is...>) {
            ((arr[Is] = &table::get_values<axis, Is>), ...);
        }(std::make_index_sequence<table::NUM_WINDOWS>{});
        return arr;
    }();
    return fns[window_idx];
}

get_values_fn_ptr lookup_get_values(table::AxisIndex axis, size_t window_idx)
{
    BB_ASSERT_LT(window_idx, table::NUM_WINDOWS);
    switch (axis) {
    case table::AXIS_XLO:
        return get_values_fn_for_window<table::AXIS_XLO>(window_idx);
    case table::AXIS_XHI:
        return get_values_fn_for_window<table::AXIS_XHI>(window_idx);
    case table::AXIS_YLO:
        return get_values_fn_for_window<table::AXIS_YLO>(window_idx);
    case table::AXIS_YHI:
        return get_values_fn_for_window<table::AXIS_YHI>(window_idx);
    }
    return nullptr; // unreachable
}
} // namespace

MultiTable table::get_multitable(MultiTableId id, AxisIndex axis, bool is_lo)
{
    const size_t num_windows = is_lo ? NUM_WINDOWS_LO : NUM_WINDOWS_HI;
    const size_t start_window = is_lo ? 0 : NUM_WINDOWS_LO;

    // C1 step = TABLE_SIZE_BIG = 128 (uniform 7-bit slicing between consecutive windows; the tail's
    // smaller bit-width is encoded only in `slice_sizes` below, not in the c1 step). C2/C3 step = 0
    // (per-window values, no accumulation).
    MultiTable mt(bb::fr(static_cast<uint64_t>(TABLE_SIZE_BIG)), bb::fr(0), bb::fr(0), num_windows);
    mt.id = id;
    mt.basic_table_ids.reserve(num_windows);
    mt.get_table_values.reserve(num_windows);
    for (size_t i = 0; i < num_windows; ++i) {
        const size_t window_idx = start_window + i;
        mt.slice_sizes.emplace_back(table_size(window_idx));
        mt.basic_table_ids.emplace_back(
            static_cast<BasicTableId>(static_cast<size_t>(axis_start_id(axis)) + window_idx));
        mt.get_table_values.emplace_back(lookup_get_values(axis, window_idx));
    }
    return mt;
}

} // namespace bb::plookup::secp256r1_fixed_base
