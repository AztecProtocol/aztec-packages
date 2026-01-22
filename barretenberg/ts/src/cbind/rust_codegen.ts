/**
 * Rust Code Generator - String template based
 *
 * Philosophy:
 *   - String templates for file structure
 *   - Simple type mapping
 *   - Idiomatic Rust conventions
 *   - No complex abstraction
 */

import type { CompiledSchema, Type, Struct, Field } from './schema_visitor.js';
import { toSnakeCase, toPascalCase } from './naming.js';

export class RustCodegen {
  // Type mapping: Schema type -> Rust type
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
          case 'string': return 'String';
          case 'bytes': return 'Vec<u8>';
          case 'field2': return '[Vec<u8>; 2]';  // Extension field (Fq2) - pair of 32-byte field elements
        }
        break;

      case 'vector':
        return `Vec<${this.mapType(type.element!)}>`;

      case 'array':
        const elemType = this.mapType(type.element!);
        // Large arrays become Vec for ergonomics
        return type.size! > 32 ? `Vec<${elemType}>` : `[${elemType}; ${type.size}]`;

      case 'optional':
        return `Option<${this.mapType(type.element!)}>`;

      case 'struct':
        // Convert struct names to PascalCase for Rust conventions
        return toPascalCase(type.struct!.name);
    }

    return 'Unknown';
  }

  // Check if field needs serde(with = "serde_bytes")
  private needsSerdeBytes(type: Type): boolean {
    return type.kind === 'primitive' && type.primitive === 'bytes';
  }

  // Check if field needs serde(with = "serde_vec_bytes")
  private needsSerdeVecBytes(type: Type): boolean {
    return type.kind === 'vector' && this.needsSerdeBytes(type.element!);
  }

  // Check if field needs serde(with = "serde_array4_bytes") - for [Vec<u8>; 4] (Poseidon2 state)
  private needsSerdeArray4Bytes(type: Type): boolean {
    return type.kind === 'array' && type.size === 4 && this.needsSerdeBytes(type.element!);
  }

  // Generate struct field
  private generateField(field: Field): string {
    const rustName = toSnakeCase(field.name);
    const rustType = this.mapType(field.type);
    let attrs = '';

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
    const fields = struct.fields.map(f => this.generateField(f)).join('\n');

    // Add serde rename if struct name changed
    const serdeRename = struct.name !== rustName
      ? `\n#[serde(rename = "${struct.name}")]`
      : '';

    // Commands need __typename field for struct identification, but skip it during serialization
    const typenameField = isCommand
      ? `    #[serde(rename = "__typename", skip_serializing)]\n    pub type_name: String,\n`
      : '';

    // Generate constructor for commands
    const constructor = isCommand ? this.generateConstructor(struct, rustName) : '';

    return `/// ${struct.name}
#[derive(Debug, Clone, Serialize, Deserialize)]${serdeRename}
pub struct ${rustName} {
${typenameField}${fields}
}${constructor}`;
  }

  // Generate constructor for command structs
  private generateConstructor(struct: Struct, rustName: string): string {
    const params = struct.fields.map(f =>
      `${toSnakeCase(f.name)}: ${this.mapType(f.type)}`
    ).join(', ');

    const fieldInits = [
      `            type_name: "${struct.name}".to_string(),`,
      ...struct.fields.map(f => `            ${toSnakeCase(f.name)},`),
    ].join('\n');

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
    const names = Array.from(schema.structs.keys());
    const variants = names
      .map(name => {
        const rustName = toPascalCase(name);
        return `    ${rustName}(${rustName}),`;
      })
      .join('\n');

    const serializeCases = names
      .map(name => {
        const rustName = toPascalCase(name);
        return `            Command::${rustName}(data) => {
                tuple.serialize_element("${name}")?;
                tuple.serialize_element(data)?;
            }`;
      })
      .join('\n');

    const deserializeCases = names
      .map(name => {
        const rustName = toPascalCase(name);
        return `                    "${name}" => {
                        let data = seq.next_element()?
                            .ok_or_else(|| serde::de::Error::invalid_length(1, &self))?;
                        Ok(Command::${rustName}(data))
                    }`;
      })
      .join('\n');

    const variantNames = names
      .map(name => `"${name}"`)
      .join(', ');

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
    const commandResponseTypes = Array.from(new Set(schema.commands.map(c => c.responseType)));
    const responseTypes = schema.responses.has('ErrorResponse')
      ? [...commandResponseTypes, 'ErrorResponse']
      : commandResponseTypes;
    const variants = responseTypes
      .map(name => {
        const rustName = toPascalCase(name);
        return `    ${rustName}(${rustName}),`;
      })
      .join('\n');

    const serializeCases = responseTypes
      .map(name => {
        const rustName = toPascalCase(name);
        return `            Response::${rustName}(data) => {
                tuple.serialize_element("${name}")?;
                tuple.serialize_element(data)?;
            }`;
      })
      .join('\n');

    const deserializeCases = responseTypes
      .map(name => {
        const rustName = toPascalCase(name);
        return `                    "${name}" => {
                        let data = seq.next_element()?
                            .ok_or_else(|| serde::de::Error::invalid_length(1, &self))?;
                        Ok(Response::${rustName}(data))
                    }`;
      })
      .join('\n');

    const variantNames = responseTypes.map(name => `"${name}"`).join(', ');

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
  generateTypes(schema: CompiledSchema): string {
    // Create set of top-level command struct names (only these need __typename)
    const commandNames = new Set(schema.commands.map(c => c.name));

    // Generate all structs (commands first, then responses)
    const commandStructs = Array.from(schema.structs.values())
      .map(s => this.generateStruct(s, commandNames.has(s.name)))
      .join('\n\n');

    const responseStructs = Array.from(schema.responses.values())
      .map(s => this.generateStruct(s, false))
      .join('\n\n');

    return `//! AUTOGENERATED - DO NOT EDIT
//! Generated from Barretenberg msgpack schema

use serde::{Deserialize, Serialize};

${this.generateSerdeHelpers()}

${commandStructs}

${responseStructs}

${this.generateCommandEnum(schema)}

${this.generateResponseEnum(schema)}
`;
  }

  // Generate API method
  private generateApiMethod(command: {name: string, fields: Field[], responseType: string}): string {
    const methodName = toSnakeCase(command.name);
    const cmdRustName = toPascalCase(command.name);
    const respRustName = toPascalCase(command.responseType);

    const params = command.fields.map(f => {
      const rustType = this.mapType(f.type);
      // Only convert simple Vec<u8> to &[u8], not nested types
      const apiType = rustType === 'Vec<u8>' ? '&[u8]' : rustType;
      return `${toSnakeCase(f.name)}: ${apiType}`;
    }).join(', ');

    const paramConversions = command.fields.map(f => {
      const name = toSnakeCase(f.name);
      const rustType = this.mapType(f.type);
      // Only convert slices back to Vec
      if (rustType === 'Vec<u8>') {
        return `${name}.to_vec()`;
      }
      return name;
    }).join(', ');

    return `    /// Execute ${command.name} command
    pub fn ${methodName}(&mut self, ${params}) -> Result<${respRustName}> {
        let cmd = Command::${cmdRustName}(${cmdRustName}::new(${paramConversions}));
        match self.execute(cmd)? {
            Response::${respRustName}(resp) => Ok(resp),
            Response::ErrorResponse(err) => Err(BarretenbergError::Backend(
                err.message
            )),
            _ => Err(BarretenbergError::InvalidResponse(
                "Expected ${command.responseType}".to_string()
            )),
        }
    }`;
  }

  // Generate API file
  generateApi(schema: CompiledSchema): string {
    const apiMethods = schema.commands
      .filter(c => c.name !== 'Shutdown')
      .map(c => this.generateApiMethod(c))
      .join('\n\n');

    return `//! AUTOGENERATED - DO NOT EDIT
//! High-level Barretenberg API - msgpack details hidden

use crate::backend::Backend;
use crate::error::{BarretenbergError, Result};
use crate::generated_types::*;

/// High-level Barretenberg API
pub struct BarretenbergApi<B: Backend> {
    backend: B,
}

impl<B: Backend> BarretenbergApi<B> {
    /// Create API with custom backend
    pub fn new(backend: B) -> Self {
        Self { backend }
    }

    fn execute(&mut self, command: Command) -> Result<Response> {
        let input_buffer = rmp_serde::to_vec_named(&vec![command])
            .map_err(|e| BarretenbergError::Serialization(e.to_string()))?;

        let output_buffer = self.backend.call(&input_buffer)?;

        let response: Response = rmp_serde::from_slice(&output_buffer)
            .map_err(|e| BarretenbergError::Deserialization(e.to_string()))?;

        Ok(response)
    }

${apiMethods}

    /// Shutdown backend gracefully
    pub fn shutdown(&mut self) -> Result<()> {
        let cmd = Command::Shutdown(Shutdown::new());
        let _ = self.execute(cmd)?;
        self.backend.destroy()
    }

    /// Destroy backend without shutdown command
    pub fn destroy(&mut self) -> Result<()> {
        self.backend.destroy()
    }
}
`;
  }
}
