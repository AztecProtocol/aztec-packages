/**
 * Zig Code Generator
 *
 * Generates Zig structs, serialization/deserialization functions, and IPC client
 * from a CompiledSchema. Uses zig-msgpack's Payload API for wire encoding.
 *
 * Since Zig has no reflection-based serde, all serialization code is generated
 * explicitly per struct.
 */

import type { CompiledSchema, Type, Struct, Field, Command } from './schema_visitor.ts';
import { toSnakeCase, toPascalCase } from './naming.ts';

export interface ZigCodegenOptions {
  /** Service prefix to strip from method names (e.g., 'Wsdb') */
  prefix?: string;
  /** Client struct name (e.g., 'WsdbClient') */
  clientName?: string;
}

export class ZigCodegen {
  private errorTypeName: string = 'ErrorResponse';
  private opts: Required<ZigCodegenOptions>;

  constructor(options?: ZigCodegenOptions) {
    this.opts = {
      prefix: options?.prefix ?? '',
      clientName: options?.clientName ?? 'Client',
    };
  }

  /** Map schema type to Zig type */
  private mapType(type: Type): string {
    switch (type.kind) {
      case 'primitive':
        switch (type.primitive) {
          case 'bool': return 'bool';
          case 'u8': return 'u8';
          case 'u16': return 'u16';
          case 'u32': return 'u32';
          case 'u64': return 'u64';
          case 'f64': return 'f64';
          case 'string': return '[]const u8';
          case 'bytes': return '[]const u8';
          case 'fr': return 'Fr';  // [32]u8
          case 'field2': return '[2]Fr';
          case 'enum_u32': return 'u32';
          case 'map_u32_pair': return 'void'; // TODO: proper map support
        }
        break;
      case 'vector':
        return `[]const ${this.mapType(type.element!)}`;
      case 'array':
        return `[${type.size}]${this.mapType(type.element!)}`;
      case 'optional':
        return `?${this.mapType(type.element!)}`;
      case 'struct':
        return toPascalCase(type.struct!.name);
    }
    return 'void';
  }

  /** Generate a Zig field-to-payload conversion expression */
  private fieldToPayload(fieldExpr: string, type: import('./schema_visitor.ts').Type): string {
    switch (type.kind) {
      case 'primitive':
        switch (type.primitive) {
          case 'bool': return `Payload{ .bool = ${fieldExpr} }`;
          case 'u8': case 'u16': case 'u32': case 'u64':
            return `Payload{ .uint = @intCast(${fieldExpr}) }`;
          case 'f64': return `Payload{ .float = ${fieldExpr} }`;
          case 'string': return `try Payload.strToPayload(${fieldExpr}, allocator)`;
          case 'bytes': return `try Payload.binToPayload(${fieldExpr}, allocator)`;
          case 'fr': return `try Payload.binToPayload(&${fieldExpr}, allocator)`;
          case 'enum_u32': return `Payload{ .uint = @intCast(${fieldExpr}) }`;
          default: return `Payload{ .nil = {} }`;
        }
      case 'optional':
        return `if (${fieldExpr}) |v| ${this.fieldToPayload('v', type.element!)} else Payload{ .nil = {} }`;
      case 'vector': {
        // For vectors, build an array payload
        return `blk: {
                var arr = try Payload.arrPayload(${fieldExpr}.len, allocator);
                for (${fieldExpr}, 0..) |item, i| {
                    try arr.setArrElement(i, ${this.fieldToPayload('item', type.element!)});
                }
                break :blk arr;
            }`;
      }
      case 'struct':
        return `try ${fieldExpr}.toPayload(allocator)`;
      default: return `Payload{ .nil = {} }`;
    }
  }

  /** Generate a Zig payload-to-field conversion expression */
  private fieldFromPayload(payloadExpr: string, type: import('./schema_visitor.ts').Type): string {
    switch (type.kind) {
      case 'primitive':
        switch (type.primitive) {
          case 'bool': return `try ${payloadExpr}.asBool()`;
          case 'u8': return `@intCast(try ${payloadExpr}.asUint())`;
          case 'u16': return `@intCast(try ${payloadExpr}.asUint())`;
          case 'u32': return `@intCast(try ${payloadExpr}.asUint())`;
          case 'u64': return `try ${payloadExpr}.asUint()`;
          case 'f64': return `try ${payloadExpr}.asFloat()`;
          case 'string': return `try ${payloadExpr}.asStr()`;
          case 'bytes': return `${payloadExpr}.bin.value()`;
          case 'fr': return `${payloadExpr}.bin.value()[0..32].*`;
          case 'enum_u32': return `@intCast(try ${payloadExpr}.asUint())`;
          default: return `undefined`;
        }
      case 'vector': {
        const elemConv = this.fieldFromPayload('elem', type.element!);
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
      case 'optional':
        return `if (${payloadExpr} == .nil) null else ${this.fieldFromPayload(payloadExpr, type.element!)}`;
      case 'struct':
        return `try ${toPascalCase(type.struct!.name)}.fromPayload(${payloadExpr})`;
      default: return `undefined`;
    }
  }

  /** Generate a Zig struct definition with toPayload/fromPayload methods */
  private generateStruct(struct: Struct): string {
    const zigName = toPascalCase(struct.name);
    const fields = struct.fields.map(f => {
      const zigFieldName = toSnakeCase(f.name);
      const zigType = this.mapType(f.type);
      return `    ${zigFieldName}: ${zigType},`;
    }).join('\n');

    // Treat structs with only void fields as empty (void comes from unmapped types)
    const hasFields = struct.fields.length > 0 && struct.fields.some(f => this.mapType(f.type) !== 'void');

    // toPayload method
    const toPayloadFields = struct.fields.map(f => {
      const zigFieldName = toSnakeCase(f.name);
      return `        try map.mapPut("${f.name}", ${this.fieldToPayload(`self.${zigFieldName}`, f.type)});`;
    }).join('\n');

    // fromPayload method
    const fromPayloadFields = struct.fields.map(f => {
      const zigFieldName = toSnakeCase(f.name);
      return `            .${zigFieldName} = ${this.fieldFromPayload(`(try payload.mapGet("${f.name}")).?`, f.type)},`;
    }).join('\n');

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

    const fieldPacks = struct.fields.map(f => {
      const zigFieldName = toSnakeCase(f.name);
      return `    try packField(packer, "${f.name}", self.${zigFieldName});`;
    }).join('\n');

    return `pub fn serialize${zigName}(self: ${zigName}, packer: anytype) !void {
    try packer.writeMapHeader(${fieldCount});
${fieldPacks}
}`;
  }

  /** Generate deserialize function for a struct */
  private generateDeserializeFn(struct: Struct): string {
    const zigName = toPascalCase(struct.name);

    const fieldReads = struct.fields.map(f => {
      const zigFieldName = toSnakeCase(f.name);
      const zigType = this.mapType(f.type);
      return `        .${zigFieldName} = try readField(${zigType}, unpacker, "${f.name}"),`;
    }).join('\n');

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
    const variants = schema.commands.map(c => {
      const zigName = toPascalCase(c.name);
      return `    ${toSnakeCase(c.name)}: ${zigName},`;
    }).join('\n');

    const nameMap = schema.commands.map(c => {
      return `        .${toSnakeCase(c.name)} => "${c.name}",`;
    }).join('\n');

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
    const commandResponseTypes = Array.from(new Set(schema.commands.map(c => c.responseType)));
    const errorName = schema.errorTypeName || 'ErrorResponse';
    const responseTypes = schema.responses.has(errorName)
      ? [...commandResponseTypes, errorName]
      : commandResponseTypes;

    const variants = responseTypes.map(name => {
      const zigName = toPascalCase(name);
      return `    ${toSnakeCase(name)}: ${zigName},`;
    }).join('\n');

    return `/// Tagged union of all responses
pub const Response = union(enum) {
${variants}
};`;
  }

  /** Generate the types file */
  generateTypes(schema: CompiledSchema, schemaHash?: string): string {
    this.errorTypeName = schema.errorTypeName || 'ErrorResponse';

    const allStructs = [...schema.structs.values(), ...schema.responses.values()];

    const structDefs = allStructs.map(s => this.generateStruct(s)).join('\n\n');

    const hashLine = schemaHash
      ? `\n/// Schema version hash for compatibility checking\npub const SCHEMA_HASH = "${schemaHash}";\n`
      : '';

    return `//! AUTOGENERATED - DO NOT EDIT
//! Generated from Aztec IPC msgpack schema
//!
//! Each struct has toPayload() and fromPayload() methods that convert
//! to/from zig-msgpack Payload objects for serialization.

const std = @import("std");
const msgpack = @import("msgpack");
const Payload = msgpack.Payload;
const PackerIO = msgpack.PackerIO;
${hashLine}
/// 32-byte field element (Fr/Fq). Fixed-size, stack-allocated.
pub const Fr = [32]u8;

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
    const withoutPrefix = this.opts.prefix && commandName.startsWith(this.opts.prefix)
      ? commandName.slice(this.opts.prefix.length)
      : commandName;
    return toSnakeCase(withoutPrefix);
  }

  /** Generate the client file */
  generateClient(schema: CompiledSchema, schemaHash?: string): string {
    this.errorTypeName = schema.errorTypeName || 'ErrorResponse';
    const { clientName } = this.opts;

    const methods = schema.commands
      .filter(c => !c.name.endsWith('Shutdown'))
      .map(c => {
        const methodName = this.methodName(c.name);
        const zigCmdName = toPascalCase(c.name);
        const zigRespName = toPascalCase(c.responseType);
        const params = c.fields.map(f => {
          return `${toSnakeCase(f.name)}: ${this.mapType(f.type)}`;
        }).join(', ');

        const fieldInits = c.fields.map(f => {
          return `            .${toSnakeCase(f.name)} = ${toSnakeCase(f.name)},`;
        }).join('\n');

        return `    /// Execute ${c.name}
    pub fn ${methodName}(self: *${clientName}, ${params.length > 0 ? params + ', ' : ''}allocator: std.mem.Allocator) !types.${zigRespName} {
        const cmd = types.${zigCmdName}{
${fieldInits}
        };
        _ = cmd;
        _ = allocator;
        _ = self;
        @panic("TODO: serialize command, send over UDS, deserialize response");
    }`;
      }).join('\n\n');

    return `//! AUTOGENERATED - DO NOT EDIT
//! ${clientName} - IPC client for Aztec service

const std = @import("std");
const types = @import("generated_types.zig");

/// IPC client that communicates with the service over a Unix Domain Socket.
/// Uses 4-byte LE length-prefix framing with msgpack payloads.
pub const ${clientName} = struct {
    stream: std.net.Stream,

    /// Connect to a service at the given socket path.
    pub fn connect(socket_path: []const u8) !${clientName} {
        const addr = try std.net.Address.initUnix(socket_path);
        const stream = try std.net.tcpConnectToAddress(addr);
        return .{ .stream = stream };
    }

    /// Close the connection.
    pub fn close(self: *${clientName}) void {
        self.stream.close();
    }

    /// Send a length-prefixed message.
    fn send(self: *${clientName}, data: []const u8) !void {
        const len: u32 = @intCast(data.len);
        try self.stream.writer().writeInt(u32, len, .little);
        try self.stream.writer().writeAll(data);
    }

    /// Receive a length-prefixed message.
    fn receive(self: *${clientName}, allocator: std.mem.Allocator) ![]u8 {
        const len = try self.stream.reader().readInt(u32, .little);
        const data = try allocator.alloc(u8, len);
        try self.stream.reader().readNoEof(data);
        return data;
    }

${methods}
};
`;
  }

  /** Generate the server dispatch file */
  generateServer(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName || 'ErrorResponse';
    const { clientName, prefix } = this.opts;
    const serverName = clientName.replace('Client', 'Handler');

    const handlerFields = schema.commands
      .filter(c => !c.name.endsWith('Shutdown'))
      .map(c => {
        const methodName = this.methodName(c.name);
        const zigCmdName = toPascalCase(c.name);
        const zigRespName = toPascalCase(c.responseType);
        return `    ${methodName}: *const fn (cmd: types.${zigCmdName}) anyerror!types.${zigRespName},`;
      }).join('\n');

    const dispatchCases = schema.commands
      .filter(c => !c.name.endsWith('Shutdown'))
      .map(c => {
        const methodName = this.methodName(c.name);
        return `        .${toSnakeCase(c.name)} => |cmd| return self.${methodName}(cmd),`;
      }).join('\n');

    return `//! AUTOGENERATED - DO NOT EDIT
//! Server-side dispatch for ${prefix || ''} IPC protocol

const std = @import("std");
const types = @import("generated_types.zig");
const framing = @import("../ipc_framing.zig");

/// Handler vtable — implement these function pointers to serve commands.
pub const ${serverName} = struct {
${handlerFields}

    /// Dispatch a command to the appropriate handler function.
    pub fn dispatch(self: ${serverName}, command: types.Command) !types.Response {
        switch (command) {
${dispatchCases}
        }
    }
};
`;
  }
}
