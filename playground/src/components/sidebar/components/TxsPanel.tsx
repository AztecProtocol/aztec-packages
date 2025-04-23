import { css } from '@mui/styled-engine';
import { useContext, useEffect, useState } from 'react';
import { AztecContext } from '../../../aztecEnv';
import Typography from '@mui/material/Typography';
import { convertFromUTF8BufferAsString, formatFrAsString } from '../../../utils/conversion';
import { type UserTx } from '../../../utils/txs';
import { TxHash } from '@aztec/aztec.js';
import Divider from '@mui/material/Divider';
import { BLOCK_EXPLORER_TX_URL } from '../../../constants';

const txPanel = css({
  width: '100%',
  backgroundColor: 'var(--mui-palette-primary-main)',
  maxHeight: '30vh',
  overflowY: 'auto',
  borderRadius: '0.5rem',
});

const txData = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '0.5rem',
  backgroundColor: 'var(--mui-palette-primary-light)',
  color: 'var(--mui-palette-text-primary)',
  borderRadius: '0.5rem',
  margin: '0.5rem',
  cursor: 'pointer',
  textDecoration: 'none',
  '&:hover': {
    textDecoration: 'none',
    color: 'var(--mui-palette-text-primary)',
  },
});

export function TxsPanel({ ...props }) {
  const [transactions, setTransactions] = useState([]);

  console.log(transactions)

  const { currentTx, currentContractAddress, walletDB, transactionModalStatus } = useContext(AztecContext);

  useEffect(() => {
    const refreshTransactions = async () => {
      const txsPerContract = await walletDB.retrieveTxsPerContract(currentContractAddress);
      const txHashes = txsPerContract.map(txHash => TxHash.fromString(convertFromUTF8BufferAsString(txHash)));
      const txs: UserTx[] = await Promise.all(
        txHashes.map(async txHash => {
          const txData = await walletDB.retrieveTxData(txHash);
          return {
            contractAddress: currentContractAddress,
            txHash: txData.txHash,
            status: convertFromUTF8BufferAsString(txData.status),
            name: convertFromUTF8BufferAsString(txData.name),
            date: parseInt(convertFromUTF8BufferAsString(txData.date)),
          } as UserTx;
        }),
      );
      txs.sort((a, b) => (b.date >= a.date ? -1 : 1));
      if (
        currentTx &&
        currentTx.contractAddress === currentContractAddress &&
        (!currentTx.txHash || !txs.find(tx => tx.txHash.equals(currentTx.txHash)))
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
  }, [currentContractAddress, currentTx, transactionModalStatus]);

  return (
    <>
      {currentContractAddress && (
        <>
          <Typography variant="overline">Transactions</Typography>
          <Divider sx={{ marginBottom: '0.5rem' }} />
          <div css={[txPanel, transactions.length > 0 && { minHeight: '75px' }]} {...props}>
            {transactions.map(tx => (
              <a
                css={txData}
                key={tx.txHash ?? ''}
                href={`${BLOCK_EXPLORER_TX_URL}/${tx.txHash}`}
                target="_blank"
              >
                <div css={{ display: 'flex' }}>
                  <Typography variant="body2">
                    {tx.txHash ? formatFrAsString(tx.txHash.toString()) : '()'}
                    &nbsp;-&nbsp;
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    {tx.receipt ? tx.receipt.status.toUpperCase() : tx.status.toUpperCase()}
                    &nbsp;
                    {tx.receipt && tx.receipt.status === 'error' ? tx.receipt.error : tx.error}
                  </Typography>
                </div>
                <Typography variant="body2">
                  {tx.name}@{formatFrAsString(tx.contractAddress.toString())}
                </Typography>
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
