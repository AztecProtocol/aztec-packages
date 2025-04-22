import { css } from '@emotion/react';
import welcomeIconURL from '../../../assets/welcome_icon.svg';
import { Fr } from '@aztec/aztec.js';
import { Box, Button, CircularProgress } from '@mui/material';
import { AztecContext } from '../../../aztecEnv';
import { useContext, useState } from 'react';
import { PREDEFINED_CONTRACTS } from '../../../constants';
import { randomBytes } from '@aztec/foundation/crypto';
import { loadContractArtifact } from '@aztec/aztec.js';
import { getEcdsaRAccount } from '@aztec/accounts/ecdsa/lazy';
import { useTransaction } from '../../../hooks/useTransaction';

const landingPage = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '0',
  width: '100%',
  height: 'auto',
  minHeight: '100%',
  flex: 1,
});

const cardsContainer = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '24px',
  width: '100%',
  margin: '0 auto',
  '@media (max-width: 900px)': {
    gridTemplateColumns: 'repeat(1, 1fr)',
  },
  '@media (min-width: 901px) and (max-width: 1100px)': {
    gridTemplateColumns: 'repeat(2, 1fr)',
  },
});

const featureCard = css({
  background: '#CDD1D5',
  borderRadius: '20px',
  padding: '25px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
});

const cardIcon = css({
  width: '50px',
  height: '50px',
  marginBottom: '35px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

const cardTitle = css({
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 700,
  fontSize: '24px',
  lineHeight: '100%',
  letterSpacing: '0.02em',
  color: '#2D2D2D',
  marginBottom: '12px',
});

const cardDescription = css({
  fontFamily: 'Inter, sans-serif',
  fontWeight: 400,
  fontSize: '14px',
  lineHeight: '110%',
  letterSpacing: '0.01em',
  color: 'rgba(0, 0, 0, 0.8)',
  paddingTop: '1rem',
  paddingBottom: '2rem',
});

const contentFrame = css({
  width: '100%',
  backgroundColor: '#E9E9E9',
  borderRadius: '10px',
  padding: '45px',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  '@media (max-width: 1100px)': {
    width: 'auto',
    margin: '24px 0 48px 0',
    padding: '24px',
  },
});

const welcomeSection = css({
  width: '100%',
  height: '260px',
  backgroundColor: '#CDD1D5',
  borderRadius: '20px',
  position: 'relative',
  display: 'flex',
  margin: '0 auto 24px auto',
  '@media (max-width: 1000px)': {
    width: '100%',
    height: 'auto',
    flexDirection: 'column',
    padding: '20px',
  },
});

const welcomeContent = css({
  padding: '39px',
  width: '60%',
  '@media (max-width: 1000px)': {
    width: '100%',
    padding: '20px',
  },
});

const welcomeTitle = css({
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '22px',
  lineHeight: '130%',
  display: 'flex',
  alignItems: 'center',
  color: '#2D2D2D',
  marginBottom: '16px',
});

const welcomeText = css({
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '16px',
  lineHeight: '135%',
  display: 'flex',
  alignItems: 'center',
  color: '#1E1E1E',
  maxWidth: '558px',
});

const featureCardButton = css({
  width: '205px',
  height: '56px',
  display: 'flex',
});

// Account Abstraction icon
const AccountAbstractionIcon = () => (
  <div style={{ position: 'relative', width: '50px', height: '50px' }}>
    <div
      style={{
        position: 'absolute',
        width: '30px',
        height: '30px',
        left: '3.22px',
        top: '4.79px',
        background: '#2D2D2D',
        borderRadius: '50%',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '6px',
        height: '6px',
        left: '6.86px',
        top: '16.79px',
        background: '#9894FF',
        borderRadius: '50%',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '27.12px',
        height: '27.12px',
        left: '19.66px',
        top: '18.09px',
        background: '#9894FF',
        borderRadius: '3.2455px',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '6px',
        height: '6px',
        left: '38.84px',
        top: '37.23px',
        background: '#2D2D2D',
        borderRadius: '50%',
      }}
    />
  </div>
);

// Private Voting icon
const PrivateVotingIcon = () => (
  <div style={{ position: 'relative', width: '50px', height: '50px' }}>
    <div
      style={{
        position: 'absolute',
        width: '40.75px',
        height: '27.12px',
        left: 'calc(50% - 40.75px/2)',
        top: '18.45px',
        background: '#9894FF',
        borderRadius: '3.2455px',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '25.98px',
        height: '27.12px',
        left: 'calc(50% - 25.98px/2 - 0.57px)',
        top: '4.41px',
        background: '#2D2D2D',
        borderRadius: '3.2455px',
        transform: 'rotate(-90deg)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '6px',
        height: '6px',
        left: '22px',
        top: '8.42px',
        background: '#9894FF',
        borderRadius: '50%',
      }}
    />
  </div>
);

// Private Tokens icon
const PrivateTokensIcon = () => (
  <div style={{ position: 'relative', width: '50px', height: '50px' }}>
    <div
      style={{
        position: 'absolute',
        width: '20.44px',
        height: '20.44px',
        left: '3.8px',
        top: '3.8px',
        background: '#9894FF',
        borderRadius: '50%',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '20.44px',
        height: '20.44px',
        left: '25.76px',
        top: '3.8px',
        background: '#2D2D2D',
        borderRadius: '50%',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '20.44px',
        height: '20.44px',
        left: '3.8px',
        top: '25.76px',
        background: '#2D2D2D',
        borderRadius: '50%',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: '20.44px',
        height: '20.44px',
        left: '25.76px',
        top: '25.76px',
        background: '#9894FF',
        borderRadius: '50%',
      }}
    />
  </div>
);

export function Landing() {
  const {
    setCurrentContractArtifact,
    setShowContractInterface,
    walletDB,
    pxe,
  } = useContext(AztecContext);

  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [isLoadingPrivateVoting, setIsLoadingPrivateVoting] = useState(false);
  const [isLoadingPrivateTokens, setIsLoadingPrivateTokens] = useState(false);

  const { sendTx } = useTransaction();

  async function handleContractButtonClick(contractValue: string) {
    let contractArtifactJSON;
    switch (contractValue) {
      case PREDEFINED_CONTRACTS.SIMPLE_VOTING:
        ({ EasyPrivateVotingContractArtifact: contractArtifactJSON } = await import(
          '@aztec/noir-contracts.js/EasyPrivateVoting'
        ));
        break;
      case PREDEFINED_CONTRACTS.SIMPLE_TOKEN:
        ({ SimpleTokenContractArtifact: contractArtifactJSON } = await import(
          '@aztec/noir-contracts.js/SimpleToken'
        ));
        break;
    }
    const contractArtifact = await loadContractArtifact(contractArtifactJSON);
    setCurrentContractArtifact(contractArtifact);
    setShowContractInterface(true);
  }

  async function handleCreateAccountButtonClick() {
    setIsCreatingAccount(true);
    try {
      const salt = Fr.random();
      const secretKey = Fr.random();
      const signingKey = randomBytes(32);
      const accountManager = await getEcdsaRAccount(pxe, secretKey, signingKey, salt);
      const accountWallet = await accountManager.getWallet();
      await accountManager.register();
      await walletDB.storeAccount(accountWallet.getAddress(), {
        type: 'ecdsasecp256r1',
        secretKey: accountWallet.getSecretKey(),
        alias: 'My Account 1',
        salt,
        signingKey,
      });

      const { prepareForFeePayment } = await import('../../../utils/sponsoredFPC');
      const feePaymentMethod = await prepareForFeePayment(pxe);

      const deployMethod = await accountManager.getDeployMethod();
      const opts = {
        contractAddressSalt: salt,
        fee: {
          paymentMethod: await accountManager.getSelfPaymentMethod(feePaymentMethod),
        },
        universalDeploy: true,
        skipClassRegistration: true,
        skipPublicDeployment: true,
      };
      // onClose(accountWallet, publiclyDeploy, deployMethod, opts);

      const deploymentResult = await sendTx(`Deployment of account`, deployMethod, accountWallet.getAddress(), opts);
      if (deploymentResult) {
        // setAccounts([
        //   ...accounts,
        //   { key: `accounts:${accountWallet.getAddress()}`, value: accountWallet.getAddress().toString() },
        // ]);
        // setWallet(accountWallet);
      } else {
        // Temporarily remove from accounts if deployment fails
        await walletDB.deleteAccount(accountWallet.getAddress());
      }
    } catch (e) {
      console.error(e);
      setIsCreatingAccount(false);
    } finally {
      setIsCreatingAccount(false);
    }
  }

  return (
    <div css={landingPage}>
      <div css={contentFrame}>
        <div css={welcomeSection}>
          <div css={welcomeContent}>
            <div css={welcomeTitle}>Deploy Privacy-Preserving Smart Contracts</div>
            <div css={welcomeText}>
              Get started deploying and interacting with smart contracts on Aztec.
              Create an aztec account, try one of our default contracts or upload your own and interact with
              public and private functions made possible by client-side ZK proofs created in your browser.
            </div>
          </div>
          <div style={{ width: '40%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img src={welcomeIconURL} alt="Welcome visualization" style={{ maxWidth: '100%', maxHeight: '200px' }} />
          </div>
        </div>

        <div css={cardsContainer}>
          <div css={featureCard}>
            <Box>
              <div css={cardIcon}>
                <AccountAbstractionIcon />
              </div>
              <div css={cardTitle}>Account Abstraction</div>
              <div css={cardDescription}>Aztec’s native account abstraction turns every account into a smart contract, enabling
                highly flexible and programmable user identities that unlock features like gas sponsorship, nonce abstraction
                (setting your own tx ordering), and the use of alternative signature schemes to control smart contracts with e.g. passkeys. </div>
            </Box>
            <Button variant="contained" css={featureCardButton} onClick={handleCreateAccountButtonClick}>
              {isCreatingAccount ? <CircularProgress size={20} variant="determinate" /> : 'Create Account'}
            </Button>
          </div>

          <div css={featureCard}>
            <Box>
              <div css={cardIcon}>
                <PrivateVotingIcon />
              </div>
              <div css={cardTitle}>Private Voting</div>
              <div css={cardDescription}>Developers can seamlessly integrate public and private functions to unlock use cases like
                private voting. Voters can hide their address and cast their votes privately through a private function, which internally
                calls a public function to update the vote count transparently. </div>
            </Box>

            <Button variant="contained" css={featureCardButton} onClick={async () => {
              setIsLoadingPrivateVoting(true);
              await handleContractButtonClick(PREDEFINED_CONTRACTS.SIMPLE_VOTING);
              setIsLoadingPrivateVoting(false);
            }}>
              {isLoadingPrivateVoting ? <CircularProgress /> : 'Check it out'}
            </Button>
          </div>

          <div css={featureCard}>
            <Box>
              <div css={cardIcon}>
                <PrivateTokensIcon />
              </div>
              <div css={cardTitle}>Private Tokens</div>
              <div css={cardDescription}>Accounts, transactions, and execution on Aztec can be done privately using client-side proofs, enabling you
                to private mint or transfer tokens, move public tokens into private domain or the reverse - transfer tokens from private to public,
                all without revealing your address or even the amount and recipient (in case of private transfer), all the while maintaining the
                total supply of tokens publicly.</div>
            </Box>

            <Button variant="contained" css={featureCardButton} onClick={async () => {
              setIsLoadingPrivateTokens(true);
              await handleContractButtonClick(PREDEFINED_CONTRACTS.SIMPLE_TOKEN);
              setIsLoadingPrivateTokens(false);
            }}>
              {isLoadingPrivateTokens ? <CircularProgress /> : 'Check it out'}
            </Button>
          </div>
        </div>

        {/* <div css={{ marginTop: '3rem' }}>
          <span>Go ahead and select a network and create an account.
            If testnet is down, you can also download our sandbox </span>
          <a href="https://docs.aztec.network/developers/getting_started" target="_blank" rel="noopener noreferrer">here</a>
          <span> and connect playground to it</span>
        </div>
        <div css={getStartedButton}>Get Started</div> */}
      </div>
    </div>
  );
}
