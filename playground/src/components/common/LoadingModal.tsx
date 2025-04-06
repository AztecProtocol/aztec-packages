import { useContext, useEffect, useState } from 'react';
import { css } from '@emotion/react';
import { AztecContext } from '../../aztecEnv';
import Typography from '@mui/material/Typography';
import loadingIcon from '../../assets/loading_icon.gif';
import Link from '@mui/material/Link';

// Modal container styling
const modalContainer = css({
  boxSizing: 'border-box',
  position: 'absolute',
  width: '700px',
  height: '500px',
  left: 'calc(50% - 700px/2)',
  top: 'calc(50% - 500px/2)',
  background: '#F8F8F8', // This will be overridden when there's an error
  border: '2px solid #B6B4B4',
  borderRadius: '10px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
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

// Overlay to dim the background
const overlay = css({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  zIndex: 999,
});

// Transaction hash styling
const hashText = css({
  position: 'absolute',
  width: '432px',
  top: 'calc(50% - 36px/2 + 110px)',
  fontFamily: '"Inter", sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '14px',
  lineHeight: '150%',
  textAlign: 'center',
  color: 'rgba(0, 0, 0, 0.6)',
  wordBreak: 'break-all',
  padding: '0 20px',
});

// Always visible subtitle about ZK proof
const proofInfoText = css({
  position: 'absolute',
  width: '432px',
  top: 'calc(50% - 36px/2 + 110px)',
  fontFamily: '"Inter", sans-serif',
  fontStyle: 'italic',
  fontWeight: 400,
  fontSize: '14px',
  lineHeight: '150%',
  textAlign: 'center',
  color: 'rgba(0, 0, 0, 0.8)',
});

// Aztec fact styling
const aztecFactText = css({
  position: 'absolute',
  width: '432px',
  top: 'calc(50% - 36px/2 + 170px)',
  fontFamily: '"Inter", sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '14px',
  lineHeight: '150%',
  textAlign: 'center',
  color: 'rgba(0, 0, 0, 0.6)',
  padding: '0 20px',
  margin: '15px 0',
});

// Error text styling
const errorText = css({
  position: 'absolute',
  width: '432px',
  top: 'calc(50% - 36px/2 - 50px)',
  fontFamily: '"Inter", sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '16px',
  lineHeight: '150%',
  textAlign: 'center',
  color: '#C62828',
  wordBreak: 'break-word',
  padding: '0 20px',
});

// Aztec facts array
const AZTEC_FACTS = [
  'Did you know - Even Aztec\'s testnet is decentralized. Check out some more information at <a href="https://blog.aztec.network" target="_blank">blog.aztec.network</a>',
  'You can play with this contract directly on your own machine by following this guide at <a href="https://docs.aztec.network" target="_blank">docs.aztec.network</a>',
  'Aztec allows for private and public execution, private and public state, and a mix of both!',
  'Privacy is a human right',
  'Aztec is the first EVM-compatible ZK rollup',
  'Aztec combines privacy protection with programmability to offer true private smart contracts',
  'The Aztec Protocol makes the entire Ethereum ecosystem private',
  'Noir is Aztec\'s Domain Specific Language for writing zero-knowledge circuits'
];

export function LoadingModal() {
  const { currentTx, isWorking, currentContract, setIsWorking } = useContext(AztecContext);
  const [randomFact, setRandomFact] = useState(0);

  // Show modal when a transaction is being sent to the network
  // This now includes both regular transactions and contract deployments
  const isTransactionSending =
    // Regular transaction with specific status
    (currentTx && (
      currentTx.status === 'proving' ||
      currentTx.status === 'sending' ||
      currentTx.status === 'pending'
    )) ||
    // Contract deployment or any other operation that uses isWorking flag
    isWorking === true;

  // Check if there's an error
  const hasError = currentTx?.status === 'error' || !!currentTx?.error;

  useEffect(() => {
    // If the modal is showing, rotate the facts every 4 seconds
    if (isTransactionSending) {
      const interval = setInterval(() => {
        setRandomFact(prev => (prev + 1) % AZTEC_FACTS.length);
      }, 4000);

      return () => clearInterval(interval);
    }
  }, [isTransactionSending]);

  // Keep the modal open when there's an error by ensuring isWorking is true
  useEffect(() => {
    if (hasError) {
      setIsWorking(true);
    }
  }, [hasError, setIsWorking]);

  // Always show modal if there's an error or transaction in progress
  if (!hasError && !isTransactionSending) {
    return null;
  }

  // Determine the appropriate message based on transaction status
  const getMessage = () => {
    if (hasError) {
      return 'Error with contract deployment';
    }

    if (!currentTx && isWorking) {
      // When deploying a contract
      if (currentContract === null || currentContract === undefined) {
        return 'Deploying contract to Aztec network...';
      }
      return 'Processing operation...';
    }

    if (currentTx) {
      if (currentTx.status === 'proving') {
        return 'Generating proof for transaction...';
      } else if (currentTx.status === 'sending') {
        return 'Sending transaction to Aztec network...';
      } else if (currentTx.status === 'pending') {
        return 'Transaction pending on Aztec network...';
      } else if (currentTx.status === 'error') {
        return 'Error with contract deployment';
      }
    }

    return 'Processing transaction...';
  };

  // Get the function name subtitle
  const getSubtitle = () => {
    if (hasError) {
      // Get just the first part of the error message
      let errorMsg = 'Unknown error occurred';

      try {
        if (currentTx?.error) {
          errorMsg = String(currentTx.error);
        }
      } catch (e) {
        // Fallback if toString fails
        console.error('Error converting error to string:', e);
      }

      // Extract just the first sentence
      const firstPart = errorMsg.split('.')[0];
      return `${firstPart}. Please reach out to us on Discord.`;
    }

    if (currentTx && currentTx.fnName) {
      return `Function: ${currentTx.fnName}`;
    } else if (!currentTx && isWorking) {
      if (currentContract === null || currentContract === undefined) {
        return 'This may take a few moments';
      }
      return 'Please wait while we process your request';
    }
    return '';
  };

  // Get the transaction hash if available
  const getHashDisplay = () => {
    if (currentTx && currentTx.txHash) {
      return `Transaction Hash: ${currentTx.txHash.toString()}`;
    }
    return '';
  };

  // Set the background color based on status
  const getBackgroundColor = () => {
    if (hasError) {
      return '#FFF5F5'; // Light red background for errors
    }
    return '#F8F8F8'; // Default background matches the GIF background
  };

  return (
    <>
      <div css={overlay} />
      <div css={modalContainer} style={{ background: getBackgroundColor() }}>
        <div css={contentGroup}>
          <div css={titleText}>{getMessage()}</div>
          {hasError ? (
            <div css={errorText}>{getSubtitle()}</div>
          ) : (
            <div css={subtitleText}>{getSubtitle()}</div>
          )}

          {!hasError && (
            <div css={loadingAnimation}>
              <img src={loadingIcon} alt="Loading" style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '100%' }} />
            </div>
          )}

          {currentTx && currentTx.txHash && <div css={hashText}>{getHashDisplay()}</div>}

          {!hasError && (
            <>
              <div css={proofInfoText}>You are generating a client-side zero-knowledge proof right in your browser!</div>
              <div css={aztecFactText} dangerouslySetInnerHTML={{ __html: AZTEC_FACTS[randomFact] }} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
