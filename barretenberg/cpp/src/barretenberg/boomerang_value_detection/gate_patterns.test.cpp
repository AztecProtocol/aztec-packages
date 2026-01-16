/**
 * @file gate_patterns.test.cpp
 * @brief Verify gate patterns match actual relation constraints via perturbation testing.
 *
 * The key insight: A wire is constrained by a relation if and only if perturbing that wire
 * changes the relation's output. We test this empirically by:
 * 1. Evaluating the relation at a base point
 * 2. For each wire position, perturbing it and checking if the output changes
 * 3. Comparing the set of actually constrained wires with what the pattern claims
 */

#include "gate_patterns.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/relations/databus_lookup_relation.hpp"
#include "barretenberg/relations/delta_range_constraint_relation.hpp"
#include "barretenberg/relations/elliptic_relation.hpp"
#include "barretenberg/relations/logderiv_lookup_relation.hpp"
#include "barretenberg/relations/memory_relation.hpp"
#include "barretenberg/relations/non_native_field_relation.hpp"
#include "barretenberg/relations/poseidon2_external_relation.hpp"
#include "barretenberg/relations/poseidon2_internal_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include <gtest/gtest.h>
#include <set>

using namespace bb;
using namespace bb::gate_patterns;

using FF = fr;
using Entities = MegaFlavor::AllValues;

Entities get_random_entities()
{
    Entities entities;
    for (auto& field : entities.get_all()) {
        field = FF::random_element();
    }
    return entities;
}

FF& get_wire(Entities& entities, Wire wire)
{
    switch (wire) {
    case Wire::W_L:
        return entities.w_l;
    case Wire::W_R:
        return entities.w_r;
    case Wire::W_O:
        return entities.w_o;
    case Wire::W_4:
        return entities.w_4;
    case Wire::W_L_SHIFT:
        return entities.w_l_shift;
    case Wire::W_R_SHIFT:
        return entities.w_r_shift;
    case Wire::W_O_SHIFT:
        return entities.w_o_shift;
    case Wire::W_4_SHIFT:
        return entities.w_4_shift;
    }
    __builtin_unreachable();
}

Selectors build_selectors(const Entities& entities, int64_t gate_selector_value)
{
    return Selectors{
        .gate_selector = gate_selector_value,
        .q_m_nz = !entities.q_m.is_zero(),
        .q_1_nz = !entities.q_l.is_zero(),
        .q_2_nz = !entities.q_r.is_zero(),
        .q_3_nz = !entities.q_o.is_zero(),
        .q_4_nz = !entities.q_4.is_zero(),
        .q_c_nz = !entities.q_c.is_zero(),
    };
}

/**
 * @brief Get the set of wires that a pattern claims are constrained
 */
std::set<Wire> get_pattern_wires(const GatePattern& pattern, const Selectors& selectors)
{
    std::set<Wire> result;
    for (const auto& wire_spec : pattern.wires) {
        if (wire_spec.condition(selectors)) {
            result.insert(wire_spec.wire);
        }
    }
    return result;
}

/**
 * @brief Get the set of wires that actually affect a relation's output
 *
 * This is the ground truth: perturb each wire and see if the output changes.
 */
template <typename Relation>
std::set<Wire> get_actually_constrained_wires(const Entities& entities, const auto& parameters)
{
    std::set<Wire> constrained;

    // Evaluate relation at base point
    typename Relation::SumcheckArrayOfValuesOverSubrelations base_result{};
    Relation::accumulate(base_result, entities, parameters, FF(1));

    // For each wire position, perturb a copy and check if output changes
    for (Wire wire : { Wire::W_L,
                       Wire::W_R,
                       Wire::W_O,
                       Wire::W_4,
                       Wire::W_L_SHIFT,
                       Wire::W_R_SHIFT,
                       Wire::W_O_SHIFT,
                       Wire::W_4_SHIFT }) {
        Entities perturbed = entities;
        get_wire(perturbed, wire) += FF::random_element();

        typename Relation::SumcheckArrayOfValuesOverSubrelations perturbed_result{};
        Relation::accumulate(perturbed_result, perturbed, parameters, FF(1));

        if (base_result != perturbed_result) {
            constrained.insert(wire);
        }
    }

    return constrained;
}

/**
 * @brief Generic test: verify a pattern matches what the relation actually constrains
 */
template <typename Relation>
void verify_pattern(const GatePattern& pattern, int64_t gate_selector_value, auto configure_selectors)
{
    Entities entities = get_random_entities();
    configure_selectors(entities);

    Selectors selectors = build_selectors(entities, gate_selector_value);
    auto pattern_claims = get_pattern_wires(pattern, selectors);

    auto parameters = RelationParameters<FF>::get_random();
    auto actually_constrained = get_actually_constrained_wires<Relation>(entities, parameters);

    EXPECT_EQ(actually_constrained, pattern_claims);
}

// =============================================================================
// Pattern Tests
// =============================================================================

TEST(PatternTest, Arithmetic1)
{
    verify_pattern<ArithmeticRelation<FF>>(ARITHMETIC, 1, [](Entities& e) { e.q_arith = FF(1); });
}

TEST(PatternTest, Arithmetic2)
{
    verify_pattern<ArithmeticRelation<FF>>(ARITHMETIC, 2, [](Entities& e) { e.q_arith = FF(2); });
}

TEST(PatternTest, Arithmetic3)
{
    verify_pattern<ArithmeticRelation<FF>>(ARITHMETIC, 3, [](Entities& e) { e.q_arith = FF(3); });
}

TEST(PatternTest, Arithmetic3WithQmZero)
{
    verify_pattern<ArithmeticRelation<FF>>(ARITHMETIC, 3, [](Entities& e) {
        e.q_arith = FF(3);
        e.q_m = FF(0);
    });
}

TEST(PatternTest, EllipticAdd)
{
    verify_pattern<EllipticRelation<FF>>(ELLIPTIC, 1, [](Entities& e) {
        e.q_elliptic = FF(1);
        e.q_m = FF(0);
        e.q_l = FF(-1);
    });
}

TEST(PatternTest, EllipticDouble)
{
    verify_pattern<EllipticRelation<FF>>(ELLIPTIC, 1, [](Entities& e) {
        e.q_elliptic = FF(1);
        e.q_m = FF(1);
        e.q_l = FF(-1);
    });
}

TEST(PatternTest, DeltaRange)
{
    verify_pattern<DeltaRangeConstraintRelation<FF>>(DELTA_RANGE, 1, [](Entities& e) { e.q_delta_range = FF(1); });
}

TEST(PatternTest, NNFLimbAccum1)
{
    verify_pattern<NonNativeFieldRelation<FF>>(NON_NATIVE_FIELD, 1, [](Entities& e) {
        e.q_nnf = FF(1);
        e.q_r = FF(0);
        e.q_o = FF(1);
        e.q_4 = FF(1);
        e.q_m = FF(0);
    });
}

TEST(PatternTest, NNFLimbAccum2)
{
    verify_pattern<NonNativeFieldRelation<FF>>(NON_NATIVE_FIELD, 1, [](Entities& e) {
        e.q_nnf = FF(1);
        e.q_r = FF(0);
        e.q_o = FF(1);
        e.q_4 = FF(0);
        e.q_m = FF(1);
    });
}

TEST(PatternTest, NNFProduct1)
{
    verify_pattern<NonNativeFieldRelation<FF>>(NON_NATIVE_FIELD, 1, [](Entities& e) {
        e.q_nnf = FF(1);
        e.q_r = FF(1);
        e.q_o = FF(1);
        e.q_4 = FF(0);
        e.q_m = FF(0);
    });
}

TEST(PatternTest, NNFProduct2)
{
    verify_pattern<NonNativeFieldRelation<FF>>(NON_NATIVE_FIELD, 1, [](Entities& e) {
        e.q_nnf = FF(1);
        e.q_r = FF(1);
        e.q_o = FF(0);
        e.q_4 = FF(1);
        e.q_m = FF(0);
    });
}

TEST(PatternTest, NNFProduct3)
{
    verify_pattern<NonNativeFieldRelation<FF>>(NON_NATIVE_FIELD, 1, [](Entities& e) {
        e.q_nnf = FF(1);
        e.q_r = FF(1);
        e.q_o = FF(0);
        e.q_4 = FF(0);
        e.q_m = FF(1);
    });
}

TEST(PatternTest, MemoryRamRomAccess)
{
    verify_pattern<MemoryRelation<FF>>(MEMORY, 1, [](Entities& e) {
        e.q_memory = FF(1);
        e.q_l = FF(1);
        e.q_m = FF(1);
    });
}

TEST(PatternTest, MemoryRamTimestamp)
{
    verify_pattern<MemoryRelation<FF>>(MEMORY, 1, [](Entities& e) {
        e.q_memory = FF(1);
        e.q_l = FF(1);
        e.q_4 = FF(1);
    });
}

TEST(PatternTest, MemoryRomConsistency)
{
    verify_pattern<MemoryRelation<FF>>(MEMORY, 1, [](Entities& e) {
        e.q_memory = FF(1);
        e.q_l = FF(1);
        e.q_r = FF(1);
    });
}

TEST(PatternTest, MemoryRamConsistency)
{
    verify_pattern<MemoryRelation<FF>>(MEMORY, 1, [](Entities& e) {
        e.q_memory = FF(1);
        e.q_o = FF(1);
    });
}

TEST(PatternTest, Poseidon2Internal)
{
    verify_pattern<Poseidon2InternalRelation<FF>>(
        POSEIDON2_INTERNAL, 1, [](Entities& e) { e.q_poseidon2_internal = FF(1); });
}

TEST(PatternTest, Poseidon2External)
{
    verify_pattern<Poseidon2ExternalRelation<FF>>(
        POSEIDON2_EXTERNAL, 1, [](Entities& e) { e.q_poseidon2_external = FF(1); });
}

TEST(PatternTest, LookupBasic)
{
    verify_pattern<LogDerivLookupRelation<FF>>(LOOKUP, 1, [](Entities& e) {
        e.q_lookup = FF(1);
        // No shifted wires (step_size selectors all zero)
        e.q_r = FF(0);
        e.q_m = FF(0);
        e.q_c = FF(0);
    });
}

TEST(PatternTest, LookupWithShiftedWires)
{
    verify_pattern<LogDerivLookupRelation<FF>>(LOOKUP, 1, [](Entities& e) {
        e.q_lookup = FF(1);
        // Enable all shifted wires
        e.q_r = FF(1);
        e.q_m = FF(1);
        e.q_c = FF(1);
    });
}

TEST(PatternTest, DatabusRead)
{
    verify_pattern<DatabusLookupRelation<FF>>(DATABUS, 1, [](Entities& e) { e.q_busread = FF(1); });
}
