
#include "barretenberg/vm/generated/copy_circuit_builder.hpp"

namespace bb {
namespace {

template <typename FF> std::string field_to_string(const FF& ff)
{
    std::ostringstream os;
    os << ff;
    std::string raw = os.str();
    auto first_not_zero = raw.find_first_not_of('0', 2);
    std::string result = "0x" + (first_not_zero != std::string::npos ? raw.substr(first_not_zero) : "0");
    return result;
}

} // namespace

template <typename FF> std::vector<std::string> CopyFullRow<FF>::names()
{
    return { "copy_sigma_x", "copy_sigma_y", "copy_sigma_z", "copy_x", "copy_y", "copy_z", "id_0", "id_1", "id_2", "" };
}

template <typename FF> std::ostream& operator<<(std::ostream& os, CopyFullRow<FF> const& row)
{
    return os << field_to_string(row.copy_sigma_x) << "," << field_to_string(row.copy_sigma_y) << ","
              << field_to_string(row.copy_sigma_z) << "," << field_to_string(row.copy_x) << ","
              << field_to_string(row.copy_y) << "," << field_to_string(row.copy_z) << "," << field_to_string(row.id_0)
              << "," << field_to_string(row.id_1) << "," << field_to_string(row.id_2)
              << ","
                 "";
}

// Explicit template instantiation.
template std::ostream& operator<<(std::ostream& os, AvmFullRow<bb::AvmFlavor::FF> const& row);
template std::vector<std::string> AvmFullRow<bb::AvmFlavor::FF>::names();

} // namespace bb