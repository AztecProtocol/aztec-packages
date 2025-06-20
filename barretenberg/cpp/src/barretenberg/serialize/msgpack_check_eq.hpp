#pragma once

#include "barretenberg/common/log.hpp"
#include "msgpack.hpp"
#include "msgpack_impl/drop_keys.hpp"
#include <cstddef>
#include <string_view>

namespace msgpack {

/**
 * @brief Ensures that two msgpack objects are equal by applying the msgpack method to both and comparing the results.
 */
template <msgpack_concepts::HasMsgPack T>
bool msgpack_check_eq(const T& v1, const T& v2, const std::string_view& error_message)
{
    bool had_error = false;
    // hack: const_cast is used to allow the msgpack method to be called on const objects without doubling up the
    // function definition.
    const_cast<T&>(v1).msgpack([&](auto&... args1) {     // NOLINT
        const_cast<T&>(v2).msgpack([&](auto&... args2) { // NOLINT
            // Capture args1 and args2 as const ref tuples and then iterate through each, comparing the values
            auto args1_tuple = std::tie(args1...);
            auto args2_tuple = std::tie(args2...);
            constexpr auto size1 = std::tuple_size<decltype(args1_tuple)>::value;
            const char* current_label = "";
            constexpr_for<0, size1, 1>([&]<size_t i>() {
                if constexpr (i % 2 == 0) {
                    current_label = std::get<i>(args1_tuple);
                } else {
                    auto arg1 = std::get<i>(args1_tuple);
                    auto arg2 = std::get<i>(args2_tuple);
                    if (arg1 != arg2) {
                        if (!had_error) {
                            info(error_message);
                        }
                        had_error = true;
                        info(current_label, ": ", arg1, " != ", arg2);
                    }
                }
            });
        });
    });
    return !had_error;
}
} // namespace msgpack
