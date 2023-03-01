import request from 'supertest';
import { JsonRpcServer } from './JsonRpcServer.js';

// Contrived example
class Tree {
  constructor() {}
  toString(): string {
    return '';
  }
  static fromString(): Tree {
    return new Tree();
  }
}

class State {
  constructor(private publicTree: Tree, private privateTree: Tree) {}
  getPrivateTree(): Tree {
    return this.publicTree;
  }
  getPublicTree(): Tree {
    return this.privateTree;
  }
}

test('simple example', async () => {
  const server = new JsonRpcServer(new State(new Tree(), new Tree()), { Tree });
  const response = await request(server.getApp().callback()).post('/getPrivateTree');
  expect(response.status).toBe(200);
  expect(response.text).toBe('{"result":{"type":"Tree","data":""}}');
});
