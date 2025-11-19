/**
 * Metadata interfaces for AVM instruction documentation.
 * These types define the structure of metadata that can be attached to instruction classes
 * for automated documentation generation.
 */

/**
 * Defines an operand used by an instruction.
 */
export interface OperandDefinition {
  /** Name of the operand (e.g., 'aOffset', 'dstOffset', 'value') */
  name: string;
  /** Type category of the operand */
  type: 'memory_offset' | 'immediate' | 'tag' | 'relative_offset';
  /** Size descriptor - 'variable' means it depends on wire format variant */
  size: number | 'variable';
  /** Human-readable description of this operand's purpose */
  description: string;
}

/**
 * Describes tag checking behavior for an instruction.
 */
export interface TagCheckingRules {
  /** Operands that must have the same type tag */
  requiresSameTags?: string[];
  /** How the result tag is determined */
  resultTag?: 'preserves_input' | 'from_operand' | 'field' | 'custom';
  /** For 'from_operand' resultTag, specifies which operand's tag to use */
  resultTagSource?: string;
  /** For instructions that set a tag explicitly */
  setsTag?: string;
}

/**
 * Describes indirect addressing support for an instruction.
 */
export interface IndirectAddressingSupport {
  /** Whether indirect addressing is supported */
  supported: boolean;
  /** Which operands can be indirect (empty array if none) */
  operands: string[];
}

/**
 * Category of instruction for organizational purposes.
 */
export type InstructionCategory =
  | 'Arithmetic'
  | 'Memory'
  | 'Control'
  | 'External'
  | 'State'
  | 'Gadget'
  | 'Comparison'
  | 'Bitwise'
  | 'Conversion'
  | 'Environment'
  | 'Misc';

/**
 * Metadata that can be attached to an instruction class for documentation generation.
 * This is optional and will be added incrementally to instruction classes.
 */
export interface InstructionMetadata {
  /** Human-readable name of the instruction */
  name: string;
  /** Category for organizing instructions */
  category: InstructionCategory;
  /** List of operand definitions */
  operands: OperandDefinition[];
  /** Tag checking rules for this instruction */
  tagChecking?: TagCheckingRules;
  /** Names of supported wire format properties (e.g., ['wireFormat8', 'wireFormat16']) */
  supportedWireFormats: string[];
  /** Indirect addressing support information */
  indirectSupport?: IndirectAddressingSupport;
}
