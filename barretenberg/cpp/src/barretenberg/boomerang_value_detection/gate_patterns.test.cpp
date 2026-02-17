/**
 * @file gate_patterns.test.cpp
 * @brief Verify gate patterns match actual relation constraints via perturbation testing.
 *
 * A wire is constrained by a relation if and only if perturbing that wire changes the relation's output. We test this
 * empirically by:
 * 1. Evaluating the relation at a base point
 * 2. Individually perturbing each wire and checking if the output changes
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

Selectors make_selectors(const Entities& entities, int64_t gate_selector_value)
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
 *
 * @param configure_selectors Lambda that configures entity selectors and returns the gate selector field value
 */
template <typename Relation> void verify_pattern(const GatePattern& pattern, auto configure_selectors)
{
    Entities entities = get_random_entities();
    FF gate_selector = configure_selectors(entities);
    int64_t gate_selector_value = static_cast<int64_t>(uint64_t(gate_selector));

    Selectors selectors = make_selectors(entities, gate_selector_value);
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
    verify_pattern<ArithmeticRelation<FF>>(ARITHMETIC, [](Entities& e) { return e.q_arith = FF(1); });
}

TEST(PatternTest, Arithmetic2)
{
    verify_pattern<ArithmeticRelation<FF>>(ARITHMETIC, [](Entities& e) { return e.q_arith = FF(2); });
}

TEST(PatternTest, Arithmetic3)
{
    verify_pattern<ArithmeticRelation<FF>>(ARITHMETIC, [](Entities& e) { return e.q_arith = FF(3); });
}

TEST(PatternTest, Arithmetic3WithQmZero)
{
    verify_pattern<ArithmeticRelation<FF>>(ARITHMETIC, [](Entities& e) {
        e.q_m = FF(0);
        return e.q_arith = FF(3);
    });
}

TEST(PatternTest, EllipticAdd)
{
    verify_pattern<EllipticRelation<FF>>(ELLIPTIC, [](Entities& e) {
        e.q_m = FF(0);
        e.q_l = FF(-1);
        return e.q_elliptic = FF(1);
    });
}

TEST(PatternTest, EllipticDouble)
{
    verify_pattern<EllipticRelation<FF>>(ELLIPTIC, [](Entities& e) {
        e.q_m = FF(1);
        e.q_l = FF(-1);
        return e.q_elliptic = FF(1);
    });
}

TEST(PatternTest, DeltaRange)
{
    verify_pattern<DeltaRangeConstraintRelation<FF>>(DELTA_RANGE, [](Entities& e) { return e.q_delta_range = FF(1); });
}

TEST(PatternTest, NNFLimbAccum1)
{
    verify_pattern<NonNativeFieldRelation<FF>>(NON_NATIVE_FIELD, [](Entities& e) {
        e.q_r = FF(0);
        e.q_o = FF(1);
        e.q_4 = FF(1);
        e.q_m = FF(0);
        return e.q_nnf = FF(1);
    });
}

TEST(PatternTest, NNFLimbAccum2)
{
    verify_pattern<NonNativeFieldRelation<FF>>(NON_NATIVE_FIELD, [](Entities& e) {
        e.q_r = FF(0);
        e.q_o = FF(1);
        e.q_4 = FF(0);
        e.q_m = FF(1);
        return e.q_nnf = FF(1);
    });
}

TEST(PatternTest, NNFProduct1)
{
    verify_pattern<NonNativeFieldRelation<FF>>(NON_NATIVE_FIELD, [](Entities& e) {
        e.q_r = FF(1);
        e.q_o = FF(1);
        e.q_4 = FF(0);
        e.q_m = FF(0);
        return e.q_nnf = FF(1);
    });
}

TEST(PatternTest, NNFProduct2)
{
    verify_pattern<NonNativeFieldRelation<FF>>(NON_NATIVE_FIELD, [](Entities& e) {
        e.q_r = FF(1);
        e.q_o = FF(0);
        e.q_4 = FF(1);
        e.q_m = FF(0);
        return e.q_nnf = FF(1);
    });
}

TEST(PatternTest, NNFProduct3)
{
    verify_pattern<NonNativeFieldRelation<FF>>(NON_NATIVE_FIELD, [](Entities& e) {
        e.q_r = FF(1);
        e.q_o = FF(0);
        e.q_4 = FF(0);
        e.q_m = FF(1);
        return e.q_nnf = FF(1);
    });
}

TEST(PatternTest, MemoryRamRomAccess)
{
    verify_pattern<MemoryRelation<FF>>(MEMORY, [](Entities& e) {
        e.q_l = FF(1);
        e.q_m = FF(1);
        return e.q_memory = FF(1);
    });
}

TEST(PatternTest, MemoryRamTimestamp)
{
    verify_pattern<MemoryRelation<FF>>(MEMORY, [](Entities& e) {
        e.q_l = FF(1);
        e.q_4 = FF(1);
        return e.q_memory = FF(1);
    });
}

TEST(PatternTest, MemoryRomConsistency)
{
    verify_pattern<MemoryRelation<FF>>(MEMORY, [](Entities& e) {
        e.q_l = FF(1);
        e.q_r = FF(1);
        return e.q_memory = FF(1);
    });
}

TEST(PatternTest, MemoryRamConsistency)
{
    verify_pattern<MemoryRelation<FF>>(MEMORY, [](Entities& e) {
        e.q_o = FF(1);
        return e.q_memory = FF(1);
    });
}

TEST(PatternTest, Poseidon2Internal)
{
    verify_pattern<Poseidon2InternalRelation<FF>>(POSEIDON2_INTERNAL,
                                                  [](Entities& e) { return e.q_poseidon2_internal = FF(1); });
}

TEST(PatternTest, Poseidon2External)
{
    verify_pattern<Poseidon2ExternalRelation<FF>>(POSEIDON2_EXTERNAL,
                                                  [](Entities& e) { return e.q_poseidon2_external = FF(1); });
}

TEST(PatternTest, LookupBasic)
{
    verify_pattern<LogDerivLookupRelation<FF>>(LOOKUP, [](Entities& e) {
        // No shifted wires (step_size selectors all zero)
        e.q_r = FF(0);
        e.q_m = FF(0);
        e.q_c = FF(0);
        return e.q_lookup = FF(1);
    });
}

TEST(PatternTest, LookupWithShiftedWires)
{
    verify_pattern<LogDerivLookupRelation<FF>>(LOOKUP, [](Entities& e) {
        // Enable all shifted wires
        e.q_r = FF(1);
        e.q_m = FF(1);
        e.q_c = FF(1);
        return e.q_lookup = FF(1);
    });
}

TEST(PatternTest, DatabusRead)
{
    verify_pattern<DatabusLookupRelation<FF>>(DATABUS, [](Entities& e) { return e.q_busread = FF(1); });
}

// =============================================================================
// Failure Detection Tests
//
// These tests verify the perturbation testing mechanism catches pattern errors.
// They use intentionally wrong patterns to demonstrate both over-constrained
// and under-constrained specifications are detected.
// =============================================================================

/**
 * @brief Verify detection of OVER-constrained pattern (claims more wires than relation uses)
 *
 * When q_arith==3, the multiplication term q_m * w_l * w_r is disabled (scaled by q_arith - 3 = 0).
 * So w_r is only constrained via the linear term q_2 * w_r. A pattern that includes w_r whenever
 * q_m != 0 (without checking q_arith != 3) over-constrains when q_arith=3, q_m!=0, q_2=0.
 */
TEST(PatternTest, DetectOverConstrained)
{
    // Pattern that unconditionally includes w_r when q_m != 0 (ignoring q_arith value)
    const GatePattern OVERCONSTRAINED_PATTERN = { .name = "overconstrained",
                                                  .wires = {
                                                      { Wire::W_L,
                                                        [](const Selectors& sel) { return sel.q_1_nz || sel.q_m_nz; } },
                                                      { Wire::W_R,
                                                        [](const Selectors& sel) {
                                                            return sel.q_2_nz || sel.q_m_nz;
                                                        } }, // should check q_arith!=3
                                                      { Wire::W_O, [](const Selectors& sel) { return sel.q_3_nz; } },
                                                      { Wire::W_4,
                                                        [](const Selectors& sel) {
                                                            return sel.q_4_nz || sel.gate_selector >= 2;
                                                        } },
                                                      { Wire::W_4_SHIFT,
                                                        [](const Selectors& sel) { return sel.gate_selector >= 2; } },
                                                      { Wire::W_L_SHIFT,
                                                        [](const Selectors& sel) { return sel.gate_selector == 3; } },
                                                  } };

    // q_arith=3 disables mul term, q_2=0 means w_r has no linear term, so w_r is unconstrained
    Entities entities = get_random_entities();
    entities.q_arith = FF(3);
    entities.q_m = FF(1);
    entities.q_l = FF(1);
    entities.q_r = FF(0); // q_2 = 0

    Selectors selectors = make_selectors(entities, 3);
    auto pattern_claims = get_pattern_wires(OVERCONSTRAINED_PATTERN, selectors);
    auto correct_claims = get_pattern_wires(ARITHMETIC, selectors);
    auto parameters = RelationParameters<FF>::get_random();
    auto actually_constrained = get_actually_constrained_wires<ArithmeticRelation<FF>>(entities, parameters);

    EXPECT_TRUE(pattern_claims.contains(Wire::W_R)) << "Over-constrained pattern claims W_R";
    EXPECT_FALSE(actually_constrained.contains(Wire::W_R)) << "Relation does not constrain W_R in this config";
    EXPECT_NE(pattern_claims, actually_constrained) << "Over-constrained pattern should not match relation";
    EXPECT_EQ(correct_claims, actually_constrained) << "Correct ARITHMETIC pattern should match relation";
}

/**
 * @brief Verify detection of UNDER-constrained pattern (misses wires that relation uses)
 *
 * The RAM consistency relation (q_3 != 0) constrains all 8 wires. A pattern that only
 * extracts 6 wires (omitting w_l and w_r) under-constrains.
 */
TEST(PatternTest, DetectUnderConstrained)
{
    // Pattern missing w_l and w_r for RAM consistency
    const GatePattern
        UNDERCONSTRAINED_PATTERN = { .name = "underconstrained",
                                     .wires = {
                                         { Wire::W_O, [](const Selectors& sel) { return sel.q_3_nz; } },
                                         { Wire::W_4, [](const Selectors& sel) { return sel.q_3_nz; } },
                                         { Wire::W_L_SHIFT, [](const Selectors& sel) { return sel.q_3_nz; } },
                                         { Wire::W_R_SHIFT, [](const Selectors& sel) { return sel.q_3_nz; } },
                                         { Wire::W_O_SHIFT, [](const Selectors& sel) { return sel.q_3_nz; } },
                                         { Wire::W_4_SHIFT, [](const Selectors& sel) { return sel.q_3_nz; } },
                                     } };

    // RAM consistency check: q_3 != 0
    Entities entities = get_random_entities();
    entities.q_memory = FF(1);
    entities.q_o = FF(1); // q_3

    Selectors selectors = make_selectors(entities, 1);
    auto pattern_claims = get_pattern_wires(UNDERCONSTRAINED_PATTERN, selectors);
    auto correct_claims = get_pattern_wires(MEMORY, selectors);
    auto parameters = RelationParameters<FF>::get_random();
    auto actually_constrained = get_actually_constrained_wires<MemoryRelation<FF>>(entities, parameters);

    EXPECT_FALSE(pattern_claims.contains(Wire::W_L)) << "Under-constrained pattern missing W_L";
    EXPECT_FALSE(pattern_claims.contains(Wire::W_R)) << "Under-constrained pattern missing W_R";
    EXPECT_TRUE(actually_constrained.contains(Wire::W_L)) << "Relation constrains W_L";
    EXPECT_TRUE(actually_constrained.contains(Wire::W_R)) << "Relation constrains W_R";
    EXPECT_NE(pattern_claims, actually_constrained) << "Under-constrained pattern should not match relation";
    EXPECT_EQ(correct_claims, actually_constrained) << "Correct MEMORY pattern should match relation";
}
