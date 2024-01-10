import { Fr } from "@aztec/foundation/fields";


export class AvmContext {

  public readonly calldata: Fr[];
  
  // TODO: implement tagged memory
  public memory: Fr[];

  public pc: number;
  public callStack: number[];

  constructor( calldata: Fr[]) {
    this.calldata = calldata;
    this.memory = [];

    this.pc = 0;
    this.callStack = [];
  }


  public readMemory(offset: number): Fr {
    // TODO: check offset is within bounds
    return this.memory[offset] ?? Fr.ZERO;
  }

  public writeMemory(offset: number, value: Fr): void {
    this.memory[offset] = value;
  }

  public writeMemoryChunk(offset: number, values: Fr[]): void {
    this.memory.splice(offset, values.length, ...values);
  }
}
