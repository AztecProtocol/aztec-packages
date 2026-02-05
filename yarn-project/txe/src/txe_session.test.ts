import { Fr } from '@aztec/foundation/curves/bn254';

import type { TXEOracleFunctionName } from './txe_session.js';
import { TXESession } from './txe_session.js';

describe('TXESession.processFunction', () => {
  let session: TXESession;

  beforeAll(() => {
    session = new TXESession(
      {} as any, // logger
      {} as any, // stateMachine
      {} as any, // oracleHandler
      {} as any, // contractStore
      {} as any, // noteStore
      {} as any, // foreignNoteStore
      {} as any, // keyStore
      {} as any, // addressStore
      {} as any, // accountStore
      {} as any, // senderTaggingStore
      {} as any, // recipientTaggingStore
      {} as any, // senderAddressBook
      {} as any, // capsuleStore
      {} as any, // privateEventStore
      {} as any, // jobCoordinator
      {} as any, // initialJobId
      new Fr(1), // chainId
      new Fr(1), // version
      0n, // nextBlockTimestamp
    );
  });

  it('rejects calling a function that does not exist on RPCTranslator with the expected error message', () => {
    const invalidName = 'notARealFunction' as unknown as TXEOracleFunctionName;

    expect(() => session.processFunction(invalidName, [])).toThrow(
      `notARealFunction does not correspond to any oracle handler available on RPCTranslator`,
    );
  });

  it('rejects calling internal translator helpers (handlerAs*) with the expected error message', () => {
    const illegalNames = ['handlerAsMisc', 'handlerAsUtility', 'handlerAsPrivate', 'handlerAsAvm', 'handlerAsTxe'];

    for (const name of illegalNames) {
      expect(() => session.processFunction(name as any, [])).toThrow(
        `${name} does not correspond to any oracle handler available on RPCTranslator`,
      );
    }
  });

  it("rejects calling the translator's constructor with the expected error message", () => {
    const invalidName = 'constructor' as unknown as TXEOracleFunctionName;

    expect(() => session.processFunction(invalidName, [])).toThrow(
      `constructor does not correspond to any oracle handler available on RPCTranslator`,
    );
  });
});
