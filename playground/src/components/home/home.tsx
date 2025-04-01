import { css } from '@emotion/react';
import { ContractComponent } from '../contract/contract';
import { SidebarComponent } from '../sidebar/sidebar';
import { useEffect, useState, useRef } from 'react';
import { AztecContext, AztecEnv } from '../../aztecEnv';
import { LogPanel } from '../logPanel/logPanel';
import logoURL from '../../assets/Aztec_logo.png';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

const layout = css({
  display: 'flex',
  flexDirection: 'row',
  height: '100%',
  '@media (max-width: 1200px)': {
    flexDirection: 'column',
  },
});

const logo = css({
  width: '40px',
  height: '40px',
  padding: '0.5rem',
  marginBottom: '1rem',
});

const sidebarContainer = css({
  height: '100%',
  width: '300px',
  minWidth: '300px',
  backgroundColor: '#E9E9E9',
  overflow: 'auto',
  flexShrink: 0,
  flexGrow: 0,
  borderRadius: '10px',
  margin: '24px',
  boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
  transition: 'box-shadow 0.3s ease, transform 0.3s ease',
  display: 'flex',
  flexDirection: 'column',
  '@media (max-width: 1200px)': {
    width: 'auto',
    minWidth: 'auto',
    maxHeight: '300px',
    margin: '24px 24px 0 24px',
  },
});

const landingPage = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '0',
  height: '100%',
  width: '100%',
  overflow: 'auto',
});

const headerFrame = css({
  width: '1320px',
  height: '72px',
  margin: '24px auto',
  backgroundColor: '#CDD1D5',
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  padding: '0 38px',
  '@media (max-width: 1400px)': {
    width: 'auto',
    margin: '24px 24px',
  },
});

const cardsContainer = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '24px',
  width: '100%',
  maxWidth: '996px',
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
  width: '996px',
  backgroundColor: '#E9E9E9',
  borderRadius: '10px',
  padding: '45px',
  margin: '24px auto',
  minHeight: '889px',
  '@media (max-width: 1100px)': {
    width: 'auto',
    margin: '24px 24px',
    padding: '24px',
  },
});

const mainContent = css({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  height: '100%',
  overflow: 'auto',
  '@media (max-width: 1200px)': {
    height: 'auto',
    minHeight: 'calc(100vh - 350px)',
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
  margin: '20px auto',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: '#BCC0C4',
  }
});

const flashAnimation = css({
  animation: 'flash 1s ease-in-out',
  '@keyframes flash': {
    '0%': { boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)' },
    '25%': { boxShadow: '0px 0px 20px rgba(152, 148, 255, 0.8)' },
    '50%': { boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)' },
    '75%': { boxShadow: '0px 0px 20px rgba(152, 148, 255, 0.8)' },
    '100%': { boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)' },
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
      left: '4.62px',
      top: '18.45px',
      background: '#9894FF',
      borderRadius: '3.2455px'
    }} />
    <div style={{
      position: 'absolute',
      width: '25.98px',
      height: '27.12px',
      left: '12px',
      top: '30.41px',
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

  const flashSidebar = () => {
    setSidebarFlash(true);
    // Scroll to the top of the sidebar if needed
    if (sidebarRef.current) {
      sidebarRef.current.scrollTop = 0;
    }
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
  };

  const renderLandingPage = () => (
    <div css={landingPage}>
      <div css={headerFrame}>
        <Typography
          variant="h1"
          sx={{
            fontSize: '32px',
            fontWeight: 500,
            fontFamily: '"Space Grotesk", sans-serif',
            letterSpacing: '0.03em',
            color: '#2D2D2D',
            marginLeft: '140px'
          }}
        >
          PLAYGROUND
        </Typography>
      </div>

      <div css={contentFrame}>
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography
            variant="body1"
            sx={{
              fontSize: '24px',
              lineHeight: '120%',
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 500,
              textAlign: 'center',
              color: '#000000'
            }}
          >
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
            Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
          </Typography>
        </Box>

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

  return (
    <div css={layout}>
      <AztecContext.Provider value={AztecContextInitialValue}>
        <div
          css={[sidebarContainer, sidebarFlash && flashAnimation]}
          ref={sidebarRef}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
            <img css={logo} src={logoURL} alt="Aztec Logo" />
          </div>
          {isNetworkStoreInitialized ? <SidebarComponent /> : <LinearProgress />}
        </div>

        <div css={mainContent}>
          {showContractInterface ? <ContractComponent /> : renderLandingPage()}
        </div>
        <LogPanel />
      </AztecContext.Provider>
    </div>
  );
}
