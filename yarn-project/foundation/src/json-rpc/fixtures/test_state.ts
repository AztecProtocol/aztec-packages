import { z } from 'zod';

import { type ApiSchemaFor, optional, schemas } from '../../schemas/index.js';
import { sleep } from '../../sleep/index.js';

/**
 * Contrived example for JSON RPC tests.
 */
export class TestNote {
  constructor(private data: string) {}

  static get schema() {
    return z.object({ data: z.string() }).transform(({ data }) => new TestNote(data));
  }

  toJSON() {
    return { data: this.data };
  }

  /**
   * Create a string representation of this class.
   * @returns The string representation.
   */
  toString(): string {
    return this.data;
  }
  /**
   * Creates a string representation of this class.
   * @param data - The data.
   * @returns The string representation.
   */
  static fromString(data: string): TestNote {
    return new TestNote(data);
  }
}

export interface TestStateApi {
  getNote: (index: number) => Promise<TestNote | undefined>;
  getNotes: (limit?: number) => Promise<TestNote[]>;
  getNotes2: (limit: bigint | undefined) => Promise<TestNote[]>;
  getNotes3: (limit?: number) => Promise<TestNote[]>;
  clear: () => Promise<void>;
  addNotes: (notes: TestNote[]) => Promise<TestNote[]>;
  fail: () => Promise<void>;
  count: () => Promise<number>;
  getStatus: () => Promise<{ status: string; count: bigint }>;
  getTuple(): Promise<[string, string | undefined, number]>;
}

/**
 * Represents a simple state management for TestNote instances.
 * Provides functionality to get a note by index and add notes asynchronously.
 * Primarily used for testing JSON RPC-related functionalities.
 */
export class TestState implements TestStateApi {
  constructor(public notes: TestNote[]) {}
  /**
   * Retrieve the TestNote instance at the specified index from the notes array.
   * This method allows getting a desired TestNote from the collection of notes
   * maintained by the TestState instance using the provided index value.
   *
   * @param index - The index of the TestNote to be retrieved from the notes array.
   * @returns The TestNote instance corresponding to the given index.
   */
  async getNote(index: number): Promise<TestNote> {
    await sleep(0.1);
    return this.notes[index];
  }

  fail(): Promise<void> {
    throw new Error('Test state failed');
  }

  async count(): Promise<number> {
    await sleep(0.1);
    return this.notes.length;
  }

  async getNotes(limit?: number): Promise<TestNote[]> {
    await sleep(0.1);
    return limit ? this.notes.slice(0, limit) : this.notes;
  }

  async getNotes2(limit: bigint | undefined): Promise<TestNote[]> {
    await sleep(0.1);
    return limit ? this.notes.slice(0, Number(limit)) : this.notes;
  }

  async getNotes3(limit = 1): Promise<TestNote[]> {
    await sleep(0.1);
    return limit ? this.notes.slice(0, Number(limit)) : this.notes;
  }

  async clear(): Promise<void> {
    await sleep(0.1);
    this.notes = [];
  }

  /**
   * Add an array of TestNote instances to the current TestState's notes.
   * This function simulates asynchronous behavior by waiting for a duration
   * equal to the number of notes being added. It then returns the updated
   * list of TestNote instances in the TestState.
   *
   * @param notes - An array of TestNote instances to be added.
   * @returns A Promise that resolves to an array of TestNote instances, including the newly added notes.
   */
  async addNotes(notes: TestNote[]): Promise<TestNote[]> {
    for (const note of notes) {
      this.notes.push(note);
    }
    await sleep(notes.length);
    return this.notes;
  }

  async forceClear() {
    await sleep(0.1);
    this.notes = [];
  }

  async getStatus(): Promise<{ status: string; count: bigint }> {
    await sleep(0.1);
    return { status: 'ok', count: BigInt(this.notes.length) };
  }

  async getTuple(): Promise<[string, string | undefined, number]> {
    await sleep(0.1);
    return ['a', undefined, 1];
  }
}

export const TestStateSchema: ApiSchemaFor<TestStateApi> = {
  getNote: z.function().args(z.number()).returns(TestNote.schema.optional()),
  getNotes: z.function().args(optional(schemas.Integer)).returns(z.array(TestNote.schema)),
  getNotes2: z.function().args(optional(schemas.BigInt)).returns(z.array(TestNote.schema)),
  getNotes3: z.function().args(optional(schemas.Integer)).returns(z.array(TestNote.schema)),
  clear: z.function().returns(z.void()),
  addNotes: z.function().args(z.array(TestNote.schema)).returns(z.array(TestNote.schema)),
  fail: z.function().returns(z.void()),
  count: z.function().returns(z.number()),
  getStatus: z.function().returns(z.object({ status: z.string(), count: schemas.BigInt })),
  getTuple: z.function().returns(z.tuple([z.string(), optional(z.string()), z.number()])),
};
