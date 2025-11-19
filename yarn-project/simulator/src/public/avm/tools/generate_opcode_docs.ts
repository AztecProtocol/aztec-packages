#!/usr/bin/env node
/**
 * AVM Opcode Documentation Generator (v2)
 *
 * This script generates comprehensive JSON documentation for all AVM opcodes by combining:
 * - Minimal manual metadata (expressions, descriptions, errors)
 * - Programmatically extracted metadata (operands, wire formats, addressing modes)
 * - Gas cost information
 * - Wire format diagrams
 *
 * Key improvements in v2:
 * - Minimizes manual metadata requirements
 * - Uses correct "addressing modes" terminology
 * - Automatically infers operands from wire formats and constructors
 * - Detects addressing mode support from naming conventions
 *
 * Usage:
 *   ts-node generate_opcode_docs.ts [output-file]
 *
 * Output:
 *   Generates a JSON file with complete documentation for all opcodes.
 *   Default output: opcode-docs.json
 */
import * as fs from 'fs';
import * as path from 'path';

import { getBaseGasCost, getDynamicGasCost } from '../avm_gas.js';
import {
  EmitNoteHash,
  EmitNullifier,
  EmitUnencryptedLog,
  L1ToL2MessageExists,
  NoteHashExists,
  NullifierExists,
  SendL2ToL1Message,
} from '../opcodes/accrued_substate.js';
// Import all instruction classes
import { Add, Div, FieldDiv, Mul, Shl, Shr, Sub } from '../opcodes/arithmetic.js';
import { And, Not, Or, Xor } from '../opcodes/bitwise.js';
import { Eq, Lt, Lte } from '../opcodes/comparators.js';
import { GetContractInstance } from '../opcodes/contract.js';
import { InternalCall, InternalReturn, Jump, JumpI } from '../opcodes/control_flow.js';
import { ToRadixBE } from '../opcodes/conversion.js';
import { EcAdd } from '../opcodes/ec_add.js';
import { GetEnvVar } from '../opcodes/environment_getters.js';
import { Call, Return, Revert, StaticCall, SuccessCopy } from '../opcodes/external_calls.js';
import { KeccakF1600, Poseidon2, Sha256Compression } from '../opcodes/hashing.js';
import { CalldataCopy, Cast, Mov, ReturndataCopy, ReturndataSize, Set } from '../opcodes/memory.js';
import { MinimalMetadataRegistry, type MinimalOpcodeMetadata } from '../opcodes/metadata_registry.js';
import { DebugLog } from '../opcodes/misc.js';
import { SLoad, SStore } from '../opcodes/storage.js';
import { Opcode, OperandType, getOperandSize } from '../serialization/instruction_serialization.js';
import { InstructionAnalyzer } from './instruction_analyzer.js';

/**
 * Represents a single wire format variation for an opcode.
 */
interface WireFormatVariation {
  /** Name of the wire format (e.g., 'ADD_8', 'ADD_16') */
  name: string;
  /** Opcode value for this variation */
  opcode: number;
  /** Ordered list of operand types in the wire format */
  format: string[];
  /** Mermaid packet diagram for visualization */
  mermaidDiagram: string;
}

/**
 * Complete documentation for a single opcode (v2 format).
 */
interface OpcodeDocumentation {
  /** Base opcode value (using the _8 variant) */
  opcode: number;
  /** Human-readable name */
  name: string;
  /** Very brief summary */
  summary: string;
  /** Category for organization */
  category: string;
  /** Gas cost information */
  gasCosts: {
    l2Base: number;
    daBase: number;
    l2Dynamic?: number;
    daDynamic?: number;
  };
  /** All wire format variations */
  wireFormats: WireFormatVariation[];
  /** Operand definitions (extracted programmatically) */
  operands: Array<{
    name: string;
    type: string;
    size: number | string;
    description: string;
    supportsAddressingModes: boolean;
    addressingModeBits?: {
      indirectBit: number;
      relativeBit: number;
    };
  }>;
  /** Mathematical/logical expression */
  expression: string;
  /** Brief description */
  description: string;
  /** Detailed explanation */
  details?: string;
  /** Error conditions */
  errors: Array<{
    condition: string;
    description: string;
  }>;
  /** Addressing modes support (replaces "indirect addressing") */
  addressingModes: {
    supported: boolean;
    operands: string[];
    bitmaskSize?: number;
    encoding?: string;
  };
  /** Tag checks performed by the instruction */
  tagChecks?: string[];
  /** Tag updates/assignments performed by the instruction */
  tagUpdates?: string[];
  /** Additional notes */
  notes?: string[];
}

/**
 * Type for instruction class.
 */
interface InstructionClass {
  type: string;
  opcode: Opcode;
  [key: string]: any;
}

/**
 * Generates a Mermaid packet diagram for a wire format.
 */
function generateMermaidDiagram(
  format: OperandType[],
  opcodeName: string,
  opcodeValue: number,
  operandNames?: string[],
): string {
  // Calculate total bits for bitsPerRow config
  let totalBits = 0;
  for (const operandType of format) {
    totalBits += getOperandSize(operandType) * 8;
  }

  const lines: string[] = [
    '```mermaid',
    '---',
    `title: "${opcodeName}"`,
    'config:',
    '  packet:',
    `    bitsPerRow: ${totalBits}`,
    '---',
    'packet-beta',
  ];

  let bitOffset = 0;
  let operandIndex = 0; // Track operand position (excluding opcode and addressing mode)

  for (const [index, operandType] of format.entries()) {
    const sizeBytes = getOperandSize(operandType);
    const sizeBits = sizeBytes * 8;
    const endBit = bitOffset + sizeBits - 1;

    let fieldLabel: string;
    if (index === 0 || operandType === OperandType.OPCODE) {
      // First field is always the opcode
      fieldLabel = `Opcode (0x${opcodeValue.toString(16).toUpperCase()})`;
    } else if (operandType === OperandType.ADDRMODE8 || operandType === OperandType.ADDRMODE16) {
      // Addressing mode byte
      fieldLabel = 'Addressing modes';
    } else {
      // Regular operand - use provided name if available
      if (operandNames && operandIndex < operandNames.length) {
        fieldLabel = `Operand: ${operandNames[operandIndex]}`;
        operandIndex++;
      } else {
        fieldLabel = getFieldNameForOperandType(operandType, index);
      }
    }

    lines.push(`${bitOffset}-${endBit}: "${fieldLabel}"`);
    bitOffset += sizeBits;
  }

  lines.push('```');
  return lines.join('\n');
}

/**
 * Formats an opcode value as hex string.
 */
function formatOpcodeHex(opcode: number): string {
  return `0x${opcode.toString(16).padStart(2, '0').toUpperCase()}`;
}

/**
 * Gets the opcode range string for display (hex only).
 * Returns a single hex value if only one opcode, or a range if multiple.
 */
function getOpcodeRangeString(wireFormats: WireFormatVariation[]): string {
  if (wireFormats.length === 0) return '0x00';
  if (wireFormats.length === 1) return formatOpcodeHex(wireFormats[0].opcode);

  const opcodes = wireFormats.map(wf => wf.opcode).sort((a, b) => a - b);
  const min = opcodes[0];
  const max = opcodes[opcodes.length - 1];

  return `${formatOpcodeHex(min)}-${formatOpcodeHex(max)}`;
}

/**
 * Gets a human-readable field name for an operand type.
 */
function getFieldNameForOperandType(operandType: OperandType, index: number): string {
  switch (operandType) {
    case OperandType.UINT8:
    case OperandType.UINT16:
    case OperandType.UINT32:
    case OperandType.UINT64:
    case OperandType.UINT128:
    case OperandType.FF:
      return `Operand${index}`;
    case OperandType.TAG:
      return 'Tag';
    case OperandType.OPCODE:
      return 'Opcode';
    case OperandType.ADDRMODE8:
    case OperandType.ADDRMODE16:
      return 'Addressing modes';
    default:
      return `Field${index}`;
  }
}

/**
 * Gets the string name for an OperandType enum value.
 */
function getOperandTypeName(operandType: OperandType): string {
  return OperandType[operandType];
}

/**
 * Extracts wire format variations from an instruction class.
 * Checks both the class itself and its prototype chain.
 */
function extractWireFormats(instructionClass: InstructionClass): WireFormatVariation[] {
  const variations: WireFormatVariation[] = [];
  const baseName = instructionClass.type;

  // Look for wireFormat properties on the class and its prototype chain
  let currentClass: any = instructionClass;
  const wireFormatKeys: string[] = [];

  // Walk up the prototype chain to find all wireFormat properties
  while (currentClass && currentClass !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(currentClass)) {
      if (key.startsWith('wireFormat') && wireFormatKeys.indexOf(key) === -1) {
        wireFormatKeys.push(key);
      }
    }
    currentClass = Object.getPrototypeOf(currentClass);
  }

  // Determine if we have only one unnamed wireFormat
  const hasOnlyUnnamedWireFormat = wireFormatKeys.length === 1 && wireFormatKeys[0] === 'wireFormat';

  // Process each wire format
  for (const key of wireFormatKeys) {
    const format = (instructionClass as any)[key] as OperandType[];
    if (!Array.isArray(format)) continue;

    // Derive the opcode for this variation
    // The naming convention is: OPCODE_8, OPCODE_16, etc.
    let variantSuffix = key.replace('wireFormat', '');
    if (variantSuffix === '') variantSuffix = '8'; // Default to 8 if no suffix

    const variantName = `${baseName}_${variantSuffix.toUpperCase()}`;

    // Try to look up the opcode - first try the variant name, then the base name
    let opcodeKey = variantName as keyof typeof Opcode;
    let opcodeValue = Opcode[opcodeKey];

    // If variant doesn't exist in enum, try the base name (for single unnamed wireFormats)
    if (opcodeValue === undefined && hasOnlyUnnamedWireFormat) {
      opcodeKey = baseName as keyof typeof Opcode;
      opcodeValue = Opcode[opcodeKey];
    }

    // If still not found, try using the instruction class's opcode directly
    if (opcodeValue === undefined) {
      opcodeValue = instructionClass.opcode;
    }

    if (opcodeValue !== undefined) {
      // Use just the base name for both the name and diagram title if there's only one unnamed wireFormat
      const displayName = hasOnlyUnnamedWireFormat ? baseName : variantName;

      variations.push({
        name: displayName,
        opcode: opcodeValue,
        format: format.map(getOperandTypeName),
        mermaidDiagram: generateMermaidDiagram(format, displayName, opcodeValue),
      });
    }
  }

  return variations;
}

/**
 * Generates documentation for a single instruction class using programmatic extraction (v2).
 */
function generateOpcodeDoc(
  instructionClass: InstructionClass,
  analyzer: InstructionAnalyzer,
): OpcodeDocumentation | null {
  const type = instructionClass.type;
  const minimalMetadata = MinimalMetadataRegistry[type];

  // Skip if no minimal metadata (not yet documented)
  if (!minimalMetadata) {
    console.warn(`Warning: No minimal metadata found for ${type}, skipping`);
    return null;
  }

  // Extract metadata programmatically
  const extracted = analyzer.analyzeClass(instructionClass);

  const baseGas = getBaseGasCost(instructionClass.opcode);
  const dynamicGas = getDynamicGasCost(instructionClass.opcode);

  // Infer category from metadata or file location
  const category = minimalMetadata.category || inferCategory(instructionClass);

  // Build operand documentation by merging extracted info with manual descriptions
  const operands = extracted.operands
    .filter(op => op.type !== 'opcode' && op.type !== 'addressing_mode_bitmask') // Exclude opcode and indirect bytes
    .map(op => ({
      name: op.name,
      type: op.type,
      size: op.size,
      description: minimalMetadata.operandDescriptions?.[op.name] || generateOperandDescription(op),
      supportsAddressingModes: op.supportsAddressingModes,
      addressingModeBits: op.addressingModeBits,
    }));

  // Determine addressing mode bitmask size dynamically
  const addrModeBitmaskSize = getAddressingModeBitmaskSize(extracted.wireFormats);
  const addrModeEncoding = addrModeBitmaskSize
    ? `Single ${addrModeBitmaskSize}-bit bitmask: 2 bits per memory offset operand (indirect flag + relative flag)`
    : undefined;

  const doc: OpcodeDocumentation = {
    opcode: instructionClass.opcode,
    name: type,
    summary: minimalMetadata.summary,
    category,
    gasCosts: {
      l2Base: baseGas.l2Gas,
      daBase: baseGas.daGas,
    },
    wireFormats: generateWireFormatDocs(extracted.wireFormats, extracted.operands),
    operands,
    expression: minimalMetadata.expression,
    description: minimalMetadata.description,
    details: minimalMetadata.details,
    errors: minimalMetadata.errors || [],
    addressingModes: {
      supported: extracted.addressingModeOperands.length > 0,
      operands: extracted.addressingModeOperands,
      bitmaskSize: addrModeBitmaskSize,
      encoding: addrModeEncoding,
    },
  };

  // Add dynamic gas costs if present
  if (dynamicGas.l2Gas > 0) {
    doc.gasCosts.l2Dynamic = dynamicGas.l2Gas;
  }
  if (dynamicGas.daGas > 0) {
    doc.gasCosts.daDynamic = dynamicGas.daGas;
  }

  // Add tag checks and updates if present
  if (minimalMetadata.tagChecks) {
    doc.tagChecks = minimalMetadata.tagChecks;
  }
  if (minimalMetadata.tagUpdates) {
    doc.tagUpdates = minimalMetadata.tagUpdates;
  }

  // Add notes if present
  if (minimalMetadata.notes) {
    doc.notes = minimalMetadata.notes;
  }

  return doc;
}

/**
 * Generate a mermaid diagram showing the addressing mode bitmask layout.
 */
function generateAddressingModeMermaid(doc: OpcodeDocumentation): string {
  if (!doc.addressingModes.supported || !doc.addressingModes.bitmaskSize) {
    return '';
  }

  const bitmaskSize = doc.addressingModes.bitmaskSize;
  const lines: string[] = [];

  lines.push('```mermaid');
  lines.push('---');
  lines.push('title: "Addressing Mode Bitmask"');
  lines.push('config:');
  lines.push('  packet:');
  lines.push('    bitWidth: 128');
  lines.push(`    bitsPerRow: ${bitmaskSize}`);
  lines.push('---');
  lines.push('packet-beta');

  // Create a map of bit number to label
  const bitLabels: string[] = new Array(bitmaskSize).fill('Unused');

  // Fill in the labels for each operand
  for (const opName of doc.addressingModes.operands) {
    const op = doc.operands?.find(o => o.name === opName);
    if (op?.addressingModeBits) {
      bitLabels[op.addressingModeBits.indirectBit] = `${opName} is indirect`;
      bitLabels[op.addressingModeBits.relativeBit] = `${opName} is relative`;
    }
  }

  // Generate the packet diagram with proper bit ranges
  for (let i = 0; i < bitmaskSize; i++) {
    lines.push(`  ${i}: "${bitLabels[i]}"`);
  }

  lines.push('```');

  return lines.join('\n');
}

/**
 * Determine the addressing mode bitmask size from wire formats.
 * Returns 8 for ADDRMODE8, 16 for ADDRMODE16, or undefined if no addressing modes.
 */
function getAddressingModeBitmaskSize(wireFormats: any[]): number | undefined {
  if (wireFormats.length === 0) return undefined;

  for (const wf of wireFormats) {
    for (const operandType of wf.format) {
      if (operandType === OperandType.ADDRMODE8) {
        return 8;
      }
      if (operandType === OperandType.ADDRMODE16) {
        return 16;
      }
    }
  }

  return undefined;
}

/**
 * Generate a default description for an operand based on its properties.
 */
function generateOperandDescription(operand: any): string {
  if (operand.type === 'memory_offset') {
    return `Memory offset`;
  }
  if (operand.type === 'immediate') {
    return `Immediate value`;
  }
  if (operand.type === 'tag') {
    return `Type tag`;
  }
  return `Operand`;
}

/**
 * Infer category from instruction class (could use file path or other heuristics).
 */
function inferCategory(instructionClass: any): string {
  // For now, return 'Misc' - could be enhanced to check file path
  return 'Misc';
}

/**
 * Generate wire format documentation from extracted wire format info.
 */
function generateWireFormatDocs(wireFormats: any[], operands: any[]): WireFormatVariation[] {
  // Extract operand names (excluding opcode and addressing mode bytes)
  const operandNames = operands
    .filter(op => op.type !== 'opcode' && op.type !== 'addressing_mode_bitmask')
    .map(op => op.name);

  return wireFormats.map(wf => ({
    name: wf.opcodeVariant || wf.name,
    opcode: wf.opcodeValue || 0,
    format: wf.format.map((type: OperandType) => OperandType[type]),
    mermaidDiagram: generateMermaidDiagram(wf.format, wf.opcodeVariant || wf.name, wf.opcodeValue || 0, operandNames),
  }));
}

/**
 * Main function to generate documentation for all opcodes using InstructionAnalyzer (v2).
 */
function generateAllOpcodeDocs(): Record<string, OpcodeDocumentation> {
  // Create the analyzer
  const analyzer = new InstructionAnalyzer();

  // List of all instruction classes to document
  const instructionClasses: InstructionClass[] = [
    // Arithmetic
    Add,
    Sub,
    Mul,
    Div,
    FieldDiv,
    Shl,
    Shr,
    // Memory
    Set,
    Cast,
    Mov,
    // Bitwise
    And,
    Or,
    Xor,
    Not,
    // Comparison
    Eq,
    Lt,
    Lte,
    // Control Flow
    Jump,
    JumpI,
    InternalCall,
    InternalReturn,
    // Environment
    GetEnvVar,
    CalldataCopy,
    ReturndataSize,
    ReturndataCopy,
    SuccessCopy,
    // Storage
    SLoad,
    SStore,
    // World State / Accrued Substate
    NoteHashExists,
    EmitNoteHash,
    NullifierExists,
    EmitNullifier,
    L1ToL2MessageExists,
    EmitUnencryptedLog,
    SendL2ToL1Message,
    // Contract
    GetContractInstance,
    // External Calls
    Call,
    StaticCall,
    Return,
    Revert,
    // Gadgets
    Poseidon2,
    Sha256Compression,
    KeccakF1600,
    EcAdd,
    // Conversion
    ToRadixBE,
    // Misc
    DebugLog,
  ];

  const docs: Record<string, OpcodeDocumentation> = {};

  for (const instructionClass of instructionClasses) {
    const doc = generateOpcodeDoc(instructionClass, analyzer);
    if (doc) {
      docs[doc.name] = doc;
    }
  }

  return docs;
}

/**
 * Generate MDX documentation for a single opcode.
 */
function generateOpcodeMDX(doc: OpcodeDocumentation): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: ${doc.name}`);
  lines.push(`description: ${doc.description}`);
  lines.push(`opcode: ${doc.opcode}`);
  lines.push(`category: ${doc.category || 'Misc'}`);
  lines.push('---');
  lines.push('');

  // Title and metadata
  lines.push(`# ${doc.name}`);
  lines.push('');
  lines.push(`**Opcode(s)**: ${getOpcodeRangeString(doc.wireFormats)}`);
  lines.push('');
  lines.push(`**Category**: ${doc.category || 'Misc'}`);
  lines.push('');
  lines.push(doc.description);
  lines.push('');
  lines.push(doc.summary);
  lines.push('');

  // Expression
  if (doc.expression) {
    lines.push('## Expression');
    lines.push('');
    lines.push('```javascript');
    lines.push(doc.expression);
    lines.push('```');
    lines.push('');
  }

  // Details
  if (doc.details) {
    lines.push('## Details');
    lines.push('');
    lines.push(doc.details);
    lines.push('');
  }

  // Gas Costs (Complete)
  lines.push('## Gas Costs');
  lines.push('');
  lines.push('| Component | Cost |');
  lines.push('|-----------|------|');
  if (doc.gasCosts.l2Base !== undefined) {
    lines.push(`| **L2 Base** | ${doc.gasCosts.l2Base} |`);
  }
  if (doc.gasCosts.daBase !== undefined) {
    lines.push(`| **DA Base** | ${doc.gasCosts.daBase} |`);
  }
  if (doc.gasCosts.l2Dynamic !== undefined) {
    lines.push(`| **L2 Dynamic** | ${doc.gasCosts.l2Dynamic} (per unit) |`);
  }
  if (doc.gasCosts.daDynamic !== undefined) {
    lines.push(`| **DA Dynamic** | ${doc.gasCosts.daDynamic} (per unit) |`);
  }
  lines.push('');

  // Wire Formats (Complete with Mermaid)
  if (doc.wireFormats && doc.wireFormats.length > 0) {
    lines.push('## Wire Formats');
    lines.push('');

    for (const wf of doc.wireFormats) {
      lines.push(`### ${wf.name}`);
      lines.push('');
      lines.push('| Field | Value |');
      lines.push('|-------|-------|');
      lines.push(`| **Variant Name** | \`${wf.name}\` |`);
      lines.push(`| **Opcode** | ${formatOpcodeHex(wf.opcode)} |`);
      lines.push('');

      // Mermaid Packet Diagram
      if (wf.mermaidDiagram) {
        lines.push('**Packet Diagram**:');
        lines.push('');
        lines.push(wf.mermaidDiagram);
        lines.push('');
      }
    }
  }

  // Operands (Complete with all details)
  if (doc.operands && doc.operands.length > 0) {
    lines.push('## Operands');
    lines.push('');

    for (const op of doc.operands) {
      lines.push(`### \`${op.name}\``);
      lines.push('');
      lines.push('| Property | Value |');
      lines.push('|----------|-------|');
      lines.push(`| **Type** | \`${op.type}\` |`);
      lines.push(`| **Size (bytes)** | ${op.size} |`);
      lines.push(`| **Description** | ${op.description} |`);
      lines.push(`| **Supports Addressing Modes** | ${op.supportsAddressingModes ? '✓ Yes' : '✗ No'} |`);

      if (op.supportsAddressingModes && op.addressingModeBits) {
        lines.push(`| **Indirect Bit** | ${op.addressingModeBits.indirectBit} |`);
        lines.push(`| **Relative Bit** | ${op.addressingModeBits.relativeBit} |`);
      }
      lines.push('');
    }
  }

  // Addressing Modes (Complete)
  if (doc.addressingModes) {
    lines.push('## Addressing Modes');
    lines.push('');

    if (doc.addressingModes.supported) {
      lines.push('| Property | Value |');
      lines.push('|----------|-------|');
      lines.push(`| **Supported** | ✓ Yes |`);
      lines.push(`| **Encoding** | ${doc.addressingModes.encoding} |`);
      lines.push(`| **Bitmask Size** | ${doc.addressingModes.bitmaskSize} bits |`);
      lines.push('');

      // Add mermaid diagram
      const mermaidDiagram = generateAddressingModeMermaid(doc);
      if (mermaidDiagram) {
        lines.push(mermaidDiagram);
        lines.push('');
      }

      lines.push('**Operands with addressing modes**:');
      lines.push('');
      for (const opName of doc.addressingModes.operands) {
        const op = doc.operands?.find(o => o.name === opName);
        if (op?.addressingModeBits) {
          lines.push(
            `- \`${opName}\`: Indirect bit ${op.addressingModeBits.indirectBit}, Relative bit ${op.addressingModeBits.relativeBit}`,
          );
        } else {
          lines.push(`- \`${opName}\``);
        }
      }
      lines.push('');
    } else {
      lines.push('**Supported**: ✗ No');
      lines.push('');
    }
  }

  // Tag Checks (if present)
  if (doc.tagChecks && doc.tagChecks.length > 0) {
    lines.push('## Tag Checks');
    lines.push('');
    for (const check of doc.tagChecks) {
      lines.push(`- ${check}`);
    }
    lines.push('');
  }

  // Tag Updates (if present)
  if (doc.tagUpdates && doc.tagUpdates.length > 0) {
    lines.push('## Tag Updates');
    lines.push('');
    for (const update of doc.tagUpdates) {
      lines.push(`- ${update}`);
    }
    lines.push('');
  }

  // Errors (Complete)
  if (doc.errors && doc.errors.length > 0) {
    lines.push('## Error Conditions');
    lines.push('');

    for (const err of doc.errors) {
      lines.push(`### \`${err.condition}\``);
      lines.push('');
      lines.push(err.description);
      lines.push('');
    }
  }

  // Additional Notes (if present)
  if ((doc as any).notes && (doc as any).notes.length > 0) {
    lines.push('## Notes');
    lines.push('');
    for (const note of (doc as any).notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  // Raw JSON Reference
  lines.push('---');
  lines.push('');
  lines.push('## JSON Specification');
  lines.push('');
  lines.push('<details>');
  lines.push('<summary>View complete JSON specification</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(doc, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

/**
 * Generate a complete MDX file with all opcodes organized by category.
 */
function generateAllOpcodesMDX(docs: Record<string, OpcodeDocumentation>): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push('title: AVM Instruction Set');
  lines.push('description: Complete reference for all Aztec Virtual Machine instructions');
  lines.push('---');
  lines.push('');

  // Introduction
  lines.push('# AVM Instruction Set');
  lines.push('');
  lines.push('This document provides a comprehensive reference for all Aztec Virtual Machine (AVM) instructions.');
  lines.push('');
  lines.push(`**Total Opcodes**: ${Object.keys(docs).length}`);
  lines.push('');

  // Organize opcodes by category
  const categories = new Map<string, OpcodeDocumentation[]>();
  for (const [name, doc] of Object.entries(docs)) {
    const category = doc.category || 'Misc';
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push(doc);
  }

  // Table of contents
  lines.push('## Table of Contents');
  lines.push('');
  const sortedCategories = Array.from(categories.keys()).sort();
  for (const category of sortedCategories) {
    const categoryDocs = categories.get(category)!;
    lines.push(`- [${category}](#${category.toLowerCase().replace(/\s+/g, '-')}) (${categoryDocs.length} opcodes)`);
  }
  lines.push('');

  // Generate documentation for each category
  for (const category of sortedCategories) {
    const categoryDocs = categories.get(category)!.sort((a, b) => a.name.localeCompare(b.name));

    lines.push(`## ${category}`);
    lines.push('');

    for (const doc of categoryDocs) {
      lines.push(`### ${doc.name}`);
      lines.push('');
      lines.push(`<div className="opcode-card">`);
      lines.push('');
      lines.push(doc.summary);
      lines.push('');

      // Quick reference
      lines.push('#### Quick Reference');
      lines.push('');
      lines.push('| Property | Value |');
      lines.push('|----------|-------|');
      lines.push(`| **Opcode(s)** | ${getOpcodeRangeString(doc.wireFormats)} |`);
      lines.push(`| **Description** | ${doc.description} |`);
      lines.push('');

      // Expression
      if (doc.expression) {
        lines.push('#### Expression');
        lines.push('');
        lines.push('```javascript');
        lines.push(doc.expression);
        lines.push('```');
        lines.push('');
      }

      // Details
      if (doc.details) {
        lines.push('#### Details');
        lines.push('');
        lines.push(doc.details);
        lines.push('');
      }

      // Gas Costs (complete)
      lines.push('#### Gas Costs');
      lines.push('');
      lines.push('| Component | Value |');
      lines.push('|-----------|-------|');
      if (doc.gasCosts.l2Base !== undefined) lines.push(`| L2 Base | ${doc.gasCosts.l2Base} |`);
      if (doc.gasCosts.daBase !== undefined) lines.push(`| DA Base | ${doc.gasCosts.daBase} |`);
      if (doc.gasCosts.l2Dynamic !== undefined) lines.push(`| L2 Dynamic | ${doc.gasCosts.l2Dynamic} |`);
      if (doc.gasCosts.daDynamic !== undefined) lines.push(`| DA Dynamic | ${doc.gasCosts.daDynamic} |`);
      lines.push('');

      // Wire formats (complete with Mermaid)
      if (doc.wireFormats && doc.wireFormats.length > 0) {
        lines.push('#### Wire Formats');
        lines.push('');
        for (const wf of doc.wireFormats) {
          lines.push(`**${wf.name}** (Opcode ${formatOpcodeHex(wf.opcode)}):`);
          lines.push('');
          if (wf.mermaidDiagram) {
            lines.push(wf.mermaidDiagram);
            lines.push('');
          }
        }
      }

      // Operands (complete with addressing mode bits)
      if (doc.operands && doc.operands.length > 0) {
        lines.push('#### Operands');
        lines.push('');
        lines.push('| Name | Type | Description |');
        lines.push('|------|------|-------------|');
        for (const op of doc.operands) {
          lines.push(`| \`${op.name}\` | ${generateOperandDescription(op)} | ${op.description} |`);
        }
        lines.push('');
      }

      // Addressing Modes
      if (doc.addressingModes?.supported) {
        lines.push('#### Addressing Modes');
        lines.push(
          'Instructions of this type include a bitmask that defines the addressing mode for each memory-offset operand. Every memory-offset operand is associated with two bits in this bitmask. These bits specify whether the operand should be treated as indirect (M[M[x]]) and/or relative (M[x] + M[0]). By default, operands use direct addressing (M[x]). If both bits for an operand are 0, direct addressing is used; otherwise, the operand applies indirect and/or relative addressing as indicated by the bitmask.',
        );
        lines.push('');
        lines.push(`- **Encoding**: ${doc.addressingModes.encoding}`);
        lines.push(`- **Bitmask**: ${doc.addressingModes.bitmaskSize} bits`);
        lines.push(`- **Memory offset operands**: ${doc.addressingModes.operands.map(o => `\`${o}\``).join(', ')}`);
        lines.push('');

        // Add mermaid diagram
        const mermaidDiagram = generateAddressingModeMermaid(doc);
        if (mermaidDiagram) {
          lines.push(mermaidDiagram);
          lines.push('');
        }
      }

      // Tag Checks (if present)
      if (doc.tagChecks && doc.tagChecks.length > 0) {
        lines.push('#### Tag Checks');
        lines.push('');
        for (const check of doc.tagChecks) {
          lines.push(`- ${check}`);
        }
        lines.push('');
      }

      // Tag Updates (if present)
      if (doc.tagUpdates && doc.tagUpdates.length > 0) {
        lines.push('#### Tag Updates');
        lines.push('');
        for (const update of doc.tagUpdates) {
          lines.push(`- ${update}`);
        }
        lines.push('');
      }

      // Errors
      if (doc.errors && doc.errors.length > 0) {
        lines.push('#### Error Conditions');
        lines.push('');
        for (const err of doc.errors) {
          lines.push(`- **${err.condition}**: ${err.description}`);
        }
        lines.push('');
      }

      lines.push('</div>');
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  // Footer
  lines.push('## Notes');
  lines.push('');
  lines.push('- **M[x]** denotes memory at offset x');
  lines.push('- **Addressing modes** allow operands to use direct, indirect, or relative addressing');
  lines.push('- Gas costs may include dynamic components based on operand values or state access patterns');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate individual MDX files for each opcode in a directory.
 */
function generateIndividualMDXFiles(docs: Record<string, OpcodeDocumentation>, outputDir: string): void {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let count = 0;
  for (const [name, doc] of Object.entries(docs)) {
    const mdx = generateOpcodeMDX(doc);
    const filename = path.join(outputDir, `${name.toLowerCase()}.mdx`);
    fs.writeFileSync(filename, mdx, 'utf-8');
    count++;
  }

  console.log(`Generated ${count} individual MDX files in ${outputDir}`);
}

/**
 * Main entry point
 */
function main() {
  try {
    const args = process.argv.slice(2);

    // Parse command line arguments
    let outputFile = 'avm-isa.json';
    let format: 'json' | 'mdx' | 'both' | 'mdx-individual' = 'json';
    let mdxOutputDir = 'avm-isa-docs';

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--format' && i + 1 < args.length) {
        format = args[i + 1] as any;
        i++;
      } else if (args[i] === '--output' && i + 1 < args.length) {
        outputFile = args[i + 1];
        i++;
      } else if (args[i] === '--mdx-dir' && i + 1 < args.length) {
        mdxOutputDir = args[i + 1];
        i++;
      } else if (!args[i].startsWith('--')) {
        outputFile = args[i];
      }
    }

    console.log('Generating AVM opcode documentation...');
    const docs = generateAllOpcodeDocs();

    // Generate JSON
    if (format === 'json' || format === 'both') {
      const jsonOutput = JSON.stringify(docs, null, 2);
      fs.writeFileSync(outputFile, jsonOutput, 'utf-8');
      console.log(`✓ JSON documentation: ${outputFile}`);
    }

    // Generate MDX (single file)
    if (format === 'mdx' || format === 'both') {
      const mdxOutput = generateAllOpcodesMDX(docs);
      const mdxFile = outputFile.replace(/\.json$/, '.mdx');
      fs.writeFileSync(mdxFile, mdxOutput, 'utf-8');
      console.log(`✓ MDX documentation: ${mdxFile}`);
    }

    // Generate individual MDX files
    if (format === 'mdx-individual') {
      generateIndividualMDXFiles(docs, mdxOutputDir);
    }

    console.log(`\nDocumentation generated successfully!`);
    console.log(`Total opcodes documented: ${Object.keys(docs).length}`);

    if (format === 'json' || format === 'both') {
      console.log(`\nUsage:`);
      console.log(`  JSON output: ${outputFile}`);
    }
    if (format === 'mdx' || format === 'both') {
      console.log(`  MDX output: ${outputFile.replace(/\.json$/, '.mdx')}`);
    }
    if (format === 'mdx-individual') {
      console.log(`  Individual MDX files: ${mdxOutputDir}/`);
    }

    console.log(`\nOptions:`);
    console.log(`  --format json|mdx|both|mdx-individual  Output format (default: json)`);
    console.log(`  --output <file>                        Output file path`);
    console.log(`  --mdx-dir <dir>                        Directory for individual MDX files`);
  } catch (error) {
    console.error('Error generating documentation:');
    console.error(error);
    process.exit(1);
  }
}

// Always run when this file is executed directly
main();

export { generateAllOpcodeDocs, generateOpcodeDoc, type OpcodeDocumentation };
