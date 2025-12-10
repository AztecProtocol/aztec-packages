#pragma once

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/terms/term.hpp"
#include <string>
#include <unordered_map>

namespace translator_relation_test_helpers {

// BN254 field modulus used in translator VM tests
inline constexpr const char* BN254_MODULUS = "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001";

// Expected maximum bit lengths per limb (used for regression checks)
inline const std::unordered_map<std::string, size_t> EXPECTED_LIMB_BIT_LENGTHS = {
    { "accumulators_binary_limbs_0", 68 },
    { "accumulators_binary_limbs_1", 68 },
    { "accumulators_binary_limbs_2", 68 },
    { "accumulators_binary_limbs_3", 50 },
    { "relation_wide_limbs", 80 },
    { "relation_wide_limbs_shift", 80 },
    { "z_low_limbs", 68 },
    { "z_low_limbs_shift", 68 },
    { "z_high_limbs", 60 },
    { "z_high_limbs_shift", 60 },
    { "p_y_low_limbs", 68 },
    { "p_y_low_limbs_shift", 68 },
    { "p_y_high_limbs", 68 },
    { "p_y_high_limbs_shift", 50 },
    { "p_x_low_limbs", 68 },
    { "p_x_low_limbs_shift", 68 },
    { "p_x_high_limbs", 68 },
    { "p_x_high_limbs_shift", 50 },
    { "quotient_low_binary_limbs", 68 },
    { "quotient_low_binary_limbs_shift", 68 },
    { "quotient_high_binary_limbs", 68 },
    { "quotient_high_binary_limbs_shift", 52 }
};

// Convert uint256_t to decimal string
inline std::string to_dec_string(const uint256_t& value)
{
    if (value == 0) {
        return "0";
    }
    std::string result;
    uint256_t temp = value;
    uint256_t base = 10;
    while (temp > 0) {
        uint256_t digit = temp % base;
        result = char('0' + static_cast<uint64_t>(digit.data[0])) + result;
        temp = temp / base;
    }
    return result;
}

// Convert decimal string to uint256_t
inline uint256_t from_dec_string(const std::string& dec_str)
{
    uint256_t result = 0;
    uint256_t base = 10;
    for (char c : dec_str) {
        if (c < '0' || c > '9') {
            throw std::runtime_error("Invalid decimal string");
        }
        result = result * base + uint256_t(static_cast<uint64_t>(c - '0'));
    }
    return result;
}

// Set a single parameter in the relation
inline void set_relation_parameter(std::vector<smt_terms::STerm>& vars,
                                   const std::vector<std::string>& names,
                                   smt_solver::Solver& s,
                                   const std::string& prefix,
                                   const std::string& target_name,
                                   const uint256_t& value)
{
    const std::string full_name = prefix.empty() ? target_name : prefix + "_" + target_name;
    auto it = std::find(names.begin(), names.end(), full_name);
    if (it == names.end()) {
        throw std::runtime_error("Parameter not found: " + full_name);
    }
    size_t index = static_cast<size_t>(std::distance(names.begin(), it));
    smt_terms::STerm param = smt_terms::FFIConst(to_dec_string(value), &s, 10);
    s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                          { static_cast<cvc5::Term>(vars[index]), static_cast<cvc5::Term>(param) }));
}

// Set multiple parameters in the relation
inline void set_relation_parameters(std::vector<smt_terms::STerm>& vars,
                                    const std::vector<std::string>& names,
                                    smt_solver::Solver& s,
                                    const std::string& prefix,
                                    const std::vector<std::pair<std::string, uint256_t>>& assignments)
{
    for (const auto& assignment : assignments) {
        set_relation_parameter(vars, names, s, prefix, assignment.first, assignment.second);
    }
}

// Apply expected limb bounds for a set of variables
inline void apply_expected_limb_bounds(smt_solver::Solver& s,
                                       const std::vector<smt_terms::STerm>& vars,
                                       const std::vector<std::string>& names,
                                       const std::string& prefix)
{
    smt_terms::STerm zero = smt_terms::FFIConst("0", &s, 10);
    const std::string prefix_with_sep = prefix.empty() ? std::string() : prefix + "_";

    auto apply_bound = [&](const std::string& name, const smt_terms::STerm& var) {
        auto it = EXPECTED_LIMB_BIT_LENGTHS.find(name);
        if (it == EXPECTED_LIMB_BIT_LENGTHS.end()) {
            return; // Skip parameters and other non-limb variables
        }
        uint64_t bits = it->second;
        uint256_t upper = (uint256_t(1) << bits) - uint256_t(1);
        smt_terms::STerm upper_term = smt_terms::FFIConst(to_dec_string(upper), &s, 10);
        s.assertFormula(
            s.term_manager.mkTerm(cvc5::Kind::GEQ, { static_cast<cvc5::Term>(var), static_cast<cvc5::Term>(zero) }));
        s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::LEQ,
                                              { static_cast<cvc5::Term>(var), static_cast<cvc5::Term>(upper_term) }));
    };

    for (size_t i = 0; i < names.size(); ++i) {
        std::string base_name = names[i];
        if (!prefix_with_sep.empty()) {
            if (base_name.rfind(prefix_with_sep, 0) != 0) {
                continue;
            }
            base_name = base_name.substr(prefix_with_sep.size());
        }
        apply_bound(base_name, vars[i]);
        if (base_name == "relation_wide_limbs") {
            apply_bound("relation_wide_limbs_shift", vars[i]);
        } else if (base_name == "relation_wide_limbs_shift") {
            apply_bound("relation_wide_limbs", vars[i]);
        }
    }
}

} // namespace translator_relation_test_helpers
