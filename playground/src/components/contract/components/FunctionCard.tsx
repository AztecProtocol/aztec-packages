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

import FormGroup from '@mui/material/FormGroup';
import { FunctionParameter } from '../../common/FnParameter';
import { useContext, useState } from 'react';
import { AztecContext } from '../../../aztecEnv';
import { SendTxDialog } from './SendTxDialog';

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

  const [openSendTxDialog, setOpenSendTxDialog] = useState(false);
  const [openCreateAuthwitDialog, setOpenCreateAuthwitDialog] = useState(false);

  const { wallet, walletDB } = useContext(AztecContext);

  const simulate = async (fnName: string) => {
    setIsWorking(true);
    let result;
    try {
      const fnParameters = parameters[fnName] ?? [];
      const call = contract.methods[fnName](...fnParameters);

      result = await call.simulate();
      setSimulationResults({ success: true, data: result });
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

  const handleAuthwitCreation = async (witness?: AuthWitness, alias?: string) => {
    if (witness && alias) {
      await walletDB.storeAuthwitness(witness, undefined, alias);
    }
    setOpenCreateAuthwitDialog(false);
  };

  const handleSendDialogClose = async (
    name?: string,
    interaction?: ContractFunctionInteraction,
    opts?: SendMethodOptions,
  ) => {
    setOpenSendTxDialog(false);
    if (name !== undefined && interaction !== undefined && opts !== undefined) {
      onSendTxRequested(name, interaction, contract.address, opts);
    }
  };

  return (
    <Card
      key={fn.name}
      variant="outlined"
      sx={{
        backgroundColor: 'primary.light',
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
        {isWorking ? <CircularProgress size={'1rem'} /> : <></>}
      </CardContent>
      <CardActions>
        <Button
          disabled={!wallet || !contract || isWorking}
          color="secondary"
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
          color="secondary"
          variant="contained"
          onClick={() => setOpenSendTxDialog(true)}
          endIcon={<SendIcon />}
        >
          Send
        </Button>
        <Button
          disabled={!wallet || !contract || isWorking || fn.functionType === FunctionType.UTILITY}
          size="small"
          color="secondary"
          variant="contained"
          onClick={() => {}}
          endIcon={<VpnKeyIcon />}
        >
          Authwit
        </Button>
      </CardActions>
      {contract && (
        <SendTxDialog
          name={fn.name}
          interaction={contract.methods[fn.name](...parameters)}
          open={openSendTxDialog}
          onClose={handleSendDialogClose}
        />
      )}
    </Card>
  );
}
