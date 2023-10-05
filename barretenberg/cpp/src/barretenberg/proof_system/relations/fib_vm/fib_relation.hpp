#pragma once
#include "../relation_parameters.hpp"
#include "../relation_types.hpp"

// constant %N = 16;

// This uses the alternative nomenclature as well.

// namespace Fibonacci(%N);
//     col fixed ISLAST(i) { match i {
//         %N - 1 => 1,
//         _ => 0,
//     } };
//     col witness x, y;
//
//     ISLAST * (y' - 1) = 0;
//     ISLAST * (x' - 1) = 0;
//
//     (1-ISLAST) * (x' - y) = 0;
//     (1-ISLAST) * (y' - (x + y)) = 0;
//
//     public out = y(%N-1);

// Titles
//
// We are trying to create a relation for the Fibonacci sequence; from this PIL file.
// We want a one to one relationship between

namespace proof_system::fib_vm {

// Stores the values of x and y as well as the previous values of x and y
template <typename FF> struct FibRow {
    FF x;
    FF y;
    FF x_prev;
    FF y_prev;
    FF is_last;
};

template <typename FF> struct VMOperation {
    FF x;
    FF y;
};

template <typename FF_> class FibonacciRelation {
  public:
    // What is the point of this assignemnt, can we not just use FF verbatim?
    using FF = FF_;

    // 1 + polynomial degree of this relation -> work it out by hand
    static constexpr size_t RELATION_LENGTH = 3;

    // The degree of each relation
    static constexpr size_t DEGREE_1 = 3;
    static constexpr size_t DEGREE_2 = 3;
    static constexpr size_t DEGREE_3 = 3;
    static constexpr size_t DEGREE_4 = 3;

    // TODO: do we need this accumulator to get stuFF to work?
    // Or is it just a security thing and we can get away with removing it?
    template <template <size_t...> typename SubtrelationAccumulatorsTemplate>
    using GetAccumulatorTypes = SubtrelationAccumulatorsTemplate<DEGREE_1, DEGREE_2, DEGREE_3, DEGREE_4>;

    // NOTE: why are they all called accumulate, is this a honk specific thing?
    template <typename AccumulatorTypes>
    void static accumulate(typename AccumulatorTypes::Accumulators& evals,

                           // New term is a row of the relation
                           const auto& new_term,

                           // TODO: LOOK INTO THIS
                           // I think these are for relations like copies etc ->
                           const RelationParameters<FF>&,

                           // Scaling factor is just relevant to honk itself, ( proving correctness ) and is not used in
                           // the relations themselves
                           [[maybe_unused]] const FF& scaling_factor)
    {

        // NOTE: for now i am experimenting with implementing each low degree relation i can see as it's
        // own contribution / relaion set

        // Contribution 1
        // In this example I am treating x' as x, and x as x_prev,
        // This is so that it remains within my mental model for how pil etc work.
        {
            using View = typename std::tuple_element<0, typename AccumulatorTypes::AccumulatorViews>::type;
            auto y = View(new_term.y);
            auto is_last = View(new_term.is_last);

            auto tmp = is_last * (y - FF(1));
            std::get<0>(evals) += tmp;
        }
        // Contribution 2
        {
            using View = typename std::tuple_element<1, typename AccumulatorTypes::AccumulatorViews>::type;
            auto x = View(new_term.x);
            auto is_last = View(new_term.is_last);

            auto tmp = is_last * (x - FF(1));
            std::get<1>(evals) += tmp;
        }

        // Contribution 3
        // (1-ISLAST) * (x' - y) = 0;
        {
            using view = typename std::tuple_element<2, typename AccumulatorTypes::AccumulatorViews>::type;
            auto x = view(new_term.x);
            auto y_prev = view(new_term.y_prev);
            auto is_last = view(new_term.is_last);

            auto tmp = (FF(1) - is_last) * (x - y_prev);
            std::get<2>(evals) += tmp;
        }
        // Contribution 4
        // (1-ISLAST) * (y' - (x + y)) = 0;
        {
            using view = typename std::tuple_element<3, typename AccumulatorTypes::AccumulatorViews>::type;
            auto x_prev = view(new_term.x_prev);
            auto y_prev = view(new_term.y_prev);
            auto y = view(new_term.y);
            auto is_last = view(new_term.is_last);

            auto tmp = (FF(1) - is_last) * (y - (x_prev + y_prev));
            std::get<3>(evals) += tmp;
        }

        // NOTE: Replace the prev columns with copys / shifts once i work that out
    }
};

// The fib relation can now be used and proven against?
// TODO:
// - see how this relation code is turned into verifier code at the end of this
template <typename FF> using FibRelation = Relation<FibonacciRelation<FF>>;

} // namespace proof_system::fib_vm