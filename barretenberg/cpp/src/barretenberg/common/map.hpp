#pragma once
#include <algorithm>
#include <array>
#include <type_traits>

namespace bb::transform {
/*
 * Generic map function for mapping a containers element to another type.
 */
template <template <typename, typename...> typename Cont,
          typename InElem,
          typename... Args,
          typename F,
          typename OutElem = typename std::invoke_result<F, InElem const&>::type>
Cont<OutElem> map(Cont<InElem, Args...> const& in, F&& op)
{
    Cont<OutElem> result;
    std::transform(in.begin(), in.end(), std::back_inserter(result), op);
    return result;
}

/*
 * Generic map function for mapping a std::array's elements to another type.
 */
template <std::size_t SIZE,
          typename InElem,
          typename F,
          typename OutElem = typename std::invoke_result<F, InElem const&>::type>
std::array<OutElem, SIZE> map(std::array<InElem, SIZE> const& in, F&& op)
{
    std::array<OutElem, SIZE> result;
    std::transform(in.begin(), in.end(), result.begin(), op);
    return result;
}
} // namespace bb::transform
