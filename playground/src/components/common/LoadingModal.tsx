import { useContext, useEffect, useState } from 'react';
import { css, keyframes } from '@emotion/react';
import { AztecContext } from '../../aztecEnv';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import ErrorIcon from '@mui/icons-material/Error';
import Button from '@mui/material/Button';
import { Box, Dialog } from '@mui/material';
import { TxStatus } from '@aztec/aztec.js';

const TX_ERRORS = [
  'error',
  TxStatus.APP_LOGIC_REVERTED,
  TxStatus.TEARDOWN_REVERTED,
  TxStatus.BOTH_REVERTED,
  TxStatus.DROPPED,
];

// Close button styling
const closeButton = css({
  position: 'absolute',
  top: '10px',
  right: '10px',
});

const minimizeButton = css({
  position: 'absolute',
  top: '10px',
  right: '60px',
});

// Content group styling
const contentGroup = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
  textWrap: 'wrap',
  minHeight: '550px',
  width: '600px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  wordBreak: 'break-word',
  '@media (max-width: 1200px)': {
    width: 'unset',
  },
});

// Text styling
const titleText = css({
  fontFamily: '"Space Grotesk", sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '24px',
  overflowWrap: 'break-word',
  display: 'flex',
  alignItems: 'center',
  textAlign: 'center',
  justifyContent: 'center',
  letterSpacing: '-0.011em',
  color: 'rgba(0, 0, 0, 0.8)',
});

// Subtitle text styling
const subtitleText = css({
  fontFamily: '"Inter", sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '16px',
  textAlign: 'center',
  color: 'rgba(0, 0, 0, 0.6)',
});

const loadingAnimationLayer1 = keyframes`
  0% { box-shadow: 0px 0px 0 0px  }
  90% , 100% { box-shadow: 20px 20px 0 -4px  }
`;

const loadingAnimationLayerTr = keyframes`
  0% { transform:  translate(0, 0) scale(1) }
  100% {  transform: translate(-25px, -25px) scale(1) }
`;

const loader = css({
  margin: '1rem',
  position: 'relative',
  width: '48px',
  height: '48px',
  background: 'var(--mui-palette-primary-main)',
  transform: 'rotateX(65deg) rotate(45deg)',
  color: 'var(--mui-palette-primary-dark)',
  animation: `${loadingAnimationLayer1} 1s linear infinite alternate`,
  ':after': {
    content: '""',
    position: 'absolute',
    inset: 0,
    background: 'var(--mui-palette-primary-light)',
    animation: `${loadingAnimationLayerTr} 1s linear infinite alternate`,
  },
});

// Error message styling
const errorMessage = css({
  fontFamily: '"Inter", sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  maxHeight: '80vh',
  fontSize: '16px',
  textAlign: 'center',
  color: '#FF7764',
});

// Button container styling
const buttonContainer = css({
  position: 'absolute',
  bottom: '20px',
  display: 'flex',
  gap: '10px',
});

// Fun facts styling
const funFactText = css({
  fontFamily: '"Inter", sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '16px',
  height: '60px',
  lineHeight: '150%',
  textAlign: 'center',
  color: 'rgba(0, 0, 0, 0.6)',
});

const logContainer = css({
  marginTop: '2rem',
  display: 'flex',
  flexDirection: 'column',
  textAlign: 'center',
  alignItems: 'center',
  width: '350px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  wordBreak: 'break-word',
});

const logTitle = css({
  fontFamily: '"Inter", sans-serif',
  fontStyle: 'normal',
  fontWeight: 'bold',
  fontSize: '14px',
  textAlign: 'center',
  color: 'rgba(0, 0, 0, 0.6)',
});

const logText = css({
  fontFamily: '"Inter", sans-serif',
  fontStyle: 'normal',
  fontWeight: 200,
  height: '60px',
  padding: '0.5rem',
  fontSize: '12px',
  textAlign: 'center',
  color: 'rgba(0, 0, 0, 0.8)',
});

const funFacts = [
  'Aztec has a super cool account abstraction model which you are utilizing right now',
  "You're generating a client-side proof directly in your browser, and it won't take forever!",
  'Aztec enables programmable privacy across the entire Ethereum ecosystem',
  'Aztec uses zero-knowledge proofs to enable private transactions',
  'The Aztec protocol was founded in 2017',
  "We're almost there...",
  'Aztec Connect was the first private DeFi application',
  'Aztec invented PLONK which is really cool and underpins all modern zkVMs',
  'Aztec supports private, public, and hybrid smart contract execution',
  'Aztec enables privacy and full composability across private and public calls',
  'All transactions on Aztec start off private (since all accounts and transaction entrypoints are private)',
  'Aztec is the first L2 to launch a decentralized testnet on day 1',
  'While you wait for this proof, check out somethinghappened.wtf',
];

const minimizedModal = css({
  position: 'fixed',
  bottom: '64px',
  right: '20px',
  width: '350px',
  height: '64px',
  backgroundColor: 'white',
  padding: '14px 16px',
  borderRadius: '8px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  cursor: 'pointer',
  overflow: 'hidden',
  transition: 'all 0.3s ease',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  },
});

const minimizedTitle = css({
  fontWeight: 500,
  fontSize: '16px',
  height: '20px',
  marginBottom: '5px',
});

const minimizedLog = css({
  fontWeight: 300,
  fontSize: '12px',
  color: 'var(--mui-palette-text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  lineHeight: '1.2',
  display: 'block',
  height: '2.4em',
});

export function LoadingModal() {
  const { currentTx, setCurrentTx, logs, transactionModalStatus, setTransactionModalStatus } = useContext(AztecContext);
  const [currentFunFact, setCurrentFunFact] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFunFact(prev => (prev + 1) % funFacts.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const handleClose = async () => {
    // Set error state to indicate deployment was cancelled
    if (currentTx && !TX_ERRORS.includes(currentTx.status)) {
      setCurrentTx({
        ...currentTx,
        status: 'error' as const,
        error: 'Transaction cancelled by user',
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setCurrentTx(null);
    setTransactionModalStatus('closed');
  };

  const minimizeModal = () => {
    setTransactionModalStatus('minimized');
  };

  const isError = TX_ERRORS.includes(currentTx?.status);
  const isProving = currentTx?.status === 'proving';

  function renderModal() {
    return (
      <Dialog open={true} onClose={minimizeModal}>
        <IconButton css={closeButton} onClick={handleClose}>
          <CloseIcon />
        </IconButton>
        <IconButton
          css={minimizeButton}
          onClick={minimizeModal}
        >
          <span css={{ width: '24px', height: '24px', position: 'relative', top: '-2px', fontWeight: '600' }}>–</span>
        </IconButton>
        <div css={contentGroup}>
          <Typography css={[titleText, isError && { color: '#FF7764' }]}>
            {isError
              ? 'Error'
              : isProving
                ? 'Generating proof for transaction...'
                : 'Sending transaction to Aztec network...'}
          </Typography>
          {isError ? (
            <>
              <Typography css={errorMessage}>{currentTx.error || 'An error occurred'}</Typography>
              <div css={buttonContainer}>
                <Button variant="contained" color="primary" onClick={minimizeModal}>
                  Close
                </Button>
              </div>
            </>
          ) : (
            <>
              <Typography css={subtitleText}>
                {isProving
                  ? 'A client-side zero-knowledge proof is being generated in your browser. This may take 20-60 seconds.'
                  : 'Your transaction is being sent to the Aztec network. This may take a few seconds.'}
              </Typography>
              <span css={loader}></span>
              <Typography css={funFactText}>Did you know? {funFacts[currentFunFact]}</Typography>
              <div css={logContainer}>
                <Typography css={logTitle}>Don't click away! This is what we're currently working on:</Typography>
                <Typography css={logText}>{logs?.[0]?.message}</Typography>
              </div>
            </>
          )}
        </div>
      </Dialog>
    );
  }

  function renderMinimizedModal() {
    let lastLog = logs?.[0]?.message;
    if (lastLog?.length > 100) {
      lastLog = lastLog.slice(0, 100) + '...';
    }

    const hasError = currentTx?.status === 'error';
    const errorMessage = currentTx?.error;
    const subtitle = hasError ? errorMessage : lastLog;

    return (
      <div css={minimizedModal} onClick={() => setTransactionModalStatus('open')}>
        {!hasError && (
          <span css={[loader, { width: '24px', height: '24px' }]}></span>
        )}
        {hasError && (
          <ErrorIcon fontSize="large" style={{ color: 'var(--mui-palette-error-main)' }} />
        )}

        <Box>
          <Typography css={minimizedTitle}>{currentTx?.name || 'Transaction'}</Typography>
          <Typography css={minimizedLog}>{subtitle}</Typography>
        </Box>
      </div>
    );
  }

  if (transactionModalStatus === 'open') {
    return renderModal();
  } else if (transactionModalStatus === 'minimized') {
    return renderMinimizedModal();
  }

  return null;
}
