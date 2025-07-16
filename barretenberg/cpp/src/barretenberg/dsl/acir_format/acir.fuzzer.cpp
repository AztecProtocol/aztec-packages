// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "acir_format.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/fields/field.fuzzer.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <cstdint>
#include <random>
#include <vector>

namespace acir_format {

/**
 * @brief Fuzzer that tests circuit correctness with ACIR constraints
 *
 * This fuzzer first runs a FieldVM for 64 steps using the input data,
 * then creates constraints based on the constants from the FieldVM's internal state.
 * It focuses on testing various constraint types in the ACIR format.
 */
class AcirFuzzer {
  public:
    using PolyTripleConstraint = bb::poly_triple_<bb::curve::BN254::ScalarField>;
    using RangeConstraint = acir_format::RangeConstraint;
    using fr = bb::curve::BN254::ScalarField;
    using FieldVM = bb::FieldVM<bb::fr>;

    /**
     * @brief Create a circuit with poly_triple_constraints and range_constraints
     *
     * @param poly_constraints Vector of poly_triple_constraints
     * @param range_constraints Vector of range_constraints
     * @param num_witnesses Number of witnesses
     * @return AcirFormat The constraint system
     */
    static AcirFormat create_mixed_constraint_circuit(const std::vector<PolyTripleConstraint>& poly_constraints,
                                                      const std::vector<RangeConstraint>& range_constraints,
                                                      uint32_t num_witnesses)
    {
        AcirFormat constraint_system;

        // Initialize all constraint vectors to empty
        constraint_system.poly_triple_constraints.clear();
        constraint_system.range_constraints.clear();
        constraint_system.logic_constraints.clear();
        constraint_system.aes128_constraints.clear();
        constraint_system.sha256_compression.clear();
        constraint_system.ecdsa_k1_constraints.clear();
        constraint_system.ecdsa_r1_constraints.clear();
        constraint_system.blake2s_constraints.clear();
        constraint_system.blake3_constraints.clear();
        constraint_system.keccak_permutations.clear();
        constraint_system.poseidon2_constraints.clear();
        constraint_system.multi_scalar_mul_constraints.clear();
        constraint_system.ec_add_constraints.clear();
        constraint_system.recursion_constraints.clear();
        constraint_system.honk_recursion_constraints.clear();
        constraint_system.avm_recursion_constraints.clear();
        constraint_system.ivc_recursion_constraints.clear();
        constraint_system.bigint_from_le_bytes_constraints.clear();
        constraint_system.bigint_to_le_bytes_constraints.clear();
        constraint_system.bigint_operations.clear();
        constraint_system.assert_equalities.clear();
        constraint_system.quad_constraints.clear();
        constraint_system.big_quad_constraints.clear();
        constraint_system.block_constraints.clear();

        // Add our constraints
        for (const auto& constraint : poly_constraints) {
            constraint_system.poly_triple_constraints.push_back(constraint);
        }

        for (const auto& constraint : range_constraints) {
            constraint_system.range_constraints.push_back(constraint);
        }

        // Set required fields
        constraint_system.num_acir_opcodes = static_cast<uint32_t>(poly_constraints.size() + range_constraints.size());
        constraint_system.public_inputs = {};
        constraint_system.varnum = num_witnesses;

        // Initialize gates_per_opcode with the correct size
        constraint_system.gates_per_opcode.resize(constraint_system.num_acir_opcodes, 1);

        // Initialize original_opcode_indices
        constraint_system.original_opcode_indices.poly_triple_constraints.clear();
        constraint_system.original_opcode_indices.range_constraints.clear();
        constraint_system.original_opcode_indices.logic_constraints.clear();
        constraint_system.original_opcode_indices.aes128_constraints.clear();
        constraint_system.original_opcode_indices.sha256_compression.clear();
        constraint_system.original_opcode_indices.ecdsa_k1_constraints.clear();
        constraint_system.original_opcode_indices.ecdsa_r1_constraints.clear();
        constraint_system.original_opcode_indices.blake2s_constraints.clear();
        constraint_system.original_opcode_indices.blake3_constraints.clear();
        constraint_system.original_opcode_indices.keccak_permutations.clear();
        constraint_system.original_opcode_indices.poseidon2_constraints.clear();
        constraint_system.original_opcode_indices.multi_scalar_mul_constraints.clear();
        constraint_system.original_opcode_indices.ec_add_constraints.clear();
        constraint_system.original_opcode_indices.recursion_constraints.clear();
        constraint_system.original_opcode_indices.honk_recursion_constraints.clear();
        constraint_system.original_opcode_indices.avm_recursion_constraints.clear();
        constraint_system.original_opcode_indices.ivc_recursion_constraints.clear();
        constraint_system.original_opcode_indices.bigint_from_le_bytes_constraints.clear();
        constraint_system.original_opcode_indices.bigint_to_le_bytes_constraints.clear();
        constraint_system.original_opcode_indices.bigint_operations.clear();
        constraint_system.original_opcode_indices.assert_equalities.clear();
        constraint_system.original_opcode_indices.poly_triple_constraints.clear();
        constraint_system.original_opcode_indices.quad_constraints.clear();
        constraint_system.original_opcode_indices.block_constraints.clear();

        // Set up the original opcode indices for our constraints
        for (size_t i = 0; i < poly_constraints.size(); ++i) {
            constraint_system.original_opcode_indices.poly_triple_constraints.push_back(i);
        }
        for (size_t i = 0; i < range_constraints.size(); ++i) {
            constraint_system.original_opcode_indices.range_constraints.push_back(i);
        }

        return constraint_system;
    }

    /**
     * @brief Run FieldVM for 64 steps and extract constants from internal state
     *
     * @param data Input data for FieldVM
     * @param size Size of input data
     * @return std::pair<std::vector<fr>, size_t> Constants extracted from FieldVM state and bytes consumed
     */
    static std::pair<std::vector<fr>, size_t> run_fieldvm_and_extract_constants(const uint8_t* data, size_t size)
    {
        // Input validation
        if (data == nullptr || size == 0) {
            return { {}, 0 };
        }

        try {
            // Create FieldVM with BN254 field and run for 64 steps
            FieldVM vm(false, 64); // Enable debug output, max 64 steps

            // Run the FieldVM on the input data
            size_t bytes_consumed = vm.run(data, size);

            // Validate bytes consumed
            if (bytes_consumed > size) {
                bytes_consumed = size; // Cap at input size
            }

            // Extract constants from the FieldVM's internal state
            auto field_state = vm.export_fr_state();

            return { field_state, bytes_consumed };
        } catch (const std::exception&) {
            // Return empty state on any exception
            return { {}, 0 };
        }
    }

    /**
     * @brief Create constraints based on FieldVM constants
     *
     * @param constants Constants from FieldVM state
     * @param witness_vector Current witness vector
     * @param buffer Buffer to use for constraint generation
     * @param buffer_size Size of the buffer
     * @return std::vector<PolyTripleConstraint> Generated constraints
     */
    static std::vector<PolyTripleConstraint> create_constraints_from_fieldvm_constants(const std::vector<fr>& constants,
                                                                                       WitnessVector& witness_vector,
                                                                                       const uint8_t* buffer,
                                                                                       size_t buffer_size)
    {
        std::vector<PolyTripleConstraint> constraints;
        size_t buffer_pos = 0;
        const size_t max_constraints = 1000; // Prevent potential DoS

        // Input validation
        if (buffer == nullptr || buffer_size == 0 || witness_vector.empty()) {
            return constraints;
        }

        while (buffer_pos < buffer_size && constraints.size() < max_constraints) {
            // 1. Read a boolean from the buffer (read a byte and use the last bit)
            if (buffer_pos >= buffer_size) {
                break;
            }
            bool create_new_witness = (buffer[buffer_pos] & 0x01) != 0;
            buffer_pos++;

            // 2. If that is true, then read 3 index uint16_ts from the buffer and use as a,b and c
            // (take modulo the current size of witness vector)
            if (buffer_pos + 6 > buffer_size) {
                break; // Need 6 bytes for 3 uint16_ts
            }

            uint16_t a_idx = static_cast<uint16_t>((static_cast<uint16_t>(buffer[buffer_pos]) << 8) |
                                                   static_cast<uint16_t>(buffer[buffer_pos + 1]));
            uint16_t b_idx = static_cast<uint16_t>((static_cast<uint16_t>(buffer[buffer_pos + 2]) << 8) |
                                                   static_cast<uint16_t>(buffer[buffer_pos + 3]));
            uint16_t c_idx = static_cast<uint16_t>((static_cast<uint16_t>(buffer[buffer_pos + 4]) << 8) |
                                                   static_cast<uint16_t>(buffer[buffer_pos + 5]));
            buffer_pos += 6;

            // Take modulo the current size of witness vector
            uint32_t witness_size = static_cast<uint32_t>(witness_vector.size());
            if (witness_size == 0) {
                break; // Avoid division by zero
            }
            uint32_t a = a_idx % witness_size;
            uint32_t b = b_idx % witness_size;
            // In case of creating a new witness, use the witness size as the index for c as that's where the new
            // witness will be added
            uint32_t c = create_new_witness ? witness_size : c_idx % witness_size;

            // 3. Read 1-byte indices from the buffer. Use them to get constants from the constant vector
            // and set q_m, q_l, q_r, q_o
            if (buffer_pos + 5 > buffer_size)
                break; // Need 5 bytes for q_m, q_l, q_r, q_o, q_c indices

            uint8_t q_m_idx = buffer[buffer_pos];
            uint8_t q_l_idx = buffer[buffer_pos + 1];
            uint8_t q_r_idx = buffer[buffer_pos + 2];
            uint8_t q_o_idx = buffer[buffer_pos + 3];
            uint8_t q_c_idx = buffer[buffer_pos + 4];
            buffer_pos += 5;

            // Validate constants vector
            if (constants.empty()) {
                break; // No constants available
            }

            // Get constants from the constant vector
            fr q_m_const = constants[q_m_idx % constants.size()];
            fr q_l_const = constants[q_l_idx % constants.size()];
            fr q_r_const = constants[q_r_idx % constants.size()];
            fr q_o_const = constants[q_o_idx % constants.size()];
            fr q_c_const = constants[q_c_idx % constants.size()];

            PolyTripleConstraint constraint;
            constraint.a = a;
            constraint.b = b;
            constraint.c = c;
            constraint.q_m = q_m_const;
            constraint.q_l = q_l_const;
            constraint.q_r = q_r_const;

            // 4. Evaluate which q_c would satisfy the equation and set q_c to that
            // The equation is: q_m * a * b + q_l * a + q_r * b + q_o * c + q_c = 0
            // So q_c = -(q_m * a * b + q_l * a + q_r * b + q_o * c)

            fr a_val = witness_vector[a];
            fr b_val = witness_vector[b];
            if (!create_new_witness) {
                fr c_val = witness_vector[c];

                fr q_c_val = -(q_m_const * a_val * b_val + q_l_const * a_val + q_r_const * b_val + q_o_const * c_val);

                constraint.q_o = q_o_const;
                constraint.q_c = q_c_val;
            } else {
                q_o_const = q_o_const.is_zero() ? -fr(1) : q_o_const;
                auto new_witness_value =
                    -(q_m_const * a_val * b_val + q_l_const * a_val + q_r_const * b_val + q_c_const + fr(1)) /
                    q_o_const;
                witness_vector.push_back(new_witness_value);

                constraint.q_o = q_o_const;
                constraint.q_c = q_c_const;
            }

            constraints.push_back(constraint);
        }

        return constraints;
    }

    /**
     * @brief Create range constraints based on FieldVM constants
     *
     * @param constants Constants from FieldVM state
     * @param witness_vector Current witness vector
     * @param buffer Buffer to use for constraint generation
     * @param buffer_size Size of the buffer
     * @return std::vector<RangeConstraint> Generated range constraints
     */
    static std::vector<RangeConstraint> create_range_constraints_from_fieldvm_constants(
        const std::vector<fr>& constants,
        const WitnessVector& witness_vector,
        const uint8_t* buffer,
        size_t buffer_size)
    {
        (void)constants; // Suppress unused parameter warning
        std::vector<RangeConstraint> constraints;
        size_t buffer_pos = 0;
        const size_t max_constraints = 500; // Prevent potential DoS

        // Input validation
        if (buffer == nullptr || buffer_size == 0 || witness_vector.empty()) {
            return constraints;
        }

        while (buffer_pos < buffer_size && constraints.size() < max_constraints) {
            // 1. Read a boolean from the buffer (read a byte and use the last bit)
            if (buffer_pos >= buffer_size) {
                break;
            }

            // 2. Read 2 bytes for witness index and adjustment byte
            if (buffer_pos + 2 > buffer_size) {
                break; // Need 2 bytes for witness index and adjustment
            }

            uint8_t witness_idx = buffer[buffer_pos];
            uint8_t adjustment_byte = buffer[buffer_pos + 1];
            buffer_pos += 2;

            // Validate witness index
            if (witness_vector.empty()) {
                continue; // Defensive: skip if empty (shouldn't happen due to earlier check)
            }
            witness_idx = witness_idx % witness_vector.size();

            // Get the witness value and convert to uint256_t
            fr witness_value = witness_vector[witness_idx];
            uint256_t witness_uint256 = static_cast<uint256_t>(witness_value);

            // Get the actual number of bits used by the witness value
            uint64_t actual_bits = witness_uint256.get_msb();
            if (witness_uint256 == 0) {
                actual_bits = 0; // get_msb returns 0 for zero, but we want 0 bits
            } else {
                actual_bits += 1; // get_msb is 0-indexed, so add 1 for actual bit count
            }

            // Use the adjustment byte to determine the target number of bits
            // Take a value between actual_bits and 253
            uint64_t target_bits;
            if (actual_bits >= 253) {
                continue; // Don't create constraint if value is already >= 253 bits
            }

            // Use adjustment_byte to interpolate between actual_bits and 253
            uint64_t range = 253 - actual_bits;
            target_bits = actual_bits + (adjustment_byte % (range + 1));

            // Validate target_bits (reasonable range: 1-253 bits)
            if (target_bits == 0 || target_bits > 253) {
                continue; // Skip this constraint if invalid
            }

            RangeConstraint constraint;
            constraint.witness = witness_idx;
            constraint.num_bits = static_cast<uint32_t>(target_bits);

            constraints.push_back(constraint);
        }

        return constraints;
    }

    /**
     * @brief Create constraints one by one, checking type for each constraint
     *
     * @param constants Constants from FieldVM state
     * @param witness_vector Current witness vector (will be modified if new witnesses are created)
     * @param buffer Buffer to use for constraint generation
     * @param buffer_size Size of the buffer
     * @return std::pair<std::vector<PolyTripleConstraint>, std::vector<RangeConstraint>> Generated constraints
     */
    static std::pair<std::vector<PolyTripleConstraint>, std::vector<RangeConstraint>> create_constraints_one_by_one(
        const std::vector<fr>& constants, WitnessVector& witness_vector, const uint8_t* buffer, size_t buffer_size)
    {
        std::vector<PolyTripleConstraint> poly_constraints;
        std::vector<RangeConstraint> range_constraints;
        size_t buffer_pos = 0;
        const size_t max_constraints = 1000; // Prevent potential DoS

        // Input validation
        if (buffer == nullptr || buffer_size == 0 || witness_vector.empty()) {
            return { poly_constraints, range_constraints };
        }

        while (buffer_pos < buffer_size && (poly_constraints.size() + range_constraints.size()) < max_constraints) {

            // Check if we have enough bytes to read constraint type
            if (buffer_pos >= buffer_size) {
                break;
            }

            // Read constraint type (0 = poly_triple, 1 = range)
            uint8_t constraint_type = buffer[buffer_pos] & 0x01;
            buffer_pos++;

            if (constraint_type == 0) {
                // Create poly_triple constraint
                if (buffer_pos >= buffer_size) {
                    break;
                }

                // Read boolean for creating new witness
                bool create_new_witness = (buffer[buffer_pos] & 0x01) != 0;
                buffer_pos++;

                // Read 3 index uint16_ts from the buffer and use as a,b and c
                if (buffer_pos + 6 > buffer_size) {
                    break; // Need 6 bytes for 3 uint16_ts
                }

                uint16_t a_idx = static_cast<uint16_t>((static_cast<uint16_t>(buffer[buffer_pos]) << 8) |
                                                       static_cast<uint16_t>(buffer[buffer_pos + 1]));
                uint16_t b_idx = static_cast<uint16_t>((static_cast<uint16_t>(buffer[buffer_pos + 2]) << 8) |
                                                       static_cast<uint16_t>(buffer[buffer_pos + 3]));
                uint16_t c_idx = static_cast<uint16_t>((static_cast<uint16_t>(buffer[buffer_pos + 4]) << 8) |
                                                       static_cast<uint16_t>(buffer[buffer_pos + 5]));
                buffer_pos += 6;

                // Take modulo the current size of witness vector
                uint32_t witness_size = static_cast<uint32_t>(witness_vector.size());
                if (witness_size == 0) {
                    break; // Avoid division by zero
                }
                uint32_t a = a_idx % witness_size;
                uint32_t b = b_idx % witness_size;
                // In case of creating a new witness, use the witness size as the index for c as that's where the new
                // witness will be added
                uint32_t c = create_new_witness ? witness_size : c_idx % witness_size;

                // Read 1-byte indices from the buffer. Use them to get constants from the constant vector
                // and set q_m, q_l, q_r, q_o, q_c
                if (buffer_pos + 5 > buffer_size) {
                    break; // Need 5 bytes for q_m, q_l, q_r, q_o, q_c indices
                }

                uint8_t q_m_idx = buffer[buffer_pos];
                uint8_t q_l_idx = buffer[buffer_pos + 1];
                uint8_t q_r_idx = buffer[buffer_pos + 2];
                uint8_t q_o_idx = buffer[buffer_pos + 3];
                uint8_t q_c_idx = buffer[buffer_pos + 4];
                buffer_pos += 5;

                // Validate constants vector
                if (constants.empty()) {
                    break; // No constants available
                }

                // Get constants from the constant vector
                fr q_m_const = constants[q_m_idx % constants.size()];
                fr q_l_const = constants[q_l_idx % constants.size()];
                fr q_r_const = constants[q_r_idx % constants.size()];
                fr q_o_const = constants[q_o_idx % constants.size()];
                fr q_c_const = constants[q_c_idx % constants.size()];

                PolyTripleConstraint constraint;
                constraint.a = a;
                constraint.b = b;
                constraint.c = c;
                constraint.q_m = q_m_const;
                constraint.q_l = q_l_const;
                constraint.q_r = q_r_const;

                fr a_val = witness_vector[a];
                fr b_val = witness_vector[b];
                if (!create_new_witness) {
                    fr c_val = witness_vector[c];

                    fr q_c_val =
                        -(q_m_const * a_val * b_val + q_l_const * a_val + q_r_const * b_val + q_o_const * c_val);

                    constraint.q_o = q_o_const;
                    constraint.q_c = q_c_val;
                } else {
                    q_o_const = q_o_const.is_zero() ? -fr(1) : q_o_const;
                    auto new_witness_value =
                        -(q_m_const * a_val * b_val + q_l_const * a_val + q_r_const * b_val + q_c_const) / q_o_const;
                    witness_vector.push_back(new_witness_value);

                    constraint.q_o = q_o_const;
                    constraint.q_c = q_c_const;
                }

                poly_constraints.push_back(constraint);

            } else {
                // Create range constraint
                if (buffer_pos >= buffer_size) {
                    break;
                }

                // Read 2 bytes for witness index and adjustment byte
                if (buffer_pos + 2 > buffer_size) {
                    break; // Need 2 bytes for witness index and adjustment
                }

                uint8_t witness_idx = buffer[buffer_pos];
                uint8_t adjustment_byte = buffer[buffer_pos + 1];
                buffer_pos += 2;

                // Validate witness index
                if (witness_vector.empty()) {
                    continue; // Defensive: skip if empty (shouldn't happen due to earlier check)
                }
                witness_idx = witness_idx % witness_vector.size();

                // Get the witness value and convert to uint256_t
                fr witness_value = witness_vector[witness_idx];
                uint256_t witness_uint256 = static_cast<uint256_t>(witness_value);

                // Get the actual number of bits used by the witness value
                uint64_t actual_bits = witness_uint256.get_msb();
                if (witness_uint256 == 0) {
                    actual_bits = 0; // get_msb returns 0 for zero, but we want 0 bits
                } else {
                    actual_bits += 1; // get_msb is 0-indexed, so add 1 for actual bit count
                }

                // Use the adjustment byte to determine the target number of bits
                // Take a value between actual_bits and 253
                uint64_t target_bits;
                if (actual_bits >= 253) {
                    continue; // Don't create constraint if value is already >= 253 bits
                }

                // Use adjustment_byte to interpolate between actual_bits and 253
                uint64_t range = 253 - actual_bits;
                target_bits = actual_bits + (adjustment_byte % (range + 1));

                // Validate target_bits (reasonable range: 1-253 bits)
                if (target_bits == 0 || target_bits > 253) {
                    continue; // Skip this constraint if invalid
                }

                RangeConstraint constraint;
                constraint.witness = witness_idx;
                constraint.num_bits = static_cast<uint32_t>(target_bits);

                range_constraints.push_back(constraint);
            }
        }

        return { poly_constraints, range_constraints };
    }

    /**
     * @brief Generate random witnesses for testing
     *
     * @param rng Random number generator
     * @param num_witnesses Number of witnesses to generate
     * @return std::vector<fr> Generated witnesses
     */
    static std::vector<fr> generate_random_witnesses(std::mt19937& rng, uint32_t num_witnesses)
    {
        std::vector<fr> witnesses;
        witnesses.reserve(num_witnesses);

        // Add 0 and 1 as first two witnesses
        witnesses.push_back(fr(0));
        witnesses.push_back(fr(1));

        // Generate random witnesses for the rest
        std::uniform_int_distribution<uint32_t> dist(0, 1000);
        for (uint32_t i = 2; i < num_witnesses; ++i) {
            witnesses.push_back(fr(dist(rng)));
        }

        return witnesses;
    }

    /**
     * @brief Test ACIR constraints with FieldVM integration
     *
     * @param data Input data for fuzzing
     * @param size Size of input data
     * @return int 0 on success, non-zero on failure
     */
    static int test_acir_constraints(const uint8_t* data, size_t size)
    {
        try {
            // Input validation
            if (data == nullptr || size == 0) {
                return 0; // Empty input is valid for fuzzing
            }

            // Step 1: Run FieldVM for 64 steps on the original data
            auto [fieldvm_constants, bytes_consumed] = run_fieldvm_and_extract_constants(data, size);

            // Validate bytes consumed
            if (bytes_consumed > size) {
                return 0; // Invalid data, but don't crash
            }

            // If FieldVM didn't consume any data or didn't produce constants, create some default constants
            if (bytes_consumed == 0 || fieldvm_constants.empty()) {
                fieldvm_constants = { fr(1), fr(2), fr(3), fr(4), fr(5) }; // Default constants
            }

            // Generate initial witness vector
            WitnessVector witness_vector;
            witness_vector.reserve(fieldvm_constants.size() + 2); // We need to put 0 and 1 in the beginning
            witness_vector.push_back(0);
            witness_vector.push_back(1);
            for (const auto& constant : fieldvm_constants) {
                witness_vector.push_back(constant);
            }
            const auto size_left = size - bytes_consumed;
            const auto* const constraint_data = data + bytes_consumed;

            // Step 2: Create constraints one by one, checking type for each constraint
            std::mt19937 rng(42); // Fixed seed for reproducibility

            auto [poly_constraints, range_constraints] =
                create_constraints_one_by_one(fieldvm_constants, witness_vector, constraint_data, size_left);

            // If no constraints were created, try to create at least one simple constraint
            if (poly_constraints.empty() && range_constraints.empty()) {
                return 0;
            }

            // Step 3: Create circuit with the generated constraints
            uint32_t num_witnesses = static_cast<uint32_t>(witness_vector.size());
            AcirFormat constraint_system =
                create_mixed_constraint_circuit(poly_constraints, range_constraints, num_witnesses);

            // Step 4: Create ACIR program and build circuit
            acir_format::AcirProgram program;
            program.constraints = constraint_system;
            program.witness = witness_vector;

            // Create circuit builder with proper metadata
            acir_format::ProgramMetadata metadata;
            metadata.size_hint = 0; // Let the builder determine size
            metadata.recursive = false;
            metadata.collect_gates_per_opcode = false;

            try {
                // Build the circuit
                bb::UltraCircuitBuilder builder =
                    acir_format::create_circuit<bb::UltraCircuitBuilder>(program, metadata);

                // Step 5: Check circuit satisfiability
                bool circuit_satisfiable = bb::CircuitChecker::check(builder);

                // For fuzzing purposes, we don't fail if the circuit is unsatisfiable
                // as this could be due to random constraints. We just want to ensure
                // the circuit construction and checking doesn't crash.
                // The circuit_satisfiable result is used for debugging/logging purposes.
                assert(circuit_satisfiable); // Suppress unused variable warning

            } catch (const std::exception& e) {
                return 0; // Don't crash the fuzzer
            } catch (...) {
                return 0; // Don't crash the fuzzer
            }

            return 0; // Success
        } catch (const std::exception& e) {
            // Log the exception but don't crash the fuzzer
            return 0;
        } catch (...) {
            // Catch any other exceptions
            return 0;
        }
    }
};

} // namespace acir_format

/**
 * @brief Initialize fuzzer
 */
extern "C" int LLVMFuzzerInitialize(int* argc, char*** argv)
{
    (void)argc;
    (void)argv;
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    return 0;
}

/**
 * @brief Main fuzzer entry point
 */
extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    return acir_format::AcirFuzzer::test_acir_constraints(data, size);
}