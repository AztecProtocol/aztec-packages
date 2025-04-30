import { css } from '@mui/styled-engine';
import { AztecContext } from '../../aztecEnv';
import { useContext, useEffect, useState } from 'react';
import ErrorIcon from '@mui/icons-material/Error';
import Typography from '@mui/material/Typography';
import { Box, Button, Card, CardContent, Divider, Popover, Tooltip } from '@mui/material';
import { loader } from '../../styles/common';
import { FUN_FACTS } from '../../constants';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import type { UserTx } from '../../utils/txs';
import { convertFromUTF8BufferAsString, formatFrAsString } from '../../utils/conversion';
import { TxHash } from '@aztec/aztec.js';
import { TransactionModal } from '../common/TransactionModal';
import { useLocalStorage } from "@uidotdev/usehooks";

const container = css({
  width: '320px',
  height: '100%',
  position: 'relative',
  backgroundColor: '#E9E9E9',
  borderRadius: '10px',
  display: 'flex',
  flexDirection: 'column',
  transition: 'all 0.3s ease-out',
  padding: '1rem',
  scrollbarWidth: 'none',
  '@media (max-width: 900px)': {
    padding: '12px',
    width: '100%',
    height: 'auto',
    minHeight: '300px',
  },
});

const minimizedTx = css({
  width: '100%',
  height: '75px',
  backgroundColor: 'white',
  padding: '6px 10px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  cursor: 'pointer',
  overflow: 'hidden',
  transition: 'all 0.3s ease',
  border: '1px solid var(--mui-palette-grey-400)',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  },
});

const minimizedTxTitle = css({
  fontWeight: 500,
  fontSize: '16px',
  marginBottom: '3px',
  textWrap: 'nowrap',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
});

const minimizedTxLog = css({
  fontWeight: 300,
  fontSize: '11px',
  color: 'var(--mui-palette-text-secondary)',
  overflow: 'hidden',
  lineHeight: '1.2',
  height: '2.4em',
});

const funFactsCss = css({
  height: '80px',
  padding: '12px 16px !important',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center'
});


const txData = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  width: '100%',
  padding: '10px 14px',
  backgroundColor: 'var(--mui-palette-primary-light)',
  color: 'var(--mui-palette-text-primary)',
  borderRadius: '6px',
  cursor: 'pointer',
  marginBottom: '10px',
  '&:hover': {
    backgroundColor: 'var(--mui-palette-grey-400)',
    color: 'var(--mui-palette-text-primary)',
  },
});

const arrowDown = css({
  width: 0,
  height: 0,
  borderLeft: '8px solid transparent',
  borderRight: '8px solid transparent',
  borderTop: '8px solid var(--mui-palette-primary-main)',
  position: 'absolute',
  left: '50%',
  bottom: '-8px',
  transform: 'translateX(-50%)',
});

const popoverCss = css({
    transform: 'translateY(-130px) translateX(10px)',
    overflow: 'visible',
    '& .MuiPaper-root': {
      backgroundColor: 'var(--mui-palette-primary-main)',
      color: 'var(--mui-palette-text-primary)',
      overflowX: 'visible',
      overflowY: 'visible',
      boxShadow: 'none',
      animation: 'fadeIn 0.3s ease-in-out',
      animationDelay: '1s',
      animationFillMode: 'backwards',
      '@keyframes fadeIn': {
        from: { opacity: 0 },
        to: { opacity: 1 }
      },
    },
});

export function TxPanel() {
  const {
    setTransactionModalStatus,
    currentTx,
    walletDB,
    logs
  } = useContext(AztecContext);

  const [numTransactions, setNumTransactions] = useState(0);
  const [currentFunFactIndex, setCurrentFunFactIndex] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [selectedTx, setSelectedTx] = useState<UserTx | null>(null);

  const [seenPendingTxPopover, setSeenPendingTxPopover] = useLocalStorage('seenPendingTxPopover', false);

  useEffect(() => {
    const refreshTransactions = async () => {
      const txsPerContract = await walletDB.retrieveAllTx();
      const txHashes = txsPerContract.map(txHash => TxHash.fromString(convertFromUTF8BufferAsString(txHash)));
      const txs: UserTx[] = await Promise.all(
        txHashes.map(async txHash => {
          const txData = await walletDB.retrieveTxData(txHash);
          return {
            txHash: txData.txHash,
            status: convertFromUTF8BufferAsString(txData.status),
            name: convertFromUTF8BufferAsString(txData.name),
            date: parseInt(convertFromUTF8BufferAsString(txData.date)),
          } as UserTx;
        }),
      );
      txs.sort((a, b) => (b.date >= a.date ? -1 : 1));
      setTransactions(txs);
    };

    if (walletDB) {
      refreshTransactions();
    } else {
      setTransactions([]);
    }
  }, [currentTx, walletDB]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFunFactIndex(prev => (prev + 1) % FUN_FACTS.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const refreshTransactions = async () => {
      const txs = await walletDB.retrieveAllTx();
      setNumTransactions(txs.length);
    };

    if (walletDB) {
      refreshTransactions();
    } else {
      setNumTransactions(0);
    }
  }, [currentTx, walletDB]);

  const pendingTx = (currentTx && currentTx.status !== 'success') ? currentTx : null;
  let lastLog = logs?.[0]?.message;
  if (lastLog?.length > 100) {
    lastLog = lastLog.slice(0, 100) + '...';
  }
  const hasError = pendingTx?.status === 'error';
  const errorMessage = pendingTx?.error;
  const subtitle = hasError ? errorMessage : lastLog;

  if (numTransactions === 0 && !pendingTx) {
    // Return a div with 0 width, so we can have animation when it appears
    return <div css={{ width: '0px', padding: '0px', marginLeft: '-20px' }} />;
  }

  return (
    <div css={container}>
      <div style={{ flexGrow: 1, overflowY: 'auto' }}>
        <Typography variant="overline">Past Transactions</Typography>
        <Divider sx={{ marginBottom: '0.5rem' }} />

        {numTransactions === 0 && (
          <Typography variant="body2" sx={{ margin: '10px 0 2rem 0' }}>No past transactions yet</Typography>
        )}

        {(numTransactions > 0) && transactions.map(tx => (
          <Button
            css={txData}
            key={tx.txHash ?? ''}
            onClick={() => {
              setSelectedTx(tx);
              setTransactionModalStatus('open');
            }}
          >
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
          </Button>
        ))}

      </div>

      {pendingTx && (
        <>
          <Popover
            open={!seenPendingTxPopover}
            anchorEl={document.getElementById('pending-tx')}
            onClose={() => setSeenPendingTxPopover(true)}
            hideBackdrop
            css={popoverCss}
          >
            <div style={{ padding: '16px', maxWidth: '250px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ marginBottom: '0.5rem', textAlign: 'left', width: '100%' }}>Transaction Status</Typography>
              <Typography variant="body2">Click to view your transaction status here</Typography>

              <Button
                variant="contained"
                color="secondary"
                onClick={() => setSeenPendingTxPopover(true)}
                size="small"
                sx={{ marginTop: '1rem', borderRadius: '6px' }}
              >
                Got it
              </Button>

              <div css={arrowDown} />
            </div>
          </Popover>

          <div style={{ margin: '1rem 0' }} id="pending-tx">
            <Typography variant="overline">Pending Transaction</Typography>
            <Divider sx={{ marginBottom: '0.5rem' }} />

            <div css={minimizedTx} onClick={() => {
              setSelectedTx(null); // TransactionModal will load the currentTx
              setTransactionModalStatus('open');
            }}>
              {!hasError && (
                <span css={[loader, { width: '22px', height: '22px', marginRight: '12px', marginLeft: '10px' }]}></span>
              )}
              {hasError && (
                <ErrorIcon style={{ marginRight: '0px', width: '36px', height: '36px', color: 'var(--mui-palette-error-main)' }} />
              )}

              <Box sx={{ width: '250px', overflow: 'hidden' }}>
                <Typography css={minimizedTxTitle}>{pendingTx?.name || 'Sending transaction...'}</Typography>
                <Typography css={minimizedTxLog}>{subtitle}</Typography>
              </Box>
            </div>
          </div>
        </>
      )}

      {pendingTx && (
        <Card>
          <CardContent sx={funFactsCss}>
            <LightbulbIcon sx={{ marginRight: '12px', color: '#FFB74D', fontSize: '30px' }} />
            <Typography variant="body1" sx={{ fontSize: '15px', lineHeight: '1.1' }}>
              {FUN_FACTS[currentFunFactIndex]}
            </Typography>
          </CardContent>
        </Card>
      )}

      <TransactionModal transaction={selectedTx} />
    </div>
  );
}
