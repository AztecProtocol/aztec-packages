/**
 * @file per_block_gate_count.test.cpp
 * @brief Measures per-block gate counts for each ACIR opcode type, and tests whether they are additive across opcodes.
 *
 * @details This is a PoC investigating whether ACIR circuit construction can be parallelized via a "plan then execute"
 * model. The key question: if we know the per-block gate count for each opcode, can we pre-compute a deterministic
 * layout (prefix sum of per-block sizes), then execute opcodes in parallel into pre-allocated regions?
 *
 * Step 1: Measure per-block gate counts for individual opcodes.
 * Step 2: Test additivity — does the sum of individual per-block counts match a combined circuit?
 */

#include <gtest/gtest.h>

#include "acir_format.hpp"
#include "acir_to_constraint_buf.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/dsl/acir_format/arithmetic_constraints.hpp"
#include "barretenberg/dsl/acir_format/blake2s_constraint.hpp"
#include "barretenberg/dsl/acir_format/ec_operations.hpp"
#include "barretenberg/dsl/acir_format/logic_constraint.hpp"
#include "barretenberg/dsl/acir_format/poseidon2_constraint.hpp"
#include "barretenberg/dsl/acir_format/sha256_constraint.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <filesystem>

using namespace bb;
using namespace acir_format;

class PerBlockGateCountTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// Helper to build the test program: 3 SHA256 + 3 Poseidon2
AcirFormat build_sha256_poseidon2_test_program(WitnessVector& witness_out)
{
    std::vector<Acir::Opcode> all_opcodes;

    // 3 SHA256 compression constraints, each using 32 witnesses
    for (uint32_t i = 0; i < 3; i++) {
        uint32_t base = i * 32;
        Sha256Compression sha;
        for (size_t j = 0; j < 16; ++j)
            sha.inputs[j] = WitnessOrConstant<bb::fr>::from_index(base + static_cast<uint32_t>(j));
        for (size_t j = 0; j < 8; ++j)
            sha.hash_values[j] = WitnessOrConstant<bb::fr>::from_index(base + static_cast<uint32_t>(j));
        for (size_t j = 0; j < 8; ++j)
            sha.result[j] = base + static_cast<uint32_t>(j) + 24;
        auto ops = constraint_to_acir_opcode(sha);
        all_opcodes.insert(all_opcodes.end(), ops.begin(), ops.end());
    }

    // 3 Poseidon2 constraints, each using 8 witnesses, starting after SHA256 witnesses
    for (uint32_t i = 0; i < 3; i++) {
        uint32_t base = 96 + i * 8;
        Poseidon2Constraint pos;
        for (uint32_t j = 0; j < 4; j++) {
            pos.state.emplace_back(WitnessOrConstant<bb::fr>::from_index(base + j));
            pos.result.emplace_back(base + 4 + j);
        }
        auto ops = constraint_to_acir_opcode(pos);
        all_opcodes.insert(all_opcodes.end(), ops.begin(), ops.end());
    }

    Acir::Circuit circuit = build_acir_circuit(all_opcodes);
    witness_out = WitnessVector(120, fr(0));
    return circuit_serde_to_acir_format(circuit);
}

// N=1 parallel vs N=2 parallel: should be bit-identical since both go through
// prepare_builder_from_profiles and execute_parallel.
TEST_F(PerBlockGateCountTests, ParallelN1vsN2BitIdentical)
{
    WitnessVector witness;
    AcirFormat constraint_system = build_sha256_poseidon2_test_program(witness);

    // Build with 1 thread
    AcirFormat n1_constraints = constraint_system;
    UltraCircuitBuilder n1_builder{ WitnessVector(witness), n1_constraints.public_inputs, false };
    build_constraints_parallel(n1_builder, n1_constraints, ProgramMetadata{}, /*num_threads=*/1);

    // Build with 2 threads
    AcirFormat n2_constraints = constraint_system;
    UltraCircuitBuilder n2_builder{ WitnessVector(witness), n2_constraints.public_inputs, false };
    build_constraints_parallel(n2_builder, n2_constraints, ProgramMetadata{}, /*num_threads=*/2);

    // Both must pass circuit checker
    EXPECT_TRUE(CircuitChecker::check(n1_builder));
    EXPECT_TRUE(CircuitChecker::check(n2_builder));

    // Bit-identical: every block's wires and selectors must match
    auto n1_blocks = n1_builder.blocks.get();
    auto n2_blocks = n2_builder.blocks.get();
    for (size_t b = 0; b < UltraCircuitBuilder::ExecutionTrace::NUM_BLOCKS; b++) {
        EXPECT_EQ(n1_blocks[b].size(), n2_blocks[b].size()) << "block " << b << " size mismatch";
        size_t count = std::min(n1_blocks[b].size(), n2_blocks[b].size());

        size_t wire_mismatches = 0;
        for (size_t w = 0; w < 4; w++) {
            for (size_t i = 0; i < count; i++) {
                if (n1_blocks[b].wires[w][i] != n2_blocks[b].wires[w][i])
                    wire_mismatches++;
            }
        }
        EXPECT_EQ(wire_mismatches, 0) << "block " << b << ": " << wire_mismatches << " wire mismatches";

        auto n1_sels = n1_blocks[b].get_selectors();
        auto n2_sels = n2_blocks[b].get_selectors();
        size_t sel_mismatches = 0;
        for (size_t s = 0; s < n1_sels.size(); s++) {
            for (size_t i = 0; i < count; i++) {
                if (n1_sels[s][i] != n2_sels[s][i])
                    sel_mismatches++;
            }
        }
        EXPECT_EQ(sel_mismatches, 0) << "block " << b << ": " << sel_mismatches << " selector mismatches";
    }

    // Variable counts and union-find must match exactly
    EXPECT_EQ(n1_builder.get_num_variables(), n2_builder.get_num_variables());
    size_t num_vars = std::min(n1_builder.get_num_variables(), n2_builder.get_num_variables());
    size_t real_idx_mismatches = 0;
    for (size_t i = 0; i < num_vars; i++) {
        if (n1_builder.real_variable_index[i] != n2_builder.real_variable_index[i])
            real_idx_mismatches++;
    }
    EXPECT_EQ(real_idx_mismatches, 0) << "real_variable_index mismatches";
}

// Find the acir_tests directory relative to the source tree
std::filesystem::path find_acir_tests_dir()
{
    // Walk up from the build dir to find the repo root
    // The acir_tests are at barretenberg/acir_tests/acir_tests/
    std::filesystem::path candidate = std::filesystem::current_path();
    for (int i = 0; i < 10; i++) {
        auto test_dir = candidate / "barretenberg" / "acir_tests" / "acir_tests";
        if (std::filesystem::exists(test_dir)) {
            return test_dir;
        }
        candidate = candidate.parent_path();
    }
    return {};
}

// Collect all acir_test directories that have compiled artifacts
std::vector<std::filesystem::path> collect_acir_test_programs()
{
    auto acir_dir = find_acir_tests_dir();
    if (acir_dir.empty()) {
        return {};
    }
    std::vector<std::filesystem::path> programs;
    for (const auto& entry : std::filesystem::directory_iterator(acir_dir)) {
        if (!entry.is_directory())
            continue;
        auto program_json = entry.path() / "target" / "program.json";
        auto witness_gz = entry.path() / "target" / "witness.gz";
        if (std::filesystem::exists(program_json) && std::filesystem::exists(witness_gz)) {
            programs.push_back(entry.path());
        }
    }
    std::sort(programs.begin(), programs.end());
    return programs;
}

// Check semantic equivalence between two builders: same block sizes, variable counts,
// copy cycle structure, constants, range lists, and lookup tables.
// Returns number of failures (0 = all invariants hold).
size_t check_semantic_equivalence(const std::string& label, UltraCircuitBuilder& a, UltraCircuitBuilder& b)
{
    size_t failures = 0;

    // Block sizes must match
    auto a_blocks = a.blocks.get();
    auto b_blocks = b.blocks.get();
    for (size_t bl = 0; bl < UltraCircuitBuilder::ExecutionTrace::NUM_BLOCKS; bl++) {
        if (a_blocks[bl].size() != b_blocks[bl].size()) {
            info(label, ": block ", bl, " size mismatch: ", a_blocks[bl].size(), " vs ", b_blocks[bl].size());
            failures++;
        }
    }

    // Variable count
    if (a.get_num_variables() != b.get_num_variables()) {
        info(label, ": variable count mismatch: ", a.get_num_variables(), " vs ", b.get_num_variables());
        failures++;
    }

    // Copy cycles: compare as sorted list of (value, cycle_size) pairs.
    // Each cycle is a set of variables with the same real_variable_index root.
    // The cycle's "value" is the field element at that root (all vars in the cycle share it).
    // This checks that the same groups of variables are assert_equal'd, up to reordering.
    auto collect_cycles = [](const UltraCircuitBuilder& builder) -> std::vector<std::pair<bb::fr, size_t>> {
        std::map<uint32_t, size_t> root_sizes;
        for (size_t i = 0; i < builder.get_num_variables(); i++) {
            root_sizes[builder.real_variable_index[i]]++;
        }
        std::vector<std::pair<bb::fr, size_t>> cycles;
        cycles.reserve(root_sizes.size());
        for (const auto& [root, sz] : root_sizes) {
            cycles.emplace_back(builder.get_variable(root), sz);
        }
        std::sort(cycles.begin(), cycles.end(), [](const auto& x, const auto& y) {
            if (x.second != y.second)
                return x.second < y.second;
            return x.first < y.first;
        });
        return cycles;
    };
    auto a_cycles = collect_cycles(a);
    auto b_cycles = collect_cycles(b);
    if (a_cycles.size() != b_cycles.size()) {
        info(label, ": copy cycle count mismatch: ", a_cycles.size(), " vs ", b_cycles.size());
        failures++;
    } else {
        size_t cycle_mismatches = 0;
        for (size_t i = 0; i < a_cycles.size(); i++) {
            if (a_cycles[i] != b_cycles[i]) {
                cycle_mismatches++;
            }
        }
        if (cycle_mismatches > 0) {
            info(label, ": ", cycle_mismatches, " copy cycle (value, size) mismatches out of ", a_cycles.size());
            failures++;
        }
    }

    // Constants: same set of constant values (not just count)
    {
        std::set<bb::fr> a_consts, b_consts;
        for (const auto& [val, _] : a.constant_variable_indices)
            a_consts.insert(val);
        for (const auto& [val, _] : b.constant_variable_indices)
            b_consts.insert(val);
        if (a_consts != b_consts) {
            info(label, ": constant value sets differ: a has ", a_consts.size(), " b has ", b_consts.size());
            failures++;
        }
    }

    // Range lists: same targets, same variable counts per target
    if (a.range_lists.size() != b.range_lists.size()) {
        info(label, ": range list count mismatch: ", a.range_lists.size(), " vs ", b.range_lists.size());
        failures++;
    }
    for (const auto& [target, a_rl] : a.range_lists) {
        auto it = b.range_lists.find(target);
        if (it == b.range_lists.end()) {
            info(label, ": range target ", target, " missing from second builder");
            failures++;
        } else if (a_rl.variable_indices.size() != it->second.variable_indices.size()) {
            info(label,
                 ": range target ",
                 target,
                 " variable count mismatch: ",
                 a_rl.variable_indices.size(),
                 " vs ",
                 it->second.variable_indices.size());
            failures++;
        }
    }

    // Gate multiset comparison: for each block, collect all gate tuples (resolved wire values +
    // selector values), sort them, and compare. This checks that the same gates exist in both
    // circuits regardless of ordering.
    {
        auto a_blks = a.blocks.get();
        auto b_blks = b.blocks.get();
        for (size_t bl = 0; bl < UltraCircuitBuilder::ExecutionTrace::NUM_BLOCKS; bl++) {
            if (a_blks[bl].size() != b_blks[bl].size()) {
                continue; // already reported as block size mismatch
            }
            size_t count = a_blks[bl].size();
            if (count == 0) {
                continue;
            }

            // Collect gate tuples: 4 resolved wire values + all selector values
            auto a_sels = a_blks[bl].get_selectors();
            auto b_sels = b_blks[bl].get_selectors();
            size_t tuple_size = 4 + a_sels.size();

            auto collect_tuples = [&](const auto& blk, const auto& sels, const UltraCircuitBuilder& builder) {
                std::vector<std::vector<bb::fr>> tuples;
                tuples.reserve(count);
                for (size_t i = 0; i < count; i++) {
                    std::vector<bb::fr> t(tuple_size);
                    for (size_t w = 0; w < 4; w++) {
                        t[w] = builder.get_variable(blk.wires[w][i]);
                    }
                    for (size_t s = 0; s < sels.size(); s++) {
                        t[4 + s] = sels[s][i];
                    }
                    tuples.push_back(std::move(t));
                }
                std::sort(tuples.begin(), tuples.end());
                return tuples;
            };

            auto a_tuples = collect_tuples(a_blks[bl], a_sels, a);
            auto b_tuples = collect_tuples(b_blks[bl], b_sels, b);

            if (a_tuples != b_tuples) {
                info(label, ": block ", bl, " gate multiset mismatch (", count, " gates)");
                // Find first difference
                size_t a_only = 0;
                size_t b_only = 0;
                size_t ai = 0;
                size_t bi = 0;
                while (ai < a_tuples.size() && bi < b_tuples.size()) {
                    if (a_tuples[ai] == b_tuples[bi]) {
                        ai++;
                        bi++;
                    } else if (a_tuples[ai] < b_tuples[bi]) {
                        a_only++;
                        ai++;
                    } else {
                        b_only++;
                        bi++;
                    }
                }
                a_only += a_tuples.size() - ai;
                b_only += b_tuples.size() - bi;
                info(label, ": block ", bl, " a_only=", a_only, " b_only=", b_only);
                // Print first differing tuple from each side
                ai = 0;
                bi = 0;
                bool printed_a = false;
                bool printed_b = false;
                while (ai < a_tuples.size() && bi < b_tuples.size() && (!printed_a || !printed_b)) {
                    if (a_tuples[ai] == b_tuples[bi]) {
                        ai++;
                        bi++;
                    } else if (a_tuples[ai] < b_tuples[bi]) {
                        if (!printed_a) {
                            std::string sels_a;
                            for (size_t s = 4; s < a_tuples[ai].size(); s++)
                                sels_a += " s" + std::to_string(s - 4) + "=" + (a_tuples[ai][s].is_zero() ? "0" : "1");
                            info("    a_only[0]: w0=",
                                 a_tuples[ai][0],
                                 " w1=",
                                 a_tuples[ai][1],
                                 " w2=",
                                 a_tuples[ai][2],
                                 " w3=",
                                 a_tuples[ai][3],
                                 sels_a);
                            printed_a = true;
                        }
                        ai++;
                    } else {
                        if (!printed_b) {
                            std::string sels_b;
                            for (size_t s = 4; s < b_tuples[bi].size(); s++)
                                sels_b += " s" + std::to_string(s - 4) + "=" + (b_tuples[bi][s].is_zero() ? "0" : "1");
                            info("    b_only[0]: w0=",
                                 b_tuples[bi][0],
                                 " w1=",
                                 b_tuples[bi][1],
                                 " w2=",
                                 b_tuples[bi][2],
                                 " w3=",
                                 b_tuples[bi][3],
                                 sels_b);
                            printed_b = true;
                        }
                        bi++;
                    }
                }
                failures++;
            }
        }
    }

    // Lookup tables
    if (a.get_lookup_tables().size() != b.get_lookup_tables().size()) {
        info(label,
             ": lookup table count mismatch: ",
             a.get_lookup_tables().size(),
             " vs ",
             b.get_lookup_tables().size());
        failures++;
    }

    return failures;
}

// Check bit-identical circuits (every wire, selector, variable, and union-find entry must match).
// Returns number of mismatches (0 = identical).
size_t check_bit_identical(const std::string& label, UltraCircuitBuilder& a, UltraCircuitBuilder& b)
{
    size_t mismatches = 0;

    auto a_blocks = a.blocks.get();
    auto b_blocks = b.blocks.get();
    for (size_t bl = 0; bl < UltraCircuitBuilder::ExecutionTrace::NUM_BLOCKS; bl++) {
        if (a_blocks[bl].size() != b_blocks[bl].size()) {
            info(label, ": block ", bl, " size mismatch: ", a_blocks[bl].size(), " vs ", b_blocks[bl].size());
            mismatches++;
            continue;
        }
        size_t count = a_blocks[bl].size();
        for (size_t w = 0; w < 4; w++) {
            for (size_t i = 0; i < count; i++) {
                if (a_blocks[bl].wires[w][i] != b_blocks[bl].wires[w][i])
                    mismatches++;
            }
        }
        auto a_sels = a_blocks[bl].get_selectors();
        auto b_sels = b_blocks[bl].get_selectors();
        for (size_t s = 0; s < a_sels.size(); s++) {
            for (size_t i = 0; i < count; i++) {
                if (a_sels[s][i] != b_sels[s][i])
                    mismatches++;
            }
        }
    }

    if (a.get_num_variables() != b.get_num_variables()) {
        info(label, ": variable count mismatch");
        mismatches++;
    } else {
        for (size_t i = 0; i < a.get_num_variables(); i++) {
            if (a.real_variable_index[i] != b.real_variable_index[i])
                mismatches++;
        }
    }

    return mismatches;
}

// Parameterized test that runs the 3-way comparison on every acir_test program.
class AcirTestParallelEquivalence : public ::testing::TestWithParam<std::filesystem::path> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_P(AcirTestParallelEquivalence, SequentialN1N2)
{
    auto test_dir = GetParam();
    std::string test_name = test_dir.filename().string();
    auto program_path = test_dir / "target" / "program.json";
    auto witness_path = test_dir / "target" / "witness.gz";

    // Load bytecode and witness
    auto bytecode = get_bytecode(program_path.string());
    AcirFormat constraints = circuit_buf_to_acir_format(std::move(bytecode));
    auto witness_buf = gunzip(witness_path.string());
    WitnessVector witness = witness_buf_to_witness_vector(std::move(witness_buf));

    // Print constraint breakdown for diagnostics
    info("  quad=",
         constraints.quad_constraints.size(),
         " big_quad=",
         constraints.big_quad_constraints.size(),
         " logic=",
         constraints.logic_constraints.size(),
         " range=",
         constraints.range_constraints.size(),
         " sha256=",
         constraints.sha256_compression.size(),
         " ecdsa_k1=",
         constraints.ecdsa_k1_constraints.size(),
         " ecdsa_r1=",
         constraints.ecdsa_r1_constraints.size(),
         " poseidon2=",
         constraints.poseidon2_constraints.size(),
         " block=",
         constraints.block_constraints.size(),
         " msm=",
         constraints.multi_scalar_mul_constraints.size(),
         " ec_add=",
         constraints.ec_add_constraints.size(),
         " aes128=",
         constraints.aes128_constraints.size());

    // Skip circuits with no parallelizable constraints (e.g., brillig-only programs)
    bool has_constraints = !constraints.quad_constraints.empty() || !constraints.big_quad_constraints.empty() ||
                           !constraints.logic_constraints.empty() || !constraints.range_constraints.empty() ||
                           !constraints.sha256_compression.empty() || !constraints.ecdsa_k1_constraints.empty() ||
                           !constraints.ecdsa_r1_constraints.empty() || !constraints.poseidon2_constraints.empty() ||
                           !constraints.multi_scalar_mul_constraints.empty() ||
                           !constraints.ec_add_constraints.empty() || !constraints.aes128_constraints.empty() ||
                           !constraints.blake2s_constraints.empty() || !constraints.blake3_constraints.empty() ||
                           !constraints.keccak_permutations.empty();
    if (!has_constraints) {
        GTEST_SKIP() << "No parallelizable constraints";
    }

    // Skip recursion programs (need pre-computed proof data not available in this test)
    if (!constraints.honk_recursion_constraints.empty() || !constraints.avm_recursion_constraints.empty() ||
        !constraints.hn_recursion_constraints.empty() || !constraints.chonk_recursion_constraints.empty()) {
        GTEST_SKIP() << "Recursion constraints not supported in this test";
    }

    // 1. Build sequentially via create_circuit (uses build_constraints)
    AcirProgram seq_program{ constraints, WitnessVector(witness) };
    auto seq_builder = create_circuit<UltraCircuitBuilder>(seq_program, ProgramMetadata{});

    // 2. Build via parallel path with N=1
    AcirFormat n1_constraints = constraints;
    UltraCircuitBuilder n1_builder{ WitnessVector(witness), n1_constraints.public_inputs, false };
    build_constraints_parallel(n1_builder, n1_constraints, ProgramMetadata{}, /*num_threads=*/1);

    // 3. Build via parallel path with N=2
    AcirFormat n2_constraints = constraints;
    UltraCircuitBuilder n2_builder{ WitnessVector(witness), n2_constraints.public_inputs, false };
    build_constraints_parallel(n2_builder, n2_constraints, ProgramMetadata{}, /*num_threads=*/2);

    // Print block sizes for all three builders
    {
        auto sb = seq_builder.blocks.get();
        auto n1b = n1_builder.blocks.get();
        auto n2b = n2_builder.blocks.get();
        for (size_t bl = 0; bl < UltraCircuitBuilder::ExecutionTrace::NUM_BLOCKS; bl++) {
            if (sb[bl].size() > 0 || n1b[bl].size() > 0 || n2b[bl].size() > 0) {
                info("  block ", bl, ": seq=", sb[bl].size(), " n1=", n1b[bl].size(), " n2=", n2b[bl].size());
            }
        }
        info("  vars: seq=",
             seq_builder.get_num_variables(),
             " n1=",
             n1_builder.get_num_variables(),
             " n2=",
             n2_builder.get_num_variables());
        info("  constants: seq=",
             seq_builder.constant_variable_indices.size(),
             " n1=",
             n1_builder.constant_variable_indices.size(),
             " n2=",
             n2_builder.constant_variable_indices.size());
        info("  range_lists: seq=",
             seq_builder.range_lists.size(),
             " n1=",
             n1_builder.range_lists.size(),
             " n2=",
             n2_builder.range_lists.size());
        for (const auto& [target, rl] : seq_builder.range_lists) {
            auto n1_it = n1_builder.range_lists.find(target);
            size_t n1_count = (n1_it != n1_builder.range_lists.end()) ? n1_it->second.variable_indices.size() : 0;
            info("    range ", target, ": seq=", rl.variable_indices.size(), " n1=", n1_count);
        }
        // Check for range lists in n1 that aren't in seq
        for (const auto& [target, rl] : n1_builder.range_lists) {
            if (seq_builder.range_lists.find(target) == seq_builder.range_lists.end()) {
                info("    range ", target, ": seq=MISSING n1=", rl.variable_indices.size());
            }
        }
    }

    // All three must pass circuit checker
    bool seq_ok = CircuitChecker::check(seq_builder);
    bool n1_ok = CircuitChecker::check(n1_builder);
    bool n2_ok = CircuitChecker::check(n2_builder);
    EXPECT_TRUE(seq_ok) << test_name << ": sequential CircuitChecker failed";
    EXPECT_TRUE(n1_ok) << test_name << ": N=1 CircuitChecker failed";
    EXPECT_TRUE(n2_ok) << test_name << ": N=2 CircuitChecker failed";

    // Sequential vs N=1: semantic equivalence (same constraints, different order)
    size_t seq_n1_failures = check_semantic_equivalence(test_name + " seq-vs-n1", seq_builder, n1_builder);
    EXPECT_EQ(seq_n1_failures, 0) << test_name << ": sequential vs N=1 semantic equivalence failed";

    // Sequential vs N=2: semantic equivalence
    size_t seq_n2_failures = check_semantic_equivalence(test_name + " seq-vs-n2", seq_builder, n2_builder);
    EXPECT_EQ(seq_n2_failures, 0) << test_name << ": sequential vs N=2 semantic equivalence failed";

    // N=1 vs N=2: must be bit-identical
    size_t n1_n2_mismatches = check_bit_identical(test_name + " n1-vs-n2", n1_builder, n2_builder);
    if (n1_n2_mismatches > 0) {
        // Print first few wire mismatches
        auto n1b = n1_builder.blocks.get();
        auto n2b = n2_builder.blocks.get();
        size_t printed = 0;
        for (size_t b = 0; b < UltraCircuitBuilder::ExecutionTrace::NUM_BLOCKS && printed < 5; b++) {
            size_t count = std::min(n1b[b].size(), n2b[b].size());
            for (size_t w = 0; w < 4 && printed < 5; w++) {
                for (size_t i = 0; i < count && printed < 5; i++) {
                    if (n1b[b].wires[w][i] != n2b[b].wires[w][i]) {
                        info("  WIRE DIFF block=",
                             b,
                             " gate=",
                             i,
                             " wire=",
                             w,
                             " n1=",
                             n1b[b].wires[w][i],
                             " n2=",
                             n2b[b].wires[w][i]);
                        printed++;
                    }
                }
            }
        }
        // Print first few real_variable_index mismatches
        size_t num_vars = std::min(n1_builder.get_num_variables(), n2_builder.get_num_variables());
        printed = 0;
        for (size_t i = 0; i < num_vars && printed < 5; i++) {
            if (n1_builder.real_variable_index[i] != n2_builder.real_variable_index[i]) {
                info("  REAL_VAR_IDX DIFF var=",
                     i,
                     " n1=",
                     n1_builder.real_variable_index[i],
                     " n2=",
                     n2_builder.real_variable_index[i]);
                printed++;
            }
        }
    }
    EXPECT_EQ(n1_n2_mismatches, 0) << test_name << ": N=1 vs N=2 bit-identical check failed";
}

INSTANTIATE_TEST_SUITE_P(AcirTests,
                         AcirTestParallelEquivalence,
                         ::testing::ValuesIn(collect_acir_test_programs()),
                         [](const ::testing::TestParamInfo<std::filesystem::path>& info) {
                             return info.param.filename().string();
                         });
