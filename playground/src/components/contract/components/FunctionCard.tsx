import { css } from '@mui/styled-engine';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import {
  FunctionType,
  type FunctionAbi,
  ContractFunctionInteraction,
  Contract,
  type SendMethodOptions,
  AztecAddress,
  type ContractArtifact,
} from '@aztec/aztec.js';
import { CopyCatAccountWallet } from '@aztec/accounts/copy-cat/lazy';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SendIcon from '@mui/icons-material/Send';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import IconButton from '@mui/material/IconButton';
import FormGroup from '@mui/material/FormGroup';
import { FunctionParameter } from '../../common/FnParameter';
import { useContext, useState } from 'react';
import { AztecContext } from '../../../aztecEnv';
import { ConfigureInteractionDialog } from './ConfigureInteractionDialog';
import { CreateAuthwitDialog } from './CreateAuthwitDialog';
import TableHead from '@mui/material/TableHead';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import { Badge, Box, Paper, Tooltip } from '@mui/material';
import { ContractMethodDescriptions } from '../../../utils/constants';
import { trackButtonClick } from '../../../utils/matomo';

type SimulationResult = {
  success: boolean;
  data?: any;
  error?: string;
};

const simulationContainer = css({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  textOverflow: 'ellipsis',
  marginTop: '1rem',
});

const functionName = css({
  marginBottom: '0.5rem',
  '@media (max-width: 1200px)': {
    fontSize: '1.2rem',
  },
});

const actionButton = css({
  marginLeft: '0 !important',
  borderRadius: '6px',
});

interface FunctionCardProps {
  fn: FunctionAbi;
  contract?: Contract;
  contractArtifact: ContractArtifact;
  onSendTxRequested: (
    name?: string,
    interaction?: ContractFunctionInteraction,
    contractAddress?: AztecAddress,
    opts?: SendMethodOptions,
  ) => void;
}

export function FunctionCard({ fn, contract, contractArtifact, onSendTxRequested }: FunctionCardProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [parameters, setParameters] = useState<any[]>([]);
  const [simulationResults, setSimulationResults] = useState<SimulationResult>();
  const [profileResults, setProfileResults] = useState({});
  const [isExpanded, setIsExpanded] = useState(false);

  const [openConfigureInteractionDialog, setOpenConfigureInteractionDialog] = useState(false);
  const [openCreateAuthwitDialog, setOpenCreateAuthwitDialog] = useState(false);
  const [profile, setProfile] = useState(false);

  const { wallet, pxe } = useContext(AztecContext);

  const simulate = async (fnName: string) => {
    trackButtonClick(`Simulate ${fnName}`, 'Contract Interaction');
    setIsWorking(true);
    let result;
    try {
      const copyCatWallet = await CopyCatAccountWallet.create(pxe, wallet);
      const call = contract.withWallet(copyCatWallet).methods[fnName](...parameters);
      result = await call.simulate({ skipFeeEnforcement: true });
      const stringResult = JSON.stringify(result, (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      });

      setSimulationResults({ success: true, data: stringResult });
    } catch (e) {
      setSimulationResults({ success: false, error: e.message });
    }

    setIsWorking(false);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleParameterChange = (index: number, value: any) => {
    parameters[index] = value;
    setParameters([...parameters]);
  };

  const handleAuthwitCreation = async (
    isPublic?: boolean,
    interaction?: ContractFunctionInteraction,
    opts?: SendMethodOptions,
  ) => {
    setOpenCreateAuthwitDialog(false);
    if (isPublic && interaction && opts) {
      onSendTxRequested(`Authwit ${fn.name}`, interaction, contract?.address, opts);
    }
  };

  const handleConfigureInteractionDialogClose = async (
    name?: string,
    interaction?: ContractFunctionInteraction,
    opts?: SendMethodOptions,
  ) => {
    setOpenConfigureInteractionDialog(false);
    if (name && interaction && opts) {
      if (profile) {
        setIsWorking(true);
        try {
          const call = contract.methods[name](...parameters);

          const profileResult = await call.profile({ ...opts, profileMode: 'full', skipProofGeneration: false });

          let biggest = profileResult.executionSteps[0];
          let acc = 0;

          const executionSteps = profileResult.executionSteps.map(step => {
            if (step.gateCount! > biggest.gateCount!) {
              biggest = step;
            }
            acc += step.gateCount!;
            return { ...step, subtotal: acc };
          });

          const totalRPCCalls = Object.values(profileResult.stats.nodeRPCCalls ?? {}).reduce((acc, calls) => acc + calls.times.length, 0);

          setProfileResults({
            ...profileResults,
            ...{ [name]: { success: true, ...profileResult, executionSteps, biggest, totalRPCCalls } },
          });
        } catch (e) {
          console.error(e);
          setProfileResults({
            ...profileResults,
            ...{ [name]: { success: false, error: e.message } },
          });
        }
        setIsWorking(false);
      } else {
        onSendTxRequested(`Execute ${name}`, interaction, contract.address, opts);
      }
    }
  };

  const parametersValid = parameters.every(param => param !== undefined);

  return (
    <Card
      key={fn.name}
      variant="outlined"
      onClick={() => {
        if (!isExpanded) {
          setIsExpanded(true);
        }
      }}
      sx={{
        backgroundColor: 'white',
        border: 'none',
        overflow: 'visible',
        marginBottom: '1rem',
        ...(!isExpanded && {
          cursor: 'pointer',
        }),
        '&:last-child': {
          marginBottom: '0',
        },
        '@media (max-width: 900px)': {
          margin: '0.5rem 0px',
        },
      }}
    >
      <CardContent sx={{ textAlign: 'left', position: 'relative', padding: '12px 16px !important' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5" css={functionName}>
            {fn.name}
            <Badge badgeContent={fn.functionType} color="info" sx={{ marginLeft: '2rem' }}></Badge>
          </Typography>
          <IconButton
            onClick={e => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            sx={{ position: 'absolute', right: 0, top: 0 }}
          >
            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>

        <Typography variant="caption" sx={{ lineHeight: '1rem', display: 'block' }}>
          {ContractMethodDescriptions[contractArtifact.name]?.[fn.name]}
        </Typography>

        {isExpanded && (
          <>
            {fn.parameters.length > 0 && (
              <>
                <Typography
                  gutterBottom
                  sx={{
                    color: 'text.secondary',
                    fontSize: 14,
                    margin: '1rem 0',
                  }}
                >
                  Parameters
                </Typography>
                <FormGroup row css={{ marginBottom: '1rem' }}>
                  {fn.parameters.map((param, i) => (
                    <FunctionParameter
                      parameter={param}
                      key={param.name}
                      onParameterChange={newValue => {
                        handleParameterChange(i, newValue);
                      }}
                    />
                  ))}
                </FormGroup>
              </>
            )}

            {!isWorking && simulationResults !== undefined && (
              <div css={simulationContainer}>
                <Typography variant="body1" sx={{ fontWeight: 200, marginRight: '0.5rem' }}>
                  Simulation results:
                </Typography>
                <div css={{ backgroundColor: 'var(--mui-palette-grey-A100)', padding: '0.5rem', borderRadius: '6px' }}>
                  {simulationResults?.success ? (
                    <Typography variant="body1">
                      {simulationResults?.data ?? 'No return value'}
                    </Typography>
                  ) : (
                    <Typography variant="body1" color="error">
                      {simulationResults?.error}
                    </Typography>
                  )}
                </div>
              </div>
            )}

            {!isWorking && profileResults[fn.name] !== undefined && (
              <Box>
                {profileResults[fn.name].success ? (
                  <>
                    <TableContainer
                      component={Paper}
                      sx={{ marginRight: '0.5rem', backgroundColor: 'var(--mui-palette-grey-A100)' }}
                    >
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Function</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                              Simulation time
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                              Gate Count
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                              Subtotal
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {profileResults[fn.name].executionSteps.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell component="th" scope="row">
                                {row.functionName}
                              </TableCell>
                              <TableCell align="right">{Number(row.timings?.witgen).toLocaleString()}ms</TableCell>
                              <TableCell align="right">{Number(row.gateCount).toLocaleString()}</TableCell>
                              <TableCell align="right">{row.subtotal}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <Box sx={{ margin: '0.5rem', display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="caption">
                        Total gates: {profileResults[fn.name].executionSteps.slice(-1)[0].subtotal}
                        <Typography variant="caption" sx={{ color: 'grey', fontSize: '0.6rem', marginLeft: '0.5rem' }}>
                          (Biggest circuit: {profileResults[fn.name].biggest.functionName} -{' '}
                          {profileResults[fn.name].biggest.gateCount})
                        </Typography>
                      </Typography>
                      <Typography variant="caption">
                        Sync time: {profileResults[fn.name].stats.timings.sync?.toFixed(2)}ms
                      </Typography>
                      <Typography variant="caption">
                        Total simulation time:{' '}
                        {profileResults[fn.name].stats.timings.perFunction
                          .reduce((acc, { time }) => acc + time, 0)
                          .toFixed(2)}
                        ms
                      </Typography>
                      <Typography variant="caption">
                        Proving time: {profileResults[fn.name].stats.timings.proving?.toFixed(2)}ms
                      </Typography>
                      <Typography variant="caption">
                        Total time: {profileResults[fn.name].stats.timings.total.toFixed(2)}ms
                        <Typography variant="caption" sx={{ color: 'grey', fontSize: '0.6rem', marginLeft: '0.5rem' }}>
                          ({profileResults[fn.name].stats.timings.unaccounted.toFixed(2)}ms unaccounted)
                        </Typography>
                      </Typography>
                      <Typography variant="caption">
                        Total RPC calls: {profileResults[fn.name].totalRPCCalls}
                      </Typography>
                    </Box>
                    <Box sx={{ margin: '0.5rem', fontSize: '0.8rem' }}>
                      <Typography color="warning" variant="caption">
                        Timing information does not account for gate # computation time, since the operation is not
                        performed when doing real proving. For completeness, this profile operation spent{' '}
                        {profileResults[fn.name].executionSteps
                          .reduce((acc, { timings: { gateCount } }) => acc + gateCount, 0)
                          .toFixed(2)}
                        ms computing gate counts
                      </Typography>
                    </Box>
                  </>
                ) : (
                  <Typography variant="body1" color="error">
                    {profileResults?.[fn.name]?.error}
                  </Typography>
                )}
              </Box>
            )}

            {isWorking ? <CircularProgress size={'1rem'} /> : <></>}
          </>
        )}
      </CardContent>
      {isExpanded && (
        <CardActions sx={{ flexWrap: 'wrap', gap: '0.5rem', padding: '12px' }}>
          <Tooltip title="Run a local simulation of function execution.">
            <Button
              disabled={!wallet || !contract || isWorking || !parametersValid}
              color="primary"
              variant="contained"
              size="small"
              onClick={() => {
                trackButtonClick(`Simulate Transaction`, 'Contract Interaction');
                simulate(fn.name);
              }}
              endIcon={<PsychologyIcon />}
              css={actionButton}
            >
              Simulate
            </Button>
          </Tooltip>

          <Tooltip title="Simulate and send the transaction to the Aztec network by creating a client side proof.">
            <Button
              disabled={!wallet || !contract || isWorking || fn.functionType === FunctionType.UTILITY || !parametersValid}
              size="small"
              color="primary"
              variant="contained"
              onClick={() => {
                setProfile(false);
                setOpenConfigureInteractionDialog(true);
              }}
              endIcon={<SendIcon />}
              css={actionButton}
            >
              Send
            </Button>
          </Tooltip>

          <Tooltip title="Authorization witnesses (AuthWits) work similarly to permit/approval on Ethereum. They allow execution of functions on behalf of other contracts or addresses.">
            <Button
              disabled={!wallet || !contract || isWorking || fn.functionType === FunctionType.UTILITY || !parametersValid}
              size="small"
              color="primary"
              variant="contained"
              onClick={() => setOpenCreateAuthwitDialog(true)}
              endIcon={<VpnKeyIcon />}
              css={actionButton}
            >
              Authwit
            </Button>
          </Tooltip>

          <Tooltip title="Profile this method and get the number of gates used per step. Requires valid function arguments to be set as this runs a simulation internally.">
            <Button
              disabled={!wallet || !contract || isWorking || fn.functionType !== 'private' || !parametersValid}
              color="primary"
              variant="contained"
              size="small"
              onClick={() => {
                setProfile(true);
                setOpenConfigureInteractionDialog(true);
              }}
              endIcon={<TroubleshootIcon />}
              css={actionButton}
            >
              Profile
            </Button>
          </Tooltip>
        </CardActions>
      )}
      {contract && openConfigureInteractionDialog && (
        <ConfigureInteractionDialog
          name={fn.name}
          interaction={contract.methods[fn.name](...parameters)}
          open={openConfigureInteractionDialog}
          onClose={handleConfigureInteractionDialogClose}
        />
      )}
      {contract && openCreateAuthwitDialog && (
        <CreateAuthwitDialog
          fnName={fn.name}
          contract={contract}
          args={parameters}
          isPrivate={fn.functionType === FunctionType.PRIVATE}
          open={openCreateAuthwitDialog}
          onClose={handleAuthwitCreation}
        />
      )}
    </Card>
  );
}
