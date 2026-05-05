/**
 * @file databus_lookup_relation_consistency.test.cpp
 * @brief Tests for DatabusLookupRelation to verify the relation arithmetic matches a simple reference implementation
 * @details Similar to ultra_relation_consistency.test.cpp, this test verifies that the optimized relation
 * implementation produces the same results as a simpler, more readable reference implementation.
 *
 * The DatabusLookupRelation implements a log-derivative lookup argument with 4 subrelations per bus column:
 * 1a. Inverse correctness (read rows): (I * L * T - 1) * is_read = 0
 * 1b. Inverse correctness (write rows): (I * L * T - 1) * count = 0
 * 2.  Log-derivative lookup: sum of (is_read * T - count * L) * I = 0
 * 3.  Read-count locality: (1 - indicator) * count = 0
 */
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/relations/databus_lookup_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include <gtest/gtest.h>

using namespace bb;

using FF = fr;

/**
 * @brief Input elements for DatabusLookupRelation testing
 * @details Contains all the polynomial evaluations needed for the databus lookup relation
 */
struct DatabusInputElements {
    // Wires used in read gates
    FF w_l;        // value being read
    FF w_r;        // index into bus column
    FF databus_id; // id/index in the bus (for write term)

    // Read gate selector
    FF q_busread;

    // Column selectors (determine which bus column is being read)
    FF q_l; // calldata selector
    FF q_r; // secondary_calldata selector
    FF q_o; // return_data selector

    // Calldata (bus_idx = 0)
    FF calldata;
    FF calldata_read_counts;
    FF calldata_inverses;
    FF calldata_indicator;

    // Secondary calldata (bus_idx = 1)
    FF secondary_calldata;
    FF secondary_calldata_read_counts;
    FF secondary_calldata_inverses;
    FF secondary_calldata_indicator;

    // Return data (bus_idx = 2)
    FF return_data;
    FF return_data_read_counts;
    FF return_data_inverses;
    FF return_data_indicator;

    static DatabusInputElements get_random()
    {
        DatabusInputElements result;
        result.w_l = FF::random_element();
        result.w_r = FF::random_element();
        result.databus_id = FF::random_element();
        result.q_busread = FF::random_element();
        result.q_l = FF::random_element();
        result.q_r = FF::random_element();
        result.q_o = FF::random_element();
        result.calldata = FF::random_element();
        result.calldata_read_counts = FF::random_element();
        result.calldata_inverses = FF::random_element();
        result.calldata_indicator = FF::random_element();
        result.secondary_calldata = FF::random_element();
        result.secondary_calldata_read_counts = FF::random_element();
        result.secondary_calldata_inverses = FF::random_element();
        result.secondary_calldata_indicator = FF::random_element();
        result.return_data = FF::random_element();
        result.return_data_read_counts = FF::random_element();
        result.return_data_inverses = FF::random_element();
        result.return_data_indicator = FF::random_element();
        return result;
    }

    // Create inputs representing a valid read gate for calldata
    static DatabusInputElements get_valid_calldata_read()
    {
        DatabusInputElements result{};

        // Set up a read from calldata at index 5, value 42
        result.w_l = FF(42);       // value being read
        result.w_r = FF(5);        // index
        result.databus_id = FF(5); // same index in the bus
        result.calldata = FF(42);  // value in bus matches

        // Enable read gate for calldata
        result.q_busread = FF(1);
        result.q_l = FF(1); // calldata selector
        result.q_r = FF(0);
        result.q_o = FF(0);

        // Read counts
        result.calldata_read_counts = FF(1);
        result.calldata_indicator = FF(1); // data row, so the read-count locality subrelation passes

        // Other columns inactive
        result.secondary_calldata_read_counts = FF(0);
        result.return_data_read_counts = FF(0);

        return result;
    }
};

class DatabusLookupRelationConsistency : public testing::Test {
  public:
    using Relation = DatabusLookupRelationImpl<FF>;
    static constexpr size_t NUM_SUBRELATIONS = 12; // 4 subrelations per bus column, 3 columns

    /**
     * @brief Validate that the relation's accumulate function produces expected values
     */
    static void validate_relation_execution(const std::array<FF, NUM_SUBRELATIONS>& expected_values,
                                            const DatabusInputElements& input_elements,
                                            const RelationParameters<FF>& parameters)
    {
        std::array<FF, NUM_SUBRELATIONS> accumulator{};
        Relation::accumulate(accumulator, input_elements, parameters, FF(1));
        EXPECT_EQ(accumulator, expected_values);
    }
};

/**
 * @brief Helper to compute all expected subrelation values for a given input
 */
static std::array<FF, 12> compute_expected_values(const DatabusInputElements& in, const RelationParameters<FF>& params)
{
    const auto& beta = params.beta;
    const auto& gamma = params.gamma;

    std::array<FF, 12> expected_values;
    std::fill(expected_values.begin(), expected_values.end(), FF(0));

    // Read term (same for all columns): value + index * beta + gamma
    auto lookup_term = in.w_l + in.w_r * beta + gamma;

    // Lambda to compute subrelations for a given bus column
    auto compute_column_subrelations =
        [&](size_t bus_idx, FF column_selector, FF bus_value, FF read_counts, FF inverses, FF indicator) {
            auto is_read = in.q_busread * column_selector;
            auto table_term = bus_value + in.databus_id * beta + gamma;

            // Common: I * L * T - 1
            auto common = lookup_term * table_term * inverses - FF(1);

            // Subrelation 1a: Inverse correctness on read rows: (I*L*T - 1) * is_read
            expected_values[bus_idx * 4] = common * is_read;

            // Subrelation 1b: Inverse correctness on write rows: (I*L*T - 1) * count
            expected_values[bus_idx * 4 + 1] = common * read_counts;

            // Subrelation 2: Log-derivative lookup (no scaling factor since linearly dependent)
            expected_values[bus_idx * 4 + 2] = (is_read * table_term - read_counts * lookup_term) * inverses;

            // Subrelation 3: Read-count locality: (1 - indicator) * count
            expected_values[bus_idx * 4 + 3] = read_counts - indicator * read_counts;
        };

    // Bus column 0 (calldata)
    compute_column_subrelations(
        0, in.q_l, in.calldata, in.calldata_read_counts, in.calldata_inverses, in.calldata_indicator);

    // Bus column 1 (secondary_calldata)
    compute_column_subrelations(1,
                                in.q_r,
                                in.secondary_calldata,
                                in.secondary_calldata_read_counts,
                                in.secondary_calldata_inverses,
                                in.secondary_calldata_indicator);

    // Bus column 2 (return_data)
    compute_column_subrelations(
        2, in.q_o, in.return_data, in.return_data_read_counts, in.return_data_inverses, in.return_data_indicator);

    return expected_values;
}

/**
 * @brief Test all subrelations with random inputs
 * @details Verifies that the relation's accumulate function matches the simple reference implementation
 */
TEST_F(DatabusLookupRelationConsistency, RandomInputs)
{
    const auto run_test = [](bool random_inputs) {
        DatabusInputElements in =
            random_inputs ? DatabusInputElements::get_random() : DatabusInputElements::get_valid_calldata_read();

        const auto parameters = RelationParameters<FF>::get_random();
        auto expected_values = compute_expected_values(in, parameters);

        validate_relation_execution(expected_values, in, parameters);
    };

    run_test(/*random_inputs=*/false);
    run_test(/*random_inputs=*/true);
}

/**
 * @brief Test that inactive gates (all selectors and counts = 0) produce all-zero subrelations
 */
TEST_F(DatabusLookupRelationConsistency, InactiveGates)
{
    const auto parameters = RelationParameters<FF>::get_random();

    DatabusInputElements in{};
    in.q_busread = FF(0);
    in.q_l = FF(0);
    in.q_r = FF(0);
    in.q_o = FF(0);
    in.calldata_read_counts = FF(0);
    in.secondary_calldata_read_counts = FF(0);
    in.return_data_read_counts = FF(0);

    // Set other values non-zero to ensure they don't affect inactive gates
    in.w_l = FF(42);
    in.w_r = FF(5);
    in.databus_id = FF(5);
    in.calldata = FF(42);
    in.calldata_inverses = FF(0); // inverse should be 0 when inactive

    std::array<FF, NUM_SUBRELATIONS> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));

    // All subrelations should be 0 when inactive
    for (size_t i = 0; i < NUM_SUBRELATIONS; i++) {
        EXPECT_EQ(accumulator[i], FF(0)) << "Subrelation " << i << " should be zero for inactive gates";
    }
}

/**
 * @brief Test a valid read gate scenario where inverse is correctly computed
 * @details When I = 1/(L * T), both inverse correctness subrelations and the lookup identity should be satisfied
 */
TEST_F(DatabusLookupRelationConsistency, ValidInverseComputation)
{
    const auto parameters = RelationParameters<FF>::get_random();
    const auto& beta = parameters.beta;
    const auto& gamma = parameters.gamma;

    DatabusInputElements in{};

    // Set up a read gate for calldata
    in.q_busread = FF(1);
    in.q_l = FF(1); // calldata selector
    in.q_r = FF(0);
    in.q_o = FF(0);

    // Value and index
    FF value = FF(42);
    FF index = FF(5);
    in.w_l = value;        // value being read
    in.w_r = index;        // index
    in.databus_id = index; // same index in the bus
    in.calldata = value;   // value in bus matches

    // Compute the correct inverse
    auto lookup_term = value + index * beta + gamma;
    auto table_term = value + index * beta + gamma; // same since value and index match
    auto inverse = (lookup_term * table_term).invert();
    in.calldata_inverses = inverse;

    in.calldata_read_counts = FF(1);
    in.calldata_indicator = FF(1); // data row, read-count locality subrelation passes

    // Other columns inactive
    in.secondary_calldata_read_counts = FF(0);
    in.secondary_calldata_inverses = FF(0);
    in.return_data_read_counts = FF(0);
    in.return_data_inverses = FF(0);

    std::array<FF, NUM_SUBRELATIONS> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));

    // (1a) Inverse correctness on read: (I*L*T - 1) * is_read = (1 - 1) * 1 = 0
    EXPECT_EQ(accumulator[0], FF(0));

    // (1b) Inverse correctness on write: (I*L*T - 1) * count = (1 - 1) * 1 = 0
    EXPECT_EQ(accumulator[1], FF(0));

    // (2) Lookup: (is_read*T - count*L) * I = (T - L) * I = 0 (since L == T here)
    EXPECT_EQ(accumulator[2], FF(0));

    // (3) Read-count locality: (1 - 1) * 1 = 0
    EXPECT_EQ(accumulator[3], FF(0));

    // Other columns should have all-zero subrelations (inactive)
    for (size_t i = 4; i < NUM_SUBRELATIONS; i++) {
        EXPECT_EQ(accumulator[i], FF(0)) << "Inactive column subrelation " << i << " should be zero";
    }
}

/**
 * @brief Test that when lookup_term != table_term, the lookup identity fails
 */
TEST_F(DatabusLookupRelationConsistency, MismatchedReadWriteTerms)
{
    const auto parameters = RelationParameters<FF>::get_random();
    const auto& beta = parameters.beta;
    const auto& gamma = parameters.gamma;

    DatabusInputElements in{};

    // Set up a read gate for calldata
    in.q_busread = FF(1);
    in.q_l = FF(1);
    in.q_r = FF(0);
    in.q_o = FF(0);

    // Value being read differs from value in bus!
    FF read_value = FF(42);
    FF bus_value = FF(100); // Different!
    FF index = FF(5);

    in.w_l = read_value;
    in.w_r = index;
    in.databus_id = index;
    in.calldata = bus_value;

    auto lookup_term = read_value + index * beta + gamma;
    auto table_term = bus_value + index * beta + gamma;
    auto inverse = (lookup_term * table_term).invert();
    in.calldata_inverses = inverse;

    in.calldata_read_counts = FF(1);
    in.secondary_calldata_read_counts = FF(0);
    in.secondary_calldata_inverses = FF(0);
    in.return_data_read_counts = FF(0);
    in.return_data_inverses = FF(0);

    std::array<FF, NUM_SUBRELATIONS> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));

    // (1a) Inverse correctness still satisfied (I is correct for these terms)
    EXPECT_EQ(accumulator[0], FF(0));

    // (1b) Inverse correctness on write: (I*L*T - 1) * count = 0 * 1 = 0 (I*L*T = 1)
    EXPECT_EQ(accumulator[1], FF(0));

    // (2) Lookup subrelation is non-zero because lookup_term != table_term
    // (is_read * table_term - count * lookup_term) * I = (table_term - lookup_term) * I
    FF expected_lookup = (table_term - lookup_term) * inverse;
    EXPECT_EQ(accumulator[2], expected_lookup);
    EXPECT_NE(accumulator[2], FF(0));
}

/**
 * @brief Test inverse correctness gating: I unconstrained at inactive rows
 * @details At rows where is_read = 0 and count = 0, the inverse can be anything without
 * affecting any subrelation (since the lookup identity contribution is also zero).
 */
TEST_F(DatabusLookupRelationConsistency, InverseUnconstrainedAtInactiveRows)
{
    const auto parameters = RelationParameters<FF>::get_random();

    DatabusInputElements in{};
    in.q_busread = FF(0);
    in.q_l = FF(0);
    in.q_r = FF(0);
    in.q_o = FF(0);
    in.calldata_read_counts = FF(0);
    in.secondary_calldata_read_counts = FF(0);
    in.return_data_read_counts = FF(0);

    // Set inverses to arbitrary nonzero values — should not matter
    in.calldata_inverses = FF(999);
    in.secondary_calldata_inverses = FF(777);
    in.return_data_inverses = FF(555);

    in.w_l = FF(42);
    in.w_r = FF(5);
    in.databus_id = FF(5);
    in.calldata = FF(42);

    std::array<FF, NUM_SUBRELATIONS> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));

    // (1a) gated by is_read = 0: always zero regardless of I
    EXPECT_EQ(accumulator[0], FF(0));
    EXPECT_EQ(accumulator[4], FF(0));
    EXPECT_EQ(accumulator[8], FF(0));

    // (1b) gated by count = 0: always zero regardless of I
    EXPECT_EQ(accumulator[1], FF(0));
    EXPECT_EQ(accumulator[5], FF(0));
    EXPECT_EQ(accumulator[9], FF(0));

    // (2) lookup: (0 * T - 0 * L) * I = 0 regardless of I
    EXPECT_EQ(accumulator[2], FF(0));
    EXPECT_EQ(accumulator[6], FF(0));
    EXPECT_EQ(accumulator[10], FF(0));

    // (3) read-count locality: (1 - indicator) * 0 = 0 regardless of indicator
    EXPECT_EQ(accumulator[3], FF(0));
    EXPECT_EQ(accumulator[7], FF(0));
    EXPECT_EQ(accumulator[11], FF(0));
}

/**
 * @brief Test that a wrong inverse on a read row causes (1a) to fail
 * @details When is_read = 1 and I != 1/(L*T), subrelation (1a) should be nonzero.
 */
TEST_F(DatabusLookupRelationConsistency, WrongInverseOnReadRowFails)
{
    const auto parameters = RelationParameters<FF>::get_random();
    const auto& beta = parameters.beta;
    const auto& gamma = parameters.gamma;

    DatabusInputElements in{};
    in.q_busread = FF(1);
    in.q_l = FF(1);
    in.q_r = FF(0);
    in.q_o = FF(0);

    FF value = FF(42);
    FF index = FF(5);
    in.w_l = value;
    in.w_r = index;
    in.databus_id = index;
    in.calldata = value;

    // Set a WRONG inverse (just some arbitrary value, not 1/(L*T))
    in.calldata_inverses = FF(777);
    in.calldata_read_counts = FF(0); // pure read row, no write
    in.secondary_calldata_read_counts = FF(0);
    in.secondary_calldata_inverses = FF(0);
    in.return_data_read_counts = FF(0);
    in.return_data_inverses = FF(0);

    auto lookup_term = value + index * beta + gamma;
    auto table_term = value + index * beta + gamma;

    std::array<FF, NUM_SUBRELATIONS> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));

    // (1a) should be nonzero: (I*L*T - 1) * is_read = (777*L*T - 1) * 1 != 0
    FF expected_1a = (FF(777) * lookup_term * table_term - FF(1)) * FF(1); // is_read = q_busread * q_l = 1
    EXPECT_EQ(accumulator[0], expected_1a);
    EXPECT_NE(accumulator[0], FF(0));

    // (1b) should be zero: gated by count = 0
    EXPECT_EQ(accumulator[1], FF(0));
}

/**
 * @brief Test that a wrong inverse on a write row causes (1b) to fail
 * @details When count != 0 and I != 1/(L*T), subrelation (1b) should be nonzero.
 */
TEST_F(DatabusLookupRelationConsistency, WrongInverseOnWriteRowFails)
{
    const auto parameters = RelationParameters<FF>::get_random();
    const auto& beta = parameters.beta;
    const auto& gamma = parameters.gamma;

    DatabusInputElements in{};
    // No read gate active
    in.q_busread = FF(0);
    in.q_l = FF(0);
    in.q_r = FF(0);
    in.q_o = FF(0);

    FF value = FF(42);
    FF index = FF(5);
    in.databus_id = index;
    in.calldata = value;
    in.w_l = FF(0); // irrelevant (no read gate)
    in.w_r = FF(0);

    // Row has nonzero read_count (it's been read from elsewhere) but wrong inverse
    in.calldata_read_counts = FF(3);
    in.calldata_inverses = FF(999); // WRONG

    in.secondary_calldata_read_counts = FF(0);
    in.secondary_calldata_inverses = FF(0);
    in.return_data_read_counts = FF(0);
    in.return_data_inverses = FF(0);

    auto lookup_term = in.w_l + in.w_r * beta + gamma; // = gamma (wires are 0)
    auto table_term = value + index * beta + gamma;

    std::array<FF, NUM_SUBRELATIONS> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));

    // (1a) should be zero: gated by is_read = q_busread * q_l = 0
    EXPECT_EQ(accumulator[0], FF(0));

    // (1b) should be nonzero: (I*L*T - 1) * count = (999*L*T - 1) * 3 != 0
    FF expected_1b = (FF(999) * lookup_term * table_term - FF(1)) * FF(3);
    EXPECT_EQ(accumulator[1], expected_1b);
    EXPECT_NE(accumulator[1], FF(0));
}

/**
 * @brief Test that nonzero count with correct inverse satisfies all subrelations
 * @details A pure write row (count != 0, no read gate) with I = 1/(L*T) should
 * make (1b) zero and contribute correctly to the lookup identity.
 */
TEST_F(DatabusLookupRelationConsistency, CorrectInverseOnWriteRow)
{
    const auto parameters = RelationParameters<FF>::get_random();
    const auto& beta = parameters.beta;
    const auto& gamma = parameters.gamma;

    DatabusInputElements in{};
    in.q_busread = FF(0);
    in.q_l = FF(0);
    in.q_r = FF(0);
    in.q_o = FF(0);

    FF value = FF(42);
    FF index = FF(5);
    in.databus_id = index;
    in.calldata = value;
    in.w_l = FF(0);
    in.w_r = FF(0);

    auto lookup_term = in.w_l + in.w_r * beta + gamma;
    auto table_term = value + index * beta + gamma;

    // Correct inverse
    in.calldata_inverses = (lookup_term * table_term).invert();
    in.calldata_read_counts = FF(3);

    in.secondary_calldata_read_counts = FF(0);
    in.secondary_calldata_inverses = FF(0);
    in.return_data_read_counts = FF(0);
    in.return_data_inverses = FF(0);

    std::array<FF, NUM_SUBRELATIONS> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));

    // (1a) zero: is_read = 0
    EXPECT_EQ(accumulator[0], FF(0));

    // (1b) zero: (1 - 1) * 3 = 0
    EXPECT_EQ(accumulator[1], FF(0));

    // (2) lookup: (0*T - 3*L) * I = -3*L/(L*T) = -3/T
    FF expected_lookup = (FF(0) * table_term - FF(3) * lookup_term) * (lookup_term * table_term).invert();
    EXPECT_EQ(accumulator[2], expected_lookup);
    EXPECT_NE(accumulator[2], FF(0)); // nonzero contribution (balances across the full trace sum)
}

/**
 * @brief Regression: a row outside the calldata body with `calldata_read_counts > 0` is
 * rejected by the read-count locality subrelation.
 *
 * Without it, a row with `calldata_indicator = 0`, `databus_id = 0`,
 * `calldata = v_attack`, `calldata_read_counts = c` satisfies the inverse-correctness
 * and lookup subrelations, and its contribution to the summed lookup identity cancels
 * against `c` reads of `(v_attack, 0)`. The read-count locality subrelation
 * `(1 - calldata_indicator) * calldata_read_counts = 0` is the per-row check that
 * rejects this input directly.
 */
TEST_F(DatabusLookupRelationConsistency, ReadCountLocalityRejectsOutOfBodyReadCounts)
{
    const auto parameters = RelationParameters<FF>::get_random();
    const auto& beta = parameters.beta;
    const auto& gamma = parameters.gamma;

    // Out-of-body row (calldata_indicator = 0) with databus_id = 0 (matches body row 0).
    DatabusInputElements row{};
    row.databus_id = FF(0);
    row.calldata = FF(12345);
    row.calldata_read_counts = FF(7);
    row.calldata_indicator = FF(0);
    {
        const auto L = row.w_l + row.w_r * beta + gamma;
        const auto T = row.calldata + row.databus_id * beta + gamma;
        row.calldata_inverses = (L * T).invert();
    }

    std::array<FF, NUM_SUBRELATIONS> accumulator{};
    Relation::accumulate(accumulator, row, parameters, FF(1));

    // Other per-row subrelations all vanish (they don't catch this input):
    EXPECT_EQ(accumulator[0], FF(0)); // (1a) inverse correctness on read (is_read = 0)
    EXPECT_EQ(accumulator[1], FF(0)); // (1b) inverse correctness on write (I*L*T = 1)
    // accumulator[2] is the per-row part of the linearly-dependent lookup identity.

    // Read-count locality (subrelation 3 of bus column 0): (1 - 0) * 7 = 7 != 0.
    EXPECT_EQ(accumulator[3], row.calldata_read_counts);
    EXPECT_NE(accumulator[3], FF(0));
}
