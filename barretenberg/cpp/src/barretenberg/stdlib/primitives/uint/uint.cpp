// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "uint.hpp"
#include "../circuit_builders/circuit_builders.hpp"

namespace bb::stdlib {

template <typename Builder, typename Native>
std::vector<uint32_t> uint<Builder, Native>::constrain_accumulators(Builder* context,
                                                                    const uint32_t witness_index) const
{
    std::vector<uint32_t> res = context->decompose_into_default_range(witness_index, width, bits_per_limb);
    return res;
}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(const witness_t<Builder>& other)
    : context(other.context)
    , witness_status(WitnessStatus::OK)
{
    if (other.is_constant()) {
        additive_constant = other.witness;
        witness_index = IS_CONSTANT;
    } else {
        accumulators = constrain_accumulators(context, other.witness_index);
        witness_index = other.witness_index;
    }
}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(const field_t<Builder>& other)
    : context(other.context)
    , additive_constant(0)
    , witness_status(WitnessStatus::OK)
{
    if (other.is_constant()) {
        additive_constant = other.additive_constant;
        witness_index = IS_CONSTANT;
    } else {
        field_t<Builder> norm = other.normalize();
        accumulators = constrain_accumulators(context, norm.get_witness_index());
        witness_index = norm.get_witness_index();
    }
}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(Builder* builder, const uint256_t& value)
    : context(builder)
    , additive_constant(value)
    , witness_status(WitnessStatus::OK)
    , witness_index(IS_CONSTANT)
{}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(const uint256_t& value)
    : context(nullptr)
    , additive_constant(value)
    , witness_status(WitnessStatus::OK)
    , witness_index(IS_CONSTANT)
{}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(const byte_array<Builder>& other)
    : context(other.get_context())
    , additive_constant(0)
    , witness_status(WitnessStatus::WEAK_NORMALIZED)
    , witness_index(IS_CONSTANT)
{
    field_t<Builder> accumulator(context, fr::zero());
    field_t<Builder> scaling_factor(context, fr::one());
    const auto& bytes = other.bytes();
    const size_t num_bytes = bytes.size();

    // Process pairs of bytes from the end of the byte array.
    for (size_t i = 0; i < (num_bytes / 2); ++i) {
        const field_t<Builder> even_scaling_factor = scaling_factor;
        const field_t<Builder> odd_scaling_factor = scaling_factor * fr(256);
        accumulator = accumulator.add_two(bytes[num_bytes - 1 - (2 * i)] * even_scaling_factor,
                                          bytes[num_bytes - 1 - (2 * i + 1)] * odd_scaling_factor);

        scaling_factor = scaling_factor * fr(256 * 256); // Scale by (2^8 * 2^8).
    }

    // Process the last byte if the byte array has an odd number of bytes.
    if (num_bytes % 2 == 1) {
        const field_t<Builder>& last_byte = bytes[0];
        accumulator = accumulator + (scaling_factor * last_byte);
    }

    // Normalize the accumulator and set the witness index or additive constant.
    accumulator = accumulator.normalize();
    if (accumulator.is_constant()) {
        additive_constant = uint256_t(accumulator.additive_constant);
    } else {
        witness_index = accumulator.witness_index;
    }
}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(Builder* parent_context, const std::array<bool_t<Builder>, width>& wires)
    : uint<Builder, Native>(parent_context, std::vector<bool_t<Builder>>(wires.begin(), wires.end()))
{}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(Builder* parent_context, const std::vector<bool_t<Builder>>& wires)
    : context(parent_context)
    , additive_constant(0)
    , witness_status(WitnessStatus::WEAK_NORMALIZED)
    , witness_index(IS_CONSTANT)
{
    field_t<Builder> accumulator(context, fr::zero());
    field_t<Builder> scaling_factor(context, fr::one());
    const size_t num_wires = wires.size();

    for (size_t i = 0; i < (num_wires / 2); ++i) {
        const field_t<Builder> even_scaling_factor = scaling_factor;
        const field_t<Builder> odd_scaling_factor = scaling_factor * fr(2);

        accumulator = accumulator.add_two(field_t<Builder>(wires[2 * i]) * even_scaling_factor,
                                          field_t<Builder>(wires[2 * i + 1]) * odd_scaling_factor);

        scaling_factor = scaling_factor * fr(4); // Scale by (2^1 * 2^1).
    }

    // Process the last wire if the number of wires is odd.
    if (num_wires % 2 == 1) {
        const field_t<Builder>& last_wire = field_t<Builder>(wires[num_wires - 1]);
        accumulator = accumulator + (scaling_factor * last_wire);
    }

    // Normalize the accumulator and set the witness index or additive constant.
    accumulator = accumulator.normalize();
    if (accumulator.is_constant()) {
        additive_constant = uint256_t(accumulator.additive_constant);
    } else {
        witness_index = accumulator.witness_index;
    }
}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(const uint& other)
    : context(other.context)
    , additive_constant(other.additive_constant)
    , witness_status(other.witness_status)
    , accumulators(other.accumulators)
    , witness_index(other.witness_index)
{}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(uint&& other) noexcept
    : context(other.context)
    , additive_constant(other.additive_constant)
    , witness_status(other.witness_status)
    , accumulators(other.accumulators)
    , witness_index(other.witness_index)
{}

template <typename Builder, typename Native> uint<Builder, Native>& uint<Builder, Native>::operator=(const uint& other)
{
    if (this == &other) {
        return *this;
    }
    context = other.context;
    additive_constant = other.additive_constant;
    witness_status = other.witness_status;
    accumulators = other.accumulators;
    witness_index = other.witness_index;
    return *this;
}

template <typename Builder, typename Native>
uint<Builder, Native>& uint<Builder, Native>::operator=(uint&& other) noexcept
{
    context = other.context;
    additive_constant = other.additive_constant;
    witness_status = other.witness_status;
    accumulators = other.accumulators;
    witness_index = other.witness_index;
    return *this;
}

template <typename Context, typename Native> uint<Context, Native>::operator field_t<Context>() const
{
    normalize();
    field_t<Context> target(context);
    target.witness_index = witness_index;
    target.additive_constant = is_constant() ? fr(additive_constant) : fr::zero();
    return target;
}

template <typename Context, typename Native> uint<Context, Native>::operator byte_array<Context>() const
{
    return byte_array<Context>(static_cast<field_t<Context>>(*this), width / 8);
}

template <typename Builder, typename Native> uint<Builder, Native> uint<Builder, Native>::normalize() const
{
    if (!context || is_constant()) {
        return *this;
    }

    if (witness_status == WitnessStatus::WEAK_NORMALIZED) {
        accumulators = constrain_accumulators(context, witness_index);
        witness_status = WitnessStatus::OK;
    }
    return *this;
}

template <typename Builder, typename Native> uint256_t uint<Builder, Native>::get_value() const
{
    if (!context || is_constant()) {
        return additive_constant;
    }
    return (uint256_t(context->get_variable(witness_index))) & MASK;
}

template <typename Builder, typename Native> uint256_t uint<Builder, Native>::get_unbounded_value() const
{
    if (!context || is_constant()) {
        return additive_constant;
    }
    return (uint256_t(context->get_variable(witness_index)));
}

template <typename Builder, typename Native> bool_t<Builder> uint<Builder, Native>::at(const size_t bit_index) const
{
    if (is_constant()) {
        return bool_t<Builder>(context, get_value().get_bit(bit_index));
    }
    if (witness_status != WitnessStatus::OK) {
        normalize();
    }

    const uint64_t slice_bit_position = bit_index % bits_per_limb;

    const uint32_t slice_index = accumulators[bit_index / bits_per_limb];
    const uint64_t slice_value = uint256_t(context->get_variable(slice_index)).data[0];

    const uint64_t slice_lo = slice_value % (1ULL << slice_bit_position);
    const uint64_t bit_value = (slice_value >> slice_bit_position) & 1ULL;
    const uint64_t slice_hi = slice_value >> (slice_bit_position + 1);

    const uint32_t slice_lo_idx = slice_bit_position ? context->add_variable(slice_lo) : context->zero_idx;
    const uint32_t bit_idx = context->add_variable(bit_value);
    const uint32_t slice_hi_idx =
        (slice_bit_position + 1 != bits_per_limb) ? context->add_variable(slice_hi) : context->zero_idx;

    context->create_big_add_gate({ slice_index,
                                   slice_lo_idx,
                                   bit_idx,
                                   slice_hi_idx,
                                   -1,
                                   1,
                                   (1 << slice_bit_position),
                                   (1 << (slice_bit_position + 1)),
                                   0 });

    if (slice_bit_position != 0) {
        context->create_new_range_constraint(slice_lo_idx, (1ULL << slice_bit_position) - 1);
    }
    if (slice_bit_position + 1 != bits_per_limb) {
        context->create_new_range_constraint(slice_hi_idx, (1ULL << (bits_per_limb - (slice_bit_position + 1))) - 1);
    }
    bool_t<Builder> result = witness_t<Builder>(context, bit_value);
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
