#pragma once

#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "group.hpp"
#include "precomputed_generators.hpp"

// NOTE: Must be included before using get_precomputed_generators if using grumpkin g1!
namespace bb::detail {

template <> class PrecomputedGenerators<"pedersen_hash_length", bb::grumpkin::g1::affine_element, 1, 0> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr curve::Grumpkin::AffineElement generators[1] = {
        { uint256_t{ 0xb666947431f2cdcdUL, 0x1d754f6935e6a780UL, 0x1377e05373fae69aUL, 0x2df8b940e5890e4eUL },
          uint256_t{ 0x27ca7eefb2c19083UL, 0x54acb6aac2d3f85eUL, 0xb885912e0d168661UL, 0x2ecd88d15967bc53UL } }
    };
    static constexpr std::span<const curve::Grumpkin::AffineElement> get_generators() { return generators; }
};

template <> class PrecomputedGenerators<"DEFAULT_DOMAIN_SEPARATOR", bb::grumpkin::g1::affine_element, 8, 0> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr grumpkin::g1::affine_element generators[8] = {
        { uint256_t{ 0x3f69572c636f4a5aUL, 0xfd79a89beecb3990UL, 0x29f0067531fc15caUL, 0x083e7911d8350976UL },
          uint256_t{ 0xde81bcc528f9935dUL, 0x3fccab7ad7c90f14UL, 0x25a918f30cc8d733UL, 0x1a7f5efaad7f315cUL } },
        { uint256_t{ 0x8f71df4591bde402UL, 0x198e860f5f395026UL, 0x525e5bbed6e43ba1UL, 0x054aa86a73cb8a34UL },
          uint256_t{ 0xeb621a6287cac126UL, 0xf87254afc7407c04UL, 0xf6046f44d71ac6faUL, 0x209dcfbf2cfb57f9UL } },
        { uint256_t{ 0xbbdaf5a2ada84748UL, 0x311024bbed131819UL, 0x8a8321a5815ce8b1UL, 0x1c44f2a5207c81c2UL },
          uint256_t{ 0xaa3caf8b89c5f8a8UL, 0xeba5ac2c17a8c920UL, 0x0191632ac6599ae9UL, 0x03aaee36e6422a1dUL } },
        { uint256_t{ 0x12c9fccf22fb6fb2UL, 0x01c29f4338f44d4aUL, 0x0c65f6cb47124afeUL, 0x26d8b1160c6821a3UL },
          uint256_t{ 0x089a823d7464caffUL, 0x5f8af8cdd9498ec4UL, 0xc100e3a27bf3cc37UL, 0x05c70c3b9c0d25a4UL } },
        { uint256_t{ 0xcc097b9b994fcf6eUL, 0xb1adbeaa8734f7faUL, 0x4498bfce0578d59dUL, 0x20ed9c6a1d27271cUL },
          uint256_t{ 0x713f891ebeb92371UL, 0xaba7e5aaa04704a0UL, 0xc62c4a00f73a0d10UL, 0x29cd7d370938b358UL } },
        { uint256_t{ 0x1d7f01257052d383UL, 0x67bf372b3b1f7b86UL, 0x0373d64cd2a1ab15UL, 0x0224a8abc6c8b8d5UL },
          uint256_t{ 0x26da5a826726d711UL, 0xb0215eb0a790810bUL, 0x9d6650a311e79914UL, 0x2358629b90eafb29UL } },
        { uint256_t{ 0x04c466655f460a2aUL, 0x775ff3c445b2f8f7UL, 0x5290542490b2f238UL, 0x0f106f6d46bc904aUL },
          uint256_t{ 0x6731e486877bcf27UL, 0xf01920d615525012UL, 0x42fe09c47b8f7710UL, 0x29ab84d472f1d33fUL } },
        { uint256_t{ 0x461d6a595cc33696UL, 0x016e480f219b8c19UL, 0x9c8a8abd91567ebeUL, 0x0298f2e42249f051UL },
          uint256_t{ 0xc55aceb207aac83bUL, 0xe1390d7439c419a8UL, 0xe27bd5aafabee3dfUL, 0x035bec4b8520a4ecUL } }
    };
    static constexpr std::span<const grumpkin::g1::affine_element> get_generators() { return generators; }
};

}; // namespace bb::detail
