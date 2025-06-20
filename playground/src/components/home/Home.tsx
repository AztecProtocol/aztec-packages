import { css } from '@emotion/react';
import { ContractComponent } from '../contract/Contract';
import { NavBar } from '../sidebar/NavBar';
import { useState } from 'react';
import { AztecContext } from '../../aztecEnv';
import { LogPanel } from '../logPanel/LogPanel';
import { Landing } from './components/Landing';
import logoURL from '../../assets/aztec_logo.png';
import { TxPanel } from '../sidebar/TxPanel';
import { trackButtonClick } from '../../utils/matomo';

const container = css({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  maxWidth: '1400px',
  padding: '0 1rem',
  margin: '0 auto',
});

const headerFrame = css({
  display: 'flex',
  alignItems: 'center',
  marginTop: '1rem',
  marginBottom: '2rem',
  backgroundColor: '#ffffff38',
  borderRadius: '10px',
  padding: '12px',
  height: '80px',
  '@media (max-width: 900px)': {
    height: '60px',
    padding: '0.5rem',
  },
});

const logo = css({
  width: '120px',
  marginLeft: '1rem',
  marginTop: '2px',
  '@media (max-width: 900px)': {
    width: '90px',
    marginLeft: '0.5rem',
    marginRight: '0.5rem',
  },
});

const headerTitle = css({
  fontWeight: 500,
  fontSize: '24px',
  lineHeight: '48px',
  letterSpacing: '0.03em',
  color: '#2D2D2D',
  textDecoration: 'none',
  marginLeft: '1rem',
  flexGrow: 1,
  '@media (max-width: 900px)': {
    fontSize: '18px',
    lineHeight: '20px',
    marginLeft: '0rem',
  },
});

const docsButton = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#8C7EFF',
  textDecoration: 'none',
  borderRadius: '6px',
  fontWeight: 500,
  color: '#FFFFFF',
  fontSize: '16px',
  minWidth: '100px',
  padding: '10px 16px',
  '@media (max-width: 900px)': {
    padding: '8px 10px',
    fontSize: '14px',
    fontWeight: 600,
  },
});

const contentLayout = css({
  display: 'flex',
  flexDirection: 'row',
  position: 'relative',
  gap: '24px',
  flexGrow: 1,
  paddingBottom: '4rem', // For the logs panel
  '@media (max-width: 900px)': {
    flexWrap: 'wrap',
    maxHeight: 'auto',
  },
});

export default function Home() {
  const [pxe, setPXE] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [showContractInterface, setShowContractInterface] = useState(false);
  const [node, setAztecNode] = useState(null);
  const [isPXEInitialized, setPXEInitialized] = useState(false);
  const [walletAlias, setWalletAlias] = useState('');
  const [walletDB, setWalletDB] = useState(null);
  const [currentContractArtifact, setCurrentContractArtifact] = useState(null);
  const [currentTx, setCurrentTx] = useState(null);
  const [currentContractAddress, setCurrentContractAddress] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [network, setNetwork] = useState(null);
  const [totalLogCount, setTotalLogCount] = useState(0);
  const [defaultContractCreationParams, setDefaultContractCreationParams] = useState({});
  const [pendingTxUpdateCounter, setPendingTxUpdateCounter] = useState(0);
  const [isNetworkCongested, setIsNetworkCongested] = useState(false);

  const AztecContextInitialValue = {
    pxe,
    connecting,
    network,
    wallet,
    isPXEInitialized,
    walletAlias,
    walletDB,
    currentContractArtifact,
    currentTx,
    node,
    currentContractAddress,
    logs,
    logsOpen,
    showContractInterface,
    totalLogCount,
    pendingTxUpdateCounter,
    defaultContractCreationParams,
    isNetworkCongested,
    setTotalLogCount,
    setIsNetworkCongested,
    setNetwork,
    setConnecting,
    setLogsOpen,
    setLogs,
    setAztecNode,
    setCurrentTx,
    setWalletDB,
    setPXEInitialized,
    setWallet,
    setPXE,
    setShowContractInterface,
    setDefaultContractCreationParams,
    setWalletAlias,
    setCurrentContractArtifact,
    setCurrentContractAddress,
    setPendingTxUpdateCounter,
  };

  return (
    <div css={container}>
      <div css={headerFrame}>
        <div
          role="button"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            setShowContractInterface(false);
          }}
        >
          <img css={logo} src={logoURL} alt="Aztec Logo" />
        </div>
        <div css={headerTitle}>Playground</div>
        <a
          href="https://docs.aztec.network/"
          target="_blank"
          rel="noopener noreferrer"
          css={docsButton}
          onClick={() => {
            trackButtonClick('Docs', 'Home Page');
          }}
        >
          Docs
        </a>
      </div>
      <AztecContext.Provider value={AztecContextInitialValue}>
        <NavBar />
        <div css={contentLayout}>
          {showContractInterface ? <ContractComponent /> : <Landing />}
          <TxPanel />
        </div>
        <LogPanel />
      </AztecContext.Provider>
    </div>
  );
}
