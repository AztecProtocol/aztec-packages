#pragma once
#include <iomanip>
#include <map>
#include <optional>
#include <ostream>
#include <vector>

namespace std {

inline std::ostream& operator<<(std::ostream& os, std::vector<uint8_t> const& arr)
{
    std::ios_base::fmtflags f(os.flags());
    os << "[" << std::hex << std::setfill('0');
    for (auto byte : arr) {
        os << ' ' << std::setw(2) << +(unsigned char)byte;
    }
    os << " ]";
    os.flags(f);
    return os;
}

template <std::integral T, typename A> inline std::ostream& operator<<(std::ostream& os, std::vector<T, A> const& arr)
{
    os << "[";
    for (auto element : arr) {
        os << ' ' << element;
    }
    os << " ]";
    return os;
}

template <typename T, typename A>
requires(!std::integral<T>) inline std::ostream& operator<<(std::ostream& os, std::vector<T, A> const& arr)
{
    os << "[\n";
    for (auto element : arr) {
        os << ' ' << element << '\n';
    }
    os << "]";
    return os;
}

template <size_t S> inline std::ostream& operator<<(std::ostream& os, std::array<uint8_t, S> const& arr)
{
    std::ios_base::fmtflags f(os.flags());
    os << "[" << std::hex << std::setfill('0');
    for (auto byte : arr) {
        os << ' ' << std::setw(2) << +(unsigned char)byte;
    }
    os << " ]";
    os.flags(f);
    return os;
}

template <typename T, size_t S> inline std::ostream& operator<<(std::ostream& os, std::array<T, S> const& arr)
{
    std::ios_base::fmtflags f(os.flags());
    os << "[" << std::hex << std::setfill('0');
    for (auto element : arr) {
        os << ' ' << element;
    }
    os << " ]";
    os.flags(f);
    return os;
}

template <typename T, typename U> inline std::ostream& operator<<(std::ostream& os, std::pair<T, U> const& pair)
{
    os << "(" << pair.first << ", " << pair.second << ")";
    return os;
}

template <typename T> inline std::ostream& operator<<(std::ostream& os, std::optional<T> const& opt)
{
    return opt ? os << *opt : os << "std::nullopt";
}

template <typename T, typename U> inline std::ostream& operator<<(std::ostream& os, std::map<T, U> const& map)
{
    os << "[\n";
    for (const auto& elem : map) {
        os << " " << elem.first << ": " << elem.second << "\n";
    }
    os << "]";
    return os;
}
} // namespace std

namespace serialize {

/**
 * @brief Helper method for better error reporting. Clang does not give the best errors for "auto..."
 * arguments.
 */
inline void _stream_operator_write(std::ostream& os, const auto& field)
{
    using namespace serialize;
    os << field;
}

/**
 * @brief Automatically derived stream operator for any object that defines .msgpack() (implicitly defined by MSGPACK_FIELDS).
 * @param os The stream to write to.
 * @param obj The object to write.
 */
inline std::ostream& operator<<(std::ostream& os, const msgpack_concepts::HasMsgPack auto& obj)
{
    msgpack::msgpack_apply(obj, [&](auto&... obj_fields) {
        // apply 'operator<<' to each object field
        (_stream_operator_write(os, obj_fields), ...);
    });
    return os;
}

} // namespace serialize
