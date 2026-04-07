#include "barretenberg/relations/poseidon2_single_row.hpp"
#include "barretenberg/relations/poseidon2_single_row_wire_zero.hpp"
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
 * @details Contains the selector, wire inputs, and 88 witness columns.
 */
struct Poseidon2SingleRowAllValues {
    FF q_poseidon2_single_row;
    FF w_l, w_r, w_o, w_4;              // permutation inputs
    std::array<FF, 88> poseidon2_state;  // 88 witness columns
};

/**
 * @brief Compute all 88 witness values for one Poseidon2 permutation.
 * @details Column layout:
 *   All columns store x^5 S-box output BEFORE matrix multiply:
 *   [0..15]:  x^5 outputs for external rounds 0-3 (4 per round, before M_E)
 *   [16..71]: x^5 output for internal rounds 4-59 (1 per round, before M_I)
 *   [72..87]: x^5 outputs for external rounds 60-63 (4 per round, before M_E)
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

    // 1. Initial external matrix multiplication (no columns)
    Perm::matrix_multiplication_external(state);

    // 2. First 4 external rounds (rounds 0-3) → columns [0..15] (x^5 before M_E)
    for (size_t r = 0; r < 4; r++) {
        for (size_t j = 0; j < 4; j++) {
            auto s = state[j] + Params::round_constants[r][j];
            auto x2 = s.sqr();
            x2.self_sqr();
            state[j] = x2 * s;
            values.poseidon2_state[r * 4 + j] = state[j];
        }
        Perm::matrix_multiplication_external(state);
    }

    // 3. 56 internal rounds (rounds 4-59) → columns [16..71] (x^5 before M_I)
    for (size_t r = 4; r < 60; r++) {
        auto s0 = state[0] + Params::round_constants[r][0];
        auto x2 = s0.sqr();
        x2.self_sqr();
        state[0] = x2 * s0;
        values.poseidon2_state[r - 4 + 16] = state[0];
        Perm::matrix_multiplication_internal(state);
    }

    // 4. Last 4 external rounds (rounds 60-63) → columns [72..87] (x^5 before M_E)
    for (size_t r = 60; r < 64; r++) {
        for (size_t j = 0; j < 4; j++) {
            auto s = state[j] + Params::round_constants[r][j];
            auto x2 = s.sqr();
            x2.self_sqr();
            state[j] = x2 * s;
            values.poseidon2_state[(r - 60) * 4 + 72 + j] = state[j];
        }
        Perm::matrix_multiplication_external(state);
    }

    return values;
}

/**
 * @brief Get the output of a permutation from the witness values.
 * @details Columns store x^5 before M_E. The output is M_E applied to the last round's x^5 values.
 */
std::array<FF, 4> get_output(const Poseidon2SingleRowAllValues& values)
{
    std::array<FF, 4> last_sbox = { values.poseidon2_state[84], values.poseidon2_state[85],
                                     values.poseidon2_state[86], values.poseidon2_state[87] };
    Perm::matrix_multiplication_external(last_sbox);
    return last_sbox;
}

/**
 * @brief Minimal circuit builder for single-row Poseidon2.
 */
class Poseidon2SingleRowCircuitBuilder {
  public:
    struct Row {
        Poseidon2SingleRowAllValues values;
    };

    std::vector<Row> rows;

    std::array<FF, 4> add_poseidon2_permutation(const std::array<FF, 4>& input)
    {
        Row row;
        row.values = compute_witness(input);
        rows.push_back(row);
        return get_output(row.values);
    }

    size_t get_num_gates() const { return rows.size(); }

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
    std::array<FF, 4> input = { FF(1), FF(2), FF(3), FF(4) };

    auto values = compute_witness(input);
    auto native_output = Perm::permutation(input);
    auto output = get_output(values);

    for (size_t j = 0; j < 4; j++) {
        EXPECT_EQ(output[j], native_output[j]) << "Output element " << j << " mismatch";
    }
}

TEST(Poseidon2SingleRowRelation, RelationSatisfied)
{
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

TEST(Poseidon2SingleRowRelation, SelectorDisabledZeroWires)
{
    // When q=0 and all wires/columns are zero, both relations are satisfied
    Poseidon2SingleRowAllValues values{};
    values.q_poseidon2_single_row = FF(0);

    // Main relation: skip returns true, accumulate produces zero
    EXPECT_TRUE(Relation::skip(values));
    {
        using Accumulator = typename Relation::SumcheckArrayOfValuesOverSubrelations;
        Accumulator acc;
        std::fill(acc.begin(), acc.end(), FF(0));
        const auto params = RelationParameters<FF>::get_random();
        Relation::accumulate(acc, values, params, FF(1));
        for (size_t i = 0; i < acc.size(); i++) {
            EXPECT_EQ(acc[i], FF(0)) << "Main relation subrelation " << i;
        }
    }

    // Wire-zero relation: satisfied since wires are zero
    {
        using WireZeroRelation = Poseidon2SingleRowWireZeroRelation<FF>;
        using Accumulator = typename WireZeroRelation::SumcheckArrayOfValuesOverSubrelations;
        Accumulator acc;
        std::fill(acc.begin(), acc.end(), FF(0));
        const auto params = RelationParameters<FF>::get_random();
        WireZeroRelation::accumulate(acc, values, params, FF(1));
        for (size_t i = 0; i < acc.size(); i++) {
            EXPECT_EQ(acc[i], FF(0)) << "Wire-zero subrelation " << i;
        }
    }
}

TEST(Poseidon2SingleRowRelation, WireZeroRelationActiveRow)
{
    // When q=1, wire-zero relation is skipped and (1-1)*w = 0
    std::array<FF, 4> input = { FF(1), FF(2), FF(3), FF(4) };
    auto values = compute_witness(input);

    using WireZeroRelation = Poseidon2SingleRowWireZeroRelation<FF>;
    EXPECT_TRUE(WireZeroRelation::skip(values));

    using Accumulator = typename WireZeroRelation::SumcheckArrayOfValuesOverSubrelations;
    Accumulator acc;
    std::fill(acc.begin(), acc.end(), FF(0));
    const auto params = RelationParameters<FF>::get_random();
    WireZeroRelation::accumulate(acc, values, params, FF(1));
    for (size_t i = 0; i < acc.size(); i++) {
        EXPECT_EQ(acc[i], FF(0));
    }
}

TEST(Poseidon2SingleRowRelation, WireZeroDetectsNonzeroWire)
{
    // When q=0 and a wire is nonzero, wire-zero relation fails
    Poseidon2SingleRowAllValues values{};
    values.q_poseidon2_single_row = FF(0);
    values.w_l = FF(42);

    using WireZeroRelation = Poseidon2SingleRowWireZeroRelation<FF>;
    using Accumulator = typename WireZeroRelation::SumcheckArrayOfValuesOverSubrelations;
    Accumulator acc;
    std::fill(acc.begin(), acc.end(), FF(0));
    const auto params = RelationParameters<FF>::get_random();
    WireZeroRelation::accumulate(acc, values, params, FF(1));

    EXPECT_NE(acc[0], FF(0)) << "Should detect nonzero w_l when q=0";
    EXPECT_EQ(acc[1], FF(0));
    EXPECT_EQ(acc[2], FF(0));
    EXPECT_EQ(acc[3], FF(0));
}

TEST(Poseidon2SingleRowRelation, BadWitnessDetected)
{
    std::array<FF, 4> input = { FF(5), FF(6), FF(7), FF(8) };
    auto values = compute_witness(input);

    // Corrupt one state value
    values.poseidon2_state[10] += FF(1);

    using Accumulator = typename Relation::SumcheckArrayOfValuesOverSubrelations;
    Accumulator acc;
    std::fill(acc.begin(), acc.end(), FF(0));

    const auto params = RelationParameters<FF>::get_random();
    Relation::accumulate(acc, values, params, FF(1));

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
    Poseidon2SingleRowCircuitBuilder builder;

    for (size_t h = 0; h < 10; h++) {
        std::array<FF, 4> input;
        for (auto& x : input) {
            x = FF::random_element();
        }

        auto output = builder.add_poseidon2_permutation(input);
        auto native_output = Perm::permutation(input);
        for (size_t j = 0; j < 4; j++) {
            EXPECT_EQ(output[j], native_output[j]) << "Hash " << h << ", element " << j;
        }
    }

    EXPECT_EQ(builder.get_num_gates(), 10UL);
    EXPECT_TRUE(builder.check_circuit());
}

TEST(Poseidon2SingleRowRelation, SubrelationCounts)
{
    EXPECT_EQ(RelationImpl::NUM_SUBRELATIONS, 88UL);
    EXPECT_EQ(RelationImpl::NUM_WITNESS, 88UL);
    EXPECT_EQ(RelationImpl::SUBRELATION_PARTIAL_LENGTHS.size(), 88UL);

    for (auto len : RelationImpl::SUBRELATION_PARTIAL_LENGTHS) {
        EXPECT_EQ(len, 6UL);
    }

    // Wire-zero relation: 4 subrelations, partial length 3
    using WireZeroImpl = Poseidon2SingleRowWireZeroRelationImpl<FF>;
    EXPECT_EQ(WireZeroImpl::NUM_SUBRELATIONS, 4UL);
    for (auto len : WireZeroImpl::SUBRELATION_PARTIAL_LENGTHS) {
        EXPECT_EQ(len, 3UL);
    }
}

TEST(Poseidon2SingleRowRelation, FlavorEntityCounts)
{
    using Flavor = Poseidon2SingleRowFlavor;

    // Precomputed: Mega's 31 + 1 new selector = 32
    EXPECT_EQ(Flavor::NUM_PRECOMPUTED_ENTITIES, 32UL);

    // Witness: 4 wires + 4 derived (z_perm, lookup_inverses, read_counts, read_tags) + 88 Poseidon2 = 96
    EXPECT_EQ(Flavor::NUM_WITNESS_ENTITIES, 96UL);

    // Shifted: 5 (w_l, w_r, w_o, w_4, z_perm)
    EXPECT_EQ(Flavor::NUM_SHIFTED_ENTITIES, 5UL);

    // Total unshifted = 32 + 96 = 128
    EXPECT_EQ(Flavor::NUM_UNSHIFTED_ENTITIES, 128UL);

    // Total = 128 + 5 = 133
    EXPECT_EQ(Flavor::NUM_ALL_ENTITIES, 133UL);

    // Relations: 7 Ultra + 1 Poseidon2SingleRow + 1 WireZero = 9
    EXPECT_EQ(Flavor::NUM_RELATIONS, 9UL);

    // Subrelations: Ultra ~32 + 88 single-row + 4 wire-zero
    EXPECT_GT(Flavor::NUM_SUBRELATIONS, 92UL);

    // AllValues should be instantiable
    Flavor::AllValues values;
    values.q_poseidon2_single_row = FF(1);
    values.poseidon2_state[0] = FF(42);
    EXPECT_EQ(values.q_poseidon2_single_row, FF(1));
    EXPECT_EQ(values.poseidon2_state[0], FF(42));
}

TEST(Poseidon2SingleRowRelation, FlavorRelationCheck)
{
    using Flavor = Poseidon2SingleRowFlavor;

    std::array<FF, 4> input = { FF::random_element(), FF::random_element(), FF::random_element(),
                                FF::random_element() };
    auto witness = compute_witness(input);

    Flavor::AllValues values{};
    values.q_poseidon2_single_row = witness.q_poseidon2_single_row;
    values.w_l = witness.w_l;
    values.w_r = witness.w_r;
    values.w_o = witness.w_o;
    values.w_4 = witness.w_4;
    values.poseidon2_state = witness.poseidon2_state;

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
