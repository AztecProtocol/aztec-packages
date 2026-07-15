#include "barretenberg/stdlib_circuit_builders/databus.hpp"
#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/honk/prover_instance_inspector.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace bb;
namespace {
auto& engine = numeric::get_debug_randomness();

// DataBusTests only run against flavors that include the databus relation in their tuple.
// MegaZKFlavor deliberately drops databus; q_busread is identically zero in the hiding kernel.
using FlavorTypes = ::testing::Types<MegaFlavor>;

template <typename Flavor> class DataBusTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Builder = typename Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor, DefaultIO>;

    // Construct and verify a MegaHonk proof for a given circuit
    static bool construct_and_verify_proof(MegaCircuitBuilder& builder)
    {
        auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
        auto verification_key = std::make_shared<typename Flavor::VerificationKey>(prover_instance->get_precomputed());
        auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);

        Prover prover{ prover_instance, verification_key };
        auto proof = prover.construct_proof();
        Verifier verifier{ vk_and_hash };
        bool result = verifier.verify_proof(proof).result;
        return result;
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
     * @details All individual bus columns behave the same way. This method facilitates testing each of them
     * individually by allowing specification of the add and read methods for a given bus column type.
     *
     * @param add_bus_data Method for adding data to the given bus column
     * @param read_bus_data Method for reading from a given bus column
     * @return Builder
     */
    static Builder construct_circuit_with_databus_reads(Builder& builder, const BusId& bus_idx)
    {

        const uint32_t NUM_BUS_ENTRIES = 5; // number of entries in the bus column
        const uint32_t NUM_READS = 7;       // greater than size of bus to ensure duplicates

        // Add some arbitrary values to the bus column
        for (size_t i = 0; i < NUM_BUS_ENTRIES; ++i) {
            FF val = FF::random_element();
            uint32_t val_witness_idx = builder.add_variable(val);
            builder.add_public_calldata(bus_idx, val_witness_idx);
        }

        // Read from the bus at some random indices
        for (size_t i = 0; i < NUM_READS; ++i) {
            uint32_t read_idx = engine.get_random_uint32() % NUM_BUS_ENTRIES;
            uint32_t read_idx_witness_idx = builder.add_variable(FF(read_idx));
            builder.read_calldata(bus_idx, read_idx_witness_idx);
        }

        return builder;
    }
};

TYPED_TEST_SUITE(DataBusTests, FlavorTypes);

/**
 * @brief Test proof construction/verification for a circuit with kernel calldata lookup gates
 *
 */
TYPED_TEST(DataBusTests, KernelCallDataRead)
{
    typename TypeParam::CircuitBuilder builder = this->construct_test_builder();
    this->construct_circuit_with_databus_reads(builder, BusId::KERNEL_CALLDATA);
    EXPECT_TRUE(CircuitChecker::check(builder));
    EXPECT_TRUE(this->construct_and_verify_proof(builder));
}

/**
 * @brief Test proof construction/verification for circuits with app calldata lookup gates
 *
 */
TYPED_TEST(DataBusTests, AppCallDataRead)
{
    for (size_t idx = 0; idx < MAX_APPS_PER_KERNEL; ++idx) {
        typename TypeParam::CircuitBuilder builder = this->construct_test_builder();
        this->construct_circuit_with_databus_reads(builder, static_cast<BusId>(idx + 1));

        EXPECT_TRUE(CircuitChecker::check(builder)) << "Circuit check failed for app calldata bus with index " << idx;
        EXPECT_TRUE(this->construct_and_verify_proof(builder)) << "Failed for app calldata bus with index " << idx;
    }
}

/**
 * @brief Test proof construction/verification for a circuit with return data lookup gates
 *
 */
TYPED_TEST(DataBusTests, ReturnDataRead)
{
    typename TypeParam::CircuitBuilder builder = this->construct_test_builder();
    this->construct_circuit_with_databus_reads(builder, BusId::RETURNDATA);

    EXPECT_TRUE(CircuitChecker::check(builder));
    EXPECT_TRUE(this->construct_and_verify_proof(builder));
}

/**
 * @brief Test proof construction/verification for a circuit with reads from all bus columns
 *
 */
TYPED_TEST(DataBusTests, ReadAll)
{
    typename TypeParam::CircuitBuilder builder = this->construct_test_builder();
    this->construct_circuit_with_databus_reads(builder, BusId::KERNEL_CALLDATA);
    for (size_t idx = 0; idx < MAX_APPS_PER_KERNEL; ++idx) {
        this->construct_circuit_with_databus_reads(builder, static_cast<BusId>(idx + 1));
    }
    this->construct_circuit_with_databus_reads(builder, BusId::RETURNDATA);

    EXPECT_TRUE(CircuitChecker::check(builder));
    EXPECT_TRUE(this->construct_and_verify_proof(builder));
}

/**
 * @brief Test proof construction/verification for a circuit with duplicate kernel calldata reads and some explicit
 * checks that the read results are correct
 *
 */
TYPED_TEST(DataBusTests, CallDataDuplicateRead)
{
    // Construct a circuit and add some ecc op gates and arithmetic gates
    typename TypeParam::CircuitBuilder builder = this->construct_test_builder();
    using FF = TypeParam::FF;

    // Add some values to kernel calldata

    std::vector<FF> calldata_values = { 7, 10, 3, 12, 1 };
    for (auto& val : calldata_values) {
        builder.add_public_calldata(BusId::KERNEL_CALLDATA, builder.add_variable(val));
    }

    // Define some read indices with a duplicate
    std::vector<uint32_t> read_indices = { 1, 4, 1 };

    // Create some kernel calldata read gates and store the variable indices of the result for later
    std::vector<uint32_t> result_witness_indices;
    for (uint32_t& read_idx : read_indices) {
        // Create a variable corresponding to the index at which we want to read into kernel calldata
        uint32_t read_idx_witness_idx = builder.add_variable(FF(read_idx));

        auto value_witness_idx = builder.read_calldata(BusId::KERNEL_CALLDATA, read_idx_witness_idx);
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
