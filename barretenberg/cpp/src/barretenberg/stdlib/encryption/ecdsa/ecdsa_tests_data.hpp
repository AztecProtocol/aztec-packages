

#include <array>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"

namespace bb::stdlib {

using namespace bb;
using namespace bb::curve;

template <class Curve> struct WycherproofTest {
    using Fr = Curve::ScalarField;
    using Fq = Curve::BaseField;

    // Public Key
    Fq x;
    Fq y;

    // Data
    std::vector<uint8_t> message;
    Fr r;
    Fr s;
    bool is_valid_signature;
    bool is_circuit_satisfied;
    std::string comment;
    std::string failure_msg;
};

using WycherproofSecp256k1 = WycherproofTest<bb::curve::SECP256K1>;
using WycherproofSecp256r1 = WycherproofTest<bb::curve::SECP256R1>;

/**
 * @brief Test for Secp256k1 ECDSA signatures taken from the Wycherproof project
 *
 */
const std::vector<WycherproofSecp256k1> secp256k1_tests{
    // Arithmetic error tests
    WycherproofSecp256k1{
        .x = WycherproofSecp256k1::Fq("0x02ef4d6d6cfd5a94f1d7784226e3e2a6c0a436c55839619f38fb4472b5f9ee77"),
        .y = WycherproofSecp256k1::Fq("0x7eb4acd4eebda5cd72875ffd2a2f26229c2dc6b46500919a432c86739f3ae866"),
        .message = { 0x31, 0x32, 0x33, 0x34, 0x30, 0x30 },
        .r = WycherproofSecp256k1::Fr("0x0000000000000000000000000000000000000000000000000000000000000101"),
        .s = WycherproofSecp256k1::Fr("0xc58b162c58b162c58b162c58b162c58a1b242973853e16db75c8a1a71da4d39d"),
        .is_valid_signature = true,
        .is_circuit_satisfied = false,
        .comment = "Arithmetic error, s is larger than (n+1)/2",
        .failure_msg =
            "ECDSA input validation: the s component of the signature is bigger than Fr::modulus - s.: hi limb.",
    },
    WycherproofSecp256k1{
        .x = WycherproofSecp256k1::Fq("0xd6ef20be66c893f741a9bf90d9b74675d1c2a31296397acb3ef174fd0b300c65"),
        .y = WycherproofSecp256k1::Fq("0x4a0c95478ca00399162d7f0f2dc89efdc2b28a30fbabe285857295a4b0c4e265"),
        .message = { 0x31, 0x32, 0x33, 0x34, 0x30, 0x30 },
        .r = WycherproofSecp256k1::Fr("0x00000000000000000000000000000000000000062522bbd3ecbe7c39e93e7c26"),
        .s = WycherproofSecp256k1::Fr("0x783266e90f43dafe5cd9b3b0be86de22f9de83677d0f50713a468ec72fcf5d57"),
        .is_valid_signature = true,
        .is_circuit_satisfied = true,
        .comment = "Arithmetic error, r component is small",
        .failure_msg = "",
    },
    // Point duplication tests
    WycherproofSecp256k1{
        .x = WycherproofSecp256k1::Fq("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
        .y = WycherproofSecp256k1::Fq("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8"),
        .message = { 0x31, 0x32, 0x33, 0x34, 0x30, 0x30 },
        .r = WycherproofSecp256k1::Fr("0xbb5a52f42f9c9261ed4361f59422a1e30036e7c32b270c8807a419feca605023"),
        .s = WycherproofSecp256k1::Fr("0x2492492492492492492492492492492463cfd66a190a6008891e0d81d49a0952"),
        .is_valid_signature = false,
        .is_circuit_satisfied = true,
        .comment = "Point duplication, public key shares x-coordinates with generator",
        .failure_msg = "",
    },
    // Edge case public key tests
    WycherproofSecp256k1{
        .x = WycherproofSecp256k1::Fq("0x6e823555452914099182c6b2c1d6f0b5d28d50ccd005af2ce1bba541aa40caff"),
        .y = WycherproofSecp256k1::Fq("0x00000001060492d5a5673e0f25d8d50fb7e58c49d86d46d4216955e0aa3d40e1"),
        .message = { 0x4d, 0x65, 0x73, 0x73, 0x61, 0x67, 0x65 },
        .r = WycherproofSecp256k1::Fr("0x6d6a4f556ccce154e7fb9f19e76c3deca13d59cc2aeb4ecad968aab2ded45965"),
        .s = WycherproofSecp256k1::Fr("0x53b9fa74803ede0fc4441bf683d56c564d3e274e09ccf47390badd1471c05fb7"),
        .is_valid_signature = true,
        .is_circuit_satisfied = true,
        .comment = "Edge case public key, y coordinate is small",
        .failure_msg = "",
    },
};

/**
 * @brief Test for Secp256r1 ECDSA signatures taken from the Wycherproof project
 *
 */
const std::vector<WycherproofSecp256r1> secp256r1_tests{
    // Arithmetic error test
    WycherproofSecp256r1{
        .x = WycherproofSecp256r1::Fq("0x8d3c2c2c3b765ba8289e6ac3812572a25bf75df62d87ab7330c3bdbad9ebfa5c"),
        .y = WycherproofSecp256r1::Fq("0x4c6845442d66935b238578d43aec54f7caa1621d1af241d4632e0b780c423f5d"),
        .message = { 0x31, 0x32, 0x33, 0x34, 0x30, 0x30 },
        .r = WycherproofSecp256r1::Fr("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"),
        .s = WycherproofSecp256r1::Fr("0x16a4502e2781e11ac82cbc9d1edd8c981584d13e18411e2f6e0478c34416e3bb"),
        .is_valid_signature = true,
        .is_circuit_satisfied = true,
        .comment = "Arithmetic error",
        .failure_msg = "",
    },
    // Point duplication test
    WycherproofSecp256r1{
        .x = WycherproofSecp256r1::Fq("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"),
        .y = WycherproofSecp256r1::Fq("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5"),
        .message = { 0x31, 0x32, 0x33, 0x34, 0x30, 0x30 },
        .r = WycherproofSecp256r1::Fr("0xbb5a52f42f9c9261ed4361f59422a1e30036e7c32b270c8807a419feca605023"),
        .s = WycherproofSecp256r1::Fr("0x249249246db6db6ddb6db6db6db6db6dad4591868595a8ee6bf5f864ff7be0c2"),
        .is_valid_signature = false,
        .is_circuit_satisfied =
            false, // When the public key is equal to ±G, the circuit fails because of the generation of lookup tables
        .comment = "Point duplication, public key shares x-coordinates with generator",
        .failure_msg = "ECDSA input validation: the public key is equal to plus or minus the generator point.",
    },
    // Edge case public key test
    WycherproofSecp256r1{
        .x = WycherproofSecp256r1::Fq("0x4f337ccfd67726a805e4f1600ae2849df3807eca117380239fbd816900000000"),
        .y = WycherproofSecp256r1::Fq("0xed9dea124cc8c396416411e988c30f427eb504af43a3146cd5df7ea60666d685"),
        .message = { 0x4d, 0x65, 0x73, 0x73, 0x61, 0x67, 0x65 },
        .r = WycherproofSecp256r1::Fr("0x0fe774355c04d060f76d79fd7a772e421463489221bf0a33add0be9b1979110b"),
        .s = WycherproofSecp256r1::Fr("0x500dcba1c69a8fbd43fa4f57f743ce124ca8b91a1f325f3fac6181175df55737"),
        .is_valid_signature = true,
        .is_circuit_satisfied = true,
        .comment = "Edge case public key, x-coordinate has many trailing zeros",
        .failure_msg = "",
    },
};
} // namespace bb::stdlib
