
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "failure_test_utils.hpp"
#include "ultra_honk.test.hpp"

using namespace bb;

#ifdef STARKNET_GARAGA_FLAVORS
using FlavorTypes = testing::Types<UltraFlavor,
                                   UltraZKFlavor,
                                   UltraKeccakFlavor,
                                   UltraKeccakZKFlavor,
                                   UltraStarknetFlavor,
                                   UltraStarknetZKFlavor>;
#else
using FlavorTypes = testing::Types<UltraFlavor, UltraZKFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor>;
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
        BB_ASSERT_GTE(array_length, 1U, "The array length should be at least 1");
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

        // build our "native" ROM table to check our operations
        NativeRomTable native_rom_table(array_length);
        const size_t num_single_elts_in_ROM_table = array_length - num_pair_elts_in_ROM_table;

        // Single-value and pair-value entries live on _separate_ ROM arrays: single uses the LogUp scheme and
        // pair uses the sorted-trace scheme; the two cannot share an array. We still keep a single
        // `native_rom_table` for the test oracle. Convert from logical index to per-array index by subtracting
        // num_single_elts_in_ROM_table for the pair side.
        size_t rom_single_id = circuit_builder.create_ROM_array(num_single_elts_in_ROM_table);
        size_t rom_pair_id = circuit_builder.create_ROM_array(num_pair_elts_in_ROM_table);

        // Per-array index witnesses so reads pass the right witness for each array's local index space.
        std::vector<uint32_t> single_index_witnesses(num_single_elts_in_ROM_table);
        for (size_t i = 0; i < num_single_elts_in_ROM_table; ++i) {
            single_index_witnesses[i] = circuit_builder.put_constant_variable(static_cast<uint64_t>(i));
        }
        std::vector<uint32_t> pair_index_witnesses(num_pair_elts_in_ROM_table);
        for (size_t i = 0; i < num_pair_elts_in_ROM_table; ++i) {
            pair_index_witnesses[i] = circuit_builder.put_constant_variable(static_cast<uint64_t>(i));
        }
        // single ROM elements
        for (size_t i = 0; i < num_single_elts_in_ROM_table; ++i) {
            circuit_builder.set_ROM_element(rom_single_id, i, variable_witnesses[i]);
            native_rom_table[i] = std::array{ variables[i], fr::zero() };
        }
        // pair ROM elements (indexed locally on the pair array)
        for (size_t i = num_single_elts_in_ROM_table; i < array_length; ++i) {
            const size_t pair_local = i - num_single_elts_in_ROM_table;
            circuit_builder.set_ROM_element_pair(
                rom_pair_id, pair_local, std::array{ variable_witnesses[i], variable_witnesses[i + 1] });
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
                    circuit_builder.read_ROM_array(rom_single_id, single_index_witnesses[random_read_index]);
                // check fidelity of the memory read
                auto actually_read_value = circuit_builder.get_variable(read_witness_index);
                auto expected_value = native_rom_table[random_read_index][0];
                BB_ASSERT_EQ(actually_read_value, expected_value);
            } else {
                const size_t pair_local = random_read_index - num_single_elts_in_ROM_table;
                auto [read_witness_index_1, read_witness_index_2] =
                    circuit_builder.read_ROM_array_pair(rom_pair_id, pair_index_witnesses[pair_local]);
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
            std::array<uint32_t, 3> random_indices_to_check_computation;
            std::array<fr, 3> native_fr_elts_to_check_computation;
            for (size_t i = 0; i < 3; i++) {
                uint32_t random_index_to_check_computation =
                    static_cast<uint32_t>(engine.get_random_uint32() % array_length);
                random_indices_to_check_computation[i] = random_index_to_check_computation;
                native_fr_elts_to_check_computation[i] =
                    native_rom_table[random_index_to_check_computation]
                                    [0]; // note that we only use the first entry of
                                         // `native_rom_table[random_index_to_check_computation]`.
            }

            // Perform the reads at the random indices, handling single vs pair reads
            std::array<uint32_t, 3> final_check_read_witnesses;
            for (size_t i = 0; i < 3; i++) {
                const auto random_idx = random_indices_to_check_computation[i];

                if (random_idx < num_single_elts_in_ROM_table) {
                    final_check_read_witnesses[i] =
                        circuit_builder.read_ROM_array(rom_single_id, single_index_witnesses[random_idx]);
                } else {
                    // For pairs, we only use the first element in the final check
                    const size_t pair_local = random_idx - num_single_elts_in_ROM_table;
                    auto [first, _] =
                        circuit_builder.read_ROM_array_pair(rom_pair_id, pair_index_witnesses[pair_local]);
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
            if (num_single_elts_in_ROM_table > 0) {
                uint32_t random_read_index = static_cast<uint32_t>(
                    engine.get_random_uint32() %
                    num_single_elts_in_ROM_table); // a random index to read from in my ROM array. we read from
                                                   // the part of the table that only has _single_ ROM entries.
                circuit_builder.read_ROM_array(rom_single_id, single_index_witnesses[random_read_index]);
            } else {
                uint32_t random_read_index = static_cast<uint32_t>(
                    engine.get_random_uint32() %
                    num_pair_elts_in_ROM_table); // a random index to read from in my ROM array. we read from
                                                 // the part of the table that only has _single_ ROM entries.
                circuit_builder.read_ROM_array_pair(rom_pair_id, pair_index_witnesses[random_read_index]);
            }
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
        // One element is doubly initialized. This uses the pair API because the two schemes reject double-init
        // in different places: the sorted-trace (pair) scheme rejects it in-circuit via its adjacent-row
        // consistency check, yielding an unsatisfiable circuit that prove_and_verify can detect; the
        // single-value LogUp scheme instead rejects it at construction time (set_ROM_element asserts the cell
        // is uninitialized, see rom_ram_logic.cpp), so its rejection cannot be expressed as a failing circuit
        // here, especially with asserts disabled above. Hence the in-circuit failure path is tested via pairs.
        case ROMFailureType::DoubleInit: {
            for (size_t i = 0; i < array_length; ++i) {
                circuit_builder.set_ROM_element_pair(rom_id, i, std::array{ zero_idx, zero_idx });
            }
            circuit_builder.set_ROM_element_pair(rom_id,
                                                 engine.get_random_uint32() % array_length,
                                                 std::array{ random_variable_idx, random_variable_idx });
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
                engine.get_random_uint32() %
                static_cast<uint32_t>(array_length); // a random index to read from in my ROM array.
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

// Field-wrap sorted-chain attack: before the fix, process_ROM/RAM_array used add_variable(FF(0))
// for the first sorted gate's index_witness, which is an unconstrained free witness. The
// index-delta sub-relation (w1 - w1_shift)^2 + (w1 - w1_shift) = 0 has roots {0, -1} over the
// field, so a sorted chain starting at p-1 satisfies the delta check when transitioning to 0, and
// a malicious prover could read/write fake values at index p-1. The fix uses zero_idx(), whose
// fix_witness arithmetic gate (w1 * 1 + 0 = 0) catches any attempted mutation to p-1.

// Test that a malicious prover cannot start the ROM sorted chain at p-1. The defense lives in the
// sorted-trace scheme used by the pair-value ROM API; the single-value LogUp scheme has no sorted chain and
// is not susceptible to this attack vector, so the test exercises the pair API specifically.
TYPED_TEST(UltraHonkTests, RomMaliciousFieldWrap)
{
    using Flavor = TypeParam;
    using Builder = typename Flavor::CircuitBuilder;
    using FF = typename Flavor::FF;

    Builder circuit_builder;

    // Build a small ROM: pairs (1, 0), (2, 0), (3, 0) at indices [0, 1, 2]. Uses the pair API so we go
    // through the sorted-trace scheme; the second pair entry is unused by the test logic below.
    const uint32_t zero_idx = circuit_builder.zero_idx();
    size_t rom_id = circuit_builder.create_ROM_array(3);
    circuit_builder.set_ROM_element_pair(rom_id, 0, std::array{ circuit_builder.add_variable(FF(1)), zero_idx });
    circuit_builder.set_ROM_element_pair(rom_id, 1, std::array{ circuit_builder.add_variable(FF(2)), zero_idx });
    circuit_builder.set_ROM_element_pair(rom_id, 2, std::array{ circuit_builder.add_variable(FF(3)), zero_idx });

    // Read at index 0 via a variable index witness so an attacker can later change it.
    uint32_t idx_witness = circuit_builder.add_variable(FF(0));
    auto [result_witness, _unused] = circuit_builder.read_ROM_array_pair(rom_id, idx_witness);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    // Explicitly finalize so process_ROM_array runs and we can inspect the sorted gates.
    circuit_builder.finalize_circuit();

    // Locate the first sorted ROM consistency check gate (q_memory=1, q_1=1, q_2=1, q_m=0).
    auto& mem = circuit_builder.blocks.memory;
    size_t sorted_0 = std::numeric_limits<size_t>::max();
    for (size_t i = 0; i < mem.size(); ++i) {
        if (mem.gate_selector_for(GateKind::Memory)[i] == 1 && mem.q_1()[i] == 1 && mem.q_2()[i] == 1 &&
            mem.q_m()[i] == 0) {
            sorted_0 = i;
            break;
        }
    }
    ASSERT_NE(sorted_0, std::numeric_limits<size_t>::max()) << "no sorted ROM consistency gate found";

    // After the fix the first sorted gate must use zero_idx() as its index witness.
    uint32_t sorted_0_idx_w = mem.w_l()[sorted_0];
    uint32_t sorted_0_val_w = mem.w_r()[sorted_0];
    EXPECT_EQ(sorted_0_idx_w, circuit_builder.zero_idx());

    // Build the malicious copy: forge a read at index p-1 returning value 999.
    // Sorted chain would become: [(p-1,999), (0,1), (1,2), (2,3), dummy(3)].
    // Mutating sorted_0's index_witness (== zero_idx()) to p-1 violates the fix_witness
    // arithmetic gate and must be rejected.
    Builder bad_builder = circuit_builder;
    auto& vars = const_cast<std::vector<FF>&>(bad_builder.get_variables());
    const FF p_minus_1 = -FF(1);
    vars[bad_builder.real_variable_index[sorted_0_idx_w]] = p_minus_1;
    vars[bad_builder.real_variable_index[sorted_0_val_w]] = FF(999);
    vars[bad_builder.real_variable_index[idx_witness]] = p_minus_1;
    vars[bad_builder.real_variable_index[result_witness]] = FF(999);

    // Run CircuitChecker: expected error in the arithmetic sub-relation from zero_idx's fix_witness.
    EXPECT_TRUE(CircuitChecker::check(circuit_builder));
    EXPECT_FALSE(CircuitChecker::check(bad_builder));

    // Run full protocol.
    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    TestFixture::prove_and_verify(bad_builder, /*expected_result=*/false);
}

// Cross-array read binding: the single-value ROM LogUp sum runs over the whole trace, so the fingerprint
// includes the array id (carried in q_c) to keep each read matched to a table entry of its own array. This
// test exercises that binding by forging a cross-array read: array A holds 100 at index 0, array B holds 200
// at index 0; the malicious witness makes B's read return A's value (100) and rebalances the per-array
// multiplicities (m_A: 1 -> 2, m_B: 1 -> 0) so that an id-blind sum would still vanish. The array id in the
// fingerprint gives A's and B's rows distinct denominators, so the forged witness is rejected.
TYPED_TEST(UltraHonkTests, RomMaliciousCrossArrayRead)
{
    using Flavor = TypeParam;
    using Builder = typename Flavor::CircuitBuilder;
    using FF = typename Flavor::FF;

    Builder circuit_builder;

    // Two single-value ROM arrays, same index, different values.
    size_t rom_a = circuit_builder.create_ROM_array(1);
    size_t rom_b = circuit_builder.create_ROM_array(1);
    circuit_builder.set_ROM_element(rom_a, 0, circuit_builder.add_variable(FF(100)));
    circuit_builder.set_ROM_element(rom_b, 0, circuit_builder.add_variable(FF(200)));

    // Read each array once at index 0.
    circuit_builder.read_ROM_array(rom_a, circuit_builder.add_variable(FF(0)));
    const uint32_t b_read_value_witness = circuit_builder.read_ROM_array(rom_b, circuit_builder.add_variable(FF(0)));

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    circuit_builder.finalize_circuit();

    // Locate, in the memory block, the multiplicity (w_o) witnesses of each array's table row. Table rows
    // carry (q_memory=1, q_2=1, q_1=0); we tell A's row from B's by its stored value.
    auto& mem = circuit_builder.blocks.memory;
    uint32_t m_a_witness = std::numeric_limits<uint32_t>::max();
    uint32_t m_b_witness = std::numeric_limits<uint32_t>::max();
    for (size_t i = 0; i < mem.size(); ++i) {
        const bool is_logup_table =
            mem.gate_selector_for(GateKind::Memory)[i] == 1 && mem.q_1()[i] == 0 && mem.q_2()[i] == 1;
        if (!is_logup_table) {
            continue;
        }
        const FF value = circuit_builder.get_variable(mem.w_r()[i]);
        if (value == FF(100)) {
            m_a_witness = mem.w_o()[i];
        } else if (value == FF(200)) {
            m_b_witness = mem.w_o()[i];
        }
    }
    ASSERT_NE(m_a_witness, std::numeric_limits<uint32_t>::max()) << "array A table row not found";
    ASSERT_NE(m_b_witness, std::numeric_limits<uint32_t>::max()) << "array B table row not found";

    // Forge the witness: B's read returns A's value (200 -> 100), with multiplicities rebalanced so the
    // global LogUp sum is still zero (A now absorbs two reads of value 100, B absorbs none).
    Builder bad_builder = circuit_builder;
    auto& vars = const_cast<std::vector<FF>&>(bad_builder.get_variables());
    vars[bad_builder.real_variable_index[b_read_value_witness]] = FF(100);
    vars[bad_builder.real_variable_index[m_a_witness]] = FF(2);
    vars[bad_builder.real_variable_index[m_b_witness]] = FF(0);

    EXPECT_TRUE(CircuitChecker::check(circuit_builder));
    EXPECT_FALSE(CircuitChecker::check(bad_builder));

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    TestFixture::prove_and_verify(bad_builder, /*expected_result=*/false);
}

// Forged read value: a read must return the value the table holds at its index. Here array A holds 100 at
// index 0 and 200 at index 1; the malicious witness makes the read at index 0 return 200 (a value that is in
// the table, but at a different index). Because the index is part of the fingerprint, (index 0, value 200)
// matches no table entry, so no choice of multiplicities can rebalance the global sum.
TYPED_TEST(UltraHonkTests, RomMaliciousForgedReadValue)
{
    using Flavor = TypeParam;
    using Builder = typename Flavor::CircuitBuilder;
    using FF = typename Flavor::FF;

    Builder circuit_builder;

    size_t rom_id = circuit_builder.create_ROM_array(2);
    circuit_builder.set_ROM_element(rom_id, 0, circuit_builder.add_variable(FF(100)));
    circuit_builder.set_ROM_element(rom_id, 1, circuit_builder.add_variable(FF(200)));
    const uint32_t read_value_witness = circuit_builder.read_ROM_array(rom_id, circuit_builder.add_variable(FF(0)));

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    circuit_builder.finalize_circuit();

    // Forge the index-0 read to return 200 (the value stored at index 1).
    Builder bad_builder = circuit_builder;
    auto& vars = const_cast<std::vector<FF>&>(bad_builder.get_variables());
    vars[bad_builder.real_variable_index[read_value_witness]] = FF(200);

    EXPECT_TRUE(CircuitChecker::check(circuit_builder));
    EXPECT_FALSE(CircuitChecker::check(bad_builder));

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    TestFixture::prove_and_verify(bad_builder, /*expected_result=*/false);
}

// Tampered multiplicity: the per-index read count lives in a single-use w_o witness, pinned only by the
// global LogUp sum. Understating it (here m_0: 1 -> 0, claiming the read never happened) leaves the read's
// term uncancelled, so the sum no longer vanishes.
TYPED_TEST(UltraHonkTests, RomMaliciousMultiplicity)
{
    using Flavor = TypeParam;
    using Builder = typename Flavor::CircuitBuilder;
    using FF = typename Flavor::FF;

    Builder circuit_builder;

    size_t rom_id = circuit_builder.create_ROM_array(1);
    circuit_builder.set_ROM_element(rom_id, 0, circuit_builder.add_variable(FF(100)));
    circuit_builder.read_ROM_array(rom_id, circuit_builder.add_variable(FF(0)));

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    circuit_builder.finalize_circuit();

    // Find the table row's multiplicity (w_o) witness: q_memory=1, q_2=1, q_1=0.
    auto& mem = circuit_builder.blocks.memory;
    uint32_t m_witness = std::numeric_limits<uint32_t>::max();
    for (size_t i = 0; i < mem.size(); ++i) {
        if (mem.gate_selector_for(GateKind::Memory)[i] == 1 && mem.q_1()[i] == 0 && mem.q_2()[i] == 1) {
            m_witness = mem.w_o()[i];
            break;
        }
    }
    ASSERT_NE(m_witness, std::numeric_limits<uint32_t>::max()) << "ROM-LogUp table row not found";

    Builder bad_builder = circuit_builder;
    auto& vars = const_cast<std::vector<FF>&>(bad_builder.get_variables());
    vars[bad_builder.real_variable_index[m_witness]] = FF(0);

    EXPECT_TRUE(CircuitChecker::check(circuit_builder));
    EXPECT_FALSE(CircuitChecker::check(bad_builder));

    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    TestFixture::prove_and_verify(bad_builder, /*expected_result=*/false);
}

// Init-only array (no reads): all multiplicities are zero so the LogUp sum vanishes trivially, but the
// per-row inverse subrelation is still active on every table row. Exercises the empty-read edge case.
TYPED_TEST(UltraHonkTests, RomLogupInitOnly)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;
    auto circuit_builder = UltraCircuitBuilder();

    size_t rom_id = circuit_builder.create_ROM_array(3);
    for (size_t i = 0; i < 3; ++i) {
        circuit_builder.set_ROM_element(rom_id, i, circuit_builder.add_variable(FF(10 + i)));
    }

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}

// Double-init guard: the single-value LogUp scheme requires at most one table row per (array, index) key and
// does not enforce this in-circuit, so set_ROM_element asserts each cell is uninitialized (see
// rom_ram_logic.cpp). Initializing the same index twice must be rejected at construction time.
TYPED_TEST(UltraHonkTests, RomSingleValueDoubleInitThrows)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;
    auto circuit_builder = UltraCircuitBuilder();

    size_t rom_id = circuit_builder.create_ROM_array(1);
    circuit_builder.set_ROM_element(rom_id, 0, circuit_builder.add_variable(FF(100)));

    EXPECT_THROW_WITH_MESSAGE(circuit_builder.set_ROM_element(rom_id, 0, circuit_builder.add_variable(FF(200))),
                              "UNINITIALIZED_MEMORY_RECORD");
}

// Test that a malicious prover cannot start the RAM sorted chain at p-1.
TYPED_TEST(UltraHonkTests, RamMaliciousFieldWrap)
{
    using Flavor = TypeParam;
    using Builder = typename Flavor::CircuitBuilder;
    using FF = typename Flavor::FF;

    Builder circuit_builder;

    // Build a small RAM: initialise [1, 2, 3].
    size_t ram_id = circuit_builder.create_RAM_array(3);
    circuit_builder.init_RAM_element(ram_id, 0, circuit_builder.add_variable(FF(1)));
    circuit_builder.init_RAM_element(ram_id, 1, circuit_builder.add_variable(FF(2)));
    circuit_builder.init_RAM_element(ram_id, 2, circuit_builder.add_variable(FF(3)));

    // Write using a variable index so an attacker can later change it to p-1.
    uint32_t idx_witness = circuit_builder.add_variable(FF(0));
    uint32_t write_val_w = circuit_builder.add_variable(FF(999));
    circuit_builder.write_RAM_array(ram_id, idx_witness, write_val_w);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);

    // Explicitly finalize so process_RAM_array runs and we can inspect the sorted gates.
    circuit_builder.finalize_circuit();

    // Locate the first sorted RAM consistency check gate (q_memory=1, q_3=1, q_1=q_2=q_m=0).
    auto& mem = circuit_builder.blocks.memory;
    size_t sorted_0 = std::numeric_limits<size_t>::max();
    for (size_t i = 0; i < mem.size(); ++i) {
        if (mem.gate_selector_for(GateKind::Memory)[i] == 1 && mem.q_3()[i] == 1 && mem.q_1()[i] == 0 &&
            mem.q_2()[i] == 0 && mem.q_m()[i] == 0) {
            sorted_0 = i;
            break;
        }
    }
    ASSERT_NE(sorted_0, std::numeric_limits<size_t>::max()) << "no sorted RAM consistency gate found";

    // After the fix the first sorted gate must use zero_idx() as its index witness.
    // RAM wire layout: w_l=index, w_r=timestamp, w_o=value, w_4=record.
    uint32_t sorted_0_idx_w = mem.w_l()[sorted_0];
    uint32_t sorted_0_val_w = mem.w_o()[sorted_0];
    EXPECT_EQ(sorted_0_idx_w, circuit_builder.zero_idx());

    // Build the malicious copy: move the write record to index p-1.
    // Sorted chain would become: [(p-1,ts,999), (0,0,1), (1,1,2), final(2,2,3)].
    // Mutating sorted_0's index_witness (== zero_idx()) to p-1 violates the fix_witness
    // arithmetic gate and must be rejected.
    Builder bad_builder = circuit_builder;
    auto& vars = const_cast<std::vector<FF>&>(bad_builder.get_variables());
    const FF p_minus_1 = -FF(1);
    vars[bad_builder.real_variable_index[sorted_0_idx_w]] = p_minus_1;
    vars[bad_builder.real_variable_index[sorted_0_val_w]] = FF(999);
    vars[bad_builder.real_variable_index[idx_witness]] = p_minus_1;
    vars[bad_builder.real_variable_index[write_val_w]] = FF(999);

    // Run CircuitChecker: expected error in the arithmetic sub-relation from zero_idx's fix_witness.
    EXPECT_TRUE(CircuitChecker::check(circuit_builder));
    EXPECT_FALSE(CircuitChecker::check(bad_builder));

    // Run full protocol.
    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
    TestFixture::prove_and_verify(bad_builder, /*expected_result=*/false);
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
        auto init_val = injector.builder.add_variable(FF(100 + i));
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

// Test malicious witness "out-of-bounds" RAM write
TYPED_TEST(UltraHonkTests, RamOutOfBoundsWrite)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;
    MaliciousWitnessInjector<Flavor> injector;

    // Create a RAM array of size 5
    const size_t ram_size = 5;
    size_t ram_id = injector.builder.create_RAM_array(ram_size);

    // Initialize all elements
    for (size_t i = 0; i < ram_size; ++i) {
        auto init_val = injector.builder.add_variable(FF(100 + i));
        injector.builder.init_RAM_element(ram_id, i, init_val);
    }

    // Create a malicious/invalid index witness:
    FF good_index = FF(2);
    FF bad_index = FF(99);
    auto malicious_index = injector.add_malicious_variable(good_index, bad_index);

    // Create a write using the malicious index
    auto write_value = injector.builder.add_variable(FF(42));
    injector.builder.write_RAM_array(ram_id, malicious_index, write_value);

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

// Test malicious witness "out-of-bounds" ROM access
TYPED_TEST(UltraHonkTests, RomOutOfBoundsRead)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;
    MaliciousWitnessInjector<Flavor> injector;

    // Create a ROM array of size 5
    const size_t rom_size = 5;
    size_t rom_id = injector.builder.create_ROM_array(rom_size);

    // Initialize all elements
    for (size_t i = 0; i < rom_size; ++i) {
        auto init_val = injector.builder.add_variable(FF(100 + i));
        injector.builder.set_ROM_element(rom_id, i, init_val);
    }

    // Create a malicious/invalid index witness:
    FF good_index = FF(2);
    FF bad_index = FF(99);
    auto malicious_index = injector.add_malicious_variable(good_index, bad_index);

    // Create a read using the malicious index
    auto read_result = injector.builder.read_ROM_array(rom_id, malicious_index);

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

// Test malicious witness "out-of-bounds" TwinRom access
TYPED_TEST(UltraHonkTests, TwinRomOutOfBoundsRead)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;
    using Builder = UltraCircuitBuilder;
    using field_ct = stdlib::field_t<Builder>;
    using field_pair_ct = std::array<field_ct, 2>;
    using twin_rom_table_ct = stdlib::twin_rom_table<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    MaliciousWitnessInjector<Flavor> injector;

    // Create a TwinROM array of size 5
    std::vector<field_pair_ct> table_values;
    table_values.emplace_back(
        field_pair_ct{ witness_ct(&injector.builder, bb::fr(1)), witness_ct(&injector.builder, bb::fr(2)) });
    table_values.emplace_back(
        field_pair_ct{ witness_ct(&injector.builder, bb::fr(3)), witness_ct(&injector.builder, bb::fr(4)) });
    twin_rom_table_ct table(table_values);

    // Create a malicious/invalid index witness:
    FF good_index = FF(1);
    FF bad_index = FF(99);
    auto malicious_index = injector.add_malicious_variable(good_index, bad_index);

    // Create a read using the malicious index
    auto read_result = table[field_ct::from_witness_index(&injector.builder, malicious_index)];

    // Use the read result in a constraint to ensure it's checked
    auto expected = injector.builder.add_variable(FF(3)); // value at index 1
    injector.builder.assert_equal(read_result[0].get_witness_index(), expected);

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
