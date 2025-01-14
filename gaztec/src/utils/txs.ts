import { TxHash, TxReceipt, TxStatus } from "@aztec/circuit-types";
import { AztecAddress } from "@aztec/circuits.js";

export type ContractFunctionInteractionTx = {
  txHash?: TxHash;
  receipt?: TxReceipt;
  status: "error" | "simulating" | "proving" | "sending" | TxStatus;
  fnName: string;
  contractAddress: AztecAddress;
};
