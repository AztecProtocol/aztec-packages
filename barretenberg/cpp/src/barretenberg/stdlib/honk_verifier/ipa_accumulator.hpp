

#include <vector>
namespace bb::stdlib::recursion::honk {

template <typename Curve> struct IpaAccumulator {
    typename Curve::ScalarField log_poly_length;
    std::vector<typename Curve::ScalarField>
        u_challenges_inv;       // inverses of u challenges that represent the polynomial h; could be an array
    typename Curve::Group comm; // commitment to the polynomial h
};

} // namespace bb::stdlib::recursion::honk
