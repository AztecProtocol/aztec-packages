// Test-support: construction of forged ECCVM witnesses that publish an MSM result the MSM table
// never computed.
//
// MSM_TRANSITION_FOLLOWS_SKEW confines a result emission to a row whose accumulator SKEW_ACC pins.
// Absent that, a prover emits from a phase-less row and publishes a free point, which coarsens the
// declared MSM partition: one segment's published sum absorbs another's. The witnesses here realise
// a two-block coarsening, assembled from real builder output so that no witness value is
// hand-derived.
#pragma once

#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"

namespace bb::eccvm_msm_forgery {

using Flavor = ECCVMFlavor;
using FF = typename Flavor::FF;
using G1 = bb::g1;
using Fr = typename G1::Fr;
using Fq = typename G1::Fq;
using Point = typename G1::affine_element;
using Polynomial = typename Flavor::Polynomial;
using ProverPolynomials = typename Flavor::ProverPolynomials;

inline numeric::RNG& rng()
{
    return numeric::get_debug_randomness();
}

struct Fixture {
    bool cancelling; // does the freed MSM's true value happen to be the identity?
    Point A;
    Point B;
    Point C;
    Point P;
    Point Q;
    Fr x;
    Fr y;
    Fr s;
    Fr t;
    Fr xp; // donor's first-MSM scalars, chosen so its MSM1 output equals the absorbing segment's sum
    Fr yp;
    Fr s2; // donor's second-MSM scalars: these determine the forged point
    Fr t2;
    Fq hide_x;
    Fq hide_y;
};

/**
 * @brief Build a fixture.
 *
 * @param cancelling  When true the freed MSM's true value is the identity, so the absorbing segment's
 *                    published output is unchanged and MSM1's claim stays honest. When false the freed
 *                    MSM's true value is a real nonzero point; the absorbing segment then publishes
 *                    S1 + S2 for MSM1, and the donor is set up to claim exactly that. Nothing cancels.
 *
 * In the non-cancelling case P and Q are taken inside the span of A and B with known coefficients,
 * purely so the donor's first-MSM scalars can be solved for and every witness can still be sourced
 * from a real builder rather than hand-derived.
 */
inline Fixture make_fixture(bool cancelling)
{
    auto gens = G1::derive_generators("eccvm phantom forgery", 3);
    const Fr alpha = Fr::random_element(&rng());
    const Fr beta = Fr::random_element(&rng());
    const Point A = gens[0];
    const Point B = gens[1];
    const Fr x = Fr::random_element(&rng());
    const Fr y = Fr::random_element(&rng());
    const Fr s = Fr::random_element(&rng());

    Fixture f{};
    f.cancelling = cancelling;
    f.A = A;
    f.B = B;
    f.C = gens[2];
    f.x = x;
    f.y = y;
    f.s = s;
    f.s2 = Fr::random_element(&rng());
    f.t2 = Fr::random_element(&rng());
    f.hide_x = Fq::random_element(&rng());
    f.hide_y = Fq::random_element(&rng());

    if (cancelling) {
        f.P = Point(G1::element(A) * alpha);
        f.Q = f.P;
        f.t = -s;
        f.xp = x;
        f.yp = y;
    } else {
        f.P = Point(G1::element(A) * alpha);
        f.Q = Point(G1::element(B) * beta);
        f.t = Fr::random_element(&rng());
        f.xp = x + s * alpha;
        f.yp = y + f.t * beta;
    }
    return f;
}

/// True result of the first declared MSM.
inline G1::element true_msm1(const Fixture& f)
{
    return G1::element(f.A) * f.x + G1::element(f.B) * f.y;
}

/// True result of the second declared MSM -- the one the forgery frees.
inline G1::element true_msm2(const Fixture& f)
{
    return G1::element(f.P) * f.s + G1::element(f.Q) * f.t;
}

enum class Variant { TARGET, DONOR, ONE_MSM };

inline std::shared_ptr<ECCOpQueue> make_queue(const Fixture& f, Variant v)
{
    const bool donor = (v == Variant::DONOR);
    auto q = std::make_shared<ECCOpQueue>();
    q->mul_accumulate(f.A, donor ? f.xp : f.x);
    q->mul_accumulate(f.B, donor ? f.yp : f.y);
    if (v != Variant::ONE_MSM) {
        q->add_accumulate(f.C);
    }
    q->mul_accumulate(f.P, donor ? f.s2 : f.s);
    q->mul_accumulate(f.Q, donor ? f.t2 : f.t);
    q->eq_and_reset();
    q->merge();
    q->append_hiding_op(f.hide_x, f.hide_y);
    return q;
}

inline std::vector<Polynomial*> msm_columns(ProverPolynomials& p)
{
    return { &p.msm_size_of_msm,
             &p.msm_add2,
             &p.msm_add3,
             &p.msm_add4,
             &p.msm_x1,
             &p.msm_y1,
             &p.msm_x2,
             &p.msm_y2,
             &p.msm_x3,
             &p.msm_y3,
             &p.msm_x4,
             &p.msm_y4,
             &p.msm_collision_x1,
             &p.msm_collision_x2,
             &p.msm_collision_x3,
             &p.msm_collision_x4,
             &p.msm_lambda1,
             &p.msm_lambda2,
             &p.msm_lambda3,
             &p.msm_lambda4,
             &p.msm_slice1,
             &p.msm_slice2,
             &p.msm_slice3,
             &p.msm_slice4,
             &p.msm_transition,
             &p.msm_add,
             &p.msm_double,
             &p.msm_skew,
             &p.msm_accumulator_x,
             &p.msm_accumulator_y,
             &p.msm_count,
             &p.msm_round,
             &p.msm_add1,
             &p.msm_pc,
             &p.msm_round_minus_31_inv };
}

/// Transcript columns that encode the claimed MSM output and everything downstream of it.
inline std::vector<Polynomial*> transcript_msm_output_columns(ProverPolynomials& p)
{
    return { &p.transcript_msm_x,
             &p.transcript_msm_y,
             &p.transcript_msm_intermediate_x,
             &p.transcript_msm_intermediate_y,
             &p.transcript_msm_infinity,
             &p.transcript_msm_x_inverse,
             &p.transcript_add_x_equal,
             &p.transcript_add_y_equal,
             &p.transcript_add_lambda,
             &p.transcript_accumulator_x,
             &p.transcript_accumulator_y,
             &p.transcript_accumulator_not_empty,
             &p.transcript_base_x_inverse,
             &p.transcript_base_y_inverse };
}

/// Columns the forgery must leave byte-identical: the op-queue data the Translator consumes.
inline std::vector<const Polynomial*> op_queue_columns(const ProverPolynomials& p)
{
    return { &p.transcript_op, &p.transcript_Px, &p.transcript_Py, &p.transcript_z1, &p.transcript_z2 };
}

inline size_t last_msm_row(const ProverPolynomials& p)
{
    size_t last = 0;
    for (size_t i = Flavor::TRACE_OFFSET; i < p.get_polynomial_size(); i++) {
        if (!p.msm_transition[i].is_zero() || !p.msm_add[i].is_zero() || !p.msm_double[i].is_zero() ||
            !p.msm_skew[i].is_zero()) {
            last = i;
        }
    }
    return last;
}

struct Forgery {
    ProverPolynomials polys;
    size_t emitting_row;  // last skew row of the absorbing segment
    size_t injected_row;  // phase-inactive msm_transition row that publishes the free accumulator
    size_t published_row; // carries the free accumulator itself
};

/// Rows of the MSM sub-table that begin a declared MSM, in order, including the trace-final sentinel.
inline std::vector<size_t> msm_transition_rows(const ProverPolynomials& p)
{
    std::vector<size_t> rows;
    const size_t last = last_msm_row(p);
    for (size_t i = Flavor::TRACE_OFFSET; i <= last; i++) {
        if (!p.msm_transition[i].is_zero()) {
            rows.push_back(i);
        }
    }
    return rows;
}

/// Build an ECCVM trace over an explicit op sequence, bypassing circuit construction.
inline ProverPolynomials trace_from_ops(const std::vector<ECCVMOperation>& ops)
{
    auto queue = std::make_shared<ECCOpQueue>();
    queue->set_eccvm_ops_with_row_counts_for_testing(ops);
    ECCVMCircuitBuilder builder{ queue };
    return ProverPolynomials(builder);
}

/// Index of the operation separating the final two runs of `mul` ops, i.e. the final two declared MSMs.
inline size_t final_msm_separator_index(const std::vector<ECCVMOperation>& ops)
{
    size_t i = ops.size();
    while (i > 0 && !ops[i - 1].op_code.mul) { // trailing non-mul ops
        i--;
    }
    while (i > 0 && ops[i - 1].op_code.mul) { // the final MSM's muls
        i--;
    }
    BB_ASSERT_GT(i, 0U);
    return i - 1;
}

/// The eccvm-side record of a single `mul`, used to restate an op with a different scalar.
inline ECCVMOperation mul_op(const Point& point, const Fr& scalar)
{
    auto queue = std::make_shared<ECCOpQueue>();
    queue->mul_accumulate(point, scalar);
    queue->merge();
    queue->append_hiding_op(Fq(0), Fq(0));
    return queue->get_eccvm_ops().back();
}

/**
 * @brief Fuse a consecutive pair of declared MSM segments into one, leaving the later one unevaluated.
 *
 * @param polys     the trace to forge, modified in place
 * @param donor     a trace of identical op structure whose claimed MSM outputs are the forged ones
 * @param absorber  a trace over the same scalar multiplications with the pair already fused, obtained
 *                  by removing the operation that separated them
 *
 * @details The pair to fuse is inferred by comparing the two traces' point-counter sequences: the
 * absorber is missing exactly the entry belonging to the segment that was absorbed. One row is then
 * inserted after the fused segment, carrying `msm_transition = 1` with no phase selector active. The
 * row following it begins the next segment, which starts from the offset generator and so ignores its
 * own accumulator witness. The inserted row publishes that witness as the absorbed segment's result.
 * MSM_TRANSITION_FOLLOWS_SKEW rejects the inserted row, which carries no `q_skew`.
 */
inline void forge_in_place(ProverPolynomials& polys,
                           const ProverPolynomials& donor,
                           const ProverPolynomials& absorber,
                           Forgery* out = nullptr)
{
    // The absorbing segment reads exactly the same (pc, slice) entries as the two honest segments, so
    // the point-table lookup argument needs no tampering.
    for (size_t i = Flavor::TRACE_OFFSET; i < polys.get_polynomial_size(); i++) {
        BB_ASSERT_EQ(polys.lookup_read_counts_0[i], absorber.lookup_read_counts_0[i]);
        BB_ASSERT_EQ(polys.lookup_read_counts_1[i], absorber.lookup_read_counts_1[i]);
    }

    const auto target_starts = msm_transition_rows(polys);
    const auto absorber_starts = msm_transition_rows(absorber);
    BB_ASSERT_EQ(target_starts.size(), absorber_starts.size() + 1);

    // The first point counter on which the two disagree belongs to the absorbed segment.
    size_t j = 0;
    while (j < absorber_starts.size() && polys.msm_pc[target_starts[j]] == absorber.msm_pc[absorber_starts[j]]) {
        j++;
    }
    BB_ASSERT_GT(j, 0U);

    const FF absorbed_pc = polys.msm_pc[target_starts[j]];
    const FF following_pc = polys.msm_pc[target_starts[j + 1]];
    const FF absorbing_size = polys.msm_pc[target_starts[j - 1]] - absorbed_pc;
    const FF absorbed_size = absorbed_pc - following_pc;

    const size_t injected_row = absorber_starts[j]; // where the absorbed segment's start row is reinstated
    const size_t emitting_row = injected_row - 1;   // last skew row of the fused segment
    const size_t published_row = injected_row + 1;  // first row of the following segment
    BB_ASSERT_EQ(absorber.msm_skew[emitting_row], FF(1));

    // Copy the fused MSM table, opening a one-row gap for the reinstated start row.
    auto dst = msm_columns(polys);
    auto src = msm_columns(const_cast<ProverPolynomials&>(absorber));
    const size_t absorber_last = last_msm_row(absorber);
    for (size_t c = 0; c < dst.size(); c++) {
        for (size_t i = Flavor::TRACE_OFFSET; i < dst[c]->end_index(); i++) {
            FF value = 0;
            if (i < injected_row) {
                value = (*src[c])[i];
            } else if (i > injected_row && i <= absorber_last + 1) {
                value = (*src[c])[i - 1];
            }
            dst[c]->set_if_valid_index(i, value);
        }
    }

    // The emitting row announces the absorbing MSM rather than the fused total.
    polys.msm_size_of_msm.set_if_valid_index(emitting_row, absorbing_size);

    // The reinstated start row: a transition with no phase active, the shape
    // MSM_TRANSITION_FOLLOWS_SKEW rejects. Its own accumulator is the fused segment's output, pinned by
    // SKEW_ACC.
    polys.msm_transition.set_if_valid_index(injected_row, FF(1));
    polys.msm_pc.set_if_valid_index(injected_row, absorbed_pc);
    polys.msm_size_of_msm.set_if_valid_index(injected_row, absorbed_size);
    polys.msm_accumulator_x.set_if_valid_index(injected_row, absorber.msm_accumulator_x[injected_row]);
    polys.msm_accumulator_y.set_if_valid_index(injected_row, absorber.msm_accumulator_y[injected_row]);

    // The witness the reinstated row publishes as the absorbed segment's result.
    const size_t transcript_row = [&] {
        size_t found = 0;
        size_t seen = 0;
        for (size_t i = Flavor::TRACE_OFFSET; i < polys.get_polynomial_size(); i++) {
            if (!polys.transcript_msm_transition[i].is_zero()) {
                if (seen == j) {
                    found = i;
                }
                seen++;
            }
        }
        return found;
    }();
    polys.msm_accumulator_x.set_if_valid_index(published_row, donor.transcript_msm_x[transcript_row]);
    polys.msm_accumulator_y.set_if_valid_index(published_row, donor.transcript_msm_y[transcript_row]);

    // The transcript now claims the donor's MSM outputs and carries the donor's accumulator chain.
    auto tdst = transcript_msm_output_columns(polys);
    auto tsrc = transcript_msm_output_columns(const_cast<ProverPolynomials&>(donor));
    for (size_t c = 0; c < tdst.size(); c++) {
        for (size_t i = Flavor::TRACE_OFFSET; i < tdst[c]->end_index(); i++) {
            tdst[c]->set_if_valid_index(i, (*tsrc[c])[i]);
        }
    }

    polys.set_shifted();

    if (out != nullptr) {
        out->emitting_row = emitting_row;
        out->injected_row = injected_row;
        out->published_row = published_row;
    }
}

/**
 * @brief Build the trace for the false statement, optionally with the phantom-MSM forgery applied.
 */
inline ProverPolynomials build_trace(const Fixture& f, bool forge, Forgery* out = nullptr)
{
    auto donor_queue = make_queue(f, Variant::DONOR);
    ECCVMCircuitBuilder donor_builder{ donor_queue };
    ProverPolynomials donor(donor_builder);

    // The false statement: the target's accumulator is x*A + y*B + C, but its `eq` is repointed at the
    // donor's target, which differs by the donor's second MSM.
    auto queue = make_queue(f, Variant::TARGET);
    auto& ops = queue->get_eccvm_ops();
    auto& donor_ops = donor_queue->get_eccvm_ops();
    BB_ASSERT_EQ(ops.size(), donor_ops.size());
    BB_ASSERT_EQ(ops.back().op_code.eq, true);
    ops.back().base_point = donor_ops.back().base_point;

    ECCVMCircuitBuilder builder{ queue };
    ProverPolynomials polys(builder);

    if (!forge) {
        return polys;
    }

    auto absorber_queue = make_queue(f, Variant::ONE_MSM);
    ECCVMCircuitBuilder absorber_builder{ absorber_queue };
    ProverPolynomials absorber(absorber_builder);

    forge_in_place(polys, donor, absorber, out);
    return polys;
}

} // namespace bb::eccvm_msm_forgery
