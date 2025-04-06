import { css, Global } from '@emotion/react';
import { ContractComponent } from '../contract/contract';
import { SidebarComponent } from '../sidebar/sidebar';
import { useEffect, useState, useRef } from 'react';
import { AztecContext, AztecEnv } from '../../aztecEnv';
import { LogPanel } from '../logPanel/logPanel';
import logoURL from '../../assets/aztec_logo.png';
import welcomeIconURL from '../../assets/welcome_icon.svg';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { NetworkSelector } from '../sidebar/components/NetworkSelector';
import { AccountSelector } from '../sidebar/components/AccountSelector';
import { ContractSelector } from '../sidebar/components/ContractSelector';
import { parseAliasedBuffersAsString } from '../../utils/conversion';
import { getAccountsAndSenders } from '../sidebar/utils/accountHelpers';
import { loadContracts } from '../sidebar/utils/contractHelpers';
import { loadNetworks, connectToNetwork } from '../sidebar/utils/networkHelpers';
import { NETWORKS } from '../sidebar/constants';
import type { Network, AliasedItem } from '../sidebar/types';
import { ButtonWithModal } from '../sidebar/components/ButtonWithModal';
import { LoadingModal } from '../common/LoadingModal';

// Global styles to ensure full height
const globalStyles = css`
  html, body, #root {
    height: 100%;
    min-height: 100vh;
    margin: 0;
    padding: 0;
  }

  body {
    overflow-y: auto;
    background: linear-gradient(180deg, #9894FF 0%, #CDD1D5 100%) no-repeat fixed;
    background-size: cover;
  }

  #root {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
`;

const layout = css({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  width: '100%',
  flex: 1,
});

const contentLayout = css({
  display: 'flex',
  flexDirection: 'row',
  flex: 1,
  width: '100%',
  minHeight: 0,
  '@media (max-width: 1200px)': {
    flexDirection: 'column',
  },
});

const logo = css({
  width: '80px',
  height: 'auto',
  objectFit: 'contain',
  marginRight: '1rem',
});

const sidebarContainer = css({
  width: '300px',
  backgroundColor: '#E9E9E9',
  overflow: 'auto',
  flexShrink: 0,
  flexGrow: 0,
  borderRadius: '10px',
  margin: '0 0 48px 60px',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  transition: 'all 0.3s ease-out',
  paddingTop: '20px',
  '@media (max-width: 1200px)': {
    width: 'auto',
    minWidth: 'auto',
    maxHeight: '300px',
    margin: '0 24px 48px 24px',
  },
});

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

const headerFrame = css({
  width: 'calc(100% - 120px)',
  height: '100px',
  margin: '36px 60px 30px',
  backgroundColor: '#CDD1D5',
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  padding: '0 40px',
  position: 'relative',
  '@media (max-width: 1400px)': {
    width: 'calc(100% - 48px)',
    margin: '36px 24px 30px',
  },
});

const headerTitle = css({
  fontFamily: '"Space Grotesk", sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '42px',
  lineHeight: '48px',
  display: 'flex',
  alignItems: 'center',
  letterSpacing: '0.03em',
  color: '#2D2D2D',
  textDecoration: 'none',
});

const docsButton = css({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '12px 24px',
  gap: '8px',
  position: 'absolute',
  width: '160px',
  height: '42px',
  right: '40px',
  background: '#8C7EFF',
  boxShadow: '0px 0px 0px 1px #715EC2, 0px 0px 0px 3px rgba(247, 249, 255, 0.08)',
  borderRadius: '6px',
  color: '#FFFFFF',
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '16px',
  lineHeight: '20px',
  cursor: 'pointer',
  textDecoration: 'none',
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
  height: '250px',
  display: 'flex',
  flexDirection: 'column',
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
});

const contentFrame = css({
  width: '100%',
  backgroundColor: '#E9E9E9',
  borderRadius: '10px',
  padding: '45px',
  margin: '0 0 48px 0',
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

const mainContent = css({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  margin: '0 60px 0 24px',
  '@media (max-width: 1200px)': {
    minHeight: 'auto',
    margin: '0 24px',
  },
});

const getStartedButton = css({
  width: '205px',
  height: '56px',
  backgroundColor: '#CDD1D5',
  borderRadius: '12px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontFamily: 'Inter, sans-serif',
  fontWeight: 600,
  fontSize: '17px',
  lineHeight: '16px',
  margin: '20px auto 0',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: '#BCC0C4',
  }
});

const sidebarButton = css({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '15px 32px',
  gap: '8px',
  width: '230px',
  height: '50px',
  margin: '8px auto',
  background: '#CDD1D5',
  borderRadius: '12px',
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '17px',
  lineHeight: '16px',
  color: '#000000',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: '#BCC0C4',
  }
});

const sidebarButtonActive = css({
  background: '#9894FF',
  color: '#FFFFFF',
  '&:hover': {
    backgroundColor: '#8C7EFF',
  }
});

const flashAnimation = css({
  animation: 'flash 1s ease-in-out',
  '@keyframes flash': {
    '0%': { backgroundColor: '#E9E9E9' },
    '50%': { backgroundColor: '#9894FF' },
    '100%': { backgroundColor: '#E9E9E9' },
  }
});

// Account Abstraction icon
const AccountAbstractionIcon = () => (
  <div style={{ position: 'relative', width: '50px', height: '50px' }}>
    <div style={{
      position: 'absolute',
      width: '30px',
      height: '30px',
      left: '3.22px',
      top: '4.79px',
      background: '#2D2D2D',
      borderRadius: '50%'
    }} />
    <div style={{
      position: 'absolute',
      width: '6px',
      height: '6px',
      left: '6.86px',
      top: '16.79px',
      background: '#9894FF',
      borderRadius: '50%'
    }} />
    <div style={{
      position: 'absolute',
      width: '27.12px',
      height: '27.12px',
      left: '19.66px',
      top: '18.09px',
      background: '#9894FF',
      borderRadius: '3.2455px'
    }} />
    <div style={{
      position: 'absolute',
      width: '6px',
      height: '6px',
      left: '38.84px',
      top: '37.23px',
      background: '#2D2D2D',
      borderRadius: '50%'
    }} />
  </div>
);

// Private Voting icon
const PrivateVotingIcon = () => (
  <div style={{ position: 'relative', width: '50px', height: '50px' }}>
    <div style={{
      position: 'absolute',
      width: '40.75px',
      height: '27.12px',
      left: 'calc(50% - 40.75px/2)',
      top: '18.45px',
      background: '#9894FF',
      borderRadius: '3.2455px'
    }} />
    <div style={{
      position: 'absolute',
      width: '25.98px',
      height: '27.12px',
      left: 'calc(50% - 25.98px/2 - 0.57px)',
      top: '4.41px',
      background: '#2D2D2D',
      borderRadius: '3.2455px',
      transform: 'rotate(-90deg)'
    }} />
    <div style={{
      position: 'absolute',
      width: '6px',
      height: '6px',
      left: '22px',
      top: '8.42px',
      background: '#9894FF',
      borderRadius: '50%'
    }} />
  </div>
);

// Private Tokens icon
const PrivateTokensIcon = () => (
  <div style={{ position: 'relative', width: '50px', height: '50px' }}>
    <div style={{
      position: 'absolute',
      width: '20.44px',
      height: '20.44px',
      left: '3.8px',
      top: '3.8px',
      background: '#9894FF',
      borderRadius: '50%'
    }} />
    <div style={{
      position: 'absolute',
      width: '20.44px',
      height: '20.44px',
      left: '25.76px',
      top: '3.8px',
      background: '#2D2D2D',
      borderRadius: '50%'
    }} />
    <div style={{
      position: 'absolute',
      width: '20.44px',
      height: '20.44px',
      left: '3.8px',
      top: '25.76px',
      background: '#2D2D2D',
      borderRadius: '50%'
    }} />
    <div style={{
      position: 'absolute',
      width: '20.44px',
      height: '20.44px',
      left: '25.76px',
      top: '25.76px',
      background: '#9894FF',
      borderRadius: '50%'
    }} />
  </div>
);

export default function Home() {
  const [pxe, setPXE] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [nodeURL, setNodeURL] = useState('');
  const [node, setAztecNode] = useState(null);
  const [isPXEInitialized, setPXEInitialized] = useState(false);
  const [walletAlias, setWalletAlias] = useState('');
  const [walletDB, setWalletDB] = useState(null);
  const [currentContract, setCurrentContract] = useState(null);
  const [currentTx, setCurrentTx] = useState(null);
  const [currentContractAddress, setCurrentContractAddress] = useState(null);
  const [selectedPredefinedContract, setSelectedPredefinedContract] = useState('');
  const [logs, setLogs] = useState([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [showContractInterface, setShowContractInterface] = useState(false);
  const [sidebarFlash, setSidebarFlash] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  // Track which sidebar section is active
  const [activeSection, setActiveSection] = useState<'network' | 'account' | 'contract' | null>(null);

  // Track network/account/contract status for button text
  const [isNetworkConnected, setIsNetworkConnected] = useState(false);
  const [accounts, setAccounts] = useState<AliasedItem[]>([]);
  const [contracts, setContracts] = useState<AliasedItem[]>([]);
  const [networks, setNetworks] = useState<Network[]>(NETWORKS);
  const [isConnecting, setIsConnecting] = useState(false);
  const [changingNetworks, setChangingNetworks] = useState(false);

  const [isNetworkStoreInitialized, setIsNetworkStoreInitialized] = useState(false);
  const sidebarRef = useRef(null);

  useEffect(() => {
    const initNetworkStore = async () => {
      await AztecEnv.initNetworkStore();
      setIsNetworkStoreInitialized(true);
    };
    initNetworkStore();
  }, []);

  // Only show contract interface when a contract is loaded
  useEffect(() => {
    if (currentContract || currentContractAddress) {
      setShowContractInterface(true);
    }
  }, [currentContract, currentContractAddress]);

  // Handle sidebar flash animation
  useEffect(() => {
    if (sidebarFlash) {
      const timer = setTimeout(() => {
        setSidebarFlash(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [sidebarFlash]);

  // Track network connection status
  useEffect(() => {
    setIsNetworkConnected(!!nodeURL);
  }, [nodeURL]);

  // Load networks from storage
  useEffect(() => {
    // Only try to load networks after the network store is initialized
    if (isNetworkStoreInitialized) {
      loadNetworks()
        .then(networks => setNetworks(networks))
        .catch(error => console.error('Error loading networks:', error));
    }
  }, [isNetworkStoreInitialized]);

  // Setup event listener for network connect request
  useEffect(() => {
    const handleShowNetworkConnect = () => {
      // Activate the network section
      setActiveSection('network');
      // Flash the sidebar to draw attention
      flashSidebar();
    };

    // Add event listener
    window.addEventListener('aztec:showNetworkConnect', handleShowNetworkConnect);

    // Clean up
    return () => {
      window.removeEventListener('aztec:showNetworkConnect', handleShowNetworkConnect);
    };
  }, []);

  // Load contracts when wallet or address changes
  useEffect(() => {
    if (walletDB) {
      loadContracts(walletDB)
        .then(contracts => setContracts(contracts))
        .catch(error => console.error('Error loading contracts:', error));
    }
  }, [currentContractAddress, walletDB]);

  // Load accounts
  useEffect(() => {
    const refreshAccounts = async () => {
      try {
        if (!walletDB || !pxe) return;

        const { ourAccounts } = await getAccountsAndSenders(walletDB, pxe);
        // Make sure accounts are properly formatted
        const formattedAccounts = ourAccounts.map(account => {
          // Ensure account value is a string
          if (typeof account.value !== 'string') {
            account.value = account.value.toString();
          }
          return account;
        });

        setAccounts(formattedAccounts);
      } catch (error) {
        console.error('Error refreshing accounts:', error);
      }
    };

    if (walletDB && pxe && isPXEInitialized) {
      refreshAccounts();
    }
  }, [wallet, walletDB, pxe, isPXEInitialized]);

  const flashSidebar = () => {
    setSidebarFlash(true);
    // Scroll to the top of the sidebar if needed
    if (sidebarRef.current) {
      sidebarRef.current.scrollTop = 0;
    }
    // Don't set any active section - just flash the sidebar
  };

  const handleSectionToggle = (section: 'network' | 'account' | 'contract') => {
    // Always set the active section, don't toggle off when clicking the same section
    setActiveSection(section);

    // No more checks - allow all sections to be accessible regardless of network connection
  };

  // Get the current network name
  const getCurrentNetworkName = () => {
    if (!nodeURL) return "";

    const network = networks.find(n => n.nodeURL === nodeURL);
    return network ? network.name : "Network";
  };

  // Get button text based on connection state
  const getNetworkButtonText = () => {
    if (isConnecting) return "Auto-connecting...";
    if (isNetworkConnected) return `Connected to ${getCurrentNetworkName()}`;
    return "Connect to Network";
  };

  const getAccountButtonText = () => {
    if (!wallet) return "Connect Account";

    const account = accounts.find(a => a.value === wallet.getAddress().toString());
    if (account) {
      return `${account.key} Account`;
    }
    return "Account Connected";
  };

  const getContractButtonText = () => {
    if (!currentContractAddress && !selectedPredefinedContract) return "Select Contract";

    if (selectedPredefinedContract) {
      return `${selectedPredefinedContract} Selected`;
    }

    const contract = contracts.find(c => c.value === currentContractAddress?.toString());
    if (contract) {
      return `${contract.key} Contract`;
    }
    return "Contract Selected";
  };

  const AztecContextInitialValue = {
    pxe,
    nodeURL,
    wallet,
    isPXEInitialized,
    walletAlias,
    walletDB,
    currentContract,
    currentTx,
    node,
    currentContractAddress,
    selectedPredefinedContract,
    logs,
    logsOpen,
    drawerOpen: false,
    isWorking,
    setLogsOpen,
    setLogs,
    setAztecNode,
    setCurrentTx,
    setWalletDB,
    setPXEInitialized,
    setWallet,
    setPXE,
    setNodeURL,
    setWalletAlias,
    setCurrentContract,
    setCurrentContractAddress,
    setSelectedPredefinedContract,
    setShowContractInterface,
    setDrawerOpen: () => {},
    setIsWorking,
  };

  // Render only the selected section content
  const renderSectionContent = () => {
    if (!isNetworkStoreInitialized) {
      return <LinearProgress />;
    }

    switch (activeSection) {
      case 'network':
        return (
          <NetworkSelector
            networks={networks}
            currentNodeURL={nodeURL}
            onNetworksChange={setNetworks}
            setNodeURL={setNodeURL}
            setPXEInitialized={setPXEInitialized}
            setAztecNode={setAztecNode}
            setPXE={setPXE}
            setWalletDB={setWalletDB}
            setLogs={setLogs}
            setChangingNetworks={setChangingNetworks}
          />
        );
      case 'account':
        return (
          <AccountSelector
            accounts={accounts}
            currentWallet={wallet}
            isPXEInitialized={isPXEInitialized}
            pxe={pxe}
            walletDB={walletDB}
            changingNetworks={changingNetworks}
            isConnecting={isConnecting}
            setWallet={setWallet}
            onAccountsChange={() => {
              if (pxe && walletDB) {
                getAccountsAndSenders(walletDB, pxe)
                  .then(({ourAccounts}) => setAccounts(ourAccounts))
                  .catch(error => console.error('Error refreshing accounts:', error));
              }
            }}
          />
        );
      case 'contract':
        return (
          <ContractSelector
            contracts={contracts}
            currentContractAddress={currentContractAddress}
            selectedPredefinedContract={selectedPredefinedContract}
            wallet={wallet}
            walletDB={walletDB}
            setSelectedPredefinedContract={setSelectedPredefinedContract}
            setCurrentContractAddress={setCurrentContractAddress}
            setShowContractInterface={setShowContractInterface}
            onAccountsChange={() => {
              if (pxe && walletDB) {
                getAccountsAndSenders(walletDB, pxe)
                  .then(({ourAccounts}) => setAccounts(ourAccounts))
                  .catch(error => console.error('Error refreshing accounts:', error));
              }
            }}
          />
        );
      default:
        return null;
    }
  };

  const renderLandingPage = () => (
    <div css={landingPage}>
      <div css={contentFrame}>
        <div css={welcomeSection}>
          <div css={welcomeContent}>
            <div css={welcomeTitle}>Welcome to the Playground</div>
            <div css={welcomeText}>
              Playground is a web-app for interacting with Aztec.
              Create an aztec account, try one of our default contracts or upload your
              own and interact with it while creating client side proofs in the browser!
              It is a minimalistic remix.ethereum.org but for Aztec
            </div>
          </div>
          <div style={{ width: '40%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img src={welcomeIconURL} alt="Welcome visualization" style={{ maxWidth: '100%', maxHeight: '200px' }} />
          </div>
        </div>

        <div css={cardsContainer}>
          <div css={featureCard}>
            <div css={cardIcon}>
              <AccountAbstractionIcon />
            </div>
            <div css={cardTitle}>
              Account Abstraction
            </div>
            <div css={cardDescription}>
              Short description of what account abstraction is and how it's being used
            </div>
          </div>

          <div css={featureCard}>
            <div css={cardIcon}>
              <PrivateVotingIcon />
            </div>
            <div css={cardTitle}>
              Private Voting
            </div>
            <div css={cardDescription}>
              Short description of how a user could setup private voting
            </div>
          </div>

          <div css={featureCard}>
            <div css={cardIcon}>
              <PrivateTokensIcon />
            </div>
            <div css={cardTitle}>
              Private Tokens
            </div>
            <div css={cardDescription}>
              Short description of what is possible with private tokens
            </div>
          </div>
        </div>

        <div css={getStartedButton} onClick={flashSidebar}>
          Get Started
        </div>
      </div>
    </div>
  );

  // Connect to devnet when starting up
  useEffect(() => {
    if (!nodeURL && !changingNetworks && !isConnecting && isNetworkStoreInitialized) {
      setIsConnecting(true);
      const defaultNetwork = NETWORKS[0].nodeURL;
      connectToNetwork(
        defaultNetwork,
        setNodeURL,
        setPXEInitialized,
        setAztecNode,
        setPXE,
        setWalletDB,
        setLogs
      )
        .then(() => {
          setIsConnecting(false);
          // Set network as active section after successful connection
          setActiveSection('network');
        })
        .catch(error => {
          console.error('Error connecting to default network:', error);
          setIsConnecting(false);
        });
    }
  }, [nodeURL, changingNetworks, isConnecting, isNetworkStoreInitialized]);

  return (
    <div css={layout}>
      <Global styles={globalStyles} />
      <div css={headerFrame}>
        <img css={logo} src={logoURL} alt="Aztec Logo" />
        <div css={headerTitle}>PLAYGROUND</div>
        <a
          href="https://docs.aztec.network/developers/inspiration"
          target="_blank"
          rel="noopener noreferrer"
          css={docsButton}
          style={{ textDecoration: 'none' }}
        >
          Go to Docs
        </a>
      </div>

      <div css={contentLayout}>
        <AztecContext.Provider value={AztecContextInitialValue}>
          <LoadingModal />
          <div
            css={[sidebarContainer, sidebarFlash && flashAnimation]}
            ref={sidebarRef}
            style={{height: showContractInterface ? '889px' : 'auto'}}
          >
            {/* Network button with modal */}
            <ButtonWithModal
              label="Connect to Network"
              isActive={activeSection === 'network'}
              isSelected={isNetworkConnected}
              isLoading={isConnecting}
              connectionStatus={isNetworkConnected ? `Connected to ${getCurrentNetworkName()}` : undefined}
              onClick={() => handleSectionToggle('network')}
            >
              <NetworkSelector
                networks={networks}
                currentNodeURL={nodeURL}
                onNetworksChange={setNetworks}
                setNodeURL={setNodeURL}
                setPXEInitialized={setPXEInitialized}
                setAztecNode={setAztecNode}
                setPXE={setPXE}
                setWalletDB={setWalletDB}
                setLogs={setLogs}
                setChangingNetworks={setChangingNetworks}
              />
            </ButtonWithModal>

            {/* Account button with modal */}
            <ButtonWithModal
              label="Connect Account"
              isActive={activeSection === 'account'}
              isSelected={!!wallet}
              connectionStatus={wallet ? getAccountButtonText() : undefined}
              onClick={() => handleSectionToggle('account')}
            >
              <AccountSelector
                accounts={accounts}
                currentWallet={wallet}
                isPXEInitialized={isPXEInitialized}
                pxe={pxe}
                walletDB={walletDB}
                changingNetworks={changingNetworks}
                isConnecting={isConnecting}
                setWallet={setWallet}
                onAccountsChange={() => {
                  if (pxe && walletDB) {
                    getAccountsAndSenders(walletDB, pxe)
                      .then(({ourAccounts}) => setAccounts(ourAccounts))
                      .catch(error => console.error('Error refreshing accounts:', error));
                  }
                }}
              />
            </ButtonWithModal>

            {/* Contract button with modal */}
            <ButtonWithModal
              label="Select Contract"
              isActive={activeSection === 'contract'}
              isSelected={!!(currentContractAddress || selectedPredefinedContract)}
              connectionStatus={currentContractAddress || selectedPredefinedContract ? getContractButtonText() : undefined}
              onClick={() => handleSectionToggle('contract')}
            >
              <ContractSelector
                contracts={contracts}
                currentContractAddress={currentContractAddress}
                selectedPredefinedContract={selectedPredefinedContract}
                wallet={wallet}
                walletDB={walletDB}
                setSelectedPredefinedContract={setSelectedPredefinedContract}
                setCurrentContractAddress={setCurrentContractAddress}
                setShowContractInterface={setShowContractInterface}
                onAccountsChange={() => {
                  if (pxe && walletDB) {
                    getAccountsAndSenders(walletDB, pxe)
                      .then(({ourAccounts}) => setAccounts(ourAccounts))
                      .catch(error => console.error('Error refreshing accounts:', error));
                  }
                }}
              />
            </ButtonWithModal>
          </div>

          <div css={mainContent}>
            {showContractInterface ? <ContractComponent /> : renderLandingPage()}
          </div>
          <LogPanel />
        </AztecContext.Provider>
      </div>
    </div>
  );
}
