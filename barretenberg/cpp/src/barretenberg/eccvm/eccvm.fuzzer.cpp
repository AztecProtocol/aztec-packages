// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/fields/field.fuzzer.hpp"
#include "barretenberg/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/eccvm/eccvm_trace_checker.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include <cassert>
#include <cstdint>
#include <iostream>
#include <vector>

using namespace bb;
using G1 = bb::g1;
using Fr = typename G1::Fr;
using Element = bb::curve::BN254::Element;

// Security note: This fuzzer generates random ECC operations to test the ECCVM circuit builder
// and trace checker. It focuses on the check_circuit mechanism without full proving to avoid
// potential security issues with proving key generation or proof verification.

// Operation types for the fuzzer
enum class OpType : uint8_t { ADD = 0, MUL = 1, EQ_AND_RESET = 2, MERGE = 3, EMPTY_ROW = 4, MAX_OP = 5 };
struct FieldVMDataChunk {
    std::array<uint8_t, 64> data;
};

struct SingleOp {
    OpType op_type;
    uint8_t generator_index;
    uint8_t scalar_index;
};

struct FuzzerTuple {
    FieldVMDataChunk fieldvm_data;
    SingleOp operation;
};

struct OperationDetail {
    size_t op_index;
    OpType op_type;
    size_t generator_index;
    Fr scalar;
    bool is_infinity;
    bool should_negate;

    OperationDetail(size_t idx, OpType type, size_t gen_idx, const Fr& sc, bool infinity, bool negate = false)
        : op_index(idx)
        , op_type(type)
        , generator_index(gen_idx)
        , scalar(sc)
        , is_infinity(infinity)
        , should_negate(negate)
    {}
};
static constexpr size_t NUM_GENERATORS = 4;
// Helper function to print operation details
void print_operation_details(size_t op_index,
                             OpType op_type,
                             size_t generator_index,
                             const Fr& scalar,
                             bool is_infinity,
                             bool should_negate = false)
{
    std::cout << "Operation " << op_index << ": ";
    switch (op_type) {
    case OpType::ADD:
        std::cout << "ADD(generator=" << generator_index << (should_negate ? ", negated" : "")
                  << (is_infinity ? ", infinity" : "") << ")";
        break;
    case OpType::MUL:
        std::cout << "MUL(generator=" << generator_index << ", scalar=" << scalar << (should_negate ? ", negated" : "")
                  << (is_infinity ? ", infinity" : "") << ")";
        break;
    case OpType::EQ_AND_RESET:
        std::cout << "EQ_AND_RESET";
        break;
    case OpType::MERGE:
        std::cout << "MERGE";
        break;
    case OpType::EMPTY_ROW:
        std::cout << "EMPTY_ROW";
        break;
    default:
        std::cout << "UNKNOWN(" << static_cast<int>(op_type) << ")";
        break;
    }
    std::cout << std::endl;
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{

    if (Size < sizeof(FuzzerTuple)) {
        return 0; // Invalid input size
    }

    const FuzzerTuple* input = reinterpret_cast<const FuzzerTuple*>(Data);

    // Validate input parameters
    size_t num_operations = (Size) / sizeof(FuzzerTuple);
    if (num_operations == 0) {
        return 0;
    }

    auto total_fieldvm_data_size = num_operations * sizeof(FieldVMDataChunk);
    std::vector<uint8_t> all_fieldvm_data(total_fieldvm_data_size);
    for (size_t i = 0; i < num_operations; ++i) {
        std::memcpy(
            all_fieldvm_data.data() + i * sizeof(FieldVMDataChunk), &input[i].fieldvm_data, sizeof(FieldVMDataChunk));
    }

    // Pre-compute scalars using FieldVM
    std::vector<Fr> precomputed_scalars;
    // Create FieldVM instance for scalar computation
    FieldVM<Fr> field_vm(false, 65536); // Disable debug, max 65536 steps

    // Disable heavy operations for better performance
    field_vm.settings.enable_inv = false;          // Disable inversion
    field_vm.settings.enable_sqrt = false;         // Disable square root
    field_vm.settings.enable_batch_invert = false; // Disable batch inversion
    field_vm.settings.enable_pow = false;          // Disable power operation
    field_vm.settings.enable_div = false;          // Disable division
    field_vm.settings.enable_div_assign = false;   // Disable division assignment

    // Run FieldVM with the controlled amount of data
    field_vm.run(all_fieldvm_data.data(), total_fieldvm_data_size);

    // Extract all field elements from FieldVM state as potential scalars
    for (size_t i = 0; i < 32; ++i) { // Use all 32 internal state elements
        Fr scalar = field_vm.field_internal_state[i];
        precomputed_scalars.push_back(scalar);
    }

    // Create base generators (always create 4 base generators)
    auto base_generators = G1::derive_generators("eccvm_fuzzer_generators", NUM_GENERATORS);
    std::vector<typename G1::element> points;

    // Use the first 16 FieldVM elements to create 4 linear combinations of base generators
    for (size_t i = 0; i < 4; ++i) {
        // Create linear combination: sum of base_generators[j] * precomputed_scalars[i*4 + j]
        typename G1::element combined_point = G1::point_at_infinity;
        for (size_t j = 0; j < 4; ++j) {
            Fr scalar = precomputed_scalars[i * 4 + j];
            combined_point = combined_point + (base_generators[j] * scalar);
        }
        points.push_back(combined_point);
    }

    // Create op queue
    std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();

    // Store operation details for potential failure reporting
    std::vector<OperationDetail> operation_details;

    // Process operations
    for (size_t i = 0; i < num_operations; ++i) {
        const auto& op = input[i].operation;
        OpType op_type = op.op_type;

        switch (op_type) {
        case OpType::ADD: {
            // Use modulo to ensure valid generator index (lower 7 bits)
            size_t generator_index = (op.generator_index & 0x7F) % points.size();
            bool should_negate = (op.generator_index & 0x80) != 0; // Top bit controls negation

            typename G1::element point_to_add = points[generator_index];
            if (should_negate) {
                point_to_add = -point_to_add; // Negate the point
            }

            bool is_infinity = point_to_add.is_point_at_infinity();
            operation_details.emplace_back(i, op_type, generator_index, Fr(0), is_infinity, should_negate);
            op_queue->add_accumulate(point_to_add);
            break;
        }
        case OpType::MUL: {
            // Use modulo to ensure valid generator index (lower 7 bits)
            size_t generator_index = (op.generator_index & 0x7F) % points.size();
            bool should_negate = (op.generator_index & 0x80) != 0; // Top bit controls negation

            // Use pre-computed scalar selected by scalar_indices
            Fr scalar = precomputed_scalars[op.scalar_index % precomputed_scalars.size()];

            typename G1::element point_to_multiply = points[generator_index];
            if (should_negate) {
                point_to_multiply = -point_to_multiply; // Negate the point
            }

            bool is_infinity = point_to_multiply.is_point_at_infinity();
            operation_details.emplace_back(i, op_type, generator_index, scalar, is_infinity, should_negate);
            op_queue->mul_accumulate(point_to_multiply, scalar);
            break;
        }
        case OpType::EQ_AND_RESET: {
            operation_details.emplace_back(i, op_type, 0, Fr(0), false, false);
            op_queue->eq_and_reset();
            break;
        }
        case OpType::MERGE: {
            operation_details.emplace_back(i, op_type, 0, Fr(0), false, false);

            op_queue->eq_and_reset();
            op_queue->merge();
            break;
        }
        case OpType::EMPTY_ROW: {
            operation_details.emplace_back(i, op_type, 0, Fr(0), false, false);
            op_queue->empty_row_for_testing();
            break;
        }
        default:
            operation_details.emplace_back(i, op_type, 0, Fr(0), false, false);
            break;
        }
    }

    // Always merge at the end to finalize the circuit
    operation_details.emplace_back(num_operations, OpType::EQ_AND_RESET, 0, Fr(0), false, false);
    op_queue->eq_and_reset();

    operation_details.emplace_back(num_operations + 1, OpType::MERGE, 0, Fr(0), false, false);
    op_queue->merge();

    // Create circuit builder
    ECCVMCircuitBuilder circuit{ op_queue };

    // Test the check_circuit mechanism
    bool result = ECCVMTraceChecker::check(circuit, nullptr, /* disable_fixed_dyadic_trace_size= */ true);
    // The circuit should always be valid if our operations are well-formed
    // If check fails, it might indicate a bug in the circuit builder or trace checker
    if (!result) {
        std::cout << "ERROR: ECCVMTraceChecker::check returned false!" << std::endl;
        std::cout << "Input parameters:" << std::endl;
        std::cout << "  num_operations: " << num_operations << std::endl;
        std::cout << "  operations: ";
        for (size_t i = 0; i < num_operations; ++i) {
            std::cout << static_cast<int>(input[i].operation.op_type) << " ";
        }
        std::cout << std::endl;
        std::cout << "  generator_indices: ";
        for (size_t i = 0; i < num_operations; ++i) {
            std::cout << static_cast<int>(input[i].operation.generator_index) << " ";
        }
        std::cout << std::endl;

        // Print operation details that led to the failure
        std::cout << "Operation sequence that caused failure:" << std::endl;
        for (const auto& op : operation_details) {
            print_operation_details(
                op.op_index, op.op_type, op.generator_index, op.scalar, op.is_infinity, op.should_negate);
        }
    }

    assert(result == true);

    return 0;
}
