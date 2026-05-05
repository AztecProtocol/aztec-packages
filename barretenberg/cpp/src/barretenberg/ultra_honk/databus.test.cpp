#include "barretenberg/stdlib_circuit_builders/databus.hpp"
#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/honk/prover_instance_inspector.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
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
     * @details All individual bus columns (calldata, returndata etc.) behave the same way. This method facilitates
     * testing each of them individually by allowing specification of the add and read methods for a given bus column
     * type.
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
 * @brief Test proof construction/verification for a circuit with calldata lookup gates
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
        builder.add_public_calldata(BusId::KERNEL_CALLDATA, builder.add_variable(val));
    }

    // Define some read indices with a duplicate
    std::vector<uint32_t> read_indices = { 1, 4, 1 };

    // Create some calldata read gates and store the variable indices of the result for later
    std::vector<uint32_t> result_witness_indices;
    for (uint32_t& read_idx : read_indices) {
        // Create a variable corresponding to the index at which we want to read into calldata
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

// at() asserts in debug if `index >= end_index()`, and is undefined in release. To write
// past the polynomial's populated region we widen it first.
template <class FF> void widen_to(Polynomial<FF>& poly, size_t target_size)
{
    if (target_size > poly.size()) {
        poly = Polynomial<FF>(poly, target_size);
    }
}

/**
 * @brief Regression: a malicious prover plants the forgery in the prefix masking region
 * `[0, NUM_DISABLED_ROWS_IN_SUMCHECK)`, before the bus column body starts.
 *
 * For non-ZK Mega, those rows are in-bounds for sumcheck — `sumcheck_round.hpp` notes
 * "non-ZK disabled rows are all zeros and handled by the main loop", so the only reason
 * they normally don't contribute is that all polynomials are zero there. A prover who
 * plants `calldata = v_attack`, `calldata_read_counts = NUM_READS` at e.g. row 1 puts a
 * synthetic table entry into the lookup sum. `databus_id` is 0 at every prefix row
 * (default-initialised, never written by `construct_databus_polynomials`), colliding
 * with the body's row-0 `databus_id = 0` and letting the lookup identity balance.
 *
 * The read-count locality subrelation rejects: `calldata_indicator = 0` in the prefix
 * region (it's only set to 1 on rows the column owns), so `(1 - 0) * NUM_READS != 0`.
 *
 * On ZK Mega the `RowDisablingPolynomial` zeros the prefix's relation contributions, so
 * the attack fails via the lookup identity instead of via locality — but the outcome
 * (verifier rejection) is the same.
 */
TYPED_TEST(DataBusTests, OutOfBodyReadCountsRejectedPrefix)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;
    using Builder = typename Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor, DefaultIO>;

    constexpr size_t NUM_READS = 3;
    constexpr size_t HONEST_ROW = NUM_DISABLED_ROWS_IN_SUMCHECK;
    // Plant inside the prefix masking region. Any value in [0, NUM_DISABLED_ROWS_IN_SUMCHECK) works;
    // pick row 1 so we're squarely inside the masking band, not on its boundaries.
    constexpr size_t FORGERY_ROW = 1;
    static_assert(FORGERY_ROW < NUM_DISABLED_ROWS_IN_SUMCHECK);

    const FF v_honest_0 = FF(7);
    const FF v_attack = FF(424242);

    Builder builder = this->construct_test_builder();
    builder.add_public_calldata(builder.add_variable(v_honest_0));
    builder.add_public_calldata(builder.add_variable(FF(11)));
    builder.add_public_calldata(builder.add_variable(FF(13)));
    builder.add_public_calldata(builder.add_variable(FF(17)));
    builder.add_public_calldata(builder.add_variable(FF(19)));
    for (size_t i = 0; i < NUM_READS; ++i) {
        const uint32_t read_idx_witness = builder.add_variable(FF(0));
        (void)builder.read_calldata(read_idx_witness);
    }
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
    auto& polys = prover_instance->polynomials;

    // Prefix row is within the polynomial's populated region — no widen_to needed.
    ASSERT_LT(FORGERY_ROW, polys.calldata.end_index());
    ASSERT_EQ(polys.databus_id[FORGERY_ROW], FF(0));
    ASSERT_EQ(polys.calldata[FORGERY_ROW], FF(0));
    ASSERT_EQ(polys.calldata_indicator[FORGERY_ROW], FF(0));
    ASSERT_EQ(polys.databus_id[HONEST_ROW], FF(0));
    ASSERT_EQ(polys.calldata[HONEST_ROW], v_honest_0);

    // Forged prefix-row entry; redirect the read multiplicity to it.
    polys.calldata.at(FORGERY_ROW) = v_attack;
    polys.calldata_read_counts.at(FORGERY_ROW) = FF(NUM_READS);
    polys.calldata_read_counts.at(HONEST_ROW) = FF(0);

    // Rewrite the result wire of each busread gate from v_honest_0 to v_attack.
    size_t num_busread_rows_seen = 0;
    for (size_t r = 0; r < polys.q_busread.end_index(); ++r) {
        if (polys.q_busread.at(r) == FF(1) && polys.q_l.at(r) == FF(1) && polys.w_r.at(r) == FF(0) &&
            polys.w_l.at(r) == v_honest_0) {
            polys.w_l.at(r) = v_attack;
            ++num_busread_rows_seen;
        }
    }
    ASSERT_EQ(num_busread_rows_seen, NUM_READS);

    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(prover_instance->get_precomputed());
    auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);
    Prover prover{ prover_instance, verification_key };
    auto proof = prover.construct_proof();
    Verifier verifier{ vk_and_hash };
    EXPECT_FALSE(verifier.verify_proof(proof).result)
        << "read-count locality must reject calldata_read_counts != 0 in the prefix masking region";
}

/**
 * @brief Regression: a malicious prover writes `calldata = v_attack` and
 * `calldata_read_counts = NUM_READS` at a row past every populated bus column, then
 * rewrites the result wire of each honest `read_calldata(0)` gate to v_attack. With
 * `calldata_size = 5` and no other bus columns, `max_databus_column_size = 5`, so rows
 * past every populated bus column have `databus_id = 0` by default -- colliding with
 * the honest body's row-0 `databus_id = 0` and letting the lookup identity balance.
 *
 * The read-count locality subrelation rejects: `calldata_indicator` is 0 at the planted
 * row, so `(1 - 0) * NUM_READS != 0`.
 */
TYPED_TEST(DataBusTests, OutOfBodyReadCountsRejected)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;
    using Builder = typename Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor, DefaultIO>;

    constexpr size_t NUM_READS = 3;
    constexpr size_t CALLDATA_SIZE = 5;
    // Databus polynomials are offset by NUM_DISABLED_ROWS_IN_SUMCHECK; honest row-0 of the
    // body lives at row NUM_DISABLED_ROWS_IN_SUMCHECK. The forgery row is past every
    // populated bus column (calldata, read_counts, databus_id, indicators).
    constexpr size_t HONEST_ROW = NUM_DISABLED_ROWS_IN_SUMCHECK;
    constexpr size_t FORGERY_ROW = NUM_DISABLED_ROWS_IN_SUMCHECK + CALLDATA_SIZE + 1;

    const FF v_honest_0 = FF(7);
    const FF v_attack = FF(424242);

    Builder builder = this->construct_test_builder();
    builder.add_public_calldata(builder.add_variable(v_honest_0));
    builder.add_public_calldata(builder.add_variable(FF(11)));
    builder.add_public_calldata(builder.add_variable(FF(13)));
    builder.add_public_calldata(builder.add_variable(FF(17)));
    builder.add_public_calldata(builder.add_variable(FF(19)));
    // The result wires of these reads are unconsumed so each forms a trivial copy cycle;
    // rewriting w_l at the busread row is permutation-safe.
    for (size_t i = 0; i < NUM_READS; ++i) {
        const uint32_t read_idx_witness = builder.add_variable(FF(0));
        (void)builder.read_calldata(read_idx_witness);
    }
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
    auto& polys = prover_instance->polynomials;

    // operator[] uses get() (returns 0 past end_index()); at() asserts.
    ASSERT_EQ(polys.databus_id[HONEST_ROW], FF(0));
    ASSERT_EQ(polys.calldata[HONEST_ROW], v_honest_0);
    ASSERT_EQ(polys.calldata_read_counts[HONEST_ROW], FF(NUM_READS));
    ASSERT_EQ(polys.calldata_indicator[HONEST_ROW], FF(1));
    ASSERT_EQ(polys.databus_id[FORGERY_ROW], FF(0));
    ASSERT_EQ(polys.calldata[FORGERY_ROW], FF(0));
    ASSERT_EQ(polys.calldata_read_counts[FORGERY_ROW], FF(0));
    ASSERT_EQ(polys.calldata_indicator[FORGERY_ROW], FF(0));

    // Widen calldata + read_counts so we can write at FORGERY_ROW.
    widen_to(polys.calldata, FORGERY_ROW + 1);
    widen_to(polys.calldata_read_counts, FORGERY_ROW + 1);

    // Forged out-of-body calldata entry; redirect the read multiplicity to it.
    polys.calldata.at(FORGERY_ROW) = v_attack;
    polys.calldata_read_counts.at(FORGERY_ROW) = FF(NUM_READS);
    polys.calldata_read_counts.at(HONEST_ROW) = FF(0);

    // Rewrite the result wire of each busread gate from v_honest_0 to v_attack.
    size_t num_busread_rows_seen = 0;
    for (size_t r = 0; r < polys.q_busread.end_index(); ++r) {
        if (polys.q_busread.at(r) == FF(1) && polys.q_l.at(r) == FF(1) && polys.w_r.at(r) == FF(0) &&
            polys.w_l.at(r) == v_honest_0) {
            polys.w_l.at(r) = v_attack;
            ++num_busread_rows_seen;
        }
    }
    ASSERT_EQ(num_busread_rows_seen, NUM_READS);

    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(prover_instance->get_precomputed());
    auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);
    Prover prover{ prover_instance, verification_key };
    auto proof = prover.construct_proof();
    Verifier verifier{ vk_and_hash };
    EXPECT_FALSE(verifier.verify_proof(proof).result)
        << "read-count locality must reject calldata_read_counts != 0 outside the body";
}

/**
 * @brief Regression: cross-column variant. With `calldata_size = 5` and
 * `return_data_size = 20`, the shared `databus_id` polynomial is sized to 20, so rows
 * in [5, 20) carry a legitimate non-zero `databus_id` -- but they're outside calldata's
 * body. The prover writes `calldata = v_attack` at one such row and rewrites each read
 * gate's `(w_l, w_r)` to `(v_attack, FORGERY_ROW)`. Both wires are dangling so the
 * permutation argument is unaffected.
 *
 * The read-count locality subrelation rejects: `calldata_indicator = 0` outside calldata's
 * body, regardless of what `databus_id` is at that row.
 */
TYPED_TEST(DataBusTests, OutOfBodyReadCountsRejectedCrossColumn)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;
    using Builder = typename Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor, DefaultIO>;

    constexpr size_t NUM_READS = 3;
    constexpr size_t CALLDATA_SIZE = 5;
    constexpr size_t RETURN_DATA_SIZE = 20;
    // Logical bus index inside return_data's body but outside calldata's body. databus_id
    // at this position is a legitimate non-zero index value baked into the precomputed VK.
    constexpr size_t FORGERY_BUS_IDX = 7;
    static_assert(FORGERY_BUS_IDX >= CALLDATA_SIZE);
    static_assert(FORGERY_BUS_IDX < RETURN_DATA_SIZE);
    // Actual polynomial row at which the honest read occurs
    constexpr size_t HONEST_ROW = NUM_DISABLED_ROWS_IN_SUMCHECK;
    // Actual polynomial row at which the forgery is done
    constexpr size_t FORGERY_ROW = NUM_DISABLED_ROWS_IN_SUMCHECK + FORGERY_BUS_IDX;

    const FF v_honest_0 = FF(7);
    const FF v_attack = FF(424242);

    Builder builder = this->construct_test_builder();
    builder.add_public_calldata(builder.add_variable(v_honest_0));
    builder.add_public_calldata(builder.add_variable(FF(11)));
    builder.add_public_calldata(builder.add_variable(FF(13)));
    builder.add_public_calldata(builder.add_variable(FF(17)));
    builder.add_public_calldata(builder.add_variable(FF(19)));
    for (size_t i = 0; i < RETURN_DATA_SIZE; ++i) {
        builder.add_public_return_data(builder.add_variable(FF(1000 + i)));
    }
    for (size_t i = 0; i < NUM_READS; ++i) {
        const uint32_t read_idx_witness = builder.add_variable(FF(0));
        (void)builder.read_calldata(read_idx_witness);
    }
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
    auto& polys = prover_instance->polynomials;

    ASSERT_EQ(polys.databus_id[FORGERY_ROW], FF(FORGERY_BUS_IDX));
    ASSERT_EQ(polys.calldata[FORGERY_ROW], FF(0));
    ASSERT_EQ(polys.calldata_indicator[FORGERY_ROW], FF(0));
    ASSERT_EQ(polys.return_data_indicator[FORGERY_ROW], FF(1));

    widen_to(polys.calldata, FORGERY_ROW + 1);
    widen_to(polys.calldata_read_counts, FORGERY_ROW + 1);

    polys.calldata.at(FORGERY_ROW) = v_attack;
    polys.calldata_read_counts.at(FORGERY_ROW) = FF(NUM_READS);
    polys.calldata_read_counts.at(HONEST_ROW) = FF(0);

    // Both w_l and w_r are dangling, so each can be rewritten without breaking the
    // permutation argument. The wire 2 (read index) is set to FORGERY_BUS_IDX, which is
    // the bus index value at the forgery row (not the polynomial row index).
    size_t num_busread_rows_seen = 0;
    for (size_t r = 0; r < polys.q_busread.end_index(); ++r) {
        if (polys.q_busread.at(r) == FF(1) && polys.q_l.at(r) == FF(1) && polys.w_r.at(r) == FF(0) &&
            polys.w_l.at(r) == v_honest_0) {
            polys.w_l.at(r) = v_attack;
            polys.w_r.at(r) = FF(FORGERY_BUS_IDX);
            ++num_busread_rows_seen;
        }
    }
    ASSERT_EQ(num_busread_rows_seen, NUM_READS);

    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(prover_instance->get_precomputed());
    auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);
    Prover prover{ prover_instance, verification_key };
    auto proof = prover.construct_proof();
    Verifier verifier{ vk_and_hash };
    EXPECT_FALSE(verifier.verify_proof(proof).result)
        << "read-count locality must reject calldata_read_counts != 0 at a row outside calldata's body, even "
           "with a legitimate non-zero databus_id";
}
} // namespace
