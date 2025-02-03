import { css } from "@emotion/react";
import { useContext, useEffect, useState } from "react";
import { AztecContext } from "../../../aztecEnv";
import { Typography } from "@mui/material";
import {
  convertFromUTF8BufferAsString,
  formatFrAsString,
} from "../../../utils/conversion";
import { ContractFunctionInteractionTx } from "../../../utils/txs";
import { TxHash } from "@aztec/aztec.js";

const txPanel = css({
  width: "100%",
  backgroundColor: "var(--mui-palette-primary-main)",
  maxHeight: "30vh",
  overflowY: "auto",
  borderRadius: "0.5rem",
});

const txData = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "0.5rem",
  backgroundColor: "var(--mui-palette-primary-light)",
  borderRadius: "0.5rem",
  margin: "0.5rem",
});

export function TxsPanel() {
  const [transactions, setTransactions] = useState([]);

  const { currentTx, currentContractAddress, walletDB } =
    useContext(AztecContext);

  useEffect(() => {
    const refreshTransactions = async () => {
      const txsPerContract = await walletDB.retrieveTxsPerContract(
        currentContractAddress
      );
      const txHashes = txsPerContract.map((txHash) =>
        TxHash.fromString(convertFromUTF8BufferAsString(txHash))
      );
      const txs: ContractFunctionInteractionTx[] = await Promise.all(
        txHashes.map(async (txHash) => {
          const txData = await walletDB.retrieveTxData(txHash);
          return {
            contractAddress: currentContractAddress,
            txHash: txData.txHash,
            status: convertFromUTF8BufferAsString(txData.status),
            fnName: convertFromUTF8BufferAsString(txData.fnName),
            date: parseInt(convertFromUTF8BufferAsString(txData.date)),
          } as ContractFunctionInteractionTx;
        })
      );
      txs.sort((a, b) => (b.date >= a.date ? -1 : 1));
      if (
        currentTx &&
        currentTx.contractAddress === currentContractAddress &&
        (!currentTx.txHash ||
          !txs.find((tx) => tx.txHash.equals(currentTx.txHash)))
      ) {
        txs.unshift(currentTx);
      }
      setTransactions(txs);
    };
    if (currentContractAddress && walletDB) {
      refreshTransactions();
    } else {
      setTransactions([]);
    }
  }, [currentContractAddress, currentTx]);

  return (
    <div css={txPanel}>
      {transactions.map((tx) => (
        <div css={txData} key={tx.txHash ?? ""}>
          <div css={{ display: "flex" }}>
            <Typography variant="body2">
              {tx.txHash ? formatFrAsString(tx.txHash.toString()) : "()"}
              &nbsp;-&nbsp;
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {tx.receipt
                ? tx.receipt.status.toUpperCase()
                : tx.status.toUpperCase()}
              &nbsp;
              {tx.receipt && tx.receipt.status === "error"
                ? tx.receipt.error
                : tx.error}
            </Typography>
          </div>
          <Typography variant="body2">
            {tx.fnName}@{formatFrAsString(tx.contractAddress.toString())}
          </Typography>
        </div>
      ))}
    </div>
  );
}
