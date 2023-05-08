import { AztecNode } from '@aztec/aztec-node';
import { Ecdsa, Grumpkin, Secp256k1 } from '@aztec/barretenberg.js/crypto';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { KERNEL_NEW_COMMITMENTS_LENGTH } from '@aztec/circuits.js';
import { Point } from '@aztec/foundation/fields';
import { ConstantKeyPair, KeyPair } from '@aztec/key-store/grumpkin';
import { ConstantSecp256k1KeyPair, Secp256k1KeyPair } from '@aztec/key-store/secp256k1';
import { L2Block, L2BlockContext, UnverifiedData } from '@aztec/types';
import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';
import { TxAuxData } from '../aztec_rpc_server/tx_aux_data/index.js';
import { Database, MemoryDB } from '../database/index.js';
import { AccountState } from './account_state.js';

describe('Account State', () => {
  let grumpkin: Grumpkin;
  let secp256k1: Secp256k1;
  let ecdsa: Ecdsa;
  let database: Database;
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let addTxAuxDataBatchSpy: any;
  let accountState: AccountState;
  let owner: KeyPair;
  let ethOwner: Secp256k1KeyPair;

  const createUnverifiedDataAndOwnedTxAuxData = async (ownedDataIndices: number[] = []) => {
    ownedDataIndices.forEach(index => {
      if (index >= KERNEL_NEW_COMMITMENTS_LENGTH) {
        throw new Error(`Data index should be less than ${KERNEL_NEW_COMMITMENTS_LENGTH}.`);
      }
    });

    const dataChunks: Buffer[] = [];
    const ownedTxAuxData: TxAuxData[] = [];
    for (let i = 0; i < KERNEL_NEW_COMMITMENTS_LENGTH; ++i) {
      const txAuxData = TxAuxData.random();
      const isOwner = ownedDataIndices.includes(i);
      const privKey = await ethOwner.getPrivateKey();
      const ownerGrumpkinPublicKey = Point.fromBuffer(grumpkin.mul(Grumpkin.generator, privKey));
      const publicKey = isOwner ? ownerGrumpkinPublicKey : Point.random();
      dataChunks.push(txAuxData.toEncryptedBuffer(publicKey, grumpkin));
      if (isOwner) {
        ownedTxAuxData.push(txAuxData);
      }
    }
    const unverifiedData = new UnverifiedData(dataChunks);
    return { unverifiedData, ownedTxAuxData };
  };

  const mockData = async (firstBlockNum: number, ownedData: number[][]) => {
    const blockContexts: L2BlockContext[] = [];
    const unverifiedDatas: UnverifiedData[] = [];
    const ownedTxAuxDatas: TxAuxData[] = [];
    for (let i = 0; i < ownedData.length; ++i) {
      const randomBlockContext = new L2BlockContext(L2Block.random(firstBlockNum + i));
      blockContexts.push(randomBlockContext);
      const { unverifiedData, ownedTxAuxData } = await createUnverifiedDataAndOwnedTxAuxData(ownedData[i]);
      unverifiedDatas.push(unverifiedData);
      ownedTxAuxDatas.push(...ownedTxAuxData);
    }
    return { blockContexts, unverifiedDatas, ownedTxAuxDatas };
  };

  beforeAll(async () => {
    const wasm = await BarretenbergWasm.get();
    grumpkin = new Grumpkin(wasm);
    secp256k1 = new Secp256k1(wasm);
    owner = ConstantKeyPair.random(grumpkin);
    ethOwner = ConstantSecp256k1KeyPair.random(secp256k1, ecdsa);
  });

  beforeEach(async () => {
    database = new MemoryDB();
    addTxAuxDataBatchSpy = jest.spyOn(database, 'addTxAuxDataBatch');

    const ownerPrivateKey = await ethOwner.getPrivateKey();
    aztecNode = mock<AztecNode>();
    accountState = new AccountState(ownerPrivateKey, database, aztecNode, grumpkin, secp256k1, ecdsa);
  });

  afterEach(() => {
    addTxAuxDataBatchSpy.mockReset();
  });

  it('should store a tx that belong to us', async () => {
    const firstBlockNum = 1;
    const { blockContexts, unverifiedDatas, ownedTxAuxDatas } = await mockData(firstBlockNum, [[2]]);
    await accountState.process(blockContexts, unverifiedDatas);

    const txs = await accountState.getTxs();
    expect(txs).toEqual([
      expect.objectContaining({
        blockNumber: 1,
        from: ethOwner.getPublicKey().toAztecAddress(),
      }),
    ]);
    expect(addTxAuxDataBatchSpy).toHaveBeenCalledTimes(1);
    expect(addTxAuxDataBatchSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        ...ownedTxAuxDatas[0],
        index: 2n,
      }),
    ]);
  });

  it('should store multiple txs that belong to us', async () => {
    const firstBlockNum = 1;
    const { blockContexts, unverifiedDatas, ownedTxAuxDatas } = await mockData(firstBlockNum, [
      [],
      [1],
      [],
      [],
      [0, 2],
      [],
    ]);
    await accountState.process(blockContexts, unverifiedDatas);

    const txs = await accountState.getTxs();
    expect(txs).toEqual([
      expect.objectContaining({
        blockNumber: 2,
        from: ethOwner.getPublicKey().toAztecAddress(),
      }),
      expect.objectContaining({
        blockNumber: 5,
        from: ethOwner.getPublicKey().toAztecAddress(),
      }),
    ]);
    expect(addTxAuxDataBatchSpy).toHaveBeenCalledTimes(1);
    expect(addTxAuxDataBatchSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        ...ownedTxAuxDatas[0],
        index: BigInt(KERNEL_NEW_COMMITMENTS_LENGTH + 1),
      }),
      expect.objectContaining({
        ...ownedTxAuxDatas[1],
        index: BigInt(KERNEL_NEW_COMMITMENTS_LENGTH * 4),
      }),
      expect.objectContaining({
        ...ownedTxAuxDatas[2],
        index: BigInt(KERNEL_NEW_COMMITMENTS_LENGTH * 4 + 2),
      }),
    ]);
  });

  it('should not store txs that do not belong to us', async () => {
    const firstBlockNum = 1;
    const { blockContexts, unverifiedDatas } = await mockData(firstBlockNum, [[], []]);
    await accountState.process(blockContexts, unverifiedDatas);

    const txs = await accountState.getTxs();
    expect(txs).toEqual([]);
    expect(addTxAuxDataBatchSpy).toHaveBeenCalledTimes(0);
  });

  it('should throw an error if invalid privKey is passed on input', () => {
    const ownerPrivateKey = Buffer.alloc(0);
    expect(() => new AccountState(ownerPrivateKey, database, aztecNode, grumpkin, secp256k1, ecdsa)).toThrowError();
  });
});
