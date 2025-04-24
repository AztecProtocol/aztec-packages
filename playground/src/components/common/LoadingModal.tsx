import { useCallback, useContext } from 'react';
import { css } from '@emotion/react';
import { AztecContext } from '../../aztecEnv';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import { Dialog, DialogContent, DialogTitle } from '@mui/material';
import { TxStatus } from '@aztec/aztec.js';
import { dialogBody, loader } from '../../styles/common';

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


export function LoadingModal() {
  const { currentTx, setCurrentTx, logs, transactionModalStatus, setTransactionModalStatus } = useContext(AztecContext);

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

  const minimizeModal = useCallback(() => {
    if (currentTx?.status === 'error') {
      setTransactionModalStatus('closed');
    } else {
      setTransactionModalStatus('minimized');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTx?.status]);

  const isError = TX_ERRORS.includes(currentTx?.status);
  const isProving = currentTx?.status === 'proving';

  return (
    <Dialog open={transactionModalStatus === 'open'} onClose={minimizeModal}>
      <DialogTitle>{currentTx?.name}</DialogTitle>

      <DialogContent css={dialogBody}>

        <IconButton css={closeButton} onClick={handleClose}>
          <CloseIcon />
        </IconButton>
        {currentTx?.status !== 'error' && (
          <IconButton
            css={minimizeButton}
            onClick={minimizeModal}
          >
            <span css={{ width: '24px', height: '24px', position: 'relative', top: '-2px', fontWeight: '600' }}>–</span>
          </IconButton>
        )}

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
              <div css={logContainer}>
                <Typography css={logTitle}>This is what we're currently working on:</Typography>
                <Typography css={logText}>{logs?.[0]?.message}</Typography>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
