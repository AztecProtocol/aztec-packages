import { useContext } from 'react';
import { css } from '@emotion/react';
import { AztecContext } from '../../aztecEnv';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import MinimizeIcon from '@mui/icons-material/Minimize';
import TwitterIcon from '@mui/icons-material/Twitter';
import { DISCORD_URL, PLAYGROUND_URL } from '../../constants';
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
  svg: {
    paddingBottom: '7px',
    fontWeight: 600,
  }
});

const container = css({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '500px',
  padding: '1rem',
  overflow: 'auto',
  transition: 'height 0.3s ease-in-out',
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


export function TransactionModal(props: { transaction: UserTx, isOpen: boolean, onClose: () => void }) {
  const { isOpen, onClose } = props;
  const { currentTx, setCurrentTx, logs } = useContext(AztecContext);

  const transaction = props.transaction || currentTx;

  const handleCancelTx = async () => {
    if (!confirm('Are you sure you want to cancel this transaction?')) {
      return;
    }

    // Set error state to indicate deployment was cancelled
    if (currentTx && !TX_ERRORS.includes(currentTx.status)) {
      setCurrentTx(null);
    }

    setCurrentTx(null);
  };

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
  const errorMessage = transaction?.error ?? transaction?.receipt?.error ?? transaction?.status;
  const isTimeoutError = errorMessage && errorMessage.toLowerCase().includes('timeout awaiting');

  function renderNewsletterSignup() {
    return (
      <div css={subtitleText} style={{ textAlign: 'center', marginTop: '2rem' }}>
        Psst! Sign up for the <a href="https://tally.so/r/np5p0E" target="_blank" rel="noopener noreferrer">developer newsletter</a>
      </div>
    )
  }

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

        {renderNewsletterSignup()}
      </>
    )
  }


  function renderTxHash() {
    return (
      <code>
        Tx Hash:
        <br />
        {transaction?.txHash?.toString()}
        <br />
        <a
          href={`https://aztecscan.xyz/tx-effects/${transaction?.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackButtonClick('View on Aztec Scan', 'Transaction Modal')}
        >
          View on Aztec Scan
        </a>
        <a
          href={`https://aztecexplorer.xyz/tx/${transaction?.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackButtonClick('View on Aztec Explorer', 'Transaction Modal')}
          style={{ marginLeft: '1rem' }}
        >
          View on Aztec Explorer
        </a>
      </code>
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
            We are waiting for confirmation that your transaction has been included in a block.
          </Typography>

          {renderTxHash()}

          {renderNewsletterSignup()}
        </div>
      </>
    )
  }

  function renderSuccessState() {
    return (
      <>
        <Typography css={titleText}>
          Congratulations! You created a transaction on Aztec testnet
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

          {renderTxHash()}
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

        {renderNewsletterSignup()}
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
            Your transaction was successfully sent to the mempool but the network took longer than normal to be included it in a block due to network congestion.
            <br />
            <br />
            Want to learn more about transaction throughput and network congestion on Aztec testnet?
            {' '}
            Read <a href="https://aztec.network/blog/what-is-aztec-testnet" target="_blank" rel="noopener noreferrer">this article</a>.
            <br />
            <br />
            We check the status of your transaction frequently. You can also check the transaction status on a block explorer.
          </Typography>

          {renderTxHash()}
        </div>

        {renderNewsletterSignup()}
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

      <Dialog open={isOpen} onClose={onClose}>
        <DialogTitle>{transaction?.name}</DialogTitle>

        <DialogContent css={dialogBody}>

          <IconButton
            css={minimizeButton}
            onClick={onClose}
          >
            <MinimizeIcon />
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
