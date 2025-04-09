import { useContext, useEffect, useState } from 'react';
import { css } from '@emotion/react';
import { AztecContext } from '../../aztecEnv';
import Typography from '@mui/material/Typography';
import loadingIcon from '../../assets/loading_icon.gif';
import Link from '@mui/material/Link';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Button from '@mui/material/Button';

// Modal container styling
const modalContainer = css({
  boxSizing: 'border-box',
  position: 'fixed',
  width: '700px',
  height: '500px',
  left: 'calc(50% - 700px/2)',
  top: 'calc(50% - 500px/2)',
  background: '#F8F8F8',
  border: '2px solid #B6B4B4',
  borderRadius: '10px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9999,
  '&.error': {
    background: 'rgba(255, 119, 100, 0.1)',
    border: '2px solid rgba(255, 119, 100, 0.3)',
  }
});

// Close button styling
const closeButton = css({
  position: 'absolute',
  top: '10px',
  right: '10px',
  zIndex: 10000,
});

// Content group styling
const contentGroup = css({
  position: 'absolute',
  width: '432px',
  height: '223.54px',
  left: 'calc(50% - 432px/2)',
  top: 'calc(50% - 223.54px/2)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
});

// Text styling
const titleText = css({
  position: 'absolute',
  width: '432px',
  height: '36px',
  left: 'calc(50% - 432px/2)',
  top: 'calc(50% - 36px/2 - 93.77px)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '24px',
  lineHeight: '150%',
  display: 'flex',
  alignItems: 'center',
  textAlign: 'center',
  justifyContent: 'center',
  letterSpacing: '-0.011em',
  color: 'rgba(0, 0, 0, 0.8)',
});

// Subtitle text styling
const subtitleText = css({
  position: 'absolute',
  width: '432px',
  top: 'calc(50% - 36px/2 - 40px)',
  fontFamily: '"Inter", sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '16px',
  lineHeight: '150%',
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
  position: 'absolute',
  width: '432px',
  top: 'calc(50% - 36px/2 - 50px)',
  fontFamily: '"Inter", sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '16px',
  lineHeight: '150%',
  textAlign: 'center',
  color: '#FF7764',
  padding: '0 20px',
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
  position: 'absolute',
  width: '432px',
  top: 'calc(50% - 36px/2 + 50px)',
  fontFamily: '"Inter", sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '16px',
  lineHeight: '150%',
  textAlign: 'center',
  color: 'rgba(0, 0, 0, 0.6)',
  padding: '0 20px',
});

const funFacts = [
  "You are currently signing this transaction with a passkey",
  "Aztec has a super cool account abstraction model which you are utilizing right now",
  "You're generating a client-side proof directly in your browser, and it won't take forever!",
  "Aztec enables programmable privacy across the entire Ethereum ecosystem",
  "Aztec uses zero-knowledge proofs to enable private transactions",
  "The Aztec protocol was founded in 2017",
  "We're almost there...",
  "Aztec Connect was the first private DeFi application",
  "Aztec invented PLONK which is really cool",
  "Aztec supports private, public, and hybrid smart contract execution",
  "Aztec enables privacy and full composability"
];

export function LoadingModal() {
  const { currentTx, setCurrentTx, setIsWorking } = useContext(AztecContext);
  const [showError, setShowError] = useState(false);
  const [currentFunFact, setCurrentFunFact] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFunFact((prev) => (prev + 1) % funFacts.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const handleClose = () => {
    // Set error state to indicate deployment was cancelled
    if (currentTx && currentTx.status !== 'error') {
      setCurrentTx({
        ...currentTx,
        status: 'error' as const,
        error: 'Deployment cancelled by user'
      });
    }
    // Clean up working state after a short delay to allow error to be displayed
    setTimeout(() => {
      setCurrentTx(null);
      setIsWorking(false);
      setShowError(false);
    }, 1000);
  };

  const handleOutsideClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!currentTx) return null;

  const isError = currentTx.status === 'error';
  const isProving = currentTx.status === 'proving';
  const isSending = currentTx.status === 'sending';
  const isDeployingAccount = currentTx.fnName === 'deployAccount';
  const isDeployingContract = currentTx.fnName === 'deploy';

  return (
    <div css={[modalContainer, isError && 'error']} onClick={handleOutsideClick}>
      <IconButton css={closeButton} onClick={handleClose}>
        <CloseIcon />
      </IconButton>
      <div css={contentGroup}>
        <Typography css={[titleText, isError && { color: '#FF7764' }]}>
          {isError ? 'Error' : isProving ? 'Generating proof for transaction...' : 'Sending transaction to Aztec network...'}
        </Typography>
        {isError ? (
          <>
            <Typography css={errorMessage}>
              {currentTx.error || 'An error occurred during deployment'}
            </Typography>
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
                ? isDeployingAccount
                  ? "You are deploying an account to Aztec testnet. Don't worry, we are covering the fees automatically."
                  : isDeployingContract
                  ? "You are deploying a contract to Aztec testnet. Don't worry, we are covering the fees automatically."
                  : 'A client-side zero-knowledge proof is being generated in your browser. This may take 20-60 seconds.'
                : 'Your transaction is being sent to the Aztec network. This may take a few seconds.'}
            </Typography>
            <img src={loadingIcon} alt="Loading..." css={loadingAnimation} />
            <Typography css={funFactText}>
              Did you know? {funFacts[currentFunFact]}
            </Typography>
          </>
        )}
      </div>
    </div>
  );
}
