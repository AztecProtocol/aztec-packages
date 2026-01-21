#pragma once

#include "barretenberg/dsl/acir_format/test_class_predicate.hpp"
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
template <typename Builder> inline constexpr size_t ARITHMETIC_TRIPLE = 1 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t QUAD = 1 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BIG_QUAD = 2 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t LOGIC_XOR_32 = 6 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t LOGIC_AND_32 = 6 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t RANGE_32 = 2744 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t SHA256_COMPRESSION = 6704 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t AES128_ENCRYPTION = 1432 + ZERO_GATE + MEGA_OFFSET<Builder>;

// The mega offset works differently for ECDSA opcodes because of the use of ROM tables, which use indices that
// overlap with the values added for ECCVM. secp256k1 uses table of size 16 whose indices contain all the 4 values
// set for ECCVM (hence the same value for Ultra and Mega builders). secp256r1 uses ROM tables of size 4, which
// contain only 2 of the values set for ECCVM (hence the difference of two gates between Ultra and Mega builders).
template <typename Builder> inline constexpr size_t ECDSA_SECP256K1 = 41994 + ZERO_GATE;
template <typename Builder>
inline constexpr size_t ECDSA_SECP256R1 = 72209 + ZERO_GATE + (IsMegaBuilder<Builder> ? 2 : 0);

template <typename Builder> inline constexpr size_t BLAKE2S = 2952 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLAKE3 = 2158 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t KECCAK_PERMUTATION = 17387 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t POSEIDON2_PERMUTATION = 73 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t MULTI_SCALAR_MUL = 3550 + ZERO_GATE;
template <typename Builder> inline constexpr size_t EC_ADD = 66 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLOCK_ROM_READ = 9 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLOCK_RAM_READ = 18 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLOCK_RAM_WRITE = 18 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLOCK_CALLDATA = 1 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLOCK_RETURNDATA = 23 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t ASSERT_EQUALITY = ZERO_GATE + MEGA_OFFSET<Builder>;

// ========================================
// Honk Recursion Constants
// ========================================

inline constexpr size_t ROOT_ROLLUP_GATE_COUNT = 12986975;

template <typename RecursiveFlavor>
constexpr std::tuple<size_t, size_t> HONK_RECURSION_CONSTANTS(
    const PredicateTestCase& mode = PredicateTestCase::ConstantTrue)
{
    using UltraCircuitBuilder = bb::UltraCircuitBuilder;
    using MegaCircuitBuilder = bb::MegaCircuitBuilder;

    if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraRecursiveFlavor_<UltraCircuitBuilder>>) {
        switch (mode) {
        case PredicateTestCase::ConstantTrue:
            return std::make_tuple(722843, 0);
        case PredicateTestCase::WitnessTrue:
        case PredicateTestCase::WitnessFalse:
            return std::make_tuple(723994, 0);
        }
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraZKRecursiveFlavor_<UltraCircuitBuilder>>) {
        switch (mode) {
        case PredicateTestCase::ConstantTrue:
            return std::make_tuple(766261, 0);
        case PredicateTestCase::WitnessTrue:
        case PredicateTestCase::WitnessFalse:
            return std::make_tuple(767514, 0);
        }
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraRollupRecursiveFlavor_<UltraCircuitBuilder>>) {
        switch (mode) {
        case PredicateTestCase::ConstantTrue:
            return std::make_tuple(723162, 0);
        case PredicateTestCase::WitnessTrue:
        case PredicateTestCase::WitnessFalse:
            return std::make_tuple(724461, 0);
        }
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraRecursiveFlavor_<MegaCircuitBuilder>>) {
        switch (mode) {
        case PredicateTestCase::ConstantTrue:
            return std::make_tuple(23177, 76);
        case PredicateTestCase::WitnessTrue:
        case PredicateTestCase::WitnessFalse:
            return std::make_tuple(24328, 76);
        }
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraZKRecursiveFlavor_<MegaCircuitBuilder>>) {
        switch (mode) {
        case PredicateTestCase::ConstantTrue:
            return std::make_tuple(28048, 80);
        case PredicateTestCase::WitnessTrue:
        case PredicateTestCase::WitnessFalse:
            return std::make_tuple(29301, 80);
        }
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>) {
        if (mode != PredicateTestCase::ConstantTrue) {
            bb::assert_failure("Unhandled mode in MegaZKRecursiveFlavor.");
        }
        return std::make_tuple(814518, 0);
    } else {
        bb::assert_failure("Unhandled recursive flavor.");
    }
}

// ========================================
// Chonk Recursion Constants
// ========================================

// Gate count for Chonk recursive verification (UltraRollup builder)
inline constexpr size_t CHONK_RECURSION_GATES = 2368391;

// ========================================
// Hypernova Recursion Constants
// ========================================

// MSM rows offset
inline constexpr size_t MSM_ROWS_OFFSET = 2;

// Init kernel gate counts (verifies OINK proof)
inline constexpr size_t INIT_KERNEL_GATE_COUNT = 25828;
inline constexpr size_t INIT_KERNEL_ECC_ROWS = 848 + MSM_ROWS_OFFSET;
inline constexpr size_t INIT_KERNEL_ULTRA_OPS = 89;

// Inner kernel gate counts (verifies HN proof for previous kernel + HN for app)
inline constexpr size_t INNER_KERNEL_GATE_COUNT_HN = 60601;
inline constexpr size_t INNER_KERNEL_ECC_ROWS = 1700 + MSM_ROWS_OFFSET;
inline constexpr size_t INNER_KERNEL_ULTRA_OPS = 179;

// Tail kernel gate counts (verifies HN_TAIL proof)
inline constexpr size_t TAIL_KERNEL_GATE_COUNT = 33758;
inline constexpr size_t TAIL_KERNEL_ECC_ROWS = 914 + MSM_ROWS_OFFSET;
inline constexpr size_t TAIL_KERNEL_ULTRA_OPS = 96;

// Hiding kernel gate counts (verifies HN_FINAL proof)
inline constexpr size_t HIDING_KERNEL_GATE_COUNT = 36897;
inline constexpr size_t HIDING_KERNEL_ECC_ROWS = 1341 + MSM_ROWS_OFFSET;
inline constexpr size_t HIDING_KERNEL_ULTRA_OPS = 124;

// ========================================
// ECCVM Recursive Verifier Constants
// ========================================

// Gate count for ECCVM recursive verifier (Ultra-arithmetized)
inline constexpr size_t ECCVM_RECURSIVE_VERIFIER_GATE_COUNT = 214907;

// ========================================
// Goblin AVM Recursive Verifier Constants
// ========================================

inline constexpr size_t GOBLIN_AVM_GATE_COUNT = 3316528;
inline constexpr size_t FINALIZED_GOBLIN_AVM_GATE_COUNT = 3316544;

} // namespace acir_format
