#pragma once
#include "barretenberg/common/serialize.hpp"
#include "../constants.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/common/throw_or_abort.hpp"

namespace join_split_example {
namespace proofs {
namespace notes {
namespace native {

/**
 * The bridge_call_data structure (with bit-lengths) is defined as follows:
 *
 * (auxData || bitConfig || inputAssetB || outputAssetB || outputAssetA || inputAssetA || bridgeAddressId)
 *     64          32            30              30              30             30              32
 *
 * bridgeAddressId : 32-bit integer mapped to a bridge contract address
 * inputAssetA     : (if real) First output asset id. (if virtual) Defi interaction nonce when a loan/LP position was
 * opened outputAssetA    : First output asset id outputAssetB    : Second output asset id inputAssetB     : (if real)
 * Second output asset id. (if virtual) Defi interaction nonce when a loan/LP position was opened bitConfig       :
 * 32-bit configuration (0 || 0 || ... || 0 || secondOutputVirtual || secondOutputAssetValid) auxData         :
 * Additional (optional) data to be used by the bridge contract.
 *
 */
struct bridge_call_data {

    static constexpr uint256_t input_asset_id_a_shift = DEFI_BRIDGE_ADDRESS_ID_LEN;
    static constexpr uint256_t input_asset_id_b_shift = input_asset_id_a_shift + DEFI_BRIDGE_OUTPUT_B_ASSET_ID_LEN;
    static constexpr uint256_t output_asset_id_a_shift = input_asset_id_b_shift + DEFI_BRIDGE_INPUT_A_ASSET_ID_LEN;
    static constexpr uint256_t output_asset_id_b_shift = output_asset_id_a_shift + DEFI_BRIDGE_OUTPUT_A_ASSET_ID_LEN;
    static constexpr uint256_t bitconfig_shift = output_asset_id_b_shift + DEFI_BRIDGE_INPUT_B_ASSET_ID_LEN;
    static constexpr uint256_t aux_data_shift = bitconfig_shift + DEFI_BRIDGE_BITCONFIG_LEN;

    /**
     * The 32-bit bit_config comprises the following:
     *
     * | bit | meaning |
     * |  0  | second_input_in_use   |
     * |  1  | second_output_in_use  |
     *
     * (The 0th bit is the least significant bit)
     *
     * Note: the first input and the first output are both always in_use when doing a defi deposit, so
     * we don't need a bit for first_input_in_use nor for first_output_in_use.
     */
    struct bit_config {
        bool second_input_in_use = false;
        bool second_output_in_use = false;

        bool operator==(const bit_config& other) const
        {
            bool res = (second_input_in_use == other.second_input_in_use);
            res = res && (second_output_in_use == other.second_output_in_use);
            return res;
        }

        uint256_t to_uint256_t() const
        {
            constexpr auto input_asset_id_a_shift = DEFI_BRIDGE_ADDRESS_ID_LEN;
            constexpr auto output_asset_id_a_shift = input_asset_id_a_shift + DEFI_BRIDGE_INPUT_A_ASSET_ID_LEN;
            constexpr auto output_asset_id_b_shift = output_asset_id_a_shift + DEFI_BRIDGE_OUTPUT_A_ASSET_ID_LEN;
            constexpr auto input_asset_id_b_shift = output_asset_id_b_shift + DEFI_BRIDGE_OUTPUT_B_ASSET_ID_LEN;
            constexpr auto bitconfig_shift = input_asset_id_b_shift + DEFI_BRIDGE_INPUT_B_ASSET_ID_LEN;

            uint256_t result(second_input_in_use);
            result += uint256_t(second_output_in_use) << 1;
            result = result << bitconfig_shift;
            return result;
        }

        static bit_config from_uint256_t(const uint256_t& bridge_call_data = 0)
        {
            constexpr auto input_asset_id_a_shift = DEFI_BRIDGE_ADDRESS_ID_LEN;
            constexpr auto output_asset_id_a_shift = input_asset_id_a_shift + DEFI_BRIDGE_INPUT_A_ASSET_ID_LEN;
            constexpr auto output_asset_id_b_shift = output_asset_id_a_shift + DEFI_BRIDGE_OUTPUT_A_ASSET_ID_LEN;
            constexpr auto input_asset_id_b_shift = output_asset_id_b_shift + DEFI_BRIDGE_OUTPUT_B_ASSET_ID_LEN;
            constexpr auto bitconfig_shift = input_asset_id_b_shift + DEFI_BRIDGE_INPUT_B_ASSET_ID_LEN;
            constexpr auto bitconfig_mask = (1ULL << DEFI_BRIDGE_BITCONFIG_LEN) - 1;
            uint32_t config_u32 = uint32_t((bridge_call_data >> bitconfig_shift) & bitconfig_mask);

            bit_config result;
            result.second_input_in_use = config_u32 & 1ULL;
            result.second_output_in_use = (config_u32 >> 1) & 1ULL;
            return result;
        }
    };

    uint32_t bridge_address_id;
    uint32_t input_asset_id_a;
    uint32_t input_asset_id_b = 0;
    uint32_t output_asset_id_a;
    uint32_t output_asset_id_b;
    bit_config config;
    uint64_t aux_data = 0;

    static bridge_call_data from_uint256_t(const uint256_t& bridge_call_data = 0)
    {
        uint256_t one = 1;
        struct bridge_call_data result;
        result.bridge_address_id =
            static_cast<uint32_t>(bridge_call_data & uint256_t((one << DEFI_BRIDGE_ADDRESS_ID_LEN) - 1));
        result.input_asset_id_a = static_cast<uint32_t>((bridge_call_data >> input_asset_id_a_shift) &
                                                        uint256_t((one << DEFI_BRIDGE_INPUT_A_ASSET_ID_LEN) - 1));
        result.input_asset_id_b = static_cast<uint32_t>((bridge_call_data >> input_asset_id_b_shift) &
                                                        uint256_t((one << DEFI_BRIDGE_INPUT_B_ASSET_ID_LEN) - 1));
        result.output_asset_id_a = static_cast<uint32_t>(((bridge_call_data >> output_asset_id_a_shift) &
                                                          uint256_t((one << DEFI_BRIDGE_OUTPUT_A_ASSET_ID_LEN) - 1)));
        result.output_asset_id_b = static_cast<uint32_t>((bridge_call_data >> output_asset_id_b_shift) &
                                                         uint256_t((one << DEFI_BRIDGE_OUTPUT_B_ASSET_ID_LEN) - 1));
        result.aux_data =
            static_cast<uint32_t>((bridge_call_data >> aux_data_shift) & uint256_t((one << DEFI_BRIDGE_AUX_DATA) - 1));
        result.config = bit_config::from_uint256_t(bridge_call_data);
        return result;
    }

    uint256_t to_uint256_t() const
    {
        // The bridge contract address is the 160-bit address mapped to a 32-bit integer just like asset ids.
        // check if the asset ids are 30 bits.
        bool input_asset_id_a_check = ((input_asset_id_a >> DEFI_BRIDGE_INPUT_A_ASSET_ID_LEN) == 0);
        bool input_asset_id_b_check = ((input_asset_id_b >> DEFI_BRIDGE_INPUT_A_ASSET_ID_LEN) == 0);
        bool output_asset_id_a_check = ((output_asset_id_a >> DEFI_BRIDGE_OUTPUT_A_ASSET_ID_LEN) == 0);
        bool output_asset_id_b_check = ((output_asset_id_b >> DEFI_BRIDGE_OUTPUT_B_ASSET_ID_LEN) == 0);

        if (!(input_asset_id_a_check && input_asset_id_b_check && output_asset_id_a_check && output_asset_id_b_check)) {
            throw_or_abort("Structure of the bridge_call_data incorrect!");
        }

        constexpr uint32_t input_asset_id_a_offset = DEFI_BRIDGE_ADDRESS_ID_LEN;
        constexpr uint32_t input_asset_id_b_offset = input_asset_id_a_offset + DEFI_BRIDGE_OUTPUT_B_ASSET_ID_LEN;
        constexpr uint32_t output_asset_id_a_offset = input_asset_id_b_offset + DEFI_BRIDGE_INPUT_A_ASSET_ID_LEN;
        constexpr uint32_t output_asset_id_b_offset = output_asset_id_a_offset + DEFI_BRIDGE_OUTPUT_A_ASSET_ID_LEN;
        constexpr uint32_t bitconfig_offset = output_asset_id_b_offset + DEFI_BRIDGE_INPUT_B_ASSET_ID_LEN;
        constexpr uint32_t aux_data_offset = bitconfig_offset + DEFI_BRIDGE_BITCONFIG_LEN;

        uint256_t result = static_cast<uint256_t>(bridge_address_id) +
                           (static_cast<uint256_t>(input_asset_id_a) << input_asset_id_a_offset) +
                           (static_cast<uint256_t>(input_asset_id_b) << input_asset_id_b_offset) +
                           (static_cast<uint256_t>(output_asset_id_a) << output_asset_id_a_offset) +
                           (static_cast<uint256_t>(output_asset_id_b) << output_asset_id_b_offset) +
                           config.to_uint256_t() + (static_cast<uint256_t>(aux_data) << aux_data_offset);

        return result;
    }

    operator uint256_t() const { return to_uint256_t(); }

    bool operator==(bridge_call_data const& other) const
    {
        bool res = bridge_address_id == other.bridge_address_id;
        res = res && (input_asset_id_a == other.input_asset_id_a);
        res = res && (input_asset_id_b == other.input_asset_id_b);
        res = res && (output_asset_id_a == other.output_asset_id_a);
        res = res && (output_asset_id_b == other.output_asset_id_b);
        res = res && (aux_data == other.aux_data);
        res = res && (config == other.config);
        return res;
    };
};

inline std::ostream& operator<<(std::ostream& os, bridge_call_data::bit_config const& config)
{
    os << "  second_input_in_use: " << config.second_input_in_use << ",\n"
       << "  second_output_in_use: " << config.second_output_in_use << ",\n";
    return os;
}

inline std::ostream& operator<<(std::ostream& os, bridge_call_data const& bridge_call_data)
{
    os << "{\n"
       << "  bridge_address_id: " << bridge_call_data.bridge_address_id << ",\n"
       << "  input_asset_id_a: " << bridge_call_data.input_asset_id_a << ",\n"
       << "  input_asset_id_b: " << bridge_call_data.input_asset_id_b << ",\n"
       << "  output_asset_id_a: " << bridge_call_data.output_asset_id_a << ",\n"
       << "  output_asset_id_b: " << bridge_call_data.output_asset_id_a << "\n}" << bridge_call_data.config
       << "  aux_data: " << bridge_call_data.aux_data << "\n}";
    return os;
}

} // namespace native
} // namespace notes
} // namespace proofs
} // namespace join_split_example
