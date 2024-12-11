import { strict as assert } from 'assert';

import type { AvmContext } from '../avm_context.js';
import { type Gas, getBaseGasCost, getDynamicGasCost, mulGas, sumGas } from '../avm_gas.js';
import { type BufferCursor } from '../serialization/buffer_cursor.js';
import { type Serializable } from '../serialization/bytecode_serialization.js';
import { Opcode, type OperandType, deserialize, serializeAs } from '../serialization/instruction_serialization.js';

type InstructionConstructor = {
  new (...args: any[]): Instruction;
};

/**
 * Parent class for all AVM instructions.
 * It's most important aspects are execute and (de)serialize.
 */
export abstract class Instruction {
  /**
   * Consumes gas and executes the instruction.
   * This is the main entry point for the instruction.
   * @param context - The AvmContext in which the instruction executes.
   */
  public abstract execute(context: AvmContext): Promise<void>;

  /**
   * Whether the instruction will modify the PC itself.
   */
  public handlesPC(): boolean {
    return false;
  }

  /**
   * Generate a string representation of the instruction including
   * the instruction sub-class name all of its flags and operands.
   * @returns Thee string representation.
   */
  public toString(): string {
    let instructionStr = this.constructor.name + ': ';
    // assumes that all properties are flags or operands
    for (const prop of Object.getOwnPropertyNames(this) as (keyof Instruction)[]) {
      instructionStr += `${prop}:${this[prop].toString()}, `;
    }
    return instructionStr;
  }

  // Default deserialization which uses Class.opcode and Class.wireFormat.
  public static deserialize(
    this: InstructionConstructor & { wireFormat: OperandType[]; as: any },
    buf: BufferCursor | Buffer,
  ): Instruction {
    return this.as(this.wireFormat).deserialize(buf);
  }

  // Default serialization which uses Class.opcode and Class.wireFormat.
  public serialize(): Buffer {
    const klass = this.constructor as any;
    assert(klass.opcode !== undefined && klass.opcode !== null);
    assert(klass.wireFormat !== undefined && klass.wireFormat !== null);
    return this.as(klass.opcode, klass.wireFormat).serialize();
  }

  /**
   * Returns a new instruction instance that can be serialized with the given opcode and wire format.
   * @param opcode The opcode of the instruction.
   * @param wireFormat The wire format of the instruction.
   * @returns The new instruction instance.
   */
  public as(opcode: Opcode, wireFormat: OperandType[]): Instruction & Serializable {
    return Object.defineProperty(this, 'serialize', {
      value: (): Buffer => {
        return serializeAs(wireFormat, opcode, this);
      },
      enumerable: false,
    });
  }

  /**
   * Returns a new instruction class that can be deserialized with the given opcode and wire format.
   * @param opcode The opcode of the instruction.
   * @param wireFormat The wire format of the instruction.
   * @returns The new instruction class.
   */
  public static as(this: InstructionConstructor, wireFormat: OperandType[]) {
    return Object.assign(this, {
      deserialize: (buf: BufferCursor | Buffer): Instruction => {
        const res = deserialize(buf, wireFormat);
        const args = res.slice(1); // Remove opcode.
        return new this(...args);
      },
    });
  }

  /**
   * Computes gas cost for the instruction based on its base cost and memory operations.
   * @returns Gas cost.
   */
  protected gasCost(dynMultiplier: number = 0): Gas {
    const baseGasCost = getBaseGasCost(this.opcode);
    const dynGasCost = mulGas(getDynamicGasCost(this.opcode), dynMultiplier);
    return sumGas(baseGasCost, dynGasCost);
  }

  /**
   * Returns the stringified type of the instruction.
   * Instruction sub-classes should have a static `type` property.
   */
  public get type(): string {
    const type = 'type' in this.constructor && (this.constructor.type as string);
    if (!type) {
      throw new Error(`Instruction class ${this.constructor.name} does not have a static 'type' property defined.`);
    }
    return type;
  }

  /**
   * Returns the opcode of the instruction.
   * Instruction sub-classes should have a static `opcode` property.
   */
  public get opcode(): Opcode {
    const opcode = 'opcode' in this.constructor ? (this.constructor.opcode as Opcode) : undefined;
    if (opcode === undefined || Opcode[opcode] === undefined) {
      throw new Error(`Instruction class ${this.constructor.name} does not have a static 'opcode' property defined.`);
    }
    return opcode;
  }
}
