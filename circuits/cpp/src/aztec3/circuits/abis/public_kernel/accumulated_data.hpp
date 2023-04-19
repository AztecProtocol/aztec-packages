#pragma once
#include "aztec3/constants.hpp"
#include <barretenberg/stdlib/recursion/aggregation_state/aggregation_state.hpp>
#include <barretenberg/common/map.hpp>
#include <barretenberg/stdlib/primitives/witness/witness.hpp>
#include <aztec3/utils/array.hpp>
#include <aztec3/utils/types/native_types.hpp>
#include <aztec3/utils/types/circuit_types.hpp>
#include <aztec3/utils/types/convert.hpp>

namespace aztec3::circuits::abis::public_kernel {

using aztec3::utils::zero_array;
using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using std::is_same;

template <typename NCT> struct AccumulatedData {
    typedef typename NCT::fr fr;
    typedef typename NCT::boolean boolean;
    typedef typename NCT::AggregationObject AggregationObject;

    AggregationObject aggregation_object{};

    fr public_call_count = 0;

    std::array<fr, KERNEL_PUBLIC_CALL_STACK_LENGTH> public_call_stack =
        zero_array<fr, KERNEL_PUBLIC_CALL_STACK_LENGTH>();

    std::array<StateTransition<NCT>, STATE_TRANSITIONS_LENGTH> state_transitions{};

    boolean operator==(AccumulatedData<NCT> const& other) const
    {
        return aggregation_object == other.aggregation_object && public_call_count == other.public_call_count &&
               public_call_stack == other.public_call_stack && state_transitions == other.state_transitions;
    };

    template <typename Composer> AccumulatedData<CircuitTypes<Composer>> to_circuit_type(Composer& composer) const
    {
        typedef CircuitTypes<Composer> CT;
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the composer:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(composer, e); };
        auto to_circuit_type = [&](auto& e) { return e.to_circuit_type(composer); };

        AccumulatedData<CT> acc_data = { typename CT::AggregationObject{
                                             to_ct(aggregation_object.P0),
                                             to_ct(aggregation_object.P1),
                                             to_ct(aggregation_object.public_inputs),
                                             aggregation_object.proof_witness_indices,
                                             aggregation_object.has_data,
                                         },

                                         to_ct(public_call_count),
                                         to_ct(public_call_stack),
                                         to_ct(state_transitions) };

        return acc_data;
    };

    template <typename Composer> AccumulatedData<NativeTypes> to_native_type() const
    {
        static_assert(std::is_same<CircuitTypes<Composer>, NCT>::value);
        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Composer>(e); };
        auto to_native_type = []<typename T>(T& e) { return e.template to_native_type<Composer>(); };

        AccumulatedData<NativeTypes> acc_data = {
            typename NativeTypes::AggregationObject{
                to_nt(aggregation_object.P0),
                to_nt(aggregation_object.P1),
                to_nt(aggregation_object.public_inputs),
                aggregation_object.proof_witness_indices,
                aggregation_object.has_data,
            },

            to_nt(public_call_count),
            to_nt(public_call_stack),
            to_nt(state_transitions),
        };

        return acc_data;
    };

    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        aggregation_object.add_proof_outputs_as_public_inputs();

        public_call_count.set_public();
        set_array_public(public_call_stack);
        set_array_public(state_transitions);
    }

    template <typename T, size_t SIZE> void set_array_public(std::array<T, SIZE>& arr)
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));
        for (T& e : arr) {
            fr(e).set_public();
        }
    }
};

template <typename NCT> void read(uint8_t const*& it, AccumulatedData<NCT>& accum_data)
{
    using serialize::read;

    read(it, accum_data.aggregation_object);
    read(it, accum_data.public_call_count);
    read(it, accum_data.public_call_stack);
    read(it, accum_data.state_transitions);
};

template <typename NCT> void write(std::vector<uint8_t>& buf, AccumulatedData<NCT> const& accum_data)
{
    using serialize::write;

    write(buf, accum_data.aggregation_object);
    write(buf, accum_data.public_call_count);
    write(buf, accum_data.public_call_stack);
    write(buf, accum_data.state_transitions);
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, AccumulatedData<NCT> const& accum_data)
{
    return os << "aggregation_object:\n"
              << accum_data.aggregation_object << "\n"
              << "public_call_count: " << accum_data.public_call_count << "\n"
              << "public_call_stack:\n"
              << accum_data.public_call_stack << "\n"
              << "state_transtions:\n"
              << accum_data.state_transitions << "\n";
}

} // namespace aztec3::circuits::abis::public_kernel