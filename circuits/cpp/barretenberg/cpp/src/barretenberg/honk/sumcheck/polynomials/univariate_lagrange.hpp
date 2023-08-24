#include "barycentric_data.hpp"

/**
 * @brief A container for a
 *
 */
namespace proof_system::honk::sumcheck {
template <class Fr, size_t domain_size, size_t center_idx> class LagrangeMultiple {
  public:
    static constexpr std::array<Fr, domain_size> construct_data()
    {
        std::array<Fr, domain_size> result;
        std::fill(result.begin(), result.end(), 0);
        std::get<center_idx>(result) = 1;
        return result;
    }

    static constexpr std::array<Fr, domain_size> evaluations = construct_data();

    template <size_t num_evals> Univariate<Fr, num_evals> extend()
    {
        Univariate<Fr, num_evals> result;
        Fr center = center_idx;
        for (size_t idx = 0; idx < domain_size; idx++) {
            result.evaluations[idx] = evaluations[idx];
        }
        using Barycentric = BarycentricDataCompileTime<Fr, domain_size, num_evals>;
        // WORKTODO: inefficient inversions
        /* Using the initial formula
            L_i(k+1) = \prod_{j\in\{0,\ldots, k\}\setminus\{i\}}\frac{k+1-j}{i-j}
            = \frac{\prod_{j\in\{0,\ldots, k\}\setminus\{i\}}k+1-j}
                {\prod_{j\in\{0,\ldots, k\}\setminus\{i\}} i-j}
            = \frac{(k+1)!}{d_i\cdot (k+1-i) \cdot 1},
         */
        Fr new_value = std::get<center_idx>(Barycentric::lagrange_denominators);
        new_value = Fr(1) / new_value;
        for (size_t idx = 1; idx < 1 + domain_size; idx++) {
            if (idx != domain_size - center_idx) {
                new_value *= idx;
            }
        }
        std::get<domain_size>(result.evaluations) = new_value;

        Fr denominator = 1;
        Fr counter = 1;
        /* Using the recursive formula
            L_i(k+s+1) = \frac{(k+s+1)(k+s-i)}{(k+s+1-i)(s+1)} L_i(k+s).
         */
        for (size_t point_idx = domain_size + 1; point_idx < num_evals; point_idx++) {
            Fr point = point_idx;
            new_value *= point;
            new_value *= point - (Fr(1) + center);
            denominator = counter * (point - center);
            new_value /= denominator;
            result.evaluations[point_idx] = new_value;
            counter += 1;
        }
        return result;
    }
};
} // namespace proof_system::honk::sumcheck