/**
 * Zig Code Generator
 *
 * Generates Zig structs, serialization/deserialization functions, and IPC client
 * from a CompiledSchema. Uses zig-msgpack's Payload API for wire encoding.
 *
 * Since Zig has no reflection-based serde, all serialization code is generated
 * explicitly per struct.
 */

import type {
  CompiledSchema,
  Type,
  Struct,
  Field,
  Command,
} from "./schema_visitor.ts";
import { toSnakeCase, toPascalCase } from "./naming.ts";

// Convert a schema alias name into its Zig type name. Strips a trailing `_t`
// (uint256_t → Uint256) and PascalCases the rest, so `fr` → `Fr`,
// `secp256k1_fr` → `Secp256k1Fr`, `uint256_t` → `Uint256`.
function toAliasName(name: string): string {
  const trimmed = name.endsWith("_t") ? name.slice(0, -2) : name;
  return toPascalCase(trimmed);
}

export interface ZigCodegenOptions {
  /** Service prefix to strip from method names (e.g., 'Wsdb') */
  prefix?: string;
  /** Client struct name (e.g., 'WsdbClient') */
  clientName?: string;
}

export class ZigCodegen {
  private errorTypeName: string = "ErrorResponse";
  private opts: Required<ZigCodegenOptions>;

  constructor(options?: ZigCodegenOptions) {
    this.opts = {
      prefix: options?.prefix ?? "",
      clientName: options?.clientName ?? "Client",
    };
  }

  /** Map schema type to Zig type */
  private mapType(type: Type): string {
    switch (type.kind) {
      case "primitive":
        switch (type.primitive) {
          case "bool":
            return "bool";
          case "u8":
            return "u8";
          case "u16":
            return "u16";
          case "u32":
            return "u32";
          case "u64":
            return "u64";
          case "f64":
            return "f64";
          case "string":
            return "[]const u8";
          case "bytes":
            return "[]const u8";
          case "fr":
            return "Fr"; // legacy path (current schemas emit bin32_alias)
          case "bin32_alias":
            return type.originalName ? toAliasName(type.originalName) : "Fr";
          case "field2":
            return "[2]Fr";
          case "enum_u32":
            return "u32";
          case "map_u32_pair":
            return "void"; // TODO: proper map support
        }
        break;
      case "vector":
        return `[]const ${this.mapType(type.element!)}`;
      case "array":
        return `[${type.size}]${this.mapType(type.element!)}`;
      case "optional":
        return `?${this.mapType(type.element!)}`;
      case "struct":
        return toPascalCase(type.struct!.name);
    }
    return "void";
  }

  /** Generate a Zig field-to-payload conversion expression */
  private fieldToPayload(
    fieldExpr: string,
    type: import("./schema_visitor.ts").Type,
  ): string {
    switch (type.kind) {
      case "primitive":
        switch (type.primitive) {
          case "bool":
            return `Payload{ .bool = ${fieldExpr} }`;
          case "u8":
          case "u16":
          case "u32":
          case "u64":
            return `Payload{ .uint = @intCast(${fieldExpr}) }`;
          case "f64":
            return `Payload{ .float = ${fieldExpr} }`;
          case "string":
            return `try Payload.strToPayload(${fieldExpr}, allocator)`;
          case "bytes":
            return `try Payload.binToPayload(${fieldExpr}, allocator)`;
          case "fr":
          case "bin32_alias":
            return `try Payload.binToPayload(&${fieldExpr}, allocator)`;
          case "enum_u32":
            return `Payload{ .uint = @intCast(${fieldExpr}) }`;
          default:
            return `Payload{ .nil = {} }`;
        }
      case "optional":
        return `if (${fieldExpr}) |v| ${this.fieldToPayload("v", type.element!)} else Payload{ .nil = {} }`;
      case "vector": {
        // For vectors, build an array payload
        return `blk: {
                var arr = try Payload.arrPayload(${fieldExpr}.len, allocator);
                for (${fieldExpr}, 0..) |item, i| {
                    try arr.setArrElement(i, ${this.fieldToPayload("item", type.element!)});
                }
                break :blk arr;
            }`;
      }
      case "struct":
        return `try ${fieldExpr}.toPayload(allocator)`;
      default:
        return `Payload{ .nil = {} }`;
    }
  }

  /** Generate a Zig payload-to-field conversion expression */
  private fieldFromPayload(
    payloadExpr: string,
    type: import("./schema_visitor.ts").Type,
  ): string {
    switch (type.kind) {
      case "primitive":
        switch (type.primitive) {
          case "bool":
            return `try ${payloadExpr}.asBool()`;
          case "u8":
            return `@intCast(try ${payloadExpr}.asUint())`;
          case "u16":
            return `@intCast(try ${payloadExpr}.asUint())`;
          case "u32":
            return `@intCast(try ${payloadExpr}.asUint())`;
          case "u64":
            return `try ${payloadExpr}.asUint()`;
          case "f64":
            return `try ${payloadExpr}.asFloat()`;
          case "string":
            return `try ${payloadExpr}.asStr()`;
          case "bytes":
            return `${payloadExpr}.bin.value()`;
          case "fr":
          case "bin32_alias":
            return `${payloadExpr}.bin.value()[0..32].*`;
          case "enum_u32":
            return `@intCast(try ${payloadExpr}.asUint())`;
          default:
            return `undefined`;
        }
      case "vector": {
        const elemConv = this.fieldFromPayload("elem", type.element!);
        return `blk: {
                const arr_len = try ${payloadExpr}.getArrLen();
                var result = try std.heap.page_allocator.alloc(${this.mapType(type.element!)}, arr_len);
                for (0..arr_len) |i| {
                    const elem = try ${payloadExpr}.getArrElement(i);
                    result[i] = ${elemConv};
                }
                break :blk result;
            }`;
      }
      case "optional":
        return `if (${payloadExpr} == .nil) null else ${this.fieldFromPayload(payloadExpr, type.element!)}`;
      case "struct":
        return `try ${toPascalCase(type.struct!.name)}.fromPayload(${payloadExpr})`;
      default:
        return `undefined`;
    }
  }

  /** Generate a Zig struct definition with toPayload/fromPayload methods */
  private generateStruct(struct: Struct): string {
    const zigName = toPascalCase(struct.name);
    const fields = struct.fields
      .map((f) => {
        const zigFieldName = toSnakeCase(f.name);
        const zigType = this.mapType(f.type);
        return `    ${zigFieldName}: ${zigType},`;
      })
      .join("\n");

    // Treat structs with only void fields as empty (void comes from unmapped types)
    const hasFields =
      struct.fields.length > 0 &&
      struct.fields.some((f) => this.mapType(f.type) !== "void");

    // toPayload method
    const toPayloadFields = struct.fields
      .map((f) => {
        const zigFieldName = toSnakeCase(f.name);
        return `        try map.mapPut("${f.name}", ${this.fieldToPayload(`self.${zigFieldName}`, f.type)});`;
      })
      .join("\n");

    // fromPayload method
    const fromPayloadFields = struct.fields
      .map((f) => {
        const zigFieldName = toSnakeCase(f.name);
        return `            .${zigFieldName} = ${this.fieldFromPayload(`(try payload.mapGet("${f.name}")).?`, f.type)},`;
      })
      .join("\n");

    // Empty structs: suppress unused parameter warnings
    if (!hasFields) {
      return `/// ${struct.name}
pub const ${zigName} = struct {

    pub fn toPayload(_: ${zigName}, allocator: std.mem.Allocator) !Payload {
        return Payload.mapPayload(allocator);
    }

    pub fn fromPayload(_: Payload) !${zigName} {
        return ${zigName}{};
    }
};`;
    }

    return `/// ${struct.name}
pub const ${zigName} = struct {
${fields}

    pub fn toPayload(self: ${zigName}, allocator: std.mem.Allocator) !Payload {
        var map = Payload.mapPayload(allocator);
${toPayloadFields}
        return map;
    }

    pub fn fromPayload(payload: Payload) !${zigName} {
        return ${zigName}{
${fromPayloadFields}
        };
    }
};`;
  }

  /** Generate serialize function for a struct */
  private generateSerializeFn(struct: Struct): string {
    const zigName = toPascalCase(struct.name);
    const fieldCount = struct.fields.length;

    const fieldPacks = struct.fields
      .map((f) => {
        const zigFieldName = toSnakeCase(f.name);
        return `    try packField(packer, "${f.name}", self.${zigFieldName});`;
      })
      .join("\n");

    return `pub fn serialize${zigName}(self: ${zigName}, packer: anytype) !void {
    try packer.writeMapHeader(${fieldCount});
${fieldPacks}
}`;
  }

  /** Generate deserialize function for a struct */
  private generateDeserializeFn(struct: Struct): string {
    const zigName = toPascalCase(struct.name);

    const fieldReads = struct.fields
      .map((f) => {
        const zigFieldName = toSnakeCase(f.name);
        const zigType = this.mapType(f.type);
        return `        .${zigFieldName} = try readField(${zigType}, unpacker, "${f.name}"),`;
      })
      .join("\n");

    return `pub fn deserialize${zigName}(unpacker: anytype, allocator: std.mem.Allocator) !${zigName} {
    _ = allocator;
    const map_len = try unpacker.readMapHeader();
    _ = map_len;
    return ${zigName}{
${fieldReads}
    };
}`;
  }

  /** Generate the Command tagged union */
  private generateCommandUnion(schema: CompiledSchema): string {
    const variants = schema.commands
      .map((c) => {
        const zigName = toPascalCase(c.name);
        return `    ${toSnakeCase(c.name)}: ${zigName},`;
      })
      .join("\n");

    const nameMap = schema.commands
      .map((c) => {
        return `        .${toSnakeCase(c.name)} => "${c.name}",`;
      })
      .join("\n");

    return `/// Tagged union of all commands
pub const Command = union(enum) {
${variants}

    pub fn schemaName(self: Command) []const u8 {
        return switch (self) {
${nameMap}
        };
    }
};`;
  }

  /** Generate the Response tagged union */
  private generateResponseUnion(schema: CompiledSchema): string {
    const commandResponseTypes = Array.from(
      new Set(schema.commands.map((c) => c.responseType)),
    );
    const errorName = schema.errorTypeName || "ErrorResponse";
    const responseTypes = schema.responses.has(errorName)
      ? [...commandResponseTypes, errorName]
      : commandResponseTypes;

    const variants = responseTypes
      .map((name) => {
        const zigName = toPascalCase(name);
        return `    ${toSnakeCase(name)}: ${zigName},`;
      })
      .join("\n");

    return `/// Tagged union of all responses
pub const Response = union(enum) {
${variants}
};`;
  }

  /** Generate the types file */
  generateTypes(schema: CompiledSchema, schemaHash?: string): string {
    this.errorTypeName = schema.errorTypeName || "ErrorResponse";

    const allStructs = [
      ...schema.structs.values(),
      ...schema.responses.values(),
    ];

    // Collect every distinct bin32 alias name in the schema. Each becomes a
    // `pub const` alias so wire fields with semantic aliases (Fr / Fq /
    // Secp256k1Fr / …) keep their names; all share the underlying [32]u8.
    const aliasNames = new Set<string>();
    const collect = (type: Type): void => {
      if (
        type.kind === "primitive" &&
        type.primitive === "bin32_alias" &&
        type.originalName
      ) {
        aliasNames.add(toAliasName(type.originalName));
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
    // Make sure `Fr` always exists (legacy path / field2 expansion uses it).
    aliasNames.add("Fr");
    const aliasDecls = [...aliasNames]
      .sort()
      .map((n) => `pub const ${n} = [32]u8;`)
      .join("\n");

    const structDefs = allStructs
      .map((s) => this.generateStruct(s))
      .join("\n\n");

    const hashLine = schemaHash
      ? `\n/// Schema version hash for compatibility checking\npub const SCHEMA_HASH = "${schemaHash}";\n`
      : "";

    return `//! AUTOGENERATED - DO NOT EDIT
//! Generated from IPC msgpack schema
//!
//! Each struct has toPayload() and fromPayload() methods that convert
//! to/from zig-msgpack Payload objects for serialization.

const std = @import("std");
const msgpack = @import("msgpack");
const Payload = msgpack.Payload;
const PackerIO = msgpack.PackerIO;
${hashLine}
// ---------------------------------------------------------------------------
// Bin32 aliases (Fr / Fq / Secp256k1Fr / …). Each is a zero-cost pub const
// alias to [32]u8; the wire encoding (msgpack bin32) is applied by the
// fieldToPayload / fieldFromPayload helpers.
// ---------------------------------------------------------------------------

${aliasDecls}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

${structDefs}

// ---------------------------------------------------------------------------
// Command / Response unions
// ---------------------------------------------------------------------------

${this.generateCommandUnion(schema)}

${this.generateResponseUnion(schema)}
`;
  }

  /** Strip service prefix from command name for method naming */
  private methodName(commandName: string): string {
    const withoutPrefix =
      this.opts.prefix && commandName.startsWith(this.opts.prefix)
        ? commandName.slice(this.opts.prefix.length)
        : commandName;
    return toSnakeCase(withoutPrefix);
  }

  /** Generate the client wrapper — typed methods parameterized on backend type */
  generateClient(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName || "ErrorResponse";
    const { prefix } = this.opts;
    const errorRespName = toPascalCase(this.errorTypeName);
    const typesFile = `${toSnakeCase(prefix)}_types.zig`;

    const methods = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const methodName = this.methodName(c.name);
        const zigCmdName = toPascalCase(c.name);
        const zigRespName = toPascalCase(c.responseType);
        return `        pub fn ${methodName}(self: *Self, cmd: types.${zigCmdName}) !types.${zigRespName} {
            const request_bytes = try Self.encode("${c.name}", try cmd.toPayload(alloc));
            defer alloc.free(request_bytes);
            const response_bytes = try self.backend.call(request_bytes);
            defer alloc.free(response_bytes);
            const resp_name, const resp_payload = try Self.decode(response_bytes);
            if (std.mem.eql(u8, resp_name, "${this.errorTypeName}")) return error.ServerError;
            return try types.${zigRespName}.fromPayload(resp_payload);
        }`;
      })
      .join("\n\n");

    return `//! AUTOGENERATED - DO NOT EDIT
//! ${prefix} client — typed methods parameterized on a backend type.
//!
//! The backend must satisfy: call(self, request: []const u8) ![]u8 and destroy(self) void.
//! See backend.zig for the interface contract.
//! Implementations: ipc_runtime.Client, FfiBackend (ffi_backend.zig).

const std = @import("std");
const msgpack = @import("msgpack");
const Payload = msgpack.Payload;
const types = @import("${typesFile}");
const backend_mod = @import("backend.zig");

const alloc = std.heap.page_allocator;

pub fn Client(comptime BackendType: type) type {
    comptime backend_mod.assertBackend(BackendType);

    return struct {
        const Self = @This();
        backend: *BackendType,

        pub fn init(backend: *BackendType) Self {
            return .{ .backend = backend };
        }

        pub fn destroy(self: *Self) void {
            self.backend.destroy();
        }

        pub fn shutdown(self: *Self) !void {
            const request_bytes = try Self.encode("${prefix}Shutdown", Payload.mapPayload(alloc));
            defer alloc.free(request_bytes);
            const response_bytes = try self.backend.call(request_bytes);
            alloc.free(response_bytes);
        }

${methods}

        // --- internal helpers ---

        fn encode(cmd_name: []const u8, cmd_fields: Payload) ![]u8 {
            var inner = try Payload.arrPayload(2, alloc);
            try inner.setArrElement(0, try Payload.strToPayload(cmd_name, alloc));
            try inner.setArrElement(1, cmd_fields);
            var outer = try Payload.arrPayload(1, alloc);
            try outer.setArrElement(0, inner);

            var allocating_writer = std.Io.Writer.Allocating.init(alloc);
            var packer = msgpack.PackerIO.init(undefined, &allocating_writer.writer);
            try packer.write(outer);
            return try allocating_writer.toOwnedSlice();
        }

        fn decode(response_bytes: []const u8) !struct { []const u8, Payload } {
            var reader = std.Io.Reader.fixed(response_bytes);
            var unpacker = msgpack.PackerIO.init(&reader, undefined);
            const resp = try unpacker.read(alloc);
            const resp_len = try resp.getArrLen();
            if (resp_len != 2) return error.InvalidResponse;
            const name = try (try resp.getArrElement(0)).asStr();
            const payload = try resp.getArrElement(1);
            return .{ name, payload };
        }
    };
}
`;
  }

  /** Generate the server wrapper — dispatch + stub handlers over generic IPC server */
  generateServer(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName || "ErrorResponse";
    const { prefix } = this.opts;
    const errorRespName = toPascalCase(this.errorTypeName);
    const typesFile = `${toSnakeCase(prefix)}_types.zig`;

    // Dispatch cases: match command name → deserialize → call handler → serialize response
    const dispatchCases = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const methodName = this.methodName(c.name);
        const zigCmdName = toPascalCase(c.name);
        const zigRespName = toPascalCase(c.responseType);
        return `        if (std.mem.eql(u8, cmd_name, "${c.name}")) {
            const cmd = types.${zigCmdName}.fromPayload(cmd_fields) catch return makeError("deser failed");
            const resp = ${methodName}(cmd) catch return makeError("not implemented: ${c.name}");
            return .{ .resp_name = "${c.responseType}", .resp_payload = resp.toPayload(alloc) };
        }`;
      })
      .join("\n");

    // Stub handler functions
    const stubs = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const methodName = this.methodName(c.name);
        const zigCmdName = toPascalCase(c.name);
        const zigRespName = toPascalCase(c.responseType);
        return `/// TODO: implement ${c.name}
fn ${methodName}(cmd: types.${zigCmdName}) !types.${zigRespName} {
    _ = cmd;
    return error.NotImplemented;
}`;
      })
      .join("\n\n");

    return `//! AUTOGENERATED - DO NOT EDIT
//! ${prefix} IPC server — typed dispatch + stub handlers.
//!
//! Wire this dispatcher into the transport of your choice. The recommended
//! path is @import("ipc_runtime"):
//!
//!     var server = try ipc_runtime.Server.fromPath(path);
//!     try server.listen();
//!     server.run(*MyCtx, &ctx, byteHandler);
//!
//! Where \`byteHandler\` calls \`dispatch(cmd_name, fields)\` on the decoded
//! [name, payload] msgpack request. See the echo example for the full shape.

const std = @import("std");
const msgpack = @import("msgpack");
const Payload = msgpack.Payload;
const types = @import("${typesFile}");

const alloc = std.heap.page_allocator;

/// Result of dispatching one command. The caller msgpack-encodes
/// [resp_name, resp_payload] and returns the resulting bytes to the
/// transport.
pub const DispatchResult = struct { resp_name: []const u8, resp_payload: anyerror!Payload };

pub fn dispatch(cmd_name: []const u8, cmd_fields: Payload) DispatchResult {
    // Shutdown
    if (std.mem.eql(u8, cmd_name, "${prefix}Shutdown")) {
        return .{ .resp_name = "${prefix}ShutdownResponse", .resp_payload = Payload.mapPayload(alloc) };
    }

    // Command dispatch
${dispatchCases}

    return makeError("unknown command");
}

fn makeError(message: []const u8) DispatchResult {
    var err_map = Payload.mapPayload(alloc);
    err_map.mapPut("message", Payload.strToPayload(message, alloc) catch return .{ .resp_name = "${errorRespName}", .resp_payload = Payload.mapPayload(alloc) }) catch {};
    return .{ .resp_name = "${errorRespName}", .resp_payload = err_map };
}

// ---------------------------------------------------------------------------
// Handler stubs — implement these to build your ${prefix} service.
// ---------------------------------------------------------------------------

${stubs}
`;
  }

  // -----------------------------------------------------------------------
  // Skeleton generation (one-time handler stubs + main + build files)
  // -----------------------------------------------------------------------

  /** Generate handler stub implementations that return error.NotImplemented */
  generateHandlerStubs(schema: CompiledSchema): string {
    const { prefix } = this.opts;
    const typesFile = `${toSnakeCase(prefix)}_types.zig`;
    const serverFile = `${toSnakeCase(prefix)}_server.zig`;
    const ctxName = `${prefix}Context`;

    const stubs = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const methodName = this.methodName(c.name);
        const zigCmdName = toPascalCase(c.name);
        const zigRespName = toPascalCase(c.responseType);
        return `pub fn ${methodName}(ctx: *${ctxName}, cmd: types.${zigCmdName}) !types.${zigRespName} {
    _ = ctx;
    _ = cmd;
    return error.NotImplemented;
}`;
      })
      .join("\n\n");

    return `// Handler stubs — implement your service logic here.
// This file is generated ONCE. Edit freely — it will not be overwritten.

const std = @import("std");
const types = @import("generated/${typesFile}");

/// Shared context for your service — add database connections, state, etc.
pub const ${ctxName} = struct {
    // Add your shared state here
};

// ---------------------------------------------------------------------------
// Handler implementations — fill these in with your service logic.
// ---------------------------------------------------------------------------

${stubs}
`;
  }

  /** Generate a main.zig entry point for a standalone service */
  generateMain(schema: CompiledSchema): string {
    const { prefix } = this.opts;
    const serverFile = `${toSnakeCase(prefix)}_server`;
    const handlersFile = `${toSnakeCase(prefix)}_handlers`;

    return `// Entry point for ${prefix} service.
// This file is generated ONCE. Edit freely — it will not be overwritten.

const std = @import("std");
const server = @import("generated/${serverFile}.zig");

pub fn main() !void {
    const args = try std.process.argsAlloc(std.heap.page_allocator);
    defer std.process.argsFree(std.heap.page_allocator, args);

    if (args.len < 2) {
        std.debug.print("Usage: ${toSnakeCase(prefix)} <socket_path>\\n", .{});
        std.process.exit(1);
    }

    const socket_path = args[1];
    std.debug.print("${prefix} server starting on {s}\\n", .{socket_path});
    try server.serve(socket_path);
}
`;
  }

  /** Generate build.zig for a standalone service */
  generateBuildFile(schema: CompiledSchema): string {
    const { prefix } = this.opts;
    const binName = toSnakeCase(prefix);

    return `const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const msgpack_dep = b.dependency("zig-msgpack", .{
        .target = target,
        .optimize = optimize,
    });

    const exe = b.addExecutable(.{
        .name = "${binName}",
        .root_source_file = b.path("main.zig"),
        .target = target,
        .optimize = optimize,
    });
    exe.root_module.addImport("msgpack", msgpack_dep.module("msgpack"));
    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| {
        run_cmd.addArgs(args);
    }

    const run_step = b.step("run", "Run the ${prefix} service");
    run_step.dependOn(&run_cmd.step);
}
`;
  }

  /** Generate build.zig.zon for dependency management */
  generateBuildZon(schema: CompiledSchema): string {
    const { prefix } = this.opts;
    const binName = toSnakeCase(prefix);

    return `.{
    .name = "${binName}-service",
    .version = "0.1.0",
    .dependencies = .{
        .@"zig-msgpack" = .{
            .url = "https://github.com/zig-msgpack/zig-msgpack/archive/refs/heads/main.tar.gz",
        },
    },
    .paths = .{
        "build.zig",
        "build.zig.zon",
        "main.zig",
        "generated",
    },
}
`;
  }

  /** Generate .gitignore for the skeleton project */
  generateGitignore(): string {
    return `# Generated IPC code — do not edit, re-run generate.sh instead
generated/
zig-out/
zig-cache/
.zig-cache/
`;
  }

  /** Generate a shell script to re-run codegen */
  generateGenerateScript(schemaPath: string): string {
    const { prefix } = this.opts;
    return `#!/usr/bin/env bash
# Re-generate IPC types, server, and client from schema.
# Run from the project root directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
SCHEMA="${schemaPath}"

node --experimental-strip-types "$(dirname "$SCRIPT_DIR")/codegen/src/generate.ts" \\
  --schema "$SCHEMA" \\
  --lang zig \\
  --out "$SCRIPT_DIR/generated" \\
  --prefix ${prefix} \\
  --server
`;
  }
}
