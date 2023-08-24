#include "barycentric_data.hpp"

/**
 * @brief A container for a
 *
 */
namespace proof_system::honk::sumcheck {
template <class Fr, size_t domain_size, size_t center_idx, size_t num_evals> class LagrangeMultiple {
  public:
    static constexpr std::array<Fr, num_evals> construct_data()
    {
        std::array<Fr, num_evals> result;
        std::fill(result.begin(), result.end(), 0);
        std::get<center_idx>(result) = 1;

        /* Compute first value outside of domain, i.e., at the point == domain_size (here, k+1):
            L_i(k+1) = \prod_{j\in\{0,\ldots, k\}\setminus\{i\}}\frac{k+1-j}{i-j}
            = \frac{\prod_{j\in\{0,\ldots, k\}\setminus\{i\}}k+1-j}
                {\prod_{j\in\{0,\ldots, k\}\setminus\{i\}} i-j}
            = \frac{(k+1)!}{d_i\cdot (k+1-i) \cdot 1},
         */
        // WORKTODO: inefficient inversions
        using Barycentric = BarycentricDataCompileTime<Fr, domain_size, num_evals>;
        Fr center = center_idx;
        Fr new_value = std::get<center_idx>(Barycentric::lagrange_denominators);
        new_value = Fr(1) / new_value;
        for (size_t idx = 1; idx < 1 + domain_size; idx++) {
            if (idx != domain_size - center_idx) {
                new_value *= idx;
            }
        }
        std::get<domain_size>(result) = new_value;

        /* Using the recursive formula
            L_i(k+s+1) = \frac{(k+s+1)(k+s-i)}{(k+s+1-i)(s+1)} L_i(k+s).
         */
        Fr denominator = 1;
        Fr counter = 1;
        for (size_t point_idx = domain_size + 1; point_idx < num_evals; point_idx++) {
            Fr point = point_idx;
            new_value *= point;
            new_value *= point - (Fr(1) + center);
            denominator = counter * (point - center);
            new_value /= denominator;
            result[point_idx] = new_value;
            counter += 1;
        }
        return result;
    }

    // WORKTODO: faster with std::valarray?
    static constexpr std::array<Fr, num_evals> evaluations = construct_data();

    // WORKTODO: model for successive extension
    Univariate<Fr, num_evals> operator*=(Fr scalar){
        auto result = Univariate<Fr, num_evals>(evaluations);
        result *= scalar;
        return result;
    }
};
} // namespace proof_system::honk::sumcheck