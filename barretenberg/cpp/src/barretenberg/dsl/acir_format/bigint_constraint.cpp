#include "bigint_constraint.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/dsl/types.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include <cstddef>
#include <cstdint>

namespace acir_format {

ModulusId modulus_param_to_id(ModulusParam param)
{
    if (Bn254FqParams::modulus_0 == param.modulus_0 && Bn254FqParams::modulus_1 == param.modulus_1 &&
        Bn254FqParams::modulus_2 == param.modulus_2 && Bn254FqParams::modulus_3 == param.modulus_3) {
        return ModulusId::BN254_FQ;
    }
    if (Bn254FrParams::modulus_0 == param.modulus_0 && Bn254FrParams::modulus_1 == param.modulus_1 &&
        Bn254FrParams::modulus_2 == param.modulus_2 && Bn254FrParams::modulus_3 == param.modulus_3) {
        return ModulusId::BN254_FR;
    }
    if (secp256k1::Secp256k1FqParams::modulus_0 == param.modulus_0 &&
        secp256k1::Secp256k1FqParams::modulus_1 == param.modulus_1 &&
        secp256k1::Secp256k1FqParams::modulus_2 == param.modulus_2 &&
        secp256k1::Secp256k1FqParams::modulus_3 == param.modulus_3) {
        return ModulusId::SECP256K1_FQ;
    }
    if (secp256k1::Secp256k1FrParams::modulus_0 == param.modulus_0 &&
        secp256k1::Secp256k1FrParams::modulus_1 == param.modulus_1 &&
        secp256k1::Secp256k1FrParams::modulus_2 == param.modulus_2 &&
        secp256k1::Secp256k1FrParams::modulus_3 == param.modulus_3) {
        return ModulusId::SECP256K1_FR;
    }
    if (secp256r1::Secp256r1FqParams::modulus_0 == param.modulus_0 &&
        secp256r1::Secp256r1FqParams::modulus_1 == param.modulus_1 &&
        secp256r1::Secp256r1FqParams::modulus_2 == param.modulus_2 &&
        secp256r1::Secp256r1FqParams::modulus_3 == param.modulus_3) {
        return ModulusId::SECP256R1_FQ;
    }
    if (secp256r1::Secp256r1FrParams::modulus_0 == param.modulus_0 &&
        secp256r1::Secp256r1FrParams::modulus_1 == param.modulus_1 &&
        secp256r1::Secp256r1FrParams::modulus_2 == param.modulus_2 &&
        secp256r1::Secp256r1FrParams::modulus_3 == param.modulus_3) {
        return ModulusId::SECP256R1_FR;
    }

    return ModulusId::UNKNOWN;
}

template void create_bigint_operations_constraint<UltraCircuitBuilder>(const BigIntOperation& input,
                                                                       DSLBigInts<UltraCircuitBuilder>& dsl_bigint);
template void create_bigint_operations_constraint<GoblinUltraCircuitBuilder>(
    const BigIntOperation& input, DSLBigInts<GoblinUltraCircuitBuilder>& dsl_bigint);
template void create_bigint_addition_constraint<UltraCircuitBuilder>(const BigIntOperation& input,
                                                                     DSLBigInts<UltraCircuitBuilder>& dsl_bigint);
template void create_bigint_addition_constraint<GoblinUltraCircuitBuilder>(
    const BigIntOperation& input, DSLBigInts<GoblinUltraCircuitBuilder>& dsl_bigint);
template void create_bigint_neg_constraint<UltraCircuitBuilder>(const BigIntOperation& input,
                                                                DSLBigInts<UltraCircuitBuilder>& dsl_bigint);
template void create_bigint_neg_constraint<GoblinUltraCircuitBuilder>(
    const BigIntOperation& input, DSLBigInts<GoblinUltraCircuitBuilder>& dsl_bigint);
template void create_bigint_mul_constraint<UltraCircuitBuilder>(const BigIntOperation& input,
                                                                DSLBigInts<UltraCircuitBuilder>& dsl_bigint);
template void create_bigint_mul_constraint<GoblinUltraCircuitBuilder>(
    const BigIntOperation& input, DSLBigInts<GoblinUltraCircuitBuilder>& dsl_bigint);
template void create_bigint_div_constraint<UltraCircuitBuilder>(const BigIntOperation& input,
                                                                DSLBigInts<UltraCircuitBuilder>& dsl_bigint);
template void create_bigint_div_constraint<GoblinUltraCircuitBuilder>(
    const BigIntOperation& input, DSLBigInts<GoblinUltraCircuitBuilder>& dsl_bigint);

template <typename Builder>
void create_bigint_addition_constraint(const BigIntOperation& input, DSLBigInts<Builder>& dsl_bigint)
{
    switch (dsl_bigint.get_modulus_id(input.lhs)) {
    case ModulusId::BN254_FR: {
        auto lhs = dsl_bigint.bn254_fr(input.lhs);
        auto rhs = dsl_bigint.bn254_fr(input.rhs);
        dsl_bigint.set_bn254_fr(lhs + rhs, input.result);
        break;
    }
    case ModulusId::BN254_FQ: {
        auto lhs = dsl_bigint.bn254_fq(input.lhs);
        auto rhs = dsl_bigint.bn254_fq(input.rhs);
        dsl_bigint.set_bn254_fq(lhs + rhs, input.result);
        break;
    }
    case ModulusId::SECP256K1_FQ: {
        auto lhs = dsl_bigint.secp256k1_fq(input.lhs);
        auto rhs = dsl_bigint.secp256k1_fq(input.rhs);
        dsl_bigint.set_secp256k1_fq(lhs + rhs, input.result);
        break;
    }
    case ModulusId::SECP256K1_FR: {
        auto lhs = dsl_bigint.secp256k1_fr(input.lhs);
        auto rhs = dsl_bigint.secp256k1_fr(input.rhs);
        dsl_bigint.set_secp256k1_fr(lhs + rhs, input.result);
        break;
    }
    case ModulusId::SECP256R1_FQ: {
        auto lhs = dsl_bigint.secp256r1_fq(input.lhs);
        auto rhs = dsl_bigint.secp256r1_fq(input.rhs);
        dsl_bigint.set_secp256r1_fq(lhs + rhs, input.result);
        break;
    }
    case ModulusId::SECP256R1_FR: {
        auto lhs = dsl_bigint.secp256r1_fr(input.lhs);
        auto rhs = dsl_bigint.secp256r1_fr(input.rhs);
        dsl_bigint.set_secp256r1_fr(lhs + rhs, input.result);
        break;
    }
    default: {
        ASSERT(false);
    }
    }
}

template <typename Builder>
void create_bigint_neg_constraint(const BigIntOperation& input, DSLBigInts<Builder>& dsl_bigint)
{
    switch (dsl_bigint.get_modulus_id(input.lhs)) {
    case ModulusId::BN254_FR: {
        auto lhs = dsl_bigint.bn254_fr(input.lhs);
        auto rhs = dsl_bigint.bn254_fr(input.rhs);
        dsl_bigint.set_bn254_fr(lhs - rhs, input.result);
        break;
    }
    case ModulusId::BN254_FQ: {
        auto lhs = dsl_bigint.bn254_fq(input.lhs);
        auto rhs = dsl_bigint.bn254_fq(input.rhs);
        dsl_bigint.set_bn254_fq(lhs - rhs, input.result);
        break;
    }
    case ModulusId::SECP256K1_FQ: {
        auto lhs = dsl_bigint.secp256k1_fq(input.lhs);
        auto rhs = dsl_bigint.secp256k1_fq(input.rhs);
        dsl_bigint.set_secp256k1_fq(lhs - rhs, input.result);
        break;
    }
    case ModulusId::SECP256K1_FR: {
        auto lhs = dsl_bigint.secp256k1_fr(input.lhs);
        auto rhs = dsl_bigint.secp256k1_fr(input.rhs);
        dsl_bigint.set_secp256k1_fr(lhs - rhs, input.result);
        break;
    }
    case ModulusId::SECP256R1_FQ: {
        auto lhs = dsl_bigint.secp256r1_fq(input.lhs);
        auto rhs = dsl_bigint.secp256r1_fq(input.rhs);
        dsl_bigint.set_secp256r1_fq(lhs - rhs, input.result);
        break;
    }
    case ModulusId::SECP256R1_FR: {
        auto lhs = dsl_bigint.secp256r1_fr(input.lhs);
        auto rhs = dsl_bigint.secp256r1_fr(input.rhs);
        dsl_bigint.set_secp256r1_fr(lhs - rhs, input.result);
        break;
    }
    default: {
        ASSERT(false);
    }
    }
}

template <typename Builder>
void create_bigint_mul_constraint(const BigIntOperation& input, DSLBigInts<Builder>& dsl_bigint)
{
    switch (dsl_bigint.get_modulus_id(input.lhs)) {
    case ModulusId::BN254_FR: {
        auto lhs = dsl_bigint.bn254_fr(input.lhs);
        auto rhs = dsl_bigint.bn254_fr(input.rhs);
        dsl_bigint.set_bn254_fr(lhs * rhs, input.result);
        break;
    }
    case ModulusId::BN254_FQ: {
        auto lhs = dsl_bigint.bn254_fq(input.lhs);
        auto rhs = dsl_bigint.bn254_fq(input.rhs);
        dsl_bigint.set_bn254_fq(lhs * rhs, input.result);
        break;
    }
    case ModulusId::SECP256K1_FQ: {
        auto lhs = dsl_bigint.secp256k1_fq(input.lhs);
        auto rhs = dsl_bigint.secp256k1_fq(input.rhs);
        dsl_bigint.set_secp256k1_fq(lhs * rhs, input.result);
        break;
    }
    case ModulusId::SECP256K1_FR: {
        auto lhs = dsl_bigint.secp256k1_fr(input.lhs);
        auto rhs = dsl_bigint.secp256k1_fr(input.rhs);
        dsl_bigint.set_secp256k1_fr(lhs * rhs, input.result);
        break;
    }
    case ModulusId::SECP256R1_FQ: {
        auto lhs = dsl_bigint.secp256r1_fq(input.lhs);
        auto rhs = dsl_bigint.secp256r1_fq(input.rhs);
        dsl_bigint.set_secp256r1_fq(lhs * rhs, input.result);
        break;
    }
    case ModulusId::SECP256R1_FR: {
        auto lhs = dsl_bigint.secp256r1_fr(input.lhs);
        auto rhs = dsl_bigint.secp256r1_fr(input.rhs);
        dsl_bigint.set_secp256r1_fr(lhs * rhs, input.result);
        break;
    }
    default: {
        ASSERT(false);
    }
    }
}

template <typename Builder>
void create_bigint_div_constraint(const BigIntOperation& input, DSLBigInts<Builder>& dsl_bigint)
{
    switch (dsl_bigint.get_modulus_id(input.lhs)) {
    case ModulusId::BN254_FR: {
        auto lhs = dsl_bigint.bn254_fr(input.lhs);
        auto rhs = dsl_bigint.bn254_fr(input.rhs);
        dsl_bigint.set_bn254_fr(lhs / rhs, input.result);
        break;
    }
    case ModulusId::BN254_FQ: {
        auto lhs = dsl_bigint.bn254_fq(input.lhs);
        auto rhs = dsl_bigint.bn254_fq(input.rhs);
        dsl_bigint.set_bn254_fq(lhs / rhs, input.result);
        break;
    }
    case ModulusId::SECP256K1_FQ: {
        auto lhs = dsl_bigint.secp256k1_fq(input.lhs);
        auto rhs = dsl_bigint.secp256k1_fq(input.rhs);
        dsl_bigint.set_secp256k1_fq(lhs / rhs, input.result);
        break;
    }
    case ModulusId::SECP256K1_FR: {
        auto lhs = dsl_bigint.secp256k1_fr(input.lhs);
        auto rhs = dsl_bigint.secp256k1_fr(input.rhs);
        dsl_bigint.set_secp256k1_fr(lhs / rhs, input.result);
        break;
    }
    case ModulusId::SECP256R1_FQ: {
        auto lhs = dsl_bigint.secp256r1_fq(input.lhs);
        auto rhs = dsl_bigint.secp256r1_fq(input.rhs);
        dsl_bigint.set_secp256r1_fq(lhs / rhs, input.result);
        break;
    }
    case ModulusId::SECP256R1_FR: {
        auto lhs = dsl_bigint.secp256r1_fr(input.lhs);
        auto rhs = dsl_bigint.secp256r1_fr(input.rhs);
        dsl_bigint.set_secp256r1_fr(lhs / rhs, input.result);
        break;
    }
    default: {
        ASSERT(false);
    }
    }
}

template <typename Builder>
void create_bigint_operations_constraint(const BigIntOperation& input, DSLBigInts<Builder>& dsl_bigint)
{
    switch (input.opcode) {
    case BigIntOperationType::Add: {
        create_bigint_addition_constraint<Builder>(input, dsl_bigint);
        break;
    }
    case BigIntOperationType::Neg: {
        create_bigint_neg_constraint<Builder>(input, dsl_bigint);
        break;
    }
    case BigIntOperationType::Mul: {
        create_bigint_mul_constraint<Builder>(input, dsl_bigint);
        break;
    }
    case BigIntOperationType::Div: {
        create_bigint_div_constraint<Builder>(input, dsl_bigint);
        break;
    }
    default: {
        ASSERT(false);
    }
    }
}

template <typename Builder>
void create_bigint_from_le_bytes_constraint(Builder& builder,
                                            const BigIntFromLeBytes& input,
                                            DSLBigInts<Builder>& dsl_bigints)
{
    using big_bn254_fq = bb::stdlib::bigfield<Builder, bb::Bn254FqParams>;
    using big_bn254_fr = bb::stdlib::bigfield<Builder, bb::Bn254FrParams>;
    using big_secp256k1_fq = bb::stdlib::bigfield<Builder, secp256k1::Secp256k1FqParams>;
    using big_secp256k1_fr = bb::stdlib::bigfield<Builder, secp256k1::Secp256k1FrParams>;
    using big_secp256r1_fq = bb::stdlib::bigfield<Builder, secp256r1::Secp256r1FqParams>;
    using big_secp256r1_fr = bb::stdlib::bigfield<Builder, secp256r1::Secp256r1FrParams>;
    using field_ct = bb::stdlib::field_t<Builder>;
    using byte_array_ct = bb::stdlib::byte_array<Builder>;

    // Construct the modulus from its bytes
    uint64_t modulus_64 = 0;
    uint64_t base = 1;
    std::vector<uint64_t> modulus_limbs;
    for (std::size_t i = 0; i < 32; ++i) {
        if (i < input.modulus.size()) {
            modulus_64 += input.modulus[i] * base;
            base = base * 256;
        }
        if (i % 8 == 0) {
            modulus_limbs.push_back(modulus_64);
            modulus_64 = 0;
        }
    }
    auto modulus = ModulusParam{ .modulus_0 = modulus_limbs[0],
                                 .modulus_1 = modulus_limbs[1],
                                 .modulus_2 = modulus_limbs[2],
                                 .modulus_3 = modulus_limbs[3] };
    bb::stdlib::byte_array<Builder> bytes;
    for (auto input : input.inputs) {
        field_ct element = field_ct::from_witness_index(&builder, input);
        byte_array_ct element_bytes(element, 1);
        bytes.write(element_bytes);
    }

    auto modulus_id = modulus_param_to_id(modulus);
    switch (modulus_id) {

    case BN254_FQ: {
        auto big = big_bn254_fq(bytes);
        dsl_bigints.set_bn254_fq(big, input.result);
        break;
    }
    case BN254_FR: {
        auto big = big_bn254_fr(bytes);
        dsl_bigints.set_bn254_fr(big, input.result);
        break;
    }
    case SECP256K1_FQ: {
        auto big = big_secp256k1_fq(bytes);
        dsl_bigints.set_secp256k1_fq(big, input.result);
        break;
    }
    case SECP256K1_FR: {
        auto big = big_secp256k1_fr(bytes);
        dsl_bigints.set_secp256k1_fr(big, input.result);
        break;
    }
    case SECP256R1_FQ: {
        auto big = big_secp256r1_fq(bytes);
        dsl_bigints.set_secp256r1_fq(big, input.result);
        break;
    }
    case SECP256R1_FR: {
        auto big = big_secp256r1_fr(bytes);
        dsl_bigints.set_secp256r1_fr(big, input.result);
        break;
    }
    case UNKNOWN:
    default:
        ASSERT(false);
        break;
    }
}

template <typename Builder>
void create_bigint_to_le_bytes_constraint(Builder& builder,
                                          const BigIntToLeBytes& input,
                                          DSLBigInts<Builder>& dsl_bigints)
{
    using big_bn254_fq = bb::stdlib::bigfield<Builder, bb::Bn254FqParams>;
    using big_bn254_fr = bb::stdlib::bigfield<Builder, bb::Bn254FrParams>;
    using big_secp256k1_fq = bb::stdlib::bigfield<Builder, secp256k1::Secp256k1FqParams>;
    using big_secp256k1_fr = bb::stdlib::bigfield<Builder, secp256k1::Secp256k1FrParams>;
    using big_secp256r1_fq = bb::stdlib::bigfield<Builder, secp256r1::Secp256r1FqParams>;
    using big_secp256r1_fr = bb::stdlib::bigfield<Builder, secp256r1::Secp256r1FrParams>;

    auto modulus_id = dsl_bigints.get_modulus_id(input.input);
    bb::stdlib::byte_array<Builder> byte_array;
    switch (modulus_id) {
    case BN254_FQ: {
        big_bn254_fq big = dsl_bigints.bn254_fq(input.input);
        byte_array = big.to_byte_array();

        break;
    }
    case BN254_FR: {
        big_bn254_fr big = dsl_bigints.bn254_fr(input.input);
        byte_array = big.to_byte_array();
        break;
    }
    case SECP256K1_FQ: {
        big_secp256k1_fq big = dsl_bigints.secp256k1_fq(input.input);
        byte_array = big.to_byte_array();
        break;
    }
    case SECP256K1_FR: {
        big_secp256k1_fr big = dsl_bigints.secp256k1_fr(input.input);
        byte_array = big.to_byte_array();
        break;
    }
    case SECP256R1_FQ: {
        big_secp256r1_fq big = dsl_bigints.secp256r1_fq(input.input);
        byte_array = big.to_byte_array();
        break;
    }
    case SECP256R1_FR: {
        big_secp256r1_fr big = dsl_bigints.secp256r1_fr(input.input);
        byte_array = big.to_byte_array();
        break;
    }
    case UNKNOWN:
    default:
        ASSERT(false);
        break;
    }
    for (size_t i = 0; i < input.result.size(); ++i) {
        builder.assert_equal(byte_array[i].normalize().witness_index, input.result[i]);
    }
}

template void create_bigint_from_le_bytes_constraint<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                                          const BigIntFromLeBytes& input,
                                                                          DSLBigInts<UltraCircuitBuilder>& dsl_bigints);
template void create_bigint_from_le_bytes_constraint<GoblinUltraCircuitBuilder>(
    GoblinUltraCircuitBuilder& builder,
    const BigIntFromLeBytes& input,
    DSLBigInts<GoblinUltraCircuitBuilder>& dsl_bigints);
template void create_bigint_to_le_bytes_constraint<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                                        const BigIntToLeBytes& input,
                                                                        DSLBigInts<UltraCircuitBuilder>& dsl_bigints);

template void create_bigint_to_le_bytes_constraint<GoblinUltraCircuitBuilder>(
    GoblinUltraCircuitBuilder& builder,
    const BigIntToLeBytes& input,
    DSLBigInts<GoblinUltraCircuitBuilder>& dsl_bigints);

} // namespace acir_format
