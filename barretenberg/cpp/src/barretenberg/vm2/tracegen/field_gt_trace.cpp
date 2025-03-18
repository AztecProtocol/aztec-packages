#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"

namespace bb::avm2::tracegen {

namespace {

uint256_t TWO_POW_128 = uint256_t{ 1 } << 128;

std::tuple<uint256_t, uint256_t> decompose(uint256_t x)
{
    uint256_t lo = x % TWO_POW_128;
    uint256_t hi = x >> 128;
    return { lo, hi };
}
} // namespace

void FieldGreaterThanTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::FieldGreaterThanEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;
    static auto [p_lo, p_hi] = decompose(FF::modulus);

    uint32_t row = 1;
    for (const auto& event : events) {
        uint256_t a_integer = static_cast<uint256_t>(event.a);
        uint256_t b_integer = static_cast<uint256_t>(event.b);
        bool result = a_integer > b_integer;
        bool sel_gt = true;

        auto [a_lo, a_hi] = decompose(a_integer);
        uint256_t p_a_borrow = p_lo <= a_lo;
        uint256_t p_sub_a_lo = p_lo - a_lo + (p_a_borrow * TWO_POW_128);
        uint256_t p_sub_a_hi = p_hi - a_hi - p_a_borrow;

        auto [b_lo, b_hi] = decompose(b_integer);
        uint256_t p_b_borrow = p_lo <= b_lo;
        uint256_t p_sub_b_lo = p_lo - b_lo + (p_b_borrow * TWO_POW_128);
        uint256_t p_sub_b_hi = p_hi - b_hi - p_b_borrow;

        uint256_t borrow = result ? a_lo <= b_lo : b_lo <= a_lo;

        uint256_t res_lo = result ? a_lo - b_lo - 1 + borrow * TWO_POW_128 : b_lo - a_lo + borrow * TWO_POW_128;
        uint256_t res_hi = result ? a_hi - b_hi - borrow : b_hi - a_hi - borrow;

        int8_t comp_rng_ctr = 4;

        trace.set(row,
                  { { { C::ff_gt_sel, 1 },
                      { C::ff_gt_a, event.a },
                      { C::ff_gt_b, event.b },
                      { C::ff_gt_result, result },
                      { C::ff_gt_sel_gt, sel_gt },
                      { C::ff_gt_constant_128, 128 },
                      { C::ff_gt_a_lo, a_lo },
                      { C::ff_gt_a_hi, a_hi },
                      { C::ff_gt_p_a_borrow, p_a_borrow },
                      { C::ff_gt_p_sub_a_lo, p_sub_a_lo },
                      { C::ff_gt_p_sub_a_hi, p_sub_a_hi },
                      { C::ff_gt_b_lo, b_lo },
                      { C::ff_gt_b_hi, b_hi },
                      { C::ff_gt_p_b_borrow, p_b_borrow },
                      { C::ff_gt_p_sub_b_lo, p_sub_b_lo },
                      { C::ff_gt_p_sub_b_hi, p_sub_b_hi },
                      { C::ff_gt_borrow, borrow },
                      { C::ff_gt_res_lo, res_lo },
                      { C::ff_gt_res_hi, res_hi },
                      { C::ff_gt_cmp_rng_ctr, comp_rng_ctr },
                      { C::ff_gt_sel_shift_rng, 1 },
                      { C::ff_gt_cmp_rng_ctr_inv, 27 } } });
        row++;
    }
}

} // namespace bb::avm2::tracegen
