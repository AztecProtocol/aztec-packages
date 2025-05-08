import { css } from '@mui/styled-engine';
import { AztecContext } from '../../aztecEnv';
import { useContext, useEffect, useState } from 'react';
import ErrorIcon from '@mui/icons-material/Error';
import SuccessIcon from '@mui/icons-material/CheckCircle';
import Typography from '@mui/material/Typography';
import { Box, Button, Card, Divider, Popover } from '@mui/material';
import { loader } from '../../styles/common';
import { FUN_FACTS, TX_TIMEOUT } from '../../constants';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import { queryTxReceipt, type UserTx } from '../../utils/txs';
import { convertFromUTF8BufferAsString, formatFrAsString } from '../../utils/conversion';
import { TxHash, TxStatus } from '@aztec/aztec.js';
import { TransactionModal } from '../common/TransactionModal';
import { useLocalStorage } from '@uidotdev/usehooks';
import { CopyToClipboardButton } from '../common/CopyToClipboardButton';

const TX_ERRORS = [
  'error',
  TxStatus.APP_LOGIC_REVERTED,
  TxStatus.TEARDOWN_REVERTED,
  TxStatus.BOTH_REVERTED,
  TxStatus.DROPPED,
];

const container = css({
  width: '320px',
  height: '100%',
  position: 'relative',
  backgroundColor: '#ffffff38',
  borderRadius: '10px',
  display: 'flex',
  flexDirection: 'column',
  transition: 'all 0.3s ease-out',
  padding: '1rem',
  scrollbarWidth: 'none',
  marginBottom: '2rem',
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
  backgroundColor: '#ffffff69',
  padding: '6px 10px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  cursor: 'pointer',
  overflow: 'hidden',
  margin: '0.5rem 0',
  transition: 'all 0.3s ease',
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
  alignItems: 'center',
  fontSize: '14px',
  background: '#ffffff69',
  marginBottom: '2rem',
});

const txData = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  width: '100%',
  padding: '10px 14px',
  backgroundColor: '#ffffff38',
  color: 'var(--mui-palette-text-primary)',
  borderRadius: '6px',
  cursor: 'pointer',
  marginBottom: '10px',
  '&:hover': {
    backgroundColor: '#FFFFFF',
    color: 'var(--mui-palette-text-primary)',
  },
});

const arrowDown = css({
  width: 0,
  height: 0,
  borderLeft: '8px solid transparent',
  borderRight: '8px solid transparent',
  borderTop: '8px solid white',
  position: 'absolute',
  left: '50%',
  bottom: '-8px',
  transform: 'translateX(-50%)',
});

const popoverCss = css({
  transform: 'translateY(-130px) translateX(10px)',
  overflow: 'visible',
  '& .MuiPaper-root': {
    backgroundColor: 'white',
    color: 'var(--mui-palette-text-primary)',
    overflowX: 'visible',
    overflowY: 'visible',
    // boxShadow: 'none',
    animation: 'fadeIn 0.3s ease-in-out',
    animationDelay: '1s',
    animationFillMode: 'backwards',
    '@keyframes fadeIn': {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
  },
});

export function TxPanel() {
  const {
    currentTx,
    walletDB,
    logs,
    pxe,
    setPendingTxUpdateCounter,
    pendingTxUpdateCounter,
  } = useContext(AztecContext);

  const [currentFunFactIndex, setCurrentFunFactIndex] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [selectedTx, setSelectedTx] = useState<UserTx | null>(null);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);

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
  }, [currentTx, walletDB, pendingTxUpdateCounter]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFunFactIndex(prev => (prev + 1) % FUN_FACTS.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Update pending transactions status
  useEffect(() => {
    const refreshPendingTx = async () => {
      if (!pxe || !walletDB) {
        return;
      }

      const buffer = (TX_TIMEOUT + 60) * 1000;
      const pendingTxs = transactions.filter(tx => (
        tx.status === 'pending' &&
        (tx.date + buffer) < Date.now()
      ));

      for (const tx of pendingTxs) {
        const txReceipt = await queryTxReceipt(tx, pxe);
        if (txReceipt && txReceipt.status !== 'pending') {
          await walletDB.updateTxStatus(tx.txHash, txReceipt.status);
          setPendingTxUpdateCounter(pendingTxUpdateCounter + 1);
        }
      }
    };

    if (walletDB && pxe) {
      refreshPendingTx();
    }

    const interval = setInterval(refreshPendingTx, 10 * 1000);
    return () => clearInterval(interval);

    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [transactions, walletDB, pxe]);

  useEffect(() => {
    if (currentTx?.status === 'success') {
      setSelectedTx(null);
      setIsTransactionModalOpen(true);
    }
  }, [currentTx]);


  const pendingTx = currentTx && currentTx.status !== 'success' ? currentTx : null;
  let lastLog = logs?.[0]?.message;
  if (lastLog?.length > 100) {
    lastLog = lastLog.slice(0, 100) + '...';
  }

  const hasError = pendingTx?.error || TX_ERRORS.includes(pendingTx?.status);
  const errorMessage = pendingTx?.error;

  let subtitle;
  if (hasError) {
    subtitle = errorMessage;
  } else if (pendingTx?.status === 'sending') {
    subtitle = 'Waiting for confirmation...';
  } else {
    subtitle = lastLog;
  }

  if (transactions.length === 0 && !pendingTx) {
    // Return a div with 0 width, so we can have animation when it appears
    return <div css={{ width: '0px', padding: '0px', marginLeft: '-20px' }} />;
  }

  return (
    <div css={container}>
      {pendingTx && (
        <>
          <Popover
            open={!seenPendingTxPopover && !isTransactionModalOpen}
            anchorEl={document.getElementById('pending-tx')}
            onClose={() => setSeenPendingTxPopover(true)}
            hideBackdrop
            css={popoverCss}
          >
            <div
              style={{
                padding: '16px',
                maxWidth: '250px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <Typography variant="h6" sx={{ marginBottom: '0.5rem', textAlign: 'left', width: '100%' }}>
                Transaction Status
              </Typography>
              <Typography variant="body2">Click to view your transaction status here</Typography>

              <Button
                variant="contained"
                color="primary"
                onClick={() => setSeenPendingTxPopover(true)}
                size="small"
                sx={{ marginTop: '1rem', borderRadius: '6px', width: '70px' }}
              >
                Got it
              </Button>

              <div css={arrowDown} />
            </div>
          </Popover>

          <div style={{ marginBottom: '0rem' }} id="pending-tx">
            <Typography variant="overline">Pending Transaction</Typography>
            <Divider sx={{ margin: '0.1rem 0' }} />

            <div
              css={minimizedTx}
              onClick={() => {
                setSelectedTx(null); // TransactionModal will load the currentTx
                setIsTransactionModalOpen(true);
              }}
            >
              {!hasError && pendingTx?.status !== 'sending' && (
                <span css={[loader, { width: '22px', height: '22px', marginRight: '12px', marginLeft: '10px' }]}></span>
              )}
              {!hasError && pendingTx?.status === 'sending' && (
                <SuccessIcon
                  style={{
                    marginLeft: '0.4rem',
                    fontSize: '30px',
                    color: '#8d7dff',
                  }}
                />
              )}
              {hasError && (
                <ErrorIcon
                  style={{ marginRight: '0px', width: '36px', height: '36px', color: 'var(--mui-palette-error-main)' }}
                />
              )}

              <Box sx={{ width: '250px', overflow: 'hidden' }}>
                <Typography css={minimizedTxTitle}>{pendingTx?.name}</Typography>
                {pendingTx?.status === 'sending' && <Typography css={minimizedTxTitle}>Transaction Sent!</Typography>}

                <Typography css={minimizedTxLog}>{subtitle}</Typography>
              </Box>
            </div>
          </div>
        </>
      )}

      {pendingTx && (
        <Card sx={funFactsCss}>
          <LightbulbIcon sx={{ marginRight: '12px', color: '#FFB74D', fontSize: '30px' }} />
          <Typography variant="body1" sx={{ fontSize: '15px', lineHeight: '1.1' }}>
            {FUN_FACTS[currentFunFactIndex]}
          </Typography>
        </Card>
      )}
      <div style={{ flexGrow: 0.75, overflowY: 'auto', marginTop: '0rem' }}>
        {transactions.length > 0 && (
          <>
            <Typography variant="overline">Past Transactions</Typography>
            <Divider sx={{ marginBottom: '1rem', marginTop: '0rem' }} />
          </>
        )}

        {transactions.length > 0 &&
          transactions.map(tx => {
            const status = tx.receipt ? tx.receipt.status.toUpperCase() : tx.status.toUpperCase();

            return (
              <div
                role="button"
                css={txData}
                key={tx.txHash?.toString() ?? ''}
                onClick={() => {
                  setSelectedTx(tx);
                  setIsTransactionModalOpen(true);
                }}
              >
                <Typography variant="overline" sx={{ lineHeight: '1.5', marginBottom: '0.5rem' }}>{tx.name}</Typography>
                <div css={{ display: 'flex', width: '100%' }}>
                  <Typography variant="caption" sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ textAlign: 'justify', width: '110px' }}>
                        {tx.txHash ? formatFrAsString(tx.txHash.toString(), 6) : '()'}
                      </div>
                      <CopyToClipboardButton
                        data={tx.txHash?.toString() ?? ''}
                        disabled={!tx.txHash}
                        sx={{ '& svg': { fontSize: '14px' }, height: '1rem' }}
                      />
                    </div>
                    <Typography variant="caption">{status}</Typography>
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    {tx.receipt && tx.receipt.status === 'error' ? tx.receipt.error : tx.error}
                  </Typography>
                </div>
              </div>
            )
          })}
      </div>

      <TransactionModal
        transaction={selectedTx}
        isOpen={isTransactionModalOpen}
        onClose={() => {
          setSelectedTx(null);
          setIsTransactionModalOpen(false);
        }}
      />
    </div>
  );
}
