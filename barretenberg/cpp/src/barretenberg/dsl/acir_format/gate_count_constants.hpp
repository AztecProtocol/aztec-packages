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
template <typename Builder> inline constexpr size_t SHA256_COMPRESSION = 6703 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t AES128_ENCRYPTION = 1559 + ZERO_GATE + MEGA_OFFSET<Builder>;

// The mega offset works differently for ECDSA opcodes because of the use of ROM tables, which use indices that
// overlap with the values added for ECCVM. secp256k1 uses table of size 16 whose indices contain all the 4 values
// set for ECCVM (hence the same value for Ultra and Mega builders). secp256r1 uses ROM tables of size 4, which
// contain only 2 of the values set for ECCVM (hence the difference of two gates between Ultra and Mega builders).
template <typename Builder> inline constexpr size_t ECDSA_SECP256K1 = 42837 + ZERO_GATE;
template <typename Builder>
inline constexpr size_t ECDSA_SECP256R1 = 45945 + ZERO_GATE + (IsMegaBuilder<Builder> ? 2 : 0);

template <typename Builder> inline constexpr size_t BLAKE2S = 2952 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLAKE3 = 2158 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t KECCAK_PERMUTATION = 17387 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder>
inline constexpr size_t POSEIDON2_PERMUTATION = (IsMegaBuilder<Builder> ? 27 : 73) + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t MULTI_SCALAR_MUL = 3557 + ZERO_GATE;
template <typename Builder> inline constexpr size_t EC_ADD = 76 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLOCK_ROM_READ = 9 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLOCK_RAM_READ = 9 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLOCK_RAM_WRITE = 18 + ZERO_GATE + MEGA_OFFSET<Builder>;
// 4 = 1 busread (trace read) + 2 busreads (per-slot init reads bound to the witnesses, emitted by set_values) +
// 1 constant-witness gate (fix_witness for the slot-index constant FF(1); FF(0) reuses zero_idx). Specific to the
// init.size() == 2 / trace.size() == 1 configuration used by the opcode-gate-count test.
template <typename Builder> inline constexpr size_t BLOCK_CALLDATA = 4 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLOCK_RETURNDATA = 11 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t ASSERT_EQUALITY = ZERO_GATE + MEGA_OFFSET<Builder>;

// ========================================
// Honk Recursion Constants
// ========================================

inline constexpr size_t ROOT_ROLLUP_GATE_COUNT = 6351528;

template <typename RecursiveFlavor>
constexpr std::tuple<size_t, size_t> HONK_RECURSION_CONSTANTS(
    const PredicateTestCase& mode = PredicateTestCase::ConstantTrue)
{
    using UltraCircuitBuilder = bb::UltraCircuitBuilder;
    using MegaCircuitBuilder = bb::MegaCircuitBuilder;

    if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraRecursiveFlavor_<UltraCircuitBuilder>>) {
        switch (mode) {
        case PredicateTestCase::ConstantTrue:
            return std::make_tuple(681736, 0);
        case PredicateTestCase::WitnessTrue:
        case PredicateTestCase::WitnessFalse:
            return std::make_tuple(682793, 0);
        }
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraZKRecursiveFlavor_<UltraCircuitBuilder>>) {
        switch (mode) {
        case PredicateTestCase::ConstantTrue:
            return std::make_tuple(703514, 0);
        case PredicateTestCase::WitnessTrue:
        case PredicateTestCase::WitnessFalse:
            return std::make_tuple(704667, 0);
        }
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraRecursiveFlavor_<MegaCircuitBuilder>>) {
        switch (mode) {
        case PredicateTestCase::ConstantTrue:
            return std::make_tuple(11848, 73);
        case PredicateTestCase::WitnessTrue:
        case PredicateTestCase::WitnessFalse:
            return std::make_tuple(12905, 73);
        }
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraZKRecursiveFlavor_<MegaCircuitBuilder>>) {
        switch (mode) {
        case PredicateTestCase::ConstantTrue:
            return std::make_tuple(14540, 77);
        case PredicateTestCase::WitnessTrue:
        case PredicateTestCase::WitnessFalse:
            return std::make_tuple(15693, 77);
        }
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>) {
        if (mode != PredicateTestCase::ConstantTrue) {
            bb::assert_failure("Unhandled mode in MegaZKRecursiveFlavor.");
        }
        return std::make_tuple(648863, 0);
    } else {
        bb::assert_failure("Unhandled recursive flavor.");
    }

    throw_or_abort("Unhandled recursive flavor.");
}

// ========================================
// Chonk Recursion Constants
// ========================================

// Gate count for Chonk recursive verification (Ultra with RollupIO)
inline constexpr size_t CHONK_RECURSION_GATES = 1368262;

// ========================================
// Hypernova Recursion Constants
// ========================================

// MSM rows offset
inline constexpr size_t MSM_ROWS_OFFSET = 2;

// Init kernel gate counts (verifies OINK proof)

inline constexpr size_t INIT_KERNEL_GATE_COUNT = 13877;
inline constexpr size_t INIT_KERNEL_ECC_ROWS = 656 + MSM_ROWS_OFFSET;
inline constexpr size_t INIT_KERNEL_ULTRA_OPS = 75;

// Inner kernel gate counts (verifies HN proof for previous kernel + HN for app)
inline constexpr size_t INNER_KERNEL_GATE_COUNT_HN = 31289;
inline constexpr size_t INNER_KERNEL_ECC_ROWS = 1378 + MSM_ROWS_OFFSET;
inline constexpr size_t INNER_KERNEL_ULTRA_OPS = 159;

// Tail kernel gate counts (verifies HN_TAIL proof)
inline constexpr size_t TAIL_KERNEL_GATE_COUNT = 17421;
inline constexpr size_t TAIL_KERNEL_ECC_ROWS = 689 + MSM_ROWS_OFFSET;
inline constexpr size_t TAIL_KERNEL_ULTRA_OPS = 77;

// Hiding kernel gate counts (verifies HN_FINAL proof)
inline constexpr size_t HIDING_KERNEL_GATE_COUNT = 38940;
inline constexpr size_t HIDING_KERNEL_ECC_ROWS = 4773 + MSM_ROWS_OFFSET;
inline constexpr size_t HIDING_KERNEL_ULTRA_OPS = 331;

// ========================================
// ECCVM Recursive Verifier Constants
// ========================================

// Gate count for ECCVM recursive verifier (Ultra-arithmetized)
inline constexpr size_t ECCVM_RECURSIVE_VERIFIER_GATE_COUNT = 234059;

// ========================================
// Goblin AVM Recursive Verifier Constants
// ========================================

inline constexpr size_t GOBLIN_AVM_GATE_COUNT = 3316528;
inline constexpr size_t FINALIZED_GOBLIN_AVM_GATE_COUNT = 3316544;

} // namespace acir_format
