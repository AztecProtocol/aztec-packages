import { css } from '@mui/styled-engine';
import { AztecContext } from '../../aztecEnv';
import { useContext, useEffect, useState } from 'react';
import { TxsPanel } from './components/TxsPanel';
import ErrorIcon from '@mui/icons-material/Error';
import Typography from '@mui/material/Typography';
import { Box, Card, CardContent, Divider } from '@mui/material';
import { loader } from '../../styles/common';
import { FUN_FACTS } from '../../constants';
import LightbulbIcon from '@mui/icons-material/Lightbulb';

const container = css({
  width: '25%',
  height: '100%',
  position: 'relative',
  backgroundColor: '#E9E9E9',
  borderRadius: '10px',
  display: 'flex',
  flexDirection: 'column',
  transition: 'all 0.3s ease-out',
  padding: '20px',
  scrollbarWidth: 'none',
  '@media (max-width: 1200px)': {
    padding: '12px',
    width: 'auto',
    maxHeight: '350px',
    margin: '0 0 12px 0',
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
  fontSize: '17px',
  marginBottom: '8px',
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

export function SideBar() {
  const {
    drawerOpen,
    setDrawerOpen,
    setTransactionModalStatus,
    currentTx,
    walletDB,
    logs
  } = useContext(AztecContext);

  const [numTransactions, setNumTransactions] = useState(0);
  const [currentFunFactIndex, setCurrentFunFactIndex] = useState(0);

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
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
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
    // Return empty width div for animation
    return <div css={[container, { width: '0px', padding: '0px', marginLeft: '-20px' }]} />;
  }

  return (
    <div css={container}>
      <div style={{ flexGrow: 1 }}>
        <Typography variant="overline">Past Transactions</Typography>
        <Divider sx={{ marginBottom: '0.5rem' }} />

        {numTransactions > 0 ? (
          <TxsPanel />
        ) : (
          <Card>
            <CardContent sx={{ padding: '16px' }}>
              <Typography variant="overline">No transactions yet</Typography>
            </CardContent>
          </Card>
        )}
      </div>

      {pendingTx && (
        <div style={{ marginBottom: '24px' }}>
          <Typography variant="overline">Pending Transaction</Typography>
          <Divider sx={{ marginBottom: '0.5rem' }} />

          <div css={minimizedTx} onClick={() => setTransactionModalStatus('open')}>
            {!hasError && (
              <span css={[loader, { width: '28px', height: '28px', marginRight: '12px' }]}></span>
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
      )}

      {pendingTx && (
        <Card>
          <CardContent sx={funFactsCss}>
            <LightbulbIcon sx={{ marginRight: '12px', color: '#FFB74D', fontSize: '32px' }} />
            <Typography variant="body1" sx={{ fontSize: '15px', lineHeight: '1.2' }}>
              {FUN_FACTS[currentFunFactIndex]}
            </Typography>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
