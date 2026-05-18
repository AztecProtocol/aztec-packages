/**
 * @file databus_lookup_relation_consistency.test.cpp
 * @brief Tests SingleBusLookupRelation arithmetic against a simple reference implementation.
 *
 * Each Mega bus column is its own SingleBusLookupRelation in the flavor's `Relations_<FF>` tuple,
 * and every instantiation has identical shape (4 subrelations, same algebraic identity, only the
 * EntityId template args differ). Testing one bus — kernel_calldata, with selector `q_l` — is
 * sufficient to cover the relation's behavior. The four subrelations being validated are:
 *
 *   1a  Inverse correctness on read rows:  (I·L·T − 1) · is_read = 0
 *   1b  Inverse correctness on write rows: (I·L·T − 1) · count   = 0
 *   2   Log-derivative lookup identity:    Σ_rows (is_read·T − count·L)·I = 0
 *   3   Read-count locality:               (1 − indicator) · count        = 0
 */
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/generated/mega_flavor_generated.hpp"
#include "barretenberg/relations/databus_lookup_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include <gtest/gtest.h>

using namespace bb;

using FF = fr;

using DatabusInputElements = MegaFlavor_Generated::AllEntities<FF>;
using AllEntities = DatabusInputElements;
using EntityId = DatabusInputElements::EntityId;

// The kernel_calldata bus relation. App-calldata and return-data buses are shape-identical and
// covered by symmetry — running the consistency suite once is enough.
using KernelCalldataRelation = SingleBusLookupRelationImpl<FF,
                                                           EntityId::kernel_calldata,
                                                           EntityId::kernel_calldata_read_counts,
                                                           EntityId::kernel_calldata_inverses,
                                                           EntityId::kernel_calldata_indicator,
                                                           EntityId::q_l>;

static DatabusInputElements get_random_databus_inputs()
{
    DatabusInputElements result;
    for (auto name : { EntityId::w_l,
                       EntityId::w_r,
                       EntityId::databus_id,
                       EntityId::q_busread,
                       EntityId::q_l,
                       EntityId::kernel_calldata,
                       EntityId::kernel_calldata_read_counts,
                       EntityId::kernel_calldata_inverses,
                       EntityId::kernel_calldata_indicator }) {
        result[name] = FF::random_element();
    }
    return result;
}

// A valid kernel_calldata read: read kernel_calldata[5] == 42 with q_l (the column's selector)
// and read-counts enabled.
static DatabusInputElements get_valid_calldata_read_inputs()
{
    DatabusInputElements result{};
    result[EntityId::w_l] = FF(42);
    result[EntityId::w_r] = FF(5);
    result[EntityId::databus_id] = FF(5);
    result[EntityId::kernel_calldata] = FF(42);
    result[EntityId::q_busread] = FF(1);
    result[EntityId::q_l] = FF(1);
    result[EntityId::kernel_calldata_read_counts] = FF(1);
    result[EntityId::kernel_calldata_indicator] = FF(1);
    return result;
}

class DatabusLookupRelationConsistency : public testing::Test {
  public:
    using Relation = KernelCalldataRelation;
    static constexpr size_t NUM_SUBRELATIONS = 4;

    static void validate_relation_execution(const std::array<FF, NUM_SUBRELATIONS>& expected_values,
                                            const DatabusInputElements& input_elements,
                                            const RelationParameters<FF>& parameters)
    {
        std::array<FF, NUM_SUBRELATIONS> accumulator{};
        Relation::accumulate(accumulator, input_elements, parameters, FF(1));
        EXPECT_EQ(accumulator, expected_values);
    }
};

/** Reference implementation: compute the four kernel_calldata subrelation values directly. */
static std::array<FF, 4> compute_expected_values(const DatabusInputElements& in, const RelationParameters<FF>& params)
{
    const auto& beta = params.beta;
    const auto& gamma = params.gamma;

    const auto lookup_term = in[EntityId::w_l] + in[EntityId::w_r] * beta + gamma;
    const auto column_selector = in[EntityId::q_l];
    const auto bus_value = in[EntityId::kernel_calldata];
    const auto read_counts = in[EntityId::kernel_calldata_read_counts];
    const auto inverses = in[EntityId::kernel_calldata_inverses];
    const auto indicator = in[EntityId::kernel_calldata_indicator];

    const auto is_read = in[EntityId::q_busread] * column_selector;
    const auto table_term = bus_value + in[EntityId::databus_id] * beta + gamma;
    const auto common = lookup_term * table_term * inverses - FF(1);

    return {
        common * is_read,                                              // (1a)
        common * read_counts,                                          // (1b)
        (is_read * table_term - read_counts * lookup_term) * inverses, // (2)  no scaling
        read_counts - indicator * read_counts,                         // (3)  (1 - ind) * count
    };
}

TEST_F(DatabusLookupRelationConsistency, RandomInputs)
{
    const auto run_test = [](bool random_inputs) {
        DatabusInputElements in = random_inputs ? get_random_databus_inputs() : get_valid_calldata_read_inputs();
        const auto parameters = RelationParameters<FF>::get_random();
        validate_relation_execution(compute_expected_values(in, parameters), in, parameters);
    };

    run_test(/*random_inputs=*/false);
    run_test(/*random_inputs=*/true);
}

/** Inactive gate (no read, no count) → all four subrelations vanish. */
TEST_F(DatabusLookupRelationConsistency, InactiveGates)
{
    const auto parameters = RelationParameters<FF>::get_random();

    DatabusInputElements in{};
    in[EntityId::q_busread] = FF(0);
    in[EntityId::q_l] = FF(0);
    in[EntityId::kernel_calldata_read_counts] = FF(0);
    // Set other values non-zero to confirm they don't leak into the subrelations.
    in[EntityId::w_l] = FF(42);
    in[EntityId::w_r] = FF(5);
    in[EntityId::databus_id] = FF(5);
    in[EntityId::kernel_calldata] = FF(42);
    in[EntityId::kernel_calldata_inverses] = FF(0);

    std::array<FF, 4> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));
    for (size_t i = 0; i < 4; i++) {
        EXPECT_EQ(accumulator[i], FF(0)) << "Subrelation " << i << " should be zero for inactive gates";
    }
}

/** Valid read with correct inverse: all per-row subrelations vanish; lookup identity is also zero
 *  here because L == T (the read's value/index match the table). */
TEST_F(DatabusLookupRelationConsistency, ValidInverseComputation)
{
    const auto parameters = RelationParameters<FF>::get_random();
    const auto& beta = parameters.beta;
    const auto& gamma = parameters.gamma;

    DatabusInputElements in{};
    in[EntityId::q_busread] = FF(1);
    in[EntityId::q_l] = FF(1);

    const FF value = FF(42);
    const FF index = FF(5);
    in[EntityId::w_l] = value;
    in[EntityId::w_r] = index;
    in[EntityId::databus_id] = index;
    in[EntityId::kernel_calldata] = value;

    const auto lookup_term = value + index * beta + gamma;
    const auto table_term = value + index * beta + gamma; // same; L == T.
    in[EntityId::kernel_calldata_inverses] = (lookup_term * table_term).invert();
    in[EntityId::kernel_calldata_read_counts] = FF(1);
    in[EntityId::kernel_calldata_indicator] = FF(1);
    std::array<FF, 4> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));

    EXPECT_EQ(accumulator[0], FF(0)); // (1a) (I·L·T − 1)·is_read = 0
    EXPECT_EQ(accumulator[1], FF(0)); // (1b) (I·L·T − 1)·count   = 0
    EXPECT_EQ(accumulator[2], FF(0)); // (2)  (T − L)·I = 0 since L == T
    EXPECT_EQ(accumulator[3], FF(0)); // (3)  (1 − indicator)·count = 0
}

/** Mismatched read/write terms: the per-row component of (2) becomes nonzero. */
TEST_F(DatabusLookupRelationConsistency, MismatchedReadWriteTerms)
{
    const auto parameters = RelationParameters<FF>::get_random();
    const auto& beta = parameters.beta;
    const auto& gamma = parameters.gamma;

    DatabusInputElements in{};
    in[EntityId::q_busread] = FF(1);
    in[EntityId::q_l] = FF(1);

    const FF read_value = FF(42);
    const FF bus_value = FF(100); // intentional mismatch
    const FF index = FF(5);
    in[EntityId::w_l] = read_value;
    in[EntityId::w_r] = index;
    in[EntityId::databus_id] = index;
    in[EntityId::kernel_calldata] = bus_value;

    const auto lookup_term = read_value + index * beta + gamma;
    const auto table_term = bus_value + index * beta + gamma;
    const auto inverse = (lookup_term * table_term).invert();
    in[EntityId::kernel_calldata_inverses] = inverse;
    in[EntityId::kernel_calldata_read_counts] = FF(1);
    in[EntityId::kernel_calldata_indicator] = FF(1);
    std::array<FF, 4> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));

    EXPECT_EQ(accumulator[0], FF(0));                                // (1a) I correct
    EXPECT_EQ(accumulator[1], FF(0));                                // (1b) I correct
    EXPECT_EQ(accumulator[2], (table_term - lookup_term) * inverse); // (2)  L != T
    EXPECT_EQ(accumulator[3], FF(0));                                // (3)  data row
    EXPECT_NE(accumulator[2], FF(0));
}

/** At inactive rows the inverse is unconstrained — set it to garbage and confirm no subrelation
 *  is affected. */
TEST_F(DatabusLookupRelationConsistency, InverseUnconstrainedAtInactiveRows)
{
    const auto parameters = RelationParameters<FF>::get_random();

    DatabusInputElements in{};
    in[EntityId::q_busread] = FF(0);
    in[EntityId::q_l] = FF(0);
    in[EntityId::kernel_calldata_read_counts] = FF(0);
    in[EntityId::kernel_calldata_inverses] = FF(999);
    in[EntityId::w_l] = FF(42);
    in[EntityId::w_r] = FF(5);
    in[EntityId::databus_id] = FF(5);
    in[EntityId::kernel_calldata] = FF(42);

    std::array<FF, 4> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));
    for (size_t i = 0; i < 4; i++) {
        EXPECT_EQ(accumulator[i], FF(0)) << "Subrelation " << i << " should be unaffected by garbage inverse";
    }
}

/** Nonzero read-count outside the bus's data rows → (3) fires. */
TEST_F(DatabusLookupRelationConsistency, ReadCountLocalityFailsOutsideDataRows)
{
    const auto parameters = RelationParameters<FF>::get_random();

    DatabusInputElements in{};
    in[EntityId::q_busread] = FF(0);
    in[EntityId::q_l] = FF(0);
    in[EntityId::kernel_calldata_read_counts] = FF(3);
    in[EntityId::kernel_calldata_indicator] = FF(0);

    std::array<FF, 4> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));

    EXPECT_EQ(accumulator[3], FF(3)); // (1 - indicator) * count
}

/** Wrong inverse on a read row → (1a) fires. */
TEST_F(DatabusLookupRelationConsistency, WrongInverseOnReadRowFails)
{
    const auto parameters = RelationParameters<FF>::get_random();
    const auto& beta = parameters.beta;
    const auto& gamma = parameters.gamma;

    DatabusInputElements in{};
    in[EntityId::q_busread] = FF(1);
    in[EntityId::q_l] = FF(1);

    const FF value = FF(42);
    const FF index = FF(5);
    in[EntityId::w_l] = value;
    in[EntityId::w_r] = index;
    in[EntityId::databus_id] = index;
    in[EntityId::kernel_calldata] = value;
    in[EntityId::kernel_calldata_inverses] = FF(777); // wrong
    in[EntityId::kernel_calldata_read_counts] = FF(0);

    const auto lookup_term = value + index * beta + gamma;
    const auto table_term = value + index * beta + gamma;

    std::array<FF, 4> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));

    EXPECT_EQ(accumulator[0], (FF(777) * lookup_term * table_term - FF(1)) * FF(1));
    EXPECT_NE(accumulator[0], FF(0));
    EXPECT_EQ(accumulator[1], FF(0));
}

/** Wrong inverse on a write row (count != 0, no read gate) → (1b) fires. */
TEST_F(DatabusLookupRelationConsistency, WrongInverseOnWriteRowFails)
{
    const auto parameters = RelationParameters<FF>::get_random();
    const auto& beta = parameters.beta;
    const auto& gamma = parameters.gamma;

    DatabusInputElements in{};
    in[EntityId::q_busread] = FF(0);
    in[EntityId::q_l] = FF(0);

    const FF value = FF(42);
    const FF index = FF(5);
    in[EntityId::databus_id] = index;
    in[EntityId::kernel_calldata] = value;
    in[EntityId::w_l] = FF(0);
    in[EntityId::w_r] = FF(0);
    in[EntityId::kernel_calldata_read_counts] = FF(3);
    in[EntityId::kernel_calldata_indicator] = FF(1);
    in[EntityId::kernel_calldata_inverses] = FF(999); // wrong
    const auto lookup_term = in[EntityId::w_l] + in[EntityId::w_r] * beta + gamma;
    const auto table_term = value + index * beta + gamma;

    std::array<FF, 4> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));

    EXPECT_EQ(accumulator[0], FF(0));
    EXPECT_EQ(accumulator[1], (FF(999) * lookup_term * table_term - FF(1)) * FF(3));
    EXPECT_EQ(accumulator[3], FF(0));
    EXPECT_NE(accumulator[1], FF(0));
}

/** Pure write row with correct inverse: (1a)/(1b) zero; (2) contributes nonzero per-row (the row
 *  sum cancels at the trace level). */
TEST_F(DatabusLookupRelationConsistency, CorrectInverseOnWriteRow)
{
    const auto parameters = RelationParameters<FF>::get_random();
    const auto& beta = parameters.beta;
    const auto& gamma = parameters.gamma;

    DatabusInputElements in{};
    in[EntityId::q_busread] = FF(0);
    in[EntityId::q_l] = FF(0);

    const FF value = FF(42);
    const FF index = FF(5);
    in[EntityId::databus_id] = index;
    in[EntityId::kernel_calldata] = value;
    in[EntityId::w_l] = FF(0);
    in[EntityId::w_r] = FF(0);

    const auto lookup_term = in[EntityId::w_l] + in[EntityId::w_r] * beta + gamma;
    const auto table_term = value + index * beta + gamma;
    in[EntityId::kernel_calldata_inverses] = (lookup_term * table_term).invert();
    in[EntityId::kernel_calldata_read_counts] = FF(3);
    in[EntityId::kernel_calldata_indicator] = FF(1);
    std::array<FF, 4> accumulator{};
    Relation::accumulate(accumulator, in, parameters, FF(1));

    EXPECT_EQ(accumulator[0], FF(0));
    EXPECT_EQ(accumulator[1], FF(0));
    EXPECT_EQ(accumulator[2], (FF(0) * table_term - FF(3) * lookup_term) * (lookup_term * table_term).invert());
    EXPECT_EQ(accumulator[3], FF(0));
    EXPECT_NE(accumulator[2], FF(0));
}
