#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"
#include <cstddef>
#include <gtest/gtest.h>

using namespace bb;

TEST(Flavor, Getters)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    using Flavor = UltraFlavor;
    using FF = Flavor::FF;
    using ProverPolynomials = Flavor::ProverPolynomials;

    const size_t circuit_size = 4;
    ProverPolynomials polynomials{ circuit_size };

    // set
    size_t coset_idx = 0;
    for (auto& id_poly : polynomials.get_ids()) {
        id_poly = typename Flavor::Polynomial(circuit_size);
        for (size_t i = 0; i < circuit_size; ++i) {
            id_poly.at(i) = coset_idx * circuit_size + i;
        }
        ++coset_idx;
    }

    // Polynomials in the proving key can be set through loops over subsets produced by the getters
    EXPECT_EQ(polynomials.id_1[0], FF(0));
    EXPECT_EQ(polynomials.id_2[0], FF(4));
    EXPECT_EQ(polynomials.id_3[0], FF(8));

    Flavor::CommitmentLabels commitment_labels;

    // Globals are also available through STL container sizes
    EXPECT_EQ(polynomials.get_all().size(), Flavor::NUM_ALL_ENTITIES);
    // Shited polynomials have the righ tsize
    EXPECT_EQ(polynomials.get_all().size(), polynomials.get_shifted().size() + polynomials.get_unshifted().size());
    // Commitment lables are stored in the flavor.
    EXPECT_EQ(commitment_labels.w_r, "W_R");
}

TEST(Flavor, AllEntitiesSpecialMemberFunctions)
{
    using Flavor = UltraFlavor;
    using FF = Flavor::FF;
    using PartiallyEvaluatedMultivariates = Flavor::PartiallyEvaluatedMultivariates;
    using Polynomial = bb::Polynomial<FF>;

    PartiallyEvaluatedMultivariates polynomials_A;
    Polynomial random_poly{ 10 };
    for (auto& coeff : random_poly.coeffs()) {
        coeff = FF::random_element();
    }

    // Test some special member functions.

    polynomials_A.w_l = random_poly.share();

    ASSERT_EQ(random_poly, polynomials_A.w_l);

    PartiallyEvaluatedMultivariates polynomials_B(polynomials_A);
    ASSERT_EQ(random_poly, polynomials_B.w_l);

    PartiallyEvaluatedMultivariates polynomials_C(std::move(polynomials_B));
    ASSERT_EQ(random_poly, polynomials_C.w_l);
}

TEST(Flavor, GetRow)
{
    using Flavor = UltraFlavor;
    using FF = typename Flavor::FF;
    std::array<std::vector<FF>, Flavor::NUM_ALL_ENTITIES> data;
    std::generate(data.begin(), data.end(), []() {
        return std::vector<FF>({ FF::random_element(), FF::random_element() });
    });
    Flavor::ProverPolynomials prover_polynomials;
    for (auto [poly, entry] : zip_view(prover_polynomials.get_all(), data)) {
        poly = Flavor::Polynomial(entry);
    }
    auto row0 = prover_polynomials.get_row(0);
    auto row1 = prover_polynomials.get_row(1);
    EXPECT_EQ(row0.q_elliptic, prover_polynomials.q_elliptic[0]);
    EXPECT_EQ(row1.w_4_shift, prover_polynomials.w_4_shift[1]);
}
