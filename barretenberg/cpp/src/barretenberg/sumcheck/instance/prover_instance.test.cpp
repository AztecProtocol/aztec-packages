
#include "prover_instance.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_library.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"
#include <gtest/gtest.h>
using namespace bb;

template <class Flavor> class InstanceTests : public testing::Test {
    using FF = typename Flavor::FF;
    using Polynomial = bb::Polynomial<FF>;
    using Builder = typename Flavor::CircuitBuilder;

  public:
    /**
     * @brief Get a random polynomial
     *
     * @param size
     * @return Polynomial
     */
    static constexpr Polynomial get_random_polynomial(size_t size)
    {
        Polynomial random_polynomial{ size };
        for (auto& coeff : random_polynomial) {
            coeff = FF::random_element();
        }
        return random_polynomial;
    }

    static void populate_span(auto& polynomial_view, const auto& polynomial)
    {
        ASSERT(polynomial_view.size() <= polynomial.size());
        for (size_t idx = 0; idx < polynomial.size(); idx++) {
            polynomial_view[idx] = polynomial[idx];
        }
    };
};