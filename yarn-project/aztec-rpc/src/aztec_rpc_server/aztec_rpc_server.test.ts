import { AztecAddress, CompleteAddress, Fr, Point, PrivateKey } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { ConstantKeyPair, TestKeyStore } from '@aztec/key-store';
import { AztecNode } from '@aztec/types';

import { MockProxy, mock } from 'jest-mock-extended';

import { MemoryDB } from '../database/memory_db.js';
import { RpcServerConfig } from '../index.js';
import { AztecRPCServer } from './aztec_rpc_server.js';

describe('AztecRpcServer', function () {
  let keyStore: TestKeyStore;
  let db: MemoryDB;
  let node: MockProxy<AztecNode>;
  let rpcServer: AztecRPCServer;

  beforeEach(async () => {
    keyStore = new TestKeyStore(await Grumpkin.new());
    node = mock<AztecNode>();
    db = new MemoryDB();
    const config: RpcServerConfig = {
      l2BlockPollingIntervalMS: 100,
    };
    rpcServer = new AztecRPCServer(keyStore, node, db, config);
  });

  it('registers a public key in the db when adding a new account', async () => {
    const keyPair = ConstantKeyPair.random(await Grumpkin.new());
    const completeAddress = await CompleteAddress.fromPrivateKey(await keyPair.getPrivateKey());

    await rpcServer.addAccount(await keyPair.getPrivateKey(), completeAddress);
    expect(await db.getRecipient(completeAddress.address)).toEqual(completeAddress);
  });

  it('refuses to add an account with incorrect address for given partial address and privkey', async () => {
    const privateKey = PrivateKey.random();
    const completeAddress = new CompleteAddress(AztecAddress.random(), Point.random(), Fr.random());

    await expect(rpcServer.addAccount(privateKey, completeAddress)).rejects.toThrowError(/cannot be derived/);
  });

  it('refuses to add an account with incorrect address for given partial address and pubkey', async () => {
    const completeAddress = new CompleteAddress(AztecAddress.random(), Point.random(), Fr.random());

    await expect(rpcServer.addRecipient(completeAddress)).rejects.toThrowError(/cannot be derived/);
  });

  it('cannot add the same account twice', async () => {
    const keyPair = ConstantKeyPair.random(await Grumpkin.new());
    const completeAddress = await CompleteAddress.fromPrivateKey(await keyPair.getPrivateKey());

    await rpcServer.addAccount(await keyPair.getPrivateKey(), completeAddress);
    await expect(async () => rpcServer.addAccount(await keyPair.getPrivateKey(), completeAddress)).rejects.toThrow(
      `Account ${completeAddress.address} already exists`,
    );
  });

  it('throws when getting public storage for non-existent contract', async () => {
    const contract = AztecAddress.random();
    await expect(async () => await rpcServer.getPublicStorageAt(contract, new Fr(0n))).rejects.toThrow(
      `Contract ${contract.toString()} is not deployed`,
    );
  });
});
