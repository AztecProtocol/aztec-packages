// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/circuit_checker/translator_circuit_checker.hpp"
#include "barretenberg/translator_vm/translator.fuzzer.hpp"

/**
 * @brief A very primitive fuzzing harness, no interesting mutations, just parse and throw at the circuit builder
 *
 */
extern "C" int LLVMFuzzerTestOneInput(const unsigned char* data, size_t size)
{
    // Parse the queue and challenges
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/869): composer generates the initial challenge through
    // FS, so we have to do that, too
    auto parsing_result = parse_and_construct_opqueue(data, size);
    if (!parsing_result.has_value()) {
        return 0;
    }
    auto [batching_challenge, x, op_queue] = parsing_result.value();
    // Construct the circuit
    auto circuit_builder = TranslatorCircuitBuilder(batching_challenge, x, op_queue);

    Fq x_inv = x.invert();
    auto op_accumulator = Fq(0);
    auto p_x_accumulator = Fq(0);
    auto p_y_accumulator = Fq(0);
    auto z_1_accumulator = Fq(0);
    auto z_2_accumulator = Fq(0);
    // Compute the batched evaluation of polynomials (multiplying by inverse to go from lower to higher)
    const auto& eccvm_ops = op_queue->get_eccvm_ops();
    for (const auto& ecc_op : eccvm_ops) {
        op_accumulator = op_accumulator * x_inv + ecc_op.op_code.value();
        p_x_accumulator = p_x_accumulator * x_inv + ecc_op.base_point.x;
        p_y_accumulator = p_y_accumulator * x_inv + ecc_op.base_point.y;
        z_1_accumulator = z_1_accumulator * x_inv + ecc_op.z1;
        z_2_accumulator = z_2_accumulator * x_inv + ecc_op.z2;
    }
    Fq x_pow = x.pow(eccvm_ops.size() - 1);

    // Multiply by an appropriate power of x to get rid of the inverses
    [[maybe_unused]] Fq result =
        ((((z_2_accumulator * batching_challenge + z_1_accumulator) * batching_challenge + p_y_accumulator) *
              batching_challenge +
          p_x_accumulator) *
             batching_challenge +
         op_accumulator) *
        x_pow;

    // The data is malformed, so just call check_circuit, but ignore the output
    if (!TranslatorCircuitChecker::check(circuit_builder)) {
        return 1;
    }
    return 0;
}
