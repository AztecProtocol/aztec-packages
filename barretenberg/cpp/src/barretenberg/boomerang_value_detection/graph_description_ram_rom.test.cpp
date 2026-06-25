#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/memory/ram_table.hpp"
#include "barretenberg/stdlib/primitives/memory/rom_table.hpp"

using namespace bb;
using namespace cdg;
namespace {
auto& engine = numeric::get_debug_randomness();

bb::fr high_entropy_value(uint64_t offset)
{
    return bb::fr((uint256_t(0x123456789abcdefULL + offset) << 192) +
                  (uint256_t(0xfedcba987654321ULL + offset) << 128) +
                  (uint256_t(0x0badf00dcafebeefULL + offset) << 64) + uint256_t(0x0102030405060708ULL + offset));
}
} // namespace

using Builder = UltraCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using rom_table_ct = stdlib::rom_table<Builder>;
using ram_table_ct = stdlib::ram_table<Builder>;

/**
 * @brief Test graph description for ROM table operations
 *
 * @details This test verifies that:
 * - Reading random values at sequential indices creates one connected component
 * - No variables are in one gate due to connections through table accesses
 */
TEST(boomerang_rom_ram_table, graph_description_rom_table)
{
    Builder builder;

    std::vector<field_ct> table_values;
    const size_t table_size = 10;
    for (size_t i = 0; i < table_size; ++i) {
        table_values.emplace_back(witness_ct(&builder, bb::fr::random_element()));
    }
    for (auto& elem : table_values) {
        elem.fix_witness();
    }

    rom_table_ct table(table_values);
    std::unordered_set<uint32_t> safety_variables;

    field_ct result = field_ct(witness_ct(&builder, (uint64_t)0));

    for (size_t i = 0; i < 10; ++i) {
        safety_variables.insert(result.get_witness_index());
        field_ct index(witness_ct(&builder, (uint64_t)i));
        index.fix_witness();
        result += table[index];
    }

    result.fix_witness();
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    for (const auto& elem : variables_in_one_gate) {
        EXPECT_EQ(variables_in_one_gate.contains(elem), true);
    }
}

/**
 * @brief Test graph description for RAM table read operations
 *
 * @details This test verifies that:
 * - Reading random values at sequential indices creates one connected component
 * - No variables are in one gate due to connections through table reads
 */
TEST(boomerang_rom_ram_table, graph_description_ram_table_read)
{
    Builder builder;

    std::vector<field_ct> table_values;
    const size_t table_size = 10;
    for (size_t i = 0; i < table_size; ++i) {
        table_values.emplace_back(witness_ct(&builder, bb::fr::random_element()));
    }

    for (auto& elem : table_values) {
        elem.fix_witness();
    }

    ram_table_ct table(table_values);
    field_ct result = field_ct(witness_ct(&builder, (uint64_t)0));
    std::unordered_set<uint32_t> safety_variables;

    for (size_t i = 0; i < 10; ++i) {
        safety_variables.insert(result.get_witness_index());
        field_ct index(witness_ct(&builder, (uint64_t)i));
        index.fix_witness();
        result += table.read(index);
    }

    result.fix_witness();
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    for (const auto& elem : variables_in_one_gate) {
        EXPECT_EQ(safety_variables.contains(elem), true);
    }
}

/**
 * @brief Test graph description for RAM table write and read operations
 *
 * @details This test verifies that:
 * - Alternating write and read operations create one connected component
 * - Non-sequential access patterns work correctly
 * - No variables are in one gate
 *
 * The test includes:
 * - Initial zero initialization
 * - Multiple update-read cycles
 * - Non-sequential read access pattern
 */
TEST(boomerang_rom_ram_table, graph_description_ram_table_write)
{
    Builder builder;
    const size_t table_size = 10;

    std::vector<fr> table_values(table_size);
    std::vector<field_ct> zeros(table_size, field_ct(0));
    ram_table_ct table(&builder, zeros);

    for (size_t i = 0; i < table_size; ++i) {
        table.write(i, 0);
    }

    std::unordered_set<uint32_t> safety_variables;
    field_ct result(0);
    safety_variables.insert(result.get_witness_index());

    const auto update = [&]() {
        for (size_t i = 0; i < table_size / 2; ++i) {
            table_values[2 * i] = fr::random_element();
            table_values[2 * i + 1] = fr::random_element();

            // init with both constant and variable values
            field_ct value1(witness_ct(&builder, table_values[2 * i]));
            field_ct value2(witness_ct(&builder, table_values[2 * i + 1]));
            value1.fix_witness();
            value2.fix_witness();
            table.write(2 * i, value1);
            table.write(2 * i + 1, value2);
        }
    };

    const auto read = [&]() {
        for (size_t i = 0; i < table_size / 2; ++i) {
            const size_t index = table_size - 2 - (i * 2); // access in something other than basic incremental order
            field_ct index1(witness_ct(&builder, index));
            field_ct index2(witness_ct(&builder, index + 1));
            index1.fix_witness();
            index2.fix_witness();
            result += table.read(index1);
            safety_variables.insert(result.get_witness_index());
            result += table.read(index2);
            safety_variables.insert(result.get_witness_index());
        }
    };

    update();
    read();
    update();
    read();
    update();

    result.fix_witness();
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    for (const auto& elem : variables_in_one_gate) {
        EXPECT_EQ(safety_variables.contains(elem), true);
    }
}

TEST(boomerang_rom_ram_table, duplicate_filter_suppresses_same_rom_table_slot)
{
    Builder builder;
    const bb::fr duplicate_value = high_entropy_value(1);

    std::vector<field_ct> table_values{
        witness_ct(&builder, duplicate_value),
        witness_ct(&builder, high_entropy_value(2)),
    };
    rom_table_ct table(&builder, table_values);
    field_ct index(witness_ct(&builder, uint64_t(0)));

    const field_ct first_read = table[index];
    const field_ct second_read = table[index];
    EXPECT_EQ(first_read.get_value(), duplicate_value);
    EXPECT_EQ(second_read.get_value(), duplicate_value);

    builder.finalize_circuit();
    StaticAnalyzer analyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(duplicate_value));
}

TEST(boomerang_rom_ram_table, duplicate_filter_suppresses_rom_slot_source_and_reads_without_main_graph_edges)
{
    Builder builder;
    const bb::fr duplicate_value = high_entropy_value(18);

    field_ct slot_source(witness_ct(&builder, duplicate_value));
    field_ct peer(witness_ct(&builder, high_entropy_value(19)));
    field_ct sum = slot_source + peer;
    std::vector<field_ct> table_values{
        slot_source,
        witness_ct(&builder, high_entropy_value(20)),
    };
    rom_table_ct table(&builder, table_values);
    field_ct index(witness_ct(&builder, uint64_t(0)));

    const field_ct first_read = table[index];
    const field_ct second_read = table[index];
    EXPECT_EQ(sum.get_value(), duplicate_value + high_entropy_value(19));
    EXPECT_EQ(first_read.get_value(), duplicate_value);
    EXPECT_EQ(second_read.get_value(), duplicate_value);

    builder.finalize_circuit();
    StaticAnalyzer analyzer(builder, /*connect_variables=*/false);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(duplicate_value));
}

TEST(boomerang_rom_ram_table, duplicate_filter_uses_memory_overlay_without_main_graph_edges)
{
    Builder builder;
    const bb::fr rom_duplicate_value = high_entropy_value(14);
    const bb::fr ram_duplicate_value = high_entropy_value(17);

    std::vector<field_ct> rom_table_values{
        witness_ct(&builder, rom_duplicate_value),
        witness_ct(&builder, high_entropy_value(15)),
    };
    rom_table_ct rom_table(&builder, rom_table_values);
    field_ct rom_index(witness_ct(&builder, uint64_t(0)));
    EXPECT_EQ(rom_table[rom_index].get_value(), rom_duplicate_value);
    EXPECT_EQ(rom_table[rom_index].get_value(), rom_duplicate_value);

    std::vector<field_ct> ram_table_values{
        witness_ct(&builder, ram_duplicate_value),
        witness_ct(&builder, high_entropy_value(16)),
    };
    ram_table_ct ram_table(&builder, ram_table_values);
    field_ct ram_index(witness_ct(&builder, uint64_t(0)));
    EXPECT_EQ(ram_table.read(ram_index).get_value(), ram_duplicate_value);
    EXPECT_EQ(ram_table.read(ram_index).get_value(), ram_duplicate_value);

    builder.finalize_circuit();
    StaticAnalyzer analyzer(builder, /*connect_variables=*/false);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(rom_duplicate_value));
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(ram_duplicate_value));
}

TEST(boomerang_rom_ram_table, duplicate_filter_keeps_distinct_rom_tables)
{
    Builder builder;
    const bb::fr duplicate_value = high_entropy_value(3);

    std::vector<field_ct> first_table_values{
        witness_ct(&builder, duplicate_value),
        witness_ct(&builder, high_entropy_value(4)),
    };
    std::vector<field_ct> second_table_values{
        witness_ct(&builder, duplicate_value),
        witness_ct(&builder, high_entropy_value(5)),
    };
    rom_table_ct first_table(&builder, first_table_values);
    rom_table_ct second_table(&builder, second_table_values);
    field_ct first_index(witness_ct(&builder, uint64_t(0)));
    field_ct second_index(witness_ct(&builder, uint64_t(0)));

    EXPECT_EQ(first_table[first_index].get_value(), duplicate_value);
    EXPECT_EQ(second_table[second_index].get_value(), duplicate_value);

    builder.finalize_circuit();
    StaticAnalyzer analyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(duplicate_value));
}

TEST(boomerang_rom_ram_table, duplicate_filter_suppresses_same_ram_read_chain)
{
    Builder builder;
    const bb::fr duplicate_value = high_entropy_value(6);

    std::vector<field_ct> table_values{
        witness_ct(&builder, duplicate_value),
        witness_ct(&builder, high_entropy_value(7)),
    };
    ram_table_ct table(&builder, table_values);
    field_ct index(witness_ct(&builder, uint64_t(0)));

    const field_ct first_read = table.read(index);
    const field_ct second_read = table.read(index);
    EXPECT_EQ(first_read.get_value(), duplicate_value);
    EXPECT_EQ(second_read.get_value(), duplicate_value);

    builder.finalize_circuit();
    StaticAnalyzer analyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(duplicate_value));
}

TEST(boomerang_rom_ram_table, duplicate_filter_keeps_distinct_ram_tables)
{
    Builder builder;
    const bb::fr duplicate_value = high_entropy_value(8);

    std::vector<field_ct> first_table_values{
        witness_ct(&builder, duplicate_value),
        witness_ct(&builder, high_entropy_value(9)),
    };
    std::vector<field_ct> second_table_values{
        witness_ct(&builder, duplicate_value),
        witness_ct(&builder, high_entropy_value(10)),
    };
    ram_table_ct first_table(&builder, first_table_values);
    ram_table_ct second_table(&builder, second_table_values);
    field_ct first_index(witness_ct(&builder, uint64_t(0)));
    field_ct second_index(witness_ct(&builder, uint64_t(0)));

    EXPECT_EQ(first_table.read(first_index).get_value(), duplicate_value);
    EXPECT_EQ(second_table.read(second_index).get_value(), duplicate_value);

    builder.finalize_circuit();
    StaticAnalyzer analyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(duplicate_value));
}

TEST(boomerang_rom_ram_table, duplicate_filter_keeps_repeated_ram_writes)
{
    Builder builder;
    const bb::fr duplicate_value = high_entropy_value(11);

    std::vector<field_ct> table_values{
        witness_ct(&builder, high_entropy_value(12)),
        witness_ct(&builder, high_entropy_value(13)),
    };
    ram_table_ct table(&builder, table_values);
    field_ct index(witness_ct(&builder, uint64_t(0)));
    field_ct first_write(witness_ct(&builder, duplicate_value));
    field_ct second_write(witness_ct(&builder, duplicate_value));

    table.write(index, first_write);
    table.write(index, second_write);

    builder.finalize_circuit();
    StaticAnalyzer analyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(duplicate_value));
}
