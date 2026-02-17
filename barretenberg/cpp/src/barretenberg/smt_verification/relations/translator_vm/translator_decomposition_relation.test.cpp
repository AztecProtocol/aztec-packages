#include <gtest/gtest.h>

#include "translator_relation_test_helpers.hpp"
#include "translator_relations.hpp"
#include "translator_relations_recorder.hpp"
#include <iomanip>
#include <set>
#include <sstream>

using namespace bb;
using namespace translator_relation_test_helpers;

// Limb index constants for max_values array (used in composite value tests)
namespace limb_indices {
constexpr size_t Z_LOW = 6;
constexpr size_t P_Y_LOW = 10;
constexpr size_t P_X_LOW = 14;
} // namespace limb_indices

// Relation index constants
namespace relation_indices {
// Accumulator decompositions (0-3)
constexpr size_t ACC_LOW_0 = 0;
constexpr size_t ACC_LOW_1 = 1;
constexpr size_t ACC_HIGH_0 = 2;
constexpr size_t ACC_HIGH_1 = 3;
// P_y decompositions (4-7)
constexpr size_t P_Y_LOW = 4;
constexpr size_t P_Y_LOW_SHIFT = 5;
constexpr size_t P_Y_HIGH = 6;
constexpr size_t P_Y_HIGH_SHIFT = 7;
// Z decompositions (8-11)
constexpr size_t Z_LOW = 8;
constexpr size_t Z_LOW_SHIFT = 9;
constexpr size_t Z_HIGH = 10;
constexpr size_t Z_HIGH_SHIFT = 11;
// P_x decompositions (12-15)
constexpr size_t P_X_LOW = 12;
constexpr size_t P_X_LOW_SHIFT = 13;
constexpr size_t P_X_HIGH = 14;
constexpr size_t P_X_HIGH_SHIFT = 15;
// Quotient decompositions (16-19)
constexpr size_t QUOTIENT_LOW = 16;
constexpr size_t QUOTIENT_LOW_SHIFT = 17;
constexpr size_t QUOTIENT_HIGH = 18;
constexpr size_t QUOTIENT_HIGH_SHIFT = 19;
// Wide limbs (20-21)
constexpr size_t WIDE_LIMBS = 20;
constexpr size_t WIDE_LIMBS_SHIFT = 21;
// Tail relations (22-41)
constexpr size_t P_X_LOW_TAIL = 22;
constexpr size_t P_X_LOW_SHIFT_TAIL = 23;
constexpr size_t P_X_HIGH_TAIL = 24;
constexpr size_t P_X_HIGH_SHIFT_TAIL = 25;
constexpr size_t P_Y_LOW_TAIL = 26;
constexpr size_t P_Y_LOW_SHIFT_TAIL = 27;
constexpr size_t P_Y_HIGH_TAIL = 28;
constexpr size_t P_Y_HIGH_SHIFT_TAIL = 29;
constexpr size_t Z_LOW_TAIL = 30;
constexpr size_t Z_LOW_SHIFT_TAIL = 31;
constexpr size_t Z_HIGH_TAIL = 32;
constexpr size_t Z_HIGH_SHIFT_TAIL = 33;
constexpr size_t ACC_LOW_0_TAIL = 34;
constexpr size_t ACC_LOW_1_TAIL = 35;
constexpr size_t ACC_HIGH_0_TAIL = 36;
constexpr size_t ACC_HIGH_1_TAIL = 37;
constexpr size_t QUOTIENT_LOW_TAIL = 38;
constexpr size_t QUOTIENT_LOW_SHIFT_TAIL = 39;
constexpr size_t QUOTIENT_HIGH_TAIL = 40;
constexpr size_t QUOTIENT_HIGH_SHIFT_TAIL = 41;
// Composite value relations (42-47)
constexpr size_t X_LO = 42;
constexpr size_t X_HI = 43;
constexpr size_t Y_LO = 44;
constexpr size_t Y_HI = 45;
constexpr size_t Z1 = 46;
constexpr size_t Z2 = 47;
} // namespace relation_indices

struct LimbDecomposition {
    std::string limb_name;             // Name of the limb variable (e.g., "accumulators_binary_limbs_0")
    size_t relation_index;             // Index of the main decomposition relation
    std::vector<std::string> rc_names; // Names of the range constraint microlimb variables
    size_t tail_relation_index;        // Index of the tail constraint relation
};

// Accumulator limb decompositions (68-bit for limbs 0-2, 50-bit for limb 3)
LimbDecomposition get_accumulator_limb_0_decomp()
{
    return {
        .limb_name = "accumulators_binary_limbs_0",
        .relation_index = relation_indices::ACC_LOW_0,
        .rc_names = { "accumulator_low_limbs_range_constraint_0",
                      "accumulator_low_limbs_range_constraint_1",
                      "accumulator_low_limbs_range_constraint_2",
                      "accumulator_low_limbs_range_constraint_3",
                      "accumulator_low_limbs_range_constraint_4",
                      "accumulator_low_limbs_range_constraint_tail" },
        .tail_relation_index = relation_indices::ACC_LOW_0_TAIL,
    };
}

LimbDecomposition get_accumulator_limb_1_decomp()
{
    return {
        .limb_name = "accumulators_binary_limbs_1",
        .relation_index = relation_indices::ACC_LOW_1,
        .rc_names = { "accumulator_low_limbs_range_constraint_0_shift",
                      "accumulator_low_limbs_range_constraint_1_shift",
                      "accumulator_low_limbs_range_constraint_2_shift",
                      "accumulator_low_limbs_range_constraint_3_shift",
                      "accumulator_low_limbs_range_constraint_4_shift",
                      "accumulator_low_limbs_range_constraint_tail_shift" },
        .tail_relation_index = relation_indices::ACC_LOW_1_TAIL,
    };
}

LimbDecomposition get_accumulator_limb_2_decomp()
{
    return {
        .limb_name = "accumulators_binary_limbs_2",
        .relation_index = relation_indices::ACC_HIGH_0,
        .rc_names = { "accumulator_high_limbs_range_constraint_0",
                      "accumulator_high_limbs_range_constraint_1",
                      "accumulator_high_limbs_range_constraint_2",
                      "accumulator_high_limbs_range_constraint_3",
                      "accumulator_high_limbs_range_constraint_4",
                      "accumulator_high_limbs_range_constraint_tail" },
        .tail_relation_index = relation_indices::ACC_HIGH_0_TAIL,
    };
}

LimbDecomposition get_accumulator_limb_3_decomp()
{
    return {
        .limb_name = "accumulators_binary_limbs_3",
        .relation_index = relation_indices::ACC_HIGH_1,
        .rc_names = { "accumulator_high_limbs_range_constraint_0_shift",
                      "accumulator_high_limbs_range_constraint_1_shift",
                      "accumulator_high_limbs_range_constraint_2_shift",
                      "accumulator_high_limbs_range_constraint_3_shift",
                      "accumulator_high_limbs_range_constraint_4_shift" },
        .tail_relation_index = relation_indices::ACC_HIGH_1_TAIL,
    };
}

// Wide limb decompositions (80-bit, uses borrowed tail microlimbs)
LimbDecomposition get_wide_limbs_decomp()
{
    return {
        .limb_name = "relation_wide_limbs",
        .relation_index = relation_indices::WIDE_LIMBS,
        .rc_names = { "relation_wide_limbs_range_constraint_0",
                      "relation_wide_limbs_range_constraint_1",
                      "relation_wide_limbs_range_constraint_2",
                      "relation_wide_limbs_range_constraint_3",
                      "p_x_high_limbs_range_constraint_tail_shift",
                      "accumulator_high_limbs_range_constraint_tail_shift" },
        .tail_relation_index = relation_indices::WIDE_LIMBS, // No separate tail, uses self
    };
}

LimbDecomposition get_wide_limbs_shift_decomp()
{
    return {
        .limb_name = "relation_wide_limbs_shift",
        .relation_index = relation_indices::WIDE_LIMBS_SHIFT,
        .rc_names = { "relation_wide_limbs_range_constraint_0_shift",
                      "relation_wide_limbs_range_constraint_1_shift",
                      "relation_wide_limbs_range_constraint_2_shift",
                      "relation_wide_limbs_range_constraint_3_shift",
                      "p_y_high_limbs_range_constraint_tail_shift",
                      "quotient_high_limbs_range_constraint_tail_shift" },
        .tail_relation_index = relation_indices::WIDE_LIMBS_SHIFT, // No separate tail, uses self
    };
}

// Z limb decompositions (68-bit low, 60-bit high)
LimbDecomposition get_z_low_decomp()
{
    return {
        .limb_name = "z_low_limbs",
        .relation_index = relation_indices::Z_LOW,
        .rc_names = { "z_low_limbs_range_constraint_0",
                      "z_low_limbs_range_constraint_1",
                      "z_low_limbs_range_constraint_2",
                      "z_low_limbs_range_constraint_3",
                      "z_low_limbs_range_constraint_4",
                      "z_low_limbs_range_constraint_tail" },
        .tail_relation_index = relation_indices::Z_LOW_TAIL,
    };
}

LimbDecomposition get_z_low_shift_decomp()
{
    return {
        .limb_name = "z_low_limbs_shift",
        .relation_index = relation_indices::Z_LOW_SHIFT,
        .rc_names = { "z_low_limbs_range_constraint_0_shift",
                      "z_low_limbs_range_constraint_1_shift",
                      "z_low_limbs_range_constraint_2_shift",
                      "z_low_limbs_range_constraint_3_shift",
                      "z_low_limbs_range_constraint_4_shift",
                      "z_low_limbs_range_constraint_tail_shift" },
        .tail_relation_index = relation_indices::Z_LOW_SHIFT_TAIL,
    };
}

LimbDecomposition get_z_high_decomp()
{
    return {
        .limb_name = "z_high_limbs",
        .relation_index = relation_indices::Z_HIGH,
        .rc_names = { "z_high_limbs_range_constraint_0",
                      "z_high_limbs_range_constraint_1",
                      "z_high_limbs_range_constraint_2",
                      "z_high_limbs_range_constraint_3",
                      "z_high_limbs_range_constraint_4",
                      "z_high_limbs_range_constraint_tail" },
        .tail_relation_index = relation_indices::Z_HIGH_TAIL,
    };
}

LimbDecomposition get_z_high_shift_decomp()
{
    return {
        .limb_name = "z_high_limbs_shift",
        .relation_index = relation_indices::Z_HIGH_SHIFT,
        .rc_names = { "z_high_limbs_range_constraint_0_shift",
                      "z_high_limbs_range_constraint_1_shift",
                      "z_high_limbs_range_constraint_2_shift",
                      "z_high_limbs_range_constraint_3_shift",
                      "z_high_limbs_range_constraint_4_shift",
                      "z_high_limbs_range_constraint_tail_shift" },
        .tail_relation_index = relation_indices::Z_HIGH_SHIFT_TAIL,
    };
}

// P_y limb decompositions (68-bit low, 50-bit high shift)
LimbDecomposition get_p_y_low_decomp()
{
    return {
        .limb_name = "p_y_low_limbs",
        .relation_index = relation_indices::P_Y_LOW,
        .rc_names = { "p_y_low_limbs_range_constraint_0",
                      "p_y_low_limbs_range_constraint_1",
                      "p_y_low_limbs_range_constraint_2",
                      "p_y_low_limbs_range_constraint_3",
                      "p_y_low_limbs_range_constraint_4",
                      "p_y_low_limbs_range_constraint_tail" },
        .tail_relation_index = relation_indices::P_Y_LOW_TAIL,
    };
}

LimbDecomposition get_p_y_low_shift_decomp()
{
    return {
        .limb_name = "p_y_low_limbs_shift",
        .relation_index = relation_indices::P_Y_LOW_SHIFT,
        .rc_names = { "p_y_low_limbs_range_constraint_0_shift",
                      "p_y_low_limbs_range_constraint_1_shift",
                      "p_y_low_limbs_range_constraint_2_shift",
                      "p_y_low_limbs_range_constraint_3_shift",
                      "p_y_low_limbs_range_constraint_4_shift",
                      "p_y_low_limbs_range_constraint_tail_shift" },
        .tail_relation_index = relation_indices::P_Y_LOW_SHIFT_TAIL,
    };
}

LimbDecomposition get_p_y_high_decomp()
{
    return {
        .limb_name = "p_y_high_limbs",
        .relation_index = relation_indices::P_Y_HIGH,
        .rc_names = { "p_y_high_limbs_range_constraint_0",
                      "p_y_high_limbs_range_constraint_1",
                      "p_y_high_limbs_range_constraint_2",
                      "p_y_high_limbs_range_constraint_3",
                      "p_y_high_limbs_range_constraint_4",
                      "p_y_high_limbs_range_constraint_tail" },
        .tail_relation_index = relation_indices::P_Y_HIGH_TAIL,
    };
}

LimbDecomposition get_p_y_high_shift_decomp()
{
    return {
        .limb_name = "p_y_high_limbs_shift",
        .relation_index = relation_indices::P_Y_HIGH_SHIFT,
        .rc_names = { "p_y_high_limbs_range_constraint_0_shift",
                      "p_y_high_limbs_range_constraint_1_shift",
                      "p_y_high_limbs_range_constraint_2_shift",
                      "p_y_high_limbs_range_constraint_3_shift",
                      "p_y_high_limbs_range_constraint_4_shift" },
        .tail_relation_index = relation_indices::P_Y_HIGH_SHIFT_TAIL,
    };
}

// P_x limb decompositions (68-bit low, 50-bit high shift)
LimbDecomposition get_p_x_low_decomp()
{
    return {
        .limb_name = "p_x_low_limbs",
        .relation_index = relation_indices::P_X_LOW,
        .rc_names = { "p_x_low_limbs_range_constraint_0",
                      "p_x_low_limbs_range_constraint_1",
                      "p_x_low_limbs_range_constraint_2",
                      "p_x_low_limbs_range_constraint_3",
                      "p_x_low_limbs_range_constraint_4",
                      "p_x_low_limbs_range_constraint_tail" },
        .tail_relation_index = relation_indices::P_X_LOW_TAIL,
    };
}

LimbDecomposition get_p_x_low_shift_decomp()
{
    return {
        .limb_name = "p_x_low_limbs_shift",
        .relation_index = relation_indices::P_X_LOW_SHIFT,
        .rc_names = { "p_x_low_limbs_range_constraint_0_shift",
                      "p_x_low_limbs_range_constraint_1_shift",
                      "p_x_low_limbs_range_constraint_2_shift",
                      "p_x_low_limbs_range_constraint_3_shift",
                      "p_x_low_limbs_range_constraint_4_shift",
                      "p_x_low_limbs_range_constraint_tail_shift" },
        .tail_relation_index = relation_indices::P_X_LOW_SHIFT_TAIL,
    };
}

LimbDecomposition get_p_x_high_decomp()
{
    return {
        .limb_name = "p_x_high_limbs",
        .relation_index = relation_indices::P_X_HIGH,
        .rc_names = { "p_x_high_limbs_range_constraint_0",
                      "p_x_high_limbs_range_constraint_1",
                      "p_x_high_limbs_range_constraint_2",
                      "p_x_high_limbs_range_constraint_3",
                      "p_x_high_limbs_range_constraint_4",
                      "p_x_high_limbs_range_constraint_tail" },
        .tail_relation_index = relation_indices::P_X_HIGH_TAIL,
    };
}

LimbDecomposition get_p_x_high_shift_decomp()
{
    return {
        .limb_name = "p_x_high_limbs_shift",
        .relation_index = relation_indices::P_X_HIGH_SHIFT,
        .rc_names = { "p_x_high_limbs_range_constraint_0_shift",
                      "p_x_high_limbs_range_constraint_1_shift",
                      "p_x_high_limbs_range_constraint_2_shift",
                      "p_x_high_limbs_range_constraint_3_shift",
                      "p_x_high_limbs_range_constraint_4_shift" },
        .tail_relation_index = relation_indices::P_X_HIGH_SHIFT_TAIL,
    };
}

// Quotient limb decompositions (68-bit low, 52-bit high shift)
LimbDecomposition get_quotient_low_decomp()
{
    return {
        .limb_name = "quotient_low_binary_limbs",
        .relation_index = relation_indices::QUOTIENT_LOW,
        .rc_names = { "quotient_low_limbs_range_constraint_0",
                      "quotient_low_limbs_range_constraint_1",
                      "quotient_low_limbs_range_constraint_2",
                      "quotient_low_limbs_range_constraint_3",
                      "quotient_low_limbs_range_constraint_4",
                      "quotient_low_limbs_range_constraint_tail" },
        .tail_relation_index = relation_indices::QUOTIENT_LOW_TAIL,
    };
}

LimbDecomposition get_quotient_low_shift_decomp()
{
    return {
        .limb_name = "quotient_low_binary_limbs_shift",
        .relation_index = relation_indices::QUOTIENT_LOW_SHIFT,
        .rc_names = { "quotient_low_limbs_range_constraint_0_shift",
                      "quotient_low_limbs_range_constraint_1_shift",
                      "quotient_low_limbs_range_constraint_2_shift",
                      "quotient_low_limbs_range_constraint_3_shift",
                      "quotient_low_limbs_range_constraint_4_shift",
                      "quotient_low_limbs_range_constraint_tail_shift" },
        .tail_relation_index = relation_indices::QUOTIENT_LOW_SHIFT_TAIL,
    };
}

LimbDecomposition get_quotient_high_decomp()
{
    return {
        .limb_name = "quotient_high_binary_limbs",
        .relation_index = relation_indices::QUOTIENT_HIGH,
        .rc_names = { "quotient_high_limbs_range_constraint_0",
                      "quotient_high_limbs_range_constraint_1",
                      "quotient_high_limbs_range_constraint_2",
                      "quotient_high_limbs_range_constraint_3",
                      "quotient_high_limbs_range_constraint_4",
                      "quotient_high_limbs_range_constraint_tail" },
        .tail_relation_index = relation_indices::QUOTIENT_HIGH_TAIL,
    };
}

LimbDecomposition get_quotient_high_shift_decomp()
{
    return {
        .limb_name = "quotient_high_binary_limbs_shift",
        .relation_index = relation_indices::QUOTIENT_HIGH_SHIFT,
        .rc_names = { "quotient_high_limbs_range_constraint_0_shift",
                      "quotient_high_limbs_range_constraint_1_shift",
                      "quotient_high_limbs_range_constraint_2_shift",
                      "quotient_high_limbs_range_constraint_3_shift",
                      "quotient_high_limbs_range_constraint_4_shift" },
        .tail_relation_index = relation_indices::QUOTIENT_HIGH_SHIFT_TAIL,
    };
}

std::vector<LimbDecomposition> get_all_decompositions()
{
    return { get_accumulator_limb_0_decomp(),
             get_accumulator_limb_1_decomp(),
             get_accumulator_limb_2_decomp(),
             get_accumulator_limb_3_decomp(),
             get_wide_limbs_decomp(),
             get_wide_limbs_shift_decomp(),
             get_z_low_decomp(),
             get_z_low_shift_decomp(),
             get_z_high_decomp(),
             get_z_high_shift_decomp(),
             get_p_y_low_decomp(),
             get_p_y_low_shift_decomp(),
             get_p_y_high_decomp(),
             get_p_y_high_shift_decomp(),
             get_p_x_low_decomp(),
             get_p_x_low_shift_decomp(),
             get_p_x_high_decomp(),
             get_p_x_high_shift_decomp(),
             get_quotient_low_decomp(),
             get_quotient_low_shift_decomp(),
             get_quotient_high_decomp(),
             get_quotient_high_shift_decomp() };
}

/**
 * @brief Result of searching for limb-related SMT variables
 */
struct MappedLimbVariables {
    smt_terms::STerm limb_var;             // The main limb variable
    std::vector<smt_terms::STerm> rc_vars; // Range constraint microlimb variables
    smt_terms::STerm tail_var;             // The tail microlimb (last element of rc_vars)
    bool found_all;                        // True if all expected variables were found
};

/**
 * @brief Find SMT variables for a limb and its range constraint microlimbs
 *
 * Given a decomposition specification, this function searches through the replayed
 * SMT variables to find:
 * - The main limb variable (e.g., "V1_accumulators_binary_limbs_0")
 * - All range constraint microlimb variables (e.g., "V1_accumulator_low_limbs_range_constraint_0", etc.)
 * - The tail variable (last element of rc_vars, used in tail constraint relations)
 *
 * @param vars      Vector of SMT terms from replay
 * @param names     Corresponding variable names from replay
 * @param decomp    Decomposition specification containing limb_name and rc_names
 * @param prefix    Variable prefix (e.g., "V1", "V2") to match prefixed names
 *
 * @return MappedLimbVariables with:
 *         - limb_var: the main limb SMT term
 *         - rc_vars: vector of range constraint microlimb SMT terms
 *         - tail_var: the last rc_var (tail microlimb)
 *         - found_all: true if all variables were found
 */
MappedLimbVariables find_limb_variables(const std::vector<smt_terms::STerm>& vars,
                                        const std::vector<std::string>& names,
                                        const LimbDecomposition& decomp,
                                        const std::string& prefix)
{
    MappedLimbVariables result;
    result.found_all = false;

    // Find the main limb variable
    std::string limb_full_name = prefix + "_" + decomp.limb_name;
    bool found_limb = false;

    for (size_t i = 0; i < names.size(); ++i) {
        if (names[i] == limb_full_name) {
            result.limb_var = vars[i];
            found_limb = true;
            break;
        }
    }

    if (!found_limb) {
        return result;
    }

    // Find all range constraint microlimb variables
    result.rc_vars.resize(decomp.rc_names.size());
    std::vector<bool> found_rc(decomp.rc_names.size(), false);

    for (size_t i = 0; i < names.size(); ++i) {
        for (size_t j = 0; j < decomp.rc_names.size(); ++j) {
            std::string rc_full_name = prefix + "_" + decomp.rc_names[j];
            if (names[i] == rc_full_name) {
                result.rc_vars[j] = vars[i];
                found_rc[j] = true;
                break;
            }
        }
    }

    // Tail variable is the last range constraint (used in tail relations)
    if (found_rc.back()) {
        result.tail_var = result.rc_vars.back();
    }

    result.found_all = found_limb && std::all_of(found_rc.begin(), found_rc.end(), [](bool b) { return b; });
    return result;
}

/**
 * @brief Set selector variables to activate decomposition constraints
 *
 * The translator decomposition relation requires certain selectors to be set:
 * - op = 1: Indicates an active operation row
 * - lagrange_even_in_minicircuit = 1: Indicates we're at an even-indexed row in the minicircuit
 *
 * @param s       SMT solver instance
 * @param vars    Vector of SMT terms from replay
 * @param names   Corresponding variable names
 * @param prefix  Variable prefix (e.g., "V1") to match prefixed names
 */
void set_active_selectors(smt_solver::Solver& s,
                          const std::vector<smt_terms::STerm>& vars,
                          const std::vector<std::string>& names,
                          const std::string& prefix)
{
    smt_terms::STerm one = smt_terms::FFIConst("1", &s, 10);
    for (size_t i = 0; i < vars.size(); ++i) {
        if (names[i] == prefix + "_op" ||
            names[i].find(prefix + "_lagrange_even_in_minicircuit") != std::string::npos) {
            s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                                  { static_cast<cvc5::Term>(vars[i]), static_cast<cvc5::Term>(one) }));
        }
    }
}

/**
 * @brief Test that a limb decomposition is unique
 *
 * Verifies that for a given limb value, there is only one valid decomposition
 * into range-constrained microlimbs. This is tested by:
 * 1. Creating two instances of the relation with the same limb value
 * 2. Asserting that at least one microlimb differs between them
 * 3. If UNSAT, the decomposition is unique (no two different decompositions exist)
 *
 * @param trace   Recorded operation trace for the decomposition relation
 * @param decomp  Decomposition specification for the limb to test
 * @return true if decomposition is unique (UNSAT), false if multiple decompositions exist (SAT)
 */
bool test_limb_uniqueness(const smt_relation_recorder::OperationTrace& trace, const LimbDecomposition& decomp)
{
    smt_solver::Solver s(BN254_MODULUS, smt_solver::default_solver_config);

    std::vector<smt_terms::STerm> f1, v1, f2, v2;
    std::vector<std::string> n1, n2;

    smt_translator_relations::replay_translator_decomposition_relation(trace, &s, "V1", true, f1, v1, n1);
    smt_translator_relations::replay_translator_decomposition_relation(trace, &s, "V2", true, f2, v2, n2);

    smt_translator_relations::create_range_constraint_formulas(&s, v1, n1, "constraint", 16384);
    smt_translator_relations::create_range_constraint_formulas(&s, v2, n2, "constraint", 16384);

    set_active_selectors(s, v1, n1, "V1");
    set_active_selectors(s, v2, n2, "V2");

    smt_translator_relations::assert_formulas_zero(&s,
                                                   { f1[decomp.relation_index],
                                                     f1[decomp.tail_relation_index],
                                                     f2[decomp.relation_index],
                                                     f2[decomp.tail_relation_index] });

    auto limb1 = find_limb_variables(v1, n1, decomp, "V1");
    auto limb2 = find_limb_variables(v2, n2, decomp, "V2");

    // Same limb value
    s.assertFormula(s.term_manager.mkTerm(
        cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(limb1.limb_var), static_cast<cvc5::Term>(limb2.limb_var) }));

    // At least one RC differs
    smt_terms::STerm zero = smt_terms::FFIConst("0", &s, 10);
    std::vector<cvc5::Term> diffs;
    for (size_t i = 0; i < limb1.rc_vars.size(); ++i) {
        smt_terms::STerm diff = limb1.rc_vars[i] - limb2.rc_vars[i];
        diffs.push_back(s.term_manager.mkTerm(
            cvc5::Kind::NOT,
            { s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                    { static_cast<cvc5::Term>(diff), static_cast<cvc5::Term>(zero) }) }));
    }
    cvc5::Term disj = diffs[0];
    for (size_t i = 1; i < diffs.size(); ++i) {
        disj = s.term_manager.mkTerm(cvc5::Kind::OR, { disj, diffs[i] });
    }
    s.assertFormula(disj);

    return !s.check(); // UNSAT means unique
}

/**
 * @brief Find the maximum possible value for a limb given its decomposition constraints
 *
 * Uses binary search over bit lengths to find the largest value that can be
 * represented by the limb while satisfying all decomposition and range constraints.
 * Searches from 80 bits down to 1 bit, returning the first satisfiable bound.
 *
 * @param trace   Recorded operation trace for the decomposition relation
 * @param decomp  Decomposition specification for the limb to test
 * @return Maximum value the limb can hold (2^bits - 1 for some bits)
 */
uint256_t find_limb_maximum(const smt_relation_recorder::OperationTrace& trace, const LimbDecomposition& decomp)
{
    smt_solver::Solver s(BN254_MODULUS, smt_solver::default_solver_config);

    std::vector<smt_terms::STerm> f, v;
    std::vector<std::string> n;

    smt_translator_relations::replay_translator_decomposition_relation(trace, &s, "M", true, f, v, n);
    smt_translator_relations::create_range_constraint_formulas(&s, v, n, "constraint", 16384);
    set_active_selectors(s, v, n, "M");

    smt_translator_relations::assert_formulas_zero(&s, { f[decomp.relation_index], f[decomp.tail_relation_index] });

    auto limb = find_limb_variables(v, n, decomp, "M");

    for (int bits = 80; bits >= 1; bits--) {
        s.push();
        uint256_t test_val = (uint256_t(1) << static_cast<uint64_t>(bits)) - 1;
        smt_terms::STerm test_term = smt_terms::FFIConst(to_dec_string(test_val), &s, 10);
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::GEQ, { static_cast<cvc5::Term>(limb.limb_var), static_cast<cvc5::Term>(test_term) }));

        if (s.check()) {
            s.pop();
            return test_val;
        }
        s.pop();
    }
    return uint256_t(0);
}

/**
 * @brief Verify that the discovered maximum is tight (no larger value is possible)
 *
 * Confirms that max_val + 1 is unsatisfiable, proving that max_val is indeed
 * the maximum possible value for the limb. This is a regression check to ensure
 * the decomposition constraints are correctly bounding the limb.
 *
 * @param trace    Recorded operation trace for the decomposition relation
 * @param decomp   Decomposition specification for the limb to test
 * @param max_val  The discovered maximum value to verify
 * @return true if max_val is tight (max_val+1 is UNSAT), false otherwise
 */
bool verify_maximum_is_tight(const smt_relation_recorder::OperationTrace& trace,
                             const LimbDecomposition& decomp,
                             uint256_t max_val)
{
    smt_solver::Solver s(BN254_MODULUS, smt_solver::default_solver_config);

    std::vector<smt_terms::STerm> f, v;
    std::vector<std::string> n;

    smt_translator_relations::replay_translator_decomposition_relation(trace, &s, "M", true, f, v, n);
    smt_translator_relations::create_range_constraint_formulas(&s, v, n, "constraint", 16384);
    set_active_selectors(s, v, n, "M");

    smt_translator_relations::assert_formulas_zero(&s, { f[decomp.relation_index], f[decomp.tail_relation_index] });

    auto limb = find_limb_variables(v, n, decomp, "M");

    smt_terms::STerm test_term = smt_terms::FFIConst(to_dec_string(max_val + 1), &s, 10);
    s.assertFormula(s.term_manager.mkTerm(
        cvc5::Kind::GEQ, { static_cast<cvc5::Term>(limb.limb_var), static_cast<cvc5::Term>(test_term) }));

    return !s.check(); // UNSAT means max is tight
}

/**
 * @brief Sanity check: verify the decomposition relation is satisfiable
 *
 * This test ensures that the translator decomposition relation has at least one
 * valid solution. If this fails, the relation constraints are inconsistent.
 *
 * Runtime: ~50ms
 */
TEST(TranslatorDecompositionRelation, RelationIsSatisfiable)
{
    auto trace = smt_translator_relations::record_translator_decomposition_relation();

    smt_solver::Solver s(BN254_MODULUS, smt_solver::default_solver_config);
    std::vector<smt_terms::STerm> formulas, vars;
    std::vector<std::string> names;

    smt_translator_relations::replay_translator_decomposition_relation(trace, &s, "test", true, formulas, vars, names);
    smt_translator_relations::create_range_constraint_formulas(&s, vars, names, "constraint", 16384);
    smt_translator_relations::assert_formulas_zero(&s, formulas);

    ASSERT_TRUE(s.check()) << "Decomposition relation should be satisfiable";
}

/**
 * @brief Test accumulator limb maximum values
 *
 * Verifies that accumulator limbs (accumulators_binary_limbs_0 through _3) are
 * bounded to their expected bit lengths:
 * - Limbs 0-2: 68 bits (5 x 14-bit microlimbs + 1 x 12-bit tail = 82 bits total capacity, but constrained to 68)
 * - Limb 3: 50 bits (4 x 14-bit microlimbs with 8-bit top = 50 bits)
 *
 * Note: Accumulator limbs don't have uniqueness tests because their decomposition
 * depends on additional context not captured in the standalone relation.
 *
 * Runtime: ~1.5s
 */
TEST(TranslatorDecompositionRelation, AccumulatorLimbsAreBounded)
{
    auto trace = smt_translator_relations::record_translator_decomposition_relation();

    std::vector<LimbDecomposition> acc_limbs = { get_accumulator_limb_0_decomp(),
                                                 get_accumulator_limb_1_decomp(),
                                                 get_accumulator_limb_2_decomp(),
                                                 get_accumulator_limb_3_decomp() };

    for (const auto& decomp : acc_limbs) {
        uint256_t max_val = find_limb_maximum(trace, decomp);
        uint64_t bits = max_val.get_msb() + 1;

        auto expected_it = EXPECTED_LIMB_BIT_LENGTHS.find(decomp.limb_name);
        ASSERT_TRUE(expected_it != EXPECTED_LIMB_BIT_LENGTHS.end())
            << "Missing expected bit length for " << decomp.limb_name;
        EXPECT_EQ(bits, expected_it->second) << "Unexpected bit length for " << decomp.limb_name;

        std::cerr << decomp.limb_name << ": " << bits << " bits\n";
    }
}

/**
 * @brief Test wide limb maximum values
 *
 * Verifies that wide limbs (relation_wide_limbs and relation_wide_limbs_shift) are
 * bounded to 80 bits. These limbs use 6 microlimbs including borrowed tail microlimbs
 * from other decompositions (p_x_high and accumulator_high tails).
 *
 * Note: Wide limbs don't have uniqueness tests because they borrow microlimbs from
 * other decompositions, making their decomposition context-dependent.
 *
 * Runtime: ~70ms
 */
TEST(TranslatorDecompositionRelation, WideLimbsAreBounded)
{
    auto trace = smt_translator_relations::record_translator_decomposition_relation();

    std::vector<LimbDecomposition> wide_limbs = { get_wide_limbs_decomp(), get_wide_limbs_shift_decomp() };

    for (const auto& decomp : wide_limbs) {
        uint256_t max_val = find_limb_maximum(trace, decomp);
        uint64_t bits = max_val.get_msb() + 1;

        auto expected_it = EXPECTED_LIMB_BIT_LENGTHS.find(decomp.limb_name);
        ASSERT_TRUE(expected_it != EXPECTED_LIMB_BIT_LENGTHS.end())
            << "Missing expected bit length for " << decomp.limb_name;
        EXPECT_EQ(bits, expected_it->second) << "Unexpected bit length for " << decomp.limb_name;

        std::cerr << decomp.limb_name << ": " << bits << " bits\n";
    }
}

/**
 * @brief Test z scalar limb decompositions are unique and bounded
 *
 * Verifies that z limbs (z_low_limbs, z_low_limbs_shift, z_high_limbs, z_high_limbs_shift)
 * have unique decompositions and are bounded to their expected bit lengths:
 * - z_low: 68 bits (standard limb)
 * - z_high: 60 bits (4-bit top microlimb for 128-bit z scalar)
 *
 * The z scalar is split as: z = z_low + z_high * 2^68, where z < 2^128.
 *
 * Runtime: ~8.4s
 */
TEST(TranslatorDecompositionRelation, ZLimbsAreUniqueAndBounded)
{
    auto trace = smt_translator_relations::record_translator_decomposition_relation();

    std::vector<LimbDecomposition> z_limbs = {
        get_z_low_decomp(), get_z_low_shift_decomp(), get_z_high_decomp(), get_z_high_shift_decomp()
    };

    for (const auto& decomp : z_limbs) {
        EXPECT_TRUE(test_limb_uniqueness(trace, decomp)) << decomp.limb_name << " should have unique decomposition";

        uint256_t max_val = find_limb_maximum(trace, decomp);
        uint64_t bits = max_val.get_msb() + 1;

        auto expected_it = EXPECTED_LIMB_BIT_LENGTHS.find(decomp.limb_name);
        ASSERT_TRUE(expected_it != EXPECTED_LIMB_BIT_LENGTHS.end())
            << "Missing expected bit length for " << decomp.limb_name;
        EXPECT_EQ(bits, expected_it->second) << "Unexpected bit length for " << decomp.limb_name;

        EXPECT_TRUE(verify_maximum_is_tight(trace, decomp, max_val))
            << "Maximum should be tight for " << decomp.limb_name;

        std::cerr << decomp.limb_name << ": UNIQUE, " << bits << " bits\n";
    }
}

/**
 * @brief Test p_y coordinate limb decompositions are unique and bounded
 *
 * Verifies that p_y limbs have unique decompositions and are bounded:
 * - p_y_low, p_y_low_shift, p_y_high: 68 bits
 * - p_y_high_shift: 50 bits (8-bit top microlimb for 254-bit field element)
 *
 * The p_y coordinate is a BN254 field element split into 4 limbs:
 * p_y = p_y_low + p_y_low_shift*2^68 + p_y_high*2^136 + p_y_high_shift*2^204
 *
 * Runtime: ~9.6s
 */
TEST(TranslatorDecompositionRelation, PyLimbsAreUniqueAndBounded)
{
    auto trace = smt_translator_relations::record_translator_decomposition_relation();

    std::vector<LimbDecomposition> py_limbs = {
        get_p_y_low_decomp(), get_p_y_low_shift_decomp(), get_p_y_high_decomp(), get_p_y_high_shift_decomp()
    };

    for (const auto& decomp : py_limbs) {
        EXPECT_TRUE(test_limb_uniqueness(trace, decomp)) << decomp.limb_name << " should have unique decomposition";

        uint256_t max_val = find_limb_maximum(trace, decomp);
        uint64_t bits = max_val.get_msb() + 1;

        auto expected_it = EXPECTED_LIMB_BIT_LENGTHS.find(decomp.limb_name);
        ASSERT_TRUE(expected_it != EXPECTED_LIMB_BIT_LENGTHS.end())
            << "Missing expected bit length for " << decomp.limb_name;
        EXPECT_EQ(bits, expected_it->second) << "Unexpected bit length for " << decomp.limb_name;

        EXPECT_TRUE(verify_maximum_is_tight(trace, decomp, max_val))
            << "Maximum should be tight for " << decomp.limb_name;

        std::cerr << decomp.limb_name << ": UNIQUE, " << bits << " bits\n";
    }
}

/**
 * @brief Test p_x coordinate limb decompositions are unique and bounded
 *
 * Verifies that p_x limbs have unique decompositions and are bounded:
 * - p_x_low, p_x_low_shift, p_x_high: 68 bits
 * - p_x_high_shift: 50 bits (8-bit top microlimb for 254-bit field element)
 *
 * The p_x coordinate is a BN254 field element split into 4 limbs:
 * p_x = p_x_low + p_x_low_shift*2^68 + p_x_high*2^136 + p_x_high_shift*2^204
 *
 * Runtime: ~8.4s
 */
TEST(TranslatorDecompositionRelation, PxLimbsAreUniqueAndBounded)
{
    auto trace = smt_translator_relations::record_translator_decomposition_relation();

    std::vector<LimbDecomposition> px_limbs = {
        get_p_x_low_decomp(), get_p_x_low_shift_decomp(), get_p_x_high_decomp(), get_p_x_high_shift_decomp()
    };

    for (const auto& decomp : px_limbs) {
        EXPECT_TRUE(test_limb_uniqueness(trace, decomp)) << decomp.limb_name << " should have unique decomposition";

        uint256_t max_val = find_limb_maximum(trace, decomp);
        uint64_t bits = max_val.get_msb() + 1;

        auto expected_it = EXPECTED_LIMB_BIT_LENGTHS.find(decomp.limb_name);
        ASSERT_TRUE(expected_it != EXPECTED_LIMB_BIT_LENGTHS.end())
            << "Missing expected bit length for " << decomp.limb_name;
        EXPECT_EQ(bits, expected_it->second) << "Unexpected bit length for " << decomp.limb_name;

        EXPECT_TRUE(verify_maximum_is_tight(trace, decomp, max_val))
            << "Maximum should be tight for " << decomp.limb_name;

        std::cerr << decomp.limb_name << ": UNIQUE, " << bits << " bits\n";
    }
}

/**
 * @brief Test quotient limb decompositions are unique and bounded
 *
 * Verifies that quotient limbs have unique decompositions and are bounded:
 * - quotient_low, quotient_low_shift, quotient_high: 68 bits
 * - quotient_high_shift: 52 bits (10-bit top microlimb)
 *
 * The quotient is used in the bigfield modular reduction and represents
 * the number of times the modulus fits into the unreduced product.
 *
 * Runtime: ~8.6s
 */
TEST(TranslatorDecompositionRelation, QuotientLimbsAreUniqueAndBounded)
{
    auto trace = smt_translator_relations::record_translator_decomposition_relation();

    std::vector<LimbDecomposition> q_limbs = { get_quotient_low_decomp(),
                                               get_quotient_low_shift_decomp(),
                                               get_quotient_high_decomp(),
                                               get_quotient_high_shift_decomp() };

    for (const auto& decomp : q_limbs) {
        EXPECT_TRUE(test_limb_uniqueness(trace, decomp)) << decomp.limb_name << " should have unique decomposition";

        uint256_t max_val = find_limb_maximum(trace, decomp);
        uint64_t bits = max_val.get_msb() + 1;

        auto expected_it = EXPECTED_LIMB_BIT_LENGTHS.find(decomp.limb_name);
        ASSERT_TRUE(expected_it != EXPECTED_LIMB_BIT_LENGTHS.end())
            << "Missing expected bit length for " << decomp.limb_name;
        EXPECT_EQ(bits, expected_it->second) << "Unexpected bit length for " << decomp.limb_name;

        EXPECT_TRUE(verify_maximum_is_tight(trace, decomp, max_val))
            << "Maximum should be tight for " << decomp.limb_name;

        std::cerr << decomp.limb_name << ": UNIQUE, " << bits << " bits\n";
    }
}

/**
 * @brief Test composite value decompositions are unique
 *
 * Verifies that the higher-level composite values (x_lo, x_hi, y_lo, y_hi, z1, z2)
 * have unique decompositions into their constituent limbs.
 *
 * These composite values represent:
 * - x_lo, x_hi: Low and high 136-bit parts of the p_x coordinate (x = x_lo + x_hi * 2^136)
 * - y_lo, y_hi: Low and high 136-bit parts of the p_y coordinate (y = y_lo + y_hi * 2^136)
 * - z1, z2: The two 128-bit z scalars used in the accumulator computation
 *
 * Each composite value is constrained by its decomposition into 68-bit limbs:
 * - x_lo = p_x_low_limbs + p_x_low_limbs_shift * 2^68
 * - x_hi = p_x_high_limbs + p_x_high_limbs_shift * 2^68
 * (and similarly for y and z)
 *
 * Runtime: ~8.3s
 */
TEST(TranslatorDecompositionRelation, CompositeValuesAreUnique)
{
    auto trace = smt_translator_relations::record_translator_decomposition_relation();

    // First collect max values for all limbs (needed for range constraints on limbs)
    auto all_decomps = get_all_decompositions();
    std::vector<uint256_t> max_values;
    for (const auto& decomp : all_decomps) {
        max_values.push_back(find_limb_maximum(trace, decomp));
    }

    // Configuration for each composite value test
    struct CompositeConfig {
        std::string name;
        size_t lo_relation;
        size_t hi_relation;
        std::string lo_var_name;
        std::string hi_var_name;
        std::string low_limb;
        std::string low_limb_shift;
        std::string high_limb;
        std::string high_limb_shift;
        size_t base_idx;
        bool is_lo;
        bool is_z;
    };

    std::vector<CompositeConfig> configs = {
        { "x_lo",
          relation_indices::X_LO,
          relation_indices::X_HI,
          "x_lo_y_hi",
          "x_hi_z_1",
          "p_x_low_limbs",
          "p_x_low_limbs_shift",
          "p_x_high_limbs",
          "p_x_high_limbs_shift",
          limb_indices::P_X_LOW,
          true,
          false },
        { "x_hi",
          relation_indices::X_LO,
          relation_indices::X_HI,
          "x_lo_y_hi",
          "x_hi_z_1",
          "p_x_low_limbs",
          "p_x_low_limbs_shift",
          "p_x_high_limbs",
          "p_x_high_limbs_shift",
          limb_indices::P_X_LOW,
          false,
          false },
        { "y_lo",
          relation_indices::Y_LO,
          relation_indices::Y_HI,
          "y_lo_z_2",
          "x_lo_y_hi_shift",
          "p_y_low_limbs",
          "p_y_low_limbs_shift",
          "p_y_high_limbs",
          "p_y_high_limbs_shift",
          limb_indices::P_Y_LOW,
          true,
          false },
        { "y_hi",
          relation_indices::Y_LO,
          relation_indices::Y_HI,
          "y_lo_z_2",
          "x_lo_y_hi_shift",
          "p_y_low_limbs",
          "p_y_low_limbs_shift",
          "p_y_high_limbs",
          "p_y_high_limbs_shift",
          limb_indices::P_Y_LOW,
          false,
          false },
        { "z1",
          relation_indices::Z1,
          relation_indices::Z2,
          "x_hi_z_1_shift",
          "y_lo_z_2_shift",
          "z_low_limbs",
          "z_low_limbs_shift",
          "z_high_limbs",
          "z_high_limbs_shift",
          limb_indices::Z_LOW,
          true,
          true },
        { "z2",
          relation_indices::Z1,
          relation_indices::Z2,
          "x_hi_z_1_shift",
          "y_lo_z_2_shift",
          "z_low_limbs",
          "z_low_limbs_shift",
          "z_high_limbs",
          "z_high_limbs_shift",
          limb_indices::Z_LOW,
          false,
          true },
    };

    for (const auto& cfg : configs) {
        smt_solver::Solver s(BN254_MODULUS, smt_solver::default_solver_config);

        std::vector<smt_terms::STerm> f1, v1, f2, v2;
        std::vector<std::string> n1, n2;

        smt_translator_relations::replay_translator_decomposition_relation(trace, &s, "V1", true, f1, v1, n1);
        smt_translator_relations::replay_translator_decomposition_relation(trace, &s, "V2", true, f2, v2, n2);

        smt_translator_relations::assert_formulas_zero(
            &s, { f1[cfg.lo_relation], f1[cfg.hi_relation], f2[cfg.lo_relation], f2[cfg.hi_relation] });

        // Find limb variables
        auto find_var = [](const std::vector<smt_terms::STerm>& vars,
                           const std::vector<std::string>& names,
                           const std::string& target) -> smt_terms::STerm {
            for (size_t i = 0; i < names.size(); ++i) {
                if (names[i] == target)
                    return vars[i];
            }
            throw std::runtime_error("Variable not found: " + target);
        };

        smt_terms::STerm v1_low = find_var(v1, n1, "V1_" + cfg.low_limb);
        smt_terms::STerm v1_low_shift = find_var(v1, n1, "V1_" + cfg.low_limb_shift);
        smt_terms::STerm v1_high = find_var(v1, n1, "V1_" + cfg.high_limb);
        smt_terms::STerm v1_high_shift = find_var(v1, n1, "V1_" + cfg.high_limb_shift);
        smt_terms::STerm v2_low = find_var(v2, n2, "V2_" + cfg.low_limb);
        smt_terms::STerm v2_low_shift = find_var(v2, n2, "V2_" + cfg.low_limb_shift);
        smt_terms::STerm v2_high = find_var(v2, n2, "V2_" + cfg.high_limb);
        smt_terms::STerm v2_high_shift = find_var(v2, n2, "V2_" + cfg.high_limb_shift);

        smt_terms::STerm v1_var = find_var(v1, n1, "V1_" + (cfg.is_lo ? cfg.lo_var_name : cfg.hi_var_name));
        smt_terms::STerm v2_var = find_var(v2, n2, "V2_" + (cfg.is_lo ? cfg.lo_var_name : cfg.hi_var_name));

        // Range constraints on limbs
        smt_terms::STerm zero = smt_terms::FFIConst("0", &s, 10);
        smt_terms::STerm max_low = smt_terms::FFIConst(to_dec_string(max_values[cfg.base_idx + 0]), &s, 10);
        smt_terms::STerm max_low_shift = smt_terms::FFIConst(to_dec_string(max_values[cfg.base_idx + 1]), &s, 10);
        smt_terms::STerm max_high = smt_terms::FFIConst(to_dec_string(max_values[cfg.base_idx + 2]), &s, 10);
        smt_terms::STerm max_high_shift = smt_terms::FFIConst(to_dec_string(max_values[cfg.base_idx + 3]), &s, 10);

        auto add_range = [&s](const smt_terms::STerm& var, const smt_terms::STerm& lo, const smt_terms::STerm& hi) {
            s.assertFormula(
                s.term_manager.mkTerm(cvc5::Kind::GEQ, { static_cast<cvc5::Term>(var), static_cast<cvc5::Term>(lo) }));
            s.assertFormula(
                s.term_manager.mkTerm(cvc5::Kind::LEQ, { static_cast<cvc5::Term>(var), static_cast<cvc5::Term>(hi) }));
        };

        add_range(v1_low, zero, max_low);
        add_range(v1_low_shift, zero, max_low_shift);
        add_range(v1_high, zero, max_high);
        add_range(v1_high_shift, zero, max_high_shift);
        add_range(v2_low, zero, max_low);
        add_range(v2_low_shift, zero, max_low_shift);
        add_range(v2_high, zero, max_high);
        add_range(v2_high_shift, zero, max_high_shift);

        // Same composite value
        s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                              { static_cast<cvc5::Term>(v1_var), static_cast<cvc5::Term>(v2_var) }));

        // At least one limb differs
        std::vector<cvc5::Term> differs;
        if (cfg.is_z) {
            if (cfg.is_lo) {
                differs.push_back(s.term_manager.mkTerm(
                    cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(v1_low), static_cast<cvc5::Term>(v2_low) }));
                differs.push_back(s.term_manager.mkTerm(
                    cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(v1_high), static_cast<cvc5::Term>(v2_high) }));
            } else {
                differs.push_back(s.term_manager.mkTerm(
                    cvc5::Kind::DISTINCT,
                    { static_cast<cvc5::Term>(v1_low_shift), static_cast<cvc5::Term>(v2_low_shift) }));
                differs.push_back(s.term_manager.mkTerm(
                    cvc5::Kind::DISTINCT,
                    { static_cast<cvc5::Term>(v1_high_shift), static_cast<cvc5::Term>(v2_high_shift) }));
            }
        } else {
            if (cfg.is_lo) {
                differs.push_back(s.term_manager.mkTerm(
                    cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(v1_low), static_cast<cvc5::Term>(v2_low) }));
                differs.push_back(s.term_manager.mkTerm(
                    cvc5::Kind::DISTINCT,
                    { static_cast<cvc5::Term>(v1_low_shift), static_cast<cvc5::Term>(v2_low_shift) }));
            } else {
                differs.push_back(s.term_manager.mkTerm(
                    cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(v1_high), static_cast<cvc5::Term>(v2_high) }));
                differs.push_back(s.term_manager.mkTerm(
                    cvc5::Kind::DISTINCT,
                    { static_cast<cvc5::Term>(v1_high_shift), static_cast<cvc5::Term>(v2_high_shift) }));
            }
        }
        s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::OR, differs));

        EXPECT_FALSE(s.check()) << cfg.name << " should have unique decomposition";
        std::cerr << cfg.name << ": UNIQUE\n";
    }
}
