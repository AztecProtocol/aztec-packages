// === AUDIT STATUS ===
// internal:    { status: done, auditors: [suyash], date: 2025-07-23 }
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
    , accumulators()
    , witness_index(IS_CONSTANT)
{}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(const uint256_t& value)
    : context(nullptr)
    , additive_constant(value)
    , accumulators()
    , witness_index(IS_CONSTANT)
{}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(const byte_array<Builder>& other)
    : context(other.get_context())
    , additive_constant(0)
    , accumulators()
    , witness_index(IS_CONSTANT)
{
    const auto& bytes = other.bytes();
    const size_t num_bytes = bytes.size();
    field_t<Builder> scaling_factor(context, fr::one());

    // Collect the bytes in reverse order and scale them appropriately.
    std::vector<field_t<Builder>> scaled_bytes;
    scaled_bytes.reserve(num_bytes);
    for (size_t i = 0; i < num_bytes; ++i) {
        scaled_bytes.push_back(bytes[num_bytes - 1 - i] * scaling_factor);
        scaling_factor = scaling_factor * fr(256); // Scale by 2^8.
    }
    field_t<Builder> accumulator = field_t<Builder>::accumulate(scaled_bytes);

    // If the accumulator is constant, we set the additive constant.
    // Otherwise, we set the witness index.
    if (accumulator.is_constant()) {
        additive_constant = uint256_t(accumulator.additive_constant);
    } else {
        witness_index = accumulator.witness_index;
    }

    // We need to constrain the accumulators, so we normalize here.
    normalize();
}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(Builder* parent_context, const std::array<bool_t<Builder>, width>& wires)
    : uint<Builder, Native>(parent_context, std::vector<bool_t<Builder>>(wires.begin(), wires.end()))
{}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(Builder* parent_context, const std::vector<bool_t<Builder>>& wires)
    : context(parent_context)
    , additive_constant(0)
    , accumulators()
    , witness_index(IS_CONSTANT)
{
    field_t<Builder> scaling_factor(context, fr::one());
    const size_t num_wires = wires.size();

    // Collect the bits and scale them appropriately.
    std::vector<field_t<Builder>> scaled_bits;
    scaled_bits.reserve(num_wires);
    for (size_t i = 0; i < num_wires; ++i) {
        scaled_bits.push_back(field_t<Builder>(wires[i]) * scaling_factor);
        scaling_factor = scaling_factor * fr(2); // Scale by 2^1.
    }
    field_t<Builder> accumulator = field_t<Builder>::accumulate(scaled_bits);

    // If the accumulator is constant, we set the additive constant.
    // Otherwise, we set the witness index.
    if (accumulator.is_constant()) {
        additive_constant = uint256_t(accumulator.additive_constant);
    } else {
        witness_index = accumulator.witness_index;
    }

    // We need to constrain the accumulators, so we normalize here.
    normalize();
}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(const uint& other)
    : context(other.context)
    , additive_constant(other.additive_constant)
    , accumulators(other.accumulators)
    , witness_index(other.witness_index)
{}

template <typename Builder, typename Native>
uint<Builder, Native>::uint(uint&& other) noexcept
    : context(other.context)
    , additive_constant(other.additive_constant)
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
    accumulators = other.accumulators;
    witness_index = other.witness_index;
    return *this;
}

template <typename Builder, typename Native>
uint<Builder, Native>& uint<Builder, Native>::operator=(uint&& other) noexcept
{
    context = other.context;
    additive_constant = other.additive_constant;
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

    // Constrain the accumulators
    accumulators = constrain_accumulators(context, witness_index);
    return *this;
}

template <typename Builder, typename Native> uint256_t uint<Builder, Native>::get_value() const
{
    if (!context || is_constant()) {
        return additive_constant;
    }

    const uint256_t witness_value = context->get_variable(witness_index);
    ASSERT(witness_value.get_msb() < width, "uint::get_value(): witness value exceeds type width");

    return witness_value & MASK;
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
