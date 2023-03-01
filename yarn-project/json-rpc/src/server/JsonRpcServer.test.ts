import request from 'supertest';
import { JsonRpcServer } from './JsonRpcServer.js';

// Contrived example
class Note {
  constructor(private data: string) {}
  toString(): string {
    return this.data;
  }
  static fromString(data: string): Note {
    return new Note(data);
  }
}

class State {
  constructor(private notes: Note[]) {}
  getNotes(): Note[] {
    return this.notes;
  }
}

test('test simple serialization', async () => {
  const server = new JsonRpcServer(new State([new Note('a'), new Note('b')]), { Note });
  const response = await request(server.getApp().callback()).post('/getNotes');
  expect(response.status).toBe(200);
  expect(response.text).toBe('{"result":[{"type":"Note","data":"a"},{"type":"Note","data":"b"}]}');
});
