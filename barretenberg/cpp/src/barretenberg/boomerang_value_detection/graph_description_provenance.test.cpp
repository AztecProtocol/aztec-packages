#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/stdlib/primitives/group/straus_lookup_table.hpp"
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"
#include "barretenberg/stdlib_circuit_builders/duplicate_provenance.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>
#include <unordered_map>
#include <unordered_set>

using namespace bb;
using namespace cdg;

namespace {
using StrausBuilder = bb::UltraCircuitBuilder;
using StrausCycleGroup = bb::stdlib::cycle_group<StrausBuilder>;
using StrausField = bb::stdlib::field_t<StrausBuilder>;
using StrausElement = StrausCycleGroup::Element;
using LookupBuilder = bb::UltraCircuitBuilder;
using LookupField = bb::stdlib::field_t<LookupBuilder>;

// Collect the distinct MSM_TABLE provenance keys and, for each, the set of distinct real variable indices tagged with
// it. Returns {number of distinct keys, max number of distinct real variables sharing any single key}.
std::pair<size_t, size_t> msm_table_provenance_stats(const StrausBuilder& builder)
{
    std::unordered_map<bb::DuplicateProvenance, std::unordered_set<uint32_t>, bb::DuplicateProvenanceHasher> by_key;
    for (const auto& [real_index, key] : builder.get_duplicate_provenance()) {
        if (bb::duplicate_provenance_category(key) == bb::DuplicateProvenanceCategory::MSM_TABLE) {
            by_key[key].insert(real_index);
        }
    }
    size_t max_group = 0;
    for (const auto& [key, reals] : by_key) {
        max_group = std::max(max_group, reals.size());
    }
    return { by_key.size(), max_group };
}

std::pair<size_t, size_t> lookup_table_provenance_stats(const LookupBuilder& builder)
{
    std::unordered_map<bb::DuplicateProvenance, std::unordered_set<uint32_t>, bb::DuplicateProvenanceHasher> by_key;
    for (const auto& [real_index, key] : builder.get_duplicate_provenance()) {
        if (bb::duplicate_provenance_category(key) == bb::DuplicateProvenanceCategory::LOOKUP_TABLE) {
            by_key[key].insert(real_index);
        }
    }
    size_t max_group = 0;
    for (const auto& [key, reals] : by_key) {
        max_group = std::max(max_group, reals.size());
    }
    return { by_key.size(), max_group };
}

std::pair<size_t, size_t> range_decomposition_provenance_stats(const LookupBuilder& builder)
{
    std::unordered_map<bb::DuplicateProvenance, std::unordered_set<uint32_t>, bb::DuplicateProvenanceHasher> by_key;
    for (const auto& [real_index, key] : builder.get_duplicate_provenance()) {
        if (bb::duplicate_provenance_category(key) == bb::DuplicateProvenanceCategory::RANGE_DECOMPOSITION) {
            by_key[key].insert(real_index);
        }
    }
    size_t max_group = 0;
    for (const auto& [key, reals] : by_key) {
        max_group = std::max(max_group, reals.size());
    }
    return { by_key.size(), max_group };
}
} // namespace

TEST(boomerang_duplicate_provenance, assert_equal_preserves_provenance_on_canonical_real_index)
{
    LookupBuilder builder;

    const auto canonical_idx = builder.add_variable(fr(uint64_t(5)));
    const auto tagged_idx = builder.add_variable(fr(uint64_t(5)));
    const auto key = LookupBuilder::make_duplicate_provenance(bb::DuplicateProvenanceCategory::LOOKUP_TABLE, 7);
    builder.tag_duplicate_provenance(tagged_idx, key);

    builder.assert_equal(canonical_idx, tagged_idx);

    const auto canonical_real_index = builder.real_variable_index[canonical_idx];
    EXPECT_EQ(builder.real_variable_index[tagged_idx], canonical_real_index);
    auto provenance_it = builder.get_duplicate_provenance().find(canonical_real_index);
    ASSERT_NE(provenance_it, builder.get_duplicate_provenance().end());
    EXPECT_EQ(provenance_it->second, key);
}

TEST(boomerang_duplicate_provenance, assert_equal_merges_distinct_provenance_groups)
{
    LookupBuilder builder;

    const auto a_idx = builder.add_variable(fr(uint64_t(5)));
    const auto a_peer_idx = builder.add_variable(fr(uint64_t(5)));
    const auto b_idx = builder.add_variable(fr(uint64_t(5)));
    const auto b_peer_idx = builder.add_variable(fr(uint64_t(5)));
    const auto a_key = LookupBuilder::make_duplicate_provenance(bb::DuplicateProvenanceCategory::LOOKUP_TABLE, 7);
    const auto b_key = LookupBuilder::make_duplicate_provenance(bb::DuplicateProvenanceCategory::LOOKUP_TABLE, 11);
    builder.tag_duplicate_provenance(a_idx, a_key);
    builder.tag_duplicate_provenance(a_peer_idx, a_key);
    builder.tag_duplicate_provenance(b_idx, b_key);
    builder.tag_duplicate_provenance(b_peer_idx, b_key);

    builder.assert_equal(a_idx, b_idx);

    const auto canonical_real_index = builder.real_variable_index[a_idx];
    EXPECT_EQ(builder.real_variable_index[b_idx], canonical_real_index);
    EXPECT_EQ(builder.get_duplicate_provenance().at(canonical_real_index), a_key);
    EXPECT_EQ(builder.get_duplicate_provenance().at(builder.real_variable_index[a_peer_idx]), a_key);
    EXPECT_EQ(builder.get_duplicate_provenance().at(builder.real_variable_index[b_peer_idx]), a_key);
}

TEST(boomerang_duplicate_provenance, cryptographic_binding_same_role_does_not_suppress_duplicates)
{
    LookupBuilder builder;

    const auto repeated_value = fr((uint256_t(0x123456789abcdef0ULL) << 64) + uint256_t(0xfedcba9876543210ULL));
    const auto balancing_value = -(repeated_value + repeated_value);
    const auto left_idx = builder.add_variable(repeated_value);
    const auto right_idx = builder.add_variable(repeated_value);
    const auto balancing_idx = builder.add_variable(balancing_value);
    builder.create_big_add_gate(
        { left_idx, right_idx, balancing_idx, builder.zero_idx(), fr(1), fr(1), fr(1), fr(0), fr(0) });

    const auto key = LookupBuilder::make_duplicate_provenance(
        DuplicateProvenanceCategory::POSEIDON2_CRYPTOGRAPHIC_BINDING,
        batch_merge_ecc_op_hash_binding_local_id(DuplicateCryptographicBindingRole::RUNNING_HASH, { 7 }));
    builder.tag_duplicate_provenance(left_idx, key);
    builder.tag_duplicate_provenance(right_idx, key);

    StaticAnalyzer analyzer = StaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(repeated_value));
}

TEST(boomerang_duplicate_provenance, cryptographic_binding_matching_roles_suppresses_duplicates)
{
    LookupBuilder builder;

    const auto repeated_value = fr((uint256_t(0x23456789abcdef0ULL) << 64) + uint256_t(0x123456789abcdef0ULL));
    const auto balancing_value = -(repeated_value + repeated_value);
    const auto left_idx = builder.add_variable(repeated_value);
    const auto right_idx = builder.add_variable(repeated_value);
    const auto balancing_idx = builder.add_variable(balancing_value);
    builder.create_big_add_gate(
        { left_idx, right_idx, balancing_idx, builder.zero_idx(), fr(1), fr(1), fr(1), fr(0), fr(0) });

    const auto running_key = LookupBuilder::make_duplicate_provenance(
        DuplicateProvenanceCategory::POSEIDON2_CRYPTOGRAPHIC_BINDING,
        batch_merge_ecc_op_hash_binding_local_id(DuplicateCryptographicBindingRole::RUNNING_HASH, { 11 }));
    const auto transcript_key = LookupBuilder::make_duplicate_provenance(
        DuplicateProvenanceCategory::POSEIDON2_CRYPTOGRAPHIC_BINDING,
        batch_merge_ecc_op_hash_binding_local_id(DuplicateCryptographicBindingRole::TRANSCRIPT_HASH, { 11 }));
    builder.tag_duplicate_provenance(left_idx, running_key);
    builder.tag_duplicate_provenance(right_idx, transcript_key);

    StaticAnalyzer analyzer = StaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(repeated_value));
}

TEST(boomerang_range_decomposition_provenance, repeated_decomposition_of_same_witness_is_grouped)
{
    LookupBuilder builder;

    const auto source_idx = builder.add_variable(fr(uint64_t(0x1234)));
    builder.create_limbed_range_constraint(source_idx, 16, 4);
    builder.create_limbed_range_constraint(source_idx, 16, 4);

    const auto [num_keys, max_group] = range_decomposition_provenance_stats(builder);
    EXPECT_GT(num_keys, 0U);
    EXPECT_GE(max_group, 2U);
}

TEST(boomerang_range_decomposition_provenance, distinct_same_valued_witnesses_are_not_grouped)
{
    LookupBuilder builder;

    const auto source_a_idx = builder.add_variable(fr(uint64_t(0x1234)));
    const auto source_b_idx = builder.add_variable(fr(uint64_t(0x1234)));
    builder.create_limbed_range_constraint(source_a_idx, 16, 4);
    builder.create_limbed_range_constraint(source_b_idx, 16, 4);

    const auto [num_keys, max_group] = range_decomposition_provenance_stats(builder);
    EXPECT_GT(num_keys, 0U);
    EXPECT_EQ(max_group, 1U);
}

TEST(boomerang_lookup_table_provenance, repeated_lookup_with_range_derived_key_is_grouped)
{
    LookupBuilder builder;

    const auto source_idx = builder.add_variable(fr(uint64_t(0x1237)));
    const auto first_limbs = builder.create_limbed_range_constraint(source_idx, 16, 4);
    const auto second_limbs = builder.create_limbed_range_constraint(source_idx, 16, 4);
    auto first_key = LookupField::from_witness_index(&builder, first_limbs[0]);
    auto second_key = LookupField::from_witness_index(&builder, second_limbs[0]);

    const auto first = bb::stdlib::plookup_read<LookupBuilder>::get_lookup_accumulators(
        plookup::MultiTableId::FIXED_BASE_LEFT_LO, first_key);
    const auto second = bb::stdlib::plookup_read<LookupBuilder>::get_lookup_accumulators(
        plookup::MultiTableId::FIXED_BASE_LEFT_LO, second_key);

    EXPECT_EQ(first[plookup::ColumnIdx::C2][0].get_value(), second[plookup::ColumnIdx::C2][0].get_value());

    const auto [num_keys, max_group] = lookup_table_provenance_stats(builder);
    EXPECT_GT(num_keys, 0U);
    EXPECT_GE(max_group, 2U);

    StaticAnalyzer analyzer = StaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(first[plookup::ColumnIdx::C2][0].get_value()));
}

TEST(boomerang_lookup_table_provenance, repeated_lookup_with_same_key_witness_is_grouped)
{
    LookupBuilder builder;

    const auto key_value = fr(uint64_t(7));
    auto key = LookupField::from_witness(&builder, key_value);

    const auto first = bb::stdlib::plookup_read<LookupBuilder>::get_lookup_accumulators(
        plookup::MultiTableId::FIXED_BASE_LEFT_LO, key);
    const auto second = bb::stdlib::plookup_read<LookupBuilder>::get_lookup_accumulators(
        plookup::MultiTableId::FIXED_BASE_LEFT_LO, key);

    EXPECT_EQ(first[plookup::ColumnIdx::C2][0].get_value(), second[plookup::ColumnIdx::C2][0].get_value());

    const auto key_real_index = builder.real_variable_index[key.get_raw_witness_index()];
    EXPECT_FALSE(builder.get_duplicate_provenance().contains(key_real_index));

    const auto [num_keys, max_group] = lookup_table_provenance_stats(builder);
    EXPECT_GT(num_keys, 0U);
    EXPECT_GE(max_group, 2U);

    StaticAnalyzer analyzer = StaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(first[plookup::ColumnIdx::C2][0].get_value()));
}

TEST(boomerang_lookup_table_provenance, lookups_with_distinct_same_valued_key_witnesses_are_not_grouped)
{
    LookupBuilder builder;

    const auto key_value = fr(uint64_t(7));
    auto key_a = LookupField::from_witness(&builder, key_value);
    auto key_b = LookupField::from_witness(&builder, key_value);

    const auto first = bb::stdlib::plookup_read<LookupBuilder>::get_lookup_accumulators(
        plookup::MultiTableId::FIXED_BASE_LEFT_LO, key_a);
    const auto second = bb::stdlib::plookup_read<LookupBuilder>::get_lookup_accumulators(
        plookup::MultiTableId::FIXED_BASE_LEFT_LO, key_b);

    EXPECT_EQ(first[plookup::ColumnIdx::C2][0].get_value(), second[plookup::ColumnIdx::C2][0].get_value());

    const auto [num_keys, max_group] = lookup_table_provenance_stats(builder);
    EXPECT_GT(num_keys, 0U);
    EXPECT_EQ(max_group, 1U);

    StaticAnalyzer analyzer = StaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(first[plookup::ColumnIdx::C2][0].get_value()));
}

/**
 * @brief Positive: reading the SAME ROM-backed Straus table at the SAME index witness twice shares a provenance group.
 *
 * @details straus_lookup_table::read materializes fresh (x, y) coordinate witnesses via a ROM read of array `rom_id`.
 * The ROM consistency argument ties each read to the concrete table cell selected by its index. The producer tags the
 * read outputs with an MSM_TABLE key based on the shared index witness identity, so the two fresh read outputs share
 * one key per coordinate. Those duplicates are deterministic and suppressed by the analyzer.
 */
TEST(boomerang_msm_table_provenance, repeated_read_of_same_table_and_index_is_grouped)
{
    StrausBuilder builder;

    auto base_point_native = StrausElement::random_element();
    auto offset_gen_native = StrausElement::random_element();
    auto base_point = StrausCycleGroup::from_witness(&builder, base_point_native);
    auto offset_gen = StrausCycleGroup::from_witness(&builder, offset_gen_native);

    const size_t table_bits = 4;
    bb::stdlib::straus_lookup_table<StrausBuilder> table(&builder, base_point, offset_gen, table_bits);

    // A single index witness, read twice from the same table instance: both reads are forced equal to ROM[index].
    auto index = StrausField::from_witness(&builder, StrausField::native(3));
    table.read(index);
    table.read(index);

    const auto [num_keys, max_group] = msm_table_provenance_stats(builder);
    EXPECT_GT(num_keys, 0U);
    // The x outputs of the two reads share one key; the y outputs share another. Each such group holds two distinct
    // real variables (one per read).
    EXPECT_GE(max_group, 2U);
}

/**
 * @brief Reads at distinct index witnesses selecting the same current slot do not share provenance.
 *
 * @details The index witnesses are independent even though their current values match, so the read outputs are not
 * constraint-forced equal by the ROM relation.
 */
TEST(boomerang_msm_table_provenance, reads_at_distinct_index_witnesses_sharing_value_are_not_grouped)
{
    StrausBuilder builder;

    auto base_point_native = StrausElement::random_element();
    auto offset_gen_native = StrausElement::random_element();
    auto base_point = StrausCycleGroup::from_witness(&builder, base_point_native);
    auto offset_gen = StrausCycleGroup::from_witness(&builder, offset_gen_native);

    const size_t table_bits = 4;
    bb::stdlib::straus_lookup_table<StrausBuilder> table(&builder, base_point, offset_gen, table_bits);

    // Two independent index witnesses holding the SAME value but distinct real variables.
    auto index_a = StrausField::from_witness(&builder, StrausField::native(3));
    auto index_b = StrausField::from_witness(&builder, StrausField::native(3));
    table.read(index_a);
    table.read(index_b);

    const auto [num_keys, max_group] = msm_table_provenance_stats(builder);
    EXPECT_GT(num_keys, 0U);
    EXPECT_EQ(max_group, 1U);
}

/**
 * @brief A full variable-base batch_mul over a ROM-backed Straus table tags MSM_TABLE provenance on its reads.
 *
 * @details Exercises the production read path (cycle_group::batch_mul -> straus_lookup_table::read) end to end and
 * asserts the producer attaches MSM_TABLE keys to the selected table slots and read outputs.
 */
TEST(boomerang_msm_table_provenance, variable_base_batch_mul_tags_table_reads)
{
    StrausBuilder builder;

    auto point_native = StrausElement::random_element();
    auto scalar_native = StrausCycleGroup::Curve::ScalarField::random_element();

    std::vector<StrausCycleGroup> points;
    std::vector<StrausCycleGroup::cycle_scalar> scalars;
    points.emplace_back(StrausCycleGroup::from_witness(&builder, point_native));
    scalars.emplace_back(StrausCycleGroup::cycle_scalar::from_witness(&builder, scalar_native));

    StrausCycleGroup::batch_mul(points, scalars);

    const auto [num_keys, max_group] = msm_table_provenance_stats(builder);
    EXPECT_GT(num_keys, 0U);
}

/**
 * @brief Positive: adding the SAME two input points twice shares a provenance group on the outputs.
 *
 * @details The ecc_add gate constrains the output (x3, y3) to be the unique sum of the two input points. Two additions
 * of the same input witnesses (by affine identity) are therefore constraint-forced equal, so the producer tags both
 * outputs with the same MSM_TABLE key: one key holds two distinct real variables (the two x3 outputs), another holds
 * the two y3 outputs.
 */
TEST(boomerang_msm_table_provenance, repeated_add_of_same_points_is_grouped)
{
    StrausBuilder builder;

    auto lhs = StrausCycleGroup::from_witness(&builder, StrausElement::random_element());
    auto rhs = StrausCycleGroup::from_witness(&builder, StrausElement::random_element());

    // Two unconditional adds of the SAME input witnesses (copies preserve the underlying witness indices).
    lhs.unconditional_add(rhs);
    lhs.unconditional_add(rhs);

    const auto [num_keys, max_group] = msm_table_provenance_stats(builder);
    EXPECT_GT(num_keys, 0U);
    EXPECT_GE(max_group, 2U);
}

/**
 * @brief Negative: adding two pairs of DISTINCT input witnesses holding the same point values is NOT grouped.
 *
 * @details The producer keys on the affine identity (real variable index + affine constants) of the input
 * coordinates, not on their values, so two adds whose inputs are different real variables -- even if those variables
 * hold the same point -- receive distinct MSM_TABLE keys and their value-coincident outputs are never grouped together.
 */
TEST(boomerang_msm_table_provenance, add_of_distinct_witnesses_sharing_value_is_kept)
{
    StrausBuilder builder;

    auto lhs_native = StrausElement::random_element();
    auto rhs_native = StrausElement::random_element();

    // Two independent constructions of the SAME points -> distinct witnesses.
    auto lhs_a = StrausCycleGroup::from_witness(&builder, lhs_native);
    auto rhs_a = StrausCycleGroup::from_witness(&builder, rhs_native);
    auto lhs_b = StrausCycleGroup::from_witness(&builder, lhs_native);
    auto rhs_b = StrausCycleGroup::from_witness(&builder, rhs_native);

    lhs_a.unconditional_add(rhs_a);
    lhs_b.unconditional_add(rhs_b);

    const auto [num_keys, max_group] = msm_table_provenance_stats(builder);
    EXPECT_GT(num_keys, 0U);
    EXPECT_EQ(max_group, 1U);
}

/**
 * @brief Doubling a witness point tags its output with an MSM_TABLE key, soundly and conservatively.
 *
 * @details The ecc_dbl gate constrains the output to be the unique double of the input (x1, y1) where
 * y1 = conditional_assign(is_point_at_infinity(), 1, _y). For a point built via from_witness the infinity flag is a
 * (non-constant) witness, so each dbl() re-derives a FRESH y1 = madd(...) witness. The two doublings therefore feed
 * the gate distinct y1 witnesses and are NOT constraint-forced equal at the gate input, so the producer correctly
 * keys them differently (it includes y1's affine identity) and does NOT group their outputs. This is the sound,
 * conservative outcome: grouping fires only when the input identities -- including the infinity-derived y1 -- match,
 * which is the case for the constant-infinity lookup-table points the MSM doubling path actually operates on. Here we
 * only assert that the dbl output carries an MSM_TABLE tag.
 */
TEST(boomerang_msm_table_provenance, dbl_tags_output_provenance)
{
    StrausBuilder builder;

    auto point = StrausCycleGroup::from_witness(&builder, StrausElement::random_element());

    point.dbl();

    const auto [num_keys, max_group] = msm_table_provenance_stats(builder);
    EXPECT_GT(num_keys, 0U);
}

/**
 * @brief Positive: two straus tables built from the SAME base point and offset generator share cell provenance.
 *
 * @details Each ROM cell point_table[i] is the unique output of the deterministic add-chain
 * offset_generator + i * base_point. Two tables built from the same base/offset witnesses (by affine identity) have
 * constraint-forced equal cells at every slot, so the producer tags matching cells with the same MSM_TABLE key.
 */
TEST(boomerang_msm_table_provenance, tables_from_same_base_point_share_cell_groups)
{
    StrausBuilder builder;

    auto base_point = StrausCycleGroup::from_witness(&builder, StrausElement::random_element());
    auto offset_gen = StrausCycleGroup::from_witness(&builder, StrausElement::random_element());

    const size_t table_bits = 4;
    bb::stdlib::straus_lookup_table<StrausBuilder> table_a(&builder, base_point, offset_gen, table_bits);
    bb::stdlib::straus_lookup_table<StrausBuilder> table_b(&builder, base_point, offset_gen, table_bits);

    const auto [num_keys, max_group] = msm_table_provenance_stats(builder);
    EXPECT_GT(num_keys, 0U);
    // Each slot's x cells of the two tables share a key (and likewise y), so some key holds >= 2 distinct reals.
    EXPECT_GE(max_group, 2U);
}

/**
 * @brief Negative: two tables built from DISTINCT base-point witnesses sharing values keep their cells separate.
 *
 * @details Keyed on the affine identity of the base/offset coordinates, not their values, so two tables built from
 * independent witnesses (even holding the same points) receive distinct per-table cell keys.
 */
TEST(boomerang_msm_table_provenance, tables_from_distinct_base_witnesses_sharing_value_are_kept)
{
    StrausBuilder builder;

    auto base_native = StrausElement::random_element();
    auto offset_native = StrausElement::random_element();

    auto base_a = StrausCycleGroup::from_witness(&builder, base_native);
    auto offset_a = StrausCycleGroup::from_witness(&builder, offset_native);
    auto base_b = StrausCycleGroup::from_witness(&builder, base_native);
    auto offset_b = StrausCycleGroup::from_witness(&builder, offset_native);

    const size_t table_bits = 4;
    bb::stdlib::straus_lookup_table<StrausBuilder> table_a(&builder, base_a, offset_a, table_bits);
    bb::stdlib::straus_lookup_table<StrausBuilder> table_b(&builder, base_b, offset_b, table_bits);

    // Per-table cell keys are distinct across the two tables; no single cell key is shared.
    // (Within one table all cells are distinct points with distinct keys, so max_group stays 1 for cell keys.)
    std::unordered_map<bb::DuplicateProvenance, std::unordered_set<uint32_t>, bb::DuplicateProvenanceHasher> by_key;
    for (const auto& [real_index, key] : builder.get_duplicate_provenance()) {
        if (bb::duplicate_provenance_category(key) == bb::DuplicateProvenanceCategory::MSM_TABLE) {
            by_key[key].insert(real_index);
        }
    }
    EXPECT_GT(by_key.size(), 0U);
    for (const auto& [key, reals] : by_key) {
        EXPECT_EQ(reals.size(), 1U);
    }
}
