import { css } from '@mui/styled-engine';
import { useContext, useEffect, useState } from 'react';
import { AztecContext } from '../../../aztecEnv';
import Typography from '@mui/material/Typography';
import { convertFromUTF8BufferAsString, formatFrAsString } from '../../../utils/conversion';
import { type UserTx } from '../../../utils/txs';
import { TxHash } from '@aztec/aztec.js';
import { BLOCK_EXPLORER_TX_URL } from '../../../constants';
import LaunchIcon from '@mui/icons-material/Launch';

const txData = css({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  padding: '12px 16px',
  backgroundColor: 'var(--mui-palette-primary-light)',
  color: 'var(--mui-palette-text-primary)',
  borderRadius: '6px',
  cursor: 'pointer',
  textDecoration: 'none',
  '&:hover': {
    textDecoration: 'none',
    backgroundColor: 'var(--mui-palette-grey-400)',
    color: 'var(--mui-palette-text-primary)',
  },
});

const launchIcon = css({
  position: 'absolute',
  right: '10px',
  top: '10px',
  fontSize: '16px',
  visibility: 'hidden',
  'a:hover &': {
    visibility: 'visible',
  },
});

export function TxsPanel({ ...props }) {
  const [transactions, setTransactions] = useState([]);

  const { currentTx, currentContractAddress, walletDB } = useContext(AztecContext);

  useEffect(() => {
    const refreshTransactions = async () => {
      const txsPerContract = await walletDB.retrieveAllTx();
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

    if (walletDB) {
      refreshTransactions();
    } else {
      setTransactions([]);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [currentTx, walletDB]);

  return (
    <>
      <div css={[transactions.length > 0 && { minHeight: '75px' }]} {...props}>
        {transactions.map(tx => (
          <a
            css={txData}
            key={tx.txHash ?? ''}
            href={`${BLOCK_EXPLORER_TX_URL}/${tx.txHash}`}
            target="_blank"
          >
            <LaunchIcon css={launchIcon} />
            <Typography variant="overline">
              {tx.name}
            </Typography>
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
            {tx.contractAddress && (
              <Typography variant="body2">
                sss
                {tx.name}@{formatFrAsString(tx.contractAddress.toString())}
              </Typography>
            )}
          </a>
        ))}
      </div>
    </>
  );
}
