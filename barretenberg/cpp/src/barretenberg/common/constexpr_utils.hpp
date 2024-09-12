#pragma once

#include <cstddef>
#include <tuple>
#include <utility>

namespace bb {
namespace detail {

/**
 * @brief Create an index sequence from Min to Max (not included) with an increment of Inc
 */
template <size_t Min, size_t Max, size_t Inc> constexpr auto make_index_range()
{
    static_assert(Max >= Min);
    static_assert(Inc >= 1);
    return []<size_t... Is>(std::index_sequence<Is...>) {
        return std::index_sequence<Min + (Is * Inc)...>{};
    }(std::make_index_sequence<(Max - Min - 1) / Inc + 1>{});
}

} // namespace detail

/**
 * @brief Implements a loop using a compile-time iterator. Requires c++20.
 * Implementation (and description) from https://artificial-mind.net/blog/2020/10/31/constexpr-for
 *
 * @tparam Start the loop start value
 * @tparam End the loop end value
 * @tparam Inc how much the iterator increases by per iteration
 * @tparam F a Lambda function that is executed once per loop
 *
 * @param f An rvalue reference to the lambda
 * @details Implements a `for` loop where the iterator is a constexpr variable.
 * Use this when you need to evaluate `if constexpr` statements on the iterator (or apply other constexpr expressions)
 * Outside of this use-case avoid using this fn as it gives negligible performance increases vs regular loops.
 *
 * N.B. A side-effect of this method is that all loops will be unrolled
 * (each loop iteration uses different iterator template parameters => unique constexpr_for implementation per
 * iteration)
 * Do not use this for large (~100+) loops!
 *
 * ##############################
 * EXAMPLE USE OF `constexpr_for`
 * ##############################
 *
 * constexpr_for<0, 10, 1>([&]<size_t i>(){
 *  if constexpr (i & 1 == 0)
 *  {
 *      foo[i] = even_container[i >> 1];
 *  }
 *  else
 *  {
 *      foo[i] = odd_container[i >> 1];
 *  }
 * });
 *
 * In the above example we are iterating from i = 0 to i < 10.
 * The provided lambda function has captured everything in its surrounding scope (via `[&]`),
 * which is where `foo`, `even_container` and `odd_container` have come from.
 *
 * We do not need to explicitly define the `class F` parameter as the compiler derives it from our provided input
 * argument `F&& f` (i.e. the lambda function)
 *
 * In the loop itself we're evaluating a constexpr if statement that defines which code path is taken.
 *
 * The above example benefits from `constexpr_for` because a run-time `if` statement has been reduced to a compile-time
 * `if` statement. N.B. this would only give measurable improvements if the `constexpr_for` statement is itself in a hot
 * loop that's iterated over many (>thousands) times
 */
template <size_t Start, size_t End, size_t Inc, class F> constexpr void constexpr_for(F&& f)
{
    // F must be a template lambda with a single **typed** template parameter that represents the iterator
    // (e.g. [&]<size_t i>(){ ... } is good)
    // (and [&]<typename i>(){ ... } won't compile!)
    constexpr auto indices = detail::make_index_range<Start, End, Inc>();
    [&]<size_t... Is>(std::index_sequence<Is...>) { (f.template operator()<Is>(), ...); }(indices);
}

}; // namespace bb