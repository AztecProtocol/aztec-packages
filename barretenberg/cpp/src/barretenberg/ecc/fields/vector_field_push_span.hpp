#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/fields/vector_field.hpp"

#include <array>
#include <cstddef>
#include <span>
#include <tuple>
#include <utility>

// Packed, SIMD-native storage of field elements for the fast-Pippenger rewrite.
//
// A VectorField<Params> packs W (= 5) field elements together and runs each arithmetic operation on
// all W at once with a single SIMD instruction. A VectorFieldPushSpan is a growable, indexed sequence
// of field elements already laid out in that packed form, over memory it borrows but does not own
// (a std::span). Hence the name: a span you can also push elements into.
//
// Two ways to use it, mirroring how Pippenger fills a batch and then consumes it:
//
//   - Fill with push(): append one element at a time. Every W elements completes a VectorField,
//     which is written into the backing. Use push() only when the elements arrive separately (e.g.
//     gathered from scattered memory); feeding a tight compute loop one element at a time just to
//     re-pack them throws away the SIMD speedup.
//   - Read and compute with operator[](g): returns the g-th completed VectorField, so a[g] * b[g]
//     multiplies W pairs of elements in a single instruction. A compute loop reads and writes whole
//     VectorFields this way.
//
// The final fewer-than-W elements do not fill a VectorField; they wait in a small staging array (the
// "tail") and the caller handles them one at a time via tail_elem() / tail_data(). reset() rewinds
// the span to empty so the same borrowed memory can be refilled for the next batch.
//
// When SIMD is compiled out, a VectorField is just W plain field elements, so every loop here becomes
// an ordinary scalar loop — one source compiles for both native and WASM.
namespace bb {

template <typename Params> struct VectorFieldPushSpan {
    using Vec = VectorField<Params>;
    using Field = typename Vec::Field;
    static constexpr size_t W = Vec::SIZE;

    std::span<Vec> vector_fields{}; // borrowed backing of completed VectorFields; owned elsewhere
    std::array<Field, W> partial{}; // elements of the VectorField currently being filled (the tail)
    size_t count = 0;               // total elements pushed
    size_t lane = 0;                // elements filled in the current VectorField, in [0, W)

    VectorFieldPushSpan() = default;
    explicit VectorFieldPushSpan(std::span<Vec> vector_fields_) noexcept
        : vector_fields(vector_fields_)
    {}

    // Move-only. The cursor (count / lane / partial) tracks a partly-filled VectorField inside the
    // borrowed backing, which is shared by reference. A copy would duplicate the cursor while still
    // sharing the backing, so the two copies would write over each other's VectorFields. Pass by
    // reference; to refill the same storage, reset() it rather than copy.
    VectorFieldPushSpan(const VectorFieldPushSpan&) = delete;
    VectorFieldPushSpan& operator=(const VectorFieldPushSpan&) = delete;
    VectorFieldPushSpan(VectorFieldPushSpan&&) noexcept = default;
    VectorFieldPushSpan& operator=(VectorFieldPushSpan&&) noexcept = default;
    ~VectorFieldPushSpan() = default;

    // Append one element. When the current VectorField fills (W elements), write it to the backing
    // and start the next.
    [[gnu::always_inline]] void push(const Field& v) noexcept
    {
        partial[lane] = v;
        ++lane;
        ++count;
        if (lane == W) {
            BB_ASSERT((count - 1) / W < vector_fields.size());
            vector_fields[(count - 1) / W] = Vec(partial.data());
            lane = 0;
        }
    }

    // The g-th completed VectorField, for SIMD arithmetic over all W of its elements at once.
    [[gnu::always_inline]] Vec& operator[](size_t g) noexcept
    {
        BB_ASSERT(g < vector_fields.size());
        return vector_fields[g];
    }
    [[gnu::always_inline]] const Vec& operator[](size_t g) const noexcept
    {
        BB_ASSERT(g < vector_fields.size());
        return vector_fields[g];
    }

    size_t num_full_vectors() const noexcept { return count / W; } // completed VectorFields
    size_t tail() const noexcept { return count % W; }             // trailing elements, in partial[0..tail())
    const Field* tail_data() const noexcept { return partial.data(); }
    Field& tail_elem(size_t t) noexcept { return partial[t]; }             // t < tail()
    const Field& tail_elem(size_t t) const noexcept { return partial[t]; } // t < tail()
    size_t size() const noexcept { return count; }

    // True if `other` views the same backing storage (same first VectorField). Lets in-place
    // primitives assert their no-alias preconditions (e.g. batch_invert needs in and out distinct)
    // without reaching into the backing span directly.
    [[nodiscard]] bool shares_backing(const VectorFieldPushSpan& other) const noexcept
    {
        return vector_fields.data() == other.vector_fields.data();
    }

    // True if this span's full-group data overlaps `other`'s backing — i.e. they share backing storage
    // AND there is something in it. This is the collision an in-place primitive must avoid (batch_invert
    // writes prefix products into `out` while still reading `in`, so it requires !in.aliases(out)).
    // Tail-only or empty spans never alias: the tail lives in each span's own `partial`, never the
    // shared backing, so there is nothing there to clobber.
    [[nodiscard]] bool aliases(const VectorFieldPushSpan& other) const noexcept
    {
        return num_full_vectors() != 0 && shares_backing(other);
    }

    // Rewind to empty so the borrowed storage can be refilled; leaves the backing memory untouched.
    void reset() noexcept
    {
        count = 0;
        lane = 0;
    }

    // Copy src's logical extent (count / lane) onto this span without touching either backing. A
    // primitive that fills a result span element-for-element from an input of the same shape calls
    // this so the result reports the same size() / tail() as its input.
    void adopt_cursor(const VectorFieldPushSpan& src) noexcept
    {
        count = src.count;
        lane = src.lane;
    }
};

// A sequence of affine points in packed SIMD form, kept as two parallel coordinate spans (x and y).
// A point is split across them: point W*g + j has its x-coordinate in lane j of x's g-th VectorField
// and its y-coordinate in lane j of y's g-th VectorField — so a lane holds one coordinate, not a
// whole point. push_point() advances both coordinate cursors together. Move-only, like its members.
//
// TODO(open): read-only inputs (e.g. an already-packed SRS) only ever read this, never push. Should
// they instead use a lighter read-only view ({span<const Vec>, count}, tail padded into the backing)
// rather than carry this fill cursor? The answer turns on where a persistent input's tail should live.
template <typename Params> struct VectorAffineElementPushSpan {
    using Vec = VectorField<Params>;
    using Field = typename Vec::Field;

    VectorFieldPushSpan<Params> x;
    VectorFieldPushSpan<Params> y;

    VectorAffineElementPushSpan() = default;
    VectorAffineElementPushSpan(std::span<Vec> x_fields, std::span<Vec> y_fields) noexcept
        : x(x_fields)
        , y(y_fields)
    {}

    [[gnu::always_inline]] void push_point(const Field& px, const Field& py) noexcept
    {
        x.push(px);
        y.push(py);
    }

    size_t num_full_vectors() const noexcept { return x.num_full_vectors(); }
    size_t tail() const noexcept { return x.tail(); }
    size_t size() const noexcept { return x.size(); }
    void reset() noexcept
    {
        x.reset();
        y.reset();
    }
    void adopt_cursor(const VectorAffineElementPushSpan& src) noexcept
    {
        x.adopt_cursor(src.x);
        y.adopt_cursor(src.y);
    }
};

namespace detail {
template <typename Tuple, typename Kernel, size_t... I>
[[gnu::always_inline]] inline void zip_for_each_impl(Tuple& spans,
                                                     Kernel kernel,
                                                     [[maybe_unused]] std::index_sequence<I...> seq)
{
    const auto& first = std::get<0>(spans);
    const size_t num_full = first.num_full_vectors();
    const size_t ntail = first.tail();
    for (size_t g = 0; g < num_full; ++g) {
        kernel(std::get<I>(spans)[g]...);
    }
    for (size_t t = 0; t < ntail; ++t) {
        kernel(std::get<I>(spans).tail_elem(t)...);
    }
}
} // namespace detail

// Apply `kernel` to corresponding elements of several VectorFieldPushSpans in lockstep. The last
// argument is the kernel; the rest are the spans. At each position the kernel receives one value from
// every span: a VectorField for the full groups, a Field for the trailing tail. Write the kernel as
// plain field arithmetic over generic parameters — outputs auto&, inputs const auto& — so it never
// mentions lanes, indices, or the bulk/tail split, and the same kernel serves SIMD and scalar builds.
// The element count comes from the first span, so pass a filled input first. Nothing is converted
// (spans are read and written in place); output spans keep whatever count they had, so the caller
// finalizes them afterward (e.g. via adopt_cursor).
template <typename... Args> [[gnu::always_inline]] inline void zip_for_each(Args&&... args)
{
    static_assert(sizeof...(Args) >= 2, "zip_for_each needs at least one span and a kernel");
    constexpr size_t n = sizeof...(Args);
    auto spans = std::forward_as_tuple(std::forward<Args>(args)...);
    detail::zip_for_each_impl(spans, std::get<n - 1>(spans), std::make_index_sequence<n - 1>{});
}

// Map-accumulate over a push-span (cf. Haskell's mapAccumL / mapAccumR): thread an accumulator through
// the elements, calling step(acc, in_elem, out_elem) at each one — step writes a per-element output and
// advances the accumulator. Full groups carry the VectorField accumulator (bulk_acc),
// the tail carries the Field one (tail_acc), so `step` is written once as a generic lambda over both.
// The two accumulators are seeded by the bulk_acc / tail_acc arguments, and the final accumulators are returned. When
// Reverse is true the groups and the tail are walked back-to-front.
//
// WARNING: The q1s1 layout interleaves elements across the W lanes, so the per-lane partials recombine to the
// whole-stream result only when step's operation is _commutative_ (e.g. field + or *); an
// order-dependent op (a true global prefix) would not survive the lane split.
template <bool Reverse, typename Params, typename Step>
[[gnu::always_inline]] inline std::pair<VectorField<Params>, field<Params>> map_accumulate(
    const VectorFieldPushSpan<Params>& in,
    VectorFieldPushSpan<Params>& out,
    VectorField<Params> bulk_acc,
    field<Params> tail_acc,
    Step step)
{
    const size_t num_full = in.num_full_vectors();
    const size_t ntail = in.tail();
    if constexpr (Reverse) {
        for (size_t g = num_full; g-- > 0;) {
            step(bulk_acc, in[g], out[g]);
        }
        for (size_t t = ntail; t-- > 0;) {
            step(tail_acc, in.tail_elem(t), out.tail_elem(t));
        }
    } else {
        for (size_t g = 0; g < num_full; ++g) {
            step(bulk_acc, in[g], out[g]);
        }
        for (size_t t = 0; t < ntail; ++t) {
            step(tail_acc, in.tail_elem(t), out.tail_elem(t));
        }
    }
    return { bulk_acc, tail_acc };
}

} // namespace bb
