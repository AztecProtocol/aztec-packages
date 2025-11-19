/**
 * InstructionAnalyzer - Programmatic extraction of instruction metadata.
 *
 * This component analyzes instruction classes to extract structural information
 * that would otherwise need to be manually specified:
 * - Operands (from wire formats and constructor parameters)
 * - Addressing mode support (from naming conventions)
 * - Wire format variations (from static properties)
 * - Tag checking behavior (from execution code)
 *
 * Design principle: Convention over configuration.
 */
import { Opcode, OperandType, getOperandSize } from '../serialization/instruction_serialization.js';

/**
 * Information about addressing mode bit allocation for an operand.
 */
export interface AddressingModeBits {
  /** Bit position for the indirect flag */
  indirectBit: number;
  /** Bit position for the relative flag */
  relativeBit: number;
}

/**
 * Information about a single operand extracted from the instruction class.
 */
export interface OperandInfo {
  /** Name of the operand (e.g., 'aOffset', 'dstOffset', 'value') */
  name: string;
  /** Inferred type category */
  type: 'memory_offset' | 'immediate' | 'tag' | 'opcode' | 'addressing_mode_bitmask';
  /** Size in bytes ('variable' if it changes across wire formats) */
  size: number | 'variable';
  /** Whether this operand supports addressing modes */
  supportsAddressingModes: boolean;
  /** Bit allocation in addressing mode byte (if applicable) */
  addressingModeBits?: AddressingModeBits;
}

/**
 * Information about a wire format variation.
 */
export interface WireFormatInfo {
  /** Property name (e.g., 'wireFormat8', 'wireFormat16') */
  name: string;
  /** The wire format array */
  format: OperandType[];
  /** Inferred opcode variant (e.g., 'ADD_8', 'ADD_16') */
  opcodeVariant?: string;
  /** Opcode value for this variant */
  opcodeValue?: number;
}

/**
 * Complete metadata extracted from an instruction class.
 */
export interface ExtractedMetadata {
  /** Instruction type name (e.g., 'ADD', 'SUB') */
  type: string;
  /** Base opcode */
  opcode: Opcode;
  /** All wire format variations */
  wireFormats: WireFormatInfo[];
  /** Constructor parameter names (excluding 'indirect') */
  constructorParams: string[];
  /** Operand information */
  operands: OperandInfo[];
  /** Operands that support addressing modes */
  addressingModeOperands: string[];
}

/**
 * Analyzes instruction classes to extract metadata programmatically.
 */
export class InstructionAnalyzer {
  /**
   * Extract all available metadata from an instruction class.
   */
  public analyzeClass(instructionClass: any): ExtractedMetadata {
    const type = instructionClass.type;
    const opcode = instructionClass.opcode;
    const wireFormats = this.extractWireFormats(instructionClass);
    const constructorParams = this.extractConstructorParams(instructionClass);
    const operands = this.inferOperands(wireFormats, constructorParams);
    const addressingModeOperands = this.inferAddressingModeSupport(constructorParams);

    return {
      type,
      opcode,
      wireFormats,
      constructorParams,
      operands,
      addressingModeOperands,
    };
  }

  /**
   * Extract all wireFormat* properties from the instruction class.
   */
  private extractWireFormats(cls: any): WireFormatInfo[] {
    const formats: WireFormatInfo[] = [];
    const baseName = cls.type;
    const wireFormatKeys: string[] = [];

    // Walk prototype chain to find all wireFormat* properties
    let current = cls;
    while (current && current !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(current)) {
        if (key.startsWith('wireFormat') && wireFormatKeys.indexOf(key) === -1) {
          wireFormatKeys.push(key);
        }
      }
      current = Object.getPrototypeOf(current);
    }

    // Determine if we have only one unnamed wireFormat
    const hasOnlyUnnamedWireFormat = wireFormatKeys.length === 1 && wireFormatKeys[0] === 'wireFormat';

    // Process each wire format
    for (const key of wireFormatKeys) {
      const format = cls[key] || cls.constructor[key];
      if (!Array.isArray(format)) {
        continue;
      }

      // Derive variant suffix from property name (e.g., 'wireFormat8' -> '8')
      let variantSuffix = key.replace('wireFormat', '');
      if (variantSuffix === '') {
        variantSuffix = '8'; // Default to 8 if no suffix
      }

      // Build opcode variant name (e.g., 'ADD_8')
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
        opcodeValue = cls.opcode;
      }

      // Use just the base name for display if there's only one unnamed wireFormat
      const displayName = hasOnlyUnnamedWireFormat ? baseName : variantName;

      if (opcodeValue !== undefined) {
        formats.push({
          name: displayName,
          format,
          opcodeVariant: displayName,
          opcodeValue,
        });
      }
    }

    return formats;
  }

  /**
   * Extract constructor parameter names using string parsing.
   * Walks up the prototype chain to find the first constructor with parameters.
   */
  private extractConstructorParams(cls: any): string[] {
    try {
      // Walk up the prototype chain to find constructors
      let current = cls.prototype;
      while (current) {
        const ctorString = current.constructor.toString();

        // Match constructor parameters
        const match = ctorString.match(/constructor\s*\(([^)]*)\)/);
        if (match && match[1] && match[1].trim()) {
          const params = match[1]
            .split(',')
            .map((p: string) => p.trim())
            .map((p: string) => {
              // Handle TypeScript type annotations (e.g., 'indirect: number' -> 'indirect')
              const paramName = p.split(':')[0].trim();
              // Remove visibility modifiers (private, protected, public)
              return paramName.replace(/^(private|protected|public)\s+/, '');
            })
            .filter((p: string) => p && p !== 'indirect'); // Filter out empty strings and 'indirect'

          if (params.length > 0) {
            return params;
          }
        }

        // Move up the prototype chain
        current = Object.getPrototypeOf(current);
        // Stop at Object.prototype
        if (current === Object.prototype || !current) {
          break;
        }
      }
    } catch {
      //console.warn(`Failed to extract constructor params for ${cls.type}:`, error);
    }
    return [];
  }

  /**
   * Infer operand information from wire formats and constructor parameters.
   */
  private inferOperands(wireFormats: WireFormatInfo[], params: string[]): OperandInfo[] {
    // Use first wire format as reference
    if (wireFormats.length === 0) {
      return [];
    }

    const referenceFormat = wireFormats[0].format;
    const hasAddrModes = this.hasAddressingModes(referenceFormat);
    const operands: OperandInfo[] = [];
    let paramIndex = 0;

    for (let i = 0; i < referenceFormat.length; i++) {
      const type = referenceFormat[i];

      // Skip opcode byte
      if (type === OperandType.OPCODE) {
        operands.push({
          name: 'opcode',
          type: 'opcode',
          size: 1,
          supportsAddressingModes: false,
        });
        continue;
      }

      // Skip the SINGLE addressing mode bitmask byte
      if (type === OperandType.ADDRMODE8 || type === OperandType.ADDRMODE16) {
        operands.push({
          name: 'indirect',
          type: 'addressing_mode_bitmask',
          size: type === OperandType.ADDRMODE8 ? 1 : 2,
          supportsAddressingModes: false,
        });
        continue;
      }

      // Map to constructor parameter
      const name = params[paramIndex] || `operand${paramIndex}`;
      const supportsAddrModes = name.endsWith('Offset') && hasAddrModes;

      operands.push({
        name,
        type: this.inferOperandType(name, type),
        size: this.getOperandSizeInfo(type, wireFormats),
        supportsAddressingModes: supportsAddrModes,
        addressingModeBits: supportsAddrModes ? this.getAddressingModeBits(params, name) : undefined,
      });
      paramIndex++;
    }

    return operands;
  }

  /**
   * Check if the wire format includes a SINGLE addressing mode byte.
   */
  private hasAddressingModes(format: OperandType[]): boolean {
    const addrModeCount = format.filter(
      type => type === OperandType.ADDRMODE8 || type === OperandType.ADDRMODE16,
    ).length;
    return addrModeCount === 1; // Must be exactly one
  }

  /**
   * Calculate bit positions for an operand in the addressing mode byte.
   */
  private getAddressingModeBits(allParams: string[], operandName: string): AddressingModeBits | undefined {
    // Get all offset operands in order
    const offsetOperands = allParams.filter(p => p.endsWith('Offset'));
    const index = offsetOperands.indexOf(operandName);

    if (index === -1) {
      return undefined;
    }

    return {
      indirectBit: index * 2, // Even bit for indirect
      relativeBit: index * 2 + 1, // Odd bit for relative
    };
  }

  /**
   * Infer which operands support addressing modes based on naming convention.
   */
  private inferAddressingModeSupport(params: string[]): string[] {
    return params.filter(p => p.endsWith('Offset'));
  }

  /**
   * Infer the operand type from its name and wire type.
   */
  private inferOperandType(name: string, wireType: OperandType): 'memory_offset' | 'immediate' | 'tag' {
    // TAG types are explicit in wire format
    if (wireType === OperandType.TAG) {
      return 'tag';
    }

    // Memory offsets end with 'Offset'
    if (name.endsWith('Offset')) {
      return 'memory_offset';
    }

    // Immediates have specific naming patterns
    if (['value', 'const', 'imm'].some(pattern => name.toLowerCase().includes(pattern))) {
      return 'immediate';
    }

    // Default to memory offset for numeric types
    return 'memory_offset';
  }

  /**
   * Determine operand size information.
   * Returns 'variable' if the operand size changes across wire formats.
   */
  private getOperandSizeInfo(type: OperandType, wireFormats: WireFormatInfo[]): number | 'variable' {
    // For semantic types, get the base size
    if (type === OperandType.OPCODE || type === OperandType.ADDRMODE8) {
      return 1;
    }
    if (type === OperandType.ADDRMODE16) {
      return 2;
    }

    // TAG always has fixed size
    if (type === OperandType.TAG) {
      return 1;
    }

    // Check if this operand type varies across wire formats
    if (wireFormats.length > 1) {
      // If we have multiple wire formats, the size is likely variable
      // This is a simplification - could be more sophisticated
      return 'variable';
    }

    return getOperandSize(type);
  }
}
