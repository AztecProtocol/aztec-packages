import { css } from '@emotion/react';
import welcomeIconURL from '../../../assets/welcome_icon.svg';
import { AztecAddress, Fr, TxStatus } from '@aztec/aztec.js';
import { useNotifications } from '@toolpad/core/useNotifications';
import { Box, Button, CircularProgress, Tooltip } from '@mui/material';
import { AztecContext } from '../../../aztecEnv';
import { useContext, useEffect, useState } from 'react';
import { PREDEFINED_CONTRACTS } from '../../../constants';
import { randomBytes } from '@aztec/foundation/crypto';
import { loadContractArtifact } from '@aztec/aztec.js';
import { getEcdsaRAccount } from '@aztec/accounts/ecdsa/lazy';
import { useTransaction } from '../../../hooks/useTransaction';
import {
  convertFromUTF8BufferAsString,
  formatFrAsString,
  parseAliasedBuffersAsString,
} from '../../../utils/conversion';
import { filterDeployedAliasedContracts } from '../../../utils/contracts';
import { parse } from 'buffer-json';
import { trackButtonClick } from '../../../utils/matomo';

const container = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-start',
  flex: 1,
  transition: 'width 0.3s ease-in',
  backgroundColor: '#ffffff38',
  borderRadius: '10px',
  padding: '2rem',
  position: 'relative',
  '@media (max-width: 1100px)': {
    width: 'auto',
    padding: '1rem',
  },
});

const cardsContainer = css({
  display: 'flex',
  flexDirection: 'row',
  gap: '24px',
  width: '100%',
  '& > *': {
    flex: '1 1 0px', // Makes all children equal width
  },
  '@media (max-width: 900px)': {
    flexDirection: 'column',
  },
});

const featureCard = css({
  background: '#ffffff38 !important',
  borderRadius: '10px',
  padding: '25px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  alignItems: 'center',
});

const cardIcon = css({
  width: '50px',
  height: '50px',
  marginBottom: '35px',
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
  fontWeight: 200,
  fontSize: '13px',
  lineHeight: '110%',
  letterSpacing: '0.01em',
  color: 'rgba(0, 0, 0, 0.8)',
  paddingTop: '1rem',
  paddingBottom: '2rem',
});

const cardButton = css({
  width: '200px',
  height: '48px',
  borderRadius: '6px',
  display: 'flex',
  '&:disabled': {
    backgroundColor: 'var(--mui-palette-primary-main)',
    opacity: 0.5,
  },
});

const welcomeCardContainer = css({
  display: 'flex',
  width: '100%',
  minHeight: '200px',
  borderRadius: '10px',
  position: 'relative',
  marginBottom: '1.5rem',
  '& > div': {
    flexDirection: 'row',
  },
  '@media (max-width: 900px)': {
    height: 'auto',
    padding: '0.5rem',
    '& > div': {
      flexDirection: 'column',
    },
  },
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
    setDefaultContractCreationParams,
    setCurrentContractAddress,
    walletDB,
    wallet,
    pxe,
    currentTx,
    isPXEInitialized,
    network,
    setWallet,
  } = useContext(AztecContext);

  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [isLoadingPrivateVoting, setIsLoadingPrivateVoting] = useState(false);
  const [isLoadingPrivateTokens, setIsLoadingPrivateTokens] = useState(false);

  const { sendTx } = useTransaction();
  const notifications = useNotifications();

  // If the transaction is cancelled, reset the accounts loading state
  useEffect(() => {
    if (!currentTx) {
      setIsCreatingAccount(false);
    }
  }, [currentTx]);

  async function handleContractButtonClick(contractValue: string) {
    trackButtonClick(`Check Out ${contractValue}`, 'Landing Page');

    let contractArtifactJSON;
    let defaultContractCreationParams;

    switch (contractValue) {
      case PREDEFINED_CONTRACTS.SIMPLE_VOTING: {
        ({ EasyPrivateVotingContractArtifact: contractArtifactJSON } = await import(
          '@aztec/noir-contracts.js/EasyPrivateVoting'
        ));

        defaultContractCreationParams = {
          initializer: 'constructor',
          alias: 'My Voting Contract',
        };

        // Fetch the first account to use as the admin
        const accountAliases = await walletDB.listAliases('accounts');
        const parsedAccountAliases = parseAliasedBuffersAsString(accountAliases);
        const currentAccountAlias = parsedAccountAliases.find(alias => alias.value === wallet?.getAddress().toString());

        if (currentAccountAlias) {
          defaultContractCreationParams.admin = {
            id: currentAccountAlias.value,
            label: `${currentAccountAlias.key} (${formatFrAsString(currentAccountAlias.value)})`,
          };
        }
        break;
      }
      case PREDEFINED_CONTRACTS.SIMPLE_TOKEN: {
        ({ SimpleTokenContractArtifact: contractArtifactJSON } = await import('@aztec/noir-contracts.js/SimpleToken'));
        defaultContractCreationParams = {
          initializer: 'constructor',
          name: 'My Token',
          symbol: 'TST',
          decimals: 18,
          alias: 'My Token',
        };
        break;
      }
    }

    let deployedContractAddress = null;
    const aliasedContracts = await walletDB.listAliases('contracts');
    if (wallet && aliasedContracts.length > 0) {
      const contracts = parseAliasedBuffersAsString(aliasedContracts);
      const deployedContracts = await filterDeployedAliasedContracts(contracts, wallet);
      for (const contract of deployedContracts) {
        const artifactAsString = await walletDB.retrieveAlias(`artifacts:${contract.value}`);
        const contractArtifact = loadContractArtifact(parse(convertFromUTF8BufferAsString(artifactAsString)));
        if (contractArtifact.name === contractArtifactJSON.name) {
          deployedContractAddress = AztecAddress.fromString(contract.value);
          break;
        }
      }
    }

    const contractArtifact = await loadContractArtifact(contractArtifactJSON);
    setCurrentContractArtifact(contractArtifact);

    if (deployedContractAddress) {
      setCurrentContractAddress(deployedContractAddress);
    } else {
      setDefaultContractCreationParams(defaultContractCreationParams);
    }
    setShowContractInterface(true);
  }

  async function handleCreateAccountButtonClick() {
    trackButtonClick('Create Account', 'Landing Page');
    setIsCreatingAccount(true);

    try {
      const salt = Fr.random();
      const secretKey = Fr.random();
      const signingKey = randomBytes(32);
      const accountManager = await getEcdsaRAccount(pxe, secretKey, signingKey, salt);
      const accountWallet = await accountManager.getWallet();
      await accountManager.register();

      const accountCount = (await walletDB.listAliases('accounts')).length;
      const accountName = `My Account ${accountCount + 1}`;
      await walletDB.storeAccount(accountWallet.getAddress(), {
        type: 'ecdsasecp256r1',
        secretKey: accountWallet.getSecretKey(),
        alias: accountName,
        salt,
        signingKey,
      });
      notifications.show('Account created. Deploying...', {
        severity: 'success',
      });

      const { prepareForFeePayment } = await import('../../../utils/sponsoredFPC');
      const feePaymentMethod = await prepareForFeePayment(
        pxe,
        network.sponsoredFPC?.address,
        network.sponsoredFPC?.version,
      );

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

      const txReceipt = await sendTx(`Deploy Account`, deployMethod, accountWallet.getAddress(), opts);

      if (txReceipt?.status === TxStatus.SUCCESS) {
        setWallet(await accountManager.getWallet());
      } else if (txReceipt?.status === TxStatus.DROPPED) {
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
    <div css={container}>
      <div css={welcomeCardContainer}>
        <div css={featureCard}>
          <div>
            <div css={cardTitle}>Deploy Privacy-Preserving Smart Contracts</div>
            <div css={cardDescription}>
              Get started deploying and interacting with smart contracts on Aztec. Create an aztec account, try one of
              our default contracts or upload your own and interact with public and private functions made possible by
              client-side ZK proofs created in your browser.
            </div>
          </div>
          <div
            style={{
              width: '40%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginLeft: '1rem',
            }}
          >
            <img src={welcomeIconURL} alt="Welcome visualization" style={{ maxWidth: '100%', maxHeight: '140px' }} />
          </div>
        </div>
      </div>

      <div css={cardsContainer}>
        <div css={featureCard}>
          <Box>
            <div css={cardIcon}>
              <AccountAbstractionIcon />
            </div>
            <div css={cardTitle}>Account Abstraction</div>
            <div css={cardDescription}>
              Aztec's native account abstraction turns every account into a smart contract, enabling highly flexible and
              programmable user identities that unlock features like gas sponsorship, nonce abstraction (setting your
              own tx ordering), and the use of alternative signature schemes to control smart contracts with e.g.
              passkeys.{' '}
            </div>
          </Box>

          <Tooltip
            title={!isPXEInitialized ? "Connect to a network to create an account" : ""}
            placement="top"
          >
            <span>
              <Button
                variant="contained"
                css={cardButton}
                onClick={handleCreateAccountButtonClick}
                disabled={isCreatingAccount || !isPXEInitialized}
              >
                {isCreatingAccount ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Create Account'}
              </Button>
            </span>
          </Tooltip>
        </div>

        <div css={featureCard}>
          <Box>
            <div css={cardIcon}>
              <PrivateVotingIcon />
            </div>
            <div css={cardTitle}>Private Voting</div>
            <div css={cardDescription}>
              Developers can seamlessly integrate public and private functions to unlock use cases like private voting.
              Voters can hide their address and cast their votes privately through a private function, which internally
              calls a public function to update the vote count transparently.{' '}
            </div>
          </Box>

          <Tooltip
            title={!wallet ? "Connect and account to deploy and interact with a contract" : ""}
            placement="top"
          >
            <span>
              <Button
                variant="contained"
                css={cardButton}
                onClick={async () => {
                  setIsLoadingPrivateVoting(true);
                  await handleContractButtonClick(PREDEFINED_CONTRACTS.SIMPLE_VOTING);
                  setIsLoadingPrivateVoting(false);
                }}
                disabled={isLoadingPrivateVoting || !wallet || isCreatingAccount}
              >
                {isLoadingPrivateVoting ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Check it out'}
              </Button>
            </span>
          </Tooltip>
        </div>

        <div css={featureCard}>
          <Box>
            <div css={cardIcon}>
              <PrivateTokensIcon />
            </div>
            <div css={cardTitle}>Private Tokens</div>
            <div css={cardDescription}>
              Accounts, transactions, and execution on Aztec can be done privately using client-side proofs, enabling
              you to private mint or transfer tokens, move public tokens into private domain or the reverse - transfer
              tokens from private to public, all without revealing your address or even the amount and recipient (in
              case of private transfer), all the while maintaining the total supply of tokens publicly.
            </div>
          </Box>

          <Tooltip
            title={!wallet ? "Connect and account to deploy and interact with a contract" : ""}
            placement="top"
          >
            <span>
              <Button
                variant="contained"
                css={cardButton}
                onClick={async () => {
                  setIsLoadingPrivateTokens(true);
                  await handleContractButtonClick(PREDEFINED_CONTRACTS.SIMPLE_TOKEN);
                  setIsLoadingPrivateTokens(false);
                }}
                disabled={isLoadingPrivateTokens || !wallet || isCreatingAccount}
              >
                {isLoadingPrivateTokens ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Check it out'}
              </Button>
            </span>
          </Tooltip>
        </div>

      </div>
    </div>
  );
}
