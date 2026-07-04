#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/fields/vector_field.hpp"

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>
#include <tuple>
#include <type_traits>
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
// ⚠ FOOTGUN — the push cursor (count/lane) is STICKY and is NOT cleared between logical uses. push() /
// push_point() APPEND at the current cursor; only reset() (and gather_from, which resets first) returns
// it to empty. So whenever a span — or, worse, a borrowed BACKING shared by two spans — is reused for a
// fresh fill, the new producer MUST reset() before its first push(), or the appends pile onto the stale
// cursor and write past the backing: an out-of-bounds store, asserted in debug, SILENT CORRUPTION in
// release. This is especially easy to hit when two stages share one backing and one stage advances the
// cursor the other does not expect. Rule: a fill helper that resets internally (gather_from) is safe to
// reuse; a raw push()/push_point() loop must reset() the span first.
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
    size_t capacity() const noexcept { return vector_fields.size() * W; } // max elements the backing holds

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
        // A span always aliases itself, whatever its fill level: this catches batch_invert(span, span)
        // on a tail-only (1..W-1 element) span, which shares_backing() alone misses because the tail
        // lives in each span's own `partial`, not the shared backing.
        return this == &other || (num_full_vectors() != 0 && shares_backing(other));
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

// Column (struct-of-arrays) view of affine points: x[i] and y[i] are point i's coordinates, each
// coordinate array contiguous in its own column. This is NOT a span<AffineElement> (which interleaves
// x, y per point) — the per-column contiguity is exactly what lets VectorField::gather / scatter pull
// or place W lanes from one column in a single shuffle. Borrowed storage; the view does not own it.
template <typename Field> struct AffineColumnSpan {
    std::span<Field> x;
    std::span<Field> y;
    size_t size() const noexcept { return x.size(); }
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
    size_t capacity() const noexcept { return x.capacity(); }

    // Fill this packed span by gathering `count` points out of a column view: the k-th pushed point is
    // buckets at index index_of(k). reset()s first. The scalar -> packed half of the bridge between
    // scalar bucket storage and packed compute.
    template <typename IndexFn> void gather_from(const AffineColumnSpan<Field>& buckets, IndexFn index_of, size_t count)
    {
        reset();
        for (size_t k = 0; k < count; ++k) {
            const size_t b = index_of(k);
            push_point(buckets.x[b], buckets.y[b]);
        }
    }

    // Visit each pushed point (x, y) in push order, with its running index k, invoking
    // kernel(const Field& x, const Field& y, size_t k). Each full VectorField group is unpacked once
    // (to_array); the sub-W tail is read element-wise. Centralises the bulk/tail split and the running
    // index so drain-style callers supply only the per-point body.
    template <typename Kernel> void for_each_point(Kernel kernel) const
    {
        size_t k = 0;
        for (size_t g = 0; g < x.num_full_vectors(); ++g) {
            const auto xs = x[g].to_array();
            const auto ys = y[g].to_array();
            for (size_t l = 0; l < Vec::SIZE; ++l) {
                kernel(xs[l], ys[l], k++);
            }
        }
        for (size_t t = 0; t < x.tail(); ++t) {
            kernel(x.tail_elem(t), y.tail_elem(t), k++);
        }
    }

    // Drain every completed point back into a column view: the k-th point (push order) lands at column
    // index index_of(k). The packed -> scalar half of the bridge; for_each_point owns the per-group
    // unpack and the sub-W tail, so this is just the indexed store.
    template <typename IndexFn> void scatter_to(AffineColumnSpan<Field>& buckets, IndexFn index_of) const
    {
        for_each_point([&](const Field& xe, const Field& ye, size_t k) {
            const size_t b = index_of(k);
            buckets.x[b] = xe;
            buckets.y[b] = ye;
        });
    }

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
// Stamp the shape (count / lane) of `first` onto `span`, but only if `span` is writable. zip_for_each
// walks every span in lockstep with the first, so afterwards each output span should report the first's
// extent. Const (input) spans are skipped; re-stamping a non-const input is a no-op (it already has that
// extent). This folds the easy-to-forget manual adopt_cursor into zip_for_each itself.
template <typename Span, typename First>
[[gnu::always_inline]] inline void adopt_shape_if_writable(Span& span, const First& first) noexcept
{
    if constexpr (!std::is_const_v<Span>) {
        span.adopt_cursor(first);
    }
}

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
    // Output spans inherit the first span's extent automatically — no manual adopt_cursor at call sites.
    (adopt_shape_if_writable(std::get<I>(spans), first), ...);
}
} // namespace detail

// Apply `kernel` to corresponding elements of several VectorFieldPushSpans in lockstep. The last
// argument is the kernel; the rest are the spans. At each position the kernel receives one value from
// every span: a VectorField for the full groups, a Field for the trailing tail. Write the kernel as
// plain field arithmetic over generic parameters — outputs auto&, inputs const auto& — so it never
// mentions lanes, indices, or the bulk/tail split, and the same kernel serves SIMD and scalar builds.
// The element count comes from the first span, so pass a filled input first. Nothing is converted
// (spans are read and written in place); each output span automatically adopts the first span's extent
// (count / tail) when the walk finishes, so the caller need not adopt_cursor afterward.
template <typename... Args> [[gnu::always_inline]] inline void zip_for_each(Args&&... args)
{
    static_assert(sizeof...(Args) >= 2, "zip_for_each needs at least one span and a kernel");
    constexpr size_t n = sizeof...(Args);
    auto spans = std::forward_as_tuple(std::forward<Args>(args)...);
    detail::zip_for_each_impl(spans, std::get<n - 1>(spans), std::make_index_sequence<n - 1>{});
}

// Direction of an order-sensitive walk. Backed by bool so Forward/Backward map onto the false/true a
// bare reverse flag would use, which keeps a migration from such a flag mechanical.
enum class Direction : bool { Forward = false, Backward = true };

// Map-accumulate over a push-span (cf. Haskell's mapAccumL / mapAccumR): thread an accumulator through
// the elements, calling step(acc, in_elem, out_elem) at each one — step writes a per-element output and
// advances the accumulator. Full groups carry the VectorField accumulator (bulk_acc),
// the tail carries the Field one (tail_acc), so `step` is written once as a generic lambda over both.
// The two accumulators are seeded by the bulk_acc / tail_acc arguments, and the final accumulators are returned. When
// Dir is Direction::Backward the groups and the tail are walked back-to-front.
//
// WARNING: The q1s1 layout interleaves elements across the W lanes, so the per-lane partials recombine to the
// whole-stream result only when step's operation is _commutative_ (e.g. field + or *); an
// order-dependent op (a true global prefix) would not survive the lane split.
template <Direction Dir, typename Params, typename Step>
[[gnu::always_inline]] inline std::pair<VectorField<Params>, field<Params>> map_accumulate(
    const VectorFieldPushSpan<Params>& in,
    VectorFieldPushSpan<Params>& out,
    VectorField<Params> bulk_acc,
    field<Params> tail_acc,
    Step step)
{
    const size_t num_full = in.num_full_vectors();
    const size_t ntail = in.tail();
    if constexpr (Dir == Direction::Backward) {
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
    out.adopt_cursor(in); // result reports the same size() / tail() as the input — callers need not adopt
    return { bulk_acc, tail_acc };
}

// Walk `pairs` over a column (SoA) view, handing the kernel references straight into each pair's dst
// and src buckets — kernel(x_dst&, y_dst&, x_src, y_src, i) — so the body is plain field arithmetic
// with no index or pointer bookkeeping. The dst coordinates are mutable (the kernel may update them in
// place); the src coordinates are read-only. The walker owns the software prefetch: it warms the random
// bucket addresses PREFETCH_AHEAD steps further along the walk (write hint for dst, read hint for src).
// Direction::Backward walks high index to low. always_inline so the kernel fuses into the loop with no
// call overhead. (Linear scratch the kernel may touch is left to the hardware prefetcher.)
template <Direction Dir, typename Field, typename Kernel>
[[gnu::always_inline]] inline void for_each_indexed_pair(AffineColumnSpan<Field>& buckets,
                                                         const std::pair<uint32_t, uint32_t>* pairs,
                                                         size_t n,
                                                         Kernel kernel) noexcept
{
    constexpr int64_t PREFETCH_AHEAD = 4;
    Field* const px = buckets.x.data();
    Field* const py = buckets.y.data();
    for (size_t s = 0; s < n; ++s) {
        const size_t i = (Dir == Direction::Backward) ? n - 1 - s : s;
        const int64_t pf = (Dir == Direction::Backward) ? static_cast<int64_t>(i) - PREFETCH_AHEAD
                                                        : static_cast<int64_t>(i) + PREFETCH_AHEAD;
        if (pf >= 0 && static_cast<size_t>(pf) < n) {
            __builtin_prefetch(px + pairs[pf].first, 1, 3);
            __builtin_prefetch(px + pairs[pf].second, 0, 3);
            __builtin_prefetch(py + pairs[pf].first, 1, 3);
            __builtin_prefetch(py + pairs[pf].second, 0, 3);
        }
        const uint32_t dst = pairs[i].first;
        const uint32_t src = pairs[i].second;
        kernel(px[dst], py[dst], px[src], py[src], i);
    }
}

// As for_each_indexed_pair, but one bucket per step (for doublings): kernel(x&, y&, i) over
// buckets[indices[i]], with the same prefetch and direction handling.
template <Direction Dir, typename Field, typename Kernel>
[[gnu::always_inline]] inline void for_each_indexed_point(AffineColumnSpan<Field>& buckets,
                                                          const uint32_t* indices,
                                                          size_t n,
                                                          Kernel kernel) noexcept
{
    constexpr int64_t PREFETCH_AHEAD = 4;
    Field* const px = buckets.x.data();
    Field* const py = buckets.y.data();
    for (size_t s = 0; s < n; ++s) {
        const size_t i = (Dir == Direction::Backward) ? n - 1 - s : s;
        const int64_t pf = (Dir == Direction::Backward) ? static_cast<int64_t>(i) - PREFETCH_AHEAD
                                                        : static_cast<int64_t>(i) + PREFETCH_AHEAD;
        if (pf >= 0 && static_cast<size_t>(pf) < n) {
            __builtin_prefetch(px + indices[pf], 1, 3);
            __builtin_prefetch(py + indices[pf], 1, 3);
        }
        const uint32_t b = indices[i];
        kernel(px[b], py[b], i);
    }
}

} // namespace bb
