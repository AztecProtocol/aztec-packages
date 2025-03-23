import { css } from '@emotion/react';
import { ContractComponent } from '../contract/contract';
import { SidebarComponent } from '../sidebar/sidebar';
import { useEffect, useState } from 'react';
import { AztecContext, AztecEnv } from '../../aztecEnv';
import { LogPanel } from '../logPanel/logPanel';
import logoURL from '../../assets/Aztec_logo.png';
import Drawer from '@mui/material/Drawer';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Container from '@mui/material/Container';

const layout = css({
  display: 'flex',
  flexDirection: 'row',
  height: '100%',
});

const logo = css({
  width: '100%',
  padding: '0.5rem',
});

const collapsedDrawer = css({
  height: '100%',
  width: '4rem',
  backgroundColor: 'var(--mui-palette-primary-light)',
  overflow: 'hidden',
});

const landingPage = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
  height: '100%',
  width: '100%',
  overflow: 'auto',
});

const infoBox = css({
  padding: '1.5rem',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
});

const mainContent = css({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  height: '100%',
  overflow: 'hidden',
});

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showContractInterface, setShowContractInterface] = useState(false);

  const [isNetworkStoreInitialized, setIsNetworkStoreInitialized] = useState(false);

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
    drawerOpen,
    setDrawerOpen,
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
  };

  const renderLandingPage = () => (
    <div css={landingPage}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h2" component="h1" gutterBottom>
            Playground
          </Typography>
          <Typography variant="subtitle1" color="text.secondary" sx={{ maxWidth: '800px', mx: 'auto', mb: 4 }}>
            Playground is a web-app for interacting with Aztec. Create an aztec account, try one of our default contracts
            or upload your own and interact with it while creating client side proofs in the browser!
            It is a minimalistic remix.ethereum.org but for Aztec.
          </Typography>
        </Box>

        <Grid container spacing={4}>
          <Grid item xs={12} md={4}>
            <Paper css={infoBox} elevation={3}>
              <Typography variant="h5" component="h2" gutterBottom>
                Next Level UX
              </Typography>
              <Typography variant="body1">
              On Aztec, you can privately define custom signing logic. This website uses the ecdsa_r1 curve but you could do passwords too!Fees can be paid by someone else too (on your behalf) and it can be privately or publicly). In this websire, fes are sponsored.
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper css={infoBox} elevation={3}>
              <Typography variant="h5" component="h2" gutterBottom>
                Hybrid state
              </Typography>
              <Typography variant="body1">
              Aztec has extremely powerful hybrid state i.e. you can store state privately (via UTXOs) or publicly. Your functions can be private or publuc too (i.e. hiding bytecode). You can also go cross-domain i.e. call a public function from private and vice versa.
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper css={infoBox} elevation={3}>
              <Typography variant="h5" component="h2" gutterBottom>
                Client side proving
              </Typography>
              <Typography variant="body1">
              Aztec preserves your privacy by generating client side ZK-SNARKS proofs, using mega honk proving system. You can create and prove a faceID signature locally that would otherwise cost you  million gas units on public EVM chains
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Container>
      <Button
            variant="contained"
            size="large"
            onClick={() => setDrawerOpen(true)}
            sx={{ mt: 2 }}
          >
            Get Started
          </Button>
    </div>
  );

  return (
    <div css={layout}>
      <AztecContext.Provider value={AztecContextInitialValue}>
        <div css={collapsedDrawer} onClick={() => setDrawerOpen(!drawerOpen)}>
          <img css={logo} src={logoURL} />
        </div>
        <Drawer
          sx={{
            '& .MuiDrawer-paper': {
              height: '100%',
              width: '340px',
            },
          }}
          ModalProps={{
            keepMounted: true,
          }}
          onClose={() => setDrawerOpen(false)}
          variant="temporary"
          open={drawerOpen}
        >
          {isNetworkStoreInitialized ? <SidebarComponent /> : <LinearProgress />}
        </Drawer>
        <div css={mainContent}>
          <LogPanel />
          {showContractInterface ? <ContractComponent /> : renderLandingPage()}
        </div>
      </AztecContext.Provider>
    </div>
  );
}
