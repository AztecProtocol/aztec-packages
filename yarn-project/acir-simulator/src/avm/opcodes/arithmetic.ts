import { AvmMachineState } from '../avm_machine_state.js';
import { AvmJournal } from '../journal/index.js';
import { Instruction } from './instruction.js';
import { OperandPair, OperandType, deserialize, serialize } from './serialization.js';

export class Add extends Instruction {
  static readonly type: string = 'ADD';
  static readonly numberOfOperands = 3;

  private static readonly operands: OperandPair[] = [
    [(c: Add) => c.indirect, OperandType.UINT8],
    [(c: Add) => c.inTag, OperandType.UINT8],
    [(c: Add) => c.aOffset, OperandType.UINT32],
    [(c: Add) => c.bOffset, OperandType.UINT32],
    [(c: Add) => c.dstOffset, OperandType.UINT32],
  ];

  constructor(
    private indirect: number,
    private inTag: number,
    private aOffset: number,
    private bOffset: number,
    private dstOffset: number,
  ) {
    super();
  }

  public static deserialize(buf: Buffer): Add {
    const args = deserialize(buf, Add.operands) as ConstructorParameters<typeof Add>;
    return new Add(...args);
  }

  public serialize(): Buffer {
    return serialize(Add.operands, this);
  }

  async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
    const a = machineState.memory.get(this.aOffset);
    const b = machineState.memory.get(this.bOffset);

    const dest = a.add(b);
    machineState.memory.set(this.dstOffset, dest);

    this.incrementPc(machineState);
  }
}

export class Sub extends Instruction {
  static type: string = 'SUB';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private dstOffset: number) {
    super();
  }

  async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
    const a = machineState.memory.get(this.aOffset);
    const b = machineState.memory.get(this.bOffset);

    const dest = a.sub(b);
    machineState.memory.set(this.dstOffset, dest);

    this.incrementPc(machineState);
  }
}

export class Mul extends Instruction {
  static type: string = 'MUL';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private dstOffset: number) {
    super();
  }

  async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
    const a = machineState.memory.get(this.aOffset);
    const b = machineState.memory.get(this.bOffset);

    const dest = a.mul(b);
    machineState.memory.set(this.dstOffset, dest);

    this.incrementPc(machineState);
  }
}

export class Div extends Instruction {
  static type: string = 'DIV';
  static numberOfOperands = 3;

  constructor(private aOffset: number, private bOffset: number, private dstOffset: number) {
    super();
  }

  async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
    const a = machineState.memory.get(this.aOffset);
    const b = machineState.memory.get(this.bOffset);

    const dest = a.div(b);
    machineState.memory.set(this.dstOffset, dest);

    this.incrementPc(machineState);
  }
}
