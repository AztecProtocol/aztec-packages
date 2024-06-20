
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
    return { "copy_n",       "copy_a",
             "copy_b",       "copy_c",
             "copy_d",       "copy_sigma_a",
             "copy_sigma_b", "copy_sigma_c",
             "copy_sigma_d", "copy_sigma_x",
             "copy_sigma_y", "copy_sigma_z",
             "copy_x",       "copy_y",
             "copy_z",       "copy_main",
             "copy_second",  "id_0",
             "id_1",         "id_2",
             "id_3",         "" };
}

template <typename FF> std::ostream& operator<<(std::ostream& os, CopyFullRow<FF> const& row)
{
    return os << field_to_string(row.copy_n) << "," << field_to_string(row.copy_a) << "," << field_to_string(row.copy_b)
              << "," << field_to_string(row.copy_c) << "," << field_to_string(row.copy_d) << ","
              << field_to_string(row.copy_sigma_a) << "," << field_to_string(row.copy_sigma_b) << ","
              << field_to_string(row.copy_sigma_c) << "," << field_to_string(row.copy_sigma_d) << ","
              << field_to_string(row.copy_sigma_x) << "," << field_to_string(row.copy_sigma_y) << ","
              << field_to_string(row.copy_sigma_z) << "," << field_to_string(row.copy_x) << ","
              << field_to_string(row.copy_y) << "," << field_to_string(row.copy_z) << ","
              << field_to_string(row.copy_main) << "," << field_to_string(row.copy_second) << ","
              << field_to_string(row.id_0) << "," << field_to_string(row.id_1) << "," << field_to_string(row.id_2)
              << "," << field_to_string(row.id_3)
              << ","
                 "";
}

// Explicit template instantiation.
template std::ostream& operator<<(std::ostream& os, CopyFullRow<bb::CopyFlavor::FF> const& row);
template std::vector<std::string> CopyFullRow<bb::CopyFlavor::FF>::names();

} // namespace bb