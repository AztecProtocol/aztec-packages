#ifndef __wasm__
#include "barretenberg/api/standard_address_derivation.hpp"

#include "barretenberg/api/file_io.hpp"
#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/base64.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include <algorithm>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <nlohmann/json.hpp>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

namespace bb {

namespace {

using FF = ::bb::fr;
using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

// Domain separator not in aztec_constants.hpp at the time of writing. Mirrored from
// yarn-project/constants/src/constants.gen.ts (DomainSeparator enum). The follow-up that ports
// `computePrivateFunctionsRoot` to C++ will also need DOM_SEP__PRIVATE_FUNCTION_LEAF (1389398688)
// and DOM_SEP__FUNCTION_ARGS (3576554347) and FUNCTION_TREE_HEIGHT (7).
constexpr uint32_t DOM_SEP__INITIALIZER = 385396519UL;

// Default public key components (PublicKeys.default() in TS). Decimal values from
// yarn-project/constants/src/constants.gen.ts. These are points on grumpkin; the address
// derivation uses incoming_viewing_key in scalar-multiply form.
const char* const DEFAULT_NPK_M_X = "582240093077765400562621227108555700500271598878376310175765873770292988861";
const char* const DEFAULT_NPK_M_Y = "10422444662424639723529825114205836958711284159673861467999592572974769103684";
const char* const DEFAULT_IVPK_M_X = "339708709767762472786445938838804872781183545349360029270386718856175781484";
const char* const DEFAULT_IVPK_M_Y = "12719619215050539905199178334954929730355853796706924300730604757520758976849";
const char* const DEFAULT_OVPK_M_X = "12212787719617305570587928860288475454328008955283046946846066128763901043335";
const char* const DEFAULT_OVPK_M_Y = "3646747884782549389807830220601404629716007431341772952958971658285958854707";
const char* const DEFAULT_TPK_M_X = "728059161893070741164607238299536939695876538801885465230641192969135857403";
const char* const DEFAULT_TPK_M_Y = "14575718736702206050102425029229426215631664471161015518982549597389390371695";

// Decimal string -> Fr. `numeric::uint256_t` only parses fully-padded hex, so this routes
// through a manual base-10 accumulator.
FF parse_field_decimal(const char* dec)
{
    numeric::uint256_t acc = 0;
    const numeric::uint256_t ten = 10;
    for (const char* p = dec; *p != '\0'; ++p) {
        if (*p < '0' || *p > '9') {
            throw_or_abort(std::string("parse_field_decimal: invalid digit in ") + dec);
        }
        acc = acc * ten + numeric::uint256_t(static_cast<uint64_t>(*p - '0'));
    }
    return FF(acc);
}

// Hex string -> Fr. Accepts with-or-without 0x prefix and any length up to 64 hex digits;
// pads to the 64-digit form expected by `numeric::uint256_t`'s string constructor.
FF parse_field_hex(const std::string& hex)
{
    std::string s = hex;
    if (s.rfind("0x", 0) == 0 || s.rfind("0X", 0) == 0) {
        s = s.substr(2);
    }
    if (s.size() > 64) {
        throw_or_abort("parse_field_hex: hex string too long");
    }
    s = std::string(64 - s.size(), '0') + s;
    return FF(numeric::uint256_t(s));
}

// Format a field as a `0x`-prefixed, zero-padded 64-hex-digit string. Matches the output of
// Fr.toString() in TS, which is what the existing standard_addresses.nr generator emits.
// `numeric::uint256_t::operator<<` already prepends "0x" and zero-pads each 16-hex-digit limb,
// so streaming the value directly produces the same shape as the TS output.
std::string field_to_padded_hex(const FF& f)
{
    numeric::uint256_t v(f);
    std::ostringstream oss;
    oss << v;
    return oss.str();
}

// Mirror of `encode_bytecode` in vm2/simulation/lib/contract_crypto.cpp. Reimplemented here to
// avoid linking vm2 into bb (which uses vm2_stub). Encodes bytecode as field elements packing
// 31 bytes per field in big-endian order.
std::vector<FF> encode_bytecode_as_fields(const std::vector<uint8_t>& bytecode)
{
    std::vector<FF> result;
    size_t bytecode_len = bytecode.size();
    if (bytecode_len == 0) {
        return result;
    }
    result.reserve((bytecode_len + 30) / 31);

    for (size_t i = 0; i < bytecode_len; i += 31) {
        numeric::uint256_t as_int = 0;
        if (bytecode_len - i >= 32) {
            // Read 32 bytes big-endian directly.
            for (size_t b = 0; b < 32; ++b) {
                as_int = (as_int << 8) | numeric::uint256_t(bytecode[i + b]);
            }
        } else {
            std::vector<uint8_t> tail(32, 0);
            for (size_t b = 0; b < bytecode_len - i; ++b) {
                tail[b] = bytecode[i + b];
            }
            for (size_t b = 0; b < 32; ++b) {
                as_int = (as_int << 8) | numeric::uint256_t(tail[b]);
            }
        }
        result.push_back(FF(as_int >> 8));
    }
    return result;
}

// Mirror of `compute_public_bytecode_commitment` in vm2/simulation/lib/contract_crypto.cpp. The
// domain separator prepends `DOM_SEP__PUBLIC_BYTECODE | (byte_len << 32)`.
FF compute_public_bytecode_commitment(const std::vector<uint8_t>& bytecode)
{
    auto fields = encode_bytecode_as_fields(bytecode);
    numeric::uint256_t sep_val =
        numeric::uint256_t(DOM_SEP__PUBLIC_BYTECODE) + (numeric::uint256_t(bytecode.size()) << 32);
    std::vector<FF> inputs;
    inputs.reserve(1 + fields.size());
    inputs.push_back(FF(sep_val));
    inputs.insert(inputs.end(), fields.begin(), fields.end());
    return poseidon2::hash(inputs);
}

// poseidon2(separator, ...inputs).
FF poseidon2_hash_with_separator(uint32_t separator, const std::vector<FF>& inputs)
{
    std::vector<FF> with_sep;
    with_sep.reserve(inputs.size() + 1);
    with_sep.push_back(FF(numeric::uint256_t(separator)));
    with_sep.insert(with_sep.end(), inputs.begin(), inputs.end());
    return poseidon2::hash(with_sep);
}

// Build the default `PublicKeys` (matches `PublicKeys.default()` in stdlib).
struct DefaultPublicKeys {
    grumpkin::g1::affine_element nullifier_key;
    grumpkin::g1::affine_element incoming_viewing_key;
    grumpkin::g1::affine_element outgoing_viewing_key;
    grumpkin::g1::affine_element tagging_key;

    static DefaultPublicKeys instance()
    {
        DefaultPublicKeys k;
        k.nullifier_key =
            grumpkin::g1::affine_element(parse_field_decimal(DEFAULT_NPK_M_X), parse_field_decimal(DEFAULT_NPK_M_Y));
        k.incoming_viewing_key =
            grumpkin::g1::affine_element(parse_field_decimal(DEFAULT_IVPK_M_X), parse_field_decimal(DEFAULT_IVPK_M_Y));
        k.outgoing_viewing_key =
            grumpkin::g1::affine_element(parse_field_decimal(DEFAULT_OVPK_M_X), parse_field_decimal(DEFAULT_OVPK_M_Y));
        k.tagging_key =
            grumpkin::g1::affine_element(parse_field_decimal(DEFAULT_TPK_M_X), parse_field_decimal(DEFAULT_TPK_M_Y));
        return k;
    }
};

// Mirror of `hash_public_keys` in vm2/simulation/lib/contract_crypto.cpp: poseidon2 over
// (DOM_SEP__PUBLIC_KEYS_HASH, then for each key: x, y, 0 [is_infinity placeholder]).
FF hash_public_keys(const DefaultPublicKeys& keys)
{
    std::vector<FF> inputs;
    inputs.push_back(FF(numeric::uint256_t(DOM_SEP__PUBLIC_KEYS_HASH)));
    auto add = [&](const grumpkin::g1::affine_element& p) {
        inputs.push_back(p.x);
        inputs.push_back(p.y);
        inputs.push_back(FF::zero());
    };
    add(keys.nullifier_key);
    add(keys.incoming_viewing_key);
    add(keys.outgoing_viewing_key);
    add(keys.tagging_key);
    return poseidon2::hash(inputs);
}

// Mirror of `compute_contract_address` in vm2/simulation/lib/contract_crypto.cpp. Performs the
// salted-init -> partial-address -> public-keys-hash -> (G*h + ivpk).x chain.
FF compute_contract_address(const FF& original_class_id,
                            const FF& initialization_hash,
                            const FF& salt,
                            const FF& deployer,
                            const DefaultPublicKeys& keys)
{
    FF salted_init =
        poseidon2_hash_with_separator(DOM_SEP__SALTED_INITIALIZATION_HASH, { salt, initialization_hash, deployer });
    FF partial = poseidon2_hash_with_separator(DOM_SEP__PARTIAL_ADDRESS, { original_class_id, salted_init });
    FF public_keys_hash = hash_public_keys(keys);
    FF h = poseidon2_hash_with_separator(DOM_SEP__CONTRACT_ADDRESS_V1, { public_keys_hash, partial });
    grumpkin::fr h_fq = grumpkin::fr(h);
    auto result = (grumpkin::g1::affine_one * h_fq + keys.incoming_viewing_key);
    return result.x;
}

// Render a Noir signature string matching `decodeFunctionSignature` in TS. Used for
// FunctionSelector.fromNameAndParameters.
std::string render_abi_type(const nlohmann::json& type);

std::string render_struct_fields(const nlohmann::json& fields)
{
    std::ostringstream oss;
    oss << "(";
    bool first = true;
    for (const auto& field : fields) {
        if (!first) {
            oss << ",";
        }
        first = false;
        oss << render_abi_type(field["type"]);
    }
    oss << ")";
    return oss.str();
}

std::string render_abi_type(const nlohmann::json& type)
{
    const std::string kind = type["kind"].get<std::string>();
    if (kind == "field") {
        return "Field";
    }
    if (kind == "integer") {
        const auto sign = type["sign"].get<std::string>();
        const auto width = type["width"].get<uint32_t>();
        return (sign == "signed" ? "i" : "u") + std::to_string(width);
    }
    if (kind == "boolean") {
        return "bool";
    }
    if (kind == "array") {
        return "[" + render_abi_type(type["type"]) + ";" + std::to_string(type["length"].get<uint32_t>()) + "]";
    }
    if (kind == "string") {
        return "str<" + std::to_string(type["length"].get<uint32_t>()) + ">";
    }
    if (kind == "struct") {
        return render_struct_fields(type["fields"]);
    }
    throw_or_abort("Unsupported AbiType kind: " + kind);
    return "";
}

std::string render_function_signature(const std::string& name, const nlohmann::json& parameters)
{
    std::ostringstream oss;
    oss << name << "(";
    bool first = true;
    for (const auto& param : parameters) {
        if (!first) {
            oss << ",";
        }
        first = false;
        oss << render_abi_type(param["type"]);
    }
    oss << ")";
    return oss.str();
}

// Mirror of `FunctionSelector.fromSignature` in TS: poseidon2-hash the signature bytes
// (31-byte chunks, little-endian per chunk per TS quirk) then take the last 4 big-endian bytes.
// We compute it as a Field (the selector is later used as a Field anyway in the merkle leaf).
FF function_selector_from_signature(const std::string& signature)
{
    // poseidon2HashBytes: split into 31-byte chunks, reverse each (little-endian per chunk),
    // pack into a Field, then poseidon2-hash the Field array.
    std::vector<FF> field_inputs;
    for (size_t i = 0; i < signature.size(); i += 31) {
        std::vector<uint8_t> chunk(32, 0);
        size_t copy_len = std::min<size_t>(31, signature.size() - i);
        for (size_t j = 0; j < copy_len; ++j) {
            chunk[j] = static_cast<uint8_t>(signature[i + j]);
        }
        // Reverse the 32-byte chunk (TS does fieldBytes.reverse()).
        std::reverse(chunk.begin(), chunk.end());
        numeric::uint256_t as_int = 0;
        for (size_t b = 0; b < 32; ++b) {
            as_int = (as_int << 8) | numeric::uint256_t(chunk[b]);
        }
        field_inputs.push_back(FF(as_int));
    }
    FF h = poseidon2::hash(field_inputs);

    // Take the last 4 big-endian bytes (Selector.SIZE == 4).
    numeric::uint256_t h_int(h);
    // Mask to last 32 bits.
    constexpr uint32_t SELECTOR_MASK = 0xFFFFFFFFu;
    uint32_t last4 = static_cast<uint32_t>(static_cast<uint64_t>(h_int.data[0]) & SELECTOR_MASK);
    return FF(numeric::uint256_t(last4));
}

FF compute_function_selector(const nlohmann::json& function)
{
    const std::string& name = function["name"].get_ref<const std::string&>();
    return function_selector_from_signature(render_function_signature(name, function["abi"]["parameters"]));
}

// Compute initialization hash for an empty-args constructor: poseidon2(INITIALIZER, [selector, 0])
// (varargs hash of [] == Fr.ZERO).
FF compute_init_hash_empty_args(const nlohmann::json& constructor_fn)
{
    if (constructor_fn.is_null()) {
        return FF::zero();
    }
    FF selector = compute_function_selector(constructor_fn);
    FF args_hash = FF::zero(); // computeVarArgsHash([]) returns Fr.ZERO.
    return poseidon2_hash_with_separator(DOM_SEP__INITIALIZER, { selector, args_hash });
}

bool function_has_attribute(const nlohmann::json& function, const std::string& attribute)
{
    if (!function.contains("custom_attributes") || !function["custom_attributes"].is_array()) {
        return false;
    }
    for (const auto& attr : function["custom_attributes"]) {
        if (attr.is_string() && attr.get_ref<const std::string&>() == attribute) {
            return true;
        }
    }
    return false;
}

// Find the `public_dispatch` function's bytecode. Mirrors TS's
// `getContractClassFromArtifact`, which uses the lone public function as the packed bytecode
// (public_dispatch is the only public function retained in the loaded artifact).
//
// IMPORTANT: TS's `computePublicBytecodeCommitment` treats `bytecode` as a base64-decoded buffer
// without gunzipping it. This differs from how `bb aztec_process` reads ACIR bytecode for VK
// derivation (which DOES gunzip). The TS chain hashes the gzipped bytes directly, so we mirror
// that here with `base64_decode` (no decompression).
std::vector<uint8_t> get_public_dispatch_bytecode(const nlohmann::json& artifact)
{
    for (const auto& fn : artifact["functions"]) {
        if (fn["name"].is_string() && fn["name"].get_ref<const std::string&>() == "public_dispatch") {
            const auto& base64_bytecode = fn["bytecode"].get<std::string>();
            std::string decoded = base64_decode(base64_bytecode, /*remove_linebreaks=*/false);
            return std::vector<uint8_t>(decoded.begin(), decoded.end());
        }
    }
    return {};
}

const nlohmann::json* find_initializer_function(const nlohmann::json& artifact)
{
    for (const auto& fn : artifact["functions"]) {
        if (function_has_attribute(fn, "abi_initializer")) {
            return &fn;
        }
    }
    return nullptr;
}

struct DerivationEntry {
    std::filesystem::path artifact_path;
    std::string nr_const;
    FF artifact_hash;
    FF private_functions_root;
    FF salt;
    FF deployer;
    FF expected_address; // Optional sanity-check; zero means "not provided".
};

// Render a single line of the generated Noir module.
std::string render_noir_global(const std::string& nr_const, const FF& address)
{
    std::ostringstream oss;
    oss << "pub global " << nr_const << ": AztecAddress = AztecAddress::from_field(\n    "
        << field_to_padded_hex(address) << ",\n);";
    return oss.str();
}

// Mirrors `renderNoirAddresses` in generate_data.ts: same `nargo fmt`-stable layout.
std::string render_noir_module(const std::vector<std::pair<std::string, FF>>& rows)
{
    std::ostringstream oss;
    oss << "// GENERATED FILE - DO NOT EDIT. RUN `yarn workspace @aztec/standard-contracts run generate`.\n";
    oss << "use protocol_types::{address::AztecAddress, traits::FromField};\n";
    bool first = true;
    for (const auto& row : rows) {
        oss << (first ? "\n" : "\n\n");
        first = false;
        oss << render_noir_global(row.first, row.second);
    }
    oss << "\n";
    return oss.str();
}

} // anonymous namespace

bool derive_standard_contract_addresses(const std::filesystem::path& config_path)
{
    if (!std::filesystem::exists(config_path)) {
        info("Config file not found: ", config_path.string());
        return false;
    }

    auto config_content = read_file(config_path);
    auto config = nlohmann::json::parse(std::string(config_content.begin(), config_content.end()));

    std::vector<DerivationEntry> entries;
    for (const auto& entry : config["entries"]) {
        DerivationEntry e;
        e.artifact_path = entry["artifact_path"].get<std::string>();
        e.nr_const = entry["nr_const"].get<std::string>();
        e.artifact_hash = parse_field_hex(entry["artifact_hash"].get<std::string>());
        e.private_functions_root = parse_field_hex(entry["private_functions_root"].get<std::string>());
        e.salt = parse_field_hex(entry.value("salt", std::string("0x1")));
        e.deployer = parse_field_hex(entry.value("deployer", std::string("0x0")));
        if (entry.contains("expected_address")) {
            e.expected_address = parse_field_hex(entry["expected_address"].get<std::string>());
        } else {
            e.expected_address = FF::zero();
        }
        entries.push_back(e);
    }

    std::vector<std::filesystem::path> output_paths;
    for (const auto& p : config["output_paths"]) {
        output_paths.emplace_back(p.get<std::string>());
    }

    auto keys = DefaultPublicKeys::instance();

    std::vector<std::pair<std::string, FF>> rows;
    for (const auto& entry : entries) {
        if (!std::filesystem::exists(entry.artifact_path)) {
            info("Artifact not found: ", entry.artifact_path.string());
            return false;
        }
        auto art_content = read_file(entry.artifact_path);
        auto artifact = nlohmann::json::parse(std::string(art_content.begin(), art_content.end()));

        auto bytecode = get_public_dispatch_bytecode(artifact);
        FF bytecode_commitment = compute_public_bytecode_commitment(bytecode);

        FF class_id = poseidon2_hash_with_separator(
            DOM_SEP__CONTRACT_CLASS_ID, { entry.artifact_hash, entry.private_functions_root, bytecode_commitment });

        const nlohmann::json* init_fn = find_initializer_function(artifact);
        FF init_hash = init_fn != nullptr ? compute_init_hash_empty_args(*init_fn) : FF::zero();

        FF address = compute_contract_address(class_id, init_hash, entry.salt, entry.deployer, keys);

        info("Derived ",
             entry.nr_const,
             " from ",
             entry.artifact_path.filename().string(),
             ": ",
             field_to_padded_hex(address));

        if (!entry.expected_address.is_zero() && address != entry.expected_address) {
            info("MISMATCH! Expected: ", field_to_padded_hex(entry.expected_address));
            info("Class ID:                 ", field_to_padded_hex(class_id));
            info("Public bytecode commit:   ", field_to_padded_hex(bytecode_commitment));
            info("Init hash:                ", field_to_padded_hex(init_hash));
            return false;
        }

        rows.emplace_back(entry.nr_const, address);
    }

    std::string content = render_noir_module(rows);
    for (const auto& path : output_paths) {
        std::filesystem::create_directories(path.parent_path());
        std::ofstream out(path);
        out << content;
        out.close();
        info("Wrote ", path.string());
    }

    return true;
}

} // namespace bb
#endif
