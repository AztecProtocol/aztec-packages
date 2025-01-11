import { type AztecNode, CompleteAddress, Note } from '@aztec/circuit-types';
import { KeyValidationRequest, computeAppNullifierSecretKey, deriveKeys } from '@aztec/circuits.js';
import { type FunctionArtifact, getFunctionArtifact } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr, type Point } from '@aztec/foundation/fields';
import { TokenBlacklistContractArtifact } from '@aztec/noir-contracts.js/TokenBlacklist';

import { type MockProxy, mock } from 'jest-mock-extended';

import { WASMSimulator } from '../providers/acvm_wasm.js';
import { type DBOracle } from './db_oracle.js';
import { AcirSimulator } from './simulator.js';

describe('Simulator', () => {
  const simulationProvider = new WASMSimulator();

  let oracle: MockProxy<DBOracle>;
  let node: MockProxy<AztecNode>;

  let simulator: AcirSimulator;
  let ownerMasterNullifierPublicKey: Point;
  let contractAddress: AztecAddress;
  let appNullifierSecretKey: Fr;

  beforeEach(() => {
    const ownerSk = Fr.fromHexString('2dcc5485a58316776299be08c78fa3788a1a7961ae30dc747fb1be17692a8d32');
    const allOwnerKeys = deriveKeys(ownerSk);

    ownerMasterNullifierPublicKey = allOwnerKeys.publicKeys.masterNullifierPublicKey;
    const ownerMasterNullifierSecretKey = allOwnerKeys.masterNullifierSecretKey;

    contractAddress = AztecAddress.random();

    const ownerPartialAddress = Fr.random();
    const ownerCompleteAddress = CompleteAddress.fromSecretKeyAndPartialAddress(ownerSk, ownerPartialAddress);

    appNullifierSecretKey = computeAppNullifierSecretKey(ownerMasterNullifierSecretKey, contractAddress);

    oracle = mock<DBOracle>();
    node = mock<AztecNode>();
    oracle.getKeyValidationRequest.mockResolvedValue(
      new KeyValidationRequest(ownerMasterNullifierPublicKey, appNullifierSecretKey),
    );
    oracle.getCompleteAddress.mockResolvedValue(ownerCompleteAddress);

    simulator = new AcirSimulator(oracle, node, simulationProvider);
  });

  describe('computeNoteHashAndOptionallyANullifier', () => {
    const artifact = getFunctionArtifact(
      TokenBlacklistContractArtifact,
      'compute_note_hash_and_optionally_a_nullifier',
    );
    const nonce = Fr.random();
    const storageSlot = TokenBlacklistContractArtifact.storageLayout['balances'].slot;
    const noteTypeId = TokenBlacklistContractArtifact.notes['TokenNote'].id;

    // Amount is a U128, with a lo and hi limbs
    const createNote = (amount = 123n) =>
      new Note([new Fr(amount), new Fr(0), ownerMasterNullifierPublicKey.hash(), Fr.random()]);

    it('throw if the contract does not implement "compute_note_hash_and_optionally_a_nullifier"', async () => {
      oracle.getFunctionArtifactByName.mockResolvedValue(undefined);

      const note = createNote();
      await expect(
        simulator.computeNoteHashAndOptionallyANullifier(contractAddress, nonce, storageSlot, noteTypeId, true, note),
      ).rejects.toThrow(/Mandatory implementation of "compute_note_hash_and_optionally_a_nullifier" missing/);
    });

    it('throw if "compute_note_hash_and_optionally_a_nullifier" has the wrong number of parameters', async () => {
      const note = createNote();

      const modifiedArtifact: FunctionArtifact = {
        ...artifact,
        parameters: artifact.parameters.slice(1),
      };
      oracle.getFunctionArtifactByName.mockResolvedValue(modifiedArtifact);

      await expect(
        simulator.computeNoteHashAndOptionallyANullifier(contractAddress, nonce, storageSlot, noteTypeId, true, note),
      ).rejects.toThrow(
        new RegExp(
          `Expected 6 parameters in mandatory implementation of "compute_note_hash_and_optionally_a_nullifier", but found 5 in noir contract ${contractAddress}.`,
        ),
      );
    });

    it('throw if a note has more fields than "compute_note_hash_and_optionally_a_nullifier" can process', async () => {
      const note = createNote();
      const wrongPreimageLength = note.length - 1;

      const modifiedArtifact: FunctionArtifact = {
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
            visibility: 'private',
          },
        ],
      };
      oracle.getFunctionArtifactByName.mockResolvedValue(modifiedArtifact);

      await expect(
        simulator.computeNoteHashAndOptionallyANullifier(contractAddress, nonce, storageSlot, noteTypeId, true, note),
      ).rejects.toThrow(
        new RegExp(
          `"compute_note_hash_and_optionally_a_nullifier" can only handle a maximum of ${wrongPreimageLength} fields`,
        ),
      );
    });
  });
});
