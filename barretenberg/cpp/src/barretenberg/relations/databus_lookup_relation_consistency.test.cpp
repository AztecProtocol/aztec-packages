/**
 * @file databus_lookup_relation_consistency.test.cpp
 * @brief Tests for DatabusLookupRelation to verify the relation arithmetic matches a simple reference implementation
 * @details Similar to ultra_relation_consistency.test.cpp, this test verifies that the optimized relation
 * implementation produces the same results as a simpler, more readable reference implementation.
 *
 * The DatabusLookupRelation implements a log-derivative lookup argument with 3 subrelations per bus column:
 * 1. Inverse correctness: I * read_term * write_term - inverse_exists = 0
 * 2. Log-derivative lookup: sum of (read_selector * write_term - read_count * read_term) * I = 0
 * 3. Read tag boolean check: read_tag * read_tag - read_tag = 0
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
    FF calldata_read_tags;
    FF calldata_inverses;

    // Secondary calldata (bus_idx = 1)
    FF secondary_calldata;
    FF secondary_calldata_read_counts;
    FF secondary_calldata_read_tags;
    FF secondary_calldata_inverses;

    // Return data (bus_idx = 2)
    FF return_data;
    FF return_data_read_counts;
    FF return_data_read_tags;
    FF return_data_inverses;

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
        result.calldata_read_tags = FF::random_element();
        result.calldata_inverses = FF::random_element();
        result.secondary_calldata = FF::random_element();
        result.secondary_calldata_read_counts = FF::random_element();
        result.secondary_calldata_read_tags = FF::random_element();
        result.secondary_calldata_inverses = FF::random_element();
        result.return_data = FF::random_element();
        result.return_data_read_counts = FF::random_element();
        result.return_data_read_tags = FF::random_element();
        result.return_data_inverses = FF::random_element();
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

        // Read counts and tags
        result.calldata_read_counts = FF(1);
        result.calldata_read_tags = FF(1);

        // Other columns inactive
        result.secondary_calldata_read_counts = FF(0);
        result.secondary_calldata_read_tags = FF(0);
        result.return_data_read_counts = FF(0);
        result.return_data_read_tags = FF(0);

        return result;
    }
};

class DatabusLookupRelationConsistency : public testing::Test {
  public:
    using Relation = DatabusLookupRelationImpl<FF>;
    static constexpr size_t NUM_SUBRELATIONS = 9; // 3 subrelations per bus column, 3 columns

    /**
     * @brief Validate that the relation's accumulate function produces expected values
     */
    static void validate_relation_execution(const std::array<FF, NUM_SUBRELATIONS>& expected_values,
                                            const DatabusInputElements& input_elements,
                                            const RelationParameters<FF>& parameters)
    {
        std::array<FF, NUM_SUBRELATIONS> accumulator;
        std::fill(accumulator.begin(), accumulator.end(), FF(0));
        Relation::accumulate(accumulator, input_elements, parameters, FF(1));
        EXPECT_EQ(accumulator, expected_values);
    }
};

/**
 * @brief Helper to compute all expected subrelation values for a given input
 */
static std::array<FF, 9> compute_expected_values(const DatabusInputElements& in, const RelationParameters<FF>& params)
{
    const auto& beta = params.beta;
    const auto& gamma = params.gamma;

    std::array<FF, 9> expected_values;
    std::fill(expected_values.begin(), expected_values.end(), FF(0));

    // Read term (same for all columns): value + index * beta + gamma
    auto read_term = in.w_l + in.w_r * beta + gamma;

    // Lambda to compute subrelations for a given bus column
    auto compute_column_subrelations =
        [&](size_t bus_idx, FF column_selector, FF bus_value, FF read_counts, FF read_tags, FF inverses) {
            auto is_read_gate = in.q_busread * column_selector;
            auto inverse_exists = is_read_gate + read_tags - is_read_gate * read_tags;
            auto write_term = bus_value + in.databus_id * beta + gamma;

            // Subrelation 1: Inverse correctness
            expected_values[bus_idx * 3] = read_term * write_term * inverses - inverse_exists;

            // Subrelation 2: Log-derivative lookup (no scaling factor since linearly dependent)
            expected_values[bus_idx * 3 + 1] = (is_read_gate * write_term - read_counts * read_term) * inverses;

            // Subrelation 3: Read tag boolean check
            expected_values[bus_idx * 3 + 2] = read_tags * read_tags - read_tags;
        };

    // Bus column 0 (calldata)
    compute_column_subrelations(
        0, in.q_l, in.calldata, in.calldata_read_counts, in.calldata_read_tags, in.calldata_inverses);

    // Bus column 1 (secondary_calldata)
    compute_column_subrelations(1,
                                in.q_r,
                                in.secondary_calldata,
                                in.secondary_calldata_read_counts,
                                in.secondary_calldata_read_tags,
                                in.secondary_calldata_inverses);

    // Bus column 2 (return_data)
    compute_column_subrelations(
        2, in.q_o, in.return_data, in.return_data_read_counts, in.return_data_read_tags, in.return_data_inverses);

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
 * @brief Test with boolean read tags (valid values)
 * @details When read_tag is 0 or 1, the boolean check subrelation should be 0
 */
TEST_F(DatabusLookupRelationConsistency, BooleanReadTagsPass)
{
    const auto parameters = RelationParameters<FF>::get_random();

    // Test with read_tag = 0
    {
        DatabusInputElements in = DatabusInputElements::get_random();
        in.calldata_read_tags = FF(0);
        in.secondary_calldata_read_tags = FF(0);
        in.return_data_read_tags = FF(0);

        std::array<FF, NUM_SUBRELATIONS> accumulator;
        std::fill(accumulator.begin(), accumulator.end(), FF(0));
        Relation::accumulate(accumulator, in, parameters, FF(1));

        // Boolean check subrelations should be 0
        EXPECT_EQ(accumulator[2], FF(0));
        EXPECT_EQ(accumulator[5], FF(0));
        EXPECT_EQ(accumulator[8], FF(0));
    }

    // Test with read_tag = 1
    {
        DatabusInputElements in = DatabusInputElements::get_random();
        in.calldata_read_tags = FF(1);
        in.secondary_calldata_read_tags = FF(1);
        in.return_data_read_tags = FF(1);

        std::array<FF, NUM_SUBRELATIONS> accumulator;
        std::fill(accumulator.begin(), accumulator.end(), FF(0));
        Relation::accumulate(accumulator, in, parameters, FF(1));

        // Boolean check subrelations should be 0 (1*1 - 1 = 0)
        EXPECT_EQ(accumulator[2], FF(0));
        EXPECT_EQ(accumulator[5], FF(0));
        EXPECT_EQ(accumulator[8], FF(0));
    }
}

/**
 * @brief Test with non-boolean read tags (invalid values)
 * @details When read_tag is not 0 or 1, the boolean check subrelation should be non-zero
 */
TEST_F(DatabusLookupRelationConsistency, NonBooleanReadTagsFail)
{
    const auto parameters = RelationParameters<FF>::get_random();

    DatabusInputElements in = DatabusInputElements::get_random();
    // Set non-boolean read tags
    in.calldata_read_tags = FF(2);
    in.secondary_calldata_read_tags = FF(5);
    in.return_data_read_tags = FF(100);

    std::array<FF, NUM_SUBRELATIONS> accumulator;
    std::fill(accumulator.begin(), accumulator.end(), FF(0));
    Relation::accumulate(accumulator, in, parameters, FF(1));

    // Boolean check subrelations should be non-zero
    // For tag=2: 2*2 - 2 = 2 != 0
    EXPECT_EQ(accumulator[2], FF(2));
    // For tag=5: 5*5 - 5 = 20 != 0
    EXPECT_EQ(accumulator[5], FF(20));
    // For tag=100: 100*100 - 100 = 9900 != 0
    EXPECT_EQ(accumulator[8], FF(9900));
}

/**
 * @brief Test that inactive gates (all selectors = 0) produce expected behavior
 */
TEST_F(DatabusLookupRelationConsistency, InactiveGates)
{
    const auto parameters = RelationParameters<FF>::get_random();

    DatabusInputElements in{};
    // All selectors and read tags are 0
    in.q_busread = FF(0);
    in.q_l = FF(0);
    in.q_r = FF(0);
    in.q_o = FF(0);
    in.calldata_read_tags = FF(0);
    in.secondary_calldata_read_tags = FF(0);
    in.return_data_read_tags = FF(0);
    in.calldata_read_counts = FF(0);
    in.secondary_calldata_read_counts = FF(0);
    in.return_data_read_counts = FF(0);

    // Set other values to something non-zero to ensure they don't affect inactive gates
    in.w_l = FF(42);
    in.w_r = FF(5);
    in.databus_id = FF(5);
    in.calldata = FF(42);
    in.calldata_inverses = FF(0); // inverse should be 0 when inactive

    std::array<FF, NUM_SUBRELATIONS> accumulator;
    std::fill(accumulator.begin(), accumulator.end(), FF(0));
    Relation::accumulate(accumulator, in, parameters, FF(1));

    // When inactive (is_read_gate=0, read_tag=0), inverse_exists=0
    // So inverse correctness becomes: 0 - 0 = 0
    EXPECT_EQ(accumulator[0], FF(0));
    EXPECT_EQ(accumulator[3], FF(0));
    EXPECT_EQ(accumulator[6], FF(0));

    // Lookup subrelation with inverses=0 should be 0
    EXPECT_EQ(accumulator[1], FF(0));
    EXPECT_EQ(accumulator[4], FF(0));
    EXPECT_EQ(accumulator[7], FF(0));

    // Boolean check with read_tag=0: 0*0 - 0 = 0
    EXPECT_EQ(accumulator[2], FF(0));
    EXPECT_EQ(accumulator[5], FF(0));
    EXPECT_EQ(accumulator[8], FF(0));
}

/**
 * @brief Test a valid read gate scenario where inverse is correctly computed
 * @details When the inverse is set correctly: I = 1/(read_term * write_term),
 * the inverse correctness subrelation should be zero (satisfied)
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
    auto read_term = value + index * beta + gamma;
    auto write_term = value + index * beta + gamma; // same since value and index match
    auto inverse = (read_term * write_term).invert();
    in.calldata_inverses = inverse;

    // Read tag = 1 (this row is being read)
    in.calldata_read_tags = FF(1);
    in.calldata_read_counts = FF(1);

    // Other columns inactive
    in.secondary_calldata_read_tags = FF(0);
    in.secondary_calldata_read_counts = FF(0);
    in.secondary_calldata_inverses = FF(0);
    in.return_data_read_tags = FF(0);
    in.return_data_read_counts = FF(0);
    in.return_data_inverses = FF(0);

    std::array<FF, NUM_SUBRELATIONS> accumulator;
    std::fill(accumulator.begin(), accumulator.end(), FF(0));
    Relation::accumulate(accumulator, in, parameters, FF(1));

    // Inverse correctness subrelation should be 0 (satisfied)
    // I * read_term * write_term - inverse_exists = 0
    // inverse * read_term * write_term = 1
    // inverse_exists = is_read_gate + read_tag - is_read_gate * read_tag = 1 + 1 - 1 = 1
    EXPECT_EQ(accumulator[0], FF(0));

    // Read tag boolean check should be 0 (tag = 1 is boolean)
    EXPECT_EQ(accumulator[2], FF(0));

    // Other columns should have 0 subrelations (inactive)
    EXPECT_EQ(accumulator[3], FF(0)); // secondary_calldata inverse correctness
    EXPECT_EQ(accumulator[5], FF(0)); // secondary_calldata boolean check
    EXPECT_EQ(accumulator[6], FF(0)); // return_data inverse correctness
    EXPECT_EQ(accumulator[8], FF(0)); // return_data boolean check
}

/**
 * @brief Test that when read_term != write_term, inverse correctness fails with wrong inverse
 * @details If the value in bus doesn't match what's being read, the relation should fail
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

    // Compute inverse based on read_term (which uses w_l, w_r) and write_term (which uses calldata)
    auto read_term = read_value + index * beta + gamma;
    auto write_term = bus_value + index * beta + gamma;
    // Even with "correct" inverse, the lookup will fail because terms don't match
    auto inverse = (read_term * write_term).invert();
    in.calldata_inverses = inverse;

    in.calldata_read_tags = FF(1);
    in.calldata_read_counts = FF(1);
    in.secondary_calldata_read_tags = FF(0);
    in.secondary_calldata_read_counts = FF(0);
    in.secondary_calldata_inverses = FF(0);
    in.return_data_read_tags = FF(0);
    in.return_data_read_counts = FF(0);
    in.return_data_inverses = FF(0);

    std::array<FF, NUM_SUBRELATIONS> accumulator;
    std::fill(accumulator.begin(), accumulator.end(), FF(0));
    Relation::accumulate(accumulator, in, parameters, FF(1));

    // Inverse correctness subrelation should still be 0 (inverse is computed correctly for these terms)
    EXPECT_EQ(accumulator[0], FF(0));

    // But the lookup subrelation (index 1) will be non-zero because read_term != write_term
    // This is where the soundness comes in - the sum across the trace won't be zero
    // For a single row: (read_selector * write_term - read_count * read_term) * inverse
    // = (1 * write_term - 1 * read_term) * inverse
    // = (write_term - read_term) * inverse != 0 when read_term != write_term
    FF expected_lookup = (write_term - read_term) * inverse;
    EXPECT_EQ(accumulator[1], expected_lookup);
    EXPECT_NE(accumulator[1], FF(0)); // Confirm it's non-zero
}
