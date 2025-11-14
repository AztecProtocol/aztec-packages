#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <array>
#include <gtest/gtest.h>

using namespace bb;

namespace bb {

TEST(UltraCircuitBuilder, Rom)
{
    UltraCircuitBuilder builder;

    std::array<uint32_t, 8> rom_values{
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
    };

    size_t rom_id = builder.create_ROM_array(8);

    for (size_t i = 0; i < 8; ++i) {
        builder.set_ROM_element(rom_id, i, rom_values[i]);
    }

    uint32_t a_idx = builder.read_ROM_array(rom_id, builder.add_variable(fr(5)));
    EXPECT_NE(a_idx, rom_values[5]);
    uint32_t b_idx = builder.read_ROM_array(rom_id, builder.add_variable(fr(4)));
    uint32_t c_idx = builder.read_ROM_array(rom_id, builder.add_variable(fr(1)));

    const auto d_value = builder.get_variable(a_idx) + builder.get_variable(b_idx) + builder.get_variable(c_idx);
    uint32_t d_idx = builder.add_variable(d_value);

    builder.create_big_add_gate({
        a_idx,
        b_idx,
        c_idx,
        d_idx,
        1,
        1,
        1,
        -1,
        0,
    });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief A simple-as-possible RAM read test, for easier debugging
 *
 */
TEST(UltraCircuitBuilder, RamSimple)
{
    UltraCircuitBuilder builder;

    // Initialize a length 1 RAM array with a single value
    fr ram_value = 5;
    uint32_t ram_value_idx = builder.add_variable(ram_value);
    size_t ram_id = builder.create_RAM_array(/*array_size=*/1);
    builder.init_RAM_element(ram_id, /*index_value=*/0, ram_value_idx);

    // Read from the RAM array we just created (at the 0th index)
    uint32_t read_idx = builder.add_variable(fr(0));
    uint32_t a_idx = builder.read_RAM_array(ram_id, read_idx);

    // Use the result in a simple arithmetic gate
    builder.create_big_add_gate({
        a_idx,
        builder.zero_idx(),
        builder.zero_idx(),
        builder.zero_idx(),
        -1,
        0,
        0,
        0,
        builder.get_variable(ram_value_idx),
    });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, Ram)
{
    UltraCircuitBuilder builder;

    std::array<uint32_t, 8> ram_values{
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
        builder.add_variable(fr::random_element()), builder.add_variable(fr::random_element()),
    };

    size_t ram_id = builder.create_RAM_array(8);

    for (size_t i = 0; i < 8; ++i) {
        builder.init_RAM_element(ram_id, i, ram_values[i]);
    }

    uint32_t a_idx = builder.read_RAM_array(ram_id, builder.add_variable(fr(5)));
    EXPECT_NE(a_idx, ram_values[5]);

    uint32_t b_idx = builder.read_RAM_array(ram_id, builder.add_variable(fr(4)));
    uint32_t c_idx = builder.read_RAM_array(ram_id, builder.add_variable(fr(1)));

    builder.write_RAM_array(ram_id, builder.add_variable(fr(4)), builder.add_variable(fr(500)));
    uint32_t d_idx = builder.read_RAM_array(ram_id, builder.add_variable(fr(4)));

    EXPECT_EQ(builder.get_variable(d_idx), 500);

    // ensure these vars get used in another arithmetic gate
    const auto e_value = builder.get_variable(a_idx) + builder.get_variable(b_idx) + builder.get_variable(c_idx) +
                         builder.get_variable(d_idx);
    uint32_t e_idx = builder.add_variable(e_value);

    builder.create_big_add_gate(
        {
            a_idx,
            b_idx,
            c_idx,
            d_idx,
            -1,
            -1,
            -1,
            -1,
            0,
        },
        true);
    builder.create_big_add_gate(
        {
            builder.zero_idx(),
            builder.zero_idx(),
            builder.zero_idx(),
            e_idx,
            0,
            0,
            0,
            0,
            0,
        },
        false);

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Test the builder copy constructor for a circuit with RAM gates
    UltraCircuitBuilder duplicate_builder{ builder };

    EXPECT_EQ(duplicate_builder.get_num_finalized_gates_inefficient(), builder.get_num_finalized_gates_inefficient());
    EXPECT_TRUE(CircuitChecker::check(duplicate_builder));
}

} // namespace bb
