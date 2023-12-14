#pragma once

#include "barretenberg/common/log.hpp"

namespace debug_utility {

// Determine whether a polynomial has at least one non-zero coefficient
bool is_non_zero(auto& polynomial)
{
    bool has_non_zero_coefficient = false;
    for (auto& coeff : polynomial) {
        has_non_zero_coefficient |= !coeff.is_zero();
    }
    return has_non_zero_coefficient;
}

void inspect_instance(auto& prover_instance)
{
    bool prover_polys_nonzero = true;
    size_t poly_idx = 0;
    std::vector<size_t> zero_polys;
    for (auto poly : prover_instance->prover_polynomials.get_all()) {
        if (!is_non_zero(poly)) {
            prover_polys_nonzero = false;
            zero_polys.emplace_back(poly_idx);
        }
        poly_idx++;
    }
    if (prover_polys_nonzero) {
        info("\nDebug Utility: All prover polynomials are non-zero.");
    } else {
        info("\nDebug Utility: The following prover polynomials are idenitcally zero: ");
        for (size_t poly_idx : zero_polys) {
            info("\tPolynomial index: ", poly_idx);
        }
    }
}

} // namespace debug_utility