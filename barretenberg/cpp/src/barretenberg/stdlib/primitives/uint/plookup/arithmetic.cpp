#include "../../circuit_builders/circuit_builders.hpp"
#include "uint.hpp"

using namespace bb;

namespace bb::stdlib {

template <typename Builder, typename Native>
uint_plookup<Builder, Native> uint_plookup<Builder, Native>::operator+(const uint_plookup& other) const
{

    ASSERT(context == other.context || (context != nullptr && other.context == nullptr) ||
           (context == nullptr && other.context != nullptr));
    Builder* ctx = (context == nullptr) ? other.context : context;

    if (is_constant() && other.is_constant()) {
        return uint_plookup<Builder, Native>(context, (additive_constant + other.additive_constant) & MASK);
    }

    // N.B. We assume that additive_constant is nonzero ONLY if value is constant
    const uint256_t lhs = get_value();
    const uint256_t rhs = other.get_value();
    const uint256_t constants = (additive_constant + other.additive_constant) & MASK;
    const uint256_t sum = lhs + rhs;
    const uint256_t overflow = sum >> width;
    const uint256_t remainder = sum & MASK;

    const add_quad_<FF> gate{
        is_constant() ? ctx->zero_idx : witness_index,
        other.is_constant() ? ctx->zero_idx : other.witness_index,
        ctx->add_variable(remainder),
        ctx->add_variable(overflow),
        FF::one(),
        FF::one(),
        FF::neg_one(),
        -FF(CIRCUIT_UINT_MAX_PLUS_ONE),
        constants,
    };

    ctx->create_balanced_add_gate(gate);

    uint_plookup<Builder, Native> result(ctx);
    result.witness_index = gate.c;
    result.witness_status = WitnessStatus::WEAK_NORMALIZED;

    return result;
}

template <typename Builder, typename Native>
uint_plookup<Builder, Native> uint_plookup<Builder, Native>::operator-(const uint_plookup& other) const
{

    ASSERT(context == other.context || (context != nullptr && other.context == nullptr) ||
           (context == nullptr && other.context != nullptr));

    Builder* ctx = (context == nullptr) ? other.context : context;

    if (is_constant() && other.is_constant()) {
        return uint_plookup<Builder, Native>(context, (additive_constant - other.additive_constant) & MASK);
    }

    // N.B. We assume that additive_constant is nonzero ONLY if value is constant
    const uint32_t lhs_idx = is_constant() ? ctx->zero_idx : witness_index;
    const uint32_t rhs_idx = other.is_constant() ? ctx->zero_idx : other.witness_index;

    const uint256_t lhs = get_value();
    const uint256_t rhs = other.get_value();
    const uint256_t constant_term = (additive_constant - other.additive_constant);

    const uint256_t difference = CIRCUIT_UINT_MAX_PLUS_ONE + lhs - rhs;
    const uint256_t overflow = difference >> width;
    const uint256_t remainder = difference & MASK;

    const add_quad_<FF> gate{
        lhs_idx,
        rhs_idx,
        ctx->add_variable(remainder),
        ctx->add_variable(overflow),
        FF::one(),
        FF::neg_one(),
        FF::neg_one(),
        -FF(CIRCUIT_UINT_MAX_PLUS_ONE),
        CIRCUIT_UINT_MAX_PLUS_ONE + constant_term,
    };

    ctx->create_balanced_add_gate(gate);

    uint_plookup<Builder, Native> result(ctx);
    result.witness_index = gate.c;
    result.witness_status = WitnessStatus::WEAK_NORMALIZED;

    return result;
}

template <typename Builder, typename Native>
uint_plookup<Builder, Native> uint_plookup<Builder, Native>::operator*(const uint_plookup& other) const
{

    Builder* ctx = (context == nullptr) ? other.context : context;

    if (is_constant() && other.is_constant()) {
        return uint_plookup<Builder, Native>(context, (additive_constant * other.additive_constant) & MASK);
    }
    if (is_constant() && !other.is_constant()) {
        return other * (*this);
    }

    const uint32_t rhs_idx = other.is_constant() ? ctx->zero_idx : other.witness_index;

    const uint256_t lhs = ctx->variables[witness_index];
    const uint256_t rhs = ctx->variables[rhs_idx];

    const uint256_t product = (lhs * rhs) + (lhs * other.additive_constant) + (rhs * additive_constant);
    const uint256_t overflow = product >> width;
    const uint256_t remainder = product & MASK;

    const mul_quad_<FF> gate{
        witness_index,
        rhs_idx,
        ctx->add_variable(remainder),
        ctx->add_variable(overflow),
        FF::one(),
        other.additive_constant,
        additive_constant,
        FF::neg_one(),
        -FF(CIRCUIT_UINT_MAX_PLUS_ONE),
        0,
    };

    ctx->create_big_mul_gate(gate);

    // discard the high bits
    ctx->decompose_into_default_range(gate.d, width);

    uint_plookup<Builder, Native> result(ctx);
    result.accumulators = constrain_accumulators(ctx, gate.c);
    result.witness_index = gate.c;
    result.witness_status = WitnessStatus::OK;

    return result;
}

template <typename Builder, typename Native>
uint_plookup<Builder, Native> uint_plookup<Builder, Native>::operator/(const uint_plookup& other) const
{
    return divmod(other).first;
}

template <typename Builder, typename Native>
uint_plookup<Builder, Native> uint_plookup<Builder, Native>::operator%(const uint_plookup& other) const
{
    return divmod(other).second;
}

template <typename Builder, typename Native>
std::pair<uint_plookup<Builder, Native>, uint_plookup<Builder, Native>> uint_plookup<Builder, Native>::divmod(
    const uint_plookup& other) const
{
    /**
     *  divmod: returns (a / b) and (a % b)
     *
     *  We want to validate the following:
     *
     *      a = b.q + r
     *
     * Where:
     *
     *      a = dividend witness
     *      b = divisor witness
     *      q = quotient
     *      r = remainder
     *      (b - r) is in the range [0, 2**{width}]
     *
     * The final check validates that r is a geuine remainder term, that does not contain multiples of b
     *
     * We normalize a and b, as we need to be certain these values are within the range [0, 2**{width}]
     **/

    Builder* ctx = (context == nullptr) ? other.context : context;

    // We want to force the divisor to be non-zero, as this is an error state
    if (other.is_constant() && other.get_value() == 0) {
        // TODO: should have an actual error handler!
        const uint32_t one = ctx->add_variable(FF::one());
        ctx->assert_equal_constant(one, FF::zero());
        ctx->failure("plookup_arithmetic: divide by zero!");
    } else if (!other.is_constant()) {
        const bool_t<Builder> is_divisor_zero = field_t<Builder>(other).is_zero();
        ctx->assert_equal_constant(is_divisor_zero.witness_index, FF::zero(), "plookup_arithmetic: divide by zero!");
    }

    if (is_constant() && other.is_constant()) {
        const uint_plookup<Builder, Native> remainder(ctx, additive_constant % other.additive_constant);
        const uint_plookup<Builder, Native> quotient(ctx, additive_constant / other.additive_constant);
        return std::make_pair(quotient, remainder);
    } else if (witness_index == other.witness_index) {
        const uint_plookup<Builder, Native> remainder(context, 0);
        const uint_plookup<Builder, Native> quotient(context, 1);
        return std::make_pair(quotient, remainder);
    }

    const uint32_t dividend_idx = is_constant() ? ctx->zero_idx : witness_index;
    const uint32_t divisor_idx = other.is_constant() ? ctx->zero_idx : other.witness_index;

    const uint256_t dividend = get_value();
    const uint256_t divisor = other.get_value();

    const uint256_t q = dividend / divisor;
    const uint256_t r = dividend % divisor;

    const uint32_t quotient_idx = ctx->add_variable(q);
    const uint32_t remainder_idx = ctx->add_variable(r);

    const mul_quad_<FF> division_gate{
        quotient_idx,            // q
        divisor_idx,             // b
        dividend_idx,            // a
        remainder_idx,           // r
        FF::one(),               // q_m.w_1.w_2 = q.b
        other.additive_constant, // q_l.w_1 = q.b if b const
        FF::zero(),              // q_2.w_2 = 0
        FF::neg_one(),           // q_3.w_3 = -a
        FF::one(),               // q_4.w_4 = r
        -FF(additive_constant)   // q_c = -a if a const
    };
    ctx->create_big_mul_gate(division_gate);

    // (b + c_b - r) = d
    const uint256_t delta = divisor - r;

    const uint32_t delta_idx = ctx->add_variable(delta);
    const add_triple_<FF> delta_gate{
        divisor_idx,             // b
        remainder_idx,           // r
        delta_idx,               // d
        FF::one(),               // q_l = 1
        FF::neg_one(),           // q_r = -1
        FF::neg_one(),           // q_o = -1
        other.additive_constant, // q_c = d if const
    };
    ctx->create_add_gate(delta_gate);

    // validate delta is in the correct range
    ctx->decompose_into_default_range(delta_idx, width);
    uint_plookup<Builder, Native> quotient(ctx);
    quotient.witness_index = quotient_idx;
    quotient.accumulators = constrain_accumulators(ctx, quotient.witness_index);
    quotient.witness_status = WitnessStatus::OK;

    uint_plookup<Builder, Native> remainder(ctx);
    remainder.witness_index = remainder_idx;
    remainder.accumulators = constrain_accumulators(ctx, remainder.witness_index);
    remainder.witness_status = WitnessStatus::OK;

    return std::make_pair(quotient, remainder);
}
template class uint_plookup<bb::UltraCircuitBuilder, uint8_t>;
template class uint_plookup<bb::GoblinUltraCircuitBuilder, uint8_t>;
template class uint_plookup<bb::UltraCircuitBuilder, uint16_t>;
template class uint_plookup<bb::GoblinUltraCircuitBuilder, uint16_t>;
template class uint_plookup<bb::UltraCircuitBuilder, uint32_t>;
template class uint_plookup<bb::GoblinUltraCircuitBuilder, uint32_t>;
template class uint_plookup<bb::UltraCircuitBuilder, uint64_t>;
template class uint_plookup<bb::GoblinUltraCircuitBuilder, uint64_t>;
;
} // namespace bb::stdlib