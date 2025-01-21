import { TxHash, TxReceipt, TxStatus, AztecAddress } from "@aztec/aztec.js";

export type ContractFunctionInteractionTx = {
  txHash?: TxHash;
  receipt?: TxReceipt;
  date?: number;
  status: "error" | "simulating" | "proving" | "sending" | TxStatus;
  fnName: string;
  contractAddress: AztecAddress;
};
