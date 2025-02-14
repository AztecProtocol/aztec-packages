#include "barretenberg/vm2/constraining/polynomials.hpp"

#include <cstdint>

#include "barretenberg/common/thread.hpp"
#include "barretenberg/vm/stats.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::constraining {

AvmProver::ProverPolynomials compute_polynomials(tracegen::TraceContainer& trace)
{
    AvmProver::ProverPolynomials polys;

    // Polynomials that will be shifted need special care.
    AVM_TRACK_TIME("proving/init_polys_to_be_shifted", ({
                       auto to_be_shifted = polys.get_to_be_shifted();

                       // TODO: cannot parallelize because Polynomial construction uses parallelism.
                       for (size_t i = 0; i < to_be_shifted.size(); i++) {
                           auto& poly = to_be_shifted[i];
                           // WARNING! Column-Polynomials order matters!
                           Column col = static_cast<Column>(TO_BE_SHIFTED_COLUMNS_ARRAY.at(i));
                           // We need at least 2 rows for the shifted columns.
                           uint32_t num_rows = std::max<uint32_t>(trace.get_column_rows(col), 2);

                           poly = AvmProver::Polynomial(
                               /*memory size*/
                               num_rows - 1,
                               /*largest possible index*/ CIRCUIT_SUBGROUP_SIZE,
                               /*make shiftable with offset*/ 1);
                       }
                   }));

    // Catch-all with fully formed polynomials
    // Note: derived polynomials (i.e., inverses) are not in the trace at this point, because they can only
    // be computed after committing to the other witnesses. Therefore, they will be initialized as empty
    // and they will be not set below. The derived polynomials will be reinitialized and set in the prover
    // itself mid-proving. (TO BE DONE!).
    //
    // NOTE FOR SELF: however, the counts will be known here and the inv have the same size?
    // think about it and check the formula.
    AVM_TRACK_TIME("proving/init_polys_unshifted", ({
                       auto unshifted = polys.get_unshifted();

                       // Derived polynomials will be empty.
                       bb::parallel_for(unshifted.size(), [&](size_t i) {
                           auto& poly = unshifted[i];
                           // FIXME: this is a bad way to check if the polynomial is already initialized.
                           // It could be that it has been initialized, but it's all zeroes.
                           if (!poly.is_empty()) {
                               // Already initialized above.
                               return;
                           }

                           // WARNING! Column-Polynomials order matters!
                           Column col = static_cast<Column>(i);
                           const auto num_rows = trace.get_column_rows(col);
                           poly = AvmProver::Polynomial::create_non_parallel_zero_init(num_rows, CIRCUIT_SUBGROUP_SIZE);
                       });
                   }));

    AVM_TRACK_TIME("proving/set_polys_unshifted", ({
                       auto unshifted = polys.get_unshifted();

                       // TODO: We are now visiting per-column. Profile if per-row is better.
                       // This would need changes to the trace container.
                       bb::parallel_for(unshifted.size(), [&](size_t i) {
                           // WARNING! Column-Polynomials order matters!
                           auto& poly = unshifted[i];
                           Column col = static_cast<Column>(i);

                           trace.visit_column(col, [&](size_t row, const AvmProver::FF& value) {
                               // We use `at` because we are sure the row exists and the value is non-zero.
                               poly.at(row) = value;
                           });
                           // We free columns as we go.
                           // TODO: If we merge the init with the setting, this would be even more memory efficient.
                           trace.clear_column(col);
                       });
                   }));

    AVM_TRACK_TIME("proving/set_polys_shifted", ({
                       for (auto [shifted, to_be_shifted] : zip_view(polys.get_shifted(), polys.get_to_be_shifted())) {
                           shifted = to_be_shifted.shifted();
                       }
                   }));

    return polys;
}

} // namespace bb::avm2::constraining