import { Fr } from "@aztec/foundation/fields";


export class AvmContext {

  public readonly calldata: Fr[];
  private returnData: Fr[]; 
  
  // TODO: implement tagged memory
  public memory: Fr[];

  public pc: number;
  public callStack: number[];

  constructor( calldata: Fr[]) {
    this.calldata = calldata;
    this.returnData = [];
    this.memory = [];

    this.pc = 0;
    this.callStack = [];
  }

  /**
   * Return data must NOT be modified once it is set
   */
  public setReturnData(returnData: Fr[]) {
    this.returnData = returnData;
    Object.freeze(returnData);
  }

  public getReturnData(): Fr[] {
    return this.returnData;
  }

  public readMemory(offset: number): Fr {
    // TODO: check offset is within bounds
    return this.memory[offset] ?? Fr.ZERO;
  }

  public readMemoryChunk(offset: number, size: number): Fr[] {
    // TODO: bounds -> initialise to 0
    return this.memory.slice(offset, offset + size);
  }

  public writeMemory(offset: number, value: Fr): void {
    this.memory[offset] = value;
  }

  public writeMemoryChunk(offset: number, values: Fr[]): void {
    this.memory.splice(offset, values.length, ...values);
  }
}
