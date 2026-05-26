import { PRIVATE_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { CONTRACT_INSTANCE_PUBLISHED_EVENT_TAG } from '@aztec/protocol-contracts';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeContractAddressFromInstance } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';
import { PrivateLog } from '@aztec/stdlib/logs';
import { mockTxForRollup } from '@aztec/stdlib/testing';
import {
  TX_ERROR_INCORRECT_CONTRACT_ADDRESS,
  TX_ERROR_MALFORMED_CONTRACT_INSTANCE_LOG,
  type Tx,
} from '@aztec/stdlib/tx';

import { ContractInstanceTxValidator } from './contract_instance_validator.js';

describe('ContractInstanceTxValidator', () => {
  let validator: ContractInstanceTxValidator;

  beforeEach(() => {
    validator = new ContractInstanceTxValidator();
  });

  const expectValid = async (tx: Tx) => {
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
  };

  const expectInvalid = async (tx: Tx, reason: string) => {
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'invalid', reason: [reason] });
  };

  /**
   * Builds a PrivateLog encoding a ContractInstancePublishedEvent.
   * Layout: [tag, address, version, salt, contractClassId, initializationHash, immutablesHash, ...publicKeys(5 fields), deployer]
   */
  async function buildContractInstanceLog(opts?: { address?: AztecAddress }): Promise<PrivateLog> {
    const salt = Fr.random();
    const contractClassId = Fr.random();
    const initializationHash = Fr.random();
    const publicKeys = await PublicKeys.random();
    const deployer = await AztecAddress.random();
    const immutablesHash = Fr.random();

    const instance = {
      version: 2 as const,
      salt,
      currentContractClassId: contractClassId,
      originalContractClassId: contractClassId,
      initializationHash,
      immutablesHash,
      publicKeys,
      deployer,
    };

    const correctAddress = await computeContractAddressFromInstance(instance);
    const address = opts?.address ?? correctAddress;

    // Serialize the event into fields matching the format expected by ContractInstancePublishedEvent.fromLog.
    // fromLog reads from a buffer:
    //   [tag(32) | address(32) | version(32) | salt(32) | classId(32) | initHash(32) | publicKeys(160) | deployer(32)]
    // where publicKeys = npkMHash(32) + ivpkM(64 = x|y, no is_infinite) + ovpkMHash(32) + tpkMHash(32) = 5 Fr fields.
    const publicKeysBuffer = publicKeys.toBuffer();
    const publicKeysFields: Fr[] = [];
    for (let i = 0; i < publicKeysBuffer.length; i += 32) {
      publicKeysFields.push(Fr.fromBuffer(publicKeysBuffer.subarray(i, i + 32)));
    }

    const emittedFields: Fr[] = [
      CONTRACT_INSTANCE_PUBLISHED_EVENT_TAG,
      address.toField(),
      new Fr(2), // version
      salt,
      contractClassId,
      initializationHash,
      immutablesHash,
      ...publicKeysFields,
      deployer.toField(),
    ];
    const emittedLength = emittedFields.length;

    const fields = padArrayEnd(emittedFields, Fr.ZERO, PRIVATE_LOG_SIZE_IN_FIELDS);
    return new PrivateLog(fields as any, emittedLength);
  }

  function injectPrivateLog(tx: Tx, log: PrivateLog) {
    // For a rollup-only tx, private logs live in forRollup.end.privateLogs
    const privateLogs = tx.data.forRollup!.end.privateLogs;
    const emptyIdx = privateLogs.findIndex(l => l.isEmpty());
    if (emptyIdx >= 0) {
      privateLogs[emptyIdx] = log;
    } else {
      throw new Error('No empty private log slot available in mock tx');
    }
  }

  it('allows transactions with no contract instance logs', async () => {
    const tx = await mockTxForRollup(1);
    await expectValid(tx);
  });

  it('allows transactions with correct contract instance addresses', async () => {
    const tx = await mockTxForRollup(2);
    const log = await buildContractInstanceLog();
    injectPrivateLog(tx, log);
    await expectValid(tx);
  });

  it('rejects transactions with incorrect contract instance addresses', async () => {
    const tx = await mockTxForRollup(3);
    const wrongAddress = await AztecAddress.random();
    const log = await buildContractInstanceLog({ address: wrongAddress });
    injectPrivateLog(tx, log);
    await expectInvalid(tx, TX_ERROR_INCORRECT_CONTRACT_ADDRESS);
  });

  it('rejects transactions with malformed contract instance logs', async () => {
    const tx = await mockTxForRollup(4);
    // Create a log that has the right tag but garbage data
    const fields = padArrayEnd([CONTRACT_INSTANCE_PUBLISHED_EVENT_TAG], Fr.ZERO, PRIVATE_LOG_SIZE_IN_FIELDS);
    const malformedLog = new PrivateLog(fields as any, 1);
    injectPrivateLog(tx, malformedLog);
    await expectInvalid(tx, TX_ERROR_MALFORMED_CONTRACT_INSTANCE_LOG);
  });
});
