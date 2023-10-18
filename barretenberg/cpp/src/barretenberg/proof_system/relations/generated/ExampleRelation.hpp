
#pragma once
#include "../relation_parameters.hpp"
#include "../relation_types.hpp"

namespace proof_system::ExampleRelation_vm {

template <typename FF> struct Row {
    FF Fibonacci_ISLAST;
    FF Fibonacci_x;
    FF Fibonacci_y;
    FF Fibonacci_x_shift;
    FF Fibonacci_y_shift;
};

template <typename FF_> class ExampleRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 4> SUBRELATION_LENGTHS{
        3, // primary arithmetic sub-relation
        3, // secondary arithmetic sub-relation
        3, // secondary arithmetic sub-relation
        3, // secondary arithmetic sub-relation
    };

    template <typename ContainerOverSubrelations, typename AllEntitites>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntitites& new_term,
                           const RelationParameters<FF>&,
                           const FF& scaling_factor)
    {

        // Contribution 0
        {

            using View = typename std::tuple_element<0, ContainerOverSubrelations>::type;
            [[maybe_unused]] const auto& Fibonacci_ISLAST = View(new_term.Fibonacci_ISLAST);
            [[maybe_unused]] const auto& Fibonacci_x = View(new_term.Fibonacci_x);
            [[maybe_unused]] const auto& Fibonacci_y = View(new_term.Fibonacci_y);
            [[maybe_unused]] const auto& Fibonacci_x_shift = View(new_term.Fibonacci_x_shift);
            [[maybe_unused]] const auto& Fibonacci_y_shift = View(new_term.Fibonacci_y_shift);

            auto tmp = (Fibonacci_ISLAST * (Fibonacci_y_shift - FF(1)));
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
        // Contribution 1
        {

            using View = typename std::tuple_element<1, ContainerOverSubrelations>::type;
            [[maybe_unused]] const auto& Fibonacci_ISLAST = View(new_term.Fibonacci_ISLAST);
            [[maybe_unused]] const auto& Fibonacci_x = View(new_term.Fibonacci_x);
            [[maybe_unused]] const auto& Fibonacci_y = View(new_term.Fibonacci_y);
            [[maybe_unused]] const auto& Fibonacci_x_shift = View(new_term.Fibonacci_x_shift);
            [[maybe_unused]] const auto& Fibonacci_y_shift = View(new_term.Fibonacci_y_shift);

            auto tmp = (Fibonacci_ISLAST * (Fibonacci_x_shift - FF(1)));
            tmp *= scaling_factor;
            std::get<1>(evals) += tmp;
        }
        // Contribution 2
        {

            using View = typename std::tuple_element<2, ContainerOverSubrelations>::type;
            [[maybe_unused]] const auto& Fibonacci_ISLAST = View(new_term.Fibonacci_ISLAST);
            [[maybe_unused]] const auto& Fibonacci_x = View(new_term.Fibonacci_x);
            [[maybe_unused]] const auto& Fibonacci_y = View(new_term.Fibonacci_y);
            [[maybe_unused]] const auto& Fibonacci_x_shift = View(new_term.Fibonacci_x_shift);
            [[maybe_unused]] const auto& Fibonacci_y_shift = View(new_term.Fibonacci_y_shift);

            auto tmp = (-Fibonacci_ISLAST + FF(1)) * (Fibonacci_x_shift - Fibonacci_y);
            tmp *= scaling_factor;
            std::get<2>(evals) += tmp;
        }
        // Contribution 3
        {

            using View = typename std::tuple_element<3, ContainerOverSubrelations>::type;
            [[maybe_unused]] const auto& Fibonacci_ISLAST = View(new_term.Fibonacci_ISLAST);
            [[maybe_unused]] const auto& Fibonacci_x = View(new_term.Fibonacci_x);
            [[maybe_unused]] const auto& Fibonacci_y = View(new_term.Fibonacci_y);
            [[maybe_unused]] const auto& Fibonacci_x_shift = View(new_term.Fibonacci_x_shift);
            [[maybe_unused]] const auto& Fibonacci_y_shift = View(new_term.Fibonacci_y_shift);

            auto tmp = (-Fibonacci_ISLAST + FF(1)) * (Fibonacci_y_shift - (Fibonacci_x + Fibonacci_y));
            tmp *= scaling_factor;
            std::get<3>(evals) += tmp;
        }
    }
};

template <typename FF> using ExampleRelation = Relation<ExampleRelationImpl<FF>>;

} // namespace proof_system::ExampleRelation_vm