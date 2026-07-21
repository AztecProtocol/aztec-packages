#include "g2.hpp"
#include <gtest/gtest.h>

using namespace bb;

TEST(g2, DblCheckAgainstConstants)
{
    g2::element lhs = { { { 0x46debd5cd992f6ed, 0x674322d4f75edadd, 0x426a00665e5c4479, 0x1800deef121f1e76 },
                          { 0x97e485b7aef312c2, 0xf1aa493335a9e712, 0x7260bfb731fb5d25, 0x198e9393920d483a } },
                        { { 0x4ce6cc0166fa7daa, 0xe3d1e7690c43d37b, 0x4aab71808dcb408f, 0x12c85ea5db8c6deb },
                          { 0x55acdadcd122975b, 0xbc4b313370b38ef3, 0xec9e99ad690c3395, 0x90689d0585ff075 } },
                        { { 0x1, 0x0, 0x0, 0x0 }, { 0x0, 0x0, 0x0, 0x0 } } };
    g2::element expected = { { { 0x8fcae74c62173d99, 0xadb8624eb3bce1ad, 0x7b95c05d3e9c3c98, 0x11d65cded12c8731 },
                               { 0x913fa47117bd9d56, 0x17eb5f9e60297b13, 0x132207965bf363ee, 0x168dfeb5f21b6dc0 } },
                             { { 0x1c10da5c8693bc8, 0x152ff094bd258271, 0xeb12d62e95fef138, 0x2891f38f6935fd84 },
                               { 0x9f5265a7b4e4ae19, 0xfb6348cb8fdefd6c, 0x6259df5c8932f6b1, 0x53858cc3dba708f } },
                             { { 0x99cd9802cdf4fb54, 0xc7a3ced21887a6f6, 0x9556e3011b96811f, 0x2590bd4bb718dbd6 },
                               { 0xab59b5b9a2452eb6, 0x78966266e1671de6, 0xd93d335ad218672b, 0x120d13a0b0bfe0eb } } };

    lhs.x = lhs.x.to_montgomery_form();
    lhs.y = lhs.y.to_montgomery_form();
    lhs.z = lhs.z.to_montgomery_form();
    expected.x = expected.x.to_montgomery_form();
    expected.y = expected.y.to_montgomery_form();
    expected.z = expected.z.to_montgomery_form();

    g2::element result;
    result = lhs.dbl();
    EXPECT_EQ(result == expected, true);
}

TEST(g2, MixedAddCheckAgainstConstants)
{
    g2::element lhs = { { { 0xfe0ee11d88ef9c7c, 0xa50b3642c93787df, 0x5c4925f0812249a3, 0x13360054113b26e5 },
                          { 0x85a786ba7563664d, 0xebb6adaab3da2d35, 0x2e5c4b3e8bfae51d, 0x860451c5f3cb08 } },
                        { { 0x1336c5c955c13e31, 0x99acf7e0bf631edd, 0x7544255d031dcb7c, 0x170f93b2ac0d088d },
                          { 0xd27a61c30f2f9b75, 0x27abf783f3139bb9, 0x84ee0a9379a3c860, 0x23df8ba46e8f6ea7 } },
                        { { 0x3b2009df97845379, 0x3262a4c15a3ad056, 0xc5852fece05e2563, 0x1bb45a345c7765a9 },
                          { 0xaeb423ce4f95d63, 0xa9dee5d2983c1985, 0x8120e98ba5901fdb, 0x181589d4f3580f3a } } };
    g2::affine_element affine_rhs = {
        { { 0x46debd5cd992f6ed, 0x674322d4f75edadd, 0x426a00665e5c4479, 0x1800deef121f1e76 },
          { 0x97e485b7aef312c2, 0xf1aa493335a9e712, 0x7260bfb731fb5d25, 0x198e9393920d483a } },
        { { 0x4ce6cc0166fa7daa, 0xe3d1e7690c43d37b, 0x4aab71808dcb408f, 0x12c85ea5db8c6deb },
          { 0x55acdadcd122975b, 0xbc4b313370b38ef3, 0xec9e99ad690c3395, 0x90689d0585ff075 } }
    };
    g2::element expected = { { { 0x98399c68dd927f5, 0x585e18855b30df06, 0x9874333b9a1bab34, 0x2bb4f72523c319bf },
                               { 0x29e78f88e1516115, 0x9240c8e9ab1546d5, 0x8d350dc8b1c3b2b8, 0x17688e3c6ab5e4d2 } },
                             { { 0x1e57dc45f291a09e, 0xe54bbdd2e4e99866, 0x653c8c883714add1, 0xe71bea84e3257e6 },
                               { 0x75c1f2d7c18946a6, 0x315f562c7349c2e8, 0x686aea0f0df36a52, 0x9bfa6ed372f6a0e } },
                             { { 0xf5b3de9258529bb0, 0x532ab749f5abddd7, 0x448d9ba9d7eee9c0, 0x3053d1c7326c11a8 },
                               { 0x18457bf2457b178d, 0x8d9a26e09db091c1, 0xce0fce46e53efa63, 0x2594360eb4eaf8e4 } } };

    lhs.x = lhs.x.to_montgomery_form();
    lhs.y = lhs.y.to_montgomery_form();
    lhs.z = lhs.z.to_montgomery_form();
    affine_rhs.x = affine_rhs.x.to_montgomery_form();
    affine_rhs.y = affine_rhs.y.to_montgomery_form();
    expected.x = expected.x.to_montgomery_form();
    expected.y = expected.y.to_montgomery_form();
    expected.z = expected.z.to_montgomery_form();

    g2::element result;

    result = lhs + affine_rhs;
    EXPECT_EQ(result == expected, true);
}

TEST(g2, AddCheckAgainstConstants)
{
    g2::element lhs = { { { 0xfe0ee11d88ef9c7c, 0xa50b3642c93787df, 0x5c4925f0812249a3, 0x13360054113b26e5 },
                          { 0x85a786ba7563664d, 0xebb6adaab3da2d35, 0x2e5c4b3e8bfae51d, 0x860451c5f3cb08 } },
                        { { 0x1336c5c955c13e31, 0x99acf7e0bf631edd, 0x7544255d031dcb7c, 0x170f93b2ac0d088d },
                          { 0xd27a61c30f2f9b75, 0x27abf783f3139bb9, 0x84ee0a9379a3c860, 0x23df8ba46e8f6ea7 } },
                        { { 0x3b2009df97845379, 0x3262a4c15a3ad056, 0xc5852fece05e2563, 0x1bb45a345c7765a9 },
                          { 0xaeb423ce4f95d63, 0xa9dee5d2983c1985, 0x8120e98ba5901fdb, 0x181589d4f3580f3a } } };
    g2::element rhs = { { { 0x46debd5cd992f6ed, 0x674322d4f75edadd, 0x426a00665e5c4479, 0x1800deef121f1e76 },
                          { 0x97e485b7aef312c2, 0xf1aa493335a9e712, 0x7260bfb731fb5d25, 0x198e9393920d483a } },
                        { { 0x4ce6cc0166fa7daa, 0xe3d1e7690c43d37b, 0x4aab71808dcb408f, 0x12c85ea5db8c6deb },
                          { 0x55acdadcd122975b, 0xbc4b313370b38ef3, 0xec9e99ad690c3395, 0x90689d0585ff075 } },
                        { { 0x1, 0x0, 0x0, 0x0 }, { 0x0, 0x0, 0x0, 0x0 } } };
    g2::element expected = { { { 0x98399c68dd927f5, 0x585e18855b30df06, 0x9874333b9a1bab34, 0x2bb4f72523c319bf },
                               { 0x29e78f88e1516115, 0x9240c8e9ab1546d5, 0x8d350dc8b1c3b2b8, 0x17688e3c6ab5e4d2 } },
                             { { 0x1e57dc45f291a09e, 0xe54bbdd2e4e99866, 0x653c8c883714add1, 0xe71bea84e3257e6 },
                               { 0x75c1f2d7c18946a6, 0x315f562c7349c2e8, 0x686aea0f0df36a52, 0x9bfa6ed372f6a0e } },
                             { { 0xf5b3de9258529bb0, 0x532ab749f5abddd7, 0x448d9ba9d7eee9c0, 0x3053d1c7326c11a8 },
                               { 0x18457bf2457b178d, 0x8d9a26e09db091c1, 0xce0fce46e53efa63, 0x2594360eb4eaf8e4 } } };

    lhs.x = lhs.x.to_montgomery_form();
    lhs.y = lhs.y.to_montgomery_form();
    lhs.z = lhs.z.to_montgomery_form();
    rhs.x = rhs.x.to_montgomery_form();
    rhs.y = rhs.y.to_montgomery_form();
    rhs.z = rhs.z.to_montgomery_form();

    expected.x = expected.x.to_montgomery_form();
    expected.y = expected.y.to_montgomery_form();
    expected.z = expected.z.to_montgomery_form();

    g2::element result;
    result = lhs + rhs;
    EXPECT_EQ(result == expected, true);
}

TEST(g2, GroupExponentiationCheckAgainstConstants)
{
    fr scalar = { 0xc4199e4b971f705, 0xc8d89c916a23ab3d, 0x7ea3cd7c05c7af82, 0x2fdafbf994a8d400 };
    g2::affine_element lhs = { { { 0x46debd5cd992f6ed, 0x674322d4f75edadd, 0x426a00665e5c4479, 0x1800deef121f1e76 },
                                 { 0x97e485b7aef312c2, 0xf1aa493335a9e712, 0x7260bfb731fb5d25, 0x198e9393920d483a } },
                               { { 0x4ce6cc0166fa7daa, 0xe3d1e7690c43d37b, 0x4aab71808dcb408f, 0x12c85ea5db8c6deb },
                                 { 0x55acdadcd122975b, 0xbc4b313370b38ef3, 0xec9e99ad690c3395, 0x90689d0585ff075 } } };
    g2::affine_element expected = {
        { { 0x3363a6e8193817c0, 0x5edb295efcf8a8f0, 0xe33df179b9821b84, 0xaa0f7e7c00600d3 },
          { 0x91b09f192f2b3eb2, 0x3a27767998031cd5, 0xa44abe0ef5ba1c0f, 0x10bbc579ca6f412f } },
        { { 0xa8850d9c027ba4db, 0xae6147163c4068a6, 0x5f73bedc2cd52fab, 0x159dfbb82478b51b },
          { 0x33cccf11dd7d7fb2, 0xcbb3c7c098cbb079, 0x2e83153ab90a931d, 0x26d19735b36c2d08 } }
    };

    scalar.self_to_montgomery_form();
    lhs.x = lhs.x.to_montgomery_form();
    lhs.y = lhs.y.to_montgomery_form();
    expected.x = expected.x.to_montgomery_form();
    expected.y = expected.y.to_montgomery_form();

    g2::affine_element result(g2::element(lhs) * scalar);

    EXPECT_EQ(result == expected, true);
}

TEST(g2, Serialize)
{
    // test serializing random points
    size_t num_repetitions(1);
    for (size_t i = 0; i < num_repetitions; i++) {
        g2::affine_element expected = g2::element::random_element();

        std::array<uint8_t, sizeof(g2::affine_element)> buffer;

        g2::affine_element::serialize_to_buffer(expected, &buffer[0]);

        g2::affine_element result = g2::affine_element::serialize_from_buffer(&buffer[0]);

        EXPECT_EQ(result == expected, true);
    }

    // test serializing the point at infinity
    {
        g2::affine_element expected = g2::element::random_element();
        expected.self_set_infinity();
        std::array<uint8_t, sizeof(g2::affine_element)> buffer;

        g2::affine_element::serialize_to_buffer(expected, &buffer[0]);

        g2::affine_element result = g2::affine_element::serialize_from_buffer(&buffer[0]);

        ASSERT_TRUE(result.is_point_at_infinity());
        EXPECT_EQ(result == expected, true);
    }
}

template <class T> void write(const T t)
{
    FILE* fp = fopen("/dev/null", "wb");
    static_cast<void>(fwrite(&t, sizeof(t), 1, fp));
    static_cast<void>(fclose(fp));
}

#if !defined(__wasm__)
TEST(g2, InitializationCheck)
{
    // NOLINTNEXTLINE not our fault googletest uses `goto`!
    EXPECT_NO_THROW(write<g2::affine_element>({}));
}
#endif

TEST(g2, GeneratorIsCorrect)
{
    // Values taken from https://eips.ethereum.org/EIPS/eip-197
    g2::affine_element generator{ Bn254G2Params::one_x, Bn254G2Params::one_y };
    g2::affine_element expected{ fq2{ fq("0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed"),
                                      fq("0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2") },
                                 fq2{ fq("0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa"),
                                      fq("0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b") } };
    EXPECT_EQ(generator, expected);
}

// The generator, infinity, and arbitrary scalar multiples of the generator must be accepted as
// members of the BN254 G2 prime-order subgroup.
TEST(g2, IsInPrimeSubgroupAcceptsSubgroupPoints)
{
    const g2::affine_element gen(Bn254G2Params::one_x, Bn254G2Params::one_y);
    EXPECT_TRUE(gen.is_in_prime_subgroup());
    EXPECT_TRUE(g2::affine_element::infinity().is_in_prime_subgroup());

    for (size_t i = 0; i < 4; ++i) {
        const g2::affine_element P(g2::element(gen) * fr::random_element());
        EXPECT_TRUE(P.is_in_prime_subgroup());
    }
}

// BN254 G2 has cofactor h2 ≈ 2^254, so on-curve does NOT imply prime-order subgroup membership. The hardcoded point
// below was constructed by sampling x = i + u (for the smallest positive integer i that yields a curve point) and
// recovering y via Fq2 sqrt; because only a 1/h2 fraction of E'(Fq2) lies in G_r, this specimen lies in a cofactor
// subgroup. Such a point must be rejected. Coordinates are in Montgomery form to match `Bn254G2Params::one_x` etc.
TEST(g2, IsInPrimeSubgroupRejectsCofactorPoint)
{
    const g2::affine_element off_subgroup{
        fq2{ fq(2), fq(1) },
        fq2{ fq("0x101f7278419308b95099eca02dcee0c5381f4d26d1d62313f057167f064101ce"),
             fq("0x2b76c179599bb92a963dac85546a005a777f7c13f6a7b75d5918b6b5808f5fde") }
    };
    ASSERT_TRUE(off_subgroup.on_curve());
    EXPECT_FALSE(off_subgroup.is_in_prime_subgroup());

    // Sanity check that scalar multiplication via the Fr-typed `*` operator does NOT detect
    // subgroup membership — multiplying by `Fr(0)` (the additive identity, which equals `r mod r`)
    // gives infinity for every input, including off-subgroup points. This is precisely why
    // is_in_prime_subgroup() routes through a uint256_t scalar instead.
    EXPECT_TRUE((off_subgroup * fr::zero()).is_point_at_infinity());
}

// Off-curve coordinates must be rejected: the Weierstrass group law is unsound off-curve, so the
// [r]·P trick can return a false positive on attacker-supplied (x, y) that happens to satisfy
// y² = x³ + b' for some b' ≠ b with a prime-r factor in its order.
TEST(g2, IsInPrimeSubgroupRejectsOffCurvePoint)
{
    g2::affine_element off_curve(Bn254G2Params::one_x, Bn254G2Params::one_y);
    off_curve.y += fq2::one();
    ASSERT_FALSE(off_curve.on_curve());
    EXPECT_FALSE(off_curve.is_in_prime_subgroup());
}
