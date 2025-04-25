import { css } from '@emotion/react';
import { ContractComponent } from '../contract/Contract';
import { NavBar } from '../sidebar/NavBar';
import { useState } from 'react';
import { AztecContext } from '../../aztecEnv';
import { LogPanel } from '../logPanel/LogPanel';
import { Landing } from './components/Landing';
import logoURL from '../../assets/aztec_logo.png';
import { LoadingModal } from '../common/LoadingModal';
import { SideBar } from '../sidebar/SideBar';

const layout = css({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  flex: 1,
});

const contentLayout = css({
  display: 'flex',
  gap: '24px',
  flexDirection: 'row',
  position: 'relative',
  // minHeight: 'calc(100% - 240px)',
  margin: '24px 60px',
  paddingBottom: '5rem',
  '@media (max-width: 1200px)': {
    height: 'auto',
    display: 'block',
    margin: '0 12px',
  },
});

const headerFrame = css({
  margin: '24px 60px',
  backgroundColor: '#CDD1D5',
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  padding: '12px 18px',
  flexWrap: 'wrap',
  '@media (max-width: 1200px)': {
    margin: '12px 12px 24px 12px',
    padding: '3px 12px',
  },
});

const logo = css({
  height: '40px',
  objectFit: 'contain',
  marginRight: '1rem',
  '@media (max-width: 1200px)': {
    height: 'auto',
    width: '120px',
    marginRight: '0.1rem',
  },
  '@media (max-width: 900px)': {
    height: 'auto',
    width: '90px',
  },
});

const headerTitle = css({
  fontFamily: '"Space Grotesk", sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '30px',
  lineHeight: '48px',
  display: 'flex',
  height: '40px',
  alignItems: 'center',
  letterSpacing: '0.03em',
  color: '#2D2D2D',
  textDecoration: 'none',
  padding: '1rem',
  '@media (max-width: 1200px)': {
    fontSize: '20px',
    lineHeight: '20px',
  },
  '@media (max-width: 900px)': {
    fontSize: '16px',
    lineHeight: '16px',
  },
});

const docsButton = css({
  marginLeft: 'auto',
  background: '#8C7EFF',
  borderRadius: '6px',
  color: '#FFFFFF',
  fontFamily: 'Inter, sans-serif',
  fontWeight: 600,
  fontSize: '16px',
  lineHeight: '20px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '12px',
  textDecoration: 'none',
  '@media (max-width: 1200px)': {
    padding: '10px',
    fontSize: '14px',
  },
  '@media (max-width: 900px)': {
    padding: '8px',
    fontSize: '12px',
    fontWeight: 500,
  },
});

export default function Home() {
  const [pxe, setPXE] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [showContractInterface, setShowContractInterface] = useState(false);
  const [transactionModalStatus, setTransactionModalStatus] = useState<'open' | 'closed' | 'minimized'>('closed');
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
    transactionModalStatus,
    defaultContractCreationParams,
    setTotalLogCount,
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
    setTransactionModalStatus,
  };

  return (
    <div css={layout}>
      <div css={headerFrame}>
        <div role="button" style={{ cursor: 'pointer' }} onClick={() => {
          setShowContractInterface(false);
        }}>
          <img css={logo} src={logoURL} alt="Aztec Logo" />
        </div>
        <div css={headerTitle}>PLAYGROUND</div>
        <a
          href="https://docs.aztec.network/"
          target="_blank"
          rel="noopener noreferrer"
          css={docsButton}
          style={{ textDecoration: 'none' }}
        >
          Start Building
        </a>
      </div>
      <AztecContext.Provider value={AztecContextInitialValue}>
        <NavBar />
        <div css={contentLayout}>
          {showContractInterface ? <ContractComponent /> : <Landing />}
          <SideBar />
        </div>
        <LogPanel />
        <LoadingModal />
      </AztecContext.Provider>
    </div>
  );
}
