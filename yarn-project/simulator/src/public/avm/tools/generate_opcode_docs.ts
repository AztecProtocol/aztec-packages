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
// Import all exports from opcodes to auto-discover instruction classes
import * as AllOpcodes from '../opcodes/index.js';
import { MinimalMetadataRegistry } from '../opcodes/metadata_registry.js';
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
  description?: string;
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
  /** Gas scaling information for dynamic gas costs */
  gasScaling?: {
    l2Gas?: string;
    daGas?: string;
    note?: string;
  };
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
    `    bitsPerRow: ${Math.min(totalBits, 64)}`,
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
  if (wireFormats.length === 0) {
    throw new Error('No wire formats provided');
  }
  if (wireFormats.length === 1) {
    return `\`${formatOpcodeHex(wireFormats[0].opcode)}\``;
  }

  const opcodes = wireFormats.map(wf => wf.opcode).sort((a, b) => a - b);
  const min = opcodes[0];
  const max = opcodes[opcodes.length - 1];

  return `\`${formatOpcodeHex(min)}\`-\`${formatOpcodeHex(max)}\``;
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
    //console.warn(`Warning: No minimal metadata found for ${type}, skipping`);
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
    ? `${addrModeBitmaskSize}-bit bitmask: 2 bits per memory offset operand (indirect flag + relative flag)`
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

  // Add gas scaling if present
  if (minimalMetadata.gasScaling) {
    doc.gasScaling = minimalMetadata.gasScaling;
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
  lines.push('    bitsPerRow: 8');
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
  if (wireFormats.length === 0) {
    return undefined;
  }

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
function inferCategory(_instructionClass: any): string {
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
 * Check if a value is an instruction class (has required static properties).
 */
function isInstructionClass(value: unknown): value is InstructionClass {
  if (typeof value !== 'function') {
    return false;
  }
  const cls = value as unknown as Record<string, unknown>;
  // Must have both 'type' (string) and 'opcode' (number) static properties
  return typeof cls.type === 'string' && typeof cls.opcode === 'number';
}

/**
 * Auto-discover all instruction classes from the opcodes module.
 */
function discoverInstructionClasses(): InstructionClass[] {
  const classes: InstructionClass[] = [];
  const seenTypes = new Set<string>();

  for (const value of Object.values(AllOpcodes)) {
    if (isInstructionClass(value)) {
      // Avoid duplicates (same instruction exported multiple times)
      if (!seenTypes.has(value.type)) {
        seenTypes.add(value.type);
        classes.push(value);
      }
    }
  }

  // Sort by opcode for consistent ordering
  return classes.sort((a, b) => a.opcode - b.opcode);
}

/**
 * Main function to generate documentation for all opcodes using InstructionAnalyzer (v2).
 */
function generateAllOpcodeDocs(): Record<string, OpcodeDocumentation> {
  // Create the analyzer
  const analyzer = new InstructionAnalyzer();

  // Auto-discover all instruction classes from the opcodes module
  const instructionClasses = discoverInstructionClasses();

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
  if (doc.description) {
    lines.push(doc.description);
    lines.push('');
  }
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
 * Generate quick reference markdown page.
 */
function generateQuickReference(docs: Record<string, OpcodeDocumentation>, opcodesDir: string): string {
  const lines: string[] = [];

  // Title and introduction
  lines.push('# Instruction Set: Quick Reference');
  lines.push('');
  lines.push('Quick reference for all Aztec Virtual Machine (AVM) opcodes.');
  lines.push('');
  lines.push('## Supporting Materials');
  lines.push('');
  lines.push('Before diving into the instruction set, familiarize yourself with these core concepts:');
  lines.push('');
  lines.push('- **[Introduction](index.md)**: What is the AVM and why do we need it?');
  lines.push('- **[State](state.md)**: World state (persistent) vs execution state (transient)');
  lines.push('- **[Memory Model](memory.md)**: Memory notation and tagged memory (`M[x]` and `T[x]`)');
  lines.push(
    '- **[Addressing Modes](addressing.md)**: Direct, indirect, and relative addressing along with their gas implications',
  );
  lines.push(
    '- **[Execution Lifecycle](execution-lifecycle.md)**: VM initialization, PC rules, halting, gas charging order',
  );
  lines.push(
    '- **[Gas Metering](gas.md)**: How L2 and DA gas costs are calculated and charged during instruction execution',
  );
  lines.push('- **[Errors](errors.md)**: Error types, triggers, and gas/state behavior');
  lines.push(
    '- **[Wire Formats](wire-format.md)**: How instructions are encoded in bytecode and why opcodes have variants like `ADD_8` and `ADD_16`',
  );
  lines.push('');

  // Sort by lowest opcode value
  const allOpcodeDocInfos = Object.values(docs).sort((a, b) => {
    const aLowestOpcode = Math.min(...a.wireFormats.map(wf => wf.opcode));
    const bLowestOpcode = Math.min(...b.wireFormats.map(wf => wf.opcode));
    return aLowestOpcode - bLowestOpcode;
  });

  // Quick reference list
  lines.push('## Quick Reference');
  lines.push('');
  lines.push('Click on an opcode name to view its detailed documentation.');
  lines.push('');
  for (const doc of allOpcodeDocInfos) {
    const opcodeFilename = `${opcodesDir}/${doc.name.toLowerCase()}.md`;
    const nameLink = `[\u{1F517}${doc.name}](${opcodeFilename})`;
    const opcodes = getOpcodeRangeString(doc.wireFormats);
    const summary = doc.summary || '';
    const wireFormatCount = doc.wireFormats.length;
    const opcodesText =
      wireFormatCount === 1 ? `Opcode ${opcodes}` : `Opcodes ${opcodes} (${wireFormatCount} wire formats)`;
    lines.push(`* **${nameLink}**: ${summary}`);
    lines.push(`    * ${opcodesText}`);
    if (doc.expression) {
      lines.push('    ```javascript');
      lines.push(`    ${doc.expression}`);
      lines.push('    ```');
    }
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate markdown content for a single opcode.
 * This is used both for individual opcode files and the full reference.
 * When standalone=true, generates a complete file with frontmatter.
 * When standalone=false, generates just the opcode section for the full reference.
 */
function generateSingleOpcodeMarkdown(doc: OpcodeDocumentation, standalone: boolean = false): string {
  const lines: string[] = [];

  if (standalone) {
    // Add link back to quick reference at the top
    lines.push('[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)');
    lines.push('');
    lines.push(`# ${doc.name}`);
  } else {
    lines.push(`### ${doc.name}`);
  }
  lines.push('');

  // Summary
  lines.push(doc.summary);
  lines.push('');

  const opcodes = getOpcodeRangeString(doc.wireFormats);
  const wireFormatCount = doc.wireFormats.length;
  const opcodesText =
    wireFormatCount === 1 ? `Opcode ${opcodes}` : `Opcodes ${opcodes} (${wireFormatCount} wire formats)`;
  // Opcodes range
  lines.push(opcodesText);
  lines.push('');

  // Expression (no heading, just code block)
  if (doc.expression) {
    lines.push('```javascript');
    lines.push(doc.expression);
    lines.push('```');
    lines.push('');
  }

  // Details
  if (doc.details) {
    lines.push(standalone ? '## Details' : '#### Details');
    lines.push('');
    lines.push(doc.details);
    lines.push('');
  }

  // Gas Costs (complete)
  lines.push(standalone ? '## Gas Costs' : '#### Gas Costs');
  lines.push('');

  // Helper function to wrap M[...] in backticks
  const wrapMemoryRefs = (str: string): string => {
    return str.replace(/M\[[^\]]+\]/g, match => `\`${match}\``);
  };

  // Determine if we need the "Scales with" column
  const hasDynamicGas = doc.gasCosts.l2Dynamic !== undefined || doc.gasCosts.daDynamic !== undefined;
  const hasAddressingModes = doc.addressingModes.supported;
  const needsScalesWithColumn = hasDynamicGas || hasAddressingModes;

  if (needsScalesWithColumn) {
    lines.push('| Component | Value | Scales with |');
    lines.push('|-----------|-------|-------------|');
    if (doc.gasCosts.l2Base !== undefined) {
      lines.push(`| L2 Base | ${doc.gasCosts.l2Base} | - |`);
    }
    if (doc.gasCosts.daBase !== undefined) {
      lines.push(`| DA Base | ${doc.gasCosts.daBase} | - |`);
    }
    // Add L2 Addressing row for instructions with memory offset operands
    if (hasAddressingModes) {
      lines.push(`| L2 Addressing | 3 | 3 L2 gas per indirect memory offset<br/>3 L2 gas per relative memory offset |`);
    }
    if (doc.gasCosts.l2Dynamic !== undefined) {
      const scalesWith = doc.gasScaling?.l2Gas ? wrapMemoryRefs(doc.gasScaling.l2Gas) : '-';
      lines.push(`| L2 Dynamic | ${doc.gasCosts.l2Dynamic} | ${scalesWith} |`);
    }
    if (doc.gasCosts.daDynamic !== undefined) {
      const scalesWith = doc.gasScaling?.daGas ? wrapMemoryRefs(doc.gasScaling.daGas) : '-';
      lines.push(`| DA Dynamic | ${doc.gasCosts.daDynamic} | ${scalesWith} |`);
    }
  } else {
    lines.push('| Component | Value |');
    lines.push('|-----------|-------|');
    if (doc.gasCosts.l2Base !== undefined) {
      lines.push(`| L2 Base | ${doc.gasCosts.l2Base} |`);
    }
    if (doc.gasCosts.daBase !== undefined) {
      lines.push(`| DA Base | ${doc.gasCosts.daBase} |`);
    }
  }
  lines.push('');

  // Add instruction-specific gas note if present
  if (doc.gasScaling?.note) {
    lines.push(doc.gasScaling.note);
    lines.push('');
  }

  // Add link to gas metering page
  lines.push('*See [Gas Metering](gas.md) for details on how gas costs are computed and applied.');
  lines.push('');

  // Operands (complete with addressing mode bits)
  if (doc.operands && doc.operands.length > 0) {
    lines.push(standalone ? '## Operands' : '#### Operands');
    lines.push('');
    lines.push('| Name | Type | Description |');
    lines.push('|------|------|-------------|');
    for (const op of doc.operands) {
      lines.push(`| \`${op.name}\` | ${generateOperandDescription(op)} | ${op.description} |`);
    }
    lines.push('');
  }

  // Wire formats (complete with Mermaid)
  if (doc.wireFormats && doc.wireFormats.length > 0) {
    lines.push(standalone ? '## Wire Formats' : '#### Wire Formats');
    lines.push(
      'See [Wire Format](wire-format.md) page for an explanation of wire format variants and opcode naming (e.g., why `ADD_8` vs `ADD_16`).',
    );
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

  // Addressing Modes
  if (doc.addressingModes?.supported) {
    lines.push(standalone ? '## Addressing Modes' : '#### Addressing Modes');
    lines.push('See [Addressing](addressing.md) page for a detailed explanation.');
    lines.push('');
    lines.push(`${doc.addressingModes.encoding}`);
    lines.push('');
    lines.push(
      `Memory offset operands (${doc.addressingModes.operands.map(o => `\`${o}\``).join(', ')}) are encoded as follows:`,
    );
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
    lines.push(standalone ? '## Tag Checks' : '#### Tag Checks');
    lines.push('');
    for (const check of doc.tagChecks) {
      lines.push(`- ${check}`);
    }
    lines.push('');
  }

  // Tag Updates (if present)
  if (doc.tagUpdates && doc.tagUpdates.length > 0) {
    lines.push(standalone ? '## Tag Updates' : '#### Tag Updates');
    lines.push('');
    for (const update of doc.tagUpdates) {
      lines.push(`- ${update}`);
    }
    lines.push('');
  }

  // Errors
  if (doc.errors && doc.errors.length > 0) {
    lines.push(standalone ? '## Error Conditions' : '#### Error Conditions');
    lines.push('');
    for (const err of doc.errors) {
      lines.push(`- **${err.condition}**: ${err.description}`);
    }
    lines.push('');
  }

  // Notes
  if (doc.notes && doc.notes.length > 0) {
    lines.push(standalone ? '## Notes' : '#### Notes');
    lines.push('');
    for (const note of doc.notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  if (standalone) {
    // Add link back to quick reference at the bottom
    lines.push('---');
    lines.push('');
    lines.push('[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)');
  } else {
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate full instruction set details markdown page.
 */
function generateFullInstructionSet(docs: Record<string, OpcodeDocumentation>, quickRefFilename: string): string {
  const lines: string[] = [];

  // Title and introduction
  lines.push('# Instruction Set: Full Reference');
  lines.push('');
  lines.push(
    'Comprehensive reference for all Aztec Virtual Machine (AVM) instructions. The AVM is the virtual machine used for **public execution** in the Aztec protocol. This is _not_ a specification of the ACIR instruction set used for private execution.',
  );
  lines.push('');
  lines.push(`For a quick overview, see [Instruction Set Quick Reference](${quickRefFilename}).`);
  lines.push('');
  lines.push('## Definitions and Notes');
  lines.push('');
  lines.push(
    '- **`M[x]`**: Denotes the value in memory at offset `x`, or sometimes the "value after memory offset operand x is fully resolved and accessed".',
  );
  lines.push(
    '- **`T[x]`**: Denotes the type tag of the memory cell at offset `x`. Tags include `FIELD`, `UINT1`, `UINT8`, `UINT16`, `UINT32`, `UINT64` and `UINT128`.',
  );
  lines.push(
    '- **Immediate**: A constant value encoded directly in the bytecode that does not require a memory read to access.',
  );
  lines.push(
    '- **`pc++`**: Every instruction increments the program counter (`PC`) by its instruction size (in bytes) unless it performs explicit control flow (jumps, internal calls/returns, calls/returns/reverts) or encounters an error.',
  );
  lines.push(
    "- **Gas metering**: Every instruction has an associated gas cost (L2 and DA components). If insufficient gas remains when an instruction is reached, execution halts with an out-of-gas error. This error condition is implicit for all instructions and is not explicitly listed in each instruction's error conditions.",
  );
  lines.push(
    '- **`mod 2^k`**: All arithmetic operations are performed modulo 2^k, where `k` is the bit-width of the operand type (e.g., k=8 for `UINT8`, k=254 for `FIELD`).',
  );
  lines.push(
    '- **`mod p`**: Field operations are performed modulo the BN254 field prime `p = 21888242871839275222246405745257275088548364400416034343698204186575808495617`.',
  );
  lines.push(
    '- **`storage[address][slot]`**: Denotes the value in persistent storage at the given contract address and storage slot.',
  );
  lines.push('');

  // Sort by lowest opcode value
  const allOpcodeDocInfos = Object.values(docs).sort((a, b) => {
    const aLowestOpcode = Math.min(...a.wireFormats.map(wf => wf.opcode));
    const bLowestOpcode = Math.min(...b.wireFormats.map(wf => wf.opcode));
    return aLowestOpcode - bLowestOpcode;
  });

  lines.push('## Instructions');
  lines.push('');

  // Generate documentation for each opcode using the shared function
  for (const doc of allOpcodeDocInfos) {
    lines.push(generateSingleOpcodeMarkdown(doc, false));
  }

  return lines.join('\n');
}

/**
 * Main entry point
 */
function main() {
  try {
    const args = process.argv.slice(2);

    // Parse command line arguments
    let outputFile = 'avm-isa.json';
    let format: 'json' | 'md' | 'both' = 'json';

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--format' && i + 1 < args.length) {
        format = args[i + 1] as any;
        i++;
      } else if (args[i] === '--output' && i + 1 < args.length) {
        outputFile = args[i + 1];
        i++;
      } else if (!args[i].startsWith('--')) {
        outputFile = args[i];
      }
    }

    //console.log('Generating AVM opcode documentation...');
    const docs = generateAllOpcodeDocs();

    // Generate JSON
    if (format === 'json' || format === 'both') {
      const jsonOutput = JSON.stringify(docs, null, 2);
      fs.writeFileSync(outputFile, jsonOutput, 'utf-8');
      //console.log(`✓ JSON documentation: ${outputFile}`);
    }

    // Generate Markdown files
    if (format === 'md' || format === 'both') {
      // Compute filenames
      const quickRefFile = outputFile.replace(/\.json$/, '-quick-reference.md');
      const fullFile = outputFile.replace(/\.json$/, '-full.md');

      // Compute output directory from the output file path
      const outputDir = path.dirname(outputFile);
      const opcodesDir = path.join(outputDir, 'opcodes');

      // Create opcodes directory if it doesn't exist
      if (!fs.existsSync(opcodesDir)) {
        fs.mkdirSync(opcodesDir, { recursive: true });
      }

      // Extract basenames for links
      const quickRefBasename = quickRefFile.split('/').pop()!;

      // Generate individual opcode files
      for (const doc of Object.values(docs)) {
        const opcodeFile = path.join(opcodesDir, `${doc.name.toLowerCase()}.md`);
        const opcodeContent = generateSingleOpcodeMarkdown(doc, true);
        fs.writeFileSync(opcodeFile, opcodeContent, 'utf-8');
      }

      // Generate quick reference with links to individual opcode files
      const quickRefOutput = generateQuickReference(docs, 'opcodes');
      fs.writeFileSync(quickRefFile, quickRefOutput, 'utf-8');
      //console.log(`✓ Quick reference: ${quickRefFile}`);

      // Generate full instruction set (for reference/backwards compatibility)
      const fullOutput = generateFullInstructionSet(docs, quickRefBasename);
      fs.writeFileSync(fullFile, fullOutput, 'utf-8');
      //console.log(`✓ Full instruction set: ${fullFile}`);
    }

    //console.log(`\nDocumentation generated successfully!`);
    //console.log(`Total opcodes documented: ${Object.keys(docs).length}`);

    if (format === 'json' || format === 'both') {
      //console.log(`\nUsage:`);
      //console.log(`  JSON output: ${outputFile}`);
    }
    if (format === 'md' || format === 'both') {
      //console.log(`  Quick reference: ${outputFile.replace(/\.json$/, '-quick-reference.md')}`);
      //console.log(`  Full instruction set: ${outputFile.replace(/\.json$/, '-full.md')}`);
    }

    //console.log(`\nOptions:`);
    //console.log(`  --format json|md|both  Output format (default: json)`);
    //console.log(`  --output <file>        Output file path`);
  } catch (error) {
    console.error('Error generating documentation:', error);
    process.exit(1);
  }
}

// Always run when this file is executed directly
main();

export { generateAllOpcodeDocs, generateOpcodeDoc, type OpcodeDocumentation };
