

#include <vector>
namespace bb::stdlib::recursion::honk {

template <typename Curve> struct IpaAccumulator {
    typename Curve::Group comm;
    typename Curve::ScalarField eval_point;
    typename Curve::ScalarField eval;
};
} // namespace bb::stdlib::recursion::honk