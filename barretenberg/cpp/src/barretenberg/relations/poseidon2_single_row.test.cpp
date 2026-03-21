#include "barretenberg/relations/poseidon2_single_row.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/poseidon2_single_row_flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include <gtest/gtest.h>

namespace bb::test_poseidon2_single_row {

using FF = bb::fr;
using Params = crypto::Poseidon2Bn254ScalarFieldParams;
using Perm = crypto::Poseidon2Permutation<Params>;
using RelationImpl = Poseidon2SingleRowRelationImpl<FF>;
using Relation = Poseidon2SingleRowRelation<FF>;

/**
 * @brief Minimal AllEntities struct for testing the Poseidon2 single-row relation.
 * @details Contains the selector, wire inputs, and 348 witness columns needed to evaluate
 * one full Poseidon2 permutation in a single row.
 */
struct Poseidon2SingleRowAllValues {
    FF q_poseidon2_single_row;
    FF w_l, w_r, w_o, w_4;              // permutation inputs
    std::array<FF, 260> poseidon2_state; // 65 stages x 4 elements
    std::array<FF, 88> poseidon2_sq;     // S-box x^2 intermediates
};

/**
 * @brief Compute all witness values for one Poseidon2 permutation.
 * @details Mirrors the native permutation step-by-step, recording all
 * intermediate states and S-box x^2 values needed by the relation.
 */
Poseidon2SingleRowAllValues compute_witness(const std::array<FF, 4>& input)
{
    Poseidon2SingleRowAllValues values{};
    values.q_poseidon2_single_row = FF(1);

    // Set inputs in wire columns
    values.w_l = input[0];
    values.w_r = input[1];
    values.w_o = input[2];
    values.w_4 = input[3];

    // Working state
    std::array<FF, 4> state = input;

    // 1. Initial external matrix multiplication
    Perm::matrix_multiplication_external(state);
    for (size_t j = 0; j < 4; j++) {
        values.poseidon2_state[RelationImpl::state_idx(0, j)] = state[j];
    }

    // 2. First 4 external rounds (rounds 0-3)
    for (size_t r = 0; r < 4; r++) {
        // Add round constants, record x^2, apply S-box
        for (size_t j = 0; j < 4; j++) {
            auto s = state[j] + Params::round_constants[r][j];
            values.poseidon2_sq[RelationImpl::sq_idx(r, j)] = s * s;
            // S-box: x^5 = x^4 * x
            auto x2 = s.sqr();
            x2.self_sqr(); // x^4
            state[j] = x2 * s;
        }
        Perm::matrix_multiplication_external(state);
        for (size_t j = 0; j < 4; j++) {
            values.poseidon2_state[RelationImpl::state_idx(r + 1, j)] = state[j];
        }
    }

    // 3. 56 internal rounds (rounds 4-59)
    for (size_t r = 4; r < 60; r++) {
        // Add round constant to element 0, record x^2, apply S-box
        auto s0 = state[0] + Params::round_constants[r][0];
        values.poseidon2_sq[RelationImpl::sq_idx(r)] = s0 * s0;
        auto x2 = s0.sqr();
        x2.self_sqr();
        state[0] = x2 * s0;

        Perm::matrix_multiplication_internal(state);
        for (size_t j = 0; j < 4; j++) {
            values.poseidon2_state[RelationImpl::state_idx(r + 1, j)] = state[j];
        }
    }

    // 4. Last 4 external rounds (rounds 60-63)
    for (size_t r = 60; r < 64; r++) {
        for (size_t j = 0; j < 4; j++) {
            auto s = state[j] + Params::round_constants[r][j];
            values.poseidon2_sq[RelationImpl::sq_idx(r, j)] = s * s;
            auto x2 = s.sqr();
            x2.self_sqr();
            state[j] = x2 * s;
        }
        Perm::matrix_multiplication_external(state);
        for (size_t j = 0; j < 4; j++) {
            values.poseidon2_state[RelationImpl::state_idx(r + 1, j)] = state[j];
        }
    }

    return values;
}

/**
 * @brief Minimal circuit builder for single-row Poseidon2.
 * @details Each call to add_poseidon2_permutation() adds one row to the trace.
 * The output of the permutation is in poseidon2_state[stage=64].
 */
class Poseidon2SingleRowCircuitBuilder {
  public:
    struct Row {
        Poseidon2SingleRowAllValues values;
    };

    std::vector<Row> rows;

    /**
     * @brief Add a Poseidon2 permutation gate.
     * @return The 4-element output state of the permutation.
     */
    std::array<FF, 4> add_poseidon2_permutation(const std::array<FF, 4>& input)
    {
        Row row;
        row.values = compute_witness(input);
        rows.push_back(row);

        // Return the output (state at stage 64)
        std::array<FF, 4> output;
        for (size_t j = 0; j < 4; j++) {
            output[j] = row.values.poseidon2_state[RelationImpl::state_idx(64, j)];
        }
        return output;
    }

    size_t get_num_gates() const { return rows.size(); }

    /**
     * @brief Check that all relation constraints are satisfied at every row.
     */
    bool check_circuit() const
    {
        using Accumulator = typename Relation::SumcheckArrayOfValuesOverSubrelations;

        for (size_t row_idx = 0; row_idx < rows.size(); row_idx++) {
            Accumulator acc;
            std::fill(acc.begin(), acc.end(), FF(0));

            const auto params = RelationParameters<FF>::get_random();
            Relation::accumulate(acc, rows[row_idx].values, params, FF(1));

            for (size_t i = 0; i < acc.size(); i++) {
                if (!acc[i].is_zero()) {
                    info("Row ", row_idx, ", subrelation ", i, " failed");
                    return false;
                }
            }
        }
        return true;
    }
};

// ======================== Tests ========================

TEST(Poseidon2SingleRowRelation, OutputMatchesNative)
{
    // Verify that the witness computation produces output matching the native Poseidon2
    std::array<FF, 4> input = { FF(1), FF(2), FF(3), FF(4) };

    auto values = compute_witness(input);

    // Compute native permutation
    auto native_output = Perm::permutation(input);

    // Output is at state stage 64
    for (size_t j = 0; j < 4; j++) {
        EXPECT_EQ(values.poseidon2_state[RelationImpl::state_idx(64, j)], native_output[j])
            << "Output element " << j << " mismatch";
    }
}

TEST(Poseidon2SingleRowRelation, RelationSatisfied)
{
    // Single permutation with known input - verify all 348 subrelations are zero
    std::array<FF, 4> input = { FF(1), FF(2), FF(3), FF(4) };
    auto values = compute_witness(input);

    using Accumulator = typename Relation::SumcheckArrayOfValuesOverSubrelations;
    Accumulator acc;
    std::fill(acc.begin(), acc.end(), FF(0));

    const auto params = RelationParameters<FF>::get_random();
    Relation::accumulate(acc, values, params, FF(1));

    for (size_t i = 0; i < acc.size(); i++) {
        EXPECT_EQ(acc[i], FF(0)) << "Subrelation " << i << " failed";
    }
}

TEST(Poseidon2SingleRowRelation, RelationSatisfiedRandomInput)
{
    // Random input - verify all subrelations
    std::array<FF, 4> input;
    for (auto& x : input) {
        x = FF::random_element();
    }
    auto values = compute_witness(input);

    using Accumulator = typename Relation::SumcheckArrayOfValuesOverSubrelations;
    Accumulator acc;
    std::fill(acc.begin(), acc.end(), FF(0));

    const auto params = RelationParameters<FF>::get_random();
    Relation::accumulate(acc, values, params, FF(1));

    for (size_t i = 0; i < acc.size(); i++) {
        EXPECT_EQ(acc[i], FF(0)) << "Subrelation " << i << " failed";
    }
}

TEST(Poseidon2SingleRowRelation, SelectorDisabled)
{
    // When selector is 0, all constraints should trivially pass (accumulator stays zero)
    std::array<FF, 4> input = { FF(1), FF(2), FF(3), FF(4) };
    auto values = compute_witness(input);
    values.q_poseidon2_single_row = FF(0); // disable selector

    using Accumulator = typename Relation::SumcheckArrayOfValuesOverSubrelations;
    Accumulator acc;
    std::fill(acc.begin(), acc.end(), FF(0));

    // skip() should return true
    EXPECT_TRUE(Relation::skip(values));

    // accumulate with selector=0 should add nothing
    const auto params = RelationParameters<FF>::get_random();
    Relation::accumulate(acc, values, params, FF(1));

    for (size_t i = 0; i < acc.size(); i++) {
        EXPECT_EQ(acc[i], FF(0));
    }
}

TEST(Poseidon2SingleRowRelation, BadWitnessDetected)
{
    // Corrupt a witness value and verify the relation detects it
    std::array<FF, 4> input = { FF(5), FF(6), FF(7), FF(8) };
    auto values = compute_witness(input);

    // Corrupt one state value
    values.poseidon2_state[10] += FF(1);

    using Accumulator = typename Relation::SumcheckArrayOfValuesOverSubrelations;
    Accumulator acc;
    std::fill(acc.begin(), acc.end(), FF(0));

    const auto params = RelationParameters<FF>::get_random();
    Relation::accumulate(acc, values, params, FF(1));

    // At least one subrelation should be non-zero
    bool found_nonzero = false;
    for (size_t i = 0; i < acc.size(); i++) {
        if (!acc[i].is_zero()) {
            found_nonzero = true;
            break;
        }
    }
    EXPECT_TRUE(found_nonzero) << "Corrupted witness should fail at least one subrelation";
}

TEST(Poseidon2SingleRowRelation, TenHashesGateCount)
{
    // Evaluate 10 Poseidon2 hashes and verify gate count is ~10
    Poseidon2SingleRowCircuitBuilder builder;

    for (size_t h = 0; h < 10; h++) {
        std::array<FF, 4> input;
        for (auto& x : input) {
            x = FF::random_element();
        }

        auto output = builder.add_poseidon2_permutation(input);

        // Also verify output matches native
        auto native_output = Perm::permutation(input);
        for (size_t j = 0; j < 4; j++) {
            EXPECT_EQ(output[j], native_output[j]) << "Hash " << h << ", element " << j;
        }
    }

    // Gate count should be exactly 10 (one row per hash)
    EXPECT_EQ(builder.get_num_gates(), 10UL);

    // Verify all constraints are satisfied
    EXPECT_TRUE(builder.check_circuit());
}

TEST(Poseidon2SingleRowRelation, SubrelationCounts)
{
    // Verify our subrelation layout is correct
    EXPECT_EQ(RelationImpl::NUM_SUBRELATIONS, 348UL);
    EXPECT_EQ(RelationImpl::NUM_WITNESS, 348UL);
    EXPECT_EQ(RelationImpl::SUBRELATION_PARTIAL_LENGTHS.size(), 348UL);

    // All partial lengths are uniform (5) for simplified compile-time indexing
    for (auto len : RelationImpl::SUBRELATION_PARTIAL_LENGTHS) {
        EXPECT_EQ(len, 5UL);
    }
}

TEST(Poseidon2SingleRowRelation, FlavorEntityCounts)
{
    using Flavor = Poseidon2SingleRowFlavor;

    // Precomputed: Mega's 31 + 1 new selector = 32
    EXPECT_EQ(Flavor::NUM_PRECOMPUTED_ENTITIES, 32UL);

    // Witness: Mega's 24 (4 wires + 20 derived) + 348 Poseidon2 = 372
    EXPECT_EQ(Flavor::NUM_WITNESS_ENTITIES, 372UL);

    // Shifted: same as Mega (5)
    EXPECT_EQ(Flavor::NUM_SHIFTED_ENTITIES, 5UL);

    // Total unshifted = 32 + 372 = 404
    EXPECT_EQ(Flavor::NUM_UNSHIFTED_ENTITIES, 404UL);

    // Total = 404 + 5 = 409
    EXPECT_EQ(Flavor::NUM_ALL_ENTITIES, 409UL);

    // Relations: Mega's 11 - 2 old poseidon2 + 1 single-row = 10
    EXPECT_EQ(Flavor::NUM_RELATIONS, 10UL);

    // Subrelations: Mega's ~40 - 8 old poseidon2 + 348 single-row
    EXPECT_GT(Flavor::NUM_SUBRELATIONS, 348UL);

    // AllValues should be instantiable
    Flavor::AllValues values;
    values.q_poseidon2_single_row = FF(1);
    values.poseidon2_state[0] = FF(42);
    EXPECT_EQ(values.q_poseidon2_single_row, FF(1));
    EXPECT_EQ(values.poseidon2_state[0], FF(42));
}

TEST(Poseidon2SingleRowRelation, FlavorRelationCheck)
{
    // Verify the relation works through the flavor's AllValues type
    using Flavor = Poseidon2SingleRowFlavor;

    std::array<FF, 4> input = { FF::random_element(), FF::random_element(), FF::random_element(),
                                FF::random_element() };
    auto witness = compute_witness(input);

    // Create AllValues with zeros everywhere, then populate Poseidon2 columns
    Flavor::AllValues values{};
    values.q_poseidon2_single_row = witness.q_poseidon2_single_row;
    values.w_l = witness.w_l;
    values.w_r = witness.w_r;
    values.w_o = witness.w_o;
    values.w_4 = witness.w_4;
    values.poseidon2_state = witness.poseidon2_state;
    values.poseidon2_sq = witness.poseidon2_sq;

    // Check just the Poseidon2SingleRowRelation
    using P2Relation = Poseidon2SingleRowRelation<FF>;
    typename P2Relation::SumcheckArrayOfValuesOverSubrelations acc;
    std::fill(acc.begin(), acc.end(), FF(0));

    const auto params = RelationParameters<FF>::get_random();
    P2Relation::accumulate(acc, values, params, FF(1));

    for (size_t i = 0; i < acc.size(); i++) {
        EXPECT_EQ(acc[i], FF(0)) << "Subrelation " << i << " failed via Flavor AllValues";
    }
}

} // namespace bb::test_poseidon2_single_row
