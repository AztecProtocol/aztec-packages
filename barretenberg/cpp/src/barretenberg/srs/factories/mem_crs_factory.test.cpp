#include "../io.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/pairing.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include "barretenberg/srs/factories/mem_grumpkin_crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "file_crs_factory.hpp"
#include <fstream>
#include <gtest/gtest.h>

using namespace bb;
using namespace bb::srs::factories;
using namespace bb::curve;

TEST(reference_string, mem_bn254_file_consistency)
{
    // Load 1024 from file.
    auto file_crs = FileCrsFactory<BN254>(bb::srs::get_ignition_crs_path(), 1024);

    // Use low level io lib to read 1024 from file.
    std::vector<g1::affine_element> points(1024);
    ::srs::IO<BN254>::read_transcript_g1(points.data(), 1024, bb::srs::get_ignition_crs_path());

    g2::affine_element g2_point;
    ::srs::IO<BN254>::read_transcript_g2(g2_point, bb::srs::get_ignition_crs_path());

    MemBn254CrsFactory mem_crs(points, g2_point);
    auto file_prover_crs = file_crs.get_prover_crs(1024);
    auto mem_prover_crs = mem_crs.get_prover_crs(1024);

    EXPECT_EQ(mem_prover_crs->get_monomial_size(), file_prover_crs->get_monomial_size());

    EXPECT_EQ(memcmp(mem_prover_crs->get_monomial_points().data(),
                     file_prover_crs->get_monomial_points().data(),
                     sizeof(g1::affine_element) * 1024 * 2),
              0);

    auto file_verifier_crs = file_crs.get_verifier_crs();
    auto mem_verifier_crs = file_crs.get_verifier_crs();

    EXPECT_EQ(mem_verifier_crs->get_g2x(), file_verifier_crs->get_g2x());

    EXPECT_EQ(memcmp(mem_verifier_crs->get_precomputed_g2_lines(),
                     file_verifier_crs->get_precomputed_g2_lines(),
                     sizeof(pairing::miller_lines) * 2),
              0);
}

TEST(reference_string, mem_grumpkin_file_consistency)
{
    // Load 1024 from file.
    auto file_crs = FileCrsFactory<Grumpkin>(bb::srs::get_grumpkin_crs_path(), 1024);

    // Use low level io lib to read 1024 from file.
    std::vector<Grumpkin::AffineElement> points(1024);
    ::srs::IO<Grumpkin>::read_transcript_g1(points.data(), 1024, bb::srs::get_grumpkin_crs_path());

    MemGrumpkinCrsFactory mem_crs(points);
    auto file_prover_crs = file_crs.get_prover_crs(1024);
    auto mem_prover_crs = mem_crs.get_prover_crs(1024);

    EXPECT_EQ(mem_prover_crs->get_monomial_size(), file_prover_crs->get_monomial_size());

    EXPECT_EQ(memcmp(mem_prover_crs->get_monomial_points().data(),
                     file_prover_crs->get_monomial_points().data(),
                     sizeof(Grumpkin::AffineElement) * 1024 * 2),
              0);

    // TODO(cody): The below is bugged. Note file_crs should be mem_crs? But it doesn't help.
    // Build with ASAN to reveal issue.
    //     auto file_verifier_crs = file_crs.get_verifier_crs();
    //     auto mem_verifier_crs = file_crs.get_verifier_crs();

    //     EXPECT_EQ(mem_verifier_crs->get_g1_identity(), file_verifier_crs->get_g1_identity());
    //     EXPECT_EQ(memcmp(file_verifier_crs->get_monomial_points().data(),
    //                      mem_verifier_crs->get_monomial_points().data(),
    //                      sizeof(Grumpkin::AffineElement) * 1024 * 2),
    //               0);
}
