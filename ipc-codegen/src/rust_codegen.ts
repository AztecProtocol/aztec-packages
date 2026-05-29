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
import { toSnakeCase, toPascalCase } from "./naming.ts";

// Convert a schema alias name into its Rust type name. Strips a trailing
// `_t` (uint256_t → Uint256) and PascalCases the rest, so `fr` → `Fr`,
// `secp256k1_fr` → `Secp256k1Fr`, `uint256_t` → `Uint256`.
function toAliasName(name: string): string {
  const trimmed = name.endsWith("_t") ? name.slice(0, -2) : name;
  return toPascalCase(trimmed);
}

export interface RustCodegenOptions {
  /** Prefix for stripping from method names, e.g. 'Svc' makes SvcGetInfo -> get_info */
  prefix?: string;
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

  // Check if field needs serde(with = "serde_array4_bytes") - for [Vec<u8>; 4] (Poseidon2 state)
  private needsSerdeArray4Bytes(type: Type): boolean {
    return (
      type.kind === "array" &&
      type.size === 4 &&
      this.needsSerdeBytes(type.element!)
    );
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
    if (this.needsSerdeArray4Bytes(field.type)) {
      attrs += `    #[serde(with = "serde_array4_bytes")]\n`;
    } else if (this.needsSerdeVecBytes(field.type)) {
      attrs += `    #[serde(with = "serde_vec_bytes")]\n`;
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

    // Commands have a __typename used for NamedUnion identification, but it's handled
    // by the Command enum's custom serde, not by the struct itself.
    const typenameField = isCommand
      ? `    #[serde(rename = "__typename", skip, default)]\n    pub type_name: String,\n`
      : "";

    // Generate constructor for commands
    const constructor = isCommand
      ? this.generateConstructor(struct, rustName)
      : "";

    return `/// ${struct.name}
#[derive(Debug, Clone, Serialize, Deserialize)]${serdeRename}
pub struct ${rustName} {
${typenameField}${fields}
}${constructor}`;
  }

  // Generate constructor for command structs
  private generateConstructor(struct: Struct, rustName: string): string {
    const params = struct.fields
      .map((f) => `${toSnakeCase(f.name)}: ${this.mapType(f.type)}`)
      .join(", ");

    const fieldInits = [
      `            type_name: "${struct.name}".to_string(),`,
      ...struct.fields.map((f) => `            ${toSnakeCase(f.name)},`),
    ].join("\n");

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
    const errorName = schema.errorTypeName || "ErrorResponse";
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

mod serde_array4_bytes {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use serde::ser::SerializeTuple;
    use serde::de::{SeqAccess, Visitor};

    #[derive(Serialize, Deserialize)]
    struct BytesWrapper(#[serde(with = "super::serde_bytes")] Vec<u8>);

    pub fn serialize<S>(arr: &[Vec<u8>; 4], serializer: S) -> Result<S::Ok, S::Error>
    where S: Serializer {
        let mut tup = serializer.serialize_tuple(4)?;
        for bytes in arr {
            tup.serialize_element(&BytesWrapper(bytes.clone()))?;
        }
        tup.end()
    }
    pub fn deserialize<'de, D>(deserializer: D) -> Result<[Vec<u8>; 4], D::Error>
    where D: Deserializer<'de> {
        struct Array4Visitor;
        impl<'de> Visitor<'de> for Array4Visitor {
            type Value = [Vec<u8>; 4];
            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("an array of 4 byte arrays")
            }
            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where A: SeqAccess<'de> {
                let mut arr: [Vec<u8>; 4] = Default::default();
                for (i, item) in arr.iter_mut().enumerate() {
                    *item = seq.next_element::<BytesWrapper>()?
                        .ok_or_else(|| serde::de::Error::invalid_length(i, &self))?.0;
                }
                Ok(arr)
            }
        }
        deserializer.deserialize_tuple(4, Array4Visitor)
    }
}`;
  }

  // Generate types file
  generateTypes(schema: CompiledSchema, schemaHash?: string): string {
    this.errorTypeName = schema.errorTypeName || "ErrorResponse";
    // Create set of top-level command struct names (only these need __typename)
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

    const responseStructs = Array.from(schema.responses.values())
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

  /** Strip the service prefix from a command name for the method name */
  private methodName(commandName: string): string {
    const withoutPrefix =
      this.opts.prefix && commandName.startsWith(this.opts.prefix)
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
    this.errorTypeName = schema.errorTypeName || "ErrorResponse";
    const {
      apiStructName,
      backendImport,
      errorImport,
      typesImport,
      apiDocComment,
    } = this.opts;

    // Find shutdown command name (may be prefixed, e.g. WsdbShutdown)
    const shutdownCmd = schema.commands.find((c) =>
      c.name.endsWith("Shutdown"),
    );
    const shutdownName = shutdownCmd ? toPascalCase(shutdownCmd.name) : null;

    const apiMethods = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => this.generateApiMethod(c))
      .join("\n\n");

    const shutdownMethod = shutdownName
      ? `
    /// Shutdown backend gracefully
    pub fn shutdown(&mut self) -> Result<()> {
        let cmd = Command::${shutdownName}(${shutdownName}::new());
        let _ = self.execute(cmd)?;
        self.backend.destroy()
    }
`
      : "";

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
${shutdownMethod}
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
    this.errorTypeName = schema.errorTypeName || "ErrorResponse";
    const { prefix, errorImport, typesImport } = this.opts;
    const errorType = errorImport.match(/\{(\w+),/)?.[1] ?? "IpcError";
    const errorRespType = toPascalCase(this.errorTypeName);

    const traitMethods = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const methodName = this.methodName(c.name);
        const cmdRustName = toPascalCase(c.name);
        const respRustName = toPascalCase(c.responseType);
        return `    fn ${methodName}(&mut self, cmd: ${cmdRustName}) -> Result<${respRustName}>;`;
      })
      .join("\n");

    const dispatchArms = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const methodName = this.methodName(c.name);
        const cmdRustName = toPascalCase(c.name);
        const respRustName = toPascalCase(c.responseType);
        return `            Command::${cmdRustName}(cmd) => {
                match handler.${methodName}(cmd) {
                    Ok(resp) => Response::${respRustName}(resp),
                    Err(e) => Response::${errorRespType}(${errorRespType} { message: e.to_string() }),
                }
            }`;
      })
      .join("\n");

    // Handle shutdown arm
    const shutdownCmd = schema.commands.find((c) =>
      c.name.endsWith("Shutdown"),
    );
    const shutdownArm = shutdownCmd
      ? `            Command::${toPascalCase(shutdownCmd.name)}(_) => {
                return Err(${errorType}::Backend("shutdown requested".to_string()));
            }`
      : "";

    return `//! AUTOGENERATED - DO NOT EDIT
//! Server-side dispatch for ${prefix || "service"} IPC protocol

use ${errorImport};
use ${typesImport};

/// Handler trait — implement this to serve ${prefix || "service"} commands.
pub trait Handler {
${traitMethods}
}

/// Dispatch a single command to the handler and return the response.
pub fn dispatch(handler: &mut dyn Handler, command: Command) -> Result<Response> {
    let response = match command {
${dispatchArms}
${shutdownArm}
    };
    Ok(response)
}
`;
  }

  // -----------------------------------------------------------------------
  // Skeleton generation (one-time handler stubs + main + build files)
  // -----------------------------------------------------------------------

  /** Generate handler stub implementations that return unimplemented errors */
  generateHandlerStubs(schema: CompiledSchema): string {
    const { prefix } = this.opts;
    const typesModule = `${toSnakeCase(prefix)}_types`;
    const serverModule = `${toSnakeCase(prefix)}_server`;
    const ctxName = `${prefix}Context`;

    const stubs = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const methodName = this.methodName(c.name);
        const cmdRustName = toPascalCase(c.name);
        const respRustName = toPascalCase(c.responseType);
        return `    fn ${methodName}(&mut self, _cmd: ${typesModule}::${cmdRustName}) -> Result<${typesModule}::${respRustName}> {
        unimplemented!("${c.name}")
    }`;
      })
      .join("\n\n");

    return `// Handler stubs — implement your service logic here.
// This file is generated ONCE. Edit freely — it will not be overwritten.

mod generated {
    pub mod ${typesModule};
    pub mod ${serverModule};
    pub mod ipc_server;
}

use generated::${typesModule};
use generated::${serverModule};

/// Shared context for your service — add database connections, state, etc.
pub struct ${ctxName} {
    // Add your shared state here
}

/// Handler implementation
pub struct ${prefix}Handler {
    pub ctx: ${ctxName},
}

impl ${serverModule}::Handler for ${prefix}Handler {
${stubs}
}
`;
  }

  /** Generate a main.rs entry point for a standalone service */
  generateMain(schema: CompiledSchema): string {
    const { prefix } = this.opts;
    const ctxName = `${prefix}Context`;
    const serverModule = `${toSnakeCase(prefix)}_server`;

    return `// Entry point for ${prefix} service.
// This file is generated ONCE. Edit freely — it will not be overwritten.

mod ${toSnakeCase(prefix)}_handlers;

use ${toSnakeCase(prefix)}_handlers::{${ctxName}, ${prefix}Handler};

fn main() {
    let socket_path = std::env::args().nth(1).expect("Usage: ${toSnakeCase(prefix)} <socket_path>");

    let ctx = ${ctxName} {};
    let mut handler = ${prefix}Handler { ctx };

    eprintln!("${prefix} server starting on {}", socket_path);
    generated::ipc_server::serve(&socket_path, &mut handler);
}
`;
  }

  /** Generate Cargo.toml for a standalone service */
  generateBuildFile(schema: CompiledSchema): string {
    const { prefix } = this.opts;
    const pkgName = toSnakeCase(prefix).replace(/_/g, "-");

    return `[package]
name = "${pkgName}-service"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "${pkgName}"
path = "main.rs"

[dependencies]
rmp-serde = "1"
serde = { version = "1", features = ["derive"] }
`;
  }

  /** Generate .gitignore for the skeleton project */
  generateGitignore(): string {
    return `# Generated IPC code — do not edit, re-run generate.sh instead
generated/
target/
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
  --lang rust \\
  --out "$SCRIPT_DIR/generated" \\
  --prefix ${prefix} \\
  --server
`;
  }
}
