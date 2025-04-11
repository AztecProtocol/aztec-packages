import { useContext, useEffect, useState } from 'react';
import { css } from '@emotion/react';
import { AztecContext } from '../../aztecEnv';
import Typography from '@mui/material/Typography';
import loadingIcon from '../../assets/loading_icon.gif';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import { Dialog } from '@mui/material';
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

// Loading animation styling
const loadingAnimation = css({
  width: '100px',
  height: '100px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  margin: '20px 0',
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
  'Aztec invented PLONK which is really cool',
  'Aztec supports private, public, and hybrid smart contract execution',
  'Aztec enables privacy and full composability',
];

export function LoadingModal() {
  const { currentTx, setCurrentTx, logs } = useContext(AztecContext);
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
  };

  const isError = TX_ERRORS.includes(currentTx?.status);
  const isProving = currentTx?.status === 'proving';

  return (
    <Dialog open={!!currentTx && currentTx.status !== TxStatus.SUCCESS} onClose={handleClose}>
      <IconButton css={closeButton} onClick={handleClose}>
        <CloseIcon />
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
              <Button variant="contained" color="primary" onClick={handleClose}>
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
            <img src={loadingIcon} alt="Loading..." css={loadingAnimation} />
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
