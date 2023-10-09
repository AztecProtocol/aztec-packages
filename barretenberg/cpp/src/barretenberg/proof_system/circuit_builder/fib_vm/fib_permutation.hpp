/// Class that holds a permutation relation to ensure that
/// x_shift and y_shift are infact permutations of the other poly
/// This is super useful

// namespace proof_system::fib_vm {

// template <typename FF_> class FibPermutationRelationImpl {
//   public:
//     using FF = FF_;

//     // 1 + degree
//     static constexpr size_t RELATION_LENGTH = 6;

//     static constexpr size_t LEN_1 = 6; // grand product construction sub-relation
//     static constexpr size_t LEN_2 = 3; // left-shiftable polynomial sub-relation

//     inline static auto& get_grand_product_polynomial(auto& input) { return input.z_perm; }
//     inline static auto& get_shifted_grand_product_polynomial(auto& input) { return input.z_perm_shift; }

//     // Get the sets of columns that are meant to be permuations of each other
//     // add to the grand product contribution
//     template <typename AccumulatorTypes>
//     inline static Accumulator<AccumulatorTypes> compute_left_relation(const auto& input,
//                                                                       const RelationParameters<FF>&
//                                                                       relation_parameters, const size_t index)
//     {
//         auto x = get_view<FF, AccumulatorTypes>(input.x, index);
//         auto x_shift = get_view<FF, AccumulatorTypes>(input.x, index);

//         auto y = get_view<FF, AccumulatorTypes>(input.y, index);
//         auto y_shift = get_view<FF, AccumulatorTypes>(input.y, index);

//         const auto& beta = relation_parameters.beta;
//         const auto& gamma = relation_parameters.gamma;

//         return (x + x_shift * beta + gamma) * (y + y_shift * beta + gamma);
//     }

//     template <typename AccumulatorTypes>
//     inline static Accumulator<AccumulatorTypes> compute_right_relation(
//         const auto& input, const RelationParameters<FF>& relation_parameters, const size_t index)
//     {
//         auto x = get_view<FF, AccumulatorTypes>(input.x, index);
//         auto x_shift = get_view<FF, AccumulatorTypes>(input.x, index);

//         auto y = get_view<FF, AccumulatorTypes>(input.y, index);
//         auto y_shift = get_view<FF, AccumulatorTypes>(input.y, index);

//         const auto& beta = relation_parameters.beta;
//         const auto& gamma = relation_parameters.gamma;

//         return (x + x_shift * beta + gamma) * (y + y_shift * beta + gamma);
//     }
// }

// } // namespace proof_system::fib_vm