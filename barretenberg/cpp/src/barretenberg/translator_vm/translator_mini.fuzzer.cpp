// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/circuit_checker/translator_circuit_checker.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "translator_circuit_builder.hpp"

using namespace bb;

using Fr = curve::BN254::ScalarField;
using Fq = curve::BN254::BaseField;

extern "C" int LLVMFuzzerTestOneInput(const unsigned char* data, size_t size)
{
    constexpr size_t NUM_LIMB_BITS = bb::TranslatorCircuitBuilder::NUM_LIMB_BITS;
    constexpr size_t WIDE_LIMB_BYTES = 2 * NUM_LIMB_BITS / 8;
    constexpr size_t TOTAL_SIZE = 1 + 5 * sizeof(numeric::uint256_t) + 2 * WIDE_LIMB_BYTES;
    char buffer[32] = { 0 };
    if (size < (TOTAL_SIZE)) {
        return 0;
    }
    size_t op = data[0] & 3;
    EccOpCode op_code;
    switch (op) {
    case 3:
        op_code = EccOpCode{ .eq = true, .reset = true };
        break;
    case 4:
        op_code = EccOpCode{ .mul = true };
        break;
    case 8:
        op_code = EccOpCode{ .add = true };
        break;
    default:
        op_code = EccOpCode{};
        break;
    }

    Fq p_x = Fq(*(uint256_t*)(data + 1));
    Fr p_x_lo = uint256_t(p_x).slice(0, 2 * NUM_LIMB_BITS);
    Fr p_x_hi = uint256_t(p_x).slice(2 * NUM_LIMB_BITS, 4 * NUM_LIMB_BITS);

    Fq p_y = Fq(*(uint256_t*)(data + sizeof(uint256_t) + 1));
    Fr p_y_lo = uint256_t(p_y).slice(0, 2 * NUM_LIMB_BITS);
    Fr p_y_hi = uint256_t(p_y).slice(2 * NUM_LIMB_BITS, 4 * NUM_LIMB_BITS);

    Fq v = Fq(*(uint256_t*)(data + 2 * sizeof(uint256_t) + 1));
    Fq x = Fq(*(uint256_t*)(data + 3 * sizeof(uint256_t) + 1));
    Fq previous_accumulator = Fq(*(uint256_t*)(data + 4 * sizeof(uint256_t) + 1));

    memcpy(buffer, data + 1 + 5 * sizeof(uint256_t), WIDE_LIMB_BYTES);
    Fr z_1 = Fr(*(uint256_t*)(buffer));
    memcpy(buffer, data + 1 + 5 * sizeof(uint256_t) + WIDE_LIMB_BYTES, WIDE_LIMB_BYTES);
    Fr z_2 = Fr(*(uint256_t*)(buffer));

    bb::TranslatorCircuitBuilder::AccumulationInput single_accumulation_step =
        bb::TranslatorCircuitBuilder::generate_witness_values(UltraOp{ .op_code = op_code,
                                                                       .x_lo = p_x_lo,
                                                                       .x_hi = p_x_hi,
                                                                       .y_lo = p_y_lo,
                                                                       .y_hi = p_y_hi,
                                                                       .z_1 = z_1,
                                                                       .z_2 = z_2 },
                                                              previous_accumulator,
                                                              v,
                                                              x);

    auto circuit_builder = bb::TranslatorCircuitBuilder(v, x);
    circuit_builder.create_accumulation_gate(single_accumulation_step);
    if (!TranslatorCircuitChecker::check(circuit_builder)) {
        return 1;
    }
    return 0;
}
