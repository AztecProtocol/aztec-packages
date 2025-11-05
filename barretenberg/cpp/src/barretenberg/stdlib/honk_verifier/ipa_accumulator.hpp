// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include <vector>
namespace bb::stdlib::recursion::honk {

template <typename Curve> struct IpaAccumulator {
    std::vector<typename Curve::ScalarField>
        u_challenges_inv;       // inverses of u challenges that represent the polynomial h; could be an array
    typename Curve::Group comm; // commitment to the polynomial h (a.k.a. the challenge polynomial): ∏_{i ∈ [k]} (1 +
                                // u-challenges-inv_{len-i}.X^{2^{i-1}})
    bool running_truth_value;   // the running truth value of the accumulator (not in-circuit)
};

} // namespace bb::stdlib::recursion::honk
