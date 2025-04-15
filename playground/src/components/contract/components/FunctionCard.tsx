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
  AuthWitness,
  AztecAddress,
} from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SendIcon from '@mui/icons-material/Send';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';

import FormGroup from '@mui/material/FormGroup';
import { FunctionParameter } from '../../common/FnParameter';
import { useContext, useState } from 'react';
import { AztecContext } from '../../../aztecEnv';
import { SendTxDialog } from './SendTxDialog';
import { CreateAuthwitDialog } from './CreateAuthwitDialog';
import TableHead from '@mui/material/TableHead';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import { Box, Paper } from '@mui/material';

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
});

const functionName = css({
  marginBottom: '1rem',
  '@media (max-width: 1200px)': {
    fontSize: '1.2rem',
  },
});

interface FunctionCardProps {
  fn: FunctionAbi;
  contract?: Contract;
  onSendTxRequested: (
    name?: string,
    interaction?: ContractFunctionInteraction,
    contractAddress?: AztecAddress,
    opts?: SendMethodOptions,
  ) => void;
}

export function FunctionCard({ fn, contract, onSendTxRequested }: FunctionCardProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [parameters, setParameters] = useState<any[]>([]);
  const [simulationResults, setSimulationResults] = useState<SimulationResult>();
  const [profileResults, setProfileResults] = useState({});

  const [openSendTxDialog, setOpenSendTxDialog] = useState(false);
  const [openCreateAuthwitDialog, setOpenCreateAuthwitDialog] = useState(false);

  const { wallet } = useContext(AztecContext);

  const simulate = async (fnName: string) => {
    setIsWorking(true);
    let result;
    try {
      const call = contract.methods[fnName](...parameters);

      result = await call.simulate({ skipFeeEnforcement: true });
      setSimulationResults({ success: true, data: result });
    } catch (e) {
      setSimulationResults({ success: false, error: e.message });
    }

    setIsWorking(false);
  };

  const profile = async (fnName: string) => {
    setIsWorking(true);

    try {
      const call = contract.methods[fnName](...parameters);

      const profileResult = await call.profile({ profileMode: 'gates' });
      setProfileResults({
        ...profileResults,
        ...{ [fnName]: { success: true, executionSteps: profileResult.executionSteps } },
      });
    } catch (e) {
      console.error(e);
      setProfileResults({
        ...profileResults,
        ...{ [fnName]: { success: false, error: e.message } },
      });
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
      onSendTxRequested(`${fn.name} public authwit`, interaction, contract?.address, opts);
    }
  };

  const handleSendDialogClose = async (
    name?: string,
    interaction?: ContractFunctionInteraction,
    opts?: SendMethodOptions,
  ) => {
    setOpenSendTxDialog(false);
    if (name && interaction && opts) {
      onSendTxRequested(name, interaction, contract.address, opts);
    }
  };

  return (
    <Card
      key={fn.name}
      variant="outlined"
      sx={{
        backgroundColor: 'white',
        margin: '0.5rem',
        overflow: 'hidden',
      }}
    >
      <CardContent sx={{ textAlign: 'left' }}>
        <Typography gutterBottom sx={{ color: 'text.secondary', fontSize: 14 }}>
          {fn.functionType}
        </Typography>
        <Typography variant="h5" css={functionName}>
          {fn.name}
        </Typography>
        {fn.parameters.length > 0 && (
          <>
            <Typography
              gutterBottom
              sx={{
                color: 'text.secondary',
                fontSize: 14,
                marginTop: '1rem',
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
            <Typography variant="body1" sx={{ fontWeight: 200 }}>
              Simulation results:&nbsp;
            </Typography>
            {simulationResults?.success ? (
              <Typography variant="body1">
                {simulationResults?.data.length === 0 ? '-' : simulationResults?.data.toString()}
              </Typography>
            ) : (
              <Typography variant="body1" color="error">
                {simulationResults?.error}
              </Typography>
            )}{' '}
          </div>
        )}

        {!isWorking && profileResults[fn.name] !== undefined && (
          <Box>
            {profileResults[fn.name].success ? (
              <TableContainer component={Paper} sx={{ backgroundColor: 'var(--mui-palette-grey-A100)' }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold' }}>Function</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>Gate Count</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {profileResults[fn.name].executionSteps.map((row) => (
                      <TableRow key={row.functionName}>
                        <TableCell component="th" scope="row">
                          {row.functionName}
                        </TableCell>
                        <TableCell align="right">{Number(row.gateCount).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )
              : (
                <Typography variant="body1" color="error">
                  {profileResults?.[fn.name]?.error}
                </Typography>
              )}
          </Box>
        )}

        {isWorking ? <CircularProgress size={'1rem'} /> : <></>}
      </CardContent>
      <CardActions sx={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <Button
          disabled={!wallet || !contract || isWorking}
          color="primary"
          variant="contained"
          size="small"
          onClick={() => simulate(fn.name)}
          endIcon={<PsychologyIcon />}
        >
          Simulate
        </Button>
        <Button
          disabled={!wallet || !contract || isWorking || fn.functionType === FunctionType.UTILITY}
          size="small"
          color="primary"
          variant="contained"
          onClick={() => setOpenSendTxDialog(true)}
          endIcon={<SendIcon />}
        >
          Send
        </Button>
        <Button
          disabled={!wallet || !contract || isWorking || fn.functionType === FunctionType.UTILITY}
          size="small"
          color="primary"
          variant="contained"
          onClick={() => setOpenCreateAuthwitDialog(true)}
          endIcon={<VpnKeyIcon />}
        >
          Authwit
        </Button>
        <Button
          disabled={!wallet || !contract || isWorking || fn.functionType !== 'private'}
          color="primary"
          variant="contained"
          size="small"
          onClick={() => profile(fn.name)}
          endIcon={<TroubleshootIcon />}
        >
          Profile
        </Button>

      </CardActions>
      {contract && openSendTxDialog && (
        <SendTxDialog
          name={fn.name}
          interaction={contract.methods[fn.name](...parameters)}
          open={openSendTxDialog}
          onClose={handleSendDialogClose}
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
