#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

namespace bb::prover_instance_inspector {

// Determine whether a polynomial has at least one non-zero coefficient
bool is_non_zero(auto& polynomial)
{
    for (auto& coeff : polynomial) {
        if (!coeff.is_zero()) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Utility for indicating which polynomials in a decider proving key are identically zero
 *
 * @param prover_instance
 */
void inspect_prover_instance(auto& prover_instance)
{
    auto& prover_polys = prover_instance->prover_polynomials;
    std::vector<std::string> zero_polys;
    for (auto [label, poly] : zip_view(prover_polys.get_labels(), prover_polys.get_all())) {
        if (!is_non_zero(poly)) {
            zero_polys.emplace_back(label);
        }
    }
    if (zero_polys.empty()) {
        info("\nProving Key Inspector: All prover polynomials are non-zero.");
    } else {
        info("\nProving Key Inspector: The following prover polynomials are identically zero: ");
        for (const std::string& label : zero_polys) {
            info("\t", label);
        }
    }
    info();
}

} // namespace bb::prover_instance_inspector
