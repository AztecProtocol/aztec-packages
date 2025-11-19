#pragma once

#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <cstddef>
#include <tuple>
#include <type_traits>

namespace acir_format {

// ========================================
// ACIR Opcode Gate Count Constants
// ========================================

// Mega adds 3 gates for ECCVM opcode values
template <typename Builder> inline constexpr size_t MEGA_OFFSET = IsMegaBuilder<Builder> ? 3 : 0;

// Base gate count for zero gate
inline constexpr size_t ZERO_GATE = 1;

// Gate count constants for each ACIR constraint type
template <typename Builder> inline constexpr size_t POLY_TRIPLE = 1 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t QUAD = 1 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BIG_QUAD = 2 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t LOGIC_XOR_32 = 2950 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t RANGE_32 = 2744 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t SHA256_COMPRESSION = 6679 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t AES128_ENCRYPTION = 1432 + ZERO_GATE + MEGA_OFFSET<Builder>;

// The mega offset works differently for ECDSA opcodes because of the use of ROM tables, which use indices that
// overlap with the values added for ECCVM. secp256k1 uses table of size 16 whose indices contain all the 4 values
// set for ECCVM (hence the same value for Ultra and Mega builders). secp256r1 uses ROM tables of size 4, which
// contain only 2 of the values set for ECCVM (hence the difference of two gates between Ultra and Mega builders).
template <typename Builder> inline constexpr size_t ECDSA_SECP256K1 = 41994 + ZERO_GATE;
template <typename Builder>
inline constexpr size_t ECDSA_SECP256R1 = 72209 + ZERO_GATE + (IsMegaBuilder<Builder> ? 2 : 0);

template <typename Builder> inline constexpr size_t BLAKE2S = 2864 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLAKE3 = 2100 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t KECCAK_PERMUTATION = 17387 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t POSEIDON2_PERMUTATION = 73 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t MULTI_SCALAR_MUL = 3550 + ZERO_GATE;
template <typename Builder> inline constexpr size_t EC_ADD = 66 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLOCK_ROM_READ = 9 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t ASSERT_EQUALITY = ZERO_GATE + MEGA_OFFSET<Builder>;

// ========================================
// Honk Recursion Constants
// ========================================

// Gate counts for Honk recursion vary by recursive flavor
// Returns tuple of (gate_count, ecc_rows, ultra_ops)
template <typename RecursiveFlavor>
inline constexpr std::tuple<size_t, size_t, size_t> HONK_RECURSION_CONSTANTS = []() {
    using UltraCircuitBuilder = bb::UltraCircuitBuilder;
    using MegaCircuitBuilder = bb::MegaCircuitBuilder;

    if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraRecursiveFlavor_<UltraCircuitBuilder>>) {
        return std::make_tuple(723995, 0, 0);
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraRollupRecursiveFlavor_<UltraCircuitBuilder>>) {
        return std::make_tuple(724462, 0, 0);
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraRecursiveFlavor_<MegaCircuitBuilder>>) {
        return std::make_tuple(24329, 1250, 76);
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraZKRecursiveFlavor_<UltraCircuitBuilder>>) {
        return std::make_tuple(767515, 0, 0);
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraZKRecursiveFlavor_<MegaCircuitBuilder>>) {
        return std::make_tuple(29302, 1052, 80);
    } else {
        bb::assert_failure("Unhandled recursive flavor.");
    }
}();

// ========================================
// Chonk Recursion Constants
// ========================================

// Gate count for Chonk recursive verification (UltraRollup builder)
inline constexpr size_t CHONK_RECURSION_GATES = 2540865;

// ========================================
// Hypernova Recursion Constants
// ========================================

// MSM rows offset
inline constexpr size_t MSM_ROWS_OFFSET = 2;

// Init kernel gate counts (verifies OINK proof)
inline constexpr size_t INIT_KERNEL_GATE_COUNT = 26038;
inline constexpr size_t INIT_KERNEL_ECC_ROWS = 881 + MSM_ROWS_OFFSET;
inline constexpr size_t INIT_KERNEL_ULTRA_OPS = 89;

// Inner kernel gate counts (verifies HN proof for previous kernel + HN for app)
inline constexpr size_t INNER_KERNEL_GATE_COUNT_HN = 61020;
inline constexpr size_t INNER_KERNEL_ECC_ROWS = 1700 + MSM_ROWS_OFFSET;
inline constexpr size_t INNER_KERNEL_ULTRA_OPS = 179;

// Tail kernel gate counts (verifies HN_TAIL proof)
inline constexpr size_t TAIL_KERNEL_GATE_COUNT = 33968;
inline constexpr size_t TAIL_KERNEL_ECC_ROWS = 914 + MSM_ROWS_OFFSET;
inline constexpr size_t TAIL_KERNEL_ULTRA_OPS = 95;

// Hiding kernel gate counts (verifies HN_FINAL proof)
inline constexpr size_t HIDING_KERNEL_GATE_COUNT = 37212;
inline constexpr size_t HIDING_KERNEL_ECC_ROWS = 1405 + MSM_ROWS_OFFSET;
inline constexpr size_t HIDING_KERNEL_ULTRA_OPS = 126;

} // namespace acir_format
