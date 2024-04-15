import { KeyStore, Note, type AztecNode } from '@aztec/circuit-types';
import { computeUniqueCommitment, siloNoteHash } from '@aztec/circuits.js/hash';
import {
  ABIParameterVisibility,
  getFunctionArtifact,
  type FunctionArtifactWithDebugMetadata,
} from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { pedersenHash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';

import { mock, type MockProxy } from 'jest-mock-extended';

import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { TestKeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type DBOracle } from './db_oracle.js';
import { AcirSimulator } from './simulator.js';

describe('Simulator', () => {
  let oracle: MockProxy<DBOracle>;
  let node: MockProxy<AztecNode>;

  let simulator: AcirSimulator;
  // const ownerPk = GrumpkinScalar.fromString('2dcc5485a58316776299be08c78fa3788a1a7961ae30dc747fb1be17692a8d32');
  // const ownerCompleteAddress = CompleteAddress.fromPrivateKeyAndPartialAddress(ownerPk, Fr.random());
  // const owner = ownerCompleteAddress.address;
  // const ownerNullifierSecretKey = Point.random();
  // const ownerNullifierPublicKey = Fr.random();
  
  let keyStore: KeyStore;
  let owner: AztecAddress;
  let contractAddress: AztecAddress;
  let appNullifierSecretKey: Fr;

  beforeEach(async () => {
    const db = openTmpStore();
    keyStore = new TestKeyStore(new Grumpkin(), db);

    owner = await keyStore.createAccount();
    contractAddress = AztecAddress.random();

    appNullifierSecretKey = await keyStore.getAppNullifierSecretKey(owner, contractAddress);

    oracle = mock<DBOracle>();
    node = mock<AztecNode>();
    oracle.getNullifierKeys.mockResolvedValue({
      masterNullifierPublicKey: await keyStore.getMasterNullifierPublicKey(owner),
      appNullifierSecretKey,
    });
    oracle.getCompleteAddress.mockResolvedValue(ownerCompleteAddress);

    simulator = new AcirSimulator(oracle, node);
  });

  describe('computeNoteHashAndNullifier', () => {
    const artifact = getFunctionArtifact(TokenContractArtifact, 'compute_note_hash_and_nullifier');
    const nonce = Fr.random();
    const storageSlot = Fr.random();
    const noteTypeId = new Fr(8411110710111078111116101n); // TokenNote TODO(benesjan): This can be imported from artifact now

    const createNote = (amount = 123n) => new Note([new Fr(amount), owner.toField(), Fr.random()]);

    it('should compute note hashes and nullifier', async () => {
      oracle.getFunctionArtifactByName.mockResolvedValue(artifact);

      const note = createNote();
      const tokenNoteHash = pedersenHash(note.items);
      const innerNoteHash = pedersenHash([storageSlot, tokenNoteHash]);
      const siloedNoteHash = siloNoteHash(contractAddress, innerNoteHash);
      const uniqueSiloedNoteHash = computeUniqueCommitment(nonce, siloedNoteHash);
      // TODO(benesjan): all the pedersen hashes in notes should be replaced with poseidon2
      const innerNullifier = pedersenHash([
        uniqueSiloedNoteHash,
        appNullifierSecretKey,
      ]);

      const result = await simulator.computeNoteHashAndNullifier(contractAddress, nonce, storageSlot, noteTypeId, note);

      expect(result).toEqual({
        innerNoteHash,
        siloedNoteHash,
        uniqueSiloedNoteHash,
        innerNullifier,
      });
    });

    it('throw if the contract does not implement "compute_note_hash_and_nullifier"', async () => {
      oracle.getFunctionArtifactByName.mockResolvedValue(undefined);

      const note = createNote();
      await expect(
        simulator.computeNoteHashAndNullifier(contractAddress, nonce, storageSlot, noteTypeId, note),
      ).rejects.toThrow(/Mandatory implementation of "compute_note_hash_and_nullifier" missing/);
    });

    it('throw if "compute_note_hash_and_nullifier" has the wrong number of parameters', async () => {
      const note = createNote();

      const modifiedArtifact: FunctionArtifactWithDebugMetadata = {
        ...artifact,
        parameters: artifact.parameters.slice(1),
      };
      oracle.getFunctionArtifactByName.mockResolvedValue(modifiedArtifact);

      await expect(
        simulator.computeNoteHashAndNullifier(contractAddress, nonce, storageSlot, noteTypeId, note),
      ).rejects.toThrow(
        new RegExp(
          `Expected 5 parameters in mandatory implementation of "compute_note_hash_and_nullifier", but found 4 in noir contract ${contractAddress}.`,
        ),
      );
    });

    it('throw if a note has more fields than "compute_note_hash_and_nullifier" can process', async () => {
      const note = createNote();
      const wrongPreimageLength = note.length - 1;

      const modifiedArtifact: FunctionArtifactWithDebugMetadata = {
        ...artifact,
        parameters: [
          ...artifact.parameters.slice(0, -1),
          {
            name: 'note',
            type: {
              kind: 'array',
              length: wrongPreimageLength,
              type: {
                kind: 'field',
              },
            },
            visibility: ABIParameterVisibility.SECRET,
          },
        ],
      };
      oracle.getFunctionArtifactByName.mockResolvedValue(modifiedArtifact);

      await expect(
        simulator.computeNoteHashAndNullifier(contractAddress, nonce, storageSlot, noteTypeId, note),
      ).rejects.toThrow(
        new RegExp(`"compute_note_hash_and_nullifier" can only handle a maximum of ${wrongPreimageLength} fields`),
      );
    });
  });
});
