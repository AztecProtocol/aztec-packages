import { AztecAddress, Fr, type PXE, type Wallet } from '@aztec/aztec.js';
import { AuthContract, DocsExampleContract, KeyRegistryContract, StateVarsContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { GeneratorIndex } from '@aztec/circuits.js';

const TIMEOUT = 100_000;

describe('SharedMutablePrivateGetter', () => {
  let keyRegistry: KeyRegistryContract;
  let stateVarsContract: StateVarsContract;
  let pxe: PXE;
  jest.setTimeout(TIMEOUT);

  let wallet: Wallet;

  let teardown: () => Promise<void>;

  // const delay = async (blocks: number) => {
  //   for (let i = 0; i < blocks; i++) {
  //     await authContract.methods.get_authorized().send().wait();
  //   }
  // };

  beforeAll(async () => {
    ({ teardown, wallet, pxe } = await setup(2));
    stateVarsContract = await StateVarsContract.deploy(wallet).send().deployed();
    keyRegistry = await KeyRegistryContract.deploy(wallet).send().deployed();
  }, 30_000);

  afterAll(() => teardown());

  it('should generate keys', async () => {
    const partialAddress = new Fr(69);

    const masterNullifierPublicKey = new Fr(12);
    const masterIncomingViewingPublicKey = new Fr(34);
    const masterOutgoingViewingPublicKey = new Fr(56);
    const masterTaggingPublicKey = new Fr(78);

    const publicKeysHash = poseidon2Hash([
      masterNullifierPublicKey,
      masterIncomingViewingPublicKey,
      masterOutgoingViewingPublicKey,
      masterTaggingPublicKey,
      GeneratorIndex.PUBLIC_KEYS_HASH,
    ]);

    // We hash the partial address and the public keys hash to get the account address
    // TODO(#5726): Should GeneratorIndex.CONTRACT_ADDRESS be removed given that we introduced CONTRACT_ADDRESS_V1?
    // TODO(#5726): Move the following line to AztecAddress class?
    const accountAddressFr = poseidon2Hash([partialAddress, publicKeysHash, GeneratorIndex.CONTRACT_ADDRESS_V1]);
    
    await keyRegistry
      .withWallet(wallet)
      .methods.register(AztecAddress.fromField(accountAddressFr), partialAddress, {
        nullifier_public_key: masterNullifierPublicKey,
        incoming_public_key: masterIncomingViewingPublicKey,
        outgoing_public_key: masterOutgoingViewingPublicKey,
        tagging_public_key: masterTaggingPublicKey,
      })
      .send()
      .wait();
  });

  // it('checks authorized from auth contract from state vars contract', async () => {
  //   await delay(5);

  //   const { txHash } = await stateVarsContract.methods
  //     .test_shared_mutable_private_getter(authContract.address, 2)
  //     .send()
  //     .wait();

  //   const rawLogs = await pxe.getUnencryptedLogs({ txHash });
  //   expect(Fr.fromBuffer(rawLogs.logs[0].log.data)).toEqual(new Fr(6969696969));
  // });
});