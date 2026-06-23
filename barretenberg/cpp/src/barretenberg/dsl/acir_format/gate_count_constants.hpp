#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/dsl/acir_format/test_class_predicate.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <array>
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
inline constexpr size_t POSEIDON2_PERMUTATION = (IsMegaBuilder<Builder> ? 25 : 73) + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t MULTI_SCALAR_MUL = 3557 + ZERO_GATE;
template <typename Builder> inline constexpr size_t EC_ADD = 76 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLOCK_ROM_READ = 4 + ZERO_GATE + MEGA_OFFSET<Builder>;
template <typename Builder> inline constexpr size_t BLOCK_RAM_READ = 4 + ZERO_GATE + MEGA_OFFSET<Builder>;
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

inline constexpr size_t ROOT_ROLLUP_GATE_COUNT = 6351570;

template <typename RecursiveFlavor>
constexpr std::tuple<size_t, size_t> HONK_RECURSION_CONSTANTS(
    const PredicateTestCase& mode = PredicateTestCase::ConstantTrue)
{
    using UltraCircuitBuilder = bb::UltraCircuitBuilder;
    using MegaCircuitBuilder = bb::MegaCircuitBuilder;

    if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraRecursiveFlavor_<UltraCircuitBuilder>>) {
        switch (mode) {
        case PredicateTestCase::ConstantTrue:
            return std::make_tuple(681757, 0);
        case PredicateTestCase::WitnessTrue:
        case PredicateTestCase::WitnessFalse:
            return std::make_tuple(682814, 0);
        }
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraZKRecursiveFlavor_<UltraCircuitBuilder>>) {
        switch (mode) {
        case PredicateTestCase::ConstantTrue:
            return std::make_tuple(703537, 0);
        case PredicateTestCase::WitnessTrue:
        case PredicateTestCase::WitnessFalse:
            return std::make_tuple(704690, 0);
        }
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraRecursiveFlavor_<MegaCircuitBuilder>>) {
        switch (mode) {
        case PredicateTestCase::ConstantTrue:
            return std::make_tuple(11479, 73);
        case PredicateTestCase::WitnessTrue:
        case PredicateTestCase::WitnessFalse:
            return std::make_tuple(12536, 73);
        }
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::UltraZKRecursiveFlavor_<MegaCircuitBuilder>>) {
        switch (mode) {
        case PredicateTestCase::ConstantTrue:
            return std::make_tuple(14107, 77);
        case PredicateTestCase::WitnessTrue:
        case PredicateTestCase::WitnessFalse:
            return std::make_tuple(15260, 77);
        }
    } else if constexpr (std::is_same_v<RecursiveFlavor, bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>) {
        if (mode != PredicateTestCase::ConstantTrue) {
            bb::assert_failure("Unhandled mode in MegaZKRecursiveFlavor.");
        }
        return std::make_tuple(653651, 0);
    } else {
        bb::assert_failure("Unhandled recursive flavor.");
    }

    throw_or_abort("Unhandled recursive flavor.");
}

// ========================================
// Chonk Recursion Constants
// ========================================

// Gate count for Chonk recursive verification (Ultra with RollupIO)
inline constexpr size_t CHONK_RECURSION_GATES = 1373965;

// ========================================
// Hypernova Recursion Constants
// ========================================

// Kernel gate counts, ecc row and ultra ops indexed by (number of apps the kernel verifies - 1), i.e. index i holds the
// count for i+1 apps (1..MAX_APPS_PER_KERNEL)
inline constexpr size_t KERNEL_APP_COUNTS = bb::MAX_APPS_PER_KERNEL;

// Fixed start/end offset added to the ECCVM 'msm' section row count for any circuit (see
// EccvmRowTracker::get_num_msm_rows). It is a one-time cost over the whole op queue rather than a per-kernel cost,
// so the per-kernel ECC-row constants below store the measured row count with this offset removed.
inline constexpr size_t MSM_ROWS_OFFSET = 2;

// Init kernel: verifies its leading apps (first via an OINK proof, rest via HN); carries no accumulator, so K
// apps reduce to K claims (no batching for K==1, width-K batching for K>=2).
inline constexpr std::array<size_t, KERNEL_APP_COUNTS> INIT_KERNEL_GATE_COUNT = { 12182, 24189, 33483 };
inline constexpr std::array<size_t, KERNEL_APP_COUNTS> INIT_KERNEL_ECC_ROWS = { 524, 1176, 1700 };
inline constexpr std::array<size_t, KERNEL_APP_COUNTS> INIT_KERNEL_ULTRA_OPS = { 60, 131, 194 };

// Inner kernel: verifies the previous kernel (HN) plus K apps (HN). The carried accumulator + previous kernel +
// K apps reduce to a (K+2)-claim per-kernel batching.
inline constexpr std::array<size_t, KERNEL_APP_COUNTS> INNER_KERNEL_GATE_COUNT = { 25454, 34748, 44122 };
inline constexpr std::array<size_t, KERNEL_APP_COUNTS> INNER_KERNEL_ECC_ROWS = { 1242, 1832, 2356 };
inline constexpr std::array<size_t, KERNEL_APP_COUNTS> INNER_KERNEL_ULTRA_OPS = { 140, 203, 266 };

// Reset or Tail kernel: verifies a single previous-kernel HN proof, then a width-2 per-kernel
// batching. Reset and tail kernels are structurally identical from the IVC's perspective.
inline constexpr size_t RESET_TAIL_KERNEL_GATE_COUNT = 16024;
inline constexpr size_t RESET_TAIL_KERNEL_ECC_ROWS = 718;
inline constexpr size_t RESET_TAIL_KERNEL_ULTRA_OPS = 73;

// Hiding kernel: verifies the tail kernel (HN_FINAL), then a batch-merge recursive verifier sized for
// CHONK_MAX_NUM_CIRCUITS plus a decider.
inline constexpr size_t HIDING_KERNEL_GATE_COUNT = 39638;
inline constexpr size_t HIDING_KERNEL_ECC_ROWS = 5330;
inline constexpr size_t HIDING_KERNEL_ULTRA_OPS = 359;

// ========================================
// ECCVM Recursive Verifier Constants
// ========================================

// Gate count for ECCVM recursive verifier (Ultra-arithmetized)
inline constexpr size_t ECCVM_RECURSIVE_VERIFIER_GATE_COUNT = 234909;

// ========================================
// Goblin AVM Recursive Verifier Constants
// ========================================

inline constexpr size_t GOBLIN_AVM_GATE_COUNT = 2950641;
inline constexpr size_t FINALIZED_GOBLIN_AVM_GATE_COUNT = 2950844;

} // namespace acir_format
