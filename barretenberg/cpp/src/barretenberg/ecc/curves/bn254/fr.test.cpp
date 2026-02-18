#include "fr.hpp"
#include <gtest/gtest.h>

using namespace bb;

// Negative-k2 bug: k = ceil(m * 2^256 / endo_g2) produces negative k2 in the GLV splitting,
// and the 128-bit truncation extracts the wrong value. See endomorphism_scalars.py for derivation.
TEST(BN254Fr, SplitEndomorphismNegativeK2)
{
    // clang-format off
    struct test_case { std::array<uint64_t, 4> limbs; const char* tag; };
    const std::array<test_case, 3> cases = {{
        {{ 0x01624731e1195570, 0x3ba491482db4da14, 0x59e26bcea0d48bac, 0x0 }, "m=1"},
        {{ 0x02c48e63c232aadf, 0x774922905b69b428, 0xb3c4d79d41a91758, 0x0 }, "m=2"},
        {{ 0x0426d595a34c004e, 0xb2edb3d8891e8e3c, 0x0da7436be27da304, 0x1 }, "m=3"},
    }};
    // clang-format on

    fr lambda = fr::cube_root_of_unity();

    for (const auto& tc : cases) {
        fr k{ tc.limbs[0], tc.limbs[1], tc.limbs[2], tc.limbs[3] };
        fr k1{ 0, 0, 0, 0 };
        fr k2{ 0, 0, 0, 0 };

        fr::split_into_endomorphism_scalars(k, k1, k2);

        k1.self_to_montgomery_form();
        k2.self_to_montgomery_form();
        fr result = k1 - k2 * lambda;
        result.self_from_montgomery_form();

        EXPECT_NE(result, k) << "Bug may be fixed! " << tc.tag;
    }
}
