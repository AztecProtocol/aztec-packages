#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/translator_vm/translator_decomposition_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_extra_relations_impl.hpp"
#include "barretenberg/smt_verification/terms/term.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include <string>
#include <unordered_set>

using namespace smt_terms;

namespace smt_translator_relations {

namespace detail {

// Build labels equal to the exact AllEntities member names, in the same order as get_all()
[[maybe_unused]] static std::vector<std::string> build_all_entity_member_names()
{
    std::vector<std::string> names;
    names.reserve(bb::TranslatorFlavor::NUM_ALL_ENTITIES);

    // PrecomputedEntities (use exact member names)
    names.push_back("ordered_extra_range_constraints_numerator");
    names.push_back("lagrange_first");
    names.push_back("lagrange_last");
    names.push_back("lagrange_odd_in_minicircuit");
    names.push_back("lagrange_even_in_minicircuit");
    names.push_back("lagrange_result_row");
    names.push_back("lagrange_last_in_minicircuit");
    names.push_back("lagrange_masking");
    names.push_back("lagrange_mini_masking");
    names.push_back("lagrange_real_last");

    // WireNonshiftedEntities
    names.push_back("op");

    // WireToBeShiftedEntities (base and range constraints)
    names.push_back("x_lo_y_hi");
    names.push_back("x_hi_z_1");
    names.push_back("y_lo_z_2");
    names.push_back("p_x_low_limbs");
    names.push_back("p_x_high_limbs");
    names.push_back("p_y_low_limbs");
    names.push_back("p_y_high_limbs");
    names.push_back("z_low_limbs");
    names.push_back("z_high_limbs");
    names.push_back("accumulators_binary_limbs_0");
    names.push_back("accumulators_binary_limbs_1");
    names.push_back("accumulators_binary_limbs_2");
    names.push_back("accumulators_binary_limbs_3");
    names.push_back("quotient_low_binary_limbs");
    names.push_back("quotient_high_binary_limbs");
    names.push_back("relation_wide_limbs");

    auto push_range = [&](const std::string& base, int start_idx, int end_idx, bool include_tail) {
        for (int i = start_idx; i <= end_idx; ++i) {
            names.push_back(base + std::string("_") + std::to_string(i));
        }
        if (include_tail) {
            names.push_back(base + std::string("_tail"));
        }
    };

    push_range("p_x_low_limbs_range_constraint", 0, 4, true);
    push_range("p_x_high_limbs_range_constraint", 0, 4, true);
    push_range("p_y_low_limbs_range_constraint", 0, 4, true);
    push_range("p_y_high_limbs_range_constraint", 0, 4, true);
    push_range("z_low_limbs_range_constraint", 0, 4, true);
    push_range("z_high_limbs_range_constraint", 0, 4, true);
    push_range("accumulator_low_limbs_range_constraint", 0, 4, true);
    push_range("accumulator_high_limbs_range_constraint", 0, 4, true);
    push_range("quotient_low_limbs_range_constraint", 0, 4, true);
    push_range("quotient_high_limbs_range_constraint", 0, 4, true);
    push_range("relation_wide_limbs_range_constraint", 0, 3, false);

    // OrderedRangeConstraints
    push_range("ordered_range_constraints", 0, 4, false);

    // DerivedWitnessEntities
    names.push_back("z_perm");

    // InterleavedRangeConstraints
    push_range("interleaved_range_constraints", 0, 3, false);

    // ShiftedEntities
    auto push_shift = [&](const std::string& n) { names.push_back(n + std::string("_shift")); };
    push_shift("x_lo_y_hi");
    push_shift("x_hi_z_1");
    push_shift("y_lo_z_2");
    push_shift("p_x_low_limbs");
    push_shift("p_x_high_limbs");
    push_shift("p_y_low_limbs");
    push_shift("p_y_high_limbs");
    push_shift("z_low_limbs");
    push_shift("z_high_limbs");
    push_shift("accumulators_binary_limbs_0");
    push_shift("accumulators_binary_limbs_1");
    push_shift("accumulators_binary_limbs_2");
    push_shift("accumulators_binary_limbs_3");
    push_shift("quotient_low_binary_limbs");
    push_shift("quotient_high_binary_limbs");
    push_shift("relation_wide_limbs");

    auto push_range_shift = [&](const std::string& base, int start_idx, int end_idx, bool include_tail) {
        for (int i = start_idx; i <= end_idx; ++i) {
            names.push_back(base + std::string("_") + std::to_string(i) + std::string("_shift"));
        }
        if (include_tail) {
            names.push_back(base + std::string("_tail_shift"));
        }
    };

    push_range_shift("p_x_low_limbs_range_constraint", 0, 4, true);
    push_range_shift("p_x_high_limbs_range_constraint", 0, 4, true);
    push_range_shift("p_y_low_limbs_range_constraint", 0, 4, true);
    push_range_shift("p_y_high_limbs_range_constraint", 0, 4, true);
    push_range_shift("z_low_limbs_range_constraint", 0, 4, true);
    push_range_shift("z_high_limbs_range_constraint", 0, 4, true);
    push_range_shift("accumulator_low_limbs_range_constraint", 0, 4, true);
    push_range_shift("accumulator_high_limbs_range_constraint", 0, 4, true);
    push_range_shift("quotient_low_limbs_range_constraint", 0, 4, true);
    push_range_shift("quotient_high_limbs_range_constraint", 0, 4, true);
    push_range_shift("relation_wide_limbs_range_constraint", 0, 3, false);
    push_range_shift("ordered_range_constraints", 0, 4, false);
    names.push_back("z_perm_shift");

    return names;
}

} // namespace detail

std::vector<STerm> create_range_constraint_formulas(Solver* solver,
                                                    const std::vector<STerm>& vars,
                                                    const std::vector<std::string>& var_names,
                                                    const std::string& name_pattern,
                                                    uint64_t upper_bound)
{
    using namespace detail;

    std::vector<STerm> constraints;

    STerm lower = FFIConst("0", solver, 10);
    STerm upper = FFIConst(std::to_string(upper_bound), solver, 10);

    for (size_t i = 0; i < vars.size(); ++i) {
        if (var_names[i].find(name_pattern) != std::string::npos) {
            // Create constraints: var >= 0 AND var < upper_bound
            // These will be automatically asserted when evaluated
            lower <= vars[i];
            vars[i] < upper;
        }
    }

    return constraints;
}

void assert_formulas_zero(Solver* solver, const std::vector<STerm>& formulas)
{
    using namespace detail;
    STerm zero = FFIConst("0", solver, 10);
    for (const auto& formula : formulas) {
        formula == zero;
    }
}

} // namespace smt_translator_relations
