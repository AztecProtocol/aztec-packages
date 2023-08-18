#pragma once

#include "aztec3/utils/types/circuit_types.hpp"
#include "aztec3/utils/types/convert.hpp"
#include "aztec3/utils/types/native_types.hpp"

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;

// template <typename SE, size_t SIZE>
// void spread_struct_arr_into_vec(std::array<SE, SIZE> const& arr, std::vector<SE>& vec)
//{
//     const auto arr_size = sizeof(arr) / sizeof(SE);
//     vec.insert(vec.end(), arr.data, arr.data() + arr_size);
// }

template <typename NCT> struct SideEffect {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    fr value = 0;
    fr side_effect_counter = 0;

    // For serialization, update with new fields
    MSGPACK_FIELDS(value, side_effect_counter);
    boolean operator==(SideEffect<NCT> const& other) const
    {
        return value == other.value && side_effect_counter == other.side_effect_counter;
    };

    template <typename Builder> SideEffect<CircuitTypes<Builder>> to_circuit_type(Builder& builder) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the circuit builder:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(builder, e); };

        SideEffect<CircuitTypes<Builder>> side_effect = {
            to_ct(value),
            to_ct(side_effect_counter),
        };

        return side_effect;
    };

    template <typename Builder> SideEffect<NativeTypes> to_native_type() const
    {
        static_assert((std::is_same<CircuitTypes<Builder>, NCT>::value));
        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Builder>(e); };

        SideEffect<NativeTypes> side_effect = {
            to_nt(value),
            to_nt(side_effect_counter),
        };

        return side_effect;
    };

    SideEffect<NCT> static conditional_assign(boolean const& predicate,
                                              SideEffect<NCT> const& lhs,
                                              SideEffect<NCT> const& rhs)
    {
        return SideEffect{
            fr::conditional_assign(predicate, lhs.value, rhs.value),
            fr::conditional_assign(predicate, lhs.side_effect_counter, rhs.side_effect_counter),
        };
    }

    // TODO(dbanks12): should `assert_is_zero` just return whether value is zero?
    template <typename Builder> void assert_is_zero()
    {
        static_assert((std::is_same<CircuitTypes<Builder>, NCT>::value));

        value.assert_is_zero();
        side_effect_counter.assert_is_zero();
    }

    boolean is_empty() const { return ((value.is_zero()) && (side_effect_counter.is_zero())); }

    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        value.set_public();
        side_effect_counter.set_public();
    }
};

template <typename NCT> struct SideEffectLinkedToNoteHash {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    fr value = 0;
    fr note_hash = 0;
    fr side_effect_counter = 0;

    // For serialization, update with new fields
    MSGPACK_FIELDS(value, note_hash, side_effect_counter);
    boolean operator==(SideEffectLinkedToNoteHash<NCT> const& other) const
    {
        return value == other.value && note_hash == other.note_hash && side_effect_counter == other.side_effect_counter;
    };

    template <typename Builder>
    SideEffectLinkedToNoteHash<CircuitTypes<Builder>> to_circuit_type(Builder& builder) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the circuit builder:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(builder, e); };

        SideEffectLinkedToNoteHash<CircuitTypes<Builder>> side_effect = {
            to_ct(value),
            to_ct(note_hash),
            to_ct(side_effect_counter),
        };

        return side_effect;
    };

    template <typename Builder> SideEffectLinkedToNoteHash<NativeTypes> to_native_type() const
    {
        static_assert((std::is_same<CircuitTypes<Builder>, NCT>::value));
        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Builder>(e); };

        SideEffectLinkedToNoteHash<NativeTypes> side_effect = {
            to_nt(value),
            to_nt(note_hash),
            to_nt(side_effect_counter),
        };

        return side_effect;
    };

    SideEffectLinkedToNoteHash<NCT> static conditional_assign(boolean const& predicate,
                                                              SideEffectLinkedToNoteHash<NCT> const& lhs,
                                                              SideEffectLinkedToNoteHash<NCT> const& rhs)
    {
        return SideEffectLinkedToNoteHash{
            fr::conditional_assign(predicate, lhs.value, rhs.value),
            fr::conditional_assign(predicate, lhs.note_hash, rhs.note_hash),
            fr::conditional_assign(predicate, lhs.side_effect_counter, rhs.side_effect_counter),
        };
    }

    // TODO(dbanks12): should `assert_is_zero` just return whether value is zero?
    template <typename Builder> void assert_is_zero()
    {
        static_assert((std::is_same<CircuitTypes<Builder>, NCT>::value));

        value.assert_is_zero();
        note_hash.assert_is_zero();
        side_effect_counter.assert_is_zero();
    }

    boolean is_empty() const { return ((value.is_zero()) && (note_hash.is_zero()) && (side_effect_counter.is_zero())); }

    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        value.set_public();
        note_hash.set_public();
        side_effect_counter.set_public();
    }
};

template <typename NCT> struct SideEffectWithRange {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    fr value = 0;
    fr start_side_effect_counter = 0;
    fr end_side_effect_counter = 0;

    // For serialization, update with new fields
    MSGPACK_FIELDS(value, start_side_effect_counter, end_side_effect_counter);
    boolean operator==(SideEffectWithRange<NCT> const& other) const
    {
        return value == other.value && start_side_effect_counter == other.start_side_effect_counter &&
               end_side_effect_counter == other.end_side_effect_counter;
    };

    template <typename Builder> SideEffectWithRange<CircuitTypes<Builder>> to_circuit_type(Builder& builder) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the circuit builder:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(builder, e); };

        SideEffectWithRange<CircuitTypes<Builder>> side_effect = {
            to_ct(value),
            to_ct(start_side_effect_counter),
            to_ct(end_side_effect_counter),
        };

        return side_effect;
    };

    template <typename Builder> SideEffectWithRange<NativeTypes> to_native_type() const
    {
        static_assert((std::is_same<CircuitTypes<Builder>, NCT>::value));
        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Builder>(e); };

        SideEffectWithRange<NativeTypes> side_effect = {
            to_nt(value),
            to_nt(start_side_effect_counter),
            to_nt(end_side_effect_counter),
        };

        return side_effect;
    };

    SideEffectWithRange<NCT> static conditional_assign(boolean const& predicate,
                                                       SideEffectWithRange<NCT> const& lhs,
                                                       SideEffectWithRange<NCT> const& rhs)
    {
        return SideEffectWithRange{
            fr::conditional_assign(predicate, lhs.value, rhs.value),
            fr::conditional_assign(predicate, lhs.start_side_effect_counter, rhs.start_side_effect_counter),
            fr::conditional_assign(predicate, lhs.end_side_effect_counter, rhs.end_side_effect_counter),
        };
    }

    // TODO(dbanks12): should `assert_is_zero` just return whether value is zero?
    template <typename Builder> void assert_is_zero()
    {
        static_assert((std::is_same<CircuitTypes<Builder>, NCT>::value));

        value.assert_is_zero();
        start_side_effect_counter.assert_is_zero();
        end_side_effect_counter.assert_is_zero();
    }

    boolean is_empty() const
    {
        return ((value.is_zero()) && (start_side_effect_counter.is_zero()) && (end_side_effect_counter.is_zero()));
    }

    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        value.set_public();
        start_side_effect_counter.set_public();
        end_side_effect_counter.set_public();
    }
};

}  // namespace aztec3::circuits::abis