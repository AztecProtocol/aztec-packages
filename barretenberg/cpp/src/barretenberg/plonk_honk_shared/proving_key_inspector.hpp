#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"

namespace bb::proving_key_inspector {

// WORKTODO: add a check_relations method templated on Flavor that checks all realtions

/**
 * @brief Check that a given relation is satisfied for a set of polynomials
 *
 * @tparam Relation a linearly independent Relation to be checked
 * @param polynomials prover polynomials
 * @param params a RelationParameters instance
 */
template <typename Relation> static void check_relation(auto& polynomials, auto params)
{
    for (size_t i = 0; i < polynomials.get_polynomial_size(); i++) {
        // Define the appropriate SumcheckArrayOfValuesOverSubrelations type for the relation and initialize to zero
        using SumcheckArrayOfValuesOverSubrelations = typename Relation::SumcheckArrayOfValuesOverSubrelations;
        SumcheckArrayOfValuesOverSubrelations result;
        for (auto& element : result) {
            element = 0;
        }

        // Evaluate each constraint in the relation and check that each is satisfied
        Relation::accumulate(result, polynomials.get_row(i), params, 1);
        size_t subrelation_idx = 0;
        for (auto& element : result) {
            if (element != 0) {
                info("WARNING: Relation fails subrelation: ", subrelation_idx, " at row idx: ", i);
                ASSERT(false);
            }
            subrelation_idx++;
        }
    }
}

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
 * @param decider_proving_key
 */
void inspect_proving_key(auto& decider_proving_key)
{
    auto& prover_polys = decider_proving_key->prover_polynomials;
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

/**
 * @brief Print some useful info about polys related to the databus lookup relation
 *
 * @param decider_proving_key
 */
void print_databus_info(auto& decider_proving_key)
{
    info("\nProving Key Inspector: Printing databus gate info.");
    auto& key = decider_proving_key->proving_key;
    for (size_t idx = 0; idx < decider_proving_key->proving_key.circuit_size; ++idx) {
        if (key->q_busread[idx] == 1) {
            info("idx = ", idx);
            info("q_busread = ", key->q_busread[idx]);
            info("w_l = ", key->w_l[idx]);
            info("w_r = ", key->w_r[idx]);
        }
        if (key->calldata_read_counts[idx] > 0) {
            info("idx = ", idx);
            info("read_counts = ", key->calldata_read_counts[idx]);
            info("calldata = ", key->calldata[idx]);
            info("databus_id = ", key->databus_id[idx]);
        }
    }
    info();
}

} // namespace bb::proving_key_inspector