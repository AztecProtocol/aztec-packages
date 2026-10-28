#!/usr/bin/env npx tsx
/**
 * Transforms TypeDoc JSON output to a compact LLM-optimized format.
 *
 * Usage:
 *   npx tsx transform_for_llm.ts <input.json> <output.json>
 *
 * The output format is optimized for LLM consumption by:
 * - Removing symbolIdMap and groups (redundant metadata)
 * - Flattening comment structures to plain strings
 * - Simplifying source references to file:line format
 * - Omitting empty fields
 * - Using concise signature representations
 */

import * as fs from "node:fs";
import * as path from "node:path";

// TypeDoc kind constants
const KIND = {
  PROJECT: 1,
  MODULE: 2,
  NAMESPACE: 4,
  ENUM: 8,
  ENUM_MEMBER: 16,
  VARIABLE: 32,
  FUNCTION: 64,
  CLASS: 128,
  INTERFACE: 256,
  CONSTRUCTOR: 512,
  PROPERTY: 1024,
  METHOD: 2048,
  CALL_SIGNATURE: 4096,
  INDEX_SIGNATURE: 8192,
  CONSTRUCTOR_SIGNATURE: 16384,
  PARAMETER: 32768,
  TYPE_LITERAL: 65536,
  TYPE_PARAMETER: 131072,
  ACCESSOR: 262144,
  GET_SIGNATURE: 524288,
  SET_SIGNATURE: 1048576,
  TYPE_ALIAS: 2097152,
  REFERENCE: 4194304,
} as const;

// Output interfaces
interface LLMOutput {
  package: string;
  version: string;
  generated: string;
  classes: Record<string, LLMClass>;
  interfaces: Record<string, LLMInterface>;
  functions: Record<string, LLMFunction>;
  types: Record<string, LLMType>;
  enums: Record<string, LLMEnum>;
  externalReferences?: Record<string, string>; // type name -> package name
}

// Metadata output for summary generation
interface PackageMetadata {
  package: string;
  classes: string[];
  interfaces: string[];
  functions: string[];
  types: string[];
  enums: string[];
  externalDependencies: string[];  // Other @aztec/* packages referenced
}

// Track external type references during processing
const externalRefs = new Map<string, string>();

/**
 * Records an external type reference if the type is from another package.
 */
function recordExternalRef(type: TypeDocType | undefined): void {
  if (!type) return;

  // Check if this is a reference type with package info
  if (type.type === "reference") {
    if (type.package && type.package.startsWith("@aztec/") && type.name) {
      externalRefs.set(type.name, type.package);
    }
    // Also check typeArguments
    if (type.typeArguments) {
      for (const arg of type.typeArguments) {
        recordExternalRef(arg);
      }
    }
  } else if (type.type === "array" && type.elementType) {
    recordExternalRef(type.elementType);
  } else if ((type.type === "union" || type.type === "intersection") && type.types) {
    for (const t of type.types) {
      recordExternalRef(t);
    }
  }
}

interface LLMClass {
  description?: string;
  extends?: string;
  implements?: string[];
  source?: string;
  constructorSignature?: string;
  properties?: Record<string, LLMProperty>;
  methods?: Record<string, LLMMethod>;
}

interface LLMInterface {
  description?: string;
  extends?: string[];
  source?: string;
  properties?: Record<string, LLMProperty>;
  methods?: Record<string, LLMMethod>;
}

interface LLMFunction {
  signature: string;
  description?: string;
  source?: string;
}

interface LLMType {
  definition: string;
  description?: string;
  source?: string;
}

interface LLMEnum {
  description?: string;
  source?: string;
  values: string[];
}

interface LLMProperty {
  type: string;
  description?: string;
  readonly?: boolean;
  optional?: boolean;
  static?: boolean;
}

interface LLMMethod {
  signature: string;
  description?: string;
  static?: boolean;
}

// TypeDoc input types (partial - only what we need)
interface TypeDocNode {
  id?: number;
  name: string;
  kind: number;
  flags?: Record<string, boolean>;
  comment?: TypeDocComment;
  children?: TypeDocNode[];
  signatures?: TypeDocNode[];
  sources?: TypeDocSource[];
  type?: TypeDocType;
  parameters?: TypeDocNode[];
  typeParameters?: TypeDocNode[];
  extendedTypes?: TypeDocType[];
  implementedTypes?: TypeDocType[];
  defaultValue?: string;
}

interface TypeDocComment {
  summary?: TypeDocCommentPart[];
  blockTags?: TypeDocBlockTag[];
}

interface TypeDocCommentPart {
  kind: string;
  text: string;
  tag?: string;
  target?: number | string | TypeDocType;
}

interface TypeDocBlockTag {
  tag: string;
  content: TypeDocCommentPart[];
}

interface TypeDocSource {
  fileName: string;
  line: number;
  character?: number;
  url?: string;
}

interface TypeDocType {
  type: string;
  name?: string;
  value?: string | number | boolean;
  target?: number | string | TypeDocTarget;
  types?: TypeDocType[];
  typeArguments?: TypeDocType[];
  elementType?: TypeDocType;
  declaration?: TypeDocNode;
  package?: string;
  packageName?: string;
  qualifiedName?: string;
  operator?: string;
  objectType?: TypeDocType;
  indexType?: TypeDocType;
  queryType?: TypeDocType;
}

interface TypeDocTarget {
  packageName?: string;
  qualifiedName?: string;
}

// Patterns for filtering out unhelpful types
const ZOD_SCHEMA_PATTERNS = [
  /Schema$/,           // Ends with Schema
  /^Zod/,              // Starts with Zod
  /ZodObject/,         // Contains ZodObject
  /ZodArray/,          // Contains ZodArray
  /ZodOptional/,       // Contains ZodOptional
  /ZodNullable/,       // Contains ZodNullable
  /ZodDefault/,        // Contains ZodDefault
  /ZodEffects/,        // Contains ZodEffects
  /ZodUnion/,          // Contains ZodUnion
  /ZodIntersection/,   // Contains ZodIntersection
  /ZodTuple/,          // Contains ZodTuple
  /ZodRecord/,         // Contains ZodRecord
  /ZodEnum/,           // Contains ZodEnum
  /ZodLiteral/,        // Contains ZodLiteral
  /ZodNumber/,         // Contains ZodNumber
  /ZodString/,         // Contains ZodString
  /ZodBoolean/,        // Contains ZodBoolean
];

// TODO comment patterns to strip
const TODO_PATTERNS = [
  /TODO\s*\([^)]*\)\s*:?\s*/gi,    // TODO(#123): or TODO(name):
  /TODO\s*:?\s*/gi,                 // TODO: or TODO
  /FIXME\s*\([^)]*\)\s*:?\s*/gi,   // FIXME(#123): or FIXME(name):
  /FIXME\s*:?\s*/gi,                // FIXME: or FIXME
  /HACK\s*:?\s*/gi,                 // HACK:
  /XXX\s*:?\s*/gi,                  // XXX:
];

/**
 * Checks if a type name is a Zod schema type that should be filtered out.
 */
function isZodSchemaType(name: string): boolean {
  return ZOD_SCHEMA_PATTERNS.some(pattern => pattern.test(name));
}

/**
 * Checks if a type definition contains verbose Zod schema syntax.
 */
function isVerboseZodDefinition(definition: string): boolean {
  // Filter out definitions that are primarily Zod schema syntax
  const zodKeywords = ['ZodObject', 'ZodArray', 'ZodOptional', 'ZodNullable', 'ZodDefault'];
  const count = zodKeywords.reduce((acc, kw) => acc + (definition.includes(kw) ? 1 : 0), 0);
  return count >= 2; // If 2+ Zod keywords, it's probably not useful
}

/**
 * Strips TODO/FIXME comments from a description string.
 */
function stripTodoComments(text: string): string {
  let result = text;
  for (const pattern of TODO_PATTERNS) {
    result = result.replace(pattern, '');
  }
  // Clean up any resulting double spaces or leading/trailing whitespace
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Validates that the input JSON has the minimum required TypeDoc structure.
 * @throws Error if validation fails
 */
function validateTypeDocInput(input: unknown): asserts input is TypeDocNode {
  if (input === null || typeof input !== "object") {
    throw new Error("Invalid TypeDoc input: expected an object");
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.name !== "string") {
    throw new Error("Invalid TypeDoc input: missing or invalid 'name' field");
  }

  if (typeof obj.kind !== "number") {
    throw new Error("Invalid TypeDoc input: missing or invalid 'kind' field");
  }

  // Project root should have kind === 1 (PROJECT)
  if (obj.kind !== KIND.PROJECT) {
    throw new Error(
      `Invalid TypeDoc input: expected root kind to be PROJECT (1), got ${obj.kind}`
    );
  }

  // Children is optional but if present must be an array
  if (obj.children !== undefined && !Array.isArray(obj.children)) {
    throw new Error("Invalid TypeDoc input: 'children' must be an array");
  }
}

/**
 * Flattens a TypeDoc comment structure to a plain string.
 * Strips TODO/FIXME comments from the output.
 */
function flattenComment(comment?: TypeDocComment): string | undefined {
  if (!comment?.summary || comment.summary.length === 0) {
    return undefined;
  }

  const parts: string[] = [];
  for (const part of comment.summary) {
    if (part.kind === "text" || part.kind === "code") {
      parts.push(part.text);
    } else if (part.kind === "inline-tag" && part.tag === "@link") {
      // Just use the link text
      parts.push(part.text);
    }
  }

  let text = parts.join("").trim();

  // Strip TODO/FIXME comments
  text = stripTodoComments(text);

  return text.length > 0 ? text : undefined;
}

/**
 * Simplifies a source reference to file:line format.
 */
function simplifySource(sources?: TypeDocSource[]): string | undefined {
  if (!sources || sources.length === 0) {
    return undefined;
  }
  const src = sources[0];
  return `${src.fileName}:${src.line}`;
}

/**
 * Converts a TypeDoc type to a readable string representation.
 * Also records external package references for cross-package documentation.
 */
function typeToString(type?: TypeDocType): string {
  if (!type) {
    return "unknown";
  }

  // Record external references
  recordExternalRef(type);

  switch (type.type) {
    case "intrinsic":
      return type.name || "unknown";

    case "literal":
      if (typeof type.value === "string") {
        return `"${type.value}"`;
      }
      return String(type.value);

    case "reference":
      let name = type.name || "unknown";
      if (type.typeArguments && type.typeArguments.length > 0) {
        const args = type.typeArguments.map(typeToString).join(", ");
        name += `<${args}>`;
      }
      return name;

    case "array":
      return `${typeToString(type.elementType)}[]`;

    case "union":
      if (type.types) {
        return type.types.map(typeToString).join(" | ");
      }
      return "unknown";

    case "intersection":
      if (type.types) {
        return type.types.map(typeToString).join(" & ");
      }
      return "unknown";

    case "tuple":
      if (type.types) {
        return `[${type.types.map(typeToString).join(", ")}]`;
      }
      return "[]";

    case "reflection":
      // Inline type literal
      if (type.declaration) {
        return formatTypeDeclaration(type.declaration);
      }
      return "object";

    case "query":
      if (type.queryType) {
        return `typeof ${typeToString(type.queryType)}`;
      }
      return "unknown";

    case "typeOperator":
      if (type.operator && type.target) {
        // target can be number | string | TypeDocType - handle safely
        if (typeof type.target === "object" && type.target !== null) {
          return `${type.operator} ${typeToString(type.target as TypeDocType)}`;
        } else if (typeof type.target === "string") {
          return `${type.operator} ${type.target}`;
        } else if (typeof type.target === "number") {
          // target is a reference ID, just show the operator
          return `${type.operator} unknown`;
        }
      }
      return "unknown";

    case "indexedAccess":
      if (type.objectType && type.indexType) {
        return `${typeToString(type.objectType)}[${typeToString(type.indexType)}]`;
      }
      return "unknown";

    case "mapped":
      return "{ [key: string]: unknown }";

    case "conditional":
      return "unknown"; // Simplify conditional types

    case "predicate":
      return `boolean`;

    case "templateLiteral":
      return "string";

    default:
      return type.name || "unknown";
  }
}

/**
 * Formats a type declaration (object literal type).
 */
function formatTypeDeclaration(decl: TypeDocNode): string {
  if (!decl.children || decl.children.length === 0) {
    if (decl.signatures && decl.signatures.length > 0) {
      // Function type
      return formatFunctionSignature(decl.signatures[0]);
    }
    return "{}";
  }

  const props: string[] = [];
  for (const child of decl.children) {
    if (child.kind === KIND.PROPERTY || child.kind === KIND.CALL_SIGNATURE) {
      const optional = child.flags?.isOptional ? "?" : "";
      props.push(`${child.name}${optional}: ${typeToString(child.type)}`);
    }
  }

  if (props.length === 0) {
    return "{}";
  }

  if (props.length <= 3) {
    return `{ ${props.join("; ")} }`;
  }

  return `{ ${props.slice(0, 2).join("; ")}; ... }`;
}

/**
 * Formats a function/method signature.
 */
function formatFunctionSignature(sig: TypeDocNode): string {
  const params: string[] = [];

  // Type parameters
  let typeParamsStr = "";
  if (sig.typeParameters && sig.typeParameters.length > 0) {
    const tps = sig.typeParameters.map((tp) => {
      let s = tp.name;
      if (tp.type) {
        s += ` extends ${typeToString(tp.type)}`;
      }
      return s;
    });
    typeParamsStr = `<${tps.join(", ")}>`;
  }

  // Parameters
  if (sig.parameters) {
    for (const param of sig.parameters) {
      const optional = param.flags?.isOptional ? "?" : "";
      const rest = param.flags?.isRest ? "..." : "";
      params.push(`${rest}${param.name}${optional}: ${typeToString(param.type)}`);
    }
  }

  const returnType = typeToString(sig.type);
  return `${typeParamsStr}(${params.join(", ")}) => ${returnType}`;
}

/**
 * Extracts a property from a TypeDoc member node.
 */
function extractPropertyFromMember(member: TypeDocNode): LLMProperty {
  const prop: LLMProperty = {
    type: typeToString(member.type),
  };
  const propDesc = flattenComment(member.comment);
  if (propDesc) prop.description = propDesc;
  if (member.flags?.isReadonly) prop.readonly = true;
  if (member.flags?.isOptional) prop.optional = true;
  if (member.flags?.isStatic) prop.static = true;
  return prop;
}

/**
 * Extracts an accessor property from a TypeDoc member node.
 */
function extractAccessorProperty(member: TypeDocNode): LLMProperty {
  const prop: LLMProperty = {
    type: typeToString(member.type),
  };
  const propDesc = flattenComment(member.comment);
  if (propDesc) prop.description = propDesc;
  if (member.flags?.isStatic) prop.static = true;

  // Get return type from get signature if available
  if (member.signatures) {
    const getSig = member.signatures.find((s) => s.kind === KIND.GET_SIGNATURE);
    if (getSig) {
      prop.type = typeToString(getSig.type);
      const sigDesc = flattenComment(getSig.comment);
      if (sigDesc) prop.description = sigDesc;
    }
  }
  return prop;
}

/**
 * Extracts a method from a TypeDoc member node.
 */
function extractMethodFromMember(member: TypeDocNode): LLMMethod | undefined {
  if (!member.signatures || member.signatures.length === 0) {
    return undefined;
  }
  const sig = member.signatures[0];
  const method: LLMMethod = {
    signature: formatFunctionSignature(sig),
  };
  const methodDesc = flattenComment(sig.comment);
  if (methodDesc) method.description = methodDesc;
  if (member.flags?.isStatic) method.static = true;
  return method;
}

/**
 * Extracts constructor signature from a TypeDoc member node.
 */
function extractConstructorSignature(member: TypeDocNode): string | undefined {
  if (!member.signatures || member.signatures.length === 0) {
    return undefined;
  }
  const sig = member.signatures[0];
  const params: string[] = [];
  if (sig.parameters) {
    for (const param of sig.parameters) {
      const optional = param.flags?.isOptional ? "?" : "";
      params.push(`${param.name}${optional}: ${typeToString(param.type)}`);
    }
  }
  return `(${params.join(", ")})`;
}

/**
 * Extracts properties and methods from TypeDoc class/interface members.
 */
function extractMembers(
  members: TypeDocNode[],
  includeConstructor: boolean = false
): {
  properties: Record<string, LLMProperty>;
  methods: Record<string, LLMMethod>;
  constructorSignature?: string;
} {
  const properties: Record<string, LLMProperty> = {};
  const methods: Record<string, LLMMethod> = {};
  let constructorSignature: string | undefined;

  for (const member of members) {
    switch (member.kind) {
      case KIND.CONSTRUCTOR:
        if (includeConstructor) {
          constructorSignature = extractConstructorSignature(member);
        }
        break;
      case KIND.PROPERTY:
        properties[member.name] = extractPropertyFromMember(member);
        break;
      case KIND.METHOD:
        const method = extractMethodFromMember(member);
        if (method) {
          methods[member.name] = method;
        }
        break;
      case KIND.ACCESSOR:
        properties[member.name] = extractAccessorProperty(member);
        break;
    }
  }

  return { properties, methods, constructorSignature };
}

/**
 * Extracts classes from TypeDoc children.
 */
function extractClasses(children: TypeDocNode[]): Record<string, LLMClass> {
  const classes: Record<string, LLMClass> = {};

  for (const child of children) {
    if (child.kind === KIND.CLASS) {
      const cls: LLMClass = {};

      const desc = flattenComment(child.comment);
      if (desc) cls.description = desc;

      const source = simplifySource(child.sources);
      if (source) cls.source = source;

      // Extended types
      if (child.extendedTypes && child.extendedTypes.length > 0) {
        cls.extends = typeToString(child.extendedTypes[0]);
      }

      // Implemented types
      if (child.implementedTypes && child.implementedTypes.length > 0) {
        cls.implements = child.implementedTypes.map(typeToString);
      }

      // Process class members
      if (child.children) {
        const { properties, methods, constructorSignature } = extractMembers(
          child.children,
          true
        );
        if (constructorSignature) cls.constructorSignature = constructorSignature;
        if (Object.keys(properties).length > 0) cls.properties = properties;
        if (Object.keys(methods).length > 0) cls.methods = methods;
      }

      classes[child.name] = cls;
    }
  }

  return classes;
}

/**
 * Extracts interfaces from TypeDoc children.
 */
function extractInterfaces(children: TypeDocNode[]): Record<string, LLMInterface> {
  const interfaces: Record<string, LLMInterface> = {};

  for (const child of children) {
    if (child.kind === KIND.INTERFACE) {
      const iface: LLMInterface = {};

      const desc = flattenComment(child.comment);
      if (desc) iface.description = desc;

      const source = simplifySource(child.sources);
      if (source) iface.source = source;

      // Extended types
      if (child.extendedTypes && child.extendedTypes.length > 0) {
        iface.extends = child.extendedTypes.map(typeToString);
      }

      // Process interface members using shared helper
      if (child.children) {
        const { properties, methods } = extractMembers(child.children, false);
        if (Object.keys(properties).length > 0) iface.properties = properties;
        if (Object.keys(methods).length > 0) iface.methods = methods;
      }

      interfaces[child.name] = iface;
    }
  }

  return interfaces;
}

/**
 * Extracts functions from TypeDoc children.
 */
function extractFunctions(children: TypeDocNode[]): Record<string, LLMFunction> {
  const functions: Record<string, LLMFunction> = {};

  for (const child of children) {
    if (child.kind === KIND.FUNCTION && child.signatures) {
      const sig = child.signatures[0];
      const func: LLMFunction = {
        signature: formatFunctionSignature(sig),
      };

      const desc = flattenComment(sig.comment);
      if (desc) func.description = desc;

      const source = simplifySource(child.sources);
      if (source) func.source = source;

      functions[child.name] = func;
    }
  }

  return functions;
}

/**
 * Extracts type aliases from TypeDoc children.
 * Filters out Zod schema types that are verbose and not useful for LLMs.
 */
function extractTypes(children: TypeDocNode[]): Record<string, LLMType> {
  const types: Record<string, LLMType> = {};

  for (const child of children) {
    // Skip Zod schema types by name
    if (isZodSchemaType(child.name)) {
      continue;
    }

    if (child.kind === KIND.TYPE_ALIAS) {
      const definition = typeToString(child.type);

      // Skip types with verbose Zod definitions
      if (isVerboseZodDefinition(definition)) {
        continue;
      }

      const typ: LLMType = {
        definition,
      };

      const desc = flattenComment(child.comment);
      if (desc) typ.description = desc;

      const source = simplifySource(child.sources);
      if (source) typ.source = source;

      types[child.name] = typ;
    } else if (child.kind === KIND.VARIABLE && child.type) {
      const definition = typeToString(child.type);

      // Skip variables with verbose Zod definitions
      if (isVerboseZodDefinition(definition)) {
        continue;
      }

      // Some "types" are exported as const variables
      const typ: LLMType = {
        definition,
      };

      const desc = flattenComment(child.comment);
      if (desc) typ.description = desc;

      const source = simplifySource(child.sources);
      if (source) typ.source = source;

      types[child.name] = typ;
    }
  }

  return types;
}

/**
 * Extracts enums from TypeDoc children.
 */
function extractEnums(children: TypeDocNode[]): Record<string, LLMEnum> {
  const enums: Record<string, LLMEnum> = {};

  for (const child of children) {
    if (child.kind === KIND.ENUM) {
      const values: string[] = [];

      if (child.children) {
        for (const member of child.children) {
          if (member.kind === KIND.ENUM_MEMBER) {
            if (member.type?.type === "literal" && member.type.value !== undefined) {
              values.push(String(member.type.value));
            } else {
              values.push(member.name);
            }
          }
        }
      }

      const enm: LLMEnum = {
        values,
      };

      const desc = flattenComment(child.comment);
      if (desc) enm.description = desc;

      const source = simplifySource(child.sources);
      if (source) enm.source = source;

      enums[child.name] = enm;
    }
  }

  return enums;
}

/**
 * Recursively collects all children from modules/namespaces.
 */
function collectAllChildren(node: TypeDocNode): TypeDocNode[] {
  const result: TypeDocNode[] = [];

  if (node.children) {
    for (const child of node.children) {
      if (child.kind === KIND.MODULE || child.kind === KIND.NAMESPACE) {
        // Recurse into modules/namespaces
        result.push(...collectAllChildren(child));
      } else {
        result.push(child);
      }
    }
  }

  return result;
}

/**
 * Main transform function.
 */
function transformPackage(
  typedocJson: TypeDocNode,
  packageName: string,
  version: string
): LLMOutput {
  // Clear external refs from previous runs
  externalRefs.clear();

  // Collect all children from all modules
  const allChildren = collectAllChildren(typedocJson);

  const output: LLMOutput = {
    package: packageName,
    version,
    generated: new Date().toISOString(),
    classes: extractClasses(allChildren),
    interfaces: extractInterfaces(allChildren),
    functions: extractFunctions(allChildren),
    types: extractTypes(allChildren),
    enums: extractEnums(allChildren),
  };

  // Add external references, filtering out refs to the current package
  const filteredRefs: Record<string, string> = {};
  for (const [typeName, pkg] of Array.from(externalRefs.entries())) {
    if (pkg !== packageName) {
      filteredRefs[typeName] = pkg;
    }
  }
  if (Object.keys(filteredRefs).length > 0) {
    output.externalReferences = filteredRefs;
  }

  return output;
}

/**
 * Generates an import statement example for given exports.
 */
function generateImportExample(packageName: string, exports: string[]): string {
  if (exports.length === 0) return "";
  if (exports.length <= 3) {
    return `import { ${exports.join(", ")} } from '${packageName}';`;
  }
  return `import {\n  ${exports.slice(0, 5).join(",\n  ")}${exports.length > 5 ? ",\n  // ... and more" : ""}\n} from '${packageName}';`;
}

/**
 * Renders a list of properties to markdown lines.
 */
function renderProperties(
  properties: Record<string, LLMProperty>,
  lines: string[]
): void {
  if (Object.keys(properties).length === 0) return;

  lines.push("");
  lines.push("**Properties**");
  for (const [propName, prop] of Object.entries(properties).sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const modifiers: string[] = [];
    if (prop.static) modifiers.push("static");
    if (prop.readonly) modifiers.push("readonly");
    if (prop.optional) modifiers.push("?");
    const modStr = modifiers.filter(m => m !== "?").join(" ");
    const optStr = prop.optional ? "?" : "";
    const prefix = modStr ? `${modStr} ` : "";
    lines.push(
      `- \`${prefix}${propName}${optStr}: ${prop.type}\`${prop.description ? ` - ${prop.description}` : ""}`
    );
  }
}

/**
 * Renders a list of methods to markdown lines.
 */
function renderMethods(
  methods: Record<string, LLMMethod>,
  lines: string[]
): void {
  if (Object.keys(methods).length === 0) return;

  lines.push("");
  lines.push("**Methods**");
  for (const [methodName, method] of Object.entries(methods).sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const staticStr = method.static ? "static " : "";
    lines.push(
      `- \`${staticStr}${methodName}${method.signature}\`${method.description ? ` - ${method.description}` : ""}`
    );
  }
}

/**
 * Renders a single class to markdown lines.
 */
function renderClassMarkdown(name: string, cls: LLMClass, lines: string[]): void {
  lines.push(`### ${name}`);
  if (cls.description) {
    lines.push("");
    lines.push(cls.description);
  }
  if (cls.extends) {
    lines.push("");
    lines.push(`Extends: \`${cls.extends}\``);
  }
  if (cls.implements && cls.implements.length > 0) {
    lines.push(`Implements: ${cls.implements.map((i) => `\`${i}\``).join(", ")}`);
  }
  if (cls.constructorSignature) {
    lines.push("");
    lines.push("**Constructor**");
    lines.push("```typescript");
    lines.push(`new ${name}${cls.constructorSignature}`);
    lines.push("```");
  }
  if (cls.properties) {
    renderProperties(cls.properties, lines);
  }
  if (cls.methods) {
    renderMethods(cls.methods, lines);
  }
  lines.push("");
}

/**
 * Renders a single interface to markdown lines.
 */
function renderInterfaceMarkdown(
  name: string,
  iface: LLMInterface,
  lines: string[]
): void {
  lines.push(`### ${name}`);
  if (iface.description) {
    lines.push("");
    lines.push(iface.description);
  }
  if (iface.extends && iface.extends.length > 0) {
    lines.push("");
    lines.push(`Extends: ${iface.extends.map((e) => `\`${e}\``).join(", ")}`);
  }
  if (iface.properties) {
    renderProperties(iface.properties, lines);
  }
  if (iface.methods) {
    renderMethods(iface.methods, lines);
  }
  lines.push("");
}

/**
 * Extracts metadata from the LLM output for summary generation.
 */
function extractMetadata(output: LLMOutput): PackageMetadata {
  // Extract unique external package dependencies
  const externalDeps = new Set<string>();
  if (output.externalReferences) {
    for (const pkg of Object.values(output.externalReferences)) {
      externalDeps.add(pkg);
    }
  }

  return {
    package: output.package,
    classes: Object.keys(output.classes || {}).sort(),
    interfaces: Object.keys(output.interfaces || {}).sort(),
    functions: Object.keys(output.functions || {}).sort(),
    types: Object.keys(output.types || {}).sort(),
    enums: Object.keys(output.enums || {}).sort(),
    externalDependencies: Array.from(externalDeps).sort(),
  };
}

/**
 * Generates markdown documentation from the LLM output.
 */
function generateMarkdown(output: LLMOutput): string {
  const lines: string[] = [];

  lines.push(`# ${output.package}`);
  lines.push("");
  lines.push(`Version: ${output.version}`);
  lines.push("");

  // Add quick import reference section
  const classNames = Object.keys(output.classes || {});
  const functionNames = Object.keys(output.functions || {});
  const interfaceNames = Object.keys(output.interfaces || {});
  const typeNames = Object.keys(output.types || {});
  const enumNames = Object.keys(output.enums || {});

  const allExports = [
    ...classNames.sort(),
    ...functionNames.sort(),
    ...interfaceNames.sort(),
    ...typeNames.sort(),
    ...enumNames.sort(),
  ];

  if (allExports.length > 0) {
    lines.push("## Quick Import Reference");
    lines.push("");
    lines.push("```typescript");
    lines.push(generateImportExample(output.package, allExports.slice(0, 8)));
    lines.push("```");
    lines.push("");
  }

  // Classes
  if (classNames.length > 0) {
    lines.push("## Classes");
    lines.push("");
    for (const name of classNames.sort()) {
      renderClassMarkdown(name, output.classes[name], lines);
    }
  }

  // Interfaces
  if (interfaceNames.length > 0) {
    lines.push("## Interfaces");
    lines.push("");
    for (const name of interfaceNames.sort()) {
      renderInterfaceMarkdown(name, output.interfaces[name], lines);
    }
  }

  // Functions
  if (functionNames.length > 0) {
    lines.push("## Functions");
    lines.push("");

    for (const name of functionNames.sort()) {
      const func = output.functions[name];
      lines.push(`### ${name}`);
      lines.push(`\`\`\`typescript`);
      lines.push(`function ${name}${func.signature}`);
      lines.push(`\`\`\``);
      if (func.description) {
        lines.push(func.description);
      }
      lines.push("");
    }
  }

  // Types
  if (typeNames.length > 0) {
    lines.push("## Types");
    lines.push("");

    for (const name of typeNames.sort()) {
      const typ = output.types[name];
      lines.push(`### ${name}`);
      lines.push(`\`\`\`typescript`);
      lines.push(`type ${name} = ${typ.definition}`);
      lines.push(`\`\`\``);
      if (typ.description) {
        lines.push(typ.description);
      }
      lines.push("");
    }
  }

  // Enums
  if (enumNames.length > 0) {
    lines.push("## Enums");
    lines.push("");

    for (const name of enumNames.sort()) {
      const enm = output.enums[name];
      lines.push(`### ${name}`);
      if (enm.description) {
        lines.push(enm.description);
      }
      lines.push("");
      lines.push(`Values: ${enm.values.map((v) => `\`${v}\``).join(", ")}`);
      lines.push("");
    }
  }

  // Cross-Package References
  if (output.externalReferences && Object.keys(output.externalReferences).length > 0) {
    lines.push("## Cross-Package References");
    lines.push("");
    lines.push("This package references types from other Aztec packages:");
    lines.push("");

    // Group by package
    const byPackage = new Map<string, string[]>();
    for (const [typeName, pkg] of Object.entries(output.externalReferences)) {
      if (!byPackage.has(pkg)) {
        byPackage.set(pkg, []);
      }
      byPackage.get(pkg)!.push(typeName);
    }

    const sortedPackages = Array.from(byPackage.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [pkg, types] of sortedPackages) {
      lines.push(`**${pkg}**`);
      lines.push(`- ${types.sort().map(t => `\`${t}\``).join(", ")}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// Config file structure for summary generation
interface PackageConfig {
  name: string;
  path: string;
  description: string;
  details?: string[];
  status: string;
}

interface ConfigFile {
  packages: {
    client_sdks: PackageConfig[];
    core_libraries: PackageConfig[];
    developer_tools: PackageConfig[];
  };
}

// Heuristics for identifying key types
const KEY_TYPE_PATTERNS = [
  // Core domain types - exact matches for important classes/types
  /^AztecAddress$/,
  /^EthAddress$/,
  /^CompleteAddress$/,
  /^Fr$/,
  /^Fq$/,
  /^Tx$/,
  /^TxHash$/,
  /^TxReceipt$/,
  /^L2Block$/,
  /^BlockHeader$/,
  /^Note$/,
  /^NoteHash$/,
  /^Nullifier$/,
  /^Contract$/,
  /^Wallet$/,
  /^PXE$/,
  /^Account$/,
  /^AccountManager$/,
  /^AccountContract$/,

  // Key factory functions - be specific
  /^createPXE$/,
  /^createAztecNodeClient$/,
  /^deployContract$/,
];

// Category patterns for grouping key types in summary
const TYPE_CATEGORIES: Record<string, RegExp[]> = {
  "Addresses": [/^(Aztec|Eth|Complete)?Address$/],
  "Transactions": [/^Tx$/, /^TxHash$/, /^TxReceipt$/],
  "Field Elements": [/^Fr$/, /^Fq$/],
  "Notes & Nullifiers": [/^Note$/, /^NoteHash$/, /^Nullifier$/],
  "Blocks": [/^L2Block$/, /^BlockHeader$/],
  "Accounts & Wallets": [/^Account$/, /^AccountManager$/, /^AccountContract$/, /^Wallet$/, /^PXE$/, /^createPXE$/],
  "Contracts": [/^Contract$/],
};

function isKeyType(name: string): boolean {
  return KEY_TYPE_PATTERNS.some(pattern => pattern.test(name));
}

function categorizeType(name: string): string | null {
  for (const [category, patterns] of Object.entries(TYPE_CATEGORIES)) {
    if (patterns.some(pattern => pattern.test(name))) {
      return category;
    }
  }
  return null;
}

/**
 * Generates the LLM summary file from metadata and config.
 */
async function generateSummary(
  metadataDir: string,
  configPath: string,
  outputPath: string,
  version: string
): Promise<void> {
  // Load config file
  let config: ConfigFile;
  try {
    const configContent = fs.readFileSync(configPath, "utf-8");
    config = JSON.parse(configContent);
  } catch (err) {
    console.error(`Error reading config file: ${(err as Error).message}`);
    process.exit(1);
  }

  // Find all metadata files
  const metadataFiles = fs.readdirSync(metadataDir)
    .filter(f => f.endsWith(".meta.json"))
    .map(f => path.join(metadataDir, f));

  if (metadataFiles.length === 0) {
    console.error("No metadata files found. Run package documentation generation first.");
    process.exit(1);
  }

  // Load all metadata
  const allMetadata: PackageMetadata[] = [];
  for (const metaFile of metadataFiles) {
    try {
      const content = fs.readFileSync(metaFile, "utf-8");
      allMetadata.push(JSON.parse(content));
    } catch (err) {
      console.warn(`Warning: Failed to read ${metaFile}: ${(err as Error).message}`);
    }
  }

  // Create a map of package name to metadata
  const metadataByPackage = new Map<string, PackageMetadata>();
  for (const meta of allMetadata) {
    metadataByPackage.set(meta.package, meta);
  }

  // Build package description map from config
  const packageDescriptions = new Map<string, string>();
  const allPackages = [
    ...config.packages.client_sdks,
    ...config.packages.core_libraries,
    ...config.packages.developer_tools,
  ];
  for (const pkg of allPackages) {
    if (pkg.status === "active") {
      packageDescriptions.set(`@aztec/${pkg.name}`, pkg.description);
    }
  }

  // Identify key types across all packages
  const keyTypesByCategory = new Map<string, Map<string, string>>(); // category -> (type -> package)

  for (const meta of allMetadata) {
    const allExports = [
      ...meta.classes,
      ...meta.interfaces,
      ...meta.functions,
      ...meta.types,
    ];

    for (const exportName of allExports) {
      if (isKeyType(exportName)) {
        const category = categorizeType(exportName) || "Other";
        if (!keyTypesByCategory.has(category)) {
          keyTypesByCategory.set(category, new Map());
        }
        // Only store if not already present (first package wins)
        if (!keyTypesByCategory.get(category)!.has(exportName)) {
          keyTypesByCategory.get(category)!.set(exportName, meta.package);
        }
      }
    }
  }

  // Build dependency graph
  const dependencies = new Map<string, string[]>();
  for (const meta of allMetadata) {
    if (meta.externalDependencies.length > 0) {
      dependencies.set(meta.package, meta.externalDependencies);
    }
  }

  // Generate summary content
  const lines: string[] = [];
  lines.push("# Aztec TypeScript API Summary");
  lines.push(`Version: ${version}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("This file provides an index of the Aztec TypeScript API packages.");
  lines.push("For detailed API documentation, see the individual package .md files.");
  lines.push("");

  // Package Overview section
  lines.push("## Package Overview");
  lines.push("");

  // Helper to render a package entry
  function renderPackageEntry(pkg: PackageConfig, meta: PackageMetadata | undefined): void {
    const fullName = `@aztec/${pkg.name}`;
    lines.push(`**${fullName}** - ${pkg.description}`);

    // Add detailed feature list if available
    if (pkg.details && pkg.details.length > 0) {
      for (const detail of pkg.details) {
        lines.push(`  - ${detail}`);
      }
    }

    if (meta) {
      const counts: string[] = [];
      if (meta.classes.length > 0) counts.push(`${meta.classes.length} classes`);
      if (meta.interfaces.length > 0) counts.push(`${meta.interfaces.length} interfaces`);
      if (meta.functions.length > 0) counts.push(`${meta.functions.length} functions`);
      if (meta.types.length > 0) counts.push(`${meta.types.length} types`);
      if (counts.length > 0) {
        lines.push(`Exports: ${counts.join(", ")}`);
      }
      // Show key exports (up to 4)
      const keyExports = [...meta.classes, ...meta.functions, ...meta.types]
        .filter(e => isKeyType(e))
        .slice(0, 4);
      if (keyExports.length > 0) {
        lines.push(`Key: ${keyExports.join(", ")}`);
      }
    }
    lines.push("");
  }

  // Client SDKs
  const clientSdks = config.packages.client_sdks.filter(p => p.status === "active");
  if (clientSdks.length > 0) {
    lines.push("### Client SDKs");
    lines.push("");
    for (const pkg of clientSdks) {
      const fullName = `@aztec/${pkg.name}`;
      const meta = metadataByPackage.get(fullName);
      renderPackageEntry(pkg, meta);
    }
  }

  // Core Libraries
  const coreLibs = config.packages.core_libraries.filter(p => p.status === "active");
  if (coreLibs.length > 0) {
    lines.push("### Core Libraries");
    lines.push("");
    for (const pkg of coreLibs) {
      const fullName = `@aztec/${pkg.name}`;
      const meta = metadataByPackage.get(fullName);
      renderPackageEntry(pkg, meta);
    }
  }

  // Key Types Quick Reference section
  if (keyTypesByCategory.size > 0) {
    lines.push("## Key Types Quick Reference");
    lines.push("");

    // Sort categories in a sensible order
    const categoryOrder = ["Field Elements", "Addresses", "Transactions", "Notes & Nullifiers", "Blocks", "Accounts & Wallets", "Other"];
    const sortedCategories = Array.from(keyTypesByCategory.keys()).sort((a, b) => {
      const aIdx = categoryOrder.indexOf(a);
      const bIdx = categoryOrder.indexOf(b);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

    for (const category of sortedCategories) {
      const types = keyTypesByCategory.get(category)!;
      if (types.size === 0) continue;

      lines.push(`### ${category}`);
      for (const [typeName, pkgName] of Array.from(types.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        lines.push(`- \`${typeName}\` (${pkgName})`);
      }
      lines.push("");
    }
  }

  // Package Dependencies section
  if (dependencies.size > 0) {
    lines.push("## Package Dependencies");
    lines.push("");
    for (const [pkg, deps] of Array.from(dependencies.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const shortPkg = pkg.replace("@aztec/", "");
      const shortDeps = deps.map(d => d.replace("@aztec/", "")).join(", ");
      lines.push(`${shortPkg} → ${shortDeps}`);
    }
    lines.push("");
  }

  lines.push("For detailed API documentation, see the individual package files.");

  // Write output
  const content = lines.join("\n");
  try {
    fs.writeFileSync(outputPath, content);
    console.log(`Generated summary: ${outputPath}`);
  } catch (err) {
    console.error(`Error writing summary: ${(err as Error).message}`);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(args: string[]): {
  mode: "transform" | "generate-summary";
  inputPath?: string;
  outputPath?: string;
  version?: string;
  metadataDir?: string;
  metadataOutput?: string;
  configPath?: string;
} {
  if (args.includes("--generate-summary")) {
    // Summary generation mode
    let metadataDir: string | undefined;
    let configPath: string | undefined;
    let outputPath: string | undefined;
    let version: string | undefined;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--metadata-dir" && args[i + 1]) {
        metadataDir = args[++i];
      } else if (args[i] === "--config" && args[i + 1]) {
        configPath = args[++i];
      } else if (args[i] === "--output" && args[i + 1]) {
        outputPath = args[++i];
      } else if (args[i] === "--version" && args[i + 1]) {
        version = args[++i];
      }
    }

    return { mode: "generate-summary", metadataDir, configPath, outputPath, version };
  }

  // Transform mode (default)
  // Parse optional --metadata-output flag
  let metadataOutput: string | undefined;
  const filteredArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--metadata-output" && args[i + 1]) {
      metadataOutput = args[++i];
    } else {
      filteredArgs.push(args[i]);
    }
  }

  if (filteredArgs.length < 2) {
    return { mode: "transform" };
  }
  return {
    mode: "transform",
    inputPath: filteredArgs[0],
    outputPath: filteredArgs[1],
    version: filteredArgs[2],
    metadataOutput,
  };
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  // Handle summary generation mode
  if (parsed.mode === "generate-summary") {
    if (!parsed.metadataDir || !parsed.configPath || !parsed.outputPath) {
      console.error("Usage: npx tsx transform_for_llm.ts --generate-summary --metadata-dir <dir> --config <config.json> --output <output.txt> [--version <version>]");
      process.exit(1);
    }
    await generateSummary(
      parsed.metadataDir,
      parsed.configPath,
      parsed.outputPath,
      parsed.version || "next"
    );
    return;
  }

  // Transform mode
  if (!parsed.inputPath || !parsed.outputPath) {
    console.error("Usage: npx tsx transform_for_llm.ts <input.json> <output.md> [version] [--metadata-output <path>]");
    console.error("       npx tsx transform_for_llm.ts --generate-summary --metadata-dir <dir> --config <config.json> --output <output.txt> [--version <version>]");
    process.exit(1);
  }

  const { inputPath, outputPath } = parsed;
  const version = parsed.version || "next";

  // Read input file with error handling
  console.log(`Reading: ${inputPath}`);
  let inputContent: string;
  try {
    inputContent = fs.readFileSync(inputPath, "utf-8");
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      console.error(`Error: Input file not found: ${inputPath}`);
    } else if (error.code === "EACCES") {
      console.error(`Error: Permission denied reading: ${inputPath}`);
    } else {
      console.error(`Error reading input file: ${error.message}`);
    }
    process.exit(1);
  }

  // Parse JSON with error handling
  let inputJson: unknown;
  try {
    inputJson = JSON.parse(inputContent);
  } catch (err) {
    console.error(`Error: Invalid JSON in ${inputPath}: ${(err as Error).message}`);
    process.exit(1);
  }

  // Validate TypeDoc structure
  try {
    validateTypeDocInput(inputJson);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  // Extract package name from input file path (NOT TypeDoc display name)
  // TypeDoc display names may contain spaces (e.g., "Wallet SDK") which produce
  // invalid npm package identifiers. The file path matches the actual package name.
  const packageName = path.basename(inputPath, ".json");

  // Transform
  console.log(`Transforming: ${packageName}`);
  const output = transformPackage(inputJson, `@aztec/${packageName.toLowerCase()}`, version);

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  } catch (err) {
    console.error(`Error creating output directory ${outputDir}: ${(err as Error).message}`);
    process.exit(1);
  }

  // Write Markdown output with error handling
  console.log(`Writing: ${outputPath}`);
  const markdown = generateMarkdown(output);
  try {
    fs.writeFileSync(outputPath, markdown);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "EACCES") {
      console.error(`Error: Permission denied writing to: ${outputPath}`);
    } else {
      console.error(`Error writing output file: ${error.message}`);
    }
    process.exit(1);
  }

  // Write metadata file for summary generation
  const metadataPath = parsed.metadataOutput || outputPath.replace(/\.md$/, ".meta.json");
  const metadata = extractMetadata(output);
  try {
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`Writing: ${metadataPath}`);
  } catch (err) {
    console.error(`Error writing metadata file: ${(err as Error).message}`);
    // Non-fatal - continue even if metadata fails
  }

  // Report size reduction
  const inputSize = fs.statSync(inputPath).size;
  const mdSize = fs.statSync(outputPath).size;
  const reduction = ((1 - mdSize / inputSize) * 100).toFixed(1);
  console.log(
    `Size: ${(inputSize / 1024).toFixed(0)}KB -> ${(mdSize / 1024).toFixed(0)}KB (${reduction}% reduction)`
  );
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
