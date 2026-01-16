
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "failure_test_utils.hpp"
#include "ultra_honk.test.hpp"

using namespace bb;

#ifdef STARKNET_GARAGA_FLAVORS
using FlavorTypes = testing::Types<UltraFlavor,
                                   UltraZKFlavor,
                                   UltraKeccakFlavor,
                                   UltraKeccakZKFlavor,
                                   UltraRollupFlavor,
                                   UltraStarknetFlavor,
                                   UltraStarknetZKFlavor>;
#else
using FlavorTypes =
    testing::Types<UltraFlavor, UltraZKFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor, UltraRollupFlavor>;
#endif

template <typename Flavor> class MemoryTests_ : public UltraHonkTests<Flavor> {
  public:
    // helper types to check correctness of memory operations
    // every time we do a read, we confirm the value is correct by using the corresponding "native" type below.
    using NativeRomTable = std::vector<std::array<fr, 2>>;
    using NativeRamTable = std::vector<fr>;
    enum class ROMFailureType { DoubleInit, SingleReadAtPair };
    /**
     * @brief build a random ROM table, together with some read ops and an arithmetic gate. includes several
     * compatibility checks, both "native" and on the level of the circuit.
     *
     * @param circuit_builder
     * @param array_length
     * @param num_pair_elts_in_ROM_table // ROM tables allow for entering in single elements or pairs of elements; this
     * is the number of _pairs_ of elements in our table.
     * @param read_operations
     * @param final_arithmetic_gate_and_read // if true, then we add an arithmetic gate (using reads and our native
     * memory table), then a final read operation.
     */
    static void build_random_ROM_table(
        auto& circuit_builder,
        size_t array_length,
        size_t num_pair_elts_in_ROM_table = 0, // the number of elements of our ROM table
                                               // that will involve _pairs_ of numbers.
        const size_t read_operations = 0,
        bool final_arithmetic_gate_and_read = true) // toggles whether we apply a final arithmetic gate and read gate
    {
        BB_ASSERT_LTE(num_pair_elts_in_ROM_table,
                      array_length,
                      "cannot set the number of 'pairs of elements to add to the ROM table' to be greater than the "
                      "length of the table");
        // create a list of random variables, add them to the circuit, and record their witnesses.
        // these will be the _initial_ elements of the ROM/RAM table. we have one extra to use the set-pair
        // functionality.
        std::vector<fr> variables(array_length + 1);
        std::vector<uint32_t> variable_witnesses(array_length + 1);
        for (auto [variable, witness] : zip_view(variables, variable_witnesses)) {
            variable = fr::random_element();
            witness = circuit_builder.add_variable(variable);
        }

        // array pointing to the witness indicies whose associated real variable is `i`. this makes testing a bit more
        // ergonomic.
        std::vector<uint32_t> index_witness_indices(array_length);
        for (size_t i = 0; i < array_length; ++i) {
            index_witness_indices[i] = circuit_builder.put_constant_variable(static_cast<uint64_t>(i));
        }

        // build our "native" ROM table to check our operations
        NativeRomTable native_rom_table(array_length);
        // build out in-circuit ROM table
        size_t rom_table_id = circuit_builder.create_ROM_array(array_length);

        const size_t num_single_elts_in_ROM_table = array_length - num_pair_elts_in_ROM_table;
        // set some single ROM elements for the chunk
        for (size_t i = 0; i < num_single_elts_in_ROM_table; ++i) {
            circuit_builder.set_ROM_element(rom_table_id, i, variable_witnesses[i]);
            native_rom_table[i] = std::array{ variables[i], fr::zero() };
        }
        // set pairs of ROM values for the second chunk
        for (size_t i = num_single_elts_in_ROM_table; i < array_length; ++i) {
            circuit_builder.set_ROM_element_pair(
                rom_table_id, i, std::array{ variable_witnesses[i], variable_witnesses[i + 1] });
            native_rom_table[i] = std::array{ variables[i], variables[i + 1] };
        }
        //  perform some random read operations (which add rows to the execution trace) and check "natively" that the
        //  reads are correct. note that if we are reading a row of the ROM table that had a _pair_ being entered in,
        //  then we _must_ call `read_ROM_array_pair`.
        for (size_t i = 0; i < read_operations; ++i) {
            uint32_t random_read_index = static_cast<uint32_t>(
                engine.get_random_uint32() % array_length); // a random index to read from in my ROM array.

            if (random_read_index < num_single_elts_in_ROM_table) {
                uint32_t read_witness_index =
                    circuit_builder.read_ROM_array(rom_table_id, index_witness_indices[random_read_index]);
                // check fidelity of the memory read
                auto actually_read_value = circuit_builder.get_variable(read_witness_index);
                auto expected_value = native_rom_table[random_read_index][0];
                BB_ASSERT_EQ(actually_read_value, expected_value);
            } else {
                auto [read_witness_index_1, read_witness_index_2] =
                    circuit_builder.read_ROM_array_pair(rom_table_id, index_witness_indices[random_read_index]);
                // check fidelity of the pair memory read
                std::array<fr, 2> actually_read_values = { circuit_builder.get_variable(read_witness_index_1),
                                                           circuit_builder.get_variable(read_witness_index_2) };
                auto expected_values = native_rom_table[random_read_index];
                BB_ASSERT_EQ(actually_read_values[0], expected_values[0]);
                BB_ASSERT_EQ(actually_read_values[1], expected_values[1]);
            }
        }
        if (final_arithmetic_gate_and_read) {
            // Final gate checks: construct a `big_add_gate` with random values from the ROM table, then perform another
            // read (which adds rows to our execution trace). This checks that nothing unexpected happens when we
            // include basic arithmetic gates.

            // build three random indices, store their witnesses for the final check.
            // in the case when there are _pairs_ of element in the ROM table row, we only use the _first_ entry for our
            // gate check.
            std::array<uint32_t, 3> random_index_witnesses_to_check_computation;
            std::array<uint32_t, 3> random_indices_to_check_computation;
            std::array<fr, 3> native_fr_elts_to_check_computation;
            for (size_t i = 0; i < 3; i++) {
                uint32_t random_index_to_check_computation =
                    static_cast<uint32_t>(engine.get_random_uint32() % array_length);
                random_indices_to_check_computation[i] = random_index_to_check_computation;
                random_index_witnesses_to_check_computation[i] =
                    index_witness_indices[random_index_to_check_computation];
                native_fr_elts_to_check_computation[i] =
                    native_rom_table[random_index_to_check_computation]
                                    [0]; // note that we only use the first entry of
                                         // `native_rom_table[random_index_to_check_computation]`.
            }

            // Perform the reads at the random indices, handling single vs pair reads
            std::array<uint32_t, 3> final_check_read_witnesses;
            for (size_t i = 0; i < 3; i++) {
                const auto random_idx = random_indices_to_check_computation[i];
                const auto random_idx_witness = random_index_witnesses_to_check_computation[i];

                if (random_idx < num_single_elts_in_ROM_table) {
                    final_check_read_witnesses[i] = circuit_builder.read_ROM_array(rom_table_id, random_idx_witness);
                } else {
                    // For pairs, we only use the first element in the final check
                    auto [first, _] = circuit_builder.read_ROM_array_pair(rom_table_id, random_idx_witness);
                    final_check_read_witnesses[i] = first;
                }
            }

            // add the `big_add_gate`
            const fr d_value = std::accumulate(
                native_fr_elts_to_check_computation.begin(), native_fr_elts_to_check_computation.end(), fr::zero());
            uint32_t d_idx = circuit_builder.add_variable(d_value);
            circuit_builder.create_big_add_gate({
                final_check_read_witnesses[0],
                final_check_read_witnesses[1],
                final_check_read_witnesses[2],
                d_idx,
                1,
                1,
                1,
                -1,
                0,
            });
            // add a read row, to make sure we can intersperse the operations, as expected.
            uint32_t random_read_index = static_cast<uint32_t>(
                engine.get_random_uint32() %
                num_single_elts_in_ROM_table); // a random index to read from in my ROM array. we read from
                                               // the part of the table that only has _single_ ROM entries.
            circuit_builder.read_ROM_array(rom_table_id, index_witness_indices[random_read_index]);
        }
    }

    static void build_ROM_table_length_zero(auto& circuit_builder) { circuit_builder.create_ROM_array(0); }
    static void build_ROM_table_with_uninitialized_values(auto& circuit_builder, size_t array_length)
    {
        circuit_builder.create_ROM_array(array_length);
    }
    static void build_failing_ROM_table(auto& circuit_builder, size_t array_length, ROMFailureType rom_failure_type)
    {
        BB_DISABLE_ASSERTS();
        auto rom_id = circuit_builder.create_ROM_array(array_length);
        auto zero_idx = circuit_builder.zero_idx();
        auto random_num = fr::random_element();
        auto random_variable_idx = circuit_builder.add_variable(random_num);
        switch (rom_failure_type) {
        // one element is doubly initialized
        case ROMFailureType::DoubleInit: {
            for (size_t i = 0; i < array_length; ++i) {
                circuit_builder.set_ROM_element(rom_id, i, zero_idx);
            }
            circuit_builder.set_ROM_element(rom_id, engine.get_random_uint32() % array_length, random_variable_idx);
            break;
        }
        // we try to read a single element at a ROM entry that contains a _pair_ of values.
        case ROMFailureType::SingleReadAtPair: {
            for (size_t i = 0; i < array_length; ++i) {
                circuit_builder.set_ROM_element_pair(rom_id, i, std::array{ random_variable_idx, random_variable_idx });
            }
            // read the first element
            circuit_builder.read_ROM_array(rom_id, zero_idx);
            break;
        }
        };
    }
    static void build_random_RAM_table(auto& circuit_builder,
                                       size_t array_length,
                                       const size_t read_write_operations = 0,
                                       bool final_arithmetic_gate_and_read = true)
    {

        // create a list of random variables, add them to the circuit, and record their witnesses.
        // these will be the _initial_ elements of the RAM table.
        std::vector<fr> variables(array_length);
        std::vector<uint32_t> variable_witnesses(array_length);
        for (auto [variable, witness] : zip_view(variables, variable_witnesses)) {
            variable = fr::random_element();
            witness = circuit_builder.add_variable(variable);
        }

        // array pointing to the witness indicies whose associated real variable is `i`.
        // this is used for testing
        std::vector<uint32_t> index_witness_indices(array_length);
        for (size_t i = 0; i < array_length; ++i) {
            index_witness_indices[i] = circuit_builder.put_constant_variable(static_cast<uint64_t>(i));
        }
        NativeRamTable native_ram_table(array_length);
        size_t ram_table_id = circuit_builder.create_RAM_array(array_length);
        // witness indices of the indicies of the array, as we will have to perform "random write operations"
        for (size_t i = 0; i < array_length; ++i) {
            circuit_builder.init_RAM_element(ram_table_id, i, variable_witnesses[i]);
            native_ram_table[i] = variables[i];
        }

        // perform some random read and write operations, which add rows to the execution trace.
        for (size_t i = 0; i < read_write_operations; ++i) {
            // write ops
            size_t random_write_index = static_cast<size_t>(engine.get_random_uint32() % array_length);
            fr random_element = fr::random_element();
            uint32_t write_variable_witness = circuit_builder.add_variable(random_element);
            native_ram_table[random_write_index] = random_element;
            circuit_builder.write_RAM_array(
                ram_table_id, index_witness_indices[random_write_index], write_variable_witness);
            // read ops, with a "native" check that the values are correct.
            size_t random_read_index = static_cast<size_t>(engine.get_random_uint32() % array_length);
            uint32_t read_witness =
                circuit_builder.read_RAM_array(ram_table_id, index_witness_indices[random_read_index]);
            auto read_value = circuit_builder.get_variable(read_witness);
            auto expected_value = native_ram_table[random_read_index];
            BB_ASSERT_EQ(read_value, expected_value, "the value the RAM table read was not the expected value");
        }
        if (final_arithmetic_gate_and_read) {
            // Final gate checks: construct a `big_add_gate` with values from the RAM table, then perform another
            // read (which adds rows to our execution trace). This checks that nothing unexpected happens when we
            // include basic arithmetic gates.

            // build three random indices, store their witnesses for the final check.
            std::array<uint32_t, 3> random_index_witnesses_to_check_computation;
            std::array<fr, 3> native_fr_elts_to_check_computation;
            for (size_t i = 0; i < 3; i++) {
                uint32_t random_index_to_check_computation =
                    static_cast<uint32_t>(engine.get_random_uint32() % array_length);
                random_index_witnesses_to_check_computation[i] =
                    index_witness_indices[random_index_to_check_computation];
                native_fr_elts_to_check_computation[i] = native_ram_table[random_index_to_check_computation];
            }
            // Perform the ops at the random indices, handling single vs pair reads
            std::array<uint32_t, 3> final_check_read_witnesses;
            for (size_t i = 0; i < 3; i++) {
                const auto random_idx_witness = random_index_witnesses_to_check_computation[i];
                final_check_read_witnesses[i] = circuit_builder.read_RAM_array(ram_table_id, random_idx_witness);
            }

            // add the `big_add_gate`
            const fr d_value = std::accumulate(
                native_fr_elts_to_check_computation.begin(), native_fr_elts_to_check_computation.end(), fr::zero());
            uint32_t d_idx = circuit_builder.add_variable(d_value);
            circuit_builder.create_big_add_gate({
                final_check_read_witnesses[0],
                final_check_read_witnesses[1],
                final_check_read_witnesses[2],
                d_idx,
                1,
                1,
                1,
                -1,
                0,
            });
            // add a read row, to make sure we can intersperse the operations, as expected.
            uint32_t random_read_index =
                engine.get_random_uint32() % array_length; // a random index to read from in my ROM array.
            circuit_builder.read_RAM_array(ram_table_id, index_witness_indices[random_read_index]);
        }
    }

    static void build_RAM_table_length_zero(auto& circuit_builder) { circuit_builder.create_RAM_array(0); }
};
TYPED_TEST_SUITE(UltraHonkTests, FlavorTypes);

TYPED_TEST(UltraHonkTests, RomLengthZero)
{
    using Flavor = TypeParam;
    using MemoryTests = MemoryTests_<Flavor>;
    auto circuit_builder = UltraCircuitBuilder();
    MemoryTests::build_ROM_table_length_zero(circuit_builder);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}
TYPED_TEST(UltraHonkTests, RomTinyNoReads)
{
    using Flavor = TypeParam;
    using MemoryTests = MemoryTests_<Flavor>;
    auto circuit_builder = UltraCircuitBuilder();
    size_t array_size = 1;
    size_t num_pair_elts = 0;
    size_t num_reads = 0;
    bool final_arithmetic_gate_and_read = false;
    MemoryTests::build_random_ROM_table(
        circuit_builder, array_size, num_pair_elts, num_reads, final_arithmetic_gate_and_read);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}
TYPED_TEST(UltraHonkTests, RomTinyRepeated)
{
    using Flavor = TypeParam;
    using MemoryTests = MemoryTests_<Flavor>;
    auto circuit_builder = UltraCircuitBuilder();
    size_t array_size = 2;
    size_t num_pair_elts = 1;
    size_t num_reads = 5;
    // Build multiple ROM tables to test repeated table creation
    constexpr size_t num_tables = 5;
    for (size_t i = 0; i < num_tables; ++i) {
        MemoryTests::build_random_ROM_table(circuit_builder, array_size, num_pair_elts, num_reads);
    }

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, RamLengthZero)
{
    using Flavor = TypeParam;
    using MemoryTests = MemoryTests_<Flavor>;
    auto circuit_builder = UltraCircuitBuilder();
    MemoryTests::build_RAM_table_length_zero(circuit_builder);
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}
TYPED_TEST(UltraHonkTests, RamTiny)
{
    using Flavor = TypeParam;
    using MemoryTests = MemoryTests_<Flavor>;
    auto circuit_builder = UltraCircuitBuilder();
    MemoryTests::build_RAM_table_length_zero(circuit_builder);
    size_t array_size = 1;
    size_t read_write_ops = 5;
    bool final_arithmetic_gate_and_read = false;
    MemoryTests::build_random_RAM_table(circuit_builder, array_size, read_write_ops, final_arithmetic_gate_and_read);
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, RomRamMixed)
{
    using Flavor = TypeParam;
    using MemoryTests = MemoryTests_<Flavor>;
    auto circuit_builder = UltraCircuitBuilder();
    size_t array_size = 15;
    size_t num_pair_elts = 5;
    size_t num_reads = 5;
    size_t read_write_ops = 5;
    constexpr size_t num_tables = 5;
    for (size_t i = 0; i < num_tables; ++i) {
        MemoryTests::build_random_RAM_table(circuit_builder, array_size, read_write_ops);
        MemoryTests::build_random_ROM_table(circuit_builder, array_size, num_pair_elts, num_reads);
    }
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

TYPED_TEST(UltraHonkTests, RomFailureDoubleInit)
{
    using Flavor = TypeParam;
    using MemoryTests = MemoryTests_<Flavor>;
    auto circuit_builder = UltraCircuitBuilder();
    size_t array_length = 5;
    auto rom_failure_type = MemoryTests::ROMFailureType::DoubleInit;
    MemoryTests::build_failing_ROM_table(circuit_builder, array_length, rom_failure_type);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
}

TYPED_TEST(UltraHonkTests, RomFailureSingleReadAtPair)
{
    using Flavor = TypeParam;
    using MemoryTests = MemoryTests_<Flavor>;
    auto circuit_builder = UltraCircuitBuilder();
    size_t array_length = 5;
    auto rom_failure_type = MemoryTests::ROMFailureType::SingleReadAtPair;
    MemoryTests::build_failing_ROM_table(circuit_builder, array_length, rom_failure_type);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/false);
}

// Test malicious initialization value in ROM
TYPED_TEST(UltraHonkTests, RomMaliciousInitValue)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;
    MaliciousWitnessInjector<Flavor> injector;

    // Create a simple ROM with one malicious initialization value
    size_t rom_id = injector.builder.create_ROM_array(5);

    // This witness has value 42 in good proof, 666 in bad proof
    auto malicious_witness = injector.add_malicious_variable(FF(42), FF(666));

    // Initialize ROM with the malicious witness
    injector.builder.set_ROM_element(rom_id, 0, malicious_witness);

    // Initialize remaining elements with arbitrary values
    for (size_t i = 1; i < 5; ++i) {
        auto good_witness = injector.builder.add_variable(FF::random_element());
        injector.builder.set_ROM_element(rom_id, i, good_witness);
    }

    // Read the malicious element to create constraints
    auto index = injector.builder.put_constant_variable(0);
    injector.builder.read_ROM_array(rom_id, index);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(injector.builder);

    // Run CircuitChecker; expect failure in Memory relation for malicious witness
    EXPECT_TRUE(CircuitChecker::check(injector.builder)); // good builder passes
    auto bad_builder = injector.create_builder_with_malicious_witnesses();
    EXPECT_FALSE(CircuitChecker::check(bad_builder)); // bad builder fails (will print "Failed Memory relation")

    // Run full protocol
    auto [good_instance, bad_instance] = injector.create_instances();
    TestFixture::prove_and_verify(good_instance, /*expected_result=*/true);
    TestFixture::prove_and_verify(bad_instance, /*expected_result=*/false);
}

// Test malicious witness "out-of-bounds" RAM access
TYPED_TEST(UltraHonkTests, RamOutOfBoundsRead)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;
    MaliciousWitnessInjector<Flavor> injector;

    // Create a RAM array of size 5
    const size_t ram_size = 5;
    size_t ram_id = injector.builder.create_RAM_array(ram_size);

    // Initialize all elements
    for (size_t i = 0; i < ram_size; ++i) {
        auto init_val = injector.builder.add_variable(FF::random_element());
        injector.builder.init_RAM_element(ram_id, i, init_val);
    }

    // Create a malicious/invalid index witness:
    FF good_index = FF(2);
    FF bad_index = FF(99);
    auto malicious_index = injector.add_malicious_variable(good_index, bad_index);

    // Create a read using the malicious index
    auto read_result = injector.builder.read_RAM_array(ram_id, malicious_index);

    // Use the read result in a constraint to ensure it's checked
    auto expected = injector.builder.add_variable(FF(102)); // value at index 2
    injector.builder.assert_equal(read_result, expected);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(injector.builder);

    // Run CircuitChecker
    // Expected error: "Failed tag check."
    EXPECT_TRUE(CircuitChecker::check(injector.builder));
    auto bad_builder = injector.create_builder_with_malicious_witnesses();
    EXPECT_FALSE(CircuitChecker::check(bad_builder));

    // Run full protocol
    auto [good_instance, bad_instance] = injector.create_instances();
    TestFixture::prove_and_verify(good_instance, /*expected_result=*/true);
    TestFixture::prove_and_verify(bad_instance, /*expected_result=*/false);
}
