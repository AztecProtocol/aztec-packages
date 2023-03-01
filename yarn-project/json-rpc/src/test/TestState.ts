import { sleep } from '../jsUtils';

// Contrived example for JSON RPC tests
export class TestNote {
  constructor(private data: string) {}
  toString(): string {
    return this.data;
  }
  static fromString(data: string): TestNote {
    return new TestNote(data);
  }
}

export class TestState {
  constructor(private notes: TestNote[]) {}
  getNote(index: number): TestNote {
    return this.notes[index];
  }
  async addNotes(notes: TestNote[]): Promise<TestNote[]> {
    for (const note of notes) {
      this.notes.push(note);
    }
    await sleep(notes.length);
    return this.notes;
  }
}
