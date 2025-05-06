#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/pairing.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include "barretenberg/srs/factories/mem_grumpkin_crs_factory.hpp"
#include "barretenberg/srs/factories/native_crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <fstream>
#include <gtest/gtest.h>

using namespace bb;
using namespace bb::srs::factories;
using namespace bb::curve;

TEST(reference_string, mem_bn254_file_consistency)
{
    // Load 1024 from file.
    NativeBn254CrsFactory file_crs(bb::srs::default_crs_path(), /*allow_download = false */ false);

    // Use low level io lib to read 1024 from file.
    std::vector<g1::affine_element> points(1024);
    auto g1_points_buf =
        read_file(bb::srs::default_crs_path() / "bn254_g1.dat", points.size() * sizeof(g1::affine_element));
    for (size_t i = 0; i < points.size(); ++i) {
        points[i] = from_buffer<g1::affine_element>(g1_points_buf, i * sizeof(g1::affine_element));
    }

    auto g2_points_buf = read_file(bb::srs::default_crs_path() / "bn254_g1.dat", sizeof(g2::affine_element));

    auto g2_point = from_buffer<g2::affine_element>(g2_points_buf);

    MemBn254CrsFactory mem_crs(std::move(points), g2_point);
    auto file_prover_crs = file_crs.get_prover_crs(1024);
    auto mem_prover_crs = mem_crs.get_prover_crs(1024);

    EXPECT_EQ(mem_prover_crs->get_monomial_size(), file_prover_crs->get_monomial_size());

    EXPECT_EQ(memcmp(mem_prover_crs->get_monomial_points().data(),
                     file_prover_crs->get_monomial_points().data(),
                     sizeof(g1::affine_element) * 1024 * 2),
              0);

    auto file_verifier_crs = file_crs.get_verifier_crs();
    auto mem_verifier_crs = mem_crs.get_verifier_crs();

    EXPECT_EQ(mem_verifier_crs->get_g2x(), file_verifier_crs->get_g2x());

    EXPECT_EQ(memcmp(mem_verifier_crs->get_precomputed_g2_lines(),
                     file_verifier_crs->get_precomputed_g2_lines(),
                     sizeof(pairing::miller_lines) * 2),
              0);
}

TEST(reference_string, mem_grumpkin_file_consistency)
{
    // Use low level io lib to read 1024 from file.
    NativeBn254CrsFactory file_crs(bb::srs::default_crs_path(), /*allow_download = false */ false);
    std::vector<Grumpkin::AffineElement> points(1024);
    auto g1_points_buf =
        read_file(bb::srs::default_crs_path() / "bn254_g1.dat", points.size() * sizeof(g1::affine_element));
    for (size_t i = 0; i < points.size(); ++i) {
        points[i] = from_buffer<Grumpkin::AffineElement>(g1_points_buf, i * sizeof(g1::affine_element));
    }

    MemGrumpkinCrsFactory mem_crs(std::move(points));
    auto file_prover_crs = file_crs.get_prover_crs(1024);
    auto mem_prover_crs = mem_crs.get_prover_crs(1024);

    EXPECT_EQ(mem_prover_crs->get_monomial_size(), file_prover_crs->get_monomial_size());

    EXPECT_EQ(memcmp(mem_prover_crs->get_monomial_points().data(),
                     file_prover_crs->get_monomial_points().data(),
                     sizeof(Grumpkin::AffineElement) * 1024 * 2),
              0);
}
