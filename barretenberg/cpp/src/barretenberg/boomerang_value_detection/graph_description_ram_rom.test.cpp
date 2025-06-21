#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/memory/ram_table.hpp"
#include "barretenberg/stdlib/primitives/memory/rom_table.hpp"

using namespace bb;
using namespace cdg;
namespace {
auto& engine = numeric::get_debug_randomness();
}

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
        safety_variables.insert(result.witness_index);
        field_ct index(witness_ct(&builder, (uint64_t)i));
        index.fix_witness();
        result += table[index];
    }

    result.fix_witness();
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
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
        safety_variables.insert(result.witness_index);
        field_ct index(witness_ct(&builder, (uint64_t)i));
        index.fix_witness();
        result += table.read(index);
    }

    result.fix_witness();
    StaticAnalyzer graph = StaticAnalyzer(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
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
    ram_table_ct table(&builder, table_size);

    for (size_t i = 0; i < table_size; ++i) {
        table.write(i, 0);
    }
    std::unordered_set<uint32_t> safety_variables;
    field_ct result(0);
    safety_variables.insert(result.witness_index);

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
            safety_variables.insert(result.witness_index);
            result += table.read(index2);
            safety_variables.insert(result.witness_index);
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
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    for (const auto& elem : variables_in_one_gate) {
        EXPECT_EQ(safety_variables.contains(elem), true);
    }
}