#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/memory/ram_table.hpp"
#include "barretenberg/stdlib/primitives/memory/rom_table.hpp"

using namespace bb;
namespace {
auto& engine = numeric::get_debug_randomness();
}

using Builder = UltraCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using rom_table_ct = stdlib::rom_table<Builder>;
using ram_table_ct = stdlib::ram_table<Builder>;

TEST(boomerang_rom_table, graph_description_rom_table)
{
    Builder builder;

    std::vector<field_ct> table_values;
    const size_t table_size = 10;
    for (size_t i = 0; i < table_size; ++i) {
        table_values.emplace_back(witness_ct(&builder, bb::fr::random_element()));
    }

    rom_table_ct table(table_values);

    field_ct result = field_ct(witness_ct(&builder, (uint64_t)0));
    info("result witness index == ", result.witness_index);

    for (size_t i = 0; i < 10; ++i) {
        field_ct index(witness_ct(&builder, (uint64_t)i));
        result += table[index];
    }

    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    graph.print_variables_in_one_gate();
}

TEST(boomerang_ram_table, graph_description_ram_table_read)
{
    Builder builder;

    std::vector<field_ct> table_values;
    const size_t table_size = 10;
    for (size_t i = 0; i < table_size; ++i) {
        table_values.emplace_back(witness_ct(&builder, bb::fr::random_element()));
    }

    ram_table_ct table(table_values);
    field_ct result = field_ct(witness_ct(&builder, (uint64_t)0));

    for (size_t i = 0; i < 10; ++i) {
        field_ct index(witness_ct(&builder, (uint64_t)i));
        result += table.read(index);
    }
    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    graph.print_variables_in_one_gate();
}

TEST(boomerang_ram_table, graph_description_ram_table_write)
{
    Builder builder;
    const size_t table_size = 10;

    std::vector<fr> table_values(table_size);

    ram_table_ct table(&builder, table_size);

    for (size_t i = 0; i < table_size; ++i) {
        table.write(i, 0);
    }
    field_ct result(0);

    const auto update = [&]() {
        for (size_t i = 0; i < table_size / 2; ++i) {
            table_values[2 * i] = fr::random_element();
            table_values[2 * i + 1] = fr::random_element();

            // init with both constant and variable values
            table.write(2 * i, witness_ct(&builder, table_values[2 * i]));
            table.write(2 * i + 1, witness_ct(&builder, table_values[2 * i + 1]));
        }
    };

    const auto read = [&]() {
        for (size_t i = 0; i < table_size / 2; ++i) {
            const size_t index = table_size - 2 - (i * 2); // access in something other than basic incremental order
            result += table.read(witness_ct(&builder, index));
            result += table.read(index + 1);
        }
    };

    update();
    read();
    //    update();
    //    read();
    //    update();

    Graph graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    graph.print_variables_in_one_gate();
}