#pragma once

#include "barretenberg/smt_verification/terms/term.hpp"
#include <stdexcept>
#include <string>
#include <vector>

namespace eccvm_relation_test_helpers {

// Grumpkin base field (fq) modulus used in ECCVM tests
// Note: Grumpkin fq is the same as BN254 fr
// ECCVM relations use FF::modulus == grumpkin::fq::modulus to identify the Grumpkin curve
inline constexpr const char* GRUMPKIN_FQ_MODULUS = "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001";

/**
 * @brief Find a variable by name in the vars/names vectors returned by replay functions
 * @throws std::runtime_error if the variable is not found
 */
inline smt_terms::STerm find_var(const std::vector<smt_terms::STerm>& vars,
                                 const std::vector<std::string>& names,
                                 const std::string& name)
{
    for (size_t i = 0; i < names.size(); ++i) {
        if (names[i] == name) {
            return vars[i];
        }
    }
    throw std::runtime_error("Variable not found: " + name);
}

} // namespace eccvm_relation_test_helpers
