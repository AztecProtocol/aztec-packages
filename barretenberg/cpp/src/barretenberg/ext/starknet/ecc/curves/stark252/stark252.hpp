#ifdef STARKNET_GARAGA_FLAVORS
#pragma once

#include "barretenberg/ecc/fields/field.hpp"

namespace bb::starknet::stark252 {

struct FqParams {
    static constexpr uint64_t modulus_0 = 0x0000000000000001ULL;
    static constexpr uint64_t modulus_1 = 0x0000000000000000ULL;
    static constexpr uint64_t modulus_2 = 0x0000000000000000ULL;
    static constexpr uint64_t modulus_3 = 0x0800000000000011ULL;

    static constexpr uint64_t r_squared_0 = 0xfffffd737e000401ULL;
    static constexpr uint64_t r_squared_1 = 0x00000001330fffffULL;
    static constexpr uint64_t r_squared_2 = 0xffffffffff6f8000ULL;
    static constexpr uint64_t r_squared_3 = 0x07ffd4ab5e008810ULL;

    static constexpr uint64_t r_inv = 0xffffffffffffffffULL;

    static constexpr uint64_t r_inv_0 = 0x0000000000000001ULL;
    static constexpr uint64_t r_inv_1 = 0x0000000000000000ULL;
    static constexpr uint64_t r_inv_2 = 0xf7ffffffffffffefULL;
    static constexpr uint64_t r_inv_3 = 0x0800000000000010ULL;

    static constexpr uint64_t modulus_wasm_0 = 0x00000001;
    static constexpr uint64_t modulus_wasm_1 = 0x00000000;
    static constexpr uint64_t modulus_wasm_2 = 0x00000000;
    static constexpr uint64_t modulus_wasm_3 = 0x00000000;
    static constexpr uint64_t modulus_wasm_4 = 0x00000000;
    static constexpr uint64_t modulus_wasm_5 = 0x00000000;
    static constexpr uint64_t modulus_wasm_6 = 0x00440000;
    static constexpr uint64_t modulus_wasm_7 = 0x00000000;
    static constexpr uint64_t modulus_wasm_8 = 0x00080000;

    static constexpr uint64_t r_squared_wasm_0 = 0xfff5cdf800100001ULL;
    static constexpr uint64_t r_squared_wasm_1 = 0x000004cc3fffffffULL;
    static constexpr uint64_t r_squared_wasm_2 = 0xfffffffdbe000000ULL;
    static constexpr uint64_t r_squared_wasm_3 = 0x0752ad7802200010ULL;

    static constexpr uint64_t r_inv_wasm_0 = 0x00000001;
    static constexpr uint64_t r_inv_wasm_1 = 0x00000000;
    static constexpr uint64_t r_inv_wasm_2 = 0x00000000;
    static constexpr uint64_t r_inv_wasm_3 = 0x00000000;
    static constexpr uint64_t r_inv_wasm_4 = 0x00000000;
    static constexpr uint64_t r_inv_wasm_5 = 0x1fbc0000;
    static constexpr uint64_t r_inv_wasm_6 = 0x0043ffff;
    static constexpr uint64_t r_inv_wasm_7 = 0x1ff80000;
    static constexpr uint64_t r_inv_wasm_8 = 0x0007ffff;
};

using fq = field<FqParams>;

} // namespace bb::starknet::stark252
#endif
