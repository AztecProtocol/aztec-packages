// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

namespace bb {

/**
 * @brief A container for polynomials handles used by the prover.
 * @details This base class provides the common implementation for all flavors. Each flavor
 * should define a type alias like:
 *   template <bool HasZK_ = HasZK>
 *   using ProverPolynomials_ = ProverPolynomialsBase<AllEntities_<Polynomial, HasZK_>, AllValues_<HasZK_>, Polynomial>;
 *
 * @tparam AllEntitiesBase The AllEntities<Polynomial> type from the flavor
 * @tparam AllValuesType The AllValues type from the flavor
 * @tparam Polynomial The Polynomial type from the flavor
 */
template <typename AllEntitiesBase, typename AllValuesType, typename Polynomial>
class ProverPolynomialsBase : public AllEntitiesBase {
  public:
    // Define all operations as default, except copy construction/assignment
    ProverPolynomialsBase() = default;
    ProverPolynomialsBase& operator=(const ProverPolynomialsBase&) = delete;
    ProverPolynomialsBase(const ProverPolynomialsBase& o) = delete;
    ProverPolynomialsBase(ProverPolynomialsBase&& o) noexcept = default;
    ProverPolynomialsBase& operator=(ProverPolynomialsBase&& o) noexcept = default;
    ~ProverPolynomialsBase() = default;
    [[nodiscard]] size_t get_polynomial_size() const { return this->q_c().virtual_size(); }
    [[nodiscard]] AllValuesType get_row(size_t row_idx) const
    {
        AllValuesType result;
        for (auto [result_field, polynomial] : zip_view(result.get_all(), this->get_all())) {
            result_field = polynomial[row_idx];
        }
        return result;
    }

    [[nodiscard]] AllValuesType get_row_for_permutation_arg(size_t row_idx)
    {
        AllValuesType result;
        for (auto [result_field, polynomial] : zip_view(result.get_sigmas(), this->get_sigmas())) {
            result_field = polynomial[row_idx];
        }
        for (auto [result_field, polynomial] : zip_view(result.get_ids(), this->get_ids())) {
            result_field = polynomial[row_idx];
        }
        for (auto [result_field, polynomial] : zip_view(result.get_wires(), this->get_wires())) {
            result_field = polynomial[row_idx];
        }
        return result;
    }

    // Set all shifted polynomials based on their to-be-shifted counterpart
    void set_shifted()
    {
        for (auto [shifted, to_be_shifted] : zip_view(this->get_shifted(), this->get_to_be_shifted())) {
            shifted = to_be_shifted.shifted();
        }
    }

    // Returns the maximum end_index across all polynomials (i.e. the actual data extent)
    [[nodiscard]] size_t max_end_index() const
    {
        size_t result = 0;
        for (const auto& poly : this->get_all()) {
            result = std::max(result, poly.end_index());
        }
        return result;
    }

    void increase_polynomials_virtual_size(const size_t size_in)
    {
        for (auto& polynomial : this->get_all()) {
            polynomial.increase_virtual_size(size_in);
        }
    }
};

} // namespace bb
