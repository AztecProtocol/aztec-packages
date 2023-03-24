import { AcirSimulator } from '@aztec/acir-simulator';
import { AztecNode } from '@aztec/aztec-node';
import { KernelProver } from '@aztec/kernel-simulator';
import { EthAddress } from '../circuits.js';
import { MemoryDB } from '../database/index.js';
import { KeyStore, TestKeyStore } from '../key_store/index.js';
import { Synchroniser } from '../synchroniser/index.js';
import { AztecRPCServer } from './aztec_rpc_server.js';

export async function createAztecRPCServer({
  keyStore,
  node,
  db,
  synchroniser,
  acirSimulator,
  kernelProver,
  rpcUrl,
  rollupAddress,
  yeeterAddress,
}: {
  keyStore?: KeyStore;
  node?: AztecNode;
  db?: MemoryDB;
  synchroniser?: Synchroniser;
  acirSimulator?: AcirSimulator;
  kernelProver?: KernelProver;
  rpcUrl?: string;
  rollupAddress?: EthAddress;
  yeeterAddress?: EthAddress;
} = {}) {
  keyStore = keyStore || new TestKeyStore();
  if (!node) {
    if (!rpcUrl) {
      throw new Error('`rpcUrl` undefined.');
    }
    if (!rollupAddress) {
      throw new Error('`rollupAddress` undefined.');
    }
    if (!yeeterAddress) {
      throw new Error('`yeeterAddress` undefined.');
    }
    node = new AztecNode();
    await node.init(rpcUrl!, rollupAddress! as any, yeeterAddress! as any);
  }
  db = db || new MemoryDB();
  synchroniser = synchroniser || new Synchroniser(node, db);
  acirSimulator = acirSimulator || new AcirSimulator();
  kernelProver = kernelProver || new KernelProver();

  return new AztecRPCServer(keyStore, synchroniser, acirSimulator, kernelProver, node, db);
}
