import {
  Fr,
  createLogger,
  deriveMasterIncomingViewingSecretKey,
} from "@aztec/aztec.js";
import { BoxReactContractArtifact } from "../artifacts/BoxReact";
import { AccountManager } from "@aztec/aztec.js/account";
import { SchnorrAccountContract } from "@aztec/accounts/schnorr";
import { createAztecNodeClient } from "@aztec/aztec.js";
import { PXEService } from "@aztec/pxe/service";
import { PXEServiceConfig, getPXEServiceConfig } from "@aztec/pxe/config";
import { KVPxeDatabase } from "@aztec/pxe/database";
import { KeyStore } from "@aztec/key-store";
import { L2TipsStore } from "@aztec/kv-store/stores";
import { createStore } from "@aztec/kv-store/indexeddb";
import { BBWASMLazyPrivateKernelProver } from "@aztec/bb-prover/wasm/lazy";
import { WASMSimulator } from "@aztec/simulator/client";

process.env = Object.keys(import.meta.env).reduce((acc, key) => {
  acc[key.replace("VITE_", "")] = import.meta.env[key];
  return acc;
}, {});

const SECRET_KEY = Fr.random();

export class PrivateEnv {
  pxe;
  accountContract;
  account: AccountManager;

  constructor(
    private secretKey: Fr,
    private nodeURL: string,
  ) {}

  async init() {
    const config = getPXEServiceConfig();
    config.dataDirectory = "pxe";
    config.proverEnabled = true;
    const aztecNode = await createAztecNodeClient(this.nodeURL);
    const simulationProvider = new WASMSimulator();
    const proofCreator = new BBWASMLazyPrivateKernelProver(
      simulationProvider,
      16,
    );
    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const configWithContracts = {
      ...config,
      l1Contracts,
    } as PXEServiceConfig;

    const store = await createStore(
      "pxe_data",
      configWithContracts,
      createLogger("pxe:data:indexeddb"),
    );

    const keyStore = new KeyStore(store);

    const db = await KVPxeDatabase.create(store);
    const tips = new L2TipsStore(store, "pxe");

    this.pxe = new PXEService(
      keyStore,
      aztecNode,
      db,
      tips,
      proofCreator,
      simulationProvider,
      config,
    );
    await this.pxe.init();
    const encryptionPrivateKey = deriveMasterIncomingViewingSecretKey(
      this.secretKey,
    );
    this.accountContract = new SchnorrAccountContract(encryptionPrivateKey);
    this.account = new AccountManager(
      this.pxe,
      this.secretKey,
      this.accountContract,
    );
    await this.account.deploy().wait();
  }

  async getWallet() {
    return await this.account.register();
  }
}

export const deployerEnv = new PrivateEnv(
  SECRET_KEY,
  process.env.AZTEC_NODE_URL,
);

const IGNORE_FUNCTIONS = [
  "constructor",
  "compute_note_hash_and_optionally_a_nullifier",
  "sync_notes",
];
export const filteredInterface = BoxReactContractArtifact.functions.filter(
  (f) => !IGNORE_FUNCTIONS.includes(f.name),
);
