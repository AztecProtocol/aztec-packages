#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/honk/proving_key_inspector.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace bb;
namespace {
auto& engine = numeric::get_debug_randomness();

using FlavorTypes = ::testing::Types<MegaFlavor, MegaZKFlavor>;

template <typename Flavor> class DataBusTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Builder = typename Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;

    // Construct and verify a MegaHonk proof for a given circuit
    static bool construct_and_verify_proof(MegaCircuitBuilder& builder)
    {
        auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder);
        auto verification_key = std::make_shared<typename Flavor::VerificationKey>(proving_key->proving_key);

        Prover prover{ proving_key, verification_key };
        auto proof = prover.construct_proof();
        Verifier verifier{ verification_key };
        return verifier.verify_proof(proof);
    }

    // Construct a Mega circuit with some arbitrary sample gates
    static Builder construct_test_builder()
    {
        auto op_queue = std::make_shared<bb::ECCOpQueue>();
        auto builder = MegaCircuitBuilder{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(builder);
        return builder;
    }

    /**
     * @brief Test method for constructing a databus column and performing reads on it
     * @details All individual bus columns (calldata, returndata etc.) behave the same way. This method facilitates
     * testing each of them individually by allowing specification of the add and read methods for a given bus column
     * type.
     *
     * @param add_bus_data Method for adding data to the given bus column
     * @param read_bus_data Method for reading from a given bus column
     * @return Builder
     */
    static Builder construct_circuit_with_databus_reads(
        Builder& builder,
        const std::function<void(Builder&, uint32_t)>& add_bus_data,
        const std::function<uint32_t(Builder&, uint32_t)>& read_bus_data)
    {

        const uint32_t NUM_BUS_ENTRIES = 5; // number of entries in the bus column
        const uint32_t NUM_READS = 7;       // greater than size of bus to ensure duplicates

        // Add some arbitrary values to the bus column
        for (size_t i = 0; i < NUM_BUS_ENTRIES; ++i) {
            FF val = FF::random_element();
            uint32_t val_witness_idx = builder.add_variable(val);
            add_bus_data(builder, val_witness_idx);
        }

        // Read from the bus at some random indices
        for (size_t i = 0; i < NUM_READS; ++i) {
            uint32_t read_idx = engine.get_random_uint32() % NUM_BUS_ENTRIES;
            uint32_t read_idx_witness_idx = builder.add_variable(read_idx);
            read_bus_data(builder, read_idx_witness_idx);
        }

        return builder;
    }

    static Builder construct_circuit_with_calldata_reads(Builder& builder)
    {
        // Define interfaces for the add and read methods for databus calldata
        auto add_method = [](Builder& builder, uint32_t witness_idx) { builder.add_public_calldata(witness_idx); };
        auto read_method = [](Builder& builder, uint32_t witness_idx) { return builder.read_calldata(witness_idx); };

        return construct_circuit_with_databus_reads(builder, add_method, read_method);
    }

    static Builder construct_circuit_with_secondary_calldata_reads(Builder& builder)
    {
        // Define interfaces for the add and read methods for databus secondary_calldata
        auto add_method = [](Builder& builder, uint32_t witness_idx) {
            builder.add_public_secondary_calldata(witness_idx);
        };
        auto read_method = [](Builder& builder, uint32_t witness_idx) {
            return builder.read_secondary_calldata(witness_idx);
        };

        return construct_circuit_with_databus_reads(builder, add_method, read_method);
    }

    static Builder construct_circuit_with_return_data_reads(Builder& builder)
    {
        // Define interfaces for the add and read methods for databus return data
        auto add_method = [](Builder& builder, uint32_t witness_idx) { builder.add_public_return_data(witness_idx); };
        auto read_method = [](Builder& builder, uint32_t witness_idx) { return builder.read_return_data(witness_idx); };

        return construct_circuit_with_databus_reads(builder, add_method, read_method);
    }
};

TYPED_TEST_SUITE(DataBusTests, FlavorTypes);

/**
 * @brief Test proof construction/verification for a circuit with calldata lookup gates
 *
 */
TYPED_TEST(DataBusTests, CallDataRead)
{
    typename TypeParam::CircuitBuilder builder = this->construct_test_builder();
    this->construct_circuit_with_calldata_reads(builder);

    EXPECT_TRUE(this->construct_and_verify_proof(builder));
}

/**
 * @brief Test proof construction/verification for a circuit with secondary_calldata lookup gates
 *
 */
TYPED_TEST(DataBusTests, CallData2Read)
{
    typename TypeParam::CircuitBuilder builder = this->construct_test_builder();
    this->construct_circuit_with_secondary_calldata_reads(builder);

    EXPECT_TRUE(this->construct_and_verify_proof(builder));
}

/**
 * @brief Test proof construction/verification for a circuit with return data lookup gates
 *
 */
TYPED_TEST(DataBusTests, ReturnDataRead)
{
    typename TypeParam::CircuitBuilder builder = this->construct_test_builder();
    this->construct_circuit_with_return_data_reads(builder);

    EXPECT_TRUE(this->construct_and_verify_proof(builder));
}

/**
 * @brief Test proof construction/verification for a circuit with reads from all bus columns
 *
 */
TYPED_TEST(DataBusTests, ReadAll)
{
    typename TypeParam::CircuitBuilder builder = this->construct_test_builder();
    this->construct_circuit_with_calldata_reads(builder);
    this->construct_circuit_with_secondary_calldata_reads(builder);
    this->construct_circuit_with_return_data_reads(builder);

    EXPECT_TRUE(this->construct_and_verify_proof(builder));
}

/**
 * @brief Test proof construction/verification for a circuit with duplicate calldata reads and some explicit checks that
 * the read results are correct
 *
 */
TYPED_TEST(DataBusTests, CallDataDuplicateRead)
{
    // Construct a circuit and add some ecc op gates and arithmetic gates
    typename TypeParam::CircuitBuilder builder = this->construct_test_builder();
    using FF = TypeParam::FF;

    // Add some values to calldata

    std::vector<FF> calldata_values = { 7, 10, 3, 12, 1 };
    for (auto& val : calldata_values) {
        builder.add_public_calldata(builder.add_variable(val));
    }

    // Define some read indices with a duplicate
    std::vector<uint32_t> read_indices = { 1, 4, 1 };

    // Create some calldata read gates and store the variable indices of the result for later
    std::vector<uint32_t> result_witness_indices;
    for (uint32_t& read_idx : read_indices) {
        // Create a variable corresponding to the index at which we want to read into calldata
        uint32_t read_idx_witness_idx = builder.add_variable(read_idx);

        auto value_witness_idx = builder.read_calldata(read_idx_witness_idx);
        result_witness_indices.emplace_back(value_witness_idx);
    }

    // Check that the read result is as expected and that the duplicate reads produce the same result
    auto expected_read_result_at_1 = calldata_values[1];
    auto expected_read_result_at_4 = calldata_values[4];
    auto duplicate_read_result_0 = builder.get_variable(result_witness_indices[0]);
    auto duplicate_read_result_1 = builder.get_variable(result_witness_indices[1]);
    auto duplicate_read_result_2 = builder.get_variable(result_witness_indices[2]);
    EXPECT_EQ(duplicate_read_result_0, expected_read_result_at_1);
    EXPECT_EQ(duplicate_read_result_1, expected_read_result_at_4);
    EXPECT_EQ(duplicate_read_result_2, expected_read_result_at_1);

    // Construct and verify Honk proof
    bool result = this->construct_and_verify_proof(builder);
    EXPECT_TRUE(result);
}
} // namespace
