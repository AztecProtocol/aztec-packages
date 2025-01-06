

#include <vector>
namespace bb::stdlib::recursion::honk {

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1009): Make the us vector an array after we constify eccvm
// circuit size.
template <typename Curve> struct IpaAccumulator {
    typename Curve::ScalarField log_poly_length;
    std::vector<typename Curve::ScalarField>
        u_challenges_inv;       // inverses of u challenges that represent the polynomial h
    typename Curve::Group comm; // commitment to the polynomial h
};

} // namespace bb::stdlib::recursion::honk