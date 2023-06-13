#pragma once
#include "field.hpp"
#include "../safe_uint/safe_uint.hpp"
#include "../bool/bool.hpp"

namespace proof_system::plonk {
namespace stdlib {

/**
 * Gets the number of contiguous nonzero values of an array from the start.
 * Note: This assumes `0` always means 'not used', so be careful. As soon as we locate 0, we stop the counting.
 * If you actually want `0` to be counted, you'll need something else.
 */
template <typename Composer, size_t SIZE> field_t<Composer> array_length(std::array<field_t<Composer>, SIZE> const& arr)
{
    field_t<Composer> length = 0;
    bool_t<Composer> hit_zero = false;
    for (const auto& e : arr) {
        bool_t<Composer> is_zero = e.is_zero();
        hit_zero.must_imply(is_zero, "Once we've hit the first zero, there must only be zeros thereafter!");
        hit_zero |= is_zero;
        const field_t<Composer> increment = !hit_zero;
        length += increment;
    }
    return length;
};

/**
 * Note: doesn't remove the last element from the array; only returns it!
 * Note: this assumes `0` always means 'not used', so be careful. If you actually want `0` to be counted, you'll need
 * something else.
 * If it returns `0`, the array is considered 'empty'.
 */
template <typename Composer, size_t SIZE> field_t<Composer> array_pop(std::array<field_t<Composer>, SIZE> const& arr)
{
    field_t<Composer> popped_value = 0;
    bool_t<Composer> already_popped = false;
    for (size_t i = arr.size() - 1; i != (size_t)-1; i--) {
        bool_t<Composer> is_non_zero = arr[i] != 0;
        popped_value = field_t<Composer>::conditional_assign(!already_popped && is_non_zero, arr[i], popped_value);

        already_popped |= is_non_zero;
    }
    already_popped.assert_equal(true, "array_pop cannot pop from an empty array");

    return popped_value;
};

/**
 * Note: this assumes `0` always means 'not used', so be careful. If you actually want `0` to be counted, you'll need
 * something else.
 */
template <typename Composer, size_t SIZE>
void array_push(std::array<field_t<Composer>, SIZE>& arr, field_t<Composer> const& value)
{
    bool_t<Composer> already_pushed = false;
    for (size_t i = 0; i < arr.size(); ++i) {
        bool_t<Composer> is_zero = arr[i] == 0;
        arr[i] = field_t<Composer>::conditional_assign(!already_pushed && is_zero, value, arr[i]);

        already_pushed |= is_zero;
    }
    already_pushed.assert_equal(true, "array_push cannot push to a full array");
};

/**
 * Note: this assumes `0` always means 'not used', so be careful. If you actually want `0` to be counted, you'll need
 * something else.
 */
template <typename Composer, size_t SIZE>
inline size_t array_push(std::array<std::optional<field_t<Composer>>, SIZE>& arr, field_t<Composer> const& value)
{
    for (size_t i = 0; i < arr.size(); ++i) {
        if (arr[i] == std::nullopt) {
            arr[i] = value;
            return i;
        }
    }
    throw_or_abort("array_push cannot push to a full array");
};

/**
 * Note: this assumes `0` always means 'not used', so be careful. If you actually want `0` to be counted, you'll need
 * something else.
 */
template <typename T, size_t SIZE>
inline size_t array_push(std::array<std::shared_ptr<T>, SIZE>& arr, std::shared_ptr<T> const& value)
{
    for (size_t i = 0; i < arr.size(); ++i) {
        if (arr[i] == nullptr) {
            arr[i] = value;
            return i;
        }
    }
    throw_or_abort("array_push cannot push to a full array");
};

/**
 * Note: this assumes `0` always means 'not used', so be careful. If you actually want `0` to be counted, you'll need
 * something else.
 */
template <typename Composer, typename T, size_t SIZE> inline void array_push(std::array<T, SIZE>& arr, T const& value)
{
    bool_t<Composer> already_pushed = false;
    for (size_t i = 0; i < arr.size(); ++i) {
        bool_t<Composer> is_zero = arr[i].is_empty();
        arr[i].conditional_select(!already_pushed && is_zero, value);

        already_pushed |= is_zero;
    }
    already_pushed.assert_equal(true, "array_push cannot push to a full array");
};

/**
 * Note: this assumes `0` always means 'not used', so be careful. If you actually want `0` to be counted, you'll need
 * something else.
 */
template <typename Composer, size_t SIZE>
typename plonk::stdlib::bool_t<Composer> is_array_empty(std::array<field_t<Composer>, SIZE> const& arr)
{
    bool_t<Composer> nonzero_found = false;
    for (size_t i = arr.size() - 1; i != (size_t)-1; i--) {
        bool_t<Composer> is_non_zero = arr[i] != 0;
        nonzero_found |= is_non_zero;
    }
    return !nonzero_found;
};

/**
 * Inserts the `source` array at the first zero-valued index of the `target` array.
 * Fails if the `source` array is too large vs the remaining capacity of the `target` array.
 */
template <typename Composer, size_t size_1, size_t size_2>
void push_array_to_array(std::array<field_t<Composer>, size_1> const& source,
                         std::array<field_t<Composer>, size_2>& target)
{
    field_t<Composer> target_length = array_length<Composer>(target);
    const field_t<Composer> overflow_capacity = target.max_size() + 1;

    field_t<Composer> j_ct = 0; // circuit-type index for the inner loop
    // Find the first empty slot in the target:
    field_t<Composer> next_target_index = target_length;

    bool_t<Composer> hit_s_zero = false;
    bool_t<Composer> not_hit_s_zero = true;

    for (size_t i = 0; i < source.max_size(); ++i) {
        // Loop over each source value we want to push:
        auto& s = source[i];
        {
            auto is_s_zero = s.is_zero();
            hit_s_zero.must_imply(is_s_zero,
                                  "Once we've hit the first source zero, there must only be zeros thereafter!");
            hit_s_zero |= is_s_zero;
            not_hit_s_zero = !hit_s_zero;
        }

        // Triangular loop:
        for (size_t j = i; j < target.max_size(); ++j) {
            auto& t = target[j];

            // Check whether we've reached the next target index at which we can push `s`:
            bool_t<Composer> at_next_target_index = j_ct == next_target_index;

            t = field_t<Composer>::conditional_assign(at_next_target_index && not_hit_s_zero, s, t);

            j_ct++;
        }

        next_target_index += not_hit_s_zero;

        next_target_index.assert_not_equal(overflow_capacity, "push_array_to_array target array capacity exceeded");

        j_ct = i + 1;
    }
}

} // namespace stdlib
} // namespace proof_system::plonk