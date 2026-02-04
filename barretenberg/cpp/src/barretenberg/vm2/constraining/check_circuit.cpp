#include "barretenberg/vm2/constraining/check_circuit.hpp"

#include <array>
#include <functional>
#include <span>
#include <stdexcept>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::constraining {

void run_check_circuit(AvmFlavor::ProverPolynomials& polys, size_t num_rows, bool skippable_enabled)
{
    bb::RelationParameters<AvmFlavor::FF> params = {
        .eta = 0,
        .beta = AvmFlavor::FF::random_element(),
        .gamma = AvmFlavor::FF::random_element(),
        .public_input_delta = 0,
        .beta_sqr = 0,
        .beta_cube = 0,
        .eccvm_set_permutation_delta = 0,
    };

    // Checks that we will run.
    std::vector<std::function<void()>> checks;

    // Add relation checks.
    bb::constexpr_for<0, std::tuple_size_v<typename AvmFlavor::MainRelations>, 1>([&]<size_t i>() {
        using Relation = std::tuple_element_t<i, typename AvmFlavor::MainRelations>;
        checks.push_back([&]() {
            typename Relation::SumcheckArrayOfValuesOverSubrelations result{};

            for (size_t r = 0; r < num_rows; ++r) {
                auto row = polys.get_row(r);
                if constexpr (isSkippable<Relation, decltype(row)>) {
                    if (skippable_enabled && Relation::skip(row)) {
                        continue;
                    }
                }

                Relation::accumulate(result, row, {}, 1);

                // Check the linearly independent part of the relation.
                for (size_t j = 0; j < result.size(); ++j) {
                    if (detail::subrelation_is_linearly_independent<Relation>(j) && !result[j].is_zero()) {
                        throw std::runtime_error(format("Relation ",
                                                        Relation::NAME,
                                                        ", subrelation ",
                                                        Relation::get_subrelation_label(j),
                                                        " failed at row ",
                                                        r));
                    }
                }
            }
            // Do final check (accumulation over all rows) for all the subrelations and in
            // particular the linearly dependent ones. (Linearly independent sub-relations are
            // checked to be zero as each row by the above loop so their accumulation is zero.)
            for (size_t j = 0; j < result.size(); ++j) {
                if (!result[j].is_zero()) {
                    throw std::runtime_error(format(
                        "Relation ", Relation::NAME, ", subrelation ", Relation::get_subrelation_label(j), " failed."));
                }
            }
        });
    });

    // Add calculation of logderivatives and lookup/permutation checks.
    bb::constexpr_for<0, std::tuple_size_v<typename AvmFlavor::LookupRelations>, 1>([&]<size_t i>() {
        using Relation = std::tuple_element_t<i, typename AvmFlavor::LookupRelations>;
        checks.push_back([&, num_rows]() {
            // We need to resize the inverse polynomials for the relation, now that the selectors have been computed.
            constraining::resize_inverses(polys,
                                          Relation::Settings::INVERSES,
                                          Relation::Settings::SRC_SELECTOR,
                                          Relation::Settings::DST_SELECTOR);

            // Compute logderivs.
            bb::compute_logderivative_inverse<typename AvmFlavor::FF, Relation>(polys, params, num_rows);

            // Check the logderivative relation
            typename Relation::SumcheckArrayOfValuesOverSubrelations lookup_result{};
            for (size_t r = 0; r < num_rows; ++r) {
                auto row = polys.get_row(r);
                if constexpr (isSkippable<Relation, decltype(row)>) {
                    if (skippable_enabled && Relation::skip(row)) {
                        continue;
                    }
                }

                Relation::accumulate(lookup_result, row, params, 1);

                for (size_t subrelation_idx = 0; subrelation_idx < lookup_result.size(); ++subrelation_idx) {
                    // We need to check the linearly independent part of the relation.
                    if (detail::subrelation_is_linearly_independent<Relation>(subrelation_idx) &&
                        !lookup_result[subrelation_idx].is_zero()) {
                        throw std::runtime_error(format("Lookup ",
                                                        Relation::NAME,
                                                        ", subrelation ",
                                                        Relation::get_subrelation_label(subrelation_idx),
                                                        " failed at row ",
                                                        r));
                    }
                }
            }
            // Do final check for the linearly dependent part of the relation.
            for (auto r : lookup_result) {
                if (!r.is_zero()) {
                    throw std::runtime_error(format("Lookup ", Relation::NAME, " failed."));
                }
            }
        });
    });

    // Do it!
    bb::parallel_for(checks.size(), [&](size_t i) { checks[i](); });
}

} // namespace bb::avm2::constraining
