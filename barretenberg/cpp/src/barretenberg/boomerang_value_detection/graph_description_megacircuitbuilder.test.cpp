#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/databus/databus.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

#include <algorithm>
#include <array>
#include <cstdint>
#include <unordered_map>
#include <unordered_set>

using namespace bb;
using namespace cdg;

using Builder = MegaCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using databus_ct = stdlib::databus<Builder>;

namespace {
auto& engine = numeric::get_debug_randomness();

bb::fr high_entropy_value(uint64_t offset)
{
    return bb::fr((uint256_t(0x0f1e2d3c4b5a6978ULL + offset) << 192) +
                  (uint256_t(0x8877665544332211ULL + offset) << 128) +
                  (uint256_t(0x1020304050607080ULL + offset) << 64) + uint256_t(0xabcdef1234567890ULL + offset));
}

void constrain_witness_in_add_gate(Builder& builder, uint32_t witness_idx, const bb::fr& witness_value, uint64_t offset)
{
    const auto other_value = high_entropy_value(offset);
    const uint32_t other_idx = builder.add_variable(other_value);
    const uint32_t sum_idx = builder.add_variable(witness_value + other_value);
    builder.create_big_add_gate(
        { witness_idx, other_idx, sum_idx, builder.zero_idx(), fr(1), fr(1), fr(-1), fr(0), fr(0) });
}
} // namespace
namespace bb {

TEST(BoomerangMegaCircuitBuilder, BasicCircuit)
{
    MegaCircuitBuilder builder = MegaCircuitBuilder();
    fr a = fr::one();
    builder.add_public_variable(a);

    for (size_t i = 0; i < 16; ++i) {
        for (size_t j = 0; j < 16; ++j) {
            uint64_t left = static_cast<uint64_t>(j);
            uint64_t right = static_cast<uint64_t>(i);
            uint32_t left_idx = builder.add_variable(fr(left));
            uint32_t right_idx = builder.add_variable(fr(right));
            uint32_t result_idx = builder.add_variable(fr(left ^ right));

            uint32_t add_idx = builder.add_variable(fr(left) + fr(right) + builder.get_variable(result_idx));
            builder.create_big_add_gate(
                { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }
    }

    // Compute a simple point accumulation natively
    auto P1 = g1::affine_element::random_element();
    auto P2 = g1::affine_element::random_element();
    auto z = fr::random_element();

    builder.queue_ecc_add_accum(P1);
    builder.queue_ecc_mul_accum(P2, z);
    builder.queue_ecc_eq();

    auto tool = MegaStaticAnalyzer(builder);
    auto connected_components = tool.find_connected_components();
    EXPECT_EQ(connected_components.size(), 257);
    for (size_t i = 0; i < connected_components.size(); i++) {
        if (connected_components[i].size() != 4) {
            EXPECT_EQ(connected_components[i].size(), 18);
        }
    }
    auto variables_in_one_gate = tool.get_variables_in_one_gate();
}

/**
 * @brief Check that the ultra ops are recorded correctly in the EccOpQueue
 *
 */
TEST(BoomerangMegaCircuitBuilder, OnlyGoblinEccOpQueueUltraOps)
{
    // Construct a simple circuit with op gates
    auto builder = MegaCircuitBuilder();

    // Compute a simple point accumulation natively
    auto P1 = g1::affine_element::random_element();
    auto P2 = g1::affine_element::random_element();
    auto z = fr::random_element();

    // Add gates corresponding to the above operations
    builder.queue_ecc_add_accum(P1);
    builder.queue_ecc_mul_accum(P2, z);
    builder.queue_ecc_eq();

    auto tool = MegaStaticAnalyzer(builder);
    auto cc = tool.find_connected_components();
    EXPECT_EQ(cc.size(), 1);
}

TEST(BoomerangMegaCircuitBuilder, EccDuplicateFilterKeepsReusedPoint)
{
    auto builder = MegaCircuitBuilder();

    auto point = g1::affine_element::random_element();
    builder.queue_ecc_add_accum(point);
    builder.queue_ecc_add_accum(point);
    builder.queue_ecc_eq();

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();

    constexpr size_t CHUNK_SIZE = 2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;
    uint256_t x(point.x);
    auto x_lo = fr(x.slice(0, CHUNK_SIZE));
    auto x_hi = fr(x.slice(CHUNK_SIZE, CHUNK_SIZE * 2));

    const auto& duplicates = analyzer.get_witness_duplicate_map();
    EXPECT_TRUE(duplicates.contains(x_lo));
    EXPECT_TRUE(duplicates.contains(x_hi));
}

TEST(BoomerangMegaCircuitBuilder, EccDuplicateFilterSuppressesNegatedPoint)
{
    auto builder = MegaCircuitBuilder();

    auto point = g1::affine_element::random_element();
    auto negated_point = g1::affine_element(-g1::element(point));
    builder.queue_ecc_add_accum(point);
    builder.queue_ecc_add_accum(negated_point);
    builder.queue_ecc_eq();

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();

    constexpr size_t CHUNK_SIZE = 2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;
    uint256_t x(point.x);
    auto x_lo = fr(x.slice(0, CHUNK_SIZE));
    auto x_hi = fr(x.slice(CHUNK_SIZE, CHUNK_SIZE * 2));

    const auto& duplicates = analyzer.get_witness_duplicate_map();
    EXPECT_FALSE(duplicates.contains(x_lo));
    EXPECT_FALSE(duplicates.contains(x_hi));
}

// The ecc-negation filter must only suppress the x-coordinate limbs that actually belong to the negated point in the
// ecc_op block. A genuinely under-constrained pair living elsewhere in the circuit that happens to hold the same field
// value must remain visible; suppressing it by value alone hides a real boomerang.
TEST(BoomerangMegaCircuitBuilder, EccNegationFilterKeepsUnrelatedCollidingValue)
{
    auto builder = MegaCircuitBuilder();

    auto point = g1::affine_element::random_element();
    auto negated_point = g1::affine_element(-g1::element(point));
    builder.queue_ecc_add_accum(point);
    builder.queue_ecc_add_accum(negated_point);
    builder.queue_ecc_eq();

    constexpr size_t CHUNK_SIZE = 2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;
    uint256_t x(point.x);
    auto x_lo = fr(x.slice(0, CHUNK_SIZE));

    // Two independent witnesses that coincidentally equal the negated point's x_lo limb, each tied into its own
    // arithmetic gate so nothing forces them equal to each other.
    const uint32_t a = builder.add_variable(x_lo);
    const uint32_t b = builder.add_variable(x_lo);
    constrain_witness_in_add_gate(builder, a, x_lo, 1);
    constrain_witness_in_add_gate(builder, b, x_lo, 2);

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();

    const auto& duplicates = analyzer.get_witness_duplicate_map();
    EXPECT_TRUE(duplicates.contains(x_lo));
}

// The producer tags each point limb (x_lo, x_hi, y_lo, y_hi) of every non-random ecc op with an ECC_OP_TABLE key
// derived from the op's opcode, serialization-slot index, and limb slot. The limb slot keeps unequal limbs apart.
TEST(BoomerangMegaCircuitBuilder, EccProvenanceTagsTablePointLimbs)
{
    auto builder = MegaCircuitBuilder();

    auto point = g1::affine_element::random_element();
    builder.queue_ecc_add_accum(point);
    builder.queue_ecc_eq();

    std::unordered_map<DuplicateProvenance, std::unordered_set<bb::fr>, DuplicateProvenanceHasher> values_by_key;
    for (const auto& [real_idx, key] : builder.get_duplicate_provenance()) {
        if (duplicate_provenance_category(key) == DuplicateProvenanceCategory::ECC_OP_TABLE) {
            values_by_key[key].insert(builder.get_variable(real_idx));
        }
    }
    // One ADD op + one EQ op, each tagging four point limbs with four distinct limb keys.
    EXPECT_EQ(values_by_key.size(), 8U);
    for (const auto& [key, values] : values_by_key) {
        EXPECT_EQ(values.size(), 1U);
    }
}

// Soundness: the serialization-slot identity and limb slot make every op limb a distinct provenance group. A point and
// its negation share the same x-coordinate value, but they live at different op slots and therefore receive DISTINCT
// keys, so the provenance overlay never groups their x-limbs together. Equality of two value-coincident ecc-op limbs is
// never asserted by the producer -- only the still-live legacy ecc-negation filter suppresses that case in Phase 1.
TEST(BoomerangMegaCircuitBuilder, EccProvenanceKeepsDistinctSlotsSharingValue)
{
    auto builder = MegaCircuitBuilder();

    auto point = g1::affine_element::random_element();
    auto negated_point = g1::affine_element(-g1::element(point));
    builder.queue_ecc_add_accum(point);
    builder.queue_ecc_add_accum(negated_point);
    builder.queue_ecc_eq();

    std::unordered_set<DuplicateProvenance, DuplicateProvenanceHasher> ecc_op_table_keys;
    for (const auto& [real_idx, key] : builder.get_duplicate_provenance()) {
        if (duplicate_provenance_category(key) == DuplicateProvenanceCategory::ECC_OP_TABLE) {
            ecc_op_table_keys.insert(key);
        }
    }
    // Three ops (ADD, ADD, EQ) * four limb slots -> twelve distinct keys; the two ADDs sharing an x-coordinate value
    // are not placed into one provenance group.
    EXPECT_EQ(ecc_op_table_keys.size(), 12U);
}

TEST(BoomerangMegaCircuitBuilder, PoseidonDuplicateFilterKeepsDistinctInputHashIntermediates)
{
    auto builder = MegaCircuitBuilder();

    auto left_value = fr::random_element(&engine);
    auto right_value = fr::random_element(&engine);

    auto left_a = field_ct(witness_ct(&builder, left_value));
    auto right_a = field_ct(witness_ct(&builder, right_value));
    auto left_b = field_ct(witness_ct(&builder, left_value));
    auto right_b = field_ct(witness_ct(&builder, right_value));

    [[maybe_unused]] auto result_a = stdlib::poseidon2<Builder>::hash({ left_a, right_a });
    [[maybe_unused]] auto result_b = stdlib::poseidon2<Builder>::hash({ left_b, right_b });

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map({ left_value, right_value });

    EXPECT_FALSE(analyzer.get_witness_duplicate_map().empty());
}

TEST(BoomerangMegaCircuitBuilder, PoseidonDuplicateFilterKeepsRepeatedInputs)
{
    auto builder = MegaCircuitBuilder();

    auto repeated_value = fr::random_element(&engine);
    auto left_a = field_ct(witness_ct(&builder, repeated_value));
    auto right_a = field_ct(witness_ct(&builder, fr::random_element(&engine)));
    auto left_b = field_ct(witness_ct(&builder, repeated_value));
    auto right_b = field_ct(witness_ct(&builder, fr::random_element(&engine)));

    [[maybe_unused]] auto result_a = stdlib::poseidon2<Builder>::hash({ left_a, right_a });
    [[maybe_unused]] auto result_b = stdlib::poseidon2<Builder>::hash({ left_b, right_b });

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();

    const auto& duplicates = analyzer.get_witness_duplicate_map();
    EXPECT_TRUE(duplicates.contains(repeated_value));
}

// The producer tags every round intermediate of a permutation with a POSEIDON2_PERMUTATION key derived from the
// identity of its four input-state witnesses and the exact generated state slot. Permuting the SAME input witnesses
// twice yields matching keys for corresponding slots, so the deterministic duplicates are suppressed without grouping
// unequal slots inside one permutation.
TEST(BoomerangMegaCircuitBuilder, PoseidonProvenanceSuppressesRepeatedPermutationIntermediates)
{
    auto builder = MegaCircuitBuilder();

    std::array<field_ct, 4> state = { field_ct(witness_ct(&builder, fr::random_element(&engine))),
                                      field_ct(witness_ct(&builder, fr::random_element(&engine))),
                                      field_ct(witness_ct(&builder, fr::random_element(&engine))),
                                      field_ct(witness_ct(&builder, fr::random_element(&engine))) };

    [[maybe_unused]] auto result_a = stdlib::Poseidon2Permutation<Builder>::permutation(&builder, state);
    [[maybe_unused]] auto result_b = stdlib::Poseidon2Permutation<Builder>::permutation(&builder, state);

    std::unordered_map<DuplicateProvenance, std::unordered_set<bb::fr>, DuplicateProvenanceHasher> values_by_key;
    std::unordered_map<DuplicateProvenance, size_t, DuplicateProvenanceHasher> count_by_key;
    for (const auto& [real_idx, key] : builder.get_duplicate_provenance()) {
        if (duplicate_provenance_category(key) == DuplicateProvenanceCategory::POSEIDON2_PERMUTATION) {
            values_by_key[key].insert(builder.get_variable(real_idx));
            count_by_key[key]++;
        }
    }
    EXPECT_FALSE(values_by_key.empty());
    EXPECT_TRUE(
        std::any_of(count_by_key.begin(), count_by_key.end(), [](const auto& entry) { return entry.second >= 2; }));
    for (const auto& [key, values] : values_by_key) {
        EXPECT_EQ(values.size(), 1U);
    }

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().empty());
}

TEST(BoomerangMegaCircuitBuilder, PoseidonProvenanceUsesNestedInputProvenance)
{
    auto builder = MegaCircuitBuilder();

    const auto source_idx = builder.add_variable(fr(uint64_t(0x1234)));
    const auto first_limbs = builder.create_limbed_range_constraint(source_idx, 16, 4);
    const auto second_limbs = builder.create_limbed_range_constraint(source_idx, 16, 4);

    std::array<field_ct, 4> first_state = { field_ct::from_witness_index(&builder, first_limbs[0]),
                                            field_ct::from_witness_index(&builder, first_limbs[1]),
                                            field_ct::from_witness_index(&builder, first_limbs[2]),
                                            field_ct::from_witness_index(&builder, first_limbs[3]) };
    std::array<field_ct, 4> second_state = { field_ct::from_witness_index(&builder, second_limbs[0]),
                                             field_ct::from_witness_index(&builder, second_limbs[1]),
                                             field_ct::from_witness_index(&builder, second_limbs[2]),
                                             field_ct::from_witness_index(&builder, second_limbs[3]) };

    [[maybe_unused]] auto result_a = stdlib::Poseidon2Permutation<Builder>::permutation(&builder, first_state);
    [[maybe_unused]] auto result_b = stdlib::Poseidon2Permutation<Builder>::permutation(&builder, second_state);

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map({}, cdg::WitnessDuplicateFilterMode::TRIAGE_VALUE_FILTERS);
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().empty());
}

TEST(BoomerangMegaCircuitBuilder, PoseidonProvenanceKeepsDistinctInputWitnessesSharingValue)
{
    auto builder = MegaCircuitBuilder();

    auto left_value = fr::random_element(&engine);
    auto right_value = fr::random_element(&engine);

    auto left_a = field_ct(witness_ct(&builder, left_value));
    auto right_a = field_ct(witness_ct(&builder, right_value));
    auto left_b = field_ct(witness_ct(&builder, left_value));
    auto right_b = field_ct(witness_ct(&builder, right_value));

    [[maybe_unused]] auto result_a = stdlib::poseidon2<Builder>::hash({ left_a, right_a });
    [[maybe_unused]] auto result_b = stdlib::poseidon2<Builder>::hash({ left_b, right_b });

    std::unordered_set<DuplicateProvenance, DuplicateProvenanceHasher> poseidon2_keys;
    for (const auto& [real_idx, key] : builder.get_duplicate_provenance()) {
        if (duplicate_provenance_category(key) == DuplicateProvenanceCategory::POSEIDON2_PERMUTATION) {
            poseidon2_keys.insert(key);
        }
    }
    // Distinct input witnesses produce distinct permutation-instance keys -> value-coincident intermediates are not
    // grouped together by provenance.
    EXPECT_GE(poseidon2_keys.size(), 2U);

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().empty());
}

TEST(BoomerangMegaCircuitBuilder, DatabusDuplicateFilterKeepsDistinctSameValuedIndexWitnessReads)
{
    auto builder = MegaCircuitBuilder();
    const auto databus_value = high_entropy_value(1);

    databus_ct databus;
    databus.kernel_calldata.set_values({
        field_ct(witness_ct(&builder, databus_value)),
        field_ct(witness_ct(&builder, high_entropy_value(2))),
    });

    field_ct first_index(witness_ct(&builder, uint64_t(0)));
    field_ct second_index(witness_ct(&builder, uint64_t(0)));
    EXPECT_EQ(databus.kernel_calldata[first_index].get_value(), databus_value);
    EXPECT_EQ(databus.kernel_calldata[second_index].get_value(), databus_value);

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(databus_value));
}

TEST(BoomerangMegaCircuitBuilder, DatabusDuplicateFilterKeepsSameIndexWitnessReadSourcePair)
{
    auto builder = MegaCircuitBuilder();
    const auto databus_value = high_entropy_value(1);

    databus_ct databus;
    databus.kernel_calldata.set_values({
        field_ct(witness_ct(&builder, databus_value)),
        field_ct(witness_ct(&builder, high_entropy_value(2))),
    });

    field_ct index(witness_ct(&builder, uint64_t(0)));
    EXPECT_EQ(databus.kernel_calldata[index].get_value(), databus_value);
    EXPECT_EQ(databus.kernel_calldata[index].get_value(), databus_value);

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(databus_value));
}

TEST(BoomerangMegaCircuitBuilder, DatabusDuplicateFilterKeepsVariableIndexBusEntryReadPair)
{
    auto builder = MegaCircuitBuilder();
    const auto databus_value = high_entropy_value(3);
    auto bus_entry = field_ct(witness_ct(&builder, databus_value));

    databus_ct databus;
    databus.kernel_calldata.set_values({
        bus_entry,
        field_ct(witness_ct(&builder, high_entropy_value(4))),
    });

    constrain_witness_in_add_gate(builder, bus_entry.get_witness_index(), databus_value, 5);

    field_ct index(witness_ct(&builder, uint64_t(0)));
    EXPECT_EQ(databus.kernel_calldata[index].get_value(), databus_value);

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(databus_value));
}

TEST(BoomerangMegaCircuitBuilder, DatabusDuplicateFilterSuppressesConstantIndexBusEntryReadPair)
{
    auto builder = MegaCircuitBuilder();
    const auto databus_value = high_entropy_value(3);
    auto bus_entry = field_ct(witness_ct(&builder, databus_value));

    databus_ct databus;
    databus.kernel_calldata.set_values({
        bus_entry,
        field_ct(witness_ct(&builder, high_entropy_value(4))),
    });

    constrain_witness_in_add_gate(builder, bus_entry.get_witness_index(), databus_value, 5);

    field_ct index(&builder, bb::fr(0));
    EXPECT_EQ(databus.kernel_calldata[index].get_value(), databus_value);

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(databus_value));
}

TEST(BoomerangMegaCircuitBuilder, DatabusDuplicateFilterKeepsWrongBusSlotSourceReadPair)
{
    auto builder = MegaCircuitBuilder();
    const auto databus_value = high_entropy_value(6);
    auto first_bus_entry = field_ct(witness_ct(&builder, databus_value));
    auto second_bus_entry = field_ct(witness_ct(&builder, databus_value));

    databus_ct databus;
    databus.kernel_calldata.set_values({
        first_bus_entry,
        second_bus_entry,
    });

    constrain_witness_in_add_gate(builder, first_bus_entry.get_witness_index(), databus_value, 7);

    field_ct index(witness_ct(&builder, uint64_t(1)));
    EXPECT_EQ(databus.kernel_calldata[index].get_value(), databus_value);

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(databus_value));
}

TEST(BoomerangMegaCircuitBuilder, DatabusDuplicateFilterKeepsDistinctBusSlots)
{
    auto builder = MegaCircuitBuilder();
    const auto databus_value = high_entropy_value(8);

    databus_ct databus;
    databus.kernel_calldata.set_values({
        field_ct(witness_ct(&builder, databus_value)),
        field_ct(witness_ct(&builder, databus_value)),
    });

    field_ct first_index(witness_ct(&builder, uint64_t(0)));
    field_ct second_index(witness_ct(&builder, uint64_t(1)));
    EXPECT_EQ(databus.kernel_calldata[first_index].get_value(), databus_value);
    EXPECT_EQ(databus.kernel_calldata[second_index].get_value(), databus_value);

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(databus_value));
}

TEST(BoomerangMegaCircuitBuilder, DatabusDuplicateFilterKeepsReinsertedBusValue)
{
    auto builder = MegaCircuitBuilder();
    const auto databus_value = high_entropy_value(9);

    databus_ct databus;
    databus.kernel_calldata.set_values({
        field_ct(witness_ct(&builder, databus_value)),
        field_ct(witness_ct(&builder, high_entropy_value(10))),
    });

    field_ct index(witness_ct(&builder, uint64_t(0)));
    EXPECT_EQ(databus.kernel_calldata[index].get_value(), databus_value);

    const uint32_t reinserted_idx = builder.add_variable(databus_value);
    constrain_witness_in_add_gate(builder, reinserted_idx, databus_value, 11);

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map({ databus_value });
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(databus_value));
}

// The producer keys variable-index reads by index witness identity, not by the index's current value. Two distinct
// index witnesses that both currently equal zero are therefore kept visible.
TEST(BoomerangMegaCircuitBuilder, DatabusProvenanceKeepsDistinctSameValuedIndexWitnessReads)
{
    auto builder = MegaCircuitBuilder();
    const auto databus_value = high_entropy_value(12);

    databus_ct databus;
    databus.kernel_calldata.set_values({
        field_ct(witness_ct(&builder, databus_value)),
        field_ct(witness_ct(&builder, high_entropy_value(13))),
    });

    field_ct first_index(witness_ct(&builder, uint64_t(0)));
    field_ct second_index(witness_ct(&builder, uint64_t(0)));
    EXPECT_EQ(databus.kernel_calldata[first_index].get_value(), databus_value);
    EXPECT_EQ(databus.kernel_calldata[second_index].get_value(), databus_value);

    std::unordered_set<DuplicateProvenance, DuplicateProvenanceHasher> databus_keys;
    for (const auto& [real_idx, key] : builder.get_duplicate_provenance()) {
        if (duplicate_provenance_category(key) == DuplicateProvenanceCategory::DATABUS_READ) {
            databus_keys.insert(key);
        }
    }
    EXPECT_GE(databus_keys.size(), 3U);

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(databus_value));
}

TEST(BoomerangMegaCircuitBuilder, DatabusProvenanceKeepsSameIndexWitnessReadSourcePair)
{
    auto builder = MegaCircuitBuilder();
    const auto databus_value = high_entropy_value(12);

    databus_ct databus;
    databus.kernel_calldata.set_values({
        field_ct(witness_ct(&builder, databus_value)),
        field_ct(witness_ct(&builder, high_entropy_value(13))),
    });

    field_ct index(witness_ct(&builder, uint64_t(0)));
    EXPECT_EQ(databus.kernel_calldata[index].get_value(), databus_value);
    EXPECT_EQ(databus.kernel_calldata[index].get_value(), databus_value);

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(databus_value));
}

// Two reads of DIFFERENT bus slots that coincidentally share a value get DISTINCT provenance keys, so the duplicate is
// kept (not suppressed) -- the constraints do not force the two slots equal.
TEST(BoomerangMegaCircuitBuilder, DatabusProvenanceKeepsDistinctBusSlotsSharingValue)
{
    auto builder = MegaCircuitBuilder();
    const auto databus_value = high_entropy_value(14);

    databus_ct databus;
    databus.kernel_calldata.set_values({
        field_ct(witness_ct(&builder, databus_value)),
        field_ct(witness_ct(&builder, databus_value)),
    });

    field_ct first_index(witness_ct(&builder, uint64_t(0)));
    field_ct second_index(witness_ct(&builder, uint64_t(1)));
    EXPECT_EQ(databus.kernel_calldata[first_index].get_value(), databus_value);
    EXPECT_EQ(databus.kernel_calldata[second_index].get_value(), databus_value);

    std::unordered_set<DuplicateProvenance, DuplicateProvenanceHasher> databus_keys;
    for (const auto& [real_idx, key] : builder.get_duplicate_provenance()) {
        if (duplicate_provenance_category(key) == DuplicateProvenanceCategory::DATABUS_READ) {
            databus_keys.insert(key);
        }
    }
    EXPECT_GE(databus_keys.size(), 4U);

    auto analyzer = MegaStaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(databus_value));
}
} // namespace bb
