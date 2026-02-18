/**
 * @file boomerang_sha256_constraints.test.cpp
 * @brief Tests for SHA256 compression constraint processing in StaticAnalyzerAcir
 */

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/noir_programs_boomerang_values/sha256_circuit_helpers.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace acir_format;
using namespace cdg;

namespace {

// Block indices in UltraTraceBlockData::get() order
[[maybe_unused]] constexpr size_t LOOKUP_BLOCK_IDX = 1;
[[maybe_unused]] constexpr size_t ARITHMETIC_BLOCK_IDX = 2;
[[maybe_unused]] constexpr size_t DELTA_RANGE_BLOCK_IDX = 3;

// SHA256 IV constants
constexpr uint32_t SHA256_IV[8] = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

// Expected gate counts for SHA256 compression (all witnesses, no constants).
// Reference circuit = standalone sha256_block call (no ACIR assert_equal gates).
// ACIR circuit adds 8 assert_equal gates (one per result) in the arithmetic block.
constexpr size_t EXPECTED_REF_LOOKUP_GATES = 2896;
constexpr size_t EXPECTED_REF_ARITH_GATES = 2363;
constexpr size_t EXPECTED_ACIR_LOOKUP_GATES = 2896;
constexpr size_t EXPECTED_ACIR_ARITH_GATES = 2371; // 2363 + 8 assert_equal

// Expected selector hashes for full blocks (all witnesses, no constants)
constexpr size_t EXPECTED_LOOKUP_SELECTOR_HASH = 1201492680789112893ULL;
constexpr size_t EXPECTED_ARITH_SELECTOR_HASH = 560820328908023616ULL;

/**
 * @brief Helper struct to hold SHA256 constraint test setup
 */
struct SHA256TestSetup {
    Sha256Compression constraint;
    WitnessVector witness_values;
    std::array<uint32_t, 16> input_block;
    std::array<uint32_t, 8> hash_values;
    std::array<uint32_t, 8> result;
};

/**
 * @brief Build a standard all-witness SHA256 test setup
 */
SHA256TestSetup build_standard_sha256_setup()
{
    using FF = fr;
    SHA256TestSetup setup;

    setup.input_block = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 };
    std::copy(std::begin(SHA256_IV), std::end(SHA256_IV), setup.hash_values.begin());
    setup.result = crypto::sha256_block(setup.hash_values, setup.input_block);

    auto make_witness = [&](uint32_t value) -> WitnessOrConstant<FF> {
        uint32_t idx = static_cast<uint32_t>(setup.witness_values.size());
        setup.witness_values.emplace_back(FF(value));
        return WitnessOrConstant<FF>::from_index(idx);
    };

    for (size_t i = 0; i < 16; ++i) {
        setup.constraint.inputs[i] = make_witness(setup.input_block[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        setup.constraint.hash_values[i] = make_witness(setup.hash_values[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        setup.constraint.result[i] = static_cast<uint32_t>(setup.witness_values.size());
        setup.witness_values.emplace_back(FF(setup.result[i]));
    }

    return setup;
}

/**
 * @brief Find subtrace boundaries for a set of witnesses in a specific block
 * @return {min_gate_idx, max_gate_idx} or nullopt if no gates found
 */
std::optional<std::pair<size_t, size_t>> find_subtrace_boundaries(
    UltraStaticAnalyzer& analyzer, const std::vector<uint32_t>& witness_real_indices, size_t target_block_idx)
{
    size_t min_gate = std::numeric_limits<size_t>::max();
    size_t max_gate = 0;
    bool found = false;

    for (uint32_t real_idx : witness_real_indices) {
        const auto& gates = analyzer.get_variable_gates(real_idx);
        for (const auto& [block_idx, gate_idx] : gates) {
            if (block_idx == target_block_idx) {
                min_gate = std::min(min_gate, gate_idx);
                max_gate = std::max(max_gate, gate_idx);
                found = true;
            }
        }
    }

    if (!found) {
        return std::nullopt;
    }
    return std::make_pair(min_gate, max_gate);
}

/**
 * @brief Compute a deterministic hash of selectors in a block range
 *
 * Uses Boost-style hash_combine (same approach as KeyHasher in graph.hpp):
 *   combined = combined ^ (element_hash + 0x9e3779b9 + (combined << 6) + (combined >> 2))
 */
template <typename Block> size_t compute_selector_hash(Block& block, size_t start_idx, size_t end_idx)
{
    constexpr size_t HASH_COMBINE_CONSTANT = 0x9e3779b9;
    auto hash_combiner = [](size_t lhs, size_t rhs) {
        return lhs ^ (rhs + HASH_COMBINE_CONSTANT + (lhs << 6) + (lhs >> 2));
    };

    size_t combined_hash = 0;
    auto selectors = block.get_selectors();

    for (size_t gate = start_idx; gate <= end_idx; ++gate) {
        for (size_t s = 0; s < selectors.size(); ++s) {
            // Convert field element to uint64_t for hashing
            uint64_t val = static_cast<uint64_t>(uint256_t(selectors[s][gate]));
            combined_hash = hash_combiner(combined_hash, std::hash<uint64_t>()(val));
        }
    }
    return combined_hash;
}

/**
 * @brief Collect real variable indices for all non-constant witnesses in a SHA256 constraint
 */
std::vector<uint32_t> collect_sha256_witness_real_indices(const Sha256Compression& constraint,
                                                          UltraCircuitBuilder& builder)
{
    std::vector<uint32_t> real_indices;

    for (size_t i = 0; i < 16; ++i) {
        if (!constraint.inputs[i].is_constant) {
            real_indices.push_back(builder.real_variable_index[constraint.inputs[i].index]);
        }
    }
    for (size_t i = 0; i < 8; ++i) {
        if (!constraint.hash_values[i].is_constant) {
            real_indices.push_back(builder.real_variable_index[constraint.hash_values[i].index]);
        }
    }
    for (size_t i = 0; i < 8; ++i) {
        real_indices.push_back(builder.real_variable_index[constraint.result[i]]);
    }

    // Deduplicate
    std::sort(real_indices.begin(), real_indices.end());
    real_indices.erase(std::unique(real_indices.begin(), real_indices.end()), real_indices.end());

    return real_indices;
}

} // anonymous namespace

/**
 * @brief Test suite for SHA256 compression constraint processing in StaticAnalyzerAcir
 */
class BoomerangSHA256ConstraintsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief Test basic SHA256 compression constraint processing
 */
TEST_F(BoomerangSHA256ConstraintsTests, BasicSHA256Constraint)
{
    auto setup = build_standard_sha256_setup();

    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test SHA256 compression with zero message inputs
 */
TEST_F(BoomerangSHA256ConstraintsTests, SHA256ZeroInputs)
{
    using FF = fr;

    WitnessVector witness_values;
    auto make_witness = [&](uint32_t value) -> WitnessOrConstant<FF> {
        uint32_t idx = static_cast<uint32_t>(witness_values.size());
        witness_values.emplace_back(FF(value));
        return WitnessOrConstant<FF>::from_index(idx);
    };

    std::array<uint32_t, 16> input_block = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
    std::array<uint32_t, 8> hash_values = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

    std::array<uint32_t, 8> result = crypto::sha256_block(hash_values, input_block);

    Sha256Compression sha256_constraint;

    for (size_t i = 0; i < 16; ++i) {
        sha256_constraint.inputs[i] = make_witness(input_block[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_constraint.hash_values[i] = make_witness(hash_values[i]);
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_constraint.result[i] = static_cast<uint32_t>(witness_values.size());
        witness_values.emplace_back(FF(result[i]));
    }

    AcirFormat constraint_system = constraint_to_acir_format(sha256_constraint);
    AcirProgram program{ constraint_system, witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Discovery test: find subtrace boundaries and gate counts for SHA256 compression
 *
 * Uses two approaches to determine the full SHA256 subtrace:
 * 1. get_variable_gates() on constraint witnesses to find the subtrace START in each block
 * 2. A reference circuit (built with same inputs) to determine expected subtrace SIZE
 *
 * The constraint witnesses (32 total) are a subset of all variables created by sha256_block.
 * Many intermediate variables (sparse limbs, lookup outputs, accumulators) are NOT constraint
 * witnesses, so we need the reference circuit to know the full extent of each block.
 */
TEST_F(BoomerangSHA256ConstraintsTests, SHA256GateCountRegression)
{
    using field_ct = bb::stdlib::field_t<UltraCircuitBuilder>;
    using witness_ct = bb::stdlib::witness_t<UltraCircuitBuilder>;

    auto setup = build_standard_sha256_setup();

    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Step 1: Find subtrace start using constraint witnesses
    UltraStaticAnalyzer static_analyzer(builder);
    auto real_indices = collect_sha256_witness_real_indices(setup.constraint, builder);

    auto lookup_bounds = find_subtrace_boundaries(static_analyzer, real_indices, LOOKUP_BLOCK_IDX);
    auto arith_bounds = find_subtrace_boundaries(static_analyzer, real_indices, ARITHMETIC_BLOCK_IDX);

    ASSERT_TRUE(lookup_bounds.has_value()) << "No lookup gates found for SHA256 witnesses";
    ASSERT_TRUE(arith_bounds.has_value()) << "No arithmetic gates found for SHA256 witnesses";

    // Step 2: Build reference circuit to determine expected subtrace size
    UltraCircuitBuilder ref_builder;
    auto read_value = [&](const WitnessOrConstant<fr>& woc) -> fr {
        if (woc.is_constant) {
            return woc.value;
        }
        return builder.get_variable(builder.real_variable_index[woc.index]);
    };

    std::array<field_ct, 16> ref_inputs;
    for (size_t i = 0; i < 16; ++i) {
        if (setup.constraint.inputs[i].is_constant) {
            ref_inputs[i] = field_ct(read_value(setup.constraint.inputs[i]));
        } else {
            ref_inputs[i] = witness_ct(&ref_builder, read_value(setup.constraint.inputs[i]));
        }
    }
    std::array<field_ct, 8> ref_hash;
    for (size_t i = 0; i < 8; ++i) {
        if (setup.constraint.hash_values[i].is_constant) {
            ref_hash[i] = field_ct(read_value(setup.constraint.hash_values[i]));
        } else {
            ref_hash[i] = witness_ct(&ref_builder, read_value(setup.constraint.hash_values[i]));
        }
    }
    [[maybe_unused]] auto ref_output = bb::stdlib::SHA256<UltraCircuitBuilder>::sha256_block(ref_hash, ref_inputs);

    // Reference circuit block sizes = expected SHA256 subtrace sizes
    size_t ref_lookup_size = ref_builder.blocks.lookup.size();
    size_t ref_arith_size = ref_builder.blocks.arithmetic.size();

    // ACIR circuit total block sizes
    size_t acir_lookup_size = builder.blocks.lookup.size();
    size_t acir_arith_size = builder.blocks.arithmetic.size();

    std::cout << "=== SHA256 Gate Count Analysis ===" << std::endl;
    std::cout << "Reference circuit lookup gates: " << ref_lookup_size << std::endl;
    std::cout << "Reference circuit arithmetic gates: " << ref_arith_size << std::endl;
    std::cout << "ACIR circuit lookup gates: " << acir_lookup_size << std::endl;
    std::cout << "ACIR circuit arithmetic gates: " << acir_arith_size << std::endl;
    std::cout << "Constraint witness lookup start: " << lookup_bounds->first << std::endl;
    std::cout << "Constraint witness lookup end: " << lookup_bounds->second << std::endl;
    std::cout << "Constraint witness arithmetic start: " << arith_bounds->first << std::endl;
    std::cout << "Constraint witness arithmetic end: " << arith_bounds->second << std::endl;

    // Exact gate count regression assertions
    EXPECT_EQ(ref_lookup_size, EXPECTED_REF_LOOKUP_GATES);
    EXPECT_EQ(ref_arith_size, EXPECTED_REF_ARITH_GATES);
    EXPECT_EQ(acir_lookup_size, EXPECTED_ACIR_LOOKUP_GATES);
    EXPECT_EQ(acir_arith_size, EXPECTED_ACIR_ARITH_GATES);
}

/**
 * @brief Discovery test: compute selector hashes for SHA256 subtraces
 *
 * Computes selector hashes over the full lookup and arithmetic blocks using
 * Boost-style hash_combine. For a single SHA256 constraint, the entire block
 * belongs to that constraint.
 */
TEST_F(BoomerangSHA256ConstraintsTests, SHA256SelectorHashRegression)
{
    auto setup = build_standard_sha256_setup();

    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    EXPECT_TRUE(CircuitChecker::check(builder));

    auto& lookup_block = builder.blocks.lookup;
    auto& arith_block = builder.blocks.arithmetic;

    // Hash the full blocks (for single constraint, entire block = SHA256 subtrace)
    size_t lookup_hash = compute_selector_hash(lookup_block, 0, lookup_block.size() - 1);
    size_t arith_hash = compute_selector_hash(arith_block, 0, arith_block.size() - 1);

    std::cout << "=== SHA256 Selector Hashes ===" << std::endl;
    std::cout << "Lookup block selector hash: " << lookup_hash << " (size=" << lookup_block.size() << ")" << std::endl;
    std::cout << "Arithmetic block selector hash: " << arith_hash << " (size=" << arith_block.size() << ")"
              << std::endl;

    // Exact selector hash regression assertions
    EXPECT_EQ(lookup_hash, EXPECTED_LOOKUP_SELECTOR_HASH);
    EXPECT_EQ(arith_hash, EXPECTED_ARITH_SELECTOR_HASH);
}

/**
 * @brief Test find_sha256_subcircuit_boundaries for a single constraint
 *
 * Verifies that the boundary finder correctly identifies lookup and arithmetic
 * gate ranges using known constants (no reference circuit needed at runtime).
 */
TEST_F(BoomerangSHA256ConstraintsTests, FindSha256SubcircuitBoundaries)
{
    auto setup = build_standard_sha256_setup();

    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto static_analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));

    auto boundaries = static_analyzer.find_sha256_subcircuit_boundaries(setup.constraint);
    ASSERT_TRUE(boundaries.has_value()) << "Failed to find SHA256 subcircuit boundaries";

    EXPECT_EQ(boundaries->lookup.size(), EXPECTED_ACIR_LOOKUP_GATES);
    EXPECT_EQ(boundaries->arithmetic.size(), EXPECTED_ACIR_ARITH_GATES);

    std::cout << "=== SHA256 Subcircuit Boundaries ===" << std::endl;
    std::cout << "Lookup: [" << boundaries->lookup.first << ", " << boundaries->lookup.last << "] (size "
              << boundaries->lookup.size() << ")" << std::endl;
    std::cout << "Arithmetic: [" << boundaries->arithmetic.first << ", " << boundaries->arithmetic.last << "] (size "
              << boundaries->arithmetic.size() << ")" << std::endl;
}

/**
 * @brief Test validate_sha256_subcircuit_selectors for a single constraint
 *
 * Verifies that the selector hash validation accepts known-good SHA256 subcircuit gates.
 */
TEST_F(BoomerangSHA256ConstraintsTests, ValidateSha256SubcircuitSelectors)
{
    auto setup = build_standard_sha256_setup();

    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto static_analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));

    auto boundaries = static_analyzer.find_sha256_subcircuit_boundaries(setup.constraint);
    ASSERT_TRUE(boundaries.has_value()) << "Failed to find SHA256 subcircuit boundaries";

    EXPECT_TRUE(static_analyzer.validate_sha256_subcircuit_selectors(*boundaries));
}

/**
 * @brief Detect corruption of decompose chain selector for hash_values[3]
 *
 * SHA256 internally range-constrains certain inputs via decompose_into_default_range.
 * Corrupting a selector in the decompose chain gate is detected by both
 * the decompose chain check (step 2) and the arithmetic selector hash (step 5).
 */
TEST_F(BoomerangSHA256ConstraintsTests, DetectCorrupted_DecomposeChainSelector)
{
    auto setup = build_standard_sha256_setup();

    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Find a decompose chain gate for hash_values[3] (appears in w_4 of arithmetic block)
    UltraStaticAnalyzer static_analyzer(builder);
    uint32_t hv3_real = builder.real_variable_index[setup.constraint.hash_values[3].index];
    auto winfo = sha256_helpers::map_witness_to_gates(static_analyzer, builder, hv3_real);

    size_t corrupt_gate = 0;
    bool found = false;
    for (const auto& ref : winfo.gate_refs) {
        if (ref.block_name == "arithmetic" && ref.wire_name == "w_4") {
            auto cls = sha256_helpers::classify_arithmetic_gate(builder, ref.gate_idx);
            if (cls == sha256_helpers::GateClassification::OTHER) {
                corrupt_gate = ref.gate_idx;
                found = true;
                break;
            }
        }
    }
    ASSERT_TRUE(found) << "Could not find decompose chain gate for hash_values[3]";

    // Corrupt q_1 selector in the decompose chain gate
    builder.blocks.arithmetic.q_1().set(corrupt_gate, fr(999));

    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
}

/**
 * @brief Detect corruption of a normalization gate for result[0]
 *
 * The ACIR assert_equal flow calls field_ct::normalize() on SHA256 output,
 * creating a normalization gate in the arithmetic block. Corrupting its
 * selector is detected by the arithmetic selector hash check (step 5).
 * Note: CircuitChecker may not detect all selector corruptions (e.g., when
 * the corrupted selector introduces a vacuously true relation).
 */
TEST_F(BoomerangSHA256ConstraintsTests, DetectCorrupted_ResultNormalizeGate)
{
    auto setup = build_standard_sha256_setup();

    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Find an arithmetic gate for result[0]
    UltraStaticAnalyzer static_analyzer(builder);
    uint32_t r0_real = builder.real_variable_index[setup.constraint.result[0]];
    auto winfo = sha256_helpers::map_witness_to_gates(static_analyzer, builder, r0_real);

    size_t corrupt_gate = 0;
    bool found = false;
    for (const auto& ref : winfo.gate_refs) {
        if (ref.block_name == "arithmetic") {
            corrupt_gate = ref.gate_idx;
            found = true;
            break;
        }
    }
    ASSERT_TRUE(found) << "Could not find arithmetic gate for result[0]";

    // Corrupt q_3 selector - changes the selector hash
    builder.blocks.arithmetic.q_3().set(corrupt_gate, fr(42));

    // Note: CircuitChecker may or may not catch this depending on gate structure

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
}

/**
 * @brief Detect corruption of an ADD gate's q_arith selector
 *
 * Corrupting q_arith in an ADD gate within the SHA256 arithmetic subtrace
 * is detected by the arithmetic selector hash check (step 5).
 */
TEST_F(BoomerangSHA256ConstraintsTests, DetectCorrupted_ArithSelectorHash)
{
    auto setup = build_standard_sha256_setup();

    AcirFormat constraint_system = constraint_to_acir_format(setup.constraint);
    AcirProgram program{ constraint_system, setup.witness_values };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Find an ADD gate in the arithmetic subtrace
    auto& arith = builder.blocks.arithmetic;
    size_t corrupt_gate = 0;
    bool found = false;
    for (size_t i = 0; i < arith.size(); ++i) {
        auto cls = sha256_helpers::classify_arithmetic_gate(builder, i);
        if (cls == sha256_helpers::GateClassification::ADD) {
            corrupt_gate = i;
            found = true;
            break;
        }
    }
    ASSERT_TRUE(found) << "Could not find ADD gate in arithmetic block";

    // Corrupt q_arith selector (from 1 to 0, effectively disabling the gate)
    arith.q_arith().set(corrupt_gate, fr::zero());

    // CircuitChecker cannot detect q_arith=0 (disabled gate passes trivially)

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
}
