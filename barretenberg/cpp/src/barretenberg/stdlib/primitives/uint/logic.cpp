// === AUDIT STATUS ===
// internal:    { status: done, auditors: [suyash], date: 2025-07-23 }
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

    // Normalize before shifting.
    normalize();

    if (shift == 0) {
        return *this;
    }

    // Example for uint32_t:
    //
    //      |<------  acc[2]  ------>||<-----------   acc[1]  ----------->||<-------  acc[0]  ------->|
    // val: [ 31 30 29 28 27 26 25 24  23 22 21 20 19 18 17 16 15 14 13 12  11 10 9 8 7 6 5 4 3 2 1 0 ]
    //                                                         ↑
    //      [<---------------        keep        --------------->][<--------     discard     -------->]
    //
    // out: [ 31 30 29 28 27 26 25 24  23 22 21 20 19 18 17 16 15 ]
    //      |<------  acc[2]  ------>||<-----   acc[1].hi   ----->|
    //
    // Suppose the shift is 15, then we must discard the 15 least significant bits of the accumulator.
    // The accumulator is split into three parts, so we clearly need to split acc[1]. On splitting, we must
    // discard the lower slice of acc[1] and keep the upper slice. Thus, the updated uint value will be:
    //
    // acc[1].hi + (acc[2] << (24 - 15))
    //
    // Let us first fetch the accumlator that needs to be sliced.
    const size_t accumulator_index = shift / bits_per_limb;
    const uint32_t slice_witness_index = accumulators[accumulator_index];
    const field_t<Builder> acc_to_be_sliced = field_t<Builder>::from_witness_index(context, slice_witness_index);

    // Now, lets calculate:
    // (i) bit position (from lsb) at which we need to slice.
    // (ii) number of bits in the slice based on whether it is the highest slice or not.
    const size_t slice_bit_position = shift % bits_per_limb;
    const bool is_slice_hi = (accumulator_index == num_accumulators() - 1);
    const uint8_t num_bits_per_limb = is_slice_hi ? bits_in_high_limb : bits_per_limb;

    // Finally, we can slice the accumulator.
    // The slice_hi will be the upper slice of the accumulator, which we will keep.
    // The slice_lo will be the lower slice of the accumulator, which we will discard.
    // Its important to note that although slice_lo is not used here, it is still created and properly constrained
    // in the split_at function.
    field_t<Builder> slice_hi = acc_to_be_sliced.split_at(slice_bit_position, num_bits_per_limb).second;

    // Now we reconstruct the shifted uint value.
    std::vector<field_t<Builder>> sublimbs;
    sublimbs.emplace_back(slice_hi);

    const size_t start = accumulator_index + 1;
    field_t<Builder> coefficient(context, uint64_t(1ULL << (start * bits_per_limb - shift)));
    field_t<Builder> shifter(context, uint64_t(1ULL << bits_per_limb));
    for (size_t i = accumulator_index + 1; i < num_accumulators(); ++i) {
        sublimbs.emplace_back(field_t<Builder>::from_witness_index(context, accumulators[i]) * coefficient);
        coefficient *= shifter;
    }

    uint32_t result_index = field_t<Builder>::accumulate(sublimbs).get_witness_index();
    uint result(context);
    result.witness_index = result_index;
    result.normalize();
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

    // Normalize before shifting.
    normalize();

    if (shift == 0) {
        return *this;
    }

    // Example for uint32_t:
    //
    //      |<------  acc[2]  ------->||<-----------   acc[1]  ----------->||<-------  acc[0]  ------->|
    // val: [ 31 30 29 28 27 26 25  24  23 22 21 20 19 18 17 16 15 14 13 12  11 10 9 8 7 6 5 4 3 2 1 0 ]
    //                          ↑
    //      [<----  discard  ---->][<----------------------        keep        ----------------------->]
    //
    // out: [       24        23 22 21 20 19 18 17 16 15 14 13 12  11 10 9 8 7 6 5 4 3 2 1 0 ]
    //      [<- acc[2].lo ->||<-----------   acc[1]  ----------->||<-------  acc[0]  ------->|
    //
    // Suppose the shift is 7, then we must discard the 7 most significant bits of the accumulator, and move
    // the remaining bits to the left. The accumulator is split into three parts, so in this case we clearly
    // need to split acc[2]. On splitting, we must discard the higher slice of acc[2] and keep the lower slice.
    // Thus, the updated uint value will be:
    //
    // (acc[2].lo << (24 + 7))  +  (acc[1] << (12 + 7))  +  (acc[0] << 7)
    //
    // Let us first fetch the accumulator that needs to be sliced.
    // We will do so by adjusting the shift from the most-significant bit.
    size_t adjusted_shift = width - shift;
    const size_t accumulator_index = adjusted_shift / bits_per_limb;
    const uint32_t slice_witness_index = accumulators[accumulator_index];
    const field_t<Builder> acc_to_be_sliced = field_t<Builder>::from_witness_index(context, slice_witness_index);

    // Now, lets calculate:
    // (i) bit position (from lsb) at which we need to slice.
    // (ii) number of bits in the slice based on whether it is the highest slice or not.
    const bool is_slice_hi = (accumulator_index == num_accumulators() - 1);
    const size_t slice_bit_position = adjusted_shift % bits_per_limb;
    const uint8_t num_bits_per_limb = is_slice_hi ? bits_in_high_limb : bits_per_limb;

    // We can now slice the accumulator.
    field_t<Builder> slice_lo = acc_to_be_sliced.split_at(slice_bit_position, num_bits_per_limb).first;

    // Now we reconstruct the shifted uint value.
    std::vector<field_t<Builder>> sublimbs;
    sublimbs.emplace_back(slice_lo * field_t<Builder>(context, 1ULL << ((accumulator_index * bits_per_limb) + shift)));

    field_t<Builder> coefficient(context, uint64_t(1ULL << shift));
    field_t<Builder> shifter(context, uint64_t(1ULL << bits_per_limb));
    for (size_t i = 0; i < accumulator_index; ++i) {
        sublimbs.emplace_back(field_t<Builder>::from_witness_index(context, accumulators[i]) * coefficient);
        coefficient *= shifter;
    }

    uint32_t result_index = field_t<Builder>::accumulate(sublimbs).get_witness_index();
    uint result(context);
    result.witness_index = result_index;
    result.normalize();
    return result;
}

template <typename Builder, typename Native>
uint<Builder, Native> uint<Builder, Native>::ror(const size_t target_rotation) const
{
    // Note: width is always a power of two, so we can use bitwise AND.
    const size_t rotation = target_rotation & (width - 1);

    const auto rotate = [](const uint256_t input, const uint64_t rot) {
        uint256_t r0 = (input >> rot);
        uint256_t r1 = (input << (width - rot)) & MASK;
        return (rot > 0) ? (r0 + r1) : input;
    };

    if (is_constant()) {
        return uint(context, rotate(additive_constant, rotation));
    }

    // Normalize before ror.
    normalize();

    if (rotation == 0) {
        return *this;
    }

    // Example for uint32_t:
    //
    //      |<------  acc[2]  ------>||<-----------   acc[1]  ----------->||<-------  acc[0]  ------->|
    // val: [ 31 30 29 28 27 26 25 24  23 22 21 20 19 18 17 16 15 14 13 12  11 10 9 8 7 6 5 4 3 2 1 0 ]
    //                                                         ↑
    //      [<---------------        keep        --------------->][<--------  right rotate   -------->]
    //
    // out: [  14   13   12   11 10 9 8 7 6 5 4 3 2 1 0 ] [ 31 30 29 28 27 26 25 24  23 22 21 20 19 18 17 16 15 ]
    //      [<- acc[1].lo ->||<-------  acc[0]  ------->| |<------  acc[2]  ------>||<-----   acc[1].hi  ------>]
    //
    // Suppose the right-rotation is 15 (i.e., rotate = 15), then we must right-rotate the 15 least
    // significant bits of the accumulator. The accumulator is split into three parts, so in this case we need to split
    // acc[1]. On splitting, we must "rotate" the lower slice of acc[1] and keep the upper slice. Thus, the updated uint
    // value will be:
    //
    // acc[1].hi + (acc[2] << (24 - 15)) + (acc[0] >> (32 - 15)) + (acc[1].lo >> (32 - 15 + 12))
    //
    // Let us first fetch the accumlator that needs to be sliced.
    size_t shift = rotation;
    const size_t accumulator_index = shift / bits_per_limb;
    const uint32_t slice_witness_index = accumulators[accumulator_index];
    const field_t<Builder> acc_to_be_sliced = field_t<Builder>::from_witness_index(context, slice_witness_index);

    // Now, lets calculate:
    // (i) bit position (from lsb) at which we need to slice.
    // (ii) number of bits in the slice based on whether it is the highest slice or not.
    const size_t slice_bit_position = shift % bits_per_limb;
    const bool is_slice_hi = (accumulator_index == num_accumulators() - 1);
    const uint8_t num_bits_per_limb = is_slice_hi ? bits_in_high_limb : bits_per_limb;

    // Finally, we can slice the accumulator.
    auto [slice_lo, slice_hi] = acc_to_be_sliced.split_at(slice_bit_position, num_bits_per_limb);

    // Now we reconstruct the shifted uint value.
    std::vector<field_t<Builder>> sublimbs;
    sublimbs.emplace_back(slice_hi);

    const size_t start = accumulator_index + 1;
    field_t<Builder> coefficient(context, uint64_t(1ULL << (start * bits_per_limb - shift)));
    field_t<Builder> shifter(context, uint64_t(1ULL << bits_per_limb));
    for (size_t i = accumulator_index + 1; i < num_accumulators(); ++i) {
        sublimbs.emplace_back(field_t<Builder>::from_witness_index(context, accumulators[i]) * coefficient);
        coefficient *= shifter;
    }

    coefficient = field_t<Builder>(context, uint64_t(1ULL << (width - shift)));
    for (size_t i = 0; i < accumulator_index; ++i) {
        sublimbs.emplace_back(field_t<Builder>::from_witness_index(context, accumulators[i]) * coefficient);
        coefficient *= shifter;
    }
    sublimbs.emplace_back(slice_lo * field_t<Builder>(coefficient));

    uint32_t result_index = field_t<Builder>::accumulate(sublimbs).get_witness_index();
    uint result(context);
    result.witness_index = result_index;
    result.normalize();
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

    // Since we reconstruct accumulators from the lookup table, we don't need to normalize them here.
    result.witness_index = lookup[ColumnIdx::C3][0].get_witness_index();
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
