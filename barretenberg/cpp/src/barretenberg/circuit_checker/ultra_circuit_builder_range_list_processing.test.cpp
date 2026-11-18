#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib_circuit_builders/bounded_range_sort.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <algorithm>
#include <cstdint>
#include <gtest/gtest.h>
#include <memory>
#include <random>
#include <string>
#include <type_traits>
#include <vector>

/**
 * finalize_circuit must build exactly the circuit that the serial range-list processing below builds, at every
 * parallel_for concurrency and in both builder modes: same variables, copy cycles, tags, range lists, gates, gate count
 * and failure state.
 */

namespace bb {
namespace {

// The parallel_for concurrencies every case runs at, highest first so that a worker pool created here has workers.
std::vector<size_t> concurrencies()
{
#ifdef NO_MULTITHREADING
    return { 1 };
#else
    return { 16, 5, 2, 1 };
#endif
}

// Sets the parallel_for concurrency of this thread for its lifetime.
class ConcurrencyScope {
  public:
    explicit ConcurrencyScope([[maybe_unused]] const size_t concurrency)
    {
#ifndef NO_MULTITHREADING
        set_parallel_for_concurrency(concurrency);
#endif
    }
    ~ConcurrencyScope()
    {
#ifndef NO_MULTITHREADING
        set_parallel_for_concurrency(previous_);
#endif
    }
    ConcurrencyScope(const ConcurrencyScope&) = delete;
    ConcurrencyScope& operator=(const ConcurrencyScope&) = delete;
    ConcurrencyScope(ConcurrencyScope&&) = delete;
    ConcurrencyScope& operator=(ConcurrencyScope&&) = delete;

  private:
    size_t previous_ = get_num_cpus();
};

template <typename Builder> Builder make_builder(const bool is_write_vk_mode)
{
    if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
        return Builder(std::make_shared<ECCOpQueue>(), is_write_vk_mode);
    } else {
        return Builder(is_write_vk_mode);
    }
}

template <typename Builder>
void reference_append_delta_range_rows(Builder& builder, const std::vector<uint32_t>& indices)
{
    for (size_t i = 0; i < indices.size(); i += Builder::NUM_WIRES) {
        builder.increment_num_gates();
        typename Builder::GateRowT row{};
        row.wires = { indices[i], indices[i + 1], indices[i + 2], indices[i + 3] };
        row.gate_value = fr(1);
        builder.blocks.delta_range.template append_gate<GateKind::DeltaRange>(row);
    }
}

template <typename Builder> void reference_enforce_small_deltas(Builder& builder, const std::vector<uint32_t>& indices)
{
    reference_append_delta_range_rows(builder, indices);
    builder.create_unconstrained_gate(
        builder.blocks.delta_range, indices.back(), builder.zero_idx(), builder.zero_idx(), builder.zero_idx());
}

template <typename Builder>
void reference_create_sort_constraint_with_edges(Builder& builder,
                                                 const std::vector<uint32_t>& indices,
                                                 const fr& start,
                                                 const fr& end)
{
    const uint32_t zero = builder.zero_idx();
    builder.create_add_gate({ indices[0], zero, zero, 1, 0, 0, -start });
    reference_append_delta_range_rows(builder, indices);
    builder.create_unconstrained_gate(builder.blocks.delta_range, indices.back(), zero, zero, zero);
    builder.create_add_gate({ indices.back(), zero, zero, 1, 0, 0, -end });
}

// Serial range-list processing: one add_variable call per sorted value. Any sort of the values gives the same sequence.
template <typename Builder> void reference_process_range_list(Builder& builder, typename Builder::RangeList& list)
{
    for (uint32_t& x : list.variable_indices) {
        x = builder.real_variable_index[x];
    }
    std::sort(list.variable_indices.begin(), list.variable_indices.end());
    list.variable_indices.erase(std::unique(list.variable_indices.begin(), list.variable_indices.end()),
                                list.variable_indices.end());

    std::vector<uint32_t> sorted_list;
    for (const uint32_t variable_index : list.variable_indices) {
        const uint256_t value(builder.get_variable(variable_index));
        sorted_list.push_back(static_cast<uint32_t>(value.data[0]));
    }
    std::sort(sorted_list.begin(), sorted_list.end());

    constexpr size_t gate_width = Builder::NUM_WIRES;
    size_t padding = (gate_width - (list.variable_indices.size() % gate_width)) % gate_width;
    if (list.variable_indices.size() <= gate_width) {
        padding += gate_width;
    }
    std::vector<uint32_t> indices(padding, builder.zero_idx());
    for (const uint32_t sorted_value : sorted_list) {
        const uint32_t index = builder.add_variable(fr(sorted_value));
        builder.real_variable_tags[index] = list.tau_tag;
        indices.push_back(index);
    }
    reference_create_sort_constraint_with_edges(builder, indices, fr(0), fr(list.target_range));
}

template <typename Builder> void reference_finalize_circuit(Builder& builder)
{
    builder.process_non_native_field_multiplications();
    builder.rom_ram_logic.process_ROM_arrays(&builder);
    builder.rom_ram_logic.process_RAM_arrays(&builder);
    for (auto& [target_range, list] : builder.range_lists) {
        reference_process_range_list(builder, list);
    }
    builder.populate_public_inputs_block();
    builder.circuit_finalized = true;
}

template <typename Builder> void expect_same_circuit(const Builder& actual, const Builder& expected)
{
    // The base comparison covers variables, copy cycles, tags, tau, gate count, public inputs and failure state.
    EXPECT_TRUE(static_cast<const CircuitBuilderBase<fr>&>(actual) ==
                static_cast<const CircuitBuilderBase<fr>&>(expected));
    EXPECT_TRUE(actual.get_variables() == expected.get_variables());
    EXPECT_EQ(actual.real_variable_index, expected.real_variable_index);
    EXPECT_EQ(actual.real_variable_tags, expected.real_variable_tags);
    EXPECT_EQ(actual.num_gates(), expected.num_gates());
    EXPECT_EQ(actual.failed(), expected.failed());
    EXPECT_EQ(actual.err(), expected.err());
    EXPECT_TRUE(actual.range_lists == expected.range_lists);
    EXPECT_TRUE(actual.blocks == expected.blocks);
    EXPECT_EQ(actual.memory_read_records, expected.memory_read_records);
    EXPECT_EQ(actual.memory_write_records, expected.memory_write_records);
}

struct RangeListSpec {
    uint64_t target_range;
    // Range-constrained variables created by the circuit; the first two take the values 0 and target_range.
    size_t num_entries;
    // Entries joined by assert_equal into the variables of the list's initial staircase that share their value.
    size_t num_merged_into_staircase = 0;
    // Range-constrained copies of earlier entries joined to them by assert_equal.
    size_t num_duplicates = 0;
    // Entries whose class is joined into a later, untagged variable, which becomes its real variable.
    size_t num_relocated = 0;
    // Entries with a value above target_range, among them one with a value of more than 64 bits.
    size_t num_out_of_range = 0;
};

struct CircuitSpec {
    std::vector<RangeListSpec> lists;
    // Variables created before the lists, which spread the lists' entries over more variables.
    size_t num_filler_variables = 0;
    bool with_memory = false;
    uint64_t seed = 1;
};

template <typename Builder> void build_circuit(Builder& builder, const CircuitSpec& spec)
{
    std::mt19937_64 rng(spec.seed);
    const uint32_t zero = builder.zero_idx();
    for (size_t i = 0; i < spec.num_filler_variables; ++i) {
        builder.add_variable(fr(rng()));
    }
    const auto add_entry = [&](const uint256_t& value, const uint64_t target_range) {
        const uint32_t index = builder.add_variable(fr(value));
        builder.create_unconstrained_gate(builder.blocks.arithmetic, index, zero, zero, zero);
        builder.create_small_range_constraint(index, target_range, "range list entry");
        return index;
    };

    // The entries of the lists are created interleaved.
    std::vector<std::vector<uint32_t>> entries(spec.lists.size());
    size_t max_entries = 0;
    for (const auto& list : spec.lists) {
        max_entries = std::max(max_entries, list.num_entries);
    }
    for (size_t k = 0; k < max_entries; ++k) {
        for (size_t l = 0; l < spec.lists.size(); ++l) {
            const uint64_t target_range = spec.lists[l].target_range;
            if (k < spec.lists[l].num_entries) {
                const uint64_t value = k == 0 ? 0 : k == 1 ? target_range : rng() % (target_range + 1);
                entries[l].push_back(add_entry(value, target_range));
            }
        }
    }

    for (size_t l = 0; l < spec.lists.size(); ++l) {
        const RangeListSpec& list = spec.lists[l];
        // The staircase entries lead the list's indices.
        const std::vector<uint32_t> staircase = [&] {
            const auto& indices = builder.range_lists.at(list.target_range).variable_indices;
            return std::vector<uint32_t>(
                indices.begin(), indices.begin() + static_cast<std::ptrdiff_t>(indices.size() - list.num_entries));
        }();
        for (size_t k = 0; k < std::min(list.num_merged_into_staircase, entries[l].size()); ++k) {
            for (const uint32_t stair : staircase) {
                if (builder.get_variable(stair) == builder.get_variable(entries[l][k])) {
                    builder.assert_equal(stair, entries[l][k]);
                }
            }
        }
        for (size_t d = 0; d < list.num_duplicates; ++d) {
            const uint32_t original = entries[l][rng() % entries[l].size()];
            const uint32_t copy = add_entry(uint256_t(builder.get_variable(original)), list.target_range);
            builder.assert_equal(original, copy);
        }
        for (size_t r = 0; r < list.num_relocated; ++r) {
            const uint32_t entry = entries[l][rng() % entries[l].size()];
            const uint32_t holder = builder.add_variable(builder.get_variable(entry));
            builder.create_unconstrained_gate(builder.blocks.arithmetic, holder, zero, zero, zero);
            builder.assert_equal(holder, entry);
        }
        for (size_t o = 0; o < list.num_out_of_range; ++o) {
            // 2^64 + 3 passes the registration check, which reads the low 64 bits, and still fails the full-value range
            // check of the list's processing.
            const uint256_t value = o == 0   ? (uint256_t(1) << 64) + 3
                                    : o == 1 ? (uint256_t(1) << 40) + 7
                                             : uint256_t(list.target_range + 1 + (rng() % 5));
            add_entry(value, list.target_range);
        }
    }

    if (spec.with_memory) {
        const size_t rom_id = builder.create_ROM_array(4);
        const size_t ram_id = builder.create_RAM_array(4);
        for (size_t i = 0; i < 4; ++i) {
            builder.set_ROM_element(rom_id, i, builder.add_variable(fr(rng() % 1000)));
            builder.init_RAM_element(ram_id, i, builder.add_variable(fr(rng() % 1000)));
        }
        for (size_t j = 0; j < 12; ++j) {
            builder.read_ROM_array(rom_id, builder.add_variable(fr(rng() % 4)));
            const uint32_t ram_index = builder.add_variable(fr(rng() % 4));
            if (j % 3 == 0) {
                builder.write_RAM_array(ram_id, ram_index, builder.add_variable(fr(rng() % 1000)));
            } else {
                builder.read_RAM_array(ram_id, ram_index);
            }
        }
    }
}

template <typename Builder> class RangeListProcessing : public ::testing::Test {
  protected:
    // `expect_failed`: building the circuit records a failure. `expect_valid`: the finalized circuit is satisfied.
    static void expect_same_finalization(const CircuitSpec& spec, const bool expect_valid, const bool expect_failed)
    {
        for (const bool is_write_vk_mode : { false, true }) {
            for (const size_t concurrency : concurrencies()) {
                SCOPED_TRACE("write_vk_mode " + std::to_string(static_cast<int>(is_write_vk_mode)) + ", concurrency " +
                             std::to_string(concurrency));
                const ConcurrencyScope scope(concurrency);
                auto actual = make_builder<Builder>(is_write_vk_mode);
                auto expected = make_builder<Builder>(is_write_vk_mode);
                build_circuit(actual, spec);
                build_circuit(expected, spec);
                expect_same_circuit(actual, expected);
                EXPECT_EQ(actual.failed(), expect_failed) << actual.err();
                if (expect_valid && !is_write_vk_mode && concurrency == concurrencies().front()) {
                    EXPECT_TRUE(CircuitChecker::check(actual));
                }
                actual.finalize_circuit();
                reference_finalize_circuit(expected);
                expect_same_circuit(actual, expected);
            }
        }
    }
};

using Builders = ::testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;
TYPED_TEST_SUITE(RangeListProcessing, Builders);

TYPED_TEST(RangeListProcessing, ListSizesAroundThePadding)
{
    // A range of 0 merged into its staircase leaves one real variable; a range of 1 leaves two plus the unmerged
    // entries. Together they cover deduplicated lists of 1 to 9 entries.
    for (size_t num_entries = 1; num_entries <= 9; ++num_entries) {
        SCOPED_TRACE("entries " + std::to_string(num_entries));
        const CircuitSpec spec{
            .lists = { { .target_range = 0, .num_entries = num_entries, .num_merged_into_staircase = num_entries },
                       { .target_range = 1, .num_entries = num_entries, .num_merged_into_staircase = 2 },
                       { .target_range = 7, .num_entries = num_entries },
                       { .target_range = 1000, .num_entries = num_entries } },
            .seed = num_entries
        };
        TestFixture::expect_same_finalization(spec, true, false);
    }
}

TYPED_TEST(RangeListProcessing, DuplicatesAndRelocatedEntries)
{
    const CircuitSpec spec{
        .lists = { { .target_range = 3, .num_entries = 40, .num_duplicates = 30, .num_relocated = 10 },
                   { .target_range = 255,
                     .num_entries = 3000,
                     .num_merged_into_staircase = 50,
                     .num_duplicates = 400,
                     .num_relocated = 300 },
                   { .target_range = (1U << 14) - 1,
                     .num_entries = 2500,
                     .num_duplicates = 100,
                     .num_relocated = 100 } },
        .with_memory = true,
        .seed = 11
    };
    TestFixture::expect_same_finalization(spec, true, false);
}

TYPED_TEST(RangeListProcessing, SparseListsAmongManyVariables)
{
    // Lists far smaller than the variable count, next to a dense one.
    const CircuitSpec spec{
        .lists = { { .target_range = 7, .num_entries = 20, .num_duplicates = 5, .num_relocated = 5 },
                   { .target_range = 100, .num_entries = 200, .num_relocated = 20 },
                   { .target_range = 15, .num_entries = 60000, .num_duplicates = 50 } },
        .num_filler_variables = 300000,
        .seed = 12
    };
    TestFixture::expect_same_finalization(spec, true, false);
}

TYPED_TEST(RangeListProcessing, LargeLists)
{
    // Long enough for several chunks in each pass, including several counting chunks for the range of 255.
    const CircuitSpec spec{
        .lists = { { .target_range = 255, .num_entries = 140000, .num_duplicates = 2000, .num_relocated = 2000 },
                   { .target_range = (1U << 14) - 1, .num_entries = 30000, .num_relocated = 500 },
                   { .target_range = (1U << 16) - 1, .num_entries = 2000, .num_duplicates = 20 } },
        .seed = 13
    };
    TestFixture::expect_same_finalization(spec, true, false);
}

TYPED_TEST(RangeListProcessing, OutOfRangeValues)
{
    const CircuitSpec spec{
        .lists = { { .target_range = 255, .num_entries = 20000, .num_relocated = 100, .num_out_of_range = 6 },
                   { .target_range = 9, .num_entries = 7, .num_out_of_range = 3 },
                   { .target_range = 1, .num_entries = 2, .num_out_of_range = 1 } },
        .seed = 14
    };
    TestFixture::expect_same_finalization(spec, false, true);

    // The value of more than 64 bits alone passes registration; only the processing of the list sees it out of range.
    // The list is sparse among the variables.
    const CircuitSpec high_bits_only{ .lists = { { .target_range = 255, .num_entries = 30, .num_out_of_range = 1 } },
                                      .num_filler_variables = 300000,
                                      .seed = 15 };
    TestFixture::expect_same_finalization(high_bits_only, false, false);
}

TEST(RangeListProcessingPrimitives, DeltaRangeRowsMatchTheSerialRows)
{
    UltraCircuitBuilder actual;
    UltraCircuitBuilder expected;
    std::vector<uint32_t> indices;
    for (uint32_t value = 0; value < 16; ++value) {
        indices.push_back(actual.add_variable(fr(value)));
        EXPECT_EQ(expected.add_variable(fr(value)), indices.back());
    }
    actual.enforce_small_deltas(indices);
    reference_enforce_small_deltas(expected, indices);
    actual.create_sort_constraint_with_edges(indices, fr(0), fr(15));
    reference_create_sort_constraint_with_edges(expected, indices, fr(0), fr(15));
    expect_same_circuit(actual, expected);
}

TEST(RangeListProcessingPrimitives, CountingSortAtEveryConcurrency)
{
    std::mt19937_64 rng(21);
    for (const uint64_t maximum : { uint64_t{ 3 }, uint64_t{ 255 }, uint64_t{ (1U << 14) - 1 }, uint64_t{ 65535 } }) {
        for (const size_t size : { size_t{ 300 }, size_t{ 70000 }, size_t{ 600000 } }) {
            std::vector<uint32_t> values(size);
            for (auto& value : values) {
                value = static_cast<uint32_t>(rng() % (maximum + 1));
            }
            auto expected = values;
            std::sort(expected.begin(), expected.end());
            auto out_of_range = values;
            out_of_range[(size * 2) / 3] = static_cast<uint32_t>(maximum + 1);
            for (const size_t concurrency : concurrencies()) {
                SCOPED_TRACE("maximum " + std::to_string(maximum) + ", size " + std::to_string(size) +
                             ", concurrency " + std::to_string(concurrency));
                const ConcurrencyScope scope(concurrency);
                auto sorted = values;
                if (range_sort::try_counting_sort(sorted, maximum)) {
                    EXPECT_EQ(sorted, expected);
                } else {
                    EXPECT_LT(size, maximum + 1);
                    EXPECT_EQ(sorted, values);
                }
                auto rejected = out_of_range;
                EXPECT_FALSE(range_sort::try_counting_sort(rejected, maximum));
                EXPECT_EQ(rejected, out_of_range);
            }
        }
    }
}

} // namespace
} // namespace bb
