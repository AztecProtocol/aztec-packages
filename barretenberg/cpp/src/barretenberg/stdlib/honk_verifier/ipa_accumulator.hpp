

#include <vector>
namespace bb::stdlib::recursion::honk {

template <typename Curve> struct IpaAccumulator {
    typename Curve::Group comm;
    typename Curve::ScalarField eval_point;
    typename Curve::ScalarField eval;
    std::vector<typename Curve::ScalarField> ipa_proof;
};
} // namespace bb::stdlib::recursion::honk