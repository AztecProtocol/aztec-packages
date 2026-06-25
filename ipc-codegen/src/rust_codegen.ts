/**
 * Rust Code Generator - String template based
 *
 * Philosophy:
 *   - String templates for file structure
 *   - Simple type mapping
 *   - Idiomatic Rust conventions
 *   - No complex abstraction
 */

import type { CompiledSchema, Type, Struct, Field } from "./schema_visitor.ts";
import { toSnakeCase, toPascalCase, toAliasName } from "./naming.ts";

export interface RustCodegenOptions {
  /** Type prefix, e.g. 'Svc' (used for type/file naming) */
  prefix?: string;
  /** Strip the prefix from method names, e.g. SvcGetInfo -> get_info */
  stripMethodPrefix?: boolean;
  /** API struct name, e.g. 'SvcApi'. Defaults to 'IpcApi' */
  apiStructName?: string;
  /** Import path for Backend trait. Defaults to 'crate::backend::Backend' */
  backendImport?: string;
  /** Import path for error types. Defaults to 'crate::error::{IpcError, Result}' */
  errorImport?: string;
  /** Import path for generated types. Defaults to 'crate::types_gen::*' */
  typesImport?: string;
  /** Module doc comment for types file */
  typesDocComment?: string;
  /** Module doc comment for api file */
  apiDocComment?: string;
}

export class RustCodegen {
  private errorTypeName: string = "ErrorResponse";
  private opts: Required<RustCodegenOptions>;

  constructor(options?: RustCodegenOptions) {
    const prefix = options?.prefix ?? "";
    const name = prefix || "Ipc";
    this.opts = {
      prefix,
      stripMethodPrefix: options?.stripMethodPrefix ?? false,
      apiStructName: options?.apiStructName ?? `${name}Api`,
      backendImport: options?.backendImport ?? "super::backend::Backend",
      errorImport: options?.errorImport ?? `super::error::{IpcError, Result}`,
      typesImport:
        options?.typesImport ??
        `super::${toSnakeCase(prefix || "ipc")}_types::*`,
      typesDocComment:
        options?.typesDocComment ?? `Generated types for ${name} IPC protocol`,
      apiDocComment: options?.apiDocComment ?? `${name} IPC client API`,
    };
  }

  private primitiveType(type: Type): string {
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
        return "String";
      case "bytes":
        return "Vec<u8>";
      case "bin32":
        return "Bin32";
    }
    throw new Error(`Unsupported primitive type: ${type.primitive}`);
  }

  // Type mapping: Schema type -> Rust type
  private mapType(type: Type): string {
    switch (type.kind) {
      case "primitive":
        return type.originalName
          ? toAliasName(type.originalName)
          : this.primitiveType(type);

      case "vector":
        return `Vec<${this.mapType(type.element!)}>`;

      case "array":
        const elemType = this.mapType(type.element!);
        // Large arrays become Vec for ergonomics
        return type.size! > 32
          ? `Vec<${elemType}>`
          : `[${elemType}; ${type.size}]`;

      case "optional":
        return `Option<${this.mapType(type.element!)}>`;

      case "struct":
        // Convert struct names to PascalCase for Rust conventions
        return toPascalCase(type.struct!.name);
    }

    throw new Error(`Unsupported type kind: ${type.kind}`);
  }

  // Check if field needs serde(with = "serde_bytes")
  private needsSerdeBytes(type: Type): boolean {
    return type.kind === "primitive" && type.primitive === "bytes";
  }

  // Check if field needs serde(with = "serde_vec_bytes")
  private needsSerdeVecBytes(type: Type): boolean {
    return type.kind === "vector" && this.needsSerdeBytes(type.element!);
  }

  // Check if field needs serde(with = "serde_bytes_array") - for [Vec<u8>; N].
  // Only applies up to the size-32 cutoff in mapType; larger arrays become
  // Vec and take the serde_vec_bytes path.
  private needsSerdeBytesArray(type: Type): boolean {
    return (
      type.kind === "array" &&
      type.size! <= 32 &&
      this.needsSerdeBytes(type.element!)
    );
  }

  // Check if field needs serde(with = "serde_vec_bytes") via the large-array
  // fallback ([bytes; N>32] maps to Vec<Vec<u8>>).
  private needsSerdeLargeBytesArray(type: Type): boolean {
    return (
      type.kind === "array" &&
      type.size! > 32 &&
      this.needsSerdeBytes(type.element!)
    );
  }

  // Check if field needs serde(with = "serde_opt_bytes")
  private needsSerdeOptBytes(type: Type): boolean {
    return type.kind === "optional" && this.needsSerdeBytes(type.element!);
  }

  // Generate struct field
  private generateField(field: Field): string {
    const rustName = toSnakeCase(field.name);
    const rustType = this.mapType(field.type);
    let attrs = "";

    // Add serde rename if needed
    if (field.name !== rustName) {
      attrs += `    #[serde(rename = "${field.name}")]\n`;
    }

    // Add serde bytes handling
    if (this.needsSerdeBytesArray(field.type)) {
      attrs += `    #[serde(with = "serde_bytes_array")]\n`;
    } else if (
      this.needsSerdeVecBytes(field.type) ||
      this.needsSerdeLargeBytesArray(field.type)
    ) {
      attrs += `    #[serde(with = "serde_vec_bytes")]\n`;
    } else if (this.needsSerdeOptBytes(field.type)) {
      attrs += `    #[serde(with = "serde_opt_bytes")]\n`;
    } else if (this.needsSerdeBytes(field.type)) {
      attrs += `    #[serde(with = "serde_bytes")]\n`;
    }

    return `${attrs}    pub ${rustName}: ${rustType},`;
  }

  // Generate a struct definition
  private generateStruct(struct: Struct, isCommand: boolean): string {
    const rustName = toPascalCase(struct.name);
    const fields = struct.fields.map((f) => this.generateField(f)).join("\n");

    // Add serde rename if struct name changed
    const serdeRename =
      struct.name !== rustName ? `\n#[serde(rename = "${struct.name}")]` : "";

    // Generate constructor for commands
    const constructor = isCommand
      ? this.generateConstructor(struct, rustName)
      : "";

    return `/// ${struct.name}
#[derive(Debug, Clone, Serialize, Deserialize)]${serdeRename}
pub struct ${rustName} {
${fields}
}${constructor}`;
  }

  // Generate constructor for command structs
  private generateConstructor(struct: Struct, rustName: string): string {
    const params = struct.fields
      .map((f) => `${toSnakeCase(f.name)}: ${this.mapType(f.type)}`)
      .join(", ");

    const fieldInits = struct.fields
      .map((f) => `            ${toSnakeCase(f.name)},`)
      .join("\n");

    return `

impl ${rustName} {
    pub fn new(${params}) -> Self {
        Self {
${fieldInits}
        }
    }
}`;
  }

  // Generate Command enum
  private generateCommandEnum(schema: CompiledSchema): string {
    const names = schema.commands.map((c) => c.name);
    const variants = names
      .map((name) => {
        const rustName = toPascalCase(name);
        return `    ${rustName}(${rustName}),`;
      })
      .join("\n");

    const serializeCases = names
      .map((name) => {
        const rustName = toPascalCase(name);
        return `            Command::${rustName}(data) => {
                tuple.serialize_element("${name}")?;
                tuple.serialize_element(data)?;
            }`;
      })
      .join("\n");

    const deserializeCases = names
      .map((name) => {
        const rustName = toPascalCase(name);
        return `                    "${name}" => {
                        let data = seq.next_element()?
                            .ok_or_else(|| serde::de::Error::invalid_length(1, &self))?;
                        Ok(Command::${rustName}(data))
                    }`;
      })
      .join("\n");

    const variantNames = names.map((name) => `"${name}"`).join(", ");

    return `/// Command enum - wraps all possible commands
#[derive(Debug, Clone)]
pub enum Command {
${variants}
}

impl Serialize for Command {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        use serde::ser::SerializeTuple;
        let mut tuple = serializer.serialize_tuple(2)?;
        match self {
${serializeCases}
        }
        tuple.end()
    }
}

impl<'de> Deserialize<'de> for Command {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where D: serde::Deserializer<'de> {
        use serde::de::{SeqAccess, Visitor};
        struct CommandVisitor;

        impl<'de> Visitor<'de> for CommandVisitor {
            type Value = Command;
            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a 2-element array [name, payload]")
            }
            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where A: SeqAccess<'de> {
                let name: String = seq.next_element()?
                    .ok_or_else(|| serde::de::Error::invalid_length(0, &self))?;
                match name.as_str() {
${deserializeCases}
                    _ => Err(serde::de::Error::unknown_variant(&name, &[${variantNames}])),
                }
            }
        }
        deserializer.deserialize_tuple(2, CommandVisitor)
    }
}`;
  }

  // Generate Response enum
  private generateResponseEnum(schema: CompiledSchema): string {
    // Include all response types from commands plus ErrorResponse if it exists
    const commandResponseTypes = Array.from(
      new Set(schema.commands.map((c) => c.responseType)),
    );
    const errorName = schema.errorTypeName;
    const responseTypes = schema.responses.has(errorName)
      ? [...commandResponseTypes, errorName]
      : commandResponseTypes;
    const variants = responseTypes
      .map((name) => {
        const rustName = toPascalCase(name);
        return `    ${rustName}(${rustName}),`;
      })
      .join("\n");

    const serializeCases = responseTypes
      .map((name) => {
        const rustName = toPascalCase(name);
        return `            Response::${rustName}(data) => {
                tuple.serialize_element("${name}")?;
                tuple.serialize_element(data)?;
            }`;
      })
      .join("\n");

    const deserializeCases = responseTypes
      .map((name) => {
        const rustName = toPascalCase(name);
        return `                    "${name}" => {
                        let data = seq.next_element()?
                            .ok_or_else(|| serde::de::Error::invalid_length(1, &self))?;
                        Ok(Response::${rustName}(data))
                    }`;
      })
      .join("\n");

    const variantNames = responseTypes.map((name) => `"${name}"`).join(", ");

    return `/// Response enum - wraps all possible responses
#[derive(Debug, Clone)]
pub enum Response {
${variants}
}

impl Serialize for Response {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        use serde::ser::SerializeTuple;
        let mut tuple = serializer.serialize_tuple(2)?;
        match self {
${serializeCases}
        }
        tuple.end()
    }
}

impl<'de> Deserialize<'de> for Response {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where D: serde::Deserializer<'de> {
        use serde::de::{SeqAccess, Visitor};
        struct ResponseVisitor;

        impl<'de> Visitor<'de> for ResponseVisitor {
            type Value = Response;
            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a 2-element array [name, payload]")
            }
            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where A: SeqAccess<'de> {
                let name: String = seq.next_element()?
                    .ok_or_else(|| serde::de::Error::invalid_length(0, &self))?;
                match name.as_str() {
${deserializeCases}
                    _ => Err(serde::de::Error::unknown_variant(&name, &[${variantNames}])),
                }
            }
        }
        deserializer.deserialize_tuple(2, ResponseVisitor)
    }
}`;
  }

  // Generate serde helper modules
  private generateSerdeHelpers(): string {
    return `mod serde_bytes {
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S>(bytes: &Vec<u8>, serializer: S) -> Result<S::Ok, S::Error>
    where S: Serializer { serializer.serialize_bytes(bytes) }
    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error>
    where D: Deserializer<'de> { <Vec<u8>>::deserialize(deserializer) }
}

mod serde_vec_bytes {
    use serde::{Deserialize, Deserializer, Serializer, Serialize};
    use serde::ser::SerializeSeq;
    use serde::de::{SeqAccess, Visitor};

    #[derive(Serialize, Deserialize)]
    struct BytesWrapper(#[serde(with = "super::serde_bytes")] Vec<u8>);

    pub fn serialize<S>(vec: &Vec<Vec<u8>>, serializer: S) -> Result<S::Ok, S::Error>
    where S: Serializer {
        let mut seq = serializer.serialize_seq(Some(vec.len()))?;
        for bytes in vec {
            seq.serialize_element(&BytesWrapper(bytes.clone()))?;
        }
        seq.end()
    }
    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<Vec<u8>>, D::Error>
    where D: Deserializer<'de> {
        struct VecVecU8Visitor;
        impl<'de> Visitor<'de> for VecVecU8Visitor {
            type Value = Vec<Vec<u8>>;
            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a sequence of byte arrays")
            }
            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where A: SeqAccess<'de> {
                let mut vec = Vec::new();
                while let Some(wrapper) = seq.next_element::<BytesWrapper>()? {
                    vec.push(wrapper.0);
                }
                Ok(vec)
            }
        }
        deserializer.deserialize_seq(VecVecU8Visitor)
    }
}

mod serde_bytes_array {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use serde::ser::SerializeTuple;
    use serde::de::{SeqAccess, Visitor};

    #[derive(Serialize, Deserialize)]
    struct BytesWrapper(#[serde(with = "super::serde_bytes")] Vec<u8>);

    pub fn serialize<S, const N: usize>(arr: &[Vec<u8>; N], serializer: S) -> Result<S::Ok, S::Error>
    where S: Serializer {
        let mut tup = serializer.serialize_tuple(N)?;
        for bytes in arr {
            tup.serialize_element(&BytesWrapper(bytes.clone()))?;
        }
        tup.end()
    }
    pub fn deserialize<'de, D, const N: usize>(deserializer: D) -> Result<[Vec<u8>; N], D::Error>
    where D: Deserializer<'de> {
        struct ArrayVisitor<const N: usize>;
        impl<'de, const N: usize> Visitor<'de> for ArrayVisitor<N> {
            type Value = [Vec<u8>; N];
            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                write!(formatter, "an array of {N} byte arrays")
            }
            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where A: SeqAccess<'de> {
                let mut arr: [Vec<u8>; N] = std::array::from_fn(|_| Vec::new());
                for (i, item) in arr.iter_mut().enumerate() {
                    *item = seq.next_element::<BytesWrapper>()?
                        .ok_or_else(|| serde::de::Error::invalid_length(i, &self))?.0;
                }
                Ok(arr)
            }
        }
        deserializer.deserialize_tuple(N, ArrayVisitor::<N>)
    }
}

mod serde_opt_bytes {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    #[derive(Serialize, Deserialize)]
    struct BytesWrapper(#[serde(with = "super::serde_bytes")] Vec<u8>);

    pub fn serialize<S>(opt: &Option<Vec<u8>>, serializer: S) -> Result<S::Ok, S::Error>
    where S: Serializer {
        match opt {
            Some(bytes) => serializer.serialize_some(&BytesWrapper(bytes.clone())),
            None => serializer.serialize_none(),
        }
    }
    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<Vec<u8>>, D::Error>
    where D: Deserializer<'de> {
        Ok(Option::<BytesWrapper>::deserialize(deserializer)?.map(|w| w.0))
    }
}`;
  }

  // Generate types file
  generateTypes(schema: CompiledSchema, schemaHash?: string): string {
    this.errorTypeName = schema.errorTypeName;
    // Command structs get a generated `new()` constructor; response/shared
    // structs do not.
    const commandNames = new Set(schema.commands.map((c) => c.name));

    const aliasTypes = new Map<string, string>();
    const collect = (type: Type): void => {
      if (type.kind === "primitive" && type.originalName) {
        aliasTypes.set(
          toAliasName(type.originalName),
          type.primitive === "bin32" ? "Bin32" : this.primitiveType(type),
        );
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
      .map(([name, underlying]) => `pub type ${name} = ${underlying};`)
      .join("\n");

    // Generate all structs (commands first, then responses)
    const commandStructs = Array.from(schema.structs.values())
      .map((s) => this.generateStruct(s, commandNames.has(s.name)))
      .join("\n\n");

    // A response can reference a type also discovered inline as a field
    // (registered in structs); emit it only once, from commandStructs.
    const responseStructs = Array.from(schema.responses.values())
      .filter((s) => !schema.structs.has(s.name))
      .map((s) => this.generateStruct(s, false))
      .join("\n\n");

    const hashLine = schemaHash
      ? `\n/// Schema version hash for compatibility checking\npub const SCHEMA_HASH: &str = "${schemaHash}";\n`
      : "";

    return `//! AUTOGENERATED - DO NOT EDIT
//! ${this.opts.typesDocComment}

use serde::{Deserialize, Serialize};
${hashLine}
/// 32 raw bytes encoded as msgpack bin32. Primitive schema aliases below are
/// zero-cost pub type declarations over either this newtype or a scalar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Bin32(pub [u8; 32]);

impl Bin32 {
    pub fn from_bytes(bytes: [u8; 32]) -> Self { Self(bytes) }
    pub fn to_bytes(&self) -> &[u8; 32] { &self.0 }
    pub fn as_slice(&self) -> &[u8] { &self.0 }
}

impl Serialize for Bin32 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        serializer.serialize_bytes(&self.0)
    }
}

impl<'de> Deserialize<'de> for Bin32 {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where D: serde::Deserializer<'de> {
        let bytes: Vec<u8> = <Vec<u8>>::deserialize(deserializer)?;
        let arr: [u8; 32] = bytes.try_into()
            .map_err(|v: Vec<u8>| serde::de::Error::invalid_length(v.len(), &"32 bytes"))?;
        Ok(Bin32(arr))
    }
}

${aliasDecls}

${this.generateSerdeHelpers()}

${commandStructs}

${responseStructs}

${this.generateCommandEnum(schema)}

${this.generateResponseEnum(schema)}
`;
  }

  /** Convert a command name to a Rust method name (snake_case) */
  private methodName(commandName: string): string {
    const withoutPrefix =
      this.opts.stripMethodPrefix &&
      this.opts.prefix &&
      commandName.startsWith(this.opts.prefix)
        ? commandName.slice(this.opts.prefix.length)
        : commandName;
    return toSnakeCase(withoutPrefix);
  }

  // Generate API method
  private generateApiMethod(command: {
    name: string;
    fields: Field[];
    responseType: string;
  }): string {
    const methodName = this.methodName(command.name);
    const cmdRustName = toPascalCase(command.name);
    const respRustName = toPascalCase(command.responseType);

    const params = command.fields
      .map((f) => {
        const rustType = this.mapType(f.type);
        // Only convert simple Vec<u8> to &[u8], not nested types
        const apiType = rustType === "Vec<u8>" ? "&[u8]" : rustType;
        return `${toSnakeCase(f.name)}: ${apiType}`;
      })
      .join(", ");

    const paramConversions = command.fields
      .map((f) => {
        const name = toSnakeCase(f.name);
        const rustType = this.mapType(f.type);
        // Only convert slices back to Vec
        if (rustType === "Vec<u8>") {
          return `${name}.to_vec()`;
        }
        return name;
      })
      .join(", ");

    // Extract error type name from the error import (e.g., 'IpcError' from 'crate::error::{IpcError, Result}')
    const errorType =
      this.opts.errorImport.match(/\{(\w+),/)?.[1] ?? "IpcError";

    return `    /// Execute ${command.name}
    pub fn ${methodName}(&mut self, ${params}) -> Result<${respRustName}> {
        let cmd = Command::${cmdRustName}(${cmdRustName}::new(${paramConversions}));
        match self.execute(cmd)? {
            Response::${respRustName}(resp) => Ok(resp),
            Response::${toPascalCase(this.errorTypeName)}(err) => Err(${errorType}::Backend(
                err.message
            )),
            _ => Err(${errorType}::InvalidResponse(
                "Expected ${command.responseType}".to_string()
            )),
        }
    }`;
  }

  // Generate API file
  generateApi(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName;
    const {
      apiStructName,
      backendImport,
      errorImport,
      typesImport,
      apiDocComment,
    } = this.opts;

    const apiMethods = schema.commands
      .map((c) => this.generateApiMethod(c))
      .join("\n\n");

    const errorType = errorImport.match(/\{(\w+),/)?.[1] ?? "IpcError";

    return `//! AUTOGENERATED - DO NOT EDIT
//! ${apiDocComment}

use ${backendImport};
use ${errorImport};
use ${typesImport};

/// ${apiDocComment}
pub struct ${apiStructName}<B: Backend> {
    backend: B,
}

impl<B: Backend> ${apiStructName}<B> {
    /// Create API with custom backend
    pub fn new(backend: B) -> Self {
        Self { backend }
    }

    fn execute(&mut self, command: Command) -> Result<Response> {
        let input_buffer = rmp_serde::to_vec_named(&vec![command])
            .map_err(|e| ${errorType}::Serialization(e.to_string()))?;

        let output_buffer = self.backend.call(&input_buffer)?;

        let response: Response = rmp_serde::from_slice(&output_buffer)
            .map_err(|e| ${errorType}::Deserialization(e.to_string()))?;

        Ok(response)
    }

${apiMethods}
    /// Destroy backend without shutdown command
    pub fn destroy(&mut self) -> Result<()> {
        self.backend.destroy()
    }
}
`;
  }

  // -----------------------------------------------------------------------
  // Server-side code generation
  // -----------------------------------------------------------------------

  /** Generate a Handler trait and serve() function */
  generateServer(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName;
    const { prefix, errorImport, typesImport } = this.opts;
    const errorRespType = toPascalCase(this.errorTypeName);

    const traitMethods = schema.commands
      .map((c) => {
        const methodName = this.methodName(c.name);
        const cmdRustName = toPascalCase(c.name);
        const respRustName = toPascalCase(c.responseType);
        return `    fn ${methodName}(&mut self, cmd: ${cmdRustName}, respond: Responder<${respRustName}>);`;
      })
      .join("\n");

    const dispatchArms = schema.commands
      .map((c) => {
        const methodName = this.methodName(c.name);
        const cmdRustName = toPascalCase(c.name);
        const respRustName = toPascalCase(c.responseType);
        return `        Command::${cmdRustName}(cmd) => {
            handler.${methodName}(cmd, Responder { raw, wrap: Response::${respRustName} });
        }`;
      })
      .join("\n");

    return `//! AUTOGENERATED - DO NOT EDIT
//! Server-side dispatch for ${prefix || "service"} IPC protocol

#[allow(unused_imports)]
use ${errorImport};
use ${typesImport};

/// Byte-level response sink supplied by the server backend. Delivers a finished
/// response frame; may be called from any thread (Send) so a handler can defer
/// its work and respond later.
pub type RawRespond = Box<dyn FnOnce(Vec<u8>) + Send>;

/// Typed response callback handed to each handler. Exactly one of ok()/error()
/// is called exactly once. It encodes the response frame (wrapping the value in
/// the response union) and hands it to the sink.
pub struct Responder<R> {
    raw: RawRespond,
    wrap: fn(R) -> Response,
}

impl<R> Responder<R> {
    pub fn ok(self, resp: R) {
        let frame = (self.wrap)(resp);
        (self.raw)(rmp_serde::to_vec_named(&frame).unwrap_or_default());
    }

    pub fn error(self, message: String) {
        let frame = Response::${errorRespType}(${errorRespType} { message });
        (self.raw)(rmp_serde::to_vec_named(&frame).unwrap_or_default());
    }
}

/// Handler trait — implement this to serve ${prefix || "service"} commands. Each
/// handler produces its result by calling respond.ok(value) / respond.error(msg),
/// synchronously or (with an async transport) later from another thread.
pub trait Handler {
${traitMethods}
}

/// Dispatch a single decoded command, building the typed responder.
pub fn dispatch(handler: &mut dyn Handler, command: Command, raw: RawRespond) {
    match command {
${dispatchArms}
    }
}

fn error_frame(message: String) -> Vec<u8> {
    rmp_serde::to_vec_named(&Response::${errorRespType}(${errorRespType} { message })).unwrap_or_default()
}

/// Decode a framed request, dispatch it, and return the encoded response frame.
/// Assumes the handler responds synchronously (the sync-transport case used by
/// the generated server glue); an async transport would instead pass its own
/// RawRespond to dispatch() and let the handler respond when ready.
pub fn handle_request(handler: &mut dyn Handler, request_bytes: &[u8]) -> Vec<u8> {
    let slot = std::sync::Arc::new(std::sync::Mutex::new(None::<Vec<u8>>));
    let sink_slot = slot.clone();
    let raw: RawRespond = Box::new(move |bytes| {
        *sink_slot.lock().unwrap() = Some(bytes);
    });

    match rmp_serde::from_slice::<Vec<Command>>(request_bytes) {
        Err(e) => raw(error_frame(format!("malformed request: {e}"))),
        Ok(commands) => match commands.into_iter().next() {
            None => raw(error_frame("malformed request: empty command array".to_string())),
            Some(command) => dispatch(handler, command, raw),
        },
    }

    let out = slot.lock().unwrap().take();
    out.unwrap_or_default()
}
`;
  }
}
