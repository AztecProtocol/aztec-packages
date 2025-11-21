import { css } from '@emotion/react';
import { ContractComponent } from '../contract/Contract';
import { NavBar } from '../navbar/NavBar';
import { useState } from 'react';
import { AztecContext } from '../../aztecContext';
import { LogPanel } from '../logPanel/LogPanel';
import { Landing } from './components/Landing';
import { AztecLogo } from '../AztecLogo';
import { TxPanel } from '../navbar/TxPanel';
import { trackButtonClick } from '../../utils/matomo';
import { colors, commonStyles } from '../../global.styles';

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
  backgroundColor: colors.background.paper,
  backdropFilter: commonStyles.backdropBlur,
  border: commonStyles.borderLight,
  borderRadius: commonStyles.borderRadius,
  padding: '12px',
  height: '80px',
  '@media (max-width: 900px)': {
    height: '60px',
    padding: '0.5rem',
  },
});

const logo = css({
  marginLeft: '1rem',
  marginTop: '2px',
  '@media (max-width: 900px)': {
    marginLeft: '0.5rem',
    marginRight: '0.5rem',
  },
});

const headerSpacer = css({
  flexGrow: 1,
});

const docsButton = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: colors.primary.main,
  textDecoration: 'none',
  borderRadius: commonStyles.borderRadius,
  fontWeight: 600,
  color: colors.primary.contrastText,
  fontSize: '16px',
  minWidth: '100px',
  padding: '10px 16px',
  transition: 'box-shadow 0.2s ease',
  '&:hover': {
    boxShadow: `0px 4px 12px ${commonStyles.borderVeryStrong.replace('1px solid ', '')}`,
  },
  '@media (max-width: 900px)': {
    padding: '8px 10px',
    fontSize: '14px',
    fontWeight: 600,
    marginRight: '0.5rem',
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
  const [wallet, setWallet] = useState(null);
  const [node, setNode] = useState(null);
  const [playgroundDB, setPlaygroundDB] = useState(null);
  const [showContractInterface, setShowContractInterface] = useState(false);
  const [from, setFrom] = useState(null);
  const [currentContractArtifact, setCurrentContractArtifact] = useState(null);
  const [currentTx, setCurrentTx] = useState(null);
  const [currentContractAddress, setCurrentContractAddress] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [network, setNetwork] = useState(null);
  const [totalLogCount, setTotalLogCount] = useState(0);
  const [defaultContractCreationParams, setDefaultContractCreationParams] = useState({});
  const [pendingTxUpdateCounter, setPendingTxUpdateCounter] = useState(0);
  const [isNetworkCongested, setIsNetworkCongested] = useState(false);
  const [embeddedWalletSelected, setIsEmbeddedWalletSelected] = useState(false);

  const AztecContextInitialValue = {
    network,
    wallet,
    node,
    playgroundDB,
    from,
    currentContractArtifact,
    currentTx,
    currentContractAddress,
    logs,
    logsOpen,
    showContractInterface,
    totalLogCount,
    pendingTxUpdateCounter,
    defaultContractCreationParams,
    isNetworkCongested,
    embeddedWalletSelected,
    setIsEmbeddedWalletSelected,
    setNode,
    setTotalLogCount,
    setIsNetworkCongested,
    setNetwork,
    setLogsOpen,
    setLogs,
    setCurrentTx,
    setWallet,
    setPlaygroundDB,
    setFrom,
    setShowContractInterface,
    setDefaultContractCreationParams,
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
          css={logo}
        >
          <AztecLogo height={48} />
        </div>
        <div css={headerSpacer} />
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
