import { css } from '@emotion/react';
import { ContractComponent } from '../contract/contract';
import { SidebarComponent } from '../sidebar/Sidebar';
import { useState } from 'react';
import { AztecContext } from '../../aztecEnv';
import { LogPanel } from '../logPanel/LogPanel';
import { Landing } from './components/Landing';
import logoURL from '../../assets/aztec_logo.png';

const layout = css({
  display: 'flex',
  flexDirection: 'column',
  minHeight: 'calc(100vh - 60px)',
  width: '100%',
  flex: 1,
});

const contentLayout = css({
  display: 'flex',
  flexDirection: 'row',
  flex: 1,
  minHeight: 0,
  margin: '24px 60px',
  '@media (max-width: 1200px)': {
    flexDirection: 'column',
    margin: '0 12px',
  },
});

const headerFrame = css({
  height: '100px',
  margin: '24px 60px',
  backgroundColor: '#CDD1D5',
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  padding: '0 40px',
  position: 'relative',
  '@media (max-width: 1200px)': {
    margin: '12px 12px 24px 12px',
    padding: '0 12px',
    height: '80px',
  },
});

const logo = css({
  height: '60px',
  objectFit: 'contain',
  marginRight: '2rem',
  '@media (max-width: 1200px)': {
    height: 'auto',
    width: '120px',
    marginRight: '0.8rem',
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
  marginTop: '0.5rem',
  '@media (max-width: 1200px)': {
    marginTop: '0.2rem',
    padding: 0,
    fontSize: '20px',
    lineHeight: '20px',
  },
});

const docsButton = css({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '12px 24px',
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
  '@media (max-width: 1200px)': {
    padding: 0,
    fontSize: '14px',
    width: '85px',
    gap: 0,
    right: '12px',
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
  const [currentContract, setCurrentContract] = useState(null);
  const [currentTx, setCurrentTx] = useState(null);
  const [currentContractAddress, setCurrentContractAddress] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [network, setNetwork] = useState(null);

  const AztecContextInitialValue = {
    pxe,
    connecting,
    network,
    wallet,
    isPXEInitialized,
    walletAlias,
    walletDB,
    currentContract,
    currentTx,
    node,
    currentContractAddress,
    logs,
    logsOpen,
    drawerOpen,
    showContractInterface,
    setNetwork,
    setConnecting,
    setDrawerOpen,
    setLogsOpen,
    setLogs,
    setAztecNode,
    setCurrentTx,
    setWalletDB,
    setPXEInitialized,
    setWallet,
    setPXE,
    setShowContractInterface,
    setWalletAlias,
    setCurrentContract,
    setCurrentContractAddress,
  };

  return (
    <div css={layout}>
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
          Inspiration
        </a>
      </div>
      <div css={contentLayout}>
        <AztecContext.Provider value={AztecContextInitialValue}>
          <SidebarComponent />
          <LogPanel />
          {showContractInterface ? <ContractComponent /> : <Landing />}
        </AztecContext.Provider>
      </div>
    </div>
  );
}
