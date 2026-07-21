import { throwStub } from './stub_helpers.js';

export function createWorldState(..._args: unknown[]): never {
  throwStub('createWorldState');
}

export function createWorldStateSynchronizer(..._args: unknown[]): never {
  throwStub('createWorldStateSynchronizer');
}

export class WorldStateSynchronizerError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WorldStateSynchronizerError';
  }
}
<<<<<<< HEAD

export class IpcWorldState {
  constructor(..._args: unknown[]) {
    throwStub('IpcWorldState');
  }
}

export class WorldStateInstrumentation {
  constructor(..._args: unknown[]) {
    throwStub('WorldStateInstrumentation');
  }
}

export function getWsdbOptions(..._args: unknown[]): never {
  throwStub('getWsdbOptions');
}
=======
>>>>>>> origin/v5-next
