import {
  AztecNode,
  Fr,
  createDebugLogger,
  deriveMasterIncomingViewingSecretKey,
} from "@aztec/aztec.js";
import { BoxReactContractArtifact } from "../artifacts/BoxReact";
import { AccountManager } from "@aztec/aztec.js/account";
import { SingleKeyAccountContract } from "@aztec/accounts/single_key";
import { createAztecNodeClient } from "@aztec/aztec.js";
import { PXEService } from "@aztec/pxe/service";
import { PXEServiceConfig, getPXEServiceConfig } from "@aztec/pxe/config";
import { KVPxeDatabase } from "@aztec/pxe/database";
import { KeyStore } from "@aztec/key-store";
import { PrivateKernelProver } from "@aztec/circuit-types";
import { L2TipsStore } from "@aztec/kv-store/stores";
import { createStore } from "@aztec/kv-store/indexeddb";

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
    const aztecNode = await createAztecNodeClient(this.nodeURL);
    this.pxe = await this.createPXEService(aztecNode, config);
    const encryptionPrivateKey = deriveMasterIncomingViewingSecretKey(
      this.secretKey,
    );
    this.accountContract = new SingleKeyAccountContract(encryptionPrivateKey);
    this.account = new AccountManager(
      this.pxe,
      this.secretKey,
      this.accountContract,
    );
  }

  async createPXEService(
    aztecNode: AztecNode,
    config: PXEServiceConfig,
    proofCreator?: PrivateKernelProver,
  ) {
    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const configWithContracts = {
      ...config,
      l1Contracts,
    } as PXEServiceConfig;

    const store = await createStore(
      "pxe_data",
      configWithContracts,
      createDebugLogger("aztec:pxe:data:indexeddb"),
    );

    const keyStore = new KeyStore(store);

    const db = await KVPxeDatabase.create(store);
    const tips = new L2TipsStore(store, "pxe");

    const server = new PXEService(
      keyStore,
      aztecNode,
      db,
      tips,
      proofCreator,
      config,
    );
    await server.start();
    return server;
  }

  async getWallet() {
    // taking advantage that register is no-op if already registered
    return await this.account.register();
  }
}

export const deployerEnv = new PrivateEnv(
  SECRET_KEY,
  process.env.PXE_URL || "http://localhost:8080",
);

const IGNORE_FUNCTIONS = [
  "constructor",
  "compute_note_hash_and_optionally_a_nullifier",
];
export const filteredInterface = BoxReactContractArtifact.functions.filter(
  (f) => !IGNORE_FUNCTIONS.includes(f.name),
);
