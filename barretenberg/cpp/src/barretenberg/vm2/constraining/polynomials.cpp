#include "barretenberg/vm2/constraining/polynomials.hpp"

#include <cstdint>

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::avm2::constraining {

AvmProver::ProverPolynomials compute_polynomials(tracegen::TraceContainer& trace)
{
    AvmProver::ProverPolynomials polys;

    // Polynomials that will be shifted need special care.
    AVM_TRACK_TIME("proving/init_polys_to_be_shifted", ({
                       auto to_be_shifted = polys.get_to_be_shifted();
                       assert(to_be_shifted.size() == TO_BE_SHIFTED_COLUMNS_ARRAY.size());

                       // NOTE: we can't parallelize because Polynomial construction uses parallelism.
                       for (size_t i = 0; i < to_be_shifted.size(); i++) {
                           auto& poly = to_be_shifted[i];
                           // WARNING! Column-Polynomials order matters!
                           Column col = static_cast<Column>(TO_BE_SHIFTED_COLUMNS_ARRAY.at(i));
                           uint32_t num_rows = trace.get_column_rows(col);
                           // Since we are shifting, we need to allocate one less row.
                           // The first row is always zero.
                           uint32_t allocated_size = num_rows > 0 ? num_rows - 1 : 0;

                           poly = AvmProver::Polynomial(
                               /*memory size*/ allocated_size,
                               /*largest possible index*/ MAX_AVM_TRACE_SIZE, // TODO(#16660): use real size?
                               /*make shiftable with offset*/ 1);
                       }
                   }));

    // Catch-all with fully formed polynomials
    // Note: derived polynomials (i.e., inverses) are not in the trace at this point, because they can only
    // be computed after committing to the other witnesses. Therefore, they will be initialized as empty
    // and they will be not set below. The derived polynomials will be reinitialized and set in the prover
    // itself mid-proving.
    AVM_TRACK_TIME("proving/init_polys_unshifted", ({
                       auto unshifted = polys.get_unshifted();
                       bb::parallel_for(unshifted.size(), [&](size_t i) {
                           auto& poly = unshifted[i];
                           // Some of the polynomials have been initialized above. Skip those.
                           if (poly.virtual_size() > 0) {
                               // Already initialized above.
                               return;
                           }

                           // WARNING! Column-Polynomials order matters!
                           Column col = static_cast<Column>(i);
                           const auto num_rows = trace.get_column_rows(col);
                           poly = AvmProver::Polynomial::create_non_parallel_zero_init(num_rows, MAX_AVM_TRACE_SIZE);
                       });
                   }));

    AVM_TRACK_TIME("proving/set_polys_unshifted", ({
                       auto unshifted = polys.get_unshifted();
                       bb::parallel_for(unshifted.size(), [&](size_t i) {
                           // WARNING! Column-Polynomials order matters!
                           auto& poly = unshifted[i];
                           Column col = static_cast<Column>(i);

                           trace.visit_column(col, [&](size_t row, const AvmProver::FF& value) {
                               // We use `at` because we are sure the row exists and the value is non-zero.
                               poly.at(row) = value;
                           });
                           // We free columns as we go.
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

void resize_inverses(AvmFlavor::ProverPolynomials& prover_polynomials,
                     Column inverses_col,
                     Column src_selector_col,
                     Column dst_selector_col)
{
    auto& inverse_polynomial = prover_polynomials.get(static_cast<ColumnAndShifts>(inverses_col));
    const auto& src_selector = prover_polynomials.get(static_cast<ColumnAndShifts>(src_selector_col));
    const auto& dst_selector = prover_polynomials.get(static_cast<ColumnAndShifts>(dst_selector_col));

    if (!inverse_polynomial.is_empty()) {
        throw std::runtime_error("Inverse polynomial is expected to be empty at this point.");
    }

    const size_t num_rows = std::max<size_t>(src_selector.end_index(), dst_selector.end_index());
    inverse_polynomial = AvmProver::Polynomial::create_non_parallel_zero_init(num_rows, MAX_AVM_TRACE_SIZE);
    assert(prover_polynomials.get(static_cast<ColumnAndShifts>(inverses_col)).size() == num_rows);
}

} // namespace bb::avm2::constraining
