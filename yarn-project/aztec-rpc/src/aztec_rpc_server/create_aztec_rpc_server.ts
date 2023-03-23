import { AcirSimulator } from '../acir_simulator.js';
import { AztecNode } from '../aztec_node.js';
import { KernelCircuitProver } from '../circuits.js';
import { MemoryDB } from '../database/index.js';
import { KeyStore, TestKeyStore } from '../key_store/index.js';
import { ProofGenerator } from '../proof_generator/index.js';
import { Synchroniser } from '../synchroniser/index.js';
import { AztecRPCServer } from './aztec_rpc_server.js';

export function createAztecRPCServer({
  keyStore,
  node,
  db,
  synchroniser,
  simulator,
  proofGenerator,
}: {
  keyStore?: KeyStore;
  node?: AztecNode;
  db?: MemoryDB;
  synchroniser?: Synchroniser;
  simulator?: AcirSimulator;
  proofGenerator?: ProofGenerator;
} = {}) {
  keyStore = keyStore || new TestKeyStore();
  node = node || new AztecNode();
  db = db || new MemoryDB();
  synchroniser = synchroniser || new Synchroniser(node, db);
  simulator = simulator || new AcirSimulator();
  proofGenerator = proofGenerator || new ProofGenerator(new KernelCircuitProver());

  return Promise.resolve(new AztecRPCServer(keyStore, synchroniser, simulator, proofGenerator, node, db));
}
