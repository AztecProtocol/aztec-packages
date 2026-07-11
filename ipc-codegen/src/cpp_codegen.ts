/**
 * C++ IPC Client Code Generator
 *
 * Generates a C++ IPC client from a CompiledSchema. The generated client:
 *   - Connects to a server over Unix Domain Socket via ipc::IpcClient
 *   - Serializes each command to the [name, payload] msgpack framing keyed on
 *     MSGPACK_SCHEMA_NAME, sends, receives, deserializes
 *   - Has one method per command, returning the typed response
 *
 * Usage:
 *   const gen = new CppCodegen({ namespace: 'my_service', prefix: 'MyService' });
 *   const header = gen.generateHeader(schema);
 *   const impl = gen.generateImpl(schema);
 */

import type { CompiledSchema, Command } from "./schema_visitor.ts";
import {
  toPascalCase,
  toSnakeCase,
  toAliasName,
  dedupeStructsByName,
} from "./naming.ts";

export interface CppCodegenOptions {
  /** C++ namespace for generated code, e.g. 'my_service' */
  namespace: string;
  /** Prefix for command/response types, e.g. 'MyService' */
  prefix: string;
  /** Strip the prefix from method names, e.g. MyServiceGetInfo -> get_info */
  stripMethodPrefix?: boolean;
  /**
   * Override for the generated output directory include path.
   */
  generatedIncludeDir?: string;
  /**
   * Sub-namespace for wire types (e.g. 'wire' → types in ns::wire).
   * When set, standalone types are wrapped in this sub-namespace,
   * and the server dispatch deserializes into wire types then converts to domain types.
   */
  wireNamespace?: string;
}

export class CppCodegen {
  constructor(private opts: CppCodegenOptions) {}

  private primitiveType(type: import("./schema_visitor.ts").Type): string {
    switch (type.primitive) {
      case "bool":
        return "bool";
      case "u8":
        return "uint8_t";
      case "u16":
        return "uint16_t";
      case "u32":
        return "uint32_t";
      case "u64":
        return "uint64_t";
      case "f64":
        return "double";
      case "string":
        return "std::string";
      case "bytes":
        return "std::vector<uint8_t>";
      case "bin32":
        return "std::array<uint8_t, 32>";
    }
    throw new Error(`Unsupported primitive type: ${type.primitive}`);
  }

  /** Convert a command name to a C++ method name (snake_case) */
  private methodName(commandName: string): string {
    // With stripMethodPrefix: "CdbGetContractInstance" -> "get_contract_instance"
    const withoutPrefix =
      this.opts.stripMethodPrefix && commandName.startsWith(this.opts.prefix)
        ? commandName.slice(this.opts.prefix.length)
        : commandName;
    return toSnakeCase(withoutPrefix);
  }

  /** Check if the response has fields (non-void return) */
  private hasResponseFields(command: Command, schema: CompiledSchema): boolean {
    const resp = schema.responses.get(command.responseType);
    return !!resp && resp.fields.length > 0;
  }

  /** Map a schema type to its C++ type (mirror of the mapping used for struct fields). */
  private cppFieldType(type: import("./schema_visitor.ts").Type): string {
    switch (type.kind) {
      case "primitive":
        return type.originalName
          ? toAliasName(type.originalName)
          : this.primitiveType(type);
      case "vector":
        return `std::vector<${this.cppFieldType(type.element!)}>`;
      case "array":
        return `std::array<${this.cppFieldType(type.element!)}, ${type.size}>`;
      case "optional":
        return `std::optional<${this.cppFieldType(type.element!)}>`;
      case "struct":
        return type.struct!.name;
    }
    throw new Error(`Unsupported type kind: ${type.kind}`);
  }

  /**
   * A command gets a zero-copy streamed variant only when the schema opts in with
   * "streamed": true AND its last request field is a plain `bytes` payload: the
   * generated <method>_streamed() packs the envelope and leading fields normally,
   * then has the caller write the payload directly into the transport buffer via
   * IpcClient::send_with (in-ring for SHM). Server-side, the dispatch then requires
   * a handle_<method>_streamed handler. Opt-in keeps services whose commands merely
   * happen to end in a bytes field on the plain handler path.
   */
  private streamedPayloadField(
    command: Command,
  ): import("./schema_visitor.ts").Field | undefined {
    if (!command.streamed) {
      return undefined;
    }
    if (command.fields.length === 0) {
      throw new Error(`Command '${command.name}' is marked streamed but has no fields`);
    }
    const last = command.fields[command.fields.length - 1];
    if (
      last.type.kind !== "primitive" ||
      last.type.primitive !== "bytes" ||
      last.type.originalName
    ) {
      throw new Error(
        `Command '${command.name}' is marked streamed but its last request field is not a plain 'bytes' payload`,
      );
    }
    return last;
  }

  /** Generate the streamed-variant signature for a command (or undefined). */
  private generateStreamedSignature(
    command: Command,
    className?: string,
  ): string | undefined {
    const payload = this.streamedPayloadField(command);
    if (!payload) {
      return undefined;
    }
    const method = this.methodName(command.name);
    const retType = this.opts.wireNamespace
      ? command.responseType
      : `${command.name}::Response`;
    const leading = command.fields
      .slice(0, -1)
      .map((f) => `${this.cppFieldType(f.type)} ${f.name}`)
      .concat([
        `size_t ${payload.name}_len`,
        `const std::function<void(void*)>& fill_${payload.name}`,
      ])
      .join(", ");
    const prefix = className ? `${className}::` : "";
    return `${retType} ${prefix}${method}_streamed(${leading}) const`;
  }

  /** Generate the method signature using command struct types directly */
  private generateMethodSignature(
    command: Command,
    schema: CompiledSchema,
    className?: string,
  ): string {
    const method = this.methodName(command.name);
    const hasFields = this.hasResponseFields(command, schema);
    // Wire types use top-level response names (BbFooResponse).
    // Command types with nested Response use Cmd::Response.
    const retType = hasFields
      ? this.opts.wireNamespace
        ? command.responseType
        : `${command.name}::Response`
      : "void";

    // If the command has fields, take the whole command struct by value
    const params = command.fields.length > 0 ? `${command.name} cmd` : "";

    const prefix = className ? `${className}::` : "";

    return `${retType} ${prefix}${method}(${params})`;
  }

  /** Generate the header file */
  generateHeader(schema: CompiledSchema, schemaHash?: string): string {
    const { namespace: ns, prefix } = this.opts;
    const wireNs = this.opts.wireNamespace;
    const className = `${prefix}IpcClient`;

    const methods = schema.commands
      .map((cmd) => {
        const sig = this.generateMethodSignature(cmd, schema);
        const streamed = this.generateStreamedSignature(cmd);
        return streamed ? `    ${sig};\n    ${streamed};` : `    ${sig};`;
      })
      .join("\n");

    const hashConstant = schemaHash
      ? `\n/** Schema version hash for compatibility checking */\nstatic constexpr const char SCHEMA_HASH[] = "${schemaHash}";\n`
      : "";

    // When wireNamespace is set, include wire types and bring them into scope
    const wireInclude = wireNs
      ? `#include "${this.generatedInclude(`${toSnakeCase(prefix)}_types.hpp`)}"\n`
      : "";
    const wireUsing = wireNs ? `using namespace ${wireNs};\n` : "";

    const typesInclude = this.generatedInclude(
      `${toSnakeCase(prefix)}_types.hpp`,
    );

    return `// AUTOGENERATED FILE - DO NOT EDIT
#pragma once

#include "${typesInclude}"
#include "ipc_runtime/ipc_client.hpp"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>

namespace ${ns} {
${wireUsing}${hashConstant}
/**
 * @brief Auto-generated IPC client.
 *
 * Each method sends a msgpack-serialized command to the server and returns
 * the typed response. Transport (UDS or MPSC-SHM) is selected by the path
 * suffix passed to the constructor: ".sock" → UDS, ".shm" → MPSC-SHM. All
 * methods block until the response arrives.
 */
class ${className} {
  public:
    /**
     * @param path Transport path (".sock" → UDS, ".shm" → MPSC-SHM).
     * @param call_timeout_ns Per-call send/receive timeout in nanoseconds.
     *        0 (the default) means wait indefinitely — commands like proving
     *        can legitimately take minutes.
     */
    explicit ${className}(const std::string& path, uint64_t call_timeout_ns = 0);
    ~${className}();

    ${className}(const ${className}&) = delete;
    ${className}& operator=(const ${className}&) = delete;

${methods}

  private:
    template <typename Cmd, typename Resp>
    Resp send(Cmd&& cmd) const;

    template <typename Resp>
    Resp send_streamed(const char* cmd_name,
                       uint32_t num_fields,
                       const std::function<void(msgpack::packer<msgpack::sbuffer>&)>& pack_leading,
                       const char* payload_field,
                       size_t payload_len,
                       const std::function<void(void*)>& fill) const;

    template <typename Resp>
    Resp recv_response() const;

    mutable std::unique_ptr<::ipc::IpcClient> client_;
    uint64_t call_timeout_ns_;
};

} // namespace ${ns}
`;
  }

  /** Generate the implementation file — hand-rolled [name, payload] serialization */
  generateImpl(schema: CompiledSchema): string {
    const { namespace: ns, prefix } = this.opts;
    const className = `${prefix}IpcClient`;
    const errorType = schema.errorTypeName;

    const methods = schema.commands
      .map((cmd) => {
        return this.generateMethodImpl(cmd, schema, className);
      })
      .join("\n");

    return `// AUTOGENERATED FILE - DO NOT EDIT

#include "${this.headerIncludePath()}"

// THROW/RETHROW satisfy msgpack-c builds with -fno-exceptions support. They
// must be defined before <msgpack.hpp> is included (transitively via
// ipc_codegen/msgpack_adaptor.hpp). Under BB_NO_EXCEPTIONS THROW aborts;
// the guard lets a consumer predefine its own variant.
#include "ipc_codegen/throw.hpp"
#include "ipc_codegen/msgpack_adaptor.hpp"

#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>

// Client-side glue is exception-using and transport-using. Under WASM /
// -fno-exceptions consumers that don't need a transport-based client (e.g.
// in-process FFI callers) can skip the whole translation unit so we don't
// have to thread THROW through every site.
#ifndef BB_NO_EXCEPTIONS

namespace ${ns} {

${className}::${className}(const std::string& path, uint64_t call_timeout_ns)
    : client_(::ipc::make_client(path))
    , call_timeout_ns_(call_timeout_ns)
{
    if (!client_) {
        throw std::runtime_error("ipc::make_client: unrecognised path suffix (expected .sock or .shm): " + path);
    }
    if (!client_->connect()) {
        throw std::runtime_error("ipc::IpcClient::connect() failed for " + path);
    }
}

${className}::~${className}() = default;

template <typename Cmd, typename Resp>
Resp ${className}::send(Cmd&& cmd) const
{
    // Serialize as [[CommandName, {payload}]]
    msgpack::sbuffer send_buffer;
    msgpack::packer<msgpack::sbuffer> pk(send_buffer);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string(Cmd::MSGPACK_SCHEMA_NAME));
    pk.pack(std::forward<Cmd>(cmd));

    // Send request, receive response.
    if (!client_->send(send_buffer.data(), send_buffer.size(), call_timeout_ns_)) {
        throw std::runtime_error("ipc::IpcClient::send failed");
    }
    return recv_response<Resp>();
}

template <typename Resp>
Resp ${className}::send_streamed(const char* cmd_name,
                                 uint32_t num_fields,
                                 const std::function<void(msgpack::packer<msgpack::sbuffer>&)>& pack_leading,
                                 const char* payload_field,
                                 size_t payload_len,
                                 const std::function<void(void*)>& fill) const
{
    // Pack the envelope, leading fields, and the payload's bin header into a head
    // buffer; the payload body itself is written by \`fill\` directly into the
    // transport buffer (in-ring for SHM) via send_with — no intermediate copy.
    msgpack::sbuffer head;
    msgpack::packer<msgpack::sbuffer> pk(head);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string(cmd_name));
    pk.pack_map(num_fields);
    pack_leading(pk);
    pk.pack(std::string(payload_field));
    pk.pack_bin(static_cast<uint32_t>(payload_len));
    const size_t total = head.size() + payload_len;
    bool sent = client_->send_with(
        total,
        [&](void* buf) {
            std::memcpy(buf, head.data(), head.size());
            fill(static_cast<uint8_t*>(buf) + head.size());
        },
        call_timeout_ns_);
    if (!sent) {
        throw std::runtime_error("ipc::IpcClient::send_with failed");
    }
    return recv_response<Resp>();
}

template <typename Resp>
Resp ${className}::recv_response() const
{
    auto response_view = client_->receive(call_timeout_ns_);
    if (response_view.empty()) {
        throw std::runtime_error("ipc::IpcClient::receive failed or timed out");
    }
    // Copy out before release() — for SHM this gives up zero-copy semantics
    // but keeps the rest of the code simple. convert() below copies anyway.
    std::vector<uint8_t> response_bytes(response_view.begin(), response_view.end());
    client_->release(response_view.size());

    // Parse response: [ResponseName, {payload}]
    auto unpacked = msgpack::unpack(
        reinterpret_cast<const char*>(response_bytes.data()), response_bytes.size());
    auto obj = unpacked.get();

    if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 2 ||
        obj.via.array.ptr[0].type != msgpack::type::STR) {
        throw std::runtime_error("Invalid response format from server");
    }

    std::string resp_name(obj.via.array.ptr[0].via.str.ptr, obj.via.array.ptr[0].via.str.size);
    if (resp_name == "${errorType}") {
        std::string message;
        auto& payload = obj.via.array.ptr[1];
        // Extract message field from the error map
        if (payload.type == msgpack::type::MAP) {
            for (uint32_t i = 0; i < payload.via.map.size; ++i) {
                auto& kv = payload.via.map.ptr[i];
                if (kv.key.type == msgpack::type::STR) {
                    std::string key(kv.key.via.str.ptr, kv.key.via.str.size);
                    if (key == "message" && kv.val.type == msgpack::type::STR) {
                        message = std::string(kv.val.via.str.ptr, kv.val.via.str.size);
                    }
                }
            }
        }
        throw std::runtime_error("Server error: " + message);
    }
    if (resp_name != Resp::MSGPACK_SCHEMA_NAME) {
        throw std::runtime_error("Expected response '" + std::string(Resp::MSGPACK_SCHEMA_NAME) +
                                 "' but got '" + resp_name + "'");
    }

    Resp result;
    obj.via.array.ptr[1].convert(result);
    return result;
}

${methods}
} // namespace ${ns}

#endif // BB_NO_EXCEPTIONS
`;
  }

  /** Generate a single method implementation */
  private generateMethodImpl(
    command: Command,
    schema: CompiledSchema,
    className: string,
  ): string {
    const sig = this.generateMethodSignature(command, schema, className);
    const hasFields = this.hasResponseFields(command, schema);
    const respType = this.opts.wireNamespace
      ? command.responseType
      : `${command.name}::Response`;

    const cmdExpr =
      command.fields.length > 0 ? "std::move(cmd)" : `${command.name}{}`;

    const streamedSig = this.generateStreamedSignature(command, className);
    let streamedImpl = "";
    if (streamedSig) {
      const payload = this.streamedPayloadField(command)!;
      const packLeading = command.fields
        .slice(0, -1)
        .map(
          (f) =>
            `        pk.pack(std::string("${f.name}"));\n        pk.pack(${f.name});`,
        )
        .join("\n");
      streamedImpl = `
${streamedSig}
{
    return send_streamed<${respType}>(
        "${command.name}",
        ${command.fields.length},
        [&](msgpack::packer<msgpack::sbuffer>& pk) {
${packLeading}
        },
        "${payload.name}",
        ${payload.name}_len,
        fill_${payload.name});
}
`;
    }

    if (!hasFields) {
      return `${sig}
{
    send<${command.name}, ${respType}>(${cmdExpr});
}
${streamedImpl}`;
    }

    return `${sig}
{
    return send<${command.name}, ${respType}>(${cmdExpr});
}
${streamedImpl}`;
  }

  /** Get the generated/ directory include prefix.
   *  Returns either the explicit --cpp-include-dir value (e.g. "myservice/generated")
   *  or empty for callers that include generated files by their bare filename. */
  private generatedDir(): string {
    if (this.opts.generatedIncludeDir) {
      return this.opts.generatedIncludeDir;
    }
    return "";
  }

  /** Form an include path: `<dir>/<file>` if dir is non-empty, else bare `<file>`. */
  private generatedInclude(filename: string): string {
    const dir = this.generatedDir();
    return dir ? `${dir}/${filename}` : filename;
  }

  /** Compute the include path for the generated client header */
  private headerIncludePath(): string {
    return this.generatedInclude(
      `${toSnakeCase(this.opts.prefix)}_ipc_client.hpp`,
    );
  }

  // -----------------------------------------------------------------------
  // Standalone types (no external project dependencies)
  // -----------------------------------------------------------------------

  /** Generate standalone C++ types with MSGPACK_DEFINE_MAP — no external project deps */
  generateStandaloneTypes(schema: CompiledSchema): string {
    const { namespace: ns, prefix } = this.opts;

    const aliasTypes = new Map<
      string,
      { underlying: string; schemaName: string }
    >();
    const collect = (type: import("./schema_visitor.ts").Type): void => {
      if (type.kind === "primitive" && type.originalName) {
        aliasTypes.set(toAliasName(type.originalName), {
          underlying: this.primitiveType(type),
          schemaName: type.originalName,
        });
      } else if (
        type.kind === "vector" ||
        type.kind === "array" ||
        type.kind === "optional"
      ) {
        if (type.element) collect(type.element);
      }
    };
    for (const s of schema.structs.values()) {
      for (const f of s.fields) collect(f.type);
    }
    for (const s of schema.responses.values()) {
      for (const f of s.fields) collect(f.type);
    }
    const aliasDecls = [...aliasTypes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, { underlying, schemaName }]) => {
        // bin32 aliases are nominal types (a fixed 32-byte value with a name),
        // so they are distinct wrapper structs. Scalar aliases are transparent
        // synonyms — consumers static_cast them to/from enums and integers —
        // so they are plain `using`.
        if (underlying === "std::array<uint8_t, 32>") {
          return `struct ${name} : ::ipc::Bin32Alias<${name}> {
    using ::ipc::Bin32Alias<${name}>::Bin32Alias;
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "${schemaName}";
};`;
        }
        return `using ${name} = ${underlying};`;
      })
      .join("\n");

    // Map schema types to C++ types
    const mapType = (type: import("./schema_visitor.ts").Type): string => {
      switch (type.kind) {
        case "primitive":
          return type.originalName
            ? toAliasName(type.originalName)
            : this.primitiveType(type);
        case "vector":
          return `std::vector<${mapType(type.element!)}>`;
        case "array":
          return `std::array<${mapType(type.element!)}, ${type.size}>`;
        case "optional":
          return `std::optional<${mapType(type.element!)}>`;
        case "struct":
          return type.struct!.name;
      }
      throw new Error(`Unsupported type kind: ${type.kind}`);
    };

    const allStructs = dedupeStructsByName([
      ...schema.structs.values(),
      ...schema.responses.values(),
    ]);
    const structs = allStructs
      .map((s) => {
        if (s.fields.length > 20) {
          throw new Error(
            `Struct '${s.name}' has ${s.fields.length} fields; IPC_CODEGEN_SERIALIZATION_FIELDS supports at most 20. ` +
              `Split the struct or extend the macro in ipc_codegen/msgpack_adaptor.hpp.`,
          );
        }
        const fields = s.fields
          .map((f) => `    ${mapType(f.type)} ${f.name};`)
          .join("\n");
        const fieldNames = s.fields.map((f) => f.name).join(", ");
        const schemaName = `    static constexpr const char MSGPACK_SCHEMA_NAME[] = "${s.name}";`;
        const serialization = fieldNames
          ? `    IPC_CODEGEN_SERIALIZATION_FIELDS(${fieldNames})`
          : `    template <typename _PackFn> void msgpack(_PackFn&& pack_fn) { pack_fn(); }`;
        return `struct ${s.name} {\n${schemaName}\n${fields}\n${serialization}\n    bool operator==(const ${s.name}&) const = default;\n};`;
      })
      .join("\n\n");

    return `// AUTOGENERATED FILE - DO NOT EDIT
// Standalone types for ${prefix} service.
#pragma once

#include <array>
#include <cstdint>
#include <cstring>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

// Pull in THROW/RETHROW: \`throw\` natively, abort-on-throw under
// BB_NO_EXCEPTIONS (WASM). Must be in scope before <msgpack.hpp> so msgpack-c
// picks up the right variant.
#include "ipc_codegen/msgpack_include.hpp"

// ---------------------------------------------------------------------------
// Self-contained serialization macro for generated wire types.
// Defines a msgpack() method that enumerates field name/value pairs.
// ---------------------------------------------------------------------------
#ifndef IPC_CODEGEN_SERIALIZATION_FIELDS
#define _SF_E1(x) #x, x
#define _SF_E2(x, ...) #x, x, _SF_E1(__VA_ARGS__)
#define _SF_E3(x, ...) #x, x, _SF_E2(__VA_ARGS__)
#define _SF_E4(x, ...) #x, x, _SF_E3(__VA_ARGS__)
#define _SF_E5(x, ...) #x, x, _SF_E4(__VA_ARGS__)
#define _SF_E6(x, ...) #x, x, _SF_E5(__VA_ARGS__)
#define _SF_E7(x, ...) #x, x, _SF_E6(__VA_ARGS__)
#define _SF_E8(x, ...) #x, x, _SF_E7(__VA_ARGS__)
#define _SF_E9(x, ...) #x, x, _SF_E8(__VA_ARGS__)
#define _SF_E10(x, ...) #x, x, _SF_E9(__VA_ARGS__)
#define _SF_E11(x, ...) #x, x, _SF_E10(__VA_ARGS__)
#define _SF_E12(x, ...) #x, x, _SF_E11(__VA_ARGS__)
#define _SF_E13(x, ...) #x, x, _SF_E12(__VA_ARGS__)
#define _SF_E14(x, ...) #x, x, _SF_E13(__VA_ARGS__)
#define _SF_E15(x, ...) #x, x, _SF_E14(__VA_ARGS__)
#define _SF_E16(x, ...) #x, x, _SF_E15(__VA_ARGS__)
#define _SF_E17(x, ...) #x, x, _SF_E16(__VA_ARGS__)
#define _SF_E18(x, ...) #x, x, _SF_E17(__VA_ARGS__)
#define _SF_E19(x, ...) #x, x, _SF_E18(__VA_ARGS__)
#define _SF_E20(x, ...) #x, x, _SF_E19(__VA_ARGS__)
#define _SF_CNT(_1,_2,_3,_4,_5,_6,_7,_8,_9,_10,_11,_12,_13,_14,_15,_16,_17,_18,_19,_20,N,...) N
#define _SF_NUM(...) _SF_CNT(__VA_ARGS__,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1)
#define _SF_CAT(a, b) a##b
#define _SF_SEL(n) _SF_CAT(_SF_E, n)
#define _SF_NVP(...) _SF_SEL(_SF_NUM(__VA_ARGS__))(__VA_ARGS__)
#define IPC_CODEGEN_SERIALIZATION_FIELDS(...) \\
    template <typename _PackFn> void msgpack(_PackFn pack_fn) { pack_fn(_SF_NVP(__VA_ARGS__)); }
#endif

// ---------------------------------------------------------------------------
// Wire aliases for primitive schema aliases. bin32 aliases are nominal wrappers
// carrying their alias name as the MSGPACK_SCHEMA_NAME dispatch tag.
// ---------------------------------------------------------------------------

#ifndef IPC_CODEGEN_BIN32_ALIAS_DEFINED
#define IPC_CODEGEN_BIN32_ALIAS_DEFINED
namespace ipc {
template <typename Tag> struct Bin32Alias {
    using IPC_CODEGEN_BIN32_ALIAS = void;
    std::array<uint8_t, 32> value{};

    Bin32Alias() = default;
    Bin32Alias(const std::array<uint8_t, 32>& bytes) : value(bytes) {}
    Bin32Alias(std::array<uint8_t, 32>&& bytes) : value(std::move(bytes)) {}

    uint8_t* data() { return value.data(); }
    const uint8_t* data() const { return value.data(); }
    constexpr std::size_t size() const { return 32; }

    uint8_t& operator[](std::size_t i) { return value[i]; }
    const uint8_t& operator[](std::size_t i) const { return value[i]; }

    auto begin() { return value.begin(); }
    auto end() { return value.end(); }
    auto begin() const { return value.begin(); }
    auto end() const { return value.end(); }

    operator std::array<uint8_t, 32>&() { return value; }
    operator const std::array<uint8_t, 32>&() const { return value; }

    void msgpack_pack(auto& packer) const
    {
        packer.pack_bin(static_cast<uint32_t>(value.size()));
        packer.pack_bin_body(reinterpret_cast<const char*>(value.data()), static_cast<uint32_t>(value.size()));
    }

    void msgpack_unpack(auto object)
    {
        if constexpr (requires { object.template as<std::array<uint8_t, 32>>(); }) {
            value = object.template as<std::array<uint8_t, 32>>();
        } else {
            value = static_cast<std::array<uint8_t, 32>>(object);
        }
    }

    bool operator==(const Bin32Alias&) const = default;
};
} // namespace ipc
#endif

namespace ${ns} {

${aliasDecls}

${this.opts.wireNamespace ? `namespace ${this.opts.wireNamespace} {` : ""}

${structs}

${this.opts.wireNamespace ? `} // namespace ${this.opts.wireNamespace}` : ""}
} // namespace ${ns}
`;
  }

  // -----------------------------------------------------------------------
  // Server-side code generation (uses standalone ipc_server.hpp template)
  // -----------------------------------------------------------------------

  /** Generate the dispatch — header-only, template<typename Ctx>, no transport dependency. */
  generateDispatchHeader(schema: CompiledSchema): string {
    const { namespace: ns, prefix } = this.opts;
    const errorTypeName = schema.errorTypeName;
    const typesHeader = `${toSnakeCase(prefix)}_types.hpp`;
    // Handler declarations — template<typename Ctx>
    const handlerDecls = schema.commands
      .map((c) => {
        const method = toSnakeCase(
          c.name.startsWith(prefix) ? c.name.slice(prefix.length) : c.name,
        );
        const base = `template<typename Ctx>\nvoid handle_${method}(Ctx& ctx, wire::${c.name}&& cmd, Responder<wire::${c.responseType}> respond);`;
        const payload = this.streamedPayloadField(c);
        if (!payload) {
          return base;
        }
        // Streamed variant: the payload bytes stay in the transport buffer; the
        // handler must invoke release() exactly once when done reading them
        // (before respond). The wire struct's payload field is left empty.
        return `${base}\n\ntemplate<typename Ctx>\nvoid handle_${method}_streamed(Ctx& ctx, wire::${c.name}&& cmd, std::span<const uint8_t> ${payload.name}, Responder<wire::${c.responseType}> respond, ReleaseFn release);`;
      })
      .join("\n\n");

    // Handler entries for dispatch map
    const handlerEntries = schema.commands
      .map((cmd) => {
        const method = toSnakeCase(
          cmd.name.startsWith(prefix)
            ? cmd.name.slice(prefix.length)
            : cmd.name,
        );

        const deserialize =
          cmd.fields.length > 0
            ? `wire::${cmd.name} wire_cmd; payload.convert(wire_cmd);`
            : `wire::${cmd.name} wire_cmd;`;

        const payloadField = this.streamedPayloadField(cmd);
        if (payloadField) {
          // Streamed: convert every field except the trailing bytes payload, which is
          // handed to the handler as a span into the request buffer (msgpack bin
          // values reference the input). The handler owns release(); a synchronous
          // throw releases here instead.
          const fieldCases = cmd.fields
            .slice(0, -1)
            .map(
              (f) =>
                `                    } else if (key == "${f.name}") {\n                        kv.val.convert(wire_cmd.${f.name});`,
            )
            .join("\n");
          return `            { "${cmd.name}", [](Ctx& ctx, [[maybe_unused]] const msgpack::object& payload, RawRespond raw_respond, ReleaseFn release) {
                wire::${cmd.name} wire_cmd;
                std::span<const uint8_t> payload_span;
                for (uint32_t i = 0; i < payload.via.map.size; ++i) {
                    auto& kv = payload.via.map.ptr[i];
                    std::string_view key(kv.key.via.str.ptr, kv.key.via.str.size);
                    if (key == "${payloadField.name}") {
                        payload_span = { reinterpret_cast<const uint8_t*>(kv.val.via.bin.ptr), kv.val.via.bin.size };
${fieldCases}
                    }
                }
                Responder<wire::${cmd.responseType}> responder(std::move(raw_respond), "${cmd.responseType}");
#ifdef BB_NO_EXCEPTIONS
                handle_${method}_streamed(ctx, std::move(wire_cmd), payload_span, responder, std::move(release));
#else
                try {
                    handle_${method}_streamed(ctx, std::move(wire_cmd), payload_span, responder, release);
                } catch (const std::exception& e) {
                    release();
                    responder.error(e.what());
                }
#endif
            } }`;
        }

        return `            { "${cmd.name}", [](Ctx& ctx, [[maybe_unused]] const msgpack::object& payload, RawRespond raw_respond, ReleaseFn release) {
                ${deserialize}
                release(); // request bytes fully copied into wire_cmd
                Responder<wire::${cmd.responseType}> responder(std::move(raw_respond), "${cmd.responseType}");
#ifdef BB_NO_EXCEPTIONS
                handle_${method}(ctx, std::move(wire_cmd), responder);
#else
                try {
                    handle_${method}(ctx, std::move(wire_cmd), responder);
                } catch (const std::exception& e) {
                    responder.error(e.what());
                }
#endif
            } }`;
      })
      .join(",\n");

    return `// AUTOGENERATED FILE - DO NOT EDIT
// Header-only dispatch — template<typename Ctx> for service context.
#pragma once

#include "${typesHeader}"
#include "ipc_codegen/msgpack_adaptor.hpp"

// Pull in THROW/RETHROW — 'throw' natively, abort-on-throw under
// BB_NO_EXCEPTIONS (WASM). ipc_codegen/throw.hpp keeps definitions guarded
// with #ifndef THROW, so a parent project that predefines them wins.
#include "ipc_codegen/msgpack_include.hpp"

#include <functional>
#include <iostream>
#include <span>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace ${ns} {

// ---------------------------------------------------------------------------
// Dispatch — template on service context type
// ---------------------------------------------------------------------------

namespace detail {

inline std::vector<uint8_t> make_error(const std::string& message)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(2);
    pk.pack(std::string("${errorTypeName}"));
    pk.pack_map(1);
    pk.pack(std::string("message"));
    pk.pack(message);
    return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
}

} // namespace detail

// Raw (byte-level) response sink supplied by the server backend. It delivers a
// finished response frame and may be invoked from any thread.
using RawRespond = std::function<void(std::vector<uint8_t>)>;

// Frees the request's transport buffer (deferred-release dispatch). Streamed
// handlers must invoke it exactly once when done reading their payload span,
// BEFORE responding; for all other commands the dispatch releases internally.
// May be invoked from any thread. Always callable (no-op under copy-mode
// reactors).
using ReleaseFn = std::function<void()>;

// Typed response callback handed to each handler. Exactly one of ok()/error()
// must be called exactly once — possibly later and from another thread, so a
// handler may defer its work (e.g. to a thread pool) and respond when ready.
template <typename Resp>
class Responder {
  public:
    Responder(RawRespond raw, const char* resp_type)
        : raw_(std::move(raw))
        , resp_type_(resp_type)
    {}

    void ok(const Resp& resp) const
    {
        msgpack::sbuffer buf;
        msgpack::packer<msgpack::sbuffer> pk(buf);
        pk.pack_array(2);
        pk.pack(std::string(resp_type_));
        pk.pack(resp);
        raw_(std::vector<uint8_t>(buf.data(), buf.data() + buf.size()));
    }

    void error(const std::string& message) const { raw_(detail::make_error(message)); }

  private:
    RawRespond raw_;
    const char* resp_type_;
};

// Wire types are in the 'wire' sub-namespace (from ${typesHeader}).
// Handler declarations — implement these in your handler file. Each handler
// produces its result by calling respond.ok(value) / respond.error(message),
// synchronously or later from another thread. Specializations must be visible
// before make_handler() is instantiated.

${handlerDecls}

// Dispatcher signatures — asynchronous: take the raw request frame and a sink
// for the (eventual) response frame. Independent of the IPC server backend.
// The zero-copy variant additionally threads the transport buffer's release
// token; use it with IpcServer::run_reactor_zero_copy so streamed handlers can
// read their payload directly from the transport buffer (the SHM ring).
using AsyncDispatchHandler = std::function<void(std::span<const uint8_t>, RawRespond)>;
using AsyncDispatchHandlerZC = std::function<void(std::span<const uint8_t>, RawRespond, ReleaseFn)>;

template<typename Ctx>
AsyncDispatchHandlerZC make_${toSnakeCase(prefix)}_handler_zc(Ctx& ctx)
{
    using HandlerFn = std::function<void(Ctx&, const msgpack::object&, RawRespond, ReleaseFn)>;
    static const std::unordered_map<std::string, HandlerFn> table = {
${handlerEntries},
    };

    return [&ctx](std::span<const uint8_t> raw_request, RawRespond raw_respond, ReleaseFn release) {
        // Reference-mode unpack: bin/str values point into raw_request (the transport
        // buffer) instead of being copied into the parser zone — required for streamed
        // handlers, whose payload spans must alias the buffer that the release token
        // controls. Default unpack COPIES bin into the zone, which dies with the
        // object_handle.
        bool referenced = false;
        std::size_t off = 0;
        auto unpacked =
            msgpack::unpack(reinterpret_cast<const char*>(raw_request.data()),
                            raw_request.size(),
                            off,
                            referenced,
                            [](msgpack::type::object_type, std::size_t, void*) { return true; },
                            nullptr);
        auto obj = unpacked.get();

        if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 1) {
            release();
            raw_respond(detail::make_error("malformed request: expected outer array of size 1"));
            return;
        }

        auto& inner = obj.via.array.ptr[0];
        if (inner.type != msgpack::type::ARRAY || inner.via.array.size != 2 ||
            inner.via.array.ptr[0].type != msgpack::type::STR) {
            release();
            raw_respond(detail::make_error("malformed request: expected [CommandName, {payload}]"));
            return;
        }

        std::string cmd_name(inner.via.array.ptr[0].via.str.ptr, inner.via.array.ptr[0].via.str.size);
        auto& cmd_payload = inner.via.array.ptr[1];

        auto it = table.find(cmd_name);
        if (it == table.end()) {
            release();
            raw_respond(detail::make_error("unknown command: " + cmd_name));
            return;
        }
        // The entry decodes the payload synchronously (while the unpacked zone is
        // alive), then runs or defers the handler. Non-streamed entries release the
        // transport buffer as soon as the payload is copied out; streamed entries
        // hand the token to the handler. Synchronous handler throws become error
        // frames inside the entry; a deferred handler owns its errors via
        // Responder::error.
        it->second(ctx, cmd_payload, std::move(raw_respond), std::move(release));
    };
}

// Copy-mode compatibility wrapper (IpcServer::run_reactor): the reactor has
// already copied and released the request, so the release token is a no-op.
template<typename Ctx>
AsyncDispatchHandler make_${toSnakeCase(prefix)}_handler(Ctx& ctx)
{
    return [zc = make_${toSnakeCase(prefix)}_handler_zc(ctx)](std::span<const uint8_t> raw_request,
                                                              RawRespond raw_respond) {
        zc(raw_request, std::move(raw_respond), [] {});
    };
}

} // namespace ${ns}
`;
  }

  /** Generate native IPC server glue for a dispatch header. */
  generateServerHeader(): string {
    const { namespace: ns, prefix } = this.opts;
    const dispatchHeader = `${toSnakeCase(prefix)}_dispatch.hpp`;

    return `// AUTOGENERATED FILE - DO NOT EDIT
// Native IPC server glue for ${prefix}.
#pragma once

#include "${dispatchHeader}"
#include "ipc_runtime/serve_helper.hpp"
#include "ipc_runtime/signal_handlers.hpp"

#include <span>
#include <stdexcept>
#include <string>
#include <vector>

namespace ${ns} {

template<typename Ctx>
void serve(const std::string& input_path, Ctx& ctx)
{
    auto server = ::ipc::make_server(input_path);
    if (!server) {
        throw std::runtime_error("ipc::make_server: unrecognised path suffix (expected .sock or .shm): " + input_path);
    }
    ::ipc::install_default_signal_handlers(*server);
    if (!server->listen()) {
        throw std::runtime_error("ipc::IpcServer::listen() failed for " + input_path);
    }
    auto handler = make_${toSnakeCase(prefix)}_handler_zc(ctx);
    server->run_reactor_zero_copy(
        [&handler](
            int /*client_id*/, std::span<const uint8_t> raw, ::ipc::IpcServer::Respond respond, ::ipc::IpcServer::Release release) {
            handler(raw, std::move(respond), std::move(release));
        });
}

} // namespace ${ns}
`;
  }
}
