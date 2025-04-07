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
  top: 'calc(50% - 36px/2 - 50px)',
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
  position: 'absolute',
  width: '250px',
  height: '250px',
  left: 'calc(50% - 250px/2)',
  top: 'calc(50% - 250px/2 + 30px)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

// Error message styling
const errorMessage = css({
  position: 'absolute',
  width: '432px',
  top: 'calc(50% - 36px/2 - 50px)',
  fontFamily: '"Inter", sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '16px',
  lineHeight: '150%',
  textAlign: 'center',
  color: '#FF0000',
});

// Button container styling
const buttonContainer = css({
  position: 'absolute',
  bottom: '20px',
  display: 'flex',
  gap: '10px',
});

export function LoadingModal() {
  const { currentTx, setCurrentTx, setIsWorking } = useContext(AztecContext);
  const [showError, setShowError] = useState(false);

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

  return (
    <div css={modalContainer} onClick={handleOutsideClick}>
      <IconButton css={closeButton} onClick={handleClose}>
        <CloseIcon />
      </IconButton>
      <div css={contentGroup}>
        <Typography css={titleText}>
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
                ? 'A client-side zero-knowledge proof is being generated in your browser. This may take a few seconds.'
                : 'Your transaction is being sent to the Aztec network. This may take a few seconds.'}
            </Typography>
            <img src={loadingIcon} alt="Loading..." css={loadingAnimation} />
          </>
        )}
      </div>
    </div>
  );
}
