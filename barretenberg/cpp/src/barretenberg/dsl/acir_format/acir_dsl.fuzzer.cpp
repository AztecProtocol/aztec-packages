/**
 * @file acir_dsl.fuzzer.cpp
 * @brief VM-based fuzzer for ACIR DSL that uses FieldVM to generate witnesses and coefficients
 *
 * This fuzzer leverages the existing FieldVM infrastructure from field.fuzzer.hpp:
 * 1. Execute field arithmetic operations via FieldVM<fr>
 * 2. Use VM internal state as witnesses and coefficients
 * 3. Generate ACIR Program with multiple opcode types:
 *    - AssertZero (arithmetic constraints)
 *    - Range constraints
 *    - Logic constraints (AND/XOR)
 * 4. Go through acir_to_constraint_buf pipeline
 * 5. Solve for valid witnesses and verify circuits
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
        fr value = fr::serialize_from_buffer(&expr.q_c[0]);

        for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
            fr coeff = fr::serialize_from_buffer(&coeff_bytes[0]);
            value += coeff * witnesses[w1.value] * witnesses[w2.value];
        }

        for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
            fr coeff = fr::serialize_from_buffer(&coeff_bytes[0]);
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
                    fr coeff = fr::serialize_from_buffer(&coeff_bytes[0]);
                    linear_witness_coeffs[w.value] += coeff;
                }
            }

            // Try to solve using any linear-only witness with non-zero total coefficient
            for (const auto& [w_idx, total_coeff] : linear_witness_coeffs) {
                if (total_coeff != fr::zero()) {
                    // Calculate value excluding this witness:
                    // value = q_c + mul_terms + (coeff_of_other_witnesses * other_witnesses)
                    fr value_without_witness = fr::serialize_from_buffer(&expr.q_c[0]);
                    for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
                        fr coeff = fr::serialize_from_buffer(&coeff_bytes[0]);
                        value_without_witness += coeff * witnesses[w1.value] * witnesses[w2.value];
                    }
                    for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
                        if (w.value != w_idx) {
                            fr coeff = fr::serialize_from_buffer(&coeff_bytes[0]);
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
                expr.q_c = (fr::serialize_from_buffer(&expr.q_c[0]) - value).to_buffer();
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
    fr q_c = fr::serialize_from_buffer(&expr.q_c[0]);
    if (q_c != fr::zero()) {
        return false;
    }

    // Check mul terms
    for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
        fr coeff = fr::serialize_from_buffer(&coeff_bytes[0]);
        if (coeff != fr::zero()) {
            return false;
        }
    }

    // Check linear combinations
    for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
        fr coeff = fr::serialize_from_buffer(&coeff_bytes[0]);
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
        fr q_c = fr::serialize_from_buffer(&expr.q_c[0]);
        std::cerr << "  Constant: " << q_c << std::endl;

        // Multiplication terms
        if (!expr.mul_terms.empty()) {
            std::cerr << "  Mul terms:" << std::endl;
            for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
                fr coeff = fr::serialize_from_buffer(&coeff_bytes[0]);
                std::cerr << "    " << coeff << " * w" << w1.value << " * w" << w2.value << std::endl;
            }
        }

        // Linear combinations
        if (!expr.linear_combinations.empty()) {
            std::cerr << "  Linear terms:" << std::endl;
            for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
                fr coeff = fr::serialize_from_buffer(&coeff_bytes[0]);
                std::cerr << "    " << coeff << " * w" << w.value << std::endl;
            }
        }

        // Evaluate expression
        fr value = q_c;
        for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
            fr coeff = fr::serialize_from_buffer(&coeff_bytes[0]);
            auto it1 = witnesses.find(w1.value);
            auto it2 = witnesses.find(w2.value);
            if (it1 != witnesses.end() && it2 != witnesses.end()) {
                value += coeff * it1->second * it2->second;
            }
        }
        for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
            fr coeff = fr::serialize_from_buffer(&coeff_bytes[0]);
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
        fr value = fr::serialize_from_buffer(&expr.q_c[0]);

        for (const auto& [coeff_bytes, w1, w2] : expr.mul_terms) {
            fr coeff = fr::serialize_from_buffer(&coeff_bytes[0]);
            auto it1 = witnesses.find(w1.value);
            auto it2 = witnesses.find(w2.value);
            if (it1 != witnesses.end() && it2 != witnesses.end()) {
                value += coeff * it1->second * it2->second;
            }
        }

        for (const auto& [coeff_bytes, w] : expr.linear_combinations) {
            fr coeff = fr::serialize_from_buffer(&coeff_bytes[0]);
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
 * @brief Structure to track logic constraint info for witness generation
 */
struct LogicConstraintInfo {
    // Input can be either a witness index or a constant value
    bool lhs_is_constant;
    bool rhs_is_constant;
    uint32_t lhs_witness; // Only valid if lhs_is_constant == false
    uint32_t rhs_witness; // Only valid if rhs_is_constant == false
    fr lhs_constant;      // Only valid if lhs_is_constant == true
    fr rhs_constant;      // Only valid if rhs_is_constant == true
    uint32_t output_witness;
    uint32_t num_bits;
    bool is_xor;
};

/**
 * @brief Compute AND of two field elements treated as integers with given bit width
 */
fr compute_and(const fr& lhs, const fr& rhs, uint32_t num_bits)
{
    uint256_t lhs_int = static_cast<uint256_t>(lhs);
    uint256_t rhs_int = static_cast<uint256_t>(rhs);
    uint256_t mask = (uint256_t(1) << num_bits) - 1;
    uint256_t result = (lhs_int & rhs_int) & mask;
    return fr(result);
}

/**
 * @brief Compute XOR of two field elements treated as integers with given bit width
 */
fr compute_xor(const fr& lhs, const fr& rhs, uint32_t num_bits)
{
    uint256_t lhs_int = static_cast<uint256_t>(lhs);
    uint256_t rhs_int = static_cast<uint256_t>(rhs);
    uint256_t mask = (uint256_t(1) << num_bits) - 1;
    uint256_t result = ((lhs_int ^ rhs_int) & mask);
    return fr(result);
}

/**
 * @brief Create a FunctionInput from a witness index
 */
Acir::FunctionInput make_witness_input(uint32_t witness_idx)
{
    Acir::FunctionInput::Witness witness_input;
    witness_input.value = Acir::Witness{ witness_idx };

    Acir::FunctionInput input;
    input.value = witness_input;
    return input;
}

/**
 * @brief Create a FunctionInput from a constant field element
 */
Acir::FunctionInput make_constant_input(const fr& value)
{
    Acir::FunctionInput::Constant constant_input;
    // Convert field element to bytes (big-endian)
    constant_input.value.resize(32);
    auto value_bytes = value.to_buffer();
    std::copy(value_bytes.begin(), value_bytes.end(), constant_input.value.begin());

    Acir::FunctionInput input;
    input.value = constant_input;
    return input;
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
    // Minimum 32 bytes required:
    //   - 6 bytes header (num_witnesses, num_expressions, coeff_vm_steps, witness_vm_steps,
    //                     range_constraint_byte, logic_constraint_byte)
    //   - 26+ bytes for VM data to execute meaningful operations on both VMs
    if (size < 32)
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
    uint8_t logic_constraint_byte = data[5];                    // Controls logic constraint generation

    const uint8_t* vm_data = data + 6;
    size_t vm_data_size = size - 6;

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

            std::vector<uint8_t> coeff(32);
            coeff = coeff_state[coeff_reg].to_buffer();
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

            std::vector<uint8_t> coeff(32);
            coeff = coeff_state[coeff_reg].to_buffer();
            Acir::Witness w;
            w.value = w_idx;
            expr.linear_combinations.push_back(std::make_tuple(coeff, w));
        }

        // Constant term from coefficient VM
        if (remaining > 0) {
            uint8_t const_reg = ptr[0] % INTERNAL_STATE_SIZE;
            ptr++;
            remaining--;
            expr.q_c = coeff_state[const_reg].to_buffer();
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
            if (byte_idx >= 6) { // Adjusted for 6-byte header
                uint32_t witness_to_corrupt = disable_sanitization ? data[byte_idx] : data[byte_idx] % num_witnesses;

                // Skip if we've already corrupted this witness
                if (already_corrupted.count(witness_to_corrupt) > 0) {
                    continue;
                }
                already_corrupted.insert(witness_to_corrupt);

                fr original_value = solved_witnesses[witness_to_corrupt];

                // Read corruption parameters from input - gives fuzzer control over replacement value
                // Use bytes further back in the input for corruption mode and value
                size_t mode_idx = (byte_idx > 1) ? byte_idx - 1 : 0;
                size_t value_idx = (byte_idx > 2) ? byte_idx - 2 : 0;
                uint8_t corruption_mode = (mode_idx >= 6) ? (data[mode_idx] & 0x07) : 0;
                uint8_t corruption_seed = (value_idx >= 6) ? data[value_idx] : 1;

                fr corruption_value;
                switch (corruption_mode) {
                case 0:
                    // Use seed as direct replacement (small value)
                    corruption_value = fr(corruption_seed);
                    break;
                case 1:
                    // Add seed to original
                    corruption_value = original_value + fr(corruption_seed);
                    break;
                case 2:
                    // Subtract seed from original
                    corruption_value = original_value - fr(corruption_seed);
                    break;
                case 3:
                    // XOR with seed (flip bits)
                    corruption_value = fr(static_cast<uint256_t>(original_value) ^ uint256_t(corruption_seed));
                    break;
                case 4:
                    // Large value: seed << 128
                    corruption_value = fr(uint256_t(corruption_seed) << 128);
                    break;
                case 5:
                    // Negate original
                    corruption_value = -original_value;
                    break;
                case 6:
                    // Use VM state value (previous behavior) for variety
                    corruption_value = coeff_state[(data[byte_idx] + INTERNAL_STATE_SIZE / 2) % INTERNAL_STATE_SIZE];
                    break;
                default:
                    // Scaled seed value
                    corruption_value = fr(uint256_t(corruption_seed) << 64);
                    break;
                }

                // Ensure corruption actually changed the value
                if (corruption_value == original_value) {
                    corruption_value = original_value + fr::one();
                }
                if (corruption_value == original_value) {
                    corruption_value = original_value - fr::one();
                }

                // Only corrupt if we actually have a different value
                if (corruption_value != original_value) {
                    solved_witnesses[witness_to_corrupt] = corruption_value;
                    corrupted_witness_indices.push_back(witness_to_corrupt);
                    actually_corrupted = true;
                }
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
                                                   fr::serialize_from_buffer(&expr.q_c[0]) == fr::zero();

                    if (is_assert_equal_pattern) {
                        fr coeff1 = fr::serialize_from_buffer(&std::get<0>(expr.linear_combinations[0])[0]);
                        fr coeff2 = fr::serialize_from_buffer(&std::get<0>(expr.linear_combinations[1])[0]);
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
    std::map<uint32_t, uint32_t> minimal_range; // Track tightest constraint per witness (for test setup)
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
        // Each constraint reads 2 bytes from input: witness_byte, bit_selector_byte
        for (uint32_t i = 0; i < num_range_constraints; ++i) {
            // Read parameters directly from input data - gives fuzzer byte-level control
            size_t param_offset = i * 2;

            // Bounds check - use default values if not enough data
            uint8_t witness_byte = (param_offset < vm_data_size) ? vm_data[param_offset] : 0;
            uint8_t bit_selector_byte = (param_offset + 1 < vm_data_size) ? vm_data[param_offset + 1] : 0;

            uint32_t witness_idx = disable_sanitization ? witness_byte : witness_byte % num_witnesses;
            uint8_t bit_selector = bit_selector_byte & 0x1F; // Mask to 5 bits [0,31]

            // Map bit_selector [0,31] to num_bits with weighted distribution:
            //   0-7   -> 8 bits   (u8)      25%
            //   8-13  -> 16 bits  (u16)     19%
            //   14-17 -> 32 bits  (u32)     12%
            //   18-20 -> 64 bits  (u64)      9%
            //   21-23 -> 128 bits (u128)     9%
            //   24-27 -> 254 bits (max)     12%
            //   28-29 -> 1 bit    (bool)     6%
            //   30-31 -> 0 bits   (zero)     6%
            uint32_t num_bits = 0;
            if (bit_selector < 8) {
                num_bits = 8;
            } else if (bit_selector < 14) {
                num_bits = 16;
            } else if (bit_selector < 18) {
                num_bits = 32;
            } else if (bit_selector < 21) {
                num_bits = 64;
            } else if (bit_selector < 24) {
                num_bits = 128;
            } else if (bit_selector < 28) {
                num_bits = 254;
            } else if (bit_selector < 30) {
                num_bits = 1;
            } else {
                num_bits = 0;
            }

            // Track minimal range for each witness
            auto it = minimal_range.find(witness_idx);
            if (it == minimal_range.end() || num_bits < it->second) {
                minimal_range[witness_idx] = num_bits;
            }
        }

        // Check if any existing witnesses violate their MINIMAL range constraints
        // This tests that witnesses satisfy the tightest constraint
        // and creates a single range constraint as the minimal one
        bool has_accidental_violation = false;
        for (const auto& [witness_idx, min_bits] : minimal_range) {
            range_constraints.push_back({ witness_idx, min_bits });

            auto it = solved_witnesses.find(witness_idx);
            if (it != solved_witnesses.end()) {
                if (!satisfies_range(it->second, min_bits)) {
                    has_accidental_violation = true;
                    break;
                }
            }
        }

        // Decide if we should intentionally violate a range constraint (25% chance)
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

    // ========== LOGIC CONSTRAINT GENERATION (AND/XOR) ==========
    // Generate AND/XOR constraints for pairs of witnesses
    // Uses logic_constraint_byte to control generation
    std::vector<LogicConstraintInfo> logic_constraints;
    bool should_violate_logic = false;
    uint32_t violated_logic_idx = 0;

    // Decide if we should generate any logic constraints (50% chance)
    if ((logic_constraint_byte & 0x80) != 0 && num_witnesses >= 3) {
        // Number of logic constraints to add (1-3)
        uint32_t num_logic_constraints = ((logic_constraint_byte >> 5) & 0x3) + 1;
        num_logic_constraints = std::min(num_logic_constraints, (num_witnesses - 1) / 3 + 1);

        // We need to allocate new witnesses for outputs
        uint32_t next_witness = num_witnesses;

        for (uint32_t i = 0; i < num_logic_constraints; ++i) {
            // Read parameters directly from input data - gives fuzzer byte-level control
            // Each constraint uses 3 bytes: control_byte, lhs_byte, rhs_byte
            // Read from vm_data section (after header) to allow direct mutation
            size_t param_offset = i * 3;

            // Bounds check - use default values if not enough data
            uint8_t control_byte = (param_offset < vm_data_size) ? vm_data[param_offset] : 0;
            uint8_t lhs_byte = (param_offset + 1 < vm_data_size) ? vm_data[param_offset + 1] : 0;
            uint8_t rhs_byte = (param_offset + 2 < vm_data_size) ? vm_data[param_offset + 2] : 0;

            // Determine bit width: bits [0:1] select from {8, 16, 32, 64}
            uint8_t bit_selector = control_byte & 0x3;
            uint32_t num_bits = 8;
            switch (bit_selector) {
            case 0:
                num_bits = 8;
                break;
            case 1:
                num_bits = 16;
                break;
            case 2:
                num_bits = 32;
                break;
            default:
                num_bits = 64;
                break;
            }

            uint256_t max_val_mask = (uint256_t(1) << num_bits) - 1;

            // Determine operation type and input modes from control byte
            // bit 2: is_xor (0=AND, 1=XOR)
            // bit 3: lhs_is_const
            // bit 4: rhs_is_const
            bool is_xor = (control_byte & 0x04) != 0;
            bool lhs_is_const = (control_byte & 0x08) != 0;
            bool rhs_is_const = (control_byte & 0x10) != 0;

            // Compute witness indices from input bytes
            uint32_t lhs_idx = lhs_byte % num_witnesses;
            uint32_t rhs_idx = rhs_byte % num_witnesses;

            // Generate constant values from input bytes (masked to num_bits)
            // Use lhs_byte/rhs_byte as seed for constant value
            fr lhs_const = fr::zero();
            fr rhs_const = fr::zero();
            if (lhs_is_const) {
                // Expand byte to field by using it as a multiplier with witness_state
                uint256_t const_int = (static_cast<uint256_t>(lhs_byte) *
                                       static_cast<uint256_t>(witness_state[i % INTERNAL_STATE_SIZE])) &
                                      max_val_mask;
                lhs_const = fr(const_int);
            }
            if (rhs_is_const) {
                uint256_t const_int = (static_cast<uint256_t>(rhs_byte) *
                                       static_cast<uint256_t>(witness_state[(i + 1) % INTERNAL_STATE_SIZE])) &
                                      max_val_mask;
                rhs_const = fr(const_int);
            }

            // Allocate output witness
            uint32_t out_idx = next_witness++;

            logic_constraints.push_back(LogicConstraintInfo{ .lhs_is_constant = lhs_is_const,
                                                             .rhs_is_constant = rhs_is_const,
                                                             .lhs_witness = lhs_idx,
                                                             .rhs_witness = rhs_idx,
                                                             .lhs_constant = lhs_const,
                                                             .rhs_constant = rhs_const,
                                                             .output_witness = out_idx,
                                                             .num_bits = num_bits,
                                                             .is_xor = is_xor });
        }

        // Update num_witnesses to account for new output witnesses
        num_witnesses = next_witness;

        // Generate correct output witnesses for logic constraints
        // First, ensure input witnesses fit within num_bits range
        uint256_t max_val_mask;
        for (auto& lc : logic_constraints) {
            max_val_mask = (uint256_t(1) << lc.num_bits) - 1;

            // Get lhs value (from witness or constant)
            fr lhs_val;
            if (lc.lhs_is_constant) {
                lhs_val = lc.lhs_constant; // Already masked during generation
            } else {
                lhs_val = solved_witnesses[lc.lhs_witness];
                uint256_t lhs_int = static_cast<uint256_t>(lhs_val) & max_val_mask;
                lhs_val = fr(lhs_int);
                // Update witness to be within range
                solved_witnesses[lc.lhs_witness] = lhs_val;
            }

            // Get rhs value (from witness or constant)
            fr rhs_val;
            if (lc.rhs_is_constant) {
                rhs_val = lc.rhs_constant; // Already masked during generation
            } else {
                rhs_val = solved_witnesses[lc.rhs_witness];
                uint256_t rhs_int = static_cast<uint256_t>(rhs_val) & max_val_mask;
                rhs_val = fr(rhs_int);
                // Update witness to be within range
                solved_witnesses[lc.rhs_witness] = rhs_val;
            }

            // Compute correct output
            fr output_val;
            if (lc.is_xor) {
                output_val = compute_xor(lhs_val, rhs_val, lc.num_bits);
            } else {
                output_val = compute_and(lhs_val, rhs_val, lc.num_bits);
            }
            solved_witnesses[lc.output_witness] = output_val;
        }

        // Decide if we should intentionally violate a logic constraint (20% chance)
        if ((logic_constraint_byte & 0x08) != 0 && !logic_constraints.empty()) {
            should_violate_logic = true;
            violated_logic_idx = logic_constraint_byte % static_cast<uint32_t>(logic_constraints.size());

            const auto& violated_lc = logic_constraints[violated_logic_idx];
            fr correct_output = solved_witnesses[violated_lc.output_witness];

            // Multiple violation strategies controlled by fuzzer input
            // Read violation mode from vm_data to give fuzzer control
            size_t violation_offset = num_logic_constraints * 3; // After logic constraint params
            uint8_t violation_mode =
                (violation_offset < vm_data_size) ? (vm_data[violation_offset] & 0x07) : 0; // 3 bits = 8 modes
            uint8_t violation_value =
                (violation_offset + 1 < vm_data_size) ? vm_data[violation_offset + 1] : 1; // Replacement seed

            fr corrupted_output;
            switch (violation_mode) {
            case 0:
                // Add violation_value (default: +1, but fuzzer can control)
                corrupted_output = correct_output + fr(violation_value);
                break;
            case 1:
                // Subtract violation_value
                corrupted_output = correct_output - fr(violation_value);
                break;
            case 2:
                // XOR with violation_value (flip some bits)
                corrupted_output = fr(static_cast<uint256_t>(correct_output) ^ uint256_t(violation_value));
                break;
            case 3:
                // Replace with violation_value directly
                corrupted_output = fr(violation_value);
                break;
            case 4:
                // Replace with scaled violation_value (larger corruption)
                corrupted_output = fr(uint256_t(violation_value) << 8);
                break;
            case 5:
                // Negate
                corrupted_output = -correct_output;
                if (corrupted_output == correct_output) {
                    corrupted_output = fr::one(); // If negation is same (0), use 1
                }
                break;
            case 6:
                // Make input witness exceed num_bits (test range check in logic gate)
                // Only if lhs is a witness
                if (!violated_lc.lhs_is_constant) {
                    // Set lhs to 2^num_bits + violation_value (just over the limit)
                    uint256_t over_limit = (uint256_t(1) << violated_lc.num_bits) + violation_value;
                    solved_witnesses[violated_lc.lhs_witness] = fr(over_limit);
                }
                // Also corrupt output to ensure constraint fails
                corrupted_output = correct_output + fr::one();
                break;
            case 7:
                // Make input witness exceed num_bits on rhs side
                if (!violated_lc.rhs_is_constant) {
                    uint256_t over_limit = (uint256_t(1) << violated_lc.num_bits) + violation_value;
                    solved_witnesses[violated_lc.rhs_witness] = fr(over_limit);
                }
                corrupted_output = correct_output + fr::one();
                break;
            }

            // Ensure corruption actually changed the value
            if (corrupted_output == correct_output) {
                corrupted_output = correct_output + fr::one();
            }
            solved_witnesses[violated_lc.output_witness] = corrupted_output;
        }
    }

    try {
        // Create ACIR Circuit
        // Note: num_witnesses may have been updated by logic constraint generation
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

        // Add Logic constraint opcodes (AND/XOR)
        for (const auto& lc : logic_constraints) {
            // Create lhs input (witness or constant)
            Acir::FunctionInput lhs_input =
                lc.lhs_is_constant ? make_constant_input(lc.lhs_constant) : make_witness_input(lc.lhs_witness);

            // Create rhs input (witness or constant)
            Acir::FunctionInput rhs_input =
                lc.rhs_is_constant ? make_constant_input(lc.rhs_constant) : make_witness_input(lc.rhs_witness);

            if (lc.is_xor) {
                // Create XOR BlackBoxFuncCall
                Acir::BlackBoxFuncCall::XOR xor_op;
                xor_op.lhs = lhs_input;
                xor_op.rhs = rhs_input;
                xor_op.num_bits = lc.num_bits;
                xor_op.output = Acir::Witness{ lc.output_witness };

                Acir::BlackBoxFuncCall bb_call;
                bb_call.value = xor_op;

                Acir::Opcode::BlackBoxFuncCall bb_opcode;
                bb_opcode.value = bb_call;

                Acir::Opcode opcode;
                opcode.value = bb_opcode;
                circuit.opcodes.push_back(opcode);
            } else {
                // Create AND BlackBoxFuncCall
                Acir::BlackBoxFuncCall::AND and_op;
                and_op.lhs = lhs_input;
                and_op.rhs = rhs_input;
                and_op.num_bits = lc.num_bits;
                and_op.output = Acir::Witness{ lc.output_witness };

                Acir::BlackBoxFuncCall bb_call;
                bb_call.value = and_op;

                Acir::Opcode::BlackBoxFuncCall bb_opcode;
                bb_opcode.value = bb_call;

                Acir::Opcode opcode;
                opcode.value = bb_opcode;
                circuit.opcodes.push_back(opcode);
            }
        }

        // *** Go through acir_to_constraint_buf pipeline directly ***
        // This exercises the core conversion logic without serialization issues
        AcirFormat acir_format = circuit_serde_to_acir_format(circuit);

        // ========== BUILD CIRCUIT FROM ACIR FORMAT ==========

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
        UltraCircuitBuilder builder{
            /*size_hint*/ 0, witness_vec, acir_format.public_inputs, /*is_write_vk_mode=*/false
        };

        build_constraints(builder, acir_format, ProgramMetadata{});

        // Check if the builder is in a failed state (e.g., from assert_equal with unequal values)
        if (builder.failed()) {
#ifndef FUZZING_DISABLE_WARNINGS
            info("Circuit builder is in a failed state: ", builder.err());
#endif
            return false;
        }

        bool circuit_valid = CircuitChecker::check(builder);

        // Re-verify that range violations still exist after all witness modifications
        // (Logic constraint generation may have masked witnesses, accidentally "fixing" the violation)
        if (should_violate_range) {
            fr actual_value = solved_witnesses[violated_witness_idx];
            if (satisfies_range(actual_value, violated_range_bits)) {
                // The violation was accidentally fixed by subsequent witness modifications
                should_violate_range = false;
            }
        }

        // Re-verify that witness corruption still breaks the expressions
        // Logic constraint generation may have modified witnesses (masking for bit widths),
        // potentially undoing the corruption or making it ineffective
        if (witnesses_corrupted) {
            // First check: verify corrupted witnesses still have different values from originals
            bool corruption_still_effective = false;
            for (uint32_t corrupted_w : corrupted_witness_indices) {
                if (solved_witnesses[corrupted_w] != original_witnesses[corrupted_w]) {
                    corruption_still_effective = true;
                    break;
                }
            }

            if (!corruption_still_effective) {
                // All corrupted values were reset by subsequent operations (e.g., logic masking)
                witnesses_corrupted = false;
            } else {
                // Second check: verify corruption actually breaks the expressions
                bool expressions_still_broken = !validate_witnesses(expressions, solved_witnesses, false);
                if (!expressions_still_broken) {
                    // Expressions are still satisfied despite corruption - under-constrained circuit
                    witnesses_corrupted = false;
                }
            }
        }

        // SOUNDNESS CHECK: Corrupted witnesses, range violations, or logic violations should fail
        if (witnesses_corrupted || should_violate_range || should_violate_logic) {
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
                if (should_violate_logic) {
                    std::cerr << "Logic constraint violation passed CircuitChecker verification!" << std::endl;
                    const auto& violated_lc = logic_constraints[violated_logic_idx];
                    std::cerr << "Violated logic op: " << (violated_lc.is_xor ? "XOR" : "AND") << std::endl;
                    std::cerr << "LHS witness w" << violated_lc.lhs_witness << " = "
                              << solved_witnesses[violated_lc.lhs_witness] << std::endl;
                    std::cerr << "RHS witness w" << violated_lc.rhs_witness << " = "
                              << solved_witnesses[violated_lc.rhs_witness] << std::endl;
                    std::cerr << "Output witness w" << violated_lc.output_witness << " = "
                              << solved_witnesses[violated_lc.output_witness] << std::endl;
                    std::cerr << "Num bits: " << violated_lc.num_bits << std::endl;
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
        if (!circuit_valid) {
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
            size_t vm_section_start = 6;      // Header is now 6 bytes
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
        // Mutate header (controls scaling and constraint generation)
        if (size > 5) {
            data[static_cast<unsigned>(std::rand()) % 6u] =
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
