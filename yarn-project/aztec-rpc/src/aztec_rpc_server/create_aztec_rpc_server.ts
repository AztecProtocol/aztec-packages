import { AztecNode } from '@aztec/aztec-node';
import { AcirSimulator } from '../acir_simulator.js';
import { EthAddress, KernelCircuitProver } from '../circuits.js';
import { MemoryDB } from '../database/index.js';
import { KeyStore, TestKeyStore } from '../key_store/index.js';
import { ProofGenerator } from '../proof_generator/index.js';
import { Synchroniser } from '../synchroniser/index.js';
import { AztecRPCServer } from './aztec_rpc_server.js';

export async function createAztecRPCServer({
  keyStore,
  node,
  db,
  synchroniser,
  simulator,
  proofGenerator,
  ethRpcUrl,
  rollupAddress,
  yeeterAddress,
}: {
  keyStore?: KeyStore;
  node?: AztecNode;
  db?: MemoryDB;
  synchroniser?: Synchroniser;
  simulator?: AcirSimulator;
  proofGenerator?: ProofGenerator;
  ethRpcUrl?: string;
  rollupAddress?: EthAddress;
  yeeterAddress?: EthAddress;
} = {}) {
  keyStore = keyStore || new TestKeyStore();
  if (!node) {
    if (!ethRpcUrl) {
      throw new Error('`ethRpcUrl` undefined.');
    }
    if (!rollupAddress) {
      throw new Error('`rollupAddress` undefined.');
    }
    if (!yeeterAddress) {
      throw new Error('`yeeterAddress` undefined.');
    }
    node = new AztecNode();
    await node.init(ethRpcUrl, rollupAddress as any, yeeterAddress as any);
  }
  db = db || new MemoryDB();
  synchroniser = synchroniser || new Synchroniser(node, db);
  simulator = simulator || new AcirSimulator();
  proofGenerator = proofGenerator || new ProofGenerator(new KernelCircuitProver());

  return new AztecRPCServer(keyStore, synchroniser, simulator, proofGenerator, node, db);
}
