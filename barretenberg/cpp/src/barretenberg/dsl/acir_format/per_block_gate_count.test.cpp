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
#include "barretenberg/dsl/acir_format/poseidon2_constraint.hpp"
#include "barretenberg/dsl/acir_format/sha256_constraint.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"

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

// Helper: create a valid UltraHonk proof and convert it to a RecursionConstraint.
// Returns the constraint and the witness vector containing proof/VK data.
std::pair<RecursionConstraint, WitnessVector> create_honk_recursion_test_data()
{
    using InnerFlavor = UltraFlavor;
    using InnerBuilder = UltraCircuitBuilder;
    using InnerProverInstance = ProverInstance_<InnerFlavor>;
    using InnerProver = UltraProver;
    using InnerIO = stdlib::recursion::honk::DefaultIO<InnerBuilder>;

    // Create a simple inner circuit: one mul gate + default public inputs
    InnerBuilder inner_builder;
    auto a = inner_builder.add_variable(fr::random_element());
    auto b = inner_builder.add_variable(fr::random_element());
    auto c = inner_builder.add_variable(inner_builder.get_variable(a) * inner_builder.get_variable(b));
    inner_builder.create_big_mul_add_gate({ .a = a,
                                            .b = b,
                                            .c = c,
                                            .d = inner_builder.zero_idx(),
                                            .mul_scaling = 1,
                                            .a_scaling = 0,
                                            .b_scaling = 0,
                                            .c_scaling = -1,
                                            .d_scaling = 0,
                                            .const_scaling = 0 });
    InnerIO::add_default(inner_builder);

    auto prover_instance = std::make_shared<InnerProverInstance>(inner_builder);
    auto verification_key = std::make_shared<typename InnerFlavor::VerificationKey>(prover_instance->get_precomputed());
    InnerProver prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    WitnessVector witness;
    RecursionConstraint constraint =
        recursion_data_to_recursion_constraint(witness,
                                               proof,
                                               verification_key->to_field_elements(),
                                               verification_key->hash(),
                                               bb::fr::one(),
                                               inner_builder.num_public_inputs() - InnerIO::PUBLIC_INPUTS_SIZE,
                                               HONK);

    return { constraint, witness };
}

// Forward declarations for functions defined later in this file
size_t check_semantic_equivalence(const std::string& label, UltraCircuitBuilder& a, UltraCircuitBuilder& b);
size_t check_bit_identical(const std::string& label, UltraCircuitBuilder& a, UltraCircuitBuilder& b);
std::filesystem::path find_acir_tests_dir();

// Test that a circuit with a HONK recursion constraint passes CircuitChecker
// when built through the sequential and parallel paths.
TEST_F(PerBlockGateCountTests, RecursionConstraintBasic)
{
    auto [recursion_constraint, witness] = create_honk_recursion_test_data();

    AcirFormat constraints{};
    constraints.honk_recursion_constraints = { recursion_constraint };
    constraints.original_opcode_indices.honk_recursion_constraints = { 0 };
    constraints.num_acir_opcodes = 1;
    constraints.max_witness_index = static_cast<uint32_t>(witness.size() - 1);
    ProgramMetadata metadata{};

    // Fix predicate to constant true (matching production Noir circuits)
    constraints.honk_recursion_constraints[0].predicate = WitnessOrConstant<bb::fr>::from_constant(bb::fr(1));

    // Step 2: Use Mega for smaller circuits. Build parallel first, then sequential with same pre-warming.
    // Mega parallel N=1
    AcirFormat par_constraints = constraints;
    MegaCircuitBuilder par_builder{
        std::make_shared<ECCOpQueue>(), WitnessVector(witness), par_constraints.public_inputs, false
    };
    build_constraints_parallel(par_builder, par_constraints, metadata, /*num_threads=*/1);
    info("  Mega Parallel N=1: vars=", par_builder.get_num_variables());

    // Mega sequential with same constants pre-registered
    AcirFormat seq_constraints = constraints;
    MegaCircuitBuilder seq_builder{
        std::make_shared<ECCOpQueue>(), WitnessVector(witness), seq_constraints.public_inputs, false
    };
    for (const auto& [val, _] : par_builder.constant_variable_indices) {
        seq_builder.put_constant_variable(val);
    }
    for (const auto& [target, rl] : par_builder.range_lists) {
        if (seq_builder.range_lists.count(target) == 0) {
            seq_builder.range_lists.insert({ target, seq_builder.create_range_list(target) });
        }
    }
    build_constraints(seq_builder, seq_constraints, metadata);
    info("  Mega Sequential (pre-warmed): vars=", seq_builder.get_num_variables());

    // Compare
    EXPECT_EQ(par_builder.get_num_variables(), seq_builder.get_num_variables()) << "Variable count mismatch";
    {
        auto pb = par_builder.blocks.get();
        auto sb = seq_builder.blocks.get();
        for (size_t bl = 0; bl < MegaCircuitBuilder::ExecutionTrace::NUM_BLOCKS; bl++) {
            EXPECT_EQ(pb[bl].size(), sb[bl].size()) << "Block " << bl << " size mismatch";
        }
    }
    // Copy cycles
    {
        auto collect_cycles = [](auto& builder) {
            std::map<uint32_t, size_t> root_sizes;
            for (size_t i = 0; i < builder.get_num_variables(); i++) {
                root_sizes[builder.real_variable_index[i]]++;
            }
            std::vector<std::pair<bb::fr, size_t>> cycles;
            for (const auto& [root, sz] : root_sizes) {
                cycles.emplace_back(builder.get_variable(root), sz);
            }
            std::sort(cycles.begin(), cycles.end(), [](const auto& x, const auto& y) {
                return x.second != y.second ? x.second < y.second : x.first < y.first;
            });
            return cycles;
        };
        auto par_cycles = collect_cycles(par_builder);
        auto seq_cycles = collect_cycles(seq_builder);
        size_t cycle_mismatches = 0;
        if (par_cycles.size() == seq_cycles.size()) {
            for (size_t i = 0; i < par_cycles.size(); i++) {
                if (par_cycles[i] != seq_cycles[i])
                    cycle_mismatches++;
            }
        }
        info("  Copy cycles: ", par_cycles.size(), " vs ", seq_cycles.size(), ", mismatches=", cycle_mismatches);
    }
    // Gate multiset for block 4 (arithmetic in Mega)
    {
        auto pb = par_builder.blocks.get();
        auto sb = seq_builder.blocks.get();
        size_t bl = 4; // arithmetic
        if (pb[bl].size() == sb[bl].size() && pb[bl].size() > 0) {
            size_t count = pb[bl].size();
            auto ps = pb[bl].get_selectors();
            auto ss = sb[bl].get_selectors();
            size_t ts = 4 + ps.size();
            auto ct = [&](const auto& blk, const auto& sels, auto& builder) {
                std::vector<std::vector<bb::fr>> tuples;
                tuples.reserve(count);
                for (size_t i = 0; i < count; i++) {
                    std::vector<bb::fr> t(ts);
                    for (size_t w = 0; w < 4; w++)
                        t[w] = builder.get_variable(blk.wires[w][i]);
                    for (size_t s = 0; s < sels.size(); s++)
                        t[4 + s] = sels[s][i];
                    tuples.push_back(std::move(t));
                }
                std::sort(tuples.begin(), tuples.end());
                return tuples;
            };
            auto pt = ct(pb[bl], ps, par_builder);
            auto st = ct(sb[bl], ss, seq_builder);
            info("  Block 4 (arithmetic) multiset: ", pt == st ? "MATCH" : "MISMATCH", " (", count, " gates)");
            EXPECT_TRUE(pt == st) << "Gate multiset mismatch in block 4";
        }
    }

    // CircuitChecker on both
    EXPECT_TRUE(CircuitChecker::check(par_builder)) << "Parallel N=1 failed CircuitChecker";
    EXPECT_TRUE(CircuitChecker::check(seq_builder)) << "Sequential failed CircuitChecker";

    // N=1 vs N=2 bit-identical
    {
        AcirFormat par2_constraints = constraints;
        MegaCircuitBuilder par2_builder{
            std::make_shared<ECCOpQueue>(), WitnessVector(witness), par2_constraints.public_inputs, false
        };
        build_constraints_parallel(par2_builder, par2_constraints, metadata, /*num_threads=*/2);
        info("  Mega Parallel N=2: vars=", par2_builder.get_num_variables());
        EXPECT_EQ(par_builder.get_num_variables(), par2_builder.get_num_variables()) << "N=1 vs N=2 var count";

        size_t n1_n2_diffs = 0;
        for (size_t i = 0; i < par_builder.get_num_variables(); i++) {
            if (par_builder.real_variable_index[i] != par2_builder.real_variable_index[i])
                n1_n2_diffs++;
        }
        info("  N=1 vs N=2 real_variable_index diffs: ", n1_n2_diffs);
        EXPECT_EQ(n1_n2_diffs, 0) << "N=1 vs N=2 not bit-identical";
    }

    // Quick Ultra check: does the same test fail with Ultra?
    {
        AcirFormat ultra_par_c = constraints;
        UltraCircuitBuilder ultra_par{ WitnessVector(witness), ultra_par_c.public_inputs, false };
        build_constraints_parallel(ultra_par, ultra_par_c, metadata, /*num_threads=*/1);

        AcirFormat ultra_seq_c = constraints;
        UltraCircuitBuilder ultra_seq{ WitnessVector(witness), ultra_seq_c.public_inputs, false };
        for (const auto& [val, _] : ultra_par.constant_variable_indices) {
            ultra_seq.put_constant_variable(val);
        }
        for (const auto& [target, rl] : ultra_par.range_lists) {
            if (ultra_seq.range_lists.count(target) == 0) {
                ultra_seq.range_lists.insert({ target, ultra_seq.create_range_list(target) });
            }
        }
        build_constraints(ultra_seq, ultra_seq_c, metadata);
        info("  Ultra: par vars=", ultra_par.get_num_variables(), " seq vars=", ultra_seq.get_num_variables());

        size_t ultra_failures = check_semantic_equivalence("recursion Ultra seq-vs-par", ultra_seq, ultra_par);
        info("  Ultra seq-vs-par: ", ultra_failures, " failures");
    }
}

// Test recursion constraint alongside other constraint types in the parallel pipeline.
// Uses Mega builder for speed. The recursion constraint runs in Phase 4 (sequential),
// while quads and ranges run in Phase 3 (parallel).
TEST_F(PerBlockGateCountTests, RecursionWithOtherConstraints)
{
    auto [recursion_constraint, rec_witness] = create_honk_recursion_test_data();

    // Build an AcirFormat with: the recursion constraint + some quad constraints + some range constraints.
    // The quads and ranges use witness indices beyond the recursion witness range.
    uint32_t rec_max_witness = static_cast<uint32_t>(rec_witness.size() - 1);

    // Create 4 quad constraints using fresh witnesses after the recursion witness range
    std::vector<QuadConstraint> quads;
    uint32_t w = rec_max_witness + 1;
    for (int i = 0; i < 4; i++) {
        quads.push_back({ .a = w,
                          .b = w + 1,
                          .c = w + 2,
                          .d = w + 3,
                          .mul_scaling = 1,
                          .a_scaling = 0,
                          .b_scaling = 0,
                          .c_scaling = -1,
                          .d_scaling = 0,
                          .const_scaling = 0 });
        w += 4;
    }

    // Create 4 range constraints on fresh witnesses
    std::vector<RangeConstraint> ranges;
    for (int i = 0; i < 4; i++) {
        ranges.push_back({ .witness = w, .num_bits = 8 });
        w++;
    }

    uint32_t total_witnesses = w;

    // Extend witness vector with valid values for the new constraints
    WitnessVector witness = rec_witness;
    witness.resize(total_witnesses, fr(0));
    // Fill quad witnesses: a*b = c
    uint32_t qw = rec_max_witness + 1;
    for (int i = 0; i < 4; i++) {
        fr a_val = fr::random_element();
        fr b_val = fr::random_element();
        witness[qw] = a_val;
        witness[qw + 1] = b_val;
        witness[qw + 2] = a_val * b_val;
        witness[qw + 3] = fr(0);
        qw += 4;
    }
    // Range witnesses: small values that fit in 8 bits
    for (int i = 0; i < 4; i++) {
        witness[qw + static_cast<uint32_t>(i)] = fr(42 + i);
    }

    AcirFormat constraints{};
    constraints.honk_recursion_constraints = { recursion_constraint };
    constraints.original_opcode_indices.honk_recursion_constraints = { 0 };
    constraints.quad_constraints = quads;
    constraints.original_opcode_indices.quad_constraints = { 1, 2, 3, 4 };
    constraints.range_constraints = ranges;
    constraints.original_opcode_indices.range_constraints = { 5, 6, 7, 8 };
    constraints.num_acir_opcodes = 9;
    constraints.max_witness_index = total_witnesses - 1;

    ProgramMetadata metadata{};

    // Build with Mega N=1 and N=2
    AcirFormat n1_constraints = constraints;
    MegaCircuitBuilder n1_builder{
        std::make_shared<ECCOpQueue>(), WitnessVector(witness), n1_constraints.public_inputs, false
    };
    build_constraints_parallel(n1_builder, n1_constraints, metadata, /*num_threads=*/1);

    AcirFormat n2_constraints = constraints;
    MegaCircuitBuilder n2_builder{
        std::make_shared<ECCOpQueue>(), WitnessVector(witness), n2_constraints.public_inputs, false
    };
    build_constraints_parallel(n2_builder, n2_constraints, metadata, /*num_threads=*/2);

    info("Recursion+quads+ranges Mega: N1 vars=",
         n1_builder.get_num_variables(),
         " N2 vars=",
         n2_builder.get_num_variables());

    EXPECT_TRUE(CircuitChecker::check(n1_builder)) << "N=1 CircuitChecker failed";
    EXPECT_TRUE(CircuitChecker::check(n2_builder)) << "N=2 CircuitChecker failed";
    EXPECT_EQ(n1_builder.get_num_variables(), n2_builder.get_num_variables());
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

    // Block sizes
    auto a_blocks = a.blocks.get();
    auto b_blocks = b.blocks.get();
    for (size_t bl = 0; bl < UltraCircuitBuilder::ExecutionTrace::NUM_BLOCKS; bl++) {
        if (a_blocks[bl].size() > 0 || b_blocks[bl].size() > 0) {
            bool ok = (a_blocks[bl].size() == b_blocks[bl].size());
            info(label,
                 ": block ",
                 bl,
                 ": ",
                 a_blocks[bl].size(),
                 " vs ",
                 b_blocks[bl].size(),
                 ok ? " OK" : " MISMATCH");
            if (!ok)
                failures++;
        }
    }

    // Variable count
    {
        bool ok = (a.get_num_variables() == b.get_num_variables());
        info(label, ": variables: ", a.get_num_variables(), " vs ", b.get_num_variables(), ok ? " OK" : " MISMATCH");
        if (!ok)
            failures++;
    }

    // Constants
    {
        bool ok = (a.constant_variable_indices.size() == b.constant_variable_indices.size());
        info(label,
             ": constants: ",
             a.constant_variable_indices.size(),
             " vs ",
             b.constant_variable_indices.size(),
             ok ? " OK" : " MISMATCH");
    }

    // Range lists
    {
        bool ok = (a.range_lists.size() == b.range_lists.size());
        info(label, ": range_lists: ", a.range_lists.size(), " vs ", b.range_lists.size(), ok ? " OK" : " MISMATCH");
    }

    // Lookup tables
    {
        bool ok = (a.get_lookup_tables().size() == b.get_lookup_tables().size());
        info(label,
             ": lookup_tables: ",
             a.get_lookup_tables().size(),
             " vs ",
             b.get_lookup_tables().size(),
             ok ? " OK" : " MISMATCH");
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
                // Print first few differing tuples from each side
                ai = 0;
                bi = 0;
                size_t printed_a = 0;
                size_t printed_b = 0;
                while (ai < a_tuples.size() && bi < b_tuples.size() && (printed_a < 3 || printed_b < 3)) {
                    if (a_tuples[ai] == b_tuples[bi]) {
                        ai++;
                        bi++;
                    } else if (a_tuples[ai] < b_tuples[bi]) {
                        if (printed_a < 3) {
                            info("    a_only[",
                                 printed_a,
                                 "]: w0=",
                                 a_tuples[ai][0],
                                 " w1=",
                                 a_tuples[ai][1],
                                 " w2=",
                                 a_tuples[ai][2],
                                 " w3=",
                                 a_tuples[ai][3]);
                            printed_a++;
                        }
                        ai++;
                    } else {
                        if (printed_b < 3) {
                            info("    b_only[",
                                 printed_b,
                                 "]: w0=",
                                 b_tuples[bi][0],
                                 " w1=",
                                 b_tuples[bi][1],
                                 " w2=",
                                 b_tuples[bi][2],
                                 " w3=",
                                 b_tuples[bi][3]);
                            printed_b++;
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
