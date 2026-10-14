// AVX-512 IFMA replay of `element::batch_two_round_fold`'s op schedule (the IPA SRS fold), runtime-dispatched.
//
// x86-64 only: compiled under BB_FIELD_IFMA (see ecc/fields/ifma_field.hpp) and entered only after
// `field_ifma::available()`. WASM and non-x86 builds compile none of this.

#pragma once

#include "barretenberg/ecc/fields/ifma_field.hpp"

#ifdef BB_FIELD_IFMA

#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/throw_or_abort.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

namespace bb::group_elements::detail {

namespace fold_ifma {

using field_ifma::Columns;
using field_ifma::V5;

// Columns of the x and y coordinates of a group of points (lane j of group g is point 8g + j of the range).
struct PointColumns {
    Columns* x;
    Columns* y;
};

/**
 * @brief An operand column pair read with an optional endomorphism twist (x scaled by β) and an optional negation of
 *        y, as the op schedule's lookups need.
 */
struct Operand {
    const Columns* x;
    const Columns* y;
    bool beta;
    bool negate_y;
};

/**
 * @brief Per-lane inverses of the eight lanes of acc (Montgomery batching around one field inversion), in [0, p).
 */
template <typename Fq> BB_FIELD_IFMA_INLINE V5 invert_lanes(const V5& acc, const char* what)
{
    using Params = typename Fq::Params;
    alignas(64) Columns c;
    field_ifma::store_columns(field_ifma::canonical<Params>(acc), c);
    std::array<Fq, 8> lane;
    std::array<Fq, 8> prefix;
    Fq running = Fq::one();
    for (size_t l = 0; l < 8; ++l) {
        lane[l] = Fq{ c.limb[0][l], c.limb[1][l], c.limb[2][l], c.limb[3][l] };
        prefix[l] = running;
        running *= lane[l];
    }
    if (running.is_zero()) {
        throw_or_abort(what);
    }
    running = running.invert();
    for (size_t l = 8; l-- > 0;) {
        const Fq inv = (running * prefix[l]).reduce_once();
        running *= lane[l];
        for (size_t i = 0; i < 4; ++i) {
            c.limb[i][l] = inv.data[i];
        }
    }
    return field_ifma::load_columns(c);
}

/**
 * @brief Batch-affine group operations over `num_groups` groups of eight points, one field inversion per call.
 *
 * @details Stored coordinates are always fully reduced ([0, p)). Each pass multiplies the running prefix product
 *          (stored to `pre`) forward, inverts the eight lane products, and walks back, recomputing the cheap operands
 *          (differences, sums, the operand's twist) instead of storing them. Bounds are in units of p and follow from
 *          mont_mul(a, b) < 0.19 * a * b / p + p: running products stay below 1.7p, lane inverses 1.5p, slopes 2.1p.
 */
template <typename Fq> struct Kernels {
    using Params = typename Fq::Params;
    using C = field_ifma::Consts<Params>;

    size_t num_groups;
    // Running prefix products, one column.
    Columns* pre;
    // β in every lane, in [0, p).
    const Columns* beta;

    BB_FIELD_IFMA_INLINE static V5 load(const Columns& c) { return field_ifma::load_columns(c); }
    BB_FIELD_IFMA_INLINE static V5 one()
    {
        static constexpr Fq ONE = Fq::one();
        return field_ifma::broadcast(&ONE.data[0]);
    }
    BB_FIELD_IFMA_INLINE static V5 zero()
    {
        const __m512i z = _mm512_setzero_si512();
        return field_ifma::from_columns(z, z, z, z);
    }

    BB_FIELD_IFMA_INLINE void load_operand(const Operand& op, size_t g, V5& x, V5& y) const
    {
        x = load(op.x[g]);
        if (op.beta) {
            x = field_ifma::canonical<Params>(field_ifma::mont_mul<Params>(x, load(*beta)));
        }
        y = load(op.y[g]);
        if (op.negate_y) {
            // p - y lies in [1, p].
            y = field_ifma::canonical<Params>(field_ifma::sub_plus(zero(), y, C::P));
        }
    }

    // dst <- the operand, twisted as requested.
    BB_FIELD_IFMA_TARGET void copy(const Operand& op, PointColumns dst) const
    {
        for (size_t g = 0; g < num_groups; ++g) {
            V5 x;
            V5 y;
            load_operand(op, g, x, y);
            field_ifma::store_columns(x, dst.x[g]);
            field_ifma::store_columns(y, dst.y[g]);
        }
    }

    // acc <- acc + op, for acc.x != op.x in every lane.
    BB_FIELD_IFMA_TARGET void add(const Operand& op, PointColumns acc) const
    {
        V5 run = one();
        for (size_t g = 0; g < num_groups; ++g) {
            V5 x2;
            V5 y2;
            load_operand(op, g, x2, y2);
            const V5 dx = field_ifma::sub_plus(x2, load(acc.x[g]), C::P);
            field_ifma::store_columns(run, pre[g]);
            run = field_ifma::mont_mul<Params>(run, dx);
        }
        V5 inv = invert_lanes<Fq>(run, "attempted to invert zero in two_round_fold_range_ifma (add)");
        for (size_t g = num_groups; g-- > 0;) {
            V5 x2;
            V5 y2;
            load_operand(op, g, x2, y2);
            const V5 x1 = load(acc.x[g]);
            const V5 y1 = load(acc.y[g]);
            const V5 dx = field_ifma::sub_plus(x2, x1, C::P);
            const V5 inv_dx = field_ifma::mont_mul<Params>(inv, load(pre[g]));
            inv = field_ifma::mont_mul<Params>(inv, dx);
            // lambda < 1.6p; lambda^2 + 2p - (x1 + x2) < 3.5p; lambda (x1 - x3 + p) + p - y1 < 2.6p.
            const V5 lambda = field_ifma::mont_mul<Params>(field_ifma::sub_plus(y2, y1, C::P), inv_dx);
            const V5 x3 = field_ifma::canonical<Params>(
                field_ifma::sub_plus(field_ifma::mont_mul<Params>(lambda, lambda), field_ifma::add(x1, x2), C::P2));
            const V5 y3 = field_ifma::canonical<Params>(field_ifma::sub_plus(
                field_ifma::mont_mul<Params>(lambda, field_ifma::sub_plus(x1, x3, C::P)), y1, C::P));
            field_ifma::store_columns(x3, acc.x[g]);
            field_ifma::store_columns(y3, acc.y[g]);
        }
    }

    // acc <- 2 acc on a curve with a = 0, for acc.y != 0 in every lane.
    BB_FIELD_IFMA_TARGET void dbl(PointColumns acc) const
    {
        V5 run = one();
        for (size_t g = 0; g < num_groups; ++g) {
            const V5 y = load(acc.y[g]);
            field_ifma::store_columns(run, pre[g]);
            run = field_ifma::mont_mul<Params>(run, field_ifma::add(y, y));
        }
        V5 inv = invert_lanes<Fq>(run, "attempted to invert zero in two_round_fold_range_ifma (dbl)");
        for (size_t g = num_groups; g-- > 0;) {
            const V5 x = load(acc.x[g]);
            const V5 y = load(acc.y[g]);
            const V5 inv_2y = field_ifma::mont_mul<Params>(inv, load(pre[g]));
            inv = field_ifma::mont_mul<Params>(inv, field_ifma::add(y, y));
            // 3x^2 < 3.6p; lambda < 2.1p; lambda^2 + 2p - 2x < 3.8p; lambda (x - x3 + p) + p - y < 2.8p.
            const V5 xx = field_ifma::mont_mul<Params>(x, x);
            const V5 lambda = field_ifma::mont_mul<Params>(field_ifma::add(field_ifma::add(xx, xx), xx), inv_2y);
            const V5 x3 = field_ifma::canonical<Params>(
                field_ifma::sub_plus(field_ifma::mont_mul<Params>(lambda, lambda), field_ifma::add(x, x), C::P2));
            const V5 y3 = field_ifma::canonical<Params>(
                field_ifma::sub_plus(field_ifma::mont_mul<Params>(lambda, field_ifma::sub_plus(x, x3, C::P)), y, C::P));
            field_ifma::store_columns(x3, acc.x[g]);
            field_ifma::store_columns(y3, acc.y[g]);
        }
    }

    /**
     * @brief acc <- 2 acc + op via the chord-only path of batch_affine_combined_double_add_impl:
     *        l1 = (y2 - y1) / (x2 - x1), x3 = l1^2 - x1 - x2, l2 = -l1 - 2 y1 / (x3 - x1), x4 = l2^2 - x1 - x3,
     *        y4 = l2 (x1 - x4) - y1. `lambda1` and `x3` are scratch columns.
     */
    BB_FIELD_IFMA_TARGET void combined_double_add(const Operand& op,
                                                  PointColumns acc,
                                                  Columns* lambda1,
                                                  Columns* x3s) const
    {
        V5 run = one();
        for (size_t g = 0; g < num_groups; ++g) {
            V5 x2;
            V5 y2;
            load_operand(op, g, x2, y2);
            const V5 dx = field_ifma::sub_plus(x2, load(acc.x[g]), C::P);
            field_ifma::store_columns(run, pre[g]);
            run = field_ifma::mont_mul<Params>(run, dx);
        }
        V5 inv = invert_lanes<Fq>(run, "attempted to invert zero in two_round_fold_range_ifma (combined, phase 1)");
        for (size_t g = num_groups; g-- > 0;) {
            V5 x2;
            V5 y2;
            load_operand(op, g, x2, y2);
            const V5 x1 = load(acc.x[g]);
            const V5 y1 = load(acc.y[g]);
            const V5 dx = field_ifma::sub_plus(x2, x1, C::P);
            const V5 inv_dx = field_ifma::mont_mul<Params>(inv, load(pre[g]));
            inv = field_ifma::mont_mul<Params>(inv, dx);
            const V5 l1 = field_ifma::mont_mul<Params>(field_ifma::sub_plus(y2, y1, C::P), inv_dx);
            const V5 x3 = field_ifma::canonical<Params>(
                field_ifma::sub_plus(field_ifma::mont_mul<Params>(l1, l1), field_ifma::add(x1, x2), C::P2));
            field_ifma::store_columns(l1, lambda1[g]);
            field_ifma::store_columns(x3, x3s[g]);
        }
        run = one();
        for (size_t g = 0; g < num_groups; ++g) {
            const V5 d = field_ifma::sub_plus(load(x3s[g]), load(acc.x[g]), C::P);
            field_ifma::store_columns(run, pre[g]);
            run = field_ifma::mont_mul<Params>(run, d);
        }
        inv = invert_lanes<Fq>(run, "attempted to invert zero in two_round_fold_range_ifma (combined, phase 2)");
        for (size_t g = num_groups; g-- > 0;) {
            const V5 x1 = load(acc.x[g]);
            const V5 y1 = load(acc.y[g]);
            const V5 x3 = load(x3s[g]);
            const V5 d = field_ifma::sub_plus(x3, x1, C::P);
            const V5 inv_d = field_ifma::mont_mul<Params>(inv, load(pre[g]));
            inv = field_ifma::mont_mul<Params>(inv, d);
            // 2 y1 / (x3 - x1) < 1.6p; l2 = 4p - l1 - that < 4p; l2^2 + 2p - x1 - x3 < 6.1p;
            // l2 (x1 - x4 + p) + p - y1 < 3.6p.
            const V5 t = field_ifma::mont_mul<Params>(field_ifma::add(y1, y1), inv_d);
            const V5 l2 = field_ifma::sub2_plus(zero(), load(lambda1[g]), t, C::P4);
            const V5 x4 = field_ifma::canonical<Params>(
                field_ifma::sub2_plus(field_ifma::mont_mul<Params>(l2, l2), x1, x3, C::P2));
            const V5 y4 = field_ifma::canonical<Params>(
                field_ifma::sub_plus(field_ifma::mont_mul<Params>(l2, field_ifma::sub_plus(x1, x4, C::P)), y1, C::P));
            field_ifma::store_columns(x4, acc.x[g]);
            field_ifma::store_columns(y4, acc.y[g]);
        }
    }
};

} // namespace fold_ifma

// Lookup-table columns (x, y per entry for three bases), the accumulator, and the scratch columns pre, lambda1, x3.
template <size_t LOOKUP_SIZE> inline constexpr size_t TWO_ROUND_FOLD_IFMA_COLUMNS = (2 * 3 * LOOKUP_SIZE) + 2 + 3;

/**
 * @brief Replay batch_two_round_fold's op schedule over the output range [start, end) (start a multiple of 8) on IFMA
 *        kernels. `backing` holds TWO_ROUND_FOLD_IFMA_COLUMNS columns of `total_groups` groups each; the range uses
 *        groups start / 8 onwards of every column.
 *
 * @details Same structure as two_round_fold_range_packed: every coordinate column is held limb-major in groups of
 * eight points for the whole schedule, packed once on entry and unpacked once on exit. Each op runs its field
 * arithmetic eight points per register with one field inversion. A partial last group is padded with copies of the
 * range's last point, whose results are dropped. The `safe` ops run the projective formulas per point. The group
 * operations are exact, so every output is the same affine point as on the scalar path (with fully reduced
 * coordinates).
 */
template <typename Element, typename AffineElement, typename Fq, typename FoldOp, size_t LOOKUP_SIZE>
void two_round_fold_range_ifma(std::span<const AffineElement> points,
                               const size_t t,
                               std::span<const FoldOp> ops,
                               const size_t start,
                               const size_t end,
                               field_ifma::Columns* backing,
                               const size_t total_groups,
                               AffineElement* out)
{
    using field_ifma::Columns;
    using OpKind = decltype(FoldOp{}.kind);
    constexpr size_t NUM_TERMS = 4;
    constexpr size_t NUM_MULTIPLIED_BASES = 3;

    const size_t n = end - start;
    const size_t num_groups = (n + 7) / 8;
    size_t next_column = 0;
    const auto column = [&]() { return backing + ((next_column++) * total_groups) + (start / 8); };
    const auto point_columns = [&]() {
        Columns* x = column();
        return fold_ifma::PointColumns{ x, column() };
    };
    std::array<std::array<fold_ifma::PointColumns, LOOKUP_SIZE>, NUM_MULTIPLIED_BASES> tables;
    for (auto& base_table : tables) {
        for (auto& entry : base_table) {
            entry = point_columns();
        }
    }
    const fold_ifma::PointColumns accum = point_columns();
    Columns* const pre = column();
    Columns* const scratch_a = column();
    Columns* const scratch_b = column();

    // Lane j of group g holds point min(start + 8g + j, end - 1) of a quarter, coordinates reduced into [0, p).
    const auto pack_quarter = [&](size_t quarter, fold_ifma::PointColumns dst) {
        for (size_t k = 0; k < num_groups * 8; ++k) {
            const AffineElement& p = points[(quarter * t) + start + std::min(k, n - 1)];
            const Fq x = p.x.reduce_once();
            const Fq y = p.y.reduce_once();
            for (size_t i = 0; i < 4; ++i) {
                dst.x[k / 8].limb[i][k % 8] = x.data[i];
                dst.y[k / 8].limb[i][k % 8] = y.data[i];
            }
        }
    };
    const auto lane_point = [](const fold_ifma::PointColumns& c, size_t k) {
        return AffineElement(Fq{ c.x[k / 8].limb[0][k % 8],
                                 c.x[k / 8].limb[1][k % 8],
                                 c.x[k / 8].limb[2][k % 8],
                                 c.x[k / 8].limb[3][k % 8] },
                             Fq{ c.y[k / 8].limb[0][k % 8],
                                 c.y[k / 8].limb[1][k % 8],
                                 c.y[k / 8].limb[2][k % 8],
                                 c.y[k / 8].limb[3][k % 8] });
    };
    const auto set_lane_point = [](const fold_ifma::PointColumns& c, size_t k, const AffineElement& p) {
        const Fq x = p.x.reduce_once();
        const Fq y = p.y.reduce_once();
        for (size_t i = 0; i < 4; ++i) {
            c.x[k / 8].limb[i][k % 8] = x.data[i];
            c.y[k / 8].limb[i][k % 8] = y.data[i];
        }
    };

    alignas(64) Columns beta_lanes;
    constexpr Fq beta = Fq::cube_root_of_unity();
    const Fq beta_reduced = beta.reduce_once();
    for (size_t i = 0; i < 4; ++i) {
        for (size_t l = 0; l < 8; ++l) {
            beta_lanes.limb[i][l] = beta_reduced.data[i];
        }
    }
    const fold_ifma::Kernels<Fq> kernels{ num_groups, pre, &beta_lanes };

    const auto as_operand = [](const fold_ifma::PointColumns& c) {
        return fold_ifma::Operand{ c.x, c.y, false, false };
    };

    // Lookup tables [1·B, ..., 8·B] for the three multiplied bases.
    for (size_t base = 0; base < NUM_MULTIPLIED_BASES; ++base) {
        auto& table = tables[base];
        pack_quarter(base, table[0]);
        kernels.copy(as_operand(table[0]), table[1]);
        kernels.dbl(table[1]);
        for (size_t j = 2; j < LOOKUP_SIZE; ++j) {
            kernels.copy(as_operand(table[j - 1]), table[j]);
            kernels.add(as_operand(table[0]), table[j]);
        }
    }

    // ±magnitude·B for the op's term; term 2 is φ applied to base 0 (x scaled by β).
    const auto operand_for = [&](size_t term, uint32_t digit) {
        const uint32_t magnitude = digit & 0x7FFFFFFFU;
        const bool flip_y = ((digit >> 31) != 0) ^ (term == 2);
        static constexpr std::array<size_t, NUM_TERMS> term_to_base{ 0, 1, 0, 2 };
        const fold_ifma::PointColumns& entry = tables[term_to_base[term]][magnitude - 1];
        return fold_ifma::Operand{ entry.x, entry.y, term == 2, flip_y };
    };

    // accum ← 2·accum + operand (dbl = true) or accum + operand, per point with the projective formulas.
    const fold_ifma::PointColumns operand_scratch{ scratch_a, scratch_b };
    const auto pointwise_safe = [&](const fold_ifma::Operand& operand, bool dbl) {
        kernels.copy(operand, operand_scratch);
        for (size_t k = 0; k < num_groups * 8; ++k) {
            Element acc{ lane_point(accum, k) };
            if (dbl) {
                acc.self_dbl();
            }
            acc += lane_point(operand_scratch, k);
            set_lane_point(accum, k, AffineElement(acc));
        }
    };

    for (const FoldOp& op : ops) {
        switch (op.kind) {
        case OpKind::DBL:
            kernels.dbl(accum);
            break;
        case OpKind::SEED:
            kernels.copy(operand_for(op.term, op.digit), accum);
            break;
        case OpKind::COMBINED:
            if (op.safe) {
                pointwise_safe(operand_for(op.term, op.digit), /*dbl=*/true);
            } else {
                kernels.combined_double_add(operand_for(op.term, op.digit), accum, scratch_a, scratch_b);
            }
            break;
        case OpKind::ADD:
            if (op.safe) {
                pointwise_safe(operand_for(op.term, op.digit), /*dbl=*/false);
            } else {
                kernels.add(operand_for(op.term, op.digit), accum);
            }
            break;
        }
    }

    // Constant tail: + P3.
    pack_quarter(3, operand_scratch);
    kernels.add(as_operand(operand_scratch), accum);

    for (size_t k = 0; k < n; ++k) {
        out[start + k] = lane_point(accum, k);
    }
}

/**
 * @brief batch_two_round_fold's IFMA path for curves with a = 0 over a field the kernels support: writes the t folded
 *        points to `out`.
 *
 * @details The coordinate columns of all ranges live in one allocation made here, as the scalar path's tables are:
 * 55 columns of 32 bytes per point, the scalar path's footprint. (Per-range allocations in the worker threads would be
 * served from per-thread malloc arenas that keep the memory resident after the fold.) Ranges are split at multiples of
 * eight points so that each owns whole groups.
 */
template <typename Element, typename AffineElement, typename Fq, typename FoldOp, size_t LOOKUP_SIZE>
void two_round_fold_ifma(std::span<const AffineElement> points,
                         const size_t t,
                         std::span<const FoldOp> ops,
                         AffineElement* out)
{
    const size_t total_groups = (t + 7) / 8;
    std::vector<field_ifma::Columns> backing(TWO_ROUND_FOLD_IFMA_COLUMNS<LOOKUP_SIZE> * total_groups);
    const size_t num_ranges = std::min(get_num_cpus(), total_groups);
    parallel_for(num_ranges, [&](size_t r) {
        const size_t start = 8 * ((total_groups * r) / num_ranges);
        const size_t end = std::min(t, 8 * ((total_groups * (r + 1)) / num_ranges));
        if (start < end) {
            two_round_fold_range_ifma<Element, AffineElement, Fq, FoldOp, LOOKUP_SIZE>(
                points, t, ops, start, end, backing.data(), total_groups, out);
        }
    });
}

} // namespace bb::group_elements::detail

#endif // BB_FIELD_IFMA
