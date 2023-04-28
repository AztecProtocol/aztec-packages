#pragma once
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include <string>
#include <cxxabi.h>

namespace msgpack {
template <typename T> std::string schema_name(T const&)
{
    std::string result = abi::__cxa_demangle(typeid(T).name(), NULL, NULL, NULL);
    if (result.find("basic_string") != std::string::npos) {
        return "string";
    }
    if (result == "i") {
        return "int";
    }

    if (result.find('<') != size_t(-1)) {
        result = result.substr(0, result.find('<'));
    }
    if (result.rfind(':') != size_t(-1)) {
        result = result.substr(result.rfind(':') + 1, result.size());
    }
    return result;
}
// Specializations
inline std::string schema_name(barretenberg::g1::affine_element const&)
{
    return "G1AffineElement";
}
} // namespace msgpack