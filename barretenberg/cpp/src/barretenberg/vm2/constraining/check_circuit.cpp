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
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::constraining {

void run_check_circuit(AvmFlavor::ProverPolynomials& polys, size_t num_rows)
{
    bb::RelationParameters<AvmFlavor::FF> params = {
        .eta = 0,
        .beta = AvmFlavor::FF::random_element(),
        .gamma = AvmFlavor::FF::random_element(),
        .public_input_delta = 0,
        .lookup_grand_product_delta = 0,
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
                Relation::accumulate(result, polys.get_row(r), {}, 1);
                for (size_t j = 0; j < result.size(); ++j) {
                    if (!result[j].is_zero()) {
                        throw std::runtime_error(format("Relation ",
                                                        Relation::NAME,
                                                        ", subrelation ",
                                                        Relation::get_subrelation_label(j),
                                                        " failed at row ",
                                                        r));
                    }
                }
            }
        });
    });

    // Add calculation of logderivatives and lookup/permutation checks.
    bb::constexpr_for<0, std::tuple_size_v<typename AvmFlavor::LookupRelations>, 1>([&]<size_t i>() {
        using Relation = std::tuple_element_t<i, typename AvmFlavor::LookupRelations>;
        checks.push_back([&, num_rows]() {
            // Compute logderivs.
            bb::compute_logderivative_inverse<typename AvmFlavor::FF, Relation>(polys, params, num_rows);

            // Check the logderivative relation
            typename Relation::SumcheckArrayOfValuesOverSubrelations lookup_result{};
            for (size_t r = 0; r < num_rows; ++r) {
                Relation::accumulate(lookup_result, polys.get_row(r), params, 1);
            }
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
