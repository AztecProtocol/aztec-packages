import { useCallback, useContext, useState, useEffect } from 'react';
import { css } from '@emotion/react';
import { AztecContext } from '../../aztecEnv';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseButton from '@mui/icons-material/Close';
import TwitterIcon from '@mui/icons-material/Twitter';
import { BLOCK_EXPLORER_TX_URL, DISCORD_URL, PLAYGROUND_URL } from '../../constants';
import Button from '@mui/material/Button';
import { Dialog, DialogContent, DialogTitle } from '@mui/material';
import { TxStatus } from '@aztec/aztec.js';
import { dialogBody, loader } from '../../styles/common';
import type { UserTx } from '../../utils/txs';
import ReactConfetti from 'react-confetti';
import { trackButtonClick } from '../../utils/matomo';

const TX_ERRORS = [
  'error',
  TxStatus.APP_LOGIC_REVERTED,
  TxStatus.TEARDOWN_REVERTED,
  TxStatus.BOTH_REVERTED,
  TxStatus.DROPPED,
];

const minimizeButton = css({
  position: 'absolute',
  top: '10px',
  right: '10px',
});

const container = css({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '450px',
  padding: '1rem',
  overflow: 'auto',
  '@media (max-width: 900px)': {
    padding: '1rem 0',
  },
});

const titleText = css({
  fontWeight: 500,
  fontSize: '24px',
  overflowWrap: 'break-word',
  textAlign: 'center',
});

const content = css({
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1,
  marginTop: '1rem',
  alignItems: 'center',
  textAlign: 'center',
  maxWidth: '100%',

  code: {
    display: 'block',
    backgroundColor: 'var(--mui-palette-grey-100)',
    padding: '1rem',
    borderRadius: '6px',
    marginTop: '1rem',
    fontSize: '14px',
    fontFamily: 'monospace',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    maxHeight: '7rem',
    textAlign: 'left',
    width: '100%',
  },

  ul: {
    paddingInlineStart: '2rem',
  }
});

const subtitleText = css({
  width: '100%',
  fontSize: '16px',
  color: 'rgba(0, 0, 0, 0.6)',
});

const buttonContainer = css({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '1rem',
  marginTop: '1rem',

  'button, a': {
    borderRadius: '5px',
    maxWidth: '300px',
  },
});


export function TransactionModal(props: { transaction: UserTx }) {
  const { currentTx, setCurrentTx, logs, transactionModalStatus, setTransactionModalStatus } = useContext(AztecContext);
  const [isTxPanelOpen, setIsTxPanelOpen] = useState(transactionModalStatus === 'open');

  const transaction = props.transaction || currentTx;

  useEffect(() => {
    setIsTxPanelOpen(transactionModalStatus === 'open');
  }, [transactionModalStatus]);

  // Open the modal when the transaction is successful
  useEffect(() => {
    if (transaction?.status === 'success') {
      setTransactionModalStatus('open');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction]);

  const handleCancelTx = async () => {
    if (!confirm('Are you sure you want to cancel this transaction?')) {
      return;
    }

    // Set error state to indicate deployment was cancelled
    if (currentTx && !TX_ERRORS.includes(currentTx.status)) {
      setCurrentTx(null);
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

  const handleShareOnTwitter = async (txHash: string) => {
    if (!txHash) return;

    try {
      const text = encodeURIComponent(
        "I sent a private transaction on @aztecnetwork Public Testnet by generating a client-side proof."
        + "\n\n"
        + "Try it yourself with Aztec Playground: " + PLAYGROUND_URL
      );
      const url = `https://twitter.com/intent/tweet?text=${text}`;

      window.open(url, '_blank');
    } catch (error) {
      console.error('Error sharing on Twitter:', error);
    }
  };

  if (!transaction) {
    return null;
  }

  const isError = TX_ERRORS.includes(transaction?.status);
  const isProving = transaction?.status === 'proving';
  const isSending = transaction?.status === 'sending';
  const isSuccess = transaction?.status === 'success';
  const isPending = transaction?.status === 'pending';
  const errorMessage = transaction?.error ?? transaction?.receipt?.error;
  const isTimeoutError = errorMessage && errorMessage.toLowerCase().includes('timeout awaiting');


  function renderProvingState() {
    return (
      <>
        <Typography css={titleText}>
          Generating proof for transaction...
        </Typography>

        <div css={content}>
          <Typography css={subtitleText} style={{ marginBottom: '1rem' }}>
            A client-side zero-knowledge proof is being generated in your browser.
            This may take 20-60 seconds.
          </Typography>

          <span css={loader}></span>

          {logs && logs.length > 0 && (
            <Typography css={subtitleText} style={{ marginTop: '1rem', textAlign: 'left' }}>
              This is what we're currently working on:

              <code>
                {logs?.[0]?.message}
              </code>
            </Typography>
          )}
        </div>

        <div css={buttonContainer}>
          <Button variant="contained" color="error" onClick={handleCancelTx}>
            Cancel Transaction
          </Button>
        </div>
      </>
    )
  }

  function renderSendingState() {
    return (
      <>
        <Typography css={titleText}>
          Sending transaction to Aztec network...
        </Typography>

        <div css={content}>
          <span css={loader}></span>

          <Typography css={subtitleText}>
            <br />
            Your transaction has been sent to the Aztec network.
            <br />
            <br />
            We are waiting for a confirmation that your transaction was included in a block.
          </Typography>
        </div>
      </>
    )
  }

  function renderSuccessState() {
    return (
      <>
        <Typography css={titleText}>
          Congratulations! You transaction was successful!
        </Typography>

        <div css={content}>
          <div css={subtitleText} style={{ textAlign: 'left' }}>
            Here is what you did:

            <ul>
              <li>Simulated the transaction {transaction?.name && `"${transaction?.name}"`}.</li>
              <li>Generated a client-side proof for the transaction.</li>
              <li>Sent the transaction and proof to Aztec network.</li>
              <li>Got the confirmation from the network that your transaction was included in a block.</li>
            </ul>
          </div>

          <code>
            Tx Hash:
            <br />
            {transaction?.txHash?.toString()}
            <br />
            <a
              href={`${BLOCK_EXPLORER_TX_URL}/${transaction?.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackButtonClick('View on Explorer', 'Transaction Modal')}
            >
              View on Explorer
            </a>
          </code>
        </div>

        <span style={{ backgroundColor: 'var(--mui-palette-grey-300)', textAlign: 'center', padding: '0.75rem', borderRadius: '6px', marginTop: '2rem' }}>
          Take a screenshot of above and share on X!
        </span>

        <div css={buttonContainer}>
          <Button
            variant="contained"
            onClick={() => {
              trackButtonClick('Share on X', 'Transaction Modal');
              handleShareOnTwitter(transaction?.txHash?.toString());
            }}
          >
            <TwitterIcon style={{ marginRight: '0.5rem', fontSize: '1.2rem' }} />
            Share on X
          </Button>

          <Button
            variant="contained"
            color="secondary"
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackButtonClick('Join Discord', 'Transaction Modal')}
          >
            Join Discord
          </Button>
        </div>

      </>
    )
  }

  function renderErrorState() {
    return (
      <>
        <Typography css={[titleText, { color: '#FF7764' }]}>
          An unexpected error occurred
        </Typography>
        <div css={content}>
          <Typography css={subtitleText} style={{ textAlign: 'left' }}>
            An unexpected error occurred when sending your transaction.
          </Typography>
          <code css={subtitleText}>{errorMessage}</code>
        </div>
      </>
    )
  }

  function renderTimeoutError() {
    return (
      <>
        <Typography css={[titleText, { color: '#FF7764' }]}>
          Transaction delayed
        </Typography>

        <div css={content}>
          <Typography css={subtitleText}>
            Your transaction was successfully sent to the mempool but it took slightly longer to add it to a block.
            <br />
            <br />
            It might be already included in a block by now. You can check the transaction status on a block explorer.
          </Typography>
        </div>

        <div css={buttonContainer}>
          <Button
            variant="contained"
            color="primary"
            href={`${BLOCK_EXPLORER_TX_URL}/${transaction?.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackButtonClick('View on Explorer', 'Transaction Modal')}
          >
            View on Explorer
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      {isSuccess && (
        <ReactConfetti
          style={{ zIndex: 10000, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}
          recycle={false}
          numberOfPieces={500}
          gravity={0.3}
        />
      )}

      <Dialog open={isTxPanelOpen} onClose={minimizeModal}>
        <DialogTitle>{transaction?.name}</DialogTitle>

        <DialogContent css={dialogBody}>

          <IconButton
            css={minimizeButton}
            onClick={minimizeModal}
          >
            <CloseButton />
          </IconButton>

          <div css={container}>
            {(isPending || isTimeoutError) && renderTimeoutError()}
            {isError && !isTimeoutError && renderErrorState()}
            {isSending && renderSendingState()}
            {isProving && renderProvingState()}
            {isSuccess && renderSuccessState()}
          </div>

        </DialogContent>
      </Dialog>
    </>
  );
}
