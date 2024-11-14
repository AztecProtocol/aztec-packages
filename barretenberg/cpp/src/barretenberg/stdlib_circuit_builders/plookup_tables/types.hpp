#pragma once

#include <array>
#include <vector>

#include "./fixed_base/fixed_base_params.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace bb::plookup {

enum BasicTableId {
    XOR,
    AND,
    PEDERSEN,
    AES_SPARSE_MAP,
    AES_SBOX_MAP,
    AES_SPARSE_NORMALIZE,
    SHA256_WITNESS_NORMALIZE,
    SHA256_WITNESS_SLICE_3,
    SHA256_WITNESS_SLICE_7_ROTATE_4,
    SHA256_WITNESS_SLICE_8_ROTATE_7,
    SHA256_WITNESS_SLICE_14_ROTATE_1,
    SHA256_CH_NORMALIZE,
    SHA256_MAJ_NORMALIZE,
    SHA256_BASE28,
    SHA256_BASE28_ROTATE6,
    SHA256_BASE28_ROTATE3,
    SHA256_BASE16,
    SHA256_BASE16_ROTATE2,
    SHA256_BASE16_ROTATE6,
    SHA256_BASE16_ROTATE7,
    SHA256_BASE16_ROTATE8,
    UINT_XOR_ROTATE0,
    UINT_AND_ROTATE0,
    BN254_XLO_BASIC,
    BN254_XHI_BASIC,
    BN254_YLO_BASIC,
    BN254_YHI_BASIC,
    BN254_XYPRIME_BASIC,
    BN254_XLO_ENDO_BASIC,
    BN254_XHI_ENDO_BASIC,
    BN254_XYPRIME_ENDO_BASIC,
    SECP256K1_XLO_BASIC,
    SECP256K1_XHI_BASIC,
    SECP256K1_YLO_BASIC,
    SECP256K1_YHI_BASIC,
    SECP256K1_XYPRIME_BASIC,
    SECP256K1_XLO_ENDO_BASIC,
    SECP256K1_XHI_ENDO_BASIC,
    SECP256K1_XYPRIME_ENDO_BASIC,
    BLAKE_XOR_ROTATE0,
    BLAKE_XOR_ROTATE0_SLICE5_MOD4,
    BLAKE_XOR_ROTATE1,
    BLAKE_XOR_ROTATE2,
    BLAKE_XOR_ROTATE4,
    FIXED_BASE_0_0,
    FIXED_BASE_1_0 = FIXED_BASE_0_0 + FixedBaseParams::NUM_TABLES_PER_LO_MULTITABLE,
    FIXED_BASE_2_0 = FIXED_BASE_1_0 + FixedBaseParams::NUM_TABLES_PER_HI_MULTITABLE,
    FIXED_BASE_3_0 = FIXED_BASE_2_0 + FixedBaseParams::NUM_TABLES_PER_LO_MULTITABLE,
    HONK_DUMMY_BASIC1 = FIXED_BASE_3_0 + FixedBaseParams::NUM_TABLES_PER_HI_MULTITABLE,
    HONK_DUMMY_BASIC2,
    KECCAK_INPUT,
    KECCAK_THETA,
    KECCAK_RHO,
    KECCAK_CHI,
    KECCAK_OUTPUT,
    KECCAK_RHO_1,
    KECCAK_RHO_2,
    KECCAK_RHO_3,
    KECCAK_RHO_4,
    KECCAK_RHO_5,
    KECCAK_RHO_6,
    KECCAK_RHO_7,
    KECCAK_RHO_8,
    KECCAK_RHO_9,
};

enum MultiTableId {
    SHA256_CH_INPUT,
    SHA256_CH_OUTPUT,
    SHA256_MAJ_INPUT,
    SHA256_MAJ_OUTPUT,
    SHA256_WITNESS_INPUT,
    SHA256_WITNESS_OUTPUT,
    AES_NORMALIZE,
    AES_INPUT,
    AES_SBOX,
    FIXED_BASE_LEFT_LO,
    FIXED_BASE_LEFT_HI,
    FIXED_BASE_RIGHT_LO,
    FIXED_BASE_RIGHT_HI,
    UINT32_XOR,
    UINT32_AND,
    BN254_XLO,
    BN254_XHI,
    BN254_YLO,
    BN254_YHI,
    BN254_XYPRIME,
    BN254_XLO_ENDO,
    BN254_XHI_ENDO,
    BN254_XYPRIME_ENDO,
    SECP256K1_XLO,
    SECP256K1_XHI,
    SECP256K1_YLO,
    SECP256K1_YHI,
    SECP256K1_XYPRIME,
    SECP256K1_XLO_ENDO,
    SECP256K1_XHI_ENDO,
    SECP256K1_XYPRIME_ENDO,
    BLAKE_XOR,
    BLAKE_XOR_ROTATE_16,
    BLAKE_XOR_ROTATE_8,
    BLAKE_XOR_ROTATE_7,
    PEDERSEN_IV, // WORKTODO: unused
    HONK_DUMMY_MULTI,
    KECCAK_THETA_OUTPUT,
    KECCAK_CHI_OUTPUT,
    KECCAK_FORMAT_INPUT,
    KECCAK_FORMAT_OUTPUT,
    KECCAK_NORMALIZE_AND_ROTATE,
    NUM_MULTI_TABLES = KECCAK_NORMALIZE_AND_ROTATE + 25,
};

/**
 * @brief Container for managing multiple BasicTables plus the data needed to combine basic table outputs (e.g. limbs)
 * into accumulators. Does not store actual raw table data.
 * @details As a simple example, consider using lookups to compute XOR on uint32_t inputs. To do this we decompose the
 * inputs into 6 limbs and use a BasicTable for 6-bit XOR lookups. In this case the MultiTable simply manages 6 basic
 * tables, all of which are the XOR BasicTable. (In many cases all of the BasicTables managed by a MultiTable are
 * identical, however there are some cases where more than 1 type is required, e.g. if a certain limb has to be handled
 * differently etc.). This class also stores the scalars needed to reconstruct full values from the components that are
 * contained in the basic lookup tables.
 * @note Note that a MultiTable does not actually *store* any table data. Rather it stores a set of basic table IDs, the
 * methods used to compute the basic table entries, plus some metadata.
 *
 */
struct MultiTable {
    // Coefficients are accumulated products of corresponding step sizes until that point
    std::vector<bb::fr> column_1_coefficients;
    std::vector<bb::fr> column_2_coefficients;
    std::vector<bb::fr> column_3_coefficients;
    MultiTableId id;
    std::vector<BasicTableId> basic_table_ids;
    std::vector<uint64_t> slice_sizes;
    std::vector<bb::fr> column_1_step_sizes;
    std::vector<bb::fr> column_2_step_sizes;
    std::vector<bb::fr> column_3_step_sizes;
    typedef std::array<bb::fr, 2> table_out;
    typedef std::array<uint64_t, 2> table_in;
    // Methods for computing the value from a key for each basic table
    std::vector<table_out (*)(table_in)> get_table_values;

  private:
    void init_step_sizes()
    {
        const size_t num_lookups = column_1_coefficients.size();
        column_1_step_sizes.emplace_back(bb::fr(1));
        column_2_step_sizes.emplace_back(bb::fr(1));
        column_3_step_sizes.emplace_back(bb::fr(1));

        std::vector<bb::fr> coefficient_inverses(column_1_coefficients.begin(), column_1_coefficients.end());
        std::copy(column_2_coefficients.begin(), column_2_coefficients.end(), std::back_inserter(coefficient_inverses));
        std::copy(column_3_coefficients.begin(), column_3_coefficients.end(), std::back_inserter(coefficient_inverses));

        bb::fr::batch_invert(&coefficient_inverses[0], num_lookups * 3);

        for (size_t i = 1; i < num_lookups; ++i) {
            column_1_step_sizes.emplace_back(column_1_coefficients[i] * coefficient_inverses[i - 1]);
            column_2_step_sizes.emplace_back(column_2_coefficients[i] * coefficient_inverses[num_lookups + i - 1]);
            column_3_step_sizes.emplace_back(column_3_coefficients[i] * coefficient_inverses[2 * num_lookups + i - 1]);
        }
    }

  public:
    MultiTable(const bb::fr& col_1_repeated_coeff,
               const bb::fr& col_2_repeated_coeff,
               const bb::fr& col_3_repeated_coeff,
               const size_t num_lookups)
    {
        column_1_coefficients.emplace_back(1);
        column_2_coefficients.emplace_back(1);
        column_3_coefficients.emplace_back(1);

        for (size_t i = 0; i < num_lookups; ++i) {
            column_1_coefficients.emplace_back(column_1_coefficients.back() * col_1_repeated_coeff);
            column_2_coefficients.emplace_back(column_2_coefficients.back() * col_2_repeated_coeff);
            column_3_coefficients.emplace_back(column_3_coefficients.back() * col_3_repeated_coeff);
        }
        init_step_sizes();
    }
    MultiTable(const std::vector<bb::fr>& col_1_coeffs,
               const std::vector<bb::fr>& col_2_coeffs,
               const std::vector<bb::fr>& col_3_coeffs)
        : column_1_coefficients(col_1_coeffs)
        , column_2_coefficients(col_2_coeffs)
        , column_3_coefficients(col_3_coeffs)
    {
        init_step_sizes();
    }

    MultiTable(){};
    MultiTable(const MultiTable& other) = default;
    MultiTable(MultiTable&& other) = default;

    MultiTable& operator=(const MultiTable& other) = default;
    MultiTable& operator=(MultiTable&& other) = default;
    bool operator==(const MultiTable& other) const = default;
};

// struct PlookupLargeKeyTable {
//     struct KeyEntry {
//         uint256_t key;
//         std::array<bb::fr, 2> value{ bb::fr(0), bb::fr(0) };
//         bool operator<(const KeyEntry& other) const { return key < other.key; }

//         std::array<bb::fr, 3> to_table_components(const bool use_two_keys) const
//         {
//             return {
//                 key[0],
//                 value[0],
//                 value[1],
//             };
//         }
//     };

//     BasicTableId id;
//     size_t table_index;
//     size_t size;
//     bool use_twin_keys;

//     bb::fr column_1_step_size = bb::fr(0);
//     bb::fr column_2_step_size = bb::fr(0);
//     bb::fr column_3_step_size = bb::fr(0);
//     std::vector<bb::fr> column_1;
//     std::vector<bb::fr> column_3;
//     std::vector<bb::fr> column_2;
//     std::vector<KeyEntry> lookup_gates;

//     std::array<bb::fr, 2> (*get_values_from_key)(const std::array<uint64_t, 2>);
// };

// struct PlookupFatKeyTable {
//     struct KeyEntry {
//         bb::fr key;
//         std::array<bb::fr, 2> values{ 0, 0 };
//         bool operator<(const KeyEntry& other) const
//         {
//             return (key.from_montgomery_form() < other.key.from_montgomery_form());
//         }

//         std::array<bb::fr, 3> to_table_components() const { return { key, values[0], values[0] }; }
//     }

//     BasicTableId id;
//     size_t table_index;
//     size_t size;
//     bool use_twin_keys;

//     bb::fr column_1_step_size = bb::fr(0);
//     bb::fr column_2_step_size = bb::fr(0);
//     bb::fr column_3_step_size = bb::fr(0);
//     std::vector<bb::fr> column_1;
//     std::vector<bb::fr> column_3;
//     std::vector<bb::fr> column_2;
//     std::vector<KeyEntry> lookup_gates;

//     std::array<bb::fr, 2> (*get_values_from_key)(const std::array<uint64_t, 2>);

// }

/**
 * @brief A map from 'entry' to 'index' where entry is a row in a BasicTable and index is the row at which that entry
 * exists in the table
 * @details Such a map is needed to in order to construct read_counts (the polynomial containing the number of reads
 * from each entry in a table) for the log-derivative lookup argument. A BasicTable essentially consists of 3 columns,
 * and 'lookups' are recorded as rows in this table. The index at which this data exists in the table is not explicitly
 * known at the time of lookup gate creation. This map can be used to construct read counts from the set of lookups that
 * have been performed via an operation like read_counts[index_map[lookup_data]]++
 *
 */
struct LookupHashTable {
    using FF = bb::fr;
    using Key = std::array<FF, 3>; // an entry in a lookup table
    using Value = size_t;          // the index of an entry in a lookup table

    // Define a simple hash on three field elements
    struct HashFunction {
        FF mult_const;
        FF const_sqr;

        HashFunction()
            : mult_const(FF(uint256_t(0x1337, 0x1336, 0x1335, 0x1334)))
            , const_sqr(mult_const.sqr())
        {}

        size_t operator()(const Key& entry) const
        {
            FF result = entry[0] + mult_const * entry[1] + const_sqr * entry[2];
            return static_cast<size_t>(result.reduce_once().data[0]);
        }
    };

    std::unordered_map<Key, Value, HashFunction> index_map;

    LookupHashTable() = default;

    // Initialize the entry-index map with the columns of a table
    void initialize(std::vector<FF>& column_1, std::vector<FF>& column_2, std::vector<FF>& column_3)
    {
        for (size_t i = 0; i < column_1.size(); ++i) {
            index_map[{ column_1[i], column_2[i], column_3[i] }] = i;
        }
    }

    // Given an entry in the table, return its index in the table
    Value operator[](const Key& key) const
    {
        auto it = index_map.find(key);
        if (it != index_map.end()) {
            return it->second;
        } else {
            info("LookupHashTable: Key not found!");
            ASSERT(false);
            return 0;
        }
    }

    bool operator==(const LookupHashTable& other) const = default;
};

/**
 * @brief A basic table from which we can perform lookups (for example, an xor table)
 * @details Also stores the lookup gate data for all lookups performed on this table
 *
 * @details You can find initialization example at
 * ../ultra_plonk_composer.cpp#UltraPlonkComposer::initialize_precomputed_table(..)
 *
 */
struct BasicTable {
    struct LookupEntry {
        bool operator==(const LookupEntry& other) const = default;

        // Storage for two key values and two result values to support different lookup formats, i.e. 1:1, 1:2, and 2:1
        std::array<uint256_t, 2> key{ 0, 0 };
        std::array<bb::fr, 2> value{ bb::fr(0), bb::fr(0) };
        // Comparison operator required for sorting; Used to construct sorted-concatenated table/lookup polynomial
        bool operator<(const LookupEntry& other) const
        {
            return key[0] < other.key[0] || ((key[0] == other.key[0]) && key[1] < other.key[1]);
        }

        // Express the key-value pair as the entries of a 3-column row in a table
        std::array<bb::fr, 3> to_table_components(const bool use_two_keys) const
        {
            return {
                bb::fr(key[0]),
                use_two_keys ? bb::fr(key[1]) : value[0],
                use_two_keys ? value[0] : value[1],
            };
        }
    };

    // Unique id of the table which is used to look it up, when we need its functionality. One of BasicTableId enum
    BasicTableId id;
    size_t table_index;
    // This means that we are using two inputs to look up stuff, not translate a single entry into another one.
    bool use_twin_keys;

    bb::fr column_1_step_size = bb::fr(0);
    bb::fr column_2_step_size = bb::fr(0);
    bb::fr column_3_step_size = bb::fr(0);
    std::vector<bb::fr> column_1;
    std::vector<bb::fr> column_2;
    std::vector<bb::fr> column_3;
    std::vector<LookupEntry> lookup_gates; // wire data for all lookup gates created for lookups on this table

    // Map from a table entry to its index in the table; used for constructing read counts
    LookupHashTable index_map;

    void initialize_index_map() { index_map.initialize(column_1, column_2, column_3); }

    std::array<bb::fr, 2> (*get_values_from_key)(const std::array<uint64_t, 2>);

    bool operator==(const BasicTable& other) const = default;

    size_t size() const
    {
        ASSERT(column_1.size() == column_2.size() && column_2.size() == column_3.size());
        return column_1.size();
    }
};

enum ColumnIdx { C1, C2, C3 };

/**
 * @brief Container type for lookup table reads.
 *
 * @tparam DataType: a native or stdlib field type, or the witness index type uint32_t
 *
 * @details We us this approach to indexing, using enums, rather than to make member variables column_i, to minimize
 * code changes; both non-const and const versions are in use.
 *
 * The inner index, i.e., the index of each vector v in the array `columns`, could also be treated as an enum, but that
 * might be messier. Note that v[0] represents a full accumulated sum, v[1] represents one step before that,
 * and so on. See the documentation of the native version of get_lookup_accumulators.
 *
 */
template <class DataType> class ReadData {
  public:
    ReadData() = default;
    std::vector<DataType>& operator[](ColumnIdx idx) { return columns[static_cast<size_t>(idx)]; };
    const std::vector<DataType>& operator[](ColumnIdx idx) const { return columns[static_cast<size_t>(idx)]; };

    std::vector<BasicTable::LookupEntry> lookup_entries;

  private:
    // Container for the lookup accumulators; 0th index of each column contains full accumulated value
    std::array<std::vector<DataType>, 3> columns;
};

} // namespace bb::plookup
