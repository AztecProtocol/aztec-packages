// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "../circuit_builders/circuit_builders.hpp"
#include "barretenberg/common/assert.hpp"
#include "uint.hpp"

using namespace bb;

namespace bb::stdlib {

using namespace bb::plookup;

template <typename Builder, typename Native>
uint<Builder, Native> uint<Builder, Native>::operator&(const uint& other) const
{
    return logic_operator(other, LogicOp::AND);
}

template <typename Builder, typename Native>
uint<Builder, Native> uint<Builder, Native>::operator^(const uint& other) const
{
    return logic_operator(other, LogicOp::XOR);
}

template <typename Builder, typename Native>
uint<Builder, Native> uint<Builder, Native>::operator|(const uint& other) const
{
    return (*this + other) - (*this & other);
}

template <typename Builder, typename Native> uint<Builder, Native> uint<Builder, Native>::operator~() const
{
    return uint(context, MASK) - *this;
}

template <typename Builder, typename Native>
uint<Builder, Native> uint<Builder, Native>::operator>>(const size_t shift) const
{
    if (shift >= width) {
        return uint(context, 0);
    }
    if (is_constant()) {
        return uint(context, (additive_constant >> shift) & MASK);
    }

    if (witness_status != WitnessStatus::OK) {
        normalize();
    }

    if (shift == 0) {
        return *this;
    }

    uint64_t bits_per_hi_limb;
    // last limb will not likely bit `bits_per_limb`. Need to be careful with our range check
    if (shift >= ((width / bits_per_limb) * bits_per_limb)) {
        bits_per_hi_limb = width % bits_per_limb;
    } else {
        bits_per_hi_limb = bits_per_limb;
    }
    const uint64_t slice_bit_position = shift % bits_per_limb;
    const size_t accumulator_index = shift / bits_per_limb;
    const uint32_t slice_index = accumulators[accumulator_index];
    const uint64_t slice_value = uint256_t(context->get_variable(slice_index)).data[0];

    const uint64_t slice_lo = slice_value % (1ULL << slice_bit_position);
    const uint64_t slice_hi = slice_value >> slice_bit_position;
    const uint32_t slice_lo_idx = slice_bit_position ? context->add_variable(slice_lo) : context->zero_idx;
    const uint32_t slice_hi_idx =
        (slice_bit_position != bits_per_limb) ? context->add_variable(slice_hi) : context->zero_idx;

    context->create_big_add_gate(
        { slice_index, slice_lo_idx, context->zero_idx, slice_hi_idx, -1, 1, 0, (1 << slice_bit_position), 0 });

    if (slice_bit_position != 0) {
        context->create_new_range_constraint(slice_lo_idx, (1ULL << slice_bit_position) - 1);
    }
    context->create_new_range_constraint(slice_hi_idx, (1ULL << (bits_per_hi_limb - slice_bit_position)) - 1);
    std::vector<field_t<Builder>> sublimbs;
    sublimbs.emplace_back(field_t<Builder>::from_witness_index(context, slice_hi_idx));

    const size_t start = accumulator_index + 1;
    field_t<Builder> coefficient(context, uint64_t(1ULL << (start * bits_per_limb - shift)));
    field_t<Builder> shifter(context, uint64_t(1ULL << bits_per_limb));
    for (size_t i = accumulator_index + 1; i < num_accumulators(); ++i) {
        sublimbs.emplace_back(field_t<Builder>::from_witness_index(context, accumulators[i]) *
                              field_t<Builder>(coefficient));
        coefficient *= shifter;
    }

    uint32_t result_index = field_t<Builder>::accumulate(sublimbs).get_witness_index();
    uint result(context);
    result.witness_index = result_index;
    result.witness_status = WitnessStatus::WEAK_NORMALIZED;
    return result;
}

template <typename Builder, typename Native>
uint<Builder, Native> uint<Builder, Native>::operator<<(const size_t shift) const
{
    if (shift >= width) {
        return uint(context, 0);
    }
    if (is_constant()) {
        return uint(context, (additive_constant << shift) & MASK);
    }

    if (witness_status != WitnessStatus::OK) {
        normalize();
    }

    if (shift == 0) {
        return *this;
    }

    uint64_t slice_bit_position;
    size_t accumulator_index;
    size_t bits_per_hi_limb;
    // most significant limb is only 2 bits long (for u32), need to be careful about which slice we index,
    // and how large the range check is on our hi limb
    if (shift < (width - ((width / bits_per_limb) * bits_per_limb))) {
        bits_per_hi_limb = width % bits_per_limb;
        slice_bit_position = bits_per_hi_limb - (shift % bits_per_hi_limb);
        accumulator_index = num_accumulators() - 1;
    } else {
        const size_t offset = width % bits_per_limb;
        slice_bit_position = bits_per_limb - ((shift - offset) % bits_per_limb);
        accumulator_index = num_accumulators() - 2 - ((shift - offset) / bits_per_limb);
        bits_per_hi_limb = bits_per_limb;
    }

    const uint32_t slice_index = accumulators[accumulator_index];
    const uint64_t slice_value = uint256_t(context->get_variable(slice_index)).data[0];

    const uint64_t slice_lo = slice_value % (1ULL << slice_bit_position);
    const uint64_t slice_hi = slice_value >> slice_bit_position;
    const uint32_t slice_lo_idx = slice_bit_position ? context->add_variable(slice_lo) : context->zero_idx;
    const uint32_t slice_hi_idx =
        (slice_bit_position != bits_per_hi_limb) ? context->add_variable(slice_hi) : context->zero_idx;

    context->create_big_add_gate(
        { slice_index, slice_lo_idx, context->zero_idx, slice_hi_idx, -1, 1, 0, (1 << slice_bit_position), 0 });

    context->create_new_range_constraint(slice_lo_idx, (1ULL << slice_bit_position) - 1);

    if (slice_bit_position != bits_per_limb) {
        context->create_new_range_constraint(slice_hi_idx, (1ULL << (bits_per_hi_limb - slice_bit_position)) - 1);
    }

    std::vector<field_t<Builder>> sublimbs;
    sublimbs.emplace_back(field_t<Builder>::from_witness_index(context, slice_lo_idx) *
                          field_t<Builder>(context, 1ULL << ((accumulator_index)*bits_per_limb + shift)));

    field_t<Builder> coefficient(context, uint64_t(1ULL << shift));
    field_t<Builder> shifter(context, uint64_t(1ULL << bits_per_limb));
    for (size_t i = 0; i < accumulator_index; ++i) {
        sublimbs.emplace_back(field_t<Builder>::from_witness_index(context, accumulators[i]) *
                              field_t<Builder>(coefficient));
        coefficient *= shifter;
    }

    uint32_t result_index = field_t<Builder>::accumulate(sublimbs).get_witness_index();
    uint result(context);
    result.witness_index = result_index;
    result.witness_status = WitnessStatus::WEAK_NORMALIZED;
    return result;
}

template <typename Builder, typename Native>
uint<Builder, Native> uint<Builder, Native>::ror(const size_t target_rotation) const
{
    const size_t rotation = target_rotation & (width - 1);

    const auto rotate = [](const uint256_t input, const uint64_t rot) {
        uint256_t r0 = (input >> rot);
        uint256_t r1 = (input << (width - rot)) & MASK;
        return (rot > 0) ? (r0 + r1) : input;
    };

    if (is_constant()) {
        return uint(context, rotate(additive_constant, rotation));
    }

    if (witness_status != WitnessStatus::OK) {
        normalize();
    }

    if (rotation == 0) {
        return *this;
    }

    const size_t shift = rotation;
    uint64_t bits_per_hi_limb;
    // last limb will not likely bit `bits_per_limb`. Need to be careful with our range check
    if (shift >= ((width / bits_per_limb) * bits_per_limb)) {
        bits_per_hi_limb = width % bits_per_limb;
    } else {
        bits_per_hi_limb = bits_per_limb;
    }
    const uint64_t slice_bit_position = shift % bits_per_limb;
    const size_t accumulator_index = shift / bits_per_limb;
    const uint32_t slice_index = accumulators[accumulator_index];
    const uint64_t slice_value = uint256_t(context->get_variable(slice_index)).data[0];

    const uint64_t slice_lo = slice_value % (1ULL << slice_bit_position);
    const uint64_t slice_hi = slice_value >> slice_bit_position;
    const uint32_t slice_lo_idx = slice_bit_position ? context->add_variable(slice_lo) : context->zero_idx;
    const uint32_t slice_hi_idx =
        (slice_bit_position != bits_per_limb) ? context->add_variable(slice_hi) : context->zero_idx;

    context->create_big_add_gate(
        { slice_index, slice_lo_idx, context->zero_idx, slice_hi_idx, -1, 1, 0, (1 << slice_bit_position), 0 });

    if (slice_bit_position != 0) {
        context->create_new_range_constraint(slice_lo_idx, (1ULL << slice_bit_position) - 1);
    }
    context->create_new_range_constraint(slice_hi_idx, (1ULL << (bits_per_hi_limb - slice_bit_position)) - 1);
    std::vector<field_t<Builder>> sublimbs;
    sublimbs.emplace_back(field_t<Builder>::from_witness_index(context, slice_hi_idx));

    const size_t start = accumulator_index + 1;
    field_t<Builder> coefficient(context, uint64_t(1ULL << (start * bits_per_limb - shift)));
    field_t<Builder> shifter(context, uint64_t(1ULL << bits_per_limb));
    for (size_t i = accumulator_index + 1; i < num_accumulators(); ++i) {
        sublimbs.emplace_back(field_t<Builder>::from_witness_index(context, accumulators[i]) *
                              field_t<Builder>(coefficient));
        coefficient *= shifter;
    }

    coefficient = field_t<Builder>(context, uint64_t(1ULL << (width - shift)));
    for (size_t i = 0; i < accumulator_index; ++i) {
        sublimbs.emplace_back(field_t<Builder>::from_witness_index(context, accumulators[i]) *
                              field_t<Builder>(coefficient));
        coefficient *= shifter;
    }
    sublimbs.emplace_back(field_t<Builder>::from_witness_index(context, slice_lo_idx) * field_t<Builder>(coefficient));

    uint32_t result_index = field_t<Builder>::accumulate(sublimbs).get_witness_index();
    uint result(context);
    result.witness_index = result_index;
    result.witness_status = WitnessStatus::WEAK_NORMALIZED;
    return result;
}

template <typename Builder, typename Native>
uint<Builder, Native> uint<Builder, Native>::rol(const size_t target_rotation) const
{
    return ror(width - (target_rotation & (width - 1)));
}

template <typename Builder, typename Native>
uint<Builder, Native> uint<Builder, Native>::logic_operator(const uint& other, const LogicOp op_type) const
{
    Builder* ctx = (context == nullptr) ? other.context : context;

    // we need to ensure that we can decompose our integers into (width / 2) quads
    // we don't need to completely normalize, however, as our quaternary decomposition will do that by default
    const uint256_t lhs = get_value();
    const uint256_t rhs = other.get_value();
    uint256_t out = 0;

    switch (op_type) {
    case AND: {
        out = lhs & rhs;
        break;
    }
    case XOR: {
        out = lhs ^ rhs;
        break;
    }
    default: {
    }
    }

    if (is_constant() && other.is_constant()) {
        return uint<Builder, Native>(ctx, out);
    }

    // We need to decide which lookup table to use based on the native type and operation type.
    MultiTableId multi_table_id;
    if constexpr (std::is_same_v<Native, uint64_t>) {
        multi_table_id = (op_type == XOR) ? MultiTableId::UINT64_XOR : MultiTableId::UINT64_AND;
    } else if constexpr (std::is_same_v<Native, uint32_t>) {
        multi_table_id = (op_type == XOR) ? MultiTableId::UINT32_XOR : MultiTableId::UINT32_AND;
    } else if constexpr (std::is_same_v<Native, uint16_t>) {
        multi_table_id = (op_type == XOR) ? MultiTableId::UINT16_XOR : MultiTableId::UINT16_AND;
    } else if constexpr (std::is_same_v<Native, uint8_t>) {
        multi_table_id = (op_type == XOR) ? MultiTableId::UINT8_XOR : MultiTableId::UINT8_AND;
    } else {
        throw_or_abort("unsupported native type for stdlib uint operation.");
    }

    // We allow the uint types to contain unbounded values (for example, uint32_t can hold values > 2^32).
    // When looking them up in the lookup tables though, we don't need to range-constrain them because the lookup
    // operation itself acts as an implicit range-check. If the inputs are out of range, the lookup constraint will
    // fail, i.e., the values in lookup gates don't match the values in the actual lookup table.
    // Construct the lookup keys from the uints.
    field_t<Builder> key_left = field_t<Builder>::from_witness_index(context, witness_index);
    key_left.additive_constant = is_constant() ? fr(additive_constant) : fr::zero();
    field_t<Builder> key_right = field_t<Builder>::from_witness_index(context, other.witness_index);
    key_right.additive_constant = other.is_constant() ? fr(other.additive_constant) : fr::zero();

    // Perform the lookup to get the accumulators.
    ReadData<field_t<Builder>> lookup =
        plookup_read<Builder>::get_lookup_accumulators(multi_table_id, key_left, key_right, true);

    uint<Builder, Native> result(ctx);
    // result.accumulators.resize(num_accumulators());
    field_t<Builder> scaling_factor(context, bb::fr(1ULL << bits_per_limb));

    // N.B. THIS LOOP ONLY WORKS IF THE LOGIC TABLE SLICE SIZE IS HALF THAT OF `bits_per_limb`
    ASSERT(num_accumulators() == (lookup[ColumnIdx::C3].size() + 1) / 2,
           "uint::logic num of accumulators must be half of num of lookups.");

    for (size_t i = 0; i < num_accumulators(); ++i) {

        /**
         * we can extract a slice value, by taking the relative difference between accumulating sums.
         * each table row sums a 6-bit slice into an accumulator, we need to take the difference between slices in jumps
         *of 2, to get a 12-bit slice
         *
         * If our output limbs are b0, b1, b2, b3, b4, b5, our lookup[ColumnIdx::C3] values represent:
         * (where X = 2^6)
         *   | c0 | b0 + X.b1 + X.X.b2 + X.X.X.b3 + X.X.X.X.b4 + X.X.X.X.X.b5
         *   | c1 |        b1 +   X.b2 +   X.X.b3 +   X.X.X.b4 +   X.X.X.X.b5
         *   | c2 |                 b2 +   X.  b3 +     X.X.b4 +     X.X.X.b5
         *   | c3 |                            b3 +       X.b4 +       X.X.b5
         *   | c4 |                                         b4 +         X.b5
         *   | c5 |                                                        b5
         *
         *
         * We want in our accumulators:
         *
         *   | acc[0] | c0 - X.X.c2 |
         *   | acc[1] | c2 - X.X.c4 |
         *   | acc[2] | c4          |
         **/

        if (i != (num_accumulators() - 1)) {
            result.accumulators.emplace_back(
                (lookup[ColumnIdx::C3][2 * i] - (lookup[ColumnIdx::C3][2 * (i + 1)] * scaling_factor)).witness_index);
        } else {
            result.accumulators.emplace_back(lookup[ColumnIdx::C3][2 * (num_accumulators() - 1)].witness_index);
        }
    }

    result.witness_index = lookup[ColumnIdx::C3][0].get_witness_index();
    result.witness_status = WitnessStatus::OK;
    return result;
}

template class uint<bb::UltraCircuitBuilder, uint8_t>;
template class uint<bb::MegaCircuitBuilder, uint8_t>;
template class uint<bb::UltraCircuitBuilder, uint16_t>;
template class uint<bb::MegaCircuitBuilder, uint16_t>;
template class uint<bb::UltraCircuitBuilder, uint32_t>;
template class uint<bb::MegaCircuitBuilder, uint32_t>;
template class uint<bb::UltraCircuitBuilder, uint64_t>;
template class uint<bb::MegaCircuitBuilder, uint64_t>;

} // namespace bb::stdlib
