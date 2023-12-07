
#pragma once
#include "../../relation_parameters.hpp"
#include "../../relation_types.hpp"
#include "./declare_views.hpp"

namespace proof_system::Toy_vm {

template <typename FF> struct Toy_avmRow {};

template <typename FF_> class toy_avmImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 0> SUBRELATION_PARTIAL_LENGTHS{};

    template <typename ContainerOverSubrelations, typename AllEntities>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& new_term,
                           [[maybe_unused]] const RelationParameters<FF>&,
                           [[maybe_unused]] const FF& scaling_factor)
    {}
};

template <typename FF> using toy_avm = Relation<toy_avmImpl<FF>>;

} // namespace proof_system::Toy_vm