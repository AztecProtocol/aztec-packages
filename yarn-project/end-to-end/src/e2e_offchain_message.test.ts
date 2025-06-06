import { type AccountWalletWithSecretKey, AztecAddress, Fr } from '@aztec/aztec.js';
import { OffchainMessageContract } from '@aztec/noir-test-contracts.js/OffchainMessage';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

describe('e2e_offchain_message', () => {
  let contract1: OffchainMessageContract;
  let contract2: OffchainMessageContract;

  jest.setTimeout(TIMEOUT);

  let wallets: AccountWalletWithSecretKey[];
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ teardown, wallets } = await setup(1));
    // TODO(benesjan): The following results in one of the txs being dropped. There seems to be an issue in Aztec.js
    // deployments.
    // [contract1, contract2] = await Promise.all([
    //   OffchainMessageContract.deploy(wallets[0]).send({ contractAddressSalt: Fr.random() }).deployed(),
    //   OffchainMessageContract.deploy(wallets[0]).send({ contractAddressSalt: Fr.random() }).deployed(),
    // ]);
    contract1 = await OffchainMessageContract.deploy(wallets[0]).send().deployed();
    contract2 = await OffchainMessageContract.deploy(wallets[0]).send().deployed();
  });

  afterAll(() => teardown());

  function toBoundedVec<T>(arr: T[], maxLen: number) {
    const paddingMessagePayload = {
      message: [Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO],
      recipient: AztecAddress.ZERO,
      // eslint-disable-next-line camelcase
      next_contract: AztecAddress.ZERO,
    };

    return {
      len: arr.length,
      storage: arr.concat(new Array(maxLen - arr.length).fill(paddingMessagePayload)),
    };
  }

  it('should emit offchain message', async () => {
    const messages = await Promise.all(
      Array(3)
        .fill(null)
        .map(async (_, i) => ({
          message: [Fr.random(), Fr.random(), Fr.random(), Fr.random(), Fr.random()],
          recipient: await AztecAddress.random(),
          // eslint-disable-next-line camelcase
          next_contract: i % 2 === 0 ? contract2.address : contract1.address,
        })),
    );

    const provenTx = await contract1.methods.emit_offchain_message_for_recipient(toBoundedVec(messages, 6)).prove();

    // The expected order of offchain messages is the reverse because the messages are popped from the end of the input
    // BoundedVec.
    const expectedOffchainMessages = messages
      .map((message, i) => ({
        message: message.message,
        recipient: message.recipient,
        contractAddress: i % 2 == 0 ? contract1.address : contract2.address,
      }))
      .reverse();

    expect(provenTx.offchainMessages).toEqual(expectedOffchainMessages);
  });

  it('should not emit any offchain messages', async () => {
    const provenTx = await contract1.methods.emit_offchain_message_for_recipient(toBoundedVec([], 6)).prove();
    expect(provenTx.offchainMessages).toEqual([]);
  });

  it('should revert when emitting offchain message from utility function', async () => {
    await expect(contract1.methods.emitting_offchain_message_from_utility_reverts().simulate()).rejects.toThrow(
      'Cannot emit offchain message from a utility function',
    );
  });
});
