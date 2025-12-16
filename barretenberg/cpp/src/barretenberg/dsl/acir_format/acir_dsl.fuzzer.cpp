/**
 * @file acir_dsl.fuzzer.cpp
 * @brief VM-based fuzzer for ACIR DSL that uses FieldVM to generate witnesses and coefficients
 *
 * This fuzzer leverages the existing FieldVM infrastructure from field.fuzzer.hpp:
 * 1. Execute field arithmetic operations via FieldVM<fr>
 * 2. Use VM internal state as witnesses and coefficients
 * 3. Generate ACIR Program with AssertZero opcodes
 * 4. Serialize to bincode format
 * 5. Go through acir_to_constraint_buf pipeline
 * 6. Solve for valid witnesses and verify circuits
 *
 * VM Approach Benefits:
 * - Reuses battle-tested FieldVM implementation
 * - Structured generation of related field values
 * - Better coverage of edge cases (zero, one, negatives, etc.)
 * - More complex relationships between witnesses
 */

#include "acir_format.hpp"
#include "acir_to_constraint_buf.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/fields/field.fuzzer.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "serde/acir.hpp"
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <map>
#include <set>
#include <vector>

using namespace bb;
using namespace acir_format;

// LibFuzzer mutation function
extern "C" size_t LLVMFuzzerMutate(uint8_t* Data, size_t Size, size_t MaxSize);

namespace {

/**
 * @brief Simple PRNG for deterministic witness solving
 */
class SimpleRNG {
    uint64_t state;

  public:
    explicit SimpleRNG(uint64_t seed = 0x123456789ABCDEF0ULL)
        : state(seed)
    {}
    uint64_t next()
    {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        return state;
    }
    fr next_fr()
    {
        uint256_t val(next(), next(), next(), next());
        return fr(val);
    }
};

/**
 * @brief Convert bytes to field element
 */
fr bytes_to_fr(const std::vector<uint8_t>& bytes)
{
    if (bytes.size() != 32)
        return fr::zero();
    uint256_t result = 0;
    for (size_t i = 0; i < 32; ++i) {
        result <<= 8;
        result |= bytes[i];
    }
    return fr(result);
}

/**
 * @brief Convert field element to 32-byte big-endian representation
 */
std::vector<uint8_t> fr_to_bytes(const fr& value)
{
    std::vector<uint8_t> bytes(32, 0);
    uint256_t val = value;
    for (size_t i = 0; i < 32; ++i) {
        bytes[31 - i] = static_cast<uint8_t>(val.data[0] & 0xFF);
        val >>= 8;
    }
    return bytes;
}

/**
 * @brief Witness solver that handles ASSERT_ZERO expressions
 *
 * Takes VM-generated initial values and iteratively solves to satisfy constraints
 */
bool solve_witnesses(std::vector<Acir::Expression>& expressions,
                     uint32_t num_witnesses,
                     std::map<uint32_t, fr>& witnesses)
{
    // Initial values already set from witness VM - just solve to satisfy constraints
    (void)num_witnesses; // Reserved for future constraint validation

    // STEP 1: Identify witnesses that appear ONLY in linear constraints (not in mul_terms)
    // across ALL expressions
    std::set<uint32_t> linear_only_witnesses;
    std::map<uint32_t, bool> witness_has_nonlinear;

    for (const auto& expr : expressions) {
        // Mark all witnesses in mul_terms as non-linear
        for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
            witness_has_nonlinear[w1.value] = true;
            witness_has_nonlinear[w2.value] = true;
        }
    }

    // Collect witnesses that only appear in linear_combinations
    for (const auto& expr : expressions) {
        for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
            // Only consider if not already marked as non-linear
            if (!witness_has_nonlinear.contains(w.value)) {
                linear_only_witnesses.insert(w.value);
            }
        }
    }

    // STEP 2: Single pass through expressions
    // Solve linear-only witnesses and adjust q_c as needed
    for (auto& expr : expressions) {
        // Evaluate current value
        fr value = bytes_to_fr(expr.q_c);

        for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
            fr coeff = bytes_to_fr(coeff_bytes);
            value += coeff * witnesses[w1.value] * witnesses[w2.value];
        }

        for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
            fr coeff = bytes_to_fr(coeff_bytes);
            value += coeff * witnesses[w.value];
        }

        // If not satisfied, try to solve
        if (value != fr::zero()) {
            bool solved = false;

            // TIER 1: Try to find a linear-only witness in this expression that we can solve for
            // First pass: check which linear-only witnesses are in this expression and sum their coefficients
            std::map<uint32_t, fr> linear_witness_coeffs;
            for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
                if (linear_only_witnesses.contains(w.value)) {
                    fr coeff = bytes_to_fr(coeff_bytes);
                    linear_witness_coeffs[w.value] += coeff;
                }
            }

            // Try to solve using any linear-only witness with non-zero total coefficient
            for (const auto& [w_idx, total_coeff] : linear_witness_coeffs) {
                if (total_coeff != fr::zero()) {
                    // Calculate value excluding this witness:
                    // value = q_c + mul_terms + (coeff_of_other_witnesses * other_witnesses)
                    fr value_without_witness = bytes_to_fr(expr.q_c);
                    for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
                        fr coeff = bytes_to_fr(coeff_bytes);
                        value_without_witness += coeff * witnesses[w1.value] * witnesses[w2.value];
                    }
                    for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
                        if (w.value != w_idx) {
                            fr coeff = bytes_to_fr(coeff_bytes);
                            value_without_witness += coeff * witnesses[w.value];
                        }
                    }

                    // Solve: total_coeff * witness + value_without_witness = 0
                    // So: witness = -value_without_witness / total_coeff
                    witnesses[w_idx] = -value_without_witness / total_coeff;
                    solved = true;
                    break;
                }
            }

            // TIER 2: If no linear-only witness found, adjust q_c to force equation to zero
            if (!solved) {
                // Set q_c = -value to make: q_c + value = 0
                expr.q_c = fr_to_bytes(bytes_to_fr(expr.q_c) - value);
            }
        }

        // Erase all witnesses in this expression's linear_combinations
        // This prevents future expressions from modifying them and breaking this equation
        // We have backups (original_witnesses) so this is safe
        for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
            linear_only_witnesses.erase(w.value);
        }
        // Evaluate current value
    }

    return true;
}

/**
 * @brief Check if an expression is trivial (all coefficients are zero)
 */
bool is_trivial_expression(const Acir::Expression& expr)
{
    // Check constant term
    fr q_c = bytes_to_fr(expr.q_c);
    if (q_c != fr::zero()) {
        return false;
    }

    // Check mul terms
    for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
        fr coeff = bytes_to_fr(coeff_bytes);
        if (coeff != fr::zero()) {
            return false;
        }
    }

    // Check linear combinations
    for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
        fr coeff = bytes_to_fr(coeff_bytes);
        if (coeff != fr::zero()) {
            return false;
        }
    }

    return true; // All coefficients are zero - trivial constraint
}

/**
 * @brief Print the resulting gates/constraints from AcirFormat
 */
void print_acir_format_gates(const AcirFormat& acir_format)
{
    std::cerr << "\n=== RESULTING GATES ===" << std::endl;

    std::cerr << "\nArithmetic Triple Constraints (" << acir_format.arithmetic_triple_constraints.size()
              << " total):" << std::endl;
    for (size_t i = 0; i < acir_format.arithmetic_triple_constraints.size(); ++i) {
        const auto& gate = acir_format.arithmetic_triple_constraints[i];
        std::cerr << "\nTriple Gate " << i << ":" << std::endl;
        std::cerr << "  a=" << gate.a << ", b=" << gate.b << ", c=" << gate.c << std::endl;
        std::cerr << "  q_m=" << gate.q_m << " (mul coeff)" << std::endl;
        std::cerr << "  q_l=" << gate.q_l << " (left coeff)" << std::endl;
        std::cerr << "  q_r=" << gate.q_r << " (right coeff)" << std::endl;
        std::cerr << "  q_o=" << gate.q_o << " (output coeff)" << std::endl;
        std::cerr << "  q_c=" << gate.q_c << " (constant)" << std::endl;

        std::cerr << "  Represents: " << gate.q_m << "*w" << gate.a << "*w" << gate.b << " + " << gate.q_l << "*w"
                  << gate.a << " + " << gate.q_r << "*w" << gate.b << " + " << gate.q_o << "*w" << gate.c << " + "
                  << gate.q_c << " = 0" << std::endl;
    }

    std::cerr << "\nQuad Constraints (" << acir_format.quad_constraints.size() << " total):" << std::endl;
    for (size_t i = 0; i < acir_format.quad_constraints.size(); ++i) {
        const auto& gate = acir_format.quad_constraints[i];
        std::cerr << "\nQuad Gate " << i << ":" << std::endl;
        std::cerr << "  a=" << gate.a << ", b=" << gate.b << ", c=" << gate.c << ", d=" << gate.d << std::endl;
        std::cerr << "  mul_scaling=" << gate.mul_scaling << " (q_m)" << std::endl;
        std::cerr << "  a_scaling=" << gate.a_scaling << " (q_a)" << std::endl;
        std::cerr << "  b_scaling=" << gate.b_scaling << " (q_b)" << std::endl;
        std::cerr << "  c_scaling=" << gate.c_scaling << " (q_c)" << std::endl;
        std::cerr << "  d_scaling=" << gate.d_scaling << " (q_d)" << std::endl;
        std::cerr << "  const_scaling=" << gate.const_scaling << " (q_const)" << std::endl;

        std::cerr << "  Represents: " << gate.mul_scaling << "*w" << gate.a << "*w" << gate.b << " + " << gate.a_scaling
                  << "*w" << gate.a << " + " << gate.b_scaling << "*w" << gate.b << " + " << gate.c_scaling << "*w"
                  << gate.c << " + " << gate.d_scaling << "*w" << gate.d << " + " << gate.const_scaling << " = 0"
                  << std::endl;
    }

    std::cerr << "\nBig Quad Constraints (" << acir_format.big_quad_constraints.size() << " expressions):" << std::endl;
    for (size_t expr_idx = 0; expr_idx < acir_format.big_quad_constraints.size(); ++expr_idx) {
        const auto& gates = acir_format.big_quad_constraints[expr_idx];
        std::cerr << "\nBig Expression " << expr_idx << " (" << gates.size() << " gates):" << std::endl;
        for (size_t i = 0; i < gates.size(); ++i) {
            const auto& gate = gates[i];
            std::cerr << "  Gate " << i << ": " << gate.mul_scaling << "*w" << gate.a << "*w" << gate.b << " + "
                      << gate.a_scaling << "*w" << gate.a << " + " << gate.b_scaling << "*w" << gate.b << " + "
                      << gate.c_scaling << "*w" << gate.c << " + " << gate.d_scaling << "*w" << gate.d << " + "
                      << gate.const_scaling << " = 0" << std::endl;
        }
    }

    std::cerr << "=== END GATES ===" << std::endl << std::endl;
}

/**
 * @brief Print detailed information about expressions and witnesses
 */
void print_expressions_and_witnesses(const std::vector<Acir::Expression>& expressions,
                                     const std::map<uint32_t, fr>& witnesses)
{
    std::cerr << "\n=== EXPRESSION AND WITNESS DUMP ===" << std::endl;

    // Print witnesses
    std::cerr << "\nWitnesses (" << witnesses.size() << " total):" << std::endl;
    for (const auto& [idx, value] : witnesses) {
        std::cerr << "  w" << idx << " = " << value << std::endl;
    }

    // Print expressions
    std::cerr << "\nExpressions (" << expressions.size() << " total):" << std::endl;
    for (size_t i = 0; i < expressions.size(); ++i) {
        const auto& expr = expressions[i];
        std::cerr << "\nExpression " << i << ":" << std::endl;

        // Constant term
        fr q_c = bytes_to_fr(expr.q_c);
        std::cerr << "  Constant: " << q_c << std::endl;

        // Multiplication terms
        if (!expr.mul_terms.empty()) {
            std::cerr << "  Mul terms:" << std::endl;
            for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
                fr coeff = bytes_to_fr(coeff_bytes);
                std::cerr << "    " << coeff << " * w" << w1.value << " * w" << w2.value << std::endl;
            }
        }

        // Linear combinations
        if (!expr.linear_combinations.empty()) {
            std::cerr << "  Linear terms:" << std::endl;
            for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
                fr coeff = bytes_to_fr(coeff_bytes);
                std::cerr << "    " << coeff << " * w" << w.value << std::endl;
            }
        }

        // Evaluate expression
        fr value = q_c;
        for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
            fr coeff = bytes_to_fr(coeff_bytes);
            auto it1 = witnesses.find(w1.value);
            auto it2 = witnesses.find(w2.value);
            if (it1 != witnesses.end() && it2 != witnesses.end()) {
                value += coeff * it1->second * it2->second;
            }
        }
        for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
            fr coeff = bytes_to_fr(coeff_bytes);
            auto it = witnesses.find(w.value);
            if (it != witnesses.end()) {
                value += coeff * it->second;
            }
        }

        std::cerr << "  Evaluates to: " << value;
        if (value == fr::zero()) {
            std::cerr << " ✓ SATISFIED";
        } else {
            std::cerr << " ✗ NOT SATISFIED";
        }
        std::cerr << std::endl;
    }

    std::cerr << "=== END DUMP ===" << std::endl << std::endl;
}

/**
 * @brief Validate that witnesses actually satisfy the expressions
 *
 * @return true if all constraints are satisfied, false otherwise
 */
bool validate_witnesses(const std::vector<Acir::Expression>& expressions,
                        const std::map<uint32_t, fr>& witnesses,
                        bool expect_satisfied = true)
{
    (void)expect_satisfied; // Unused - kept for API compatibility
    size_t unsatisfied_count = 0;

    for (size_t i = 0; i < expressions.size(); ++i) {
        const auto& expr = expressions[i];

        // Evaluate expression
        fr value = bytes_to_fr(expr.q_c);

        for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
            fr coeff = bytes_to_fr(coeff_bytes);
            auto it1 = witnesses.find(w1.value);
            auto it2 = witnesses.find(w2.value);
            if (it1 != witnesses.end() && it2 != witnesses.end()) {
                value += coeff * it1->second * it2->second;
            }
        }

        for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
            fr coeff = bytes_to_fr(coeff_bytes);
            auto it = witnesses.find(w.value);
            if (it != witnesses.end()) {
                value += coeff * it->second;
            }
        }

        // Check if satisfied (should be zero for ASSERT_ZERO)
        if (value != fr::zero()) {
            unsatisfied_count++;
            // Silent - don't print warnings during fuzzing
        }
    }

    // Silent validation - only return true/false
    return unsatisfied_count == 0;
}

/**
 * @brief Test circuit through full ACIR pipeline using two FieldVMs
 *
 * Uses two separate VMs:
 * - coeff_vm: generates coefficients for expressions
 * - witness_vm: generates initial witness values
 */
bool test_acir_circuit(const uint8_t* data, size_t size)
{
    if (size < 31)
        return false;

    // SECURITY FUZZING: With 10% probability, disable sanitization to test raw data handling
    // DISABLED BY DEFAULT - To enable, define ENABLE_UNSANITIZED_FUZZING at compile time
    // This feature intentionally generates invalid data to test robustness against malformed input
    bool disable_sanitization = false;
#ifdef ENABLE_UNSANITIZED_FUZZING
    if (size > 0) {
        disable_sanitization = (data[0] % 10) == 0; // 10% probability
    }
#endif

    // Parse header with scaling based on input size
    // Small inputs (~64 bytes): 2-11 witnesses, 1-3 expressions
    // Medium inputs (~500 bytes): 2-50 witnesses, 1-10 expressions
    // Large inputs (~4KB): 2-100 witnesses, 1-20 expressions

    // Calculate scale factor based on input size
    // Scale grows logarithmically: log2(size / 64)
    uint32_t scale_factor = 1;
    if (size >= 128) {
        scale_factor = 1;
        size_t temp_size = size / 64;
        while (temp_size > 1 && scale_factor < 10) {
            temp_size /= 2;
            scale_factor++;
        }
    }

    uint32_t max_witnesses = std::min(10u * scale_factor, 100u);
    uint32_t max_expressions = std::min(3u * scale_factor, 20u);
    uint32_t max_vm_steps = std::min(10u * scale_factor, 50u);

    uint32_t num_witnesses = (data[0] % max_witnesses) + 2;     // 2 to max_witnesses+1
    uint32_t num_expressions = (data[1] % max_expressions) + 1; // 1 to max_expressions
    size_t coeff_vm_steps = (data[2] % max_vm_steps) + 3;       // 3 to max_vm_steps+2
    size_t witness_vm_steps = (data[3] % max_vm_steps) + 3;     // 3 to max_vm_steps+2
    uint8_t range_constraint_byte = data[4];                    // Controls range constraint generation

    const uint8_t* vm_data = data + 5;
    size_t vm_data_size = size - 5;

    // VM 1: Generate coefficients
    FieldVM<fr> coeff_vm(false, coeff_vm_steps);
    size_t coeff_consumed = coeff_vm.run(vm_data, vm_data_size, false);
    const auto& coeff_state = coeff_vm.field_internal_state;

    // VM 2: Generate initial witness values
    const uint8_t* witness_vm_data = vm_data + coeff_consumed;
    size_t witness_vm_data_size = (coeff_consumed < vm_data_size) ? (vm_data_size - coeff_consumed) : 0;

    if (witness_vm_data_size < 10)
        return false;

    FieldVM<fr> witness_vm(false, witness_vm_steps);
    size_t witness_consumed = witness_vm.run(witness_vm_data, witness_vm_data_size, false);
    const auto& witness_state = witness_vm.field_internal_state;

    // Move past both VM data sections
    const uint8_t* ptr = witness_vm_data + witness_consumed;
    size_t remaining = (witness_consumed < witness_vm_data_size) ? (witness_vm_data_size - witness_consumed) : 0;

    if (remaining < 10)
        return false;

    // Build expressions using VM state
    std::vector<Acir::Expression> expressions;
    for (uint32_t e = 0; e < num_expressions && remaining > 2; ++e) {
        Acir::Expression expr;

        // Number of terms (scales with input size via scale_factor)
        // Small inputs: 0-1 mul, 1-3 linear
        // Large inputs: 0-5 mul, 1-10 linear
        uint8_t max_mul_terms = static_cast<uint8_t>(std::min(1u + scale_factor / 2, 5u));
        uint8_t max_lin_terms = static_cast<uint8_t>(std::min(3u + scale_factor, 10u));

        uint8_t num_mul = (ptr[0] % std::max(max_mul_terms, static_cast<uint8_t>(1))); // Avoid modulo 0
        uint8_t num_lin = 1 + (ptr[1] % std::max(max_lin_terms, static_cast<uint8_t>(1)));
        ptr += 2;
        remaining -= 2;

        // Add mul terms using VM state for coefficients
        for (uint8_t m = 0; m < num_mul && remaining >= 3; ++m) {
            uint8_t coeff_reg = ptr[0] % INTERNAL_STATE_SIZE;
            uint32_t w1_idx =
                disable_sanitization ? *reinterpret_cast<const uint16_t*>(ptr + 1) : ptr[1] % num_witnesses;
            uint32_t w2_idx =
                disable_sanitization ? *reinterpret_cast<const uint16_t*>(ptr + 1) : ptr[2] % num_witnesses;
            ptr += 3;
            remaining -= 3;

            std::vector<uint8_t> coeff = fr_to_bytes(coeff_state[coeff_reg]);
            Acir::Witness w1, w2;
            w1.value = w1_idx;
            w2.value = w2_idx;
            expr.mul_terms.push_back(std::make_tuple(coeff, w1, w2));
        }

        // Add linear terms - sometimes duplicate witnesses
        bool force_duplicate = (num_lin > 1) && (remaining > 0) && ((ptr[0] % 3) == 0);
        uint32_t prev_witness = 0;

        for (uint8_t l = 0; l < num_lin && remaining >= 2; ++l) {
            uint8_t coeff_reg = ptr[0] % INTERNAL_STATE_SIZE;
            uint32_t w_idx = disable_sanitization ? ptr[1] : ptr[1] % num_witnesses;
            ptr += 2;
            remaining -= 2;

            // Force duplicate witness to test coefficient accumulation bug
            if (force_duplicate && l > 0 && l < 3) {
                w_idx = prev_witness;
            }
            prev_witness = w_idx;

            std::vector<uint8_t> coeff = fr_to_bytes(coeff_state[coeff_reg]);
            Acir::Witness w;
            w.value = w_idx;
            expr.linear_combinations.push_back(std::make_tuple(coeff, w));
        }

        // Constant term from coefficient VM
        if (remaining > 0) {
            uint8_t const_reg = ptr[0] % INTERNAL_STATE_SIZE;
            ptr++;
            remaining--;
            expr.q_c = fr_to_bytes(coeff_state[const_reg]);
        } else {
            expr.q_c = std::vector<uint8_t>(32, 0);
        }

        expressions.push_back(expr);
    }

    if (expressions.empty())
        return false;

    // Filter out trivial expressions (all zero coefficients)
    std::vector<Acir::Expression> non_trivial_expressions;
    for (const auto& expr : expressions) {
        if (!is_trivial_expression(expr)) {
            non_trivial_expressions.push_back(expr);
        }
    }

    // Skip if no non-trivial constraints remain
    if (non_trivial_expressions.empty()) {
        return false;
    }

    // Use only non-trivial expressions
    expressions = non_trivial_expressions;

    // Initialize witnesses with VM-generated values (much better than random!)
    std::map<uint32_t, fr> solved_witnesses;
    for (uint32_t i = 0; i < num_witnesses; ++i) {
        // Use witness VM state as initial values, cycling through if needed
        solved_witnesses[i] = witness_state[i % INTERNAL_STATE_SIZE];
    }

    // Now solve to satisfy constraints, using VM values as starting point
    solve_witnesses(expressions, num_witnesses, solved_witnesses);

    // Validate that solver satisfied the constraints
    // bool witnesses_valid = validate_witnesses(expressions, solved_witnesses, true);
    // if (!witnesses_valid) {
    //     abort();
    //     // The solver couldn't satisfy all constraints - skip this test case
    //     return false;
    // }

    // Deterministic witness corruption for soundness testing
    bool witnesses_corrupted = false;
    std::vector<uint32_t> corrupted_witness_indices;
    // Save original witnesses before corruption for meaningful-use checking
    std::map<uint32_t, fr> original_witnesses = solved_witnesses;

    if (size > 4 && (data[size - 1] % 5) == 0) {
        witnesses_corrupted = true;
        uint32_t num_to_corrupt = 1 + (data[size - 2] % 3);
        bool actually_corrupted = false;
        std::set<uint32_t> already_corrupted; // Track which witnesses we've already corrupted
        for (uint32_t i = 0; i < num_to_corrupt && i < num_witnesses; ++i) {
            size_t byte_idx = size - 3 - i;
            if (byte_idx >= 4) { // Adjusted for 4-byte header
                uint32_t witness_to_corrupt = disable_sanitization ? data[byte_idx] : data[byte_idx] % num_witnesses;

                // Skip if we've already corrupted this witness
                if (already_corrupted.count(witness_to_corrupt) > 0) {
                    continue;
                }
                already_corrupted.insert(witness_to_corrupt);

                fr original_value = solved_witnesses[witness_to_corrupt];
                // Use different part of coefficient VM state for corruption
                // Add 1 to ensure we get a different value (especially important if original was 0)
                size_t state_idx = (data[byte_idx] + INTERNAL_STATE_SIZE / 2) % INTERNAL_STATE_SIZE;
                fr corruption_value = coeff_state[state_idx];
                // If corruption value is same as original, add 1 to make it different
                if (corruption_value == original_value) {
                    corruption_value += fr::one();
                }

                // Double-check that corruption actually changed the value
                if (corruption_value == original_value) {
                    // Still the same after adding 1? Try subtracting 1 instead
                    corruption_value = original_value - fr::one();
                }

                // Only corrupt if we actually have a different value
                if (corruption_value != original_value) {
                    solved_witnesses[witness_to_corrupt] = corruption_value;
                    corrupted_witness_indices.push_back(witness_to_corrupt);
                    actually_corrupted = true;
                }
                // else: Skip this witness - couldn't find a different value
            }
        }

        // Only check if we actually corrupted something
        if (actually_corrupted) {
            // DYNAMIC CHECK: Directly evaluate expressions with corrupted witnesses
            // This eliminates false positives from:
            // - Algebraic cancellations (terms that cancel out)
            // - Quadratics with multiple solutions
            // - Under-constrained circuits
            bool corrupted_witnesses_satisfy_constraints = validate_witnesses(expressions, solved_witnesses, false);

            if (corrupted_witnesses_satisfy_constraints) {
                // The corrupted witnesses STILL satisfy the expressions!
                // This means the circuit is under-constrained (expected for random fuzzing)
                // This is NOT a soundness bug - skip the CircuitChecker test
                // IMPORTANT: Restore original witnesses since we're not testing soundness
                solved_witnesses = original_witnesses;
                witnesses_corrupted = false;
            } else {
                // Corrupted witnesses DON'T satisfy expressions - this is what we want to test!
                // However, we need to check for assert_equal optimization cases.
                // The assert_equal optimization (for patterns like w1 - w2 = 0) causes the
                // circuit builder to unify w1 and w2 into a single variable. If a corrupted
                // witness is ONLY used in such assert_equal patterns (and has no other
                // constraints), then the unification makes the corruption ineffective.

                // Detect assert_equal patterns: 2 linear terms, coefficients are negatives, no mul terms, no constant
                std::set<uint32_t> assert_equal_only_witnesses;
                std::set<uint32_t> constrained_in_other_expressions;

                for (const auto& expr : expressions) {
                    bool is_assert_equal_pattern = expr.mul_terms.empty() && expr.linear_combinations.size() == 2 &&
                                                   bytes_to_fr(expr.q_c) == fr::zero();

                    if (is_assert_equal_pattern) {
                        fr coeff1 = bytes_to_fr(std::get<0>(expr.linear_combinations[0]));
                        fr coeff2 = bytes_to_fr(std::get<0>(expr.linear_combinations[1]));
                        if (coeff1 == -coeff2 && coeff1 != fr::zero()) {
                            // This is an assert_equal pattern (w1 - w2 = 0)
                            uint32_t w1 = std::get<1>(expr.linear_combinations[0]).value;
                            uint32_t w2 = std::get<1>(expr.linear_combinations[1]).value;
                            assert_equal_only_witnesses.insert(w1);
                            assert_equal_only_witnesses.insert(w2);
                        }
                    } else {
                        // Not an assert_equal pattern - track witnesses used here
                        for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
                            constrained_in_other_expressions.insert(w1.value);
                            constrained_in_other_expressions.insert(w2.value);
                        }
                        for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
                            constrained_in_other_expressions.insert(w.value);
                        }
                    }
                }

                // Remove witnesses that appear in non-assert_equal expressions
                for (uint32_t w : constrained_in_other_expressions) {
                    assert_equal_only_witnesses.erase(w);
                }

                // Check if ALL corrupted witnesses are only in assert_equal patterns
                bool all_corrupted_are_assert_equal_only = true;
                for (uint32_t w : corrupted_witness_indices) {
                    if (assert_equal_only_witnesses.count(w) == 0) {
                        all_corrupted_are_assert_equal_only = false;
                        break;
                    }
                }

                if (all_corrupted_are_assert_equal_only && !assert_equal_only_witnesses.empty()) {
                    // All corrupted witnesses are only used in assert_equal patterns
                    // The circuit builder will unify these, making corruption ineffective
                    // Skip the soundness check for this case
                    // IMPORTANT: Restore original witnesses since we're not testing soundness
                    solved_witnesses = original_witnesses;
                    witnesses_corrupted = false;
                }
            }
            // else: Corrupted witnesses DON'T satisfy expressions AND are properly constrained
            // This is the expected case for soundness testing - proceed with CircuitChecker
        } else {
            // Didn't actually corrupt anything, skip soundness check
            witnesses_corrupted = false;
        }
    }

    // ========== RANGE CONSTRAINT GENERATION ==========
    // Generate range constraints for witnesses
    // Uses range_constraint_byte to control which witnesses get constraints and what bit widths
    std::vector<std::pair<uint32_t, uint32_t>> range_constraints; // (witness_idx, num_bits)
    std::map<uint32_t, uint32_t> minimal_range;                   // Track minimal range for each witness
    bool should_violate_range = false;
    uint32_t violated_witness_idx = 0;
    uint32_t violated_range_bits = 0;

    // Helper to check if a witness value satisfies a range constraint
    auto satisfies_range = [](const fr& value, uint32_t num_bits) -> bool {
        if (num_bits >= 254) {
            // For 254+ bits, any field element is within range (BN254 field is ~254 bits)
            return true;
        }
        // Convert field element to uint256_t
        uint256_t value_int = value;

        // Special case: 0-bit range means only value 0 is valid
        if (num_bits == 0) {
            return value_int == 0;
        }

        // Check if MSB position < num_bits (i.e., value < 2^num_bits)
        size_t msb = value_int.get_msb();
        return msb < num_bits;
    };

    // Decide if we should generate any range constraints (50% chance)
    if ((range_constraint_byte & 0x80) != 0 && num_witnesses > 1) {
        // Number of range constraints to add (1-4)
        uint32_t num_range_constraints = ((range_constraint_byte >> 5) & 0x3) + 1;
        num_range_constraints = std::min(num_range_constraints, num_witnesses - 1);

        // Add range constraints for random witnesses
        // Allow multiple constraints per witness to test the minimal_range optimization
        for (uint32_t i = 0; i < num_range_constraints; ++i) {
            uint32_t witness_idx =
                disable_sanitization ? range_constraint_byte + i : (range_constraint_byte + i) % num_witnesses;

            // Determine bit width based on fuzzer input
            // Mix of common bit widths and edge cases (capped at 254 bits for BN254 field)
            uint8_t bit_selector = (range_constraint_byte + i * 37) & 0x1F;
            uint32_t num_bits = 0;

            if (bit_selector < 8) {
                num_bits = 8; // Common: u8
            } else if (bit_selector < 14) {
                num_bits = 16; // Common: u16
            } else if (bit_selector < 18) {
                num_bits = 32; // Common: u32
            } else if (bit_selector < 21) {
                num_bits = 64; // Common: u64
            } else if (bit_selector < 24) {
                num_bits = 128; // Common: u128
            } else if (bit_selector < 28) {
                num_bits = 254; // Max valid for BN254 (all field elements satisfy this)
            } else if (bit_selector < 30) {
                num_bits = 1; // Edge case: boolean
            } else {
                num_bits = 0; // Edge case: must be zero
            }

            range_constraints.push_back({ witness_idx, num_bits });

            // Track minimal range for each witness
            auto it = minimal_range.find(witness_idx);
            if (it == minimal_range.end() || num_bits < it->second) {
                minimal_range[witness_idx] = num_bits;
            }
        }

        // Check if any existing witnesses violate their MINIMAL range constraints
        // This tests that witnesses satisfy the tightest constraint
        bool has_accidental_violation = false;
        for (const auto& [witness_idx, min_bits] : minimal_range) {
            auto it = solved_witnesses.find(witness_idx);
            if (it != solved_witnesses.end()) {
                if (!satisfies_range(it->second, min_bits)) {
                    has_accidental_violation = true;
                    break;
                }
            }
        }

        // Decide if we should intentionally violate a range constraint (30% chance)
        // But only if we don't already have an accidental violation
        if (!has_accidental_violation && (range_constraint_byte & 0x10) != 0 && !minimal_range.empty()) {
            // Pick a witness with range constraints to violate
            // Use the MINIMAL range for that witness
            size_t violate_idx = range_constraint_byte % minimal_range.size();
            auto it = minimal_range.begin();
            std::advance(it, violate_idx);
            uint32_t candidate_witness = it->first;
            uint32_t candidate_bits = it->second;

            // Only attempt violation for range constraints < 254 bits
            // For >= 254 bits, every field element is in range, so violation is impossible
            if (candidate_bits < 254) {
                should_violate_range = true;
                violated_witness_idx = candidate_witness;
                violated_range_bits = candidate_bits;

                // Set witness to exceed the MINIMAL range: 2^num_bits (just outside the range)
                fr violation_value = fr(1);
                for (uint32_t b = 0; b < violated_range_bits; ++b) {
                    violation_value = violation_value + violation_value;
                }
                solved_witnesses[violated_witness_idx] = violation_value;
            }
            // For num_bits >= 254, skip violation testing since all field elements are in range
        } else if (has_accidental_violation) {
            // We have an accidental range violation from the witness generation
            // Treat this as an intentional soundness test
            // Find which witness is violating its MINIMAL range (and only test if < 254 bits)
            for (const auto& [witness_idx, min_bits] : minimal_range) {
                auto it = solved_witnesses.find(witness_idx);
                if (it != solved_witnesses.end() && min_bits < 254) {
                    if (!satisfies_range(it->second, min_bits)) {
                        should_violate_range = true;
                        violated_witness_idx = witness_idx;
                        violated_range_bits = min_bits;
                        break;
                    }
                }
            }
        }
    }

    try {
        // Create ACIR Circuit
        Acir::Circuit circuit;
        circuit.function_name = "main";
        circuit.current_witness_index = num_witnesses - 1;
        circuit.private_parameters = {};
        circuit.public_parameters.value = {};
        circuit.return_values.value = {};
        circuit.assert_messages = {};

        // Add AssertZero opcodes
        for (const auto& expr : expressions) {
            Acir::Opcode::AssertZero assert_zero;
            assert_zero.value = expr;

            Acir::Opcode opcode;
            opcode.value = assert_zero;
            circuit.opcodes.push_back(opcode);
        }

        // Add Range constraint opcodes
        for (const auto& [witness_idx, num_bits] : range_constraints) {
            // Create FunctionInput for the witness
            Acir::FunctionInput::Witness witness_input;
            witness_input.value = Acir::Witness{ witness_idx };

            Acir::FunctionInput input;
            input.value = witness_input;

            // Create RANGE BlackBoxFuncCall
            Acir::BlackBoxFuncCall::RANGE range_op;
            range_op.input = input;
            range_op.num_bits = num_bits;

            // Wrap in BlackBoxFuncCall
            Acir::BlackBoxFuncCall bb_call;
            bb_call.value = range_op;

            // Wrap in Opcode
            Acir::Opcode::BlackBoxFuncCall bb_opcode;
            bb_opcode.value = bb_call;

            Acir::Opcode opcode;
            opcode.value = bb_opcode;
            circuit.opcodes.push_back(opcode);
        }

        // *** Go through acir_to_constraint_buf pipeline directly ***
        // This exercises the core conversion logic without serialization issues
        AcirFormat acir_format = circuit_serde_to_acir_format(circuit);

        // ========== TEST MANUAL CONSTRUCTION PATH ==========
        // Randomly corrupt minimal_range to test the buggy code path where
        // range constraints are silently dropped if minimal_range is not populated.
        // This simulates manually constructed AcirFormat (like in tests).
        bool corrupted_minimal_range = false;
        std::map<uint32_t, uint32_t> original_minimal_range;

        if (!range_constraints.empty() && (range_constraint_byte & 0x01) != 0) {
            // Save original minimal_range
            original_minimal_range = acir_format.minimal_range;

            // Randomly choose corruption strategy
            uint8_t corruption_type = (range_constraint_byte >> 1) & 0x3;

            if (corruption_type == 0 && !acir_format.minimal_range.empty()) {
                // Clear entire minimal_range (simulates fully manual construction)
                acir_format.minimal_range.clear();
                corrupted_minimal_range = true;
            } else if (corruption_type == 1 && !acir_format.minimal_range.empty()) {
                // Remove random witness from minimal_range
                auto it = acir_format.minimal_range.begin();
                std::advance(it, range_constraint_byte % acir_format.minimal_range.size());
                acir_format.minimal_range.erase(it);
                corrupted_minimal_range = true;
            } else if (corruption_type == 2 && acir_format.minimal_range.size() > 1) {
                // Remove half of minimal_range entries
                std::vector<uint32_t> to_remove;
                size_t count = 0;
                for (const auto& [witness, bits] : acir_format.minimal_range) {
                    if ((count++ % 2) == 0) {
                        to_remove.push_back(witness);
                    }
                }
                for (uint32_t w : to_remove) {
                    acir_format.minimal_range.erase(w);
                }
                corrupted_minimal_range = !to_remove.empty();
            }
            // corruption_type == 3: Don't corrupt (normal path)

            // If we corrupted minimal_range, force a witness to violate its dropped constraint
            if (corrupted_minimal_range) {
                for (const auto& [witness_idx, min_bits] : original_minimal_range) {
                    // Find a witness that was removed from minimal_range
                    if (!acir_format.minimal_range.contains(witness_idx) && min_bits < 254) {
                        // Set this witness to violate its range (2^num_bits)
                        fr violation_value = fr(1);
                        for (uint32_t b = 0; b < min_bits; ++b) {
                            violation_value = violation_value + violation_value;
                        }
                        solved_witnesses[witness_idx] = violation_value;
                        break; // Only violate one witness
                    }
                }
            }
        }

        // Create witness vector
        WitnessVector witness_vec;
        witness_vec.reserve(num_witnesses);
        for (uint32_t i = 0; i < num_witnesses; ++i) {
            auto it = solved_witnesses.find(i);
            if (it != solved_witnesses.end()) {
                witness_vec.push_back(it->second);
            } else {
                witness_vec.push_back(fr::zero());
            }
        }

        // Build circuit using the proper constructor that initializes witnesses
        // NOTE: Must use the witness-aware constructor, not default constructor!
        // The default constructor leaves witnesses uninitialized, causing false negatives.
        UltraCircuitBuilder builder{ /*size_hint*/ 0, witness_vec, acir_format.public_inputs, acir_format.varnum };

        AcirProgram acir_program = { acir_format, witness_vec };
        build_constraints(builder, acir_program, ProgramMetadata{});

        // Check if the builder is in a failed state (e.g., from assert_equal with unequal values)
        if (builder.failed()) {
#ifndef FUZZING_DISABLE_WARNINGS
            info("Circuit builder is in a failed state: ", builder.err());
#endif
            return false;
        }

        bool circuit_valid = CircuitChecker::check(builder);

        // SOUNDNESS CHECK: Corrupted minimal_range (range constraints silently dropped)
        if (corrupted_minimal_range && circuit_valid) {
            // Check if any witness violates a range constraint that was dropped
            for (const auto& [witness_idx, min_bits] : original_minimal_range) {
                // Was this witness removed from minimal_range?
                if (!acir_format.minimal_range.contains(witness_idx)) {
                    // Check if witness violates its intended range
                    auto it = solved_witnesses.find(witness_idx);
                    if (it != solved_witnesses.end()) {
                        if (!satisfies_range(it->second, min_bits)) {
                            // Witness violates dropped constraint and circuit passed!
                            std::cerr << "\n=== CRITICAL SOUNDNESS BUG: RANGE CONSTRAINT SILENTLY DROPPED ==="
                                      << std::endl;
                            std::cerr << "Witness w" << witness_idx << " should be constrained to " << min_bits
                                      << " bits but constraint was dropped!" << std::endl;
                            std::cerr << "Witness value: " << it->second << std::endl;
                            std::cerr << "Circuit passed verification despite violated range constraint!" << std::endl;
                            std::cerr << "This happens when minimal_range is not populated (manual construction)."
                                      << std::endl;
                            std::cerr << "\nNum witnesses: " << num_witnesses
                                      << ", Num expressions: " << expressions.size()
                                      << ", Num range constraints: " << range_constraints.size() << std::endl;
                            print_expressions_and_witnesses(expressions, solved_witnesses);
                            print_acir_format_gates(acir_format);
                            abort();
                        }
                    }
                }
            }
        }

        // SOUNDNESS CHECK: Corrupted witnesses or range violations should fail
        if (witnesses_corrupted || should_violate_range) {
            if (circuit_valid) {
                std::cerr << "\n=== CRITICAL SOUNDNESS BUG ===" << std::endl;
                if (witnesses_corrupted) {
                    std::cerr << "Corrupted witnesses passed CircuitChecker verification!" << std::endl;
                }
                if (should_violate_range) {
                    std::cerr << "Range constraint violation passed CircuitChecker verification!" << std::endl;
                    std::cerr << "Violated witness: w" << violated_witness_idx << " (range: " << violated_range_bits
                              << " bits)" << std::endl;
                    std::cerr << "Witness value: " << solved_witnesses[violated_witness_idx] << std::endl;
                }
                std::cerr << "Num witnesses: " << num_witnesses << ", Num expressions: " << expressions.size()
                          << std::endl;
                print_expressions_and_witnesses(expressions, solved_witnesses);
                print_acir_format_gates(acir_format);
                abort();
            }
            return false;
        }

        // COMPLETENESS CHECK
        // Skip this check if we corrupted minimal_range, since we intentionally violated constraints
        if (!circuit_valid && !corrupted_minimal_range) {
            std::cerr << "\n=== COMPLETENESS BUG ===" << std::endl;
            std::cerr << "Valid witnesses failed CircuitChecker verification!" << std::endl;
            std::cerr << "Num witnesses: " << num_witnesses << ", Num expressions: " << expressions.size() << std::endl;
            print_expressions_and_witnesses(expressions, solved_witnesses);
            print_acir_format_gates(acir_format);
            abort();
        }

        return circuit_valid;

    } catch (const std::exception& e) {
        // Silent - exceptions are expected for edge cases and corrupted witnesses
        // If there's a real bug, it will show up in the coverage/crash reports
        (void)e; // Avoid unused variable warning
        return false;
    } catch (...) {
        // Silent - just skip this test case
        return false;
    }
}

} // anonymous namespace

/**
 * @brief LibFuzzer entry point
 */
extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    if (size < 50) {
        return 0;
    }

    test_acir_circuit(data, size);

    return 0;
}

/**
 * @brief Custom mutator for structure-aware mutations with size scaling
 */
extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* data, size_t size, size_t max_size, unsigned int seed)
{
    if (size < 10 || max_size < 50) {
        return LLVMFuzzerMutate(data, size, max_size);
    }

    std::srand(seed);
    int strategy = static_cast<int>(static_cast<unsigned>(std::rand()) % 100u);

    if (strategy < 30) {
        // Mutate VM instructions (scales with input size)
        if (size > 10) {
            size_t vm_section_start = 4;
            size_t vm_section_end = size / 2; // First half is VM data
            if (vm_section_end > vm_section_start) {
                size_t pos = vm_section_start + (static_cast<unsigned>(std::rand()) %
                                                 static_cast<unsigned>(vm_section_end - vm_section_start));
                data[pos] = static_cast<uint8_t>(static_cast<unsigned>(std::rand()) % 256u);
            }
        }
    } else if (strategy < 55) {
        // Mutate expression structure (second half of input)
        if (size > 20) {
            size_t expr_section_start = size / 2;
            size_t expr_section_end = size - 10;
            if (expr_section_end > expr_section_start) {
                size_t pos = expr_section_start + (static_cast<unsigned>(std::rand()) %
                                                   static_cast<unsigned>(expr_section_end - expr_section_start));
                data[pos] = static_cast<uint8_t>(static_cast<unsigned>(std::rand()) % 256u);
            }
        }
    } else if (strategy < 70) {
        // Mutate header (controls scaling)
        if (size > 3) {
            data[static_cast<unsigned>(std::rand()) % 4u] =
                static_cast<uint8_t>(static_cast<unsigned>(std::rand()) % 256u);
        }
    } else if (strategy < 80) {
        // Grow input size (add more data for larger test cases)
        if (size < max_size && max_size - size >= 32) {
            size_t grow_by = std::min(static_cast<size_t>(32), max_size - size);
            // Shift existing data and insert new bytes
            for (size_t i = 0; i < grow_by; ++i) {
                data[size + i] = static_cast<uint8_t>(static_cast<unsigned>(std::rand()) % 256u);
            }
            return size + grow_by;
        }
    } else if (strategy < 85) {
        // Shrink input size (remove redundant data)
        if (size > 100) {
            size_t shrink_by = std::min(static_cast<size_t>(32), size - 50);
            return size - shrink_by;
        }
    } else {
        // Use LibFuzzer's built-in mutation
        return LLVMFuzzerMutate(data, size, max_size);
    }

    return size;
}
