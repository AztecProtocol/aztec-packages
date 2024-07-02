
#pragma once
#include "../../relation_parameters.hpp"
#include "../../relation_types.hpp"
#include "./declare_views.hpp"

namespace bb::Copy_vm {

template <typename FF> struct CopyRow {
    FF copy_d{};
    FF copy_d_shift{};

    [[maybe_unused]] static std::vector<std::string> names();
};

inline std::string get_relation_label_copy(int index)
{
    switch (index) {}
    return std::to_string(index);
}

template <typename FF_> class copyImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 1> SUBRELATION_PARTIAL_LENGTHS{
        2,
    };

    template <typename ContainerOverSubrelations, typename AllEntities>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& new_term,
                           [[maybe_unused]] const RelationParameters<FF>&,
                           [[maybe_unused]] const FF& scaling_factor)
    {

        // Contribution 0
        {
            Copy_DECLARE_VIEWS(0);

            auto tmp = (copy_d_shift - copy_d);
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
    }
};

template <typename FF> using copy = Relation<copyImpl<FF>>;

} // namespace bb::Copy_vm