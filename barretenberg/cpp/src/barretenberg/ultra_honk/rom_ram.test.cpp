
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
    using NativeRomTable = std::vector<std::array<fr, 2>>;
    using NativeRamTable = std::vector<fr>;

    enum MemType { ROM, RAM };

    /**
     * @brief helper method to construct a memory (ROM or RAM) table with some random operations. contains logic to
     * check that the operations are correct.
     *
     * @param circuit_builder
     * @param mem_type
     * @param array_length
     * @param read_write_operations
     */
    static void build_random_mem_table(auto& circuit_builder,
                                       MemType mem_type,
                                       size_t array_length,
                                       const size_t read_write_operations = 0)
    {

        // create a list of random variables, add them to the circuit, and record their witnesses.
        // these will be the _initial_ elements of the ROM/RAM table. we have one extra to use the set-pair
        // functionality.
        std::vector<fr> variables(array_length + 1);
        std::vector<uint32_t> variable_witnesses(array_length + 1);
        for (auto [variable, witness] : zip_view(variables, variable_witnesses)) {
            variable = fr::random_element();
            witness = circuit_builder.add_variable(variable);
        }

        // create the mem table of specified type
        size_t mem_table_id = (mem_type == MemType::ROM) ? circuit_builder.create_ROM_array(array_length)
                                                         : circuit_builder.create_RAM_array(array_length);

        // array pointing to the witness indicies whose associated real variable is `i`.
        // this is used for testing
        std::vector<uint32_t> index_witness_indices(array_length);
        for (size_t i = 0; i < array_length; ++i) {
            index_witness_indices[i] = circuit_builder.put_constant_variable(static_cast<uint64_t>(i));
        }

        [[maybe_unused]] std::array<uint32_t, 3> final_check_read_witnesses;
        // build three random indices, store their witnesses for later use in the final check; these will be used to set
        // the `a_idx`, `b_idx`, and `c_idx` in each of the memory variants.
        std::array<uint32_t, 3> random_index_witnesses_to_check_computation;
        std::array<uint32_t, 3> random_indices_to_check_computation;
        for (size_t i = 0; i < 3; i++) {
            uint32_t random_index_to_check_computation =
                static_cast<uint32_t>(engine.get_random_uint32() % array_length);
            random_indices_to_check_computation[i] = random_index_to_check_computation;
            random_index_witnesses_to_check_computation[i] =
                circuit_builder.add_variable(random_index_to_check_computation);
        }

        // different behavior depending on ROM or RAM table. both involve some "native" checks.
        switch (mem_type) {

        case MemType::ROM: {
            // build our "native" table to check our operations
            NativeRomTable native_rom_table(array_length);
            // set some single ROM elements for the first half of the ROM array.
            for (size_t i = 0; i < array_length / 2; ++i) {
                circuit_builder.set_ROM_element(mem_table_id, i, variable_witnesses[i]);
                native_rom_table[i] = std::array{ variables[i], fr::zero() };
            }
            // set pairs of ROM values for the second half of the array.
            for (size_t i = array_length / 2; i < array_length; ++i) {
                circuit_builder.set_ROM_element_pair(
                    mem_table_id, i, std::array{ variable_witnesses[i], variable_witnesses[i + 1] });
                native_rom_table[i] = std::array{ variables[i], variables[i + 1] };
            }
            //  perform some random read operations(which add rows to the execution trace)
            for (size_t i = 0; i < read_write_operations; ++i) {
                uint32_t random_read_index = static_cast<uint32_t>(
                    engine.get_random_uint32() % array_length); // a random index to read from in my ROM array.

                if (random_read_index < array_length / 2) {
                    uint32_t read_witness_index =
                        circuit_builder.read_ROM_array(mem_table_id, index_witness_indices[random_read_index]);
                    [[maybe_unused]] auto actually_read_value = circuit_builder.get_variable(read_witness_index);
                    [[maybe_unused]] auto expected_value = native_rom_table[random_read_index][0];
                    BB_ASSERT_EQ(actually_read_value, expected_value);
                } else {
                    auto [read_witness_index_1, read_witness_index_2] =
                        circuit_builder.read_ROM_array_pair(mem_table_id, index_witness_indices[random_read_index]);
                    [[maybe_unused]] std::array<fr, 2> actually_read_values = {
                        circuit_builder.get_variable(read_witness_index_1),
                        circuit_builder.get_variable(read_witness_index_2)
                    };
                    [[maybe_unused]] auto expected_values = native_rom_table[random_read_index];

                    BB_ASSERT_EQ(actually_read_values[0], expected_values[0]);
                    BB_ASSERT_EQ(actually_read_values[1], expected_values[1]);
                }
            }
            // Perform reads at the random indices, handling single vs pair reads
            // these populate the final check read witnesses that we will use for our last check.
            for (size_t i = 0; i < 3; i++) {
                final_check_read_witnesses[i] = [&]() {
                    auto random_idx = random_indices_to_check_computation[i];
                    auto random_idx_witness = random_index_witnesses_to_check_computation[i];
                    if (random_idx < array_length / 2) {
                        return circuit_builder.read_ROM_array(mem_table_id, random_idx_witness);
                    }
                    // else, we read the pair and return the first index.
                    auto [first, second] = circuit_builder.read_ROM_array_pair(mem_table_id, random_idx_witness);
                    return first;
                }();
            }

            break;
        }

        case MemType::RAM:
            // witness indices of the indicies of the array, as we will have to perform "random write operations"
            for (size_t i = 0; i < array_length; ++i) {
                circuit_builder.init_RAM_element(mem_table_id, i, variable_witnesses[i]);
            }

            // perform some random read and write operations, which add rows to the execution trace.
            for (size_t i = 0; i < read_write_operations; ++i) {
                size_t random_write_index = static_cast<size_t>(engine.get_random_uint32() % array_length);
                fr random_element = fr::random_element();
                uint32_t write_variable_witness = circuit_builder.add_variable(random_element);
                circuit_builder.write_RAM_array(
                    mem_table_id, index_witness_indices[random_write_index], write_variable_witness);

                size_t random_read_index = static_cast<size_t>(engine.get_random_uint32() % array_length);
                circuit_builder.read_RAM_array(mem_table_id, index_witness_indices[random_read_index]);
            }
            // for (size_t i = 0; i < 3; ++i) {
            // final_check_read_witnesses[i] =
            // circuit_builder.read_RAM_array(mem_table_id, random_index_witnesses_to_check_computation[i]);
            // }

            break;
        }
        // const fr d_value = circuit_builder.get_variable(a_idx) + circuit_builder.get_variable(b_idx) +
        // circuit_builder.get_variable(c_idx);
        // [[maybe_unused]] uint32_t d_idx = circuit_builder.add_variable(d_value);
        // info("d_value is ", d_value);
        // circuit_builder.create_big_add_gate({
        // a_idx,
        // b_idx,
        // c_idx,
        // d_idx,
        // 1,
        // 1,
        // 1,
        //-1,
        // 0,
        //});
    }
};
TYPED_TEST_SUITE(UltraHonkTests, FlavorTypes);

TYPED_TEST(UltraHonkTests, Rom2)
{
    using Flavor = TypeParam;
    using MemoryTests = MemoryTests_<Flavor>;
    using MemType = MemoryTests::MemType;
    auto circuit_builder = UltraCircuitBuilder();
    MemType mem_type = MemType::ROM;
    size_t array_size_1 = 10;
    size_t num_reads = 50;
    MemoryTests::build_random_mem_table(circuit_builder, mem_type, array_size_1, num_reads);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(circuit_builder);
    TestFixture::prove_and_verify(circuit_builder, /*expected_result=*/true);
}
