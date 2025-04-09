import { css } from '@mui/styled-engine';
import type { FunctionAbi } from '@aztec/aztec.js';
import { FunctionType } from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SendIcon from '@mui/icons-material/Send';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { FunctionParameter } from '../../common/FnParameter';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';

const functionCard = css({
  boxSizing: 'border-box',
  width: '100%',
  background: '#CDD1D5',
  border: '2px solid #DEE2E6',
  borderRadius: '20px',
  marginBottom: '20px',
  overflow: 'hidden',
});

const functionTypeLabel = css({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '6px 16px',
  gap: '10px',
  width: '88px',
  height: '20px',
  background: '#9894FF',
  borderRadius: '30px',
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '12px',
  lineHeight: '120%',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#FFFFFF',
  marginBottom: '10px',
});

const functionName = css({
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '22px',
  lineHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  letterSpacing: '0.02em',
  color: '#2D2D2D',
  marginBottom: '10px',
});

const functionDescription = css({
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '14px',
  lineHeight: '120%',
  color: '#4A4A4A',
  marginBottom: '20px',
});

const parametersLabel = css({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '6px 16px',
  gap: '10px',
  width: '123px',
  height: '20px',
  background: '#9894FF',
  borderRadius: '30px',
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '12px',
  lineHeight: '120%',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#FFFFFF',
  marginBottom: '10px',
});

const parameterInput = css({
  background: '#FFFFFF',
  border: '2px solid #DEE2E6',
  borderRadius: '8px',
  height: '48px',
  padding: '0 24px',
  display: 'flex',
  alignItems: 'center',
  marginRight: '16px',
  marginBottom: '16px',
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '16px',
  lineHeight: '19px',
  color: '#3F444A',
  '& .MuiOutlinedInput-notchedOutline': {
    border: 'none',
  },
  '& .MuiInputBase-root': {
    '&.Mui-focused fieldset': {
      border: 'none',
    },
  },
});

const actionButtonsContainer = css({
  display: 'flex',
  flexDirection: 'row',
  gap: '12px',
  marginTop: '15px',
});

const actionButton = css({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '16px 20px',
  gap: '9px',
  height: '38px',
  background: '#9894FF',
  borderRadius: '8px',
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '16px',
  lineHeight: '19px',
  color: '#000000',
  border: 'none',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: '#8C7EFF',
  },
  '&:disabled': {
    backgroundColor: '#CDD1D5',
    color: '#808080',
    cursor: 'not-allowed',
  },
});

interface FunctionCardProps {
  fn: FunctionAbi;
  onParameterChange: (fnName: string, index: number, value: any) => void;
  onSimulate: (fnName: string) => void;
  onSend: (fnName: string) => void;
  onAuthwit: (fnName: string, parameters: any[], isPrivate: boolean) => void;
  simulationResults: Record<string, any>;
  isWorking: boolean;
  wallet: any;
  currentContract: any;
  parameters: Record<string, any[]>;
  functionDescriptions: Record<string, string>;
  selectedPredefinedContract: string;
}

export function FunctionCard({
  fn,
  onParameterChange,
  onSimulate,
  onSend,
  onAuthwit,
  simulationResults,
  isWorking,
  wallet,
  currentContract,
  parameters,
  functionDescriptions,
  selectedPredefinedContract,
}: FunctionCardProps) {
  return (
    <div css={functionCard}>
      <div style={{ padding: '36px' }}>
        <div css={functionTypeLabel}>{fn.functionType.toUpperCase()}</div>
        <div css={functionName}>{fn.name}</div>
        {selectedPredefinedContract !== 'custom_upload' && functionDescriptions[fn.name] && (
          <div css={functionDescription}>{functionDescriptions[fn.name]}</div>
        )}

        {fn.parameters.length > 0 && (
          <>
            <div css={parametersLabel}>PARAMETERS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '15px' }}>
              {fn.parameters.map((param, i) => (
                <div key={param.name} style={{ width: '212px', marginRight: '16px' }}>
                  <FunctionParameter
                    parameter={param}
                    onParameterChange={newValue => {
                      onParameterChange(fn.name, i, newValue);
                    }}
                    customStyle={parameterInput}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {!isWorking && simulationResults[fn.name] !== undefined && (
          <div style={{ marginTop: '15px' }}>
            <Typography variant="body1" sx={{ fontWeight: 400 }}>
              Simulation results:&nbsp;
              {typeof simulationResults[fn.name] === 'object'
                ? JSON.stringify(simulationResults[fn.name])
                : simulationResults[fn.name]?.toString()}
            </Typography>
          </div>
        )}
        {isWorking && <CircularProgress size={'1rem'} style={{ marginTop: '15px', color: '#9894FF' }} />}

        <div css={actionButtonsContainer}>
          <Tooltip title="Run the transaction locally and generate a proof" placement="top">
            <button
              css={actionButton}
              disabled={!wallet || !currentContract || isWorking}
              onClick={() => onSimulate(fn.name)}
            >
              SIMULATE
              <PsychologyIcon style={{ fontSize: '14px', marginLeft: '5px' }} />
            </button>
          </Tooltip>
          <Tooltip title="Generate a proof and send it to the aztec network" placement="top">
            <button
              css={actionButton}
              disabled={!wallet || !currentContract || isWorking || fn.functionType.toString() === 'utility'}
              onClick={() => onSend(fn.name)}
            >
              SEND
              <SendIcon style={{ fontSize: '14px', marginLeft: '5px' }} />
            </button>
          </Tooltip>
          <Tooltip title="Authenticate another protocol to perform this on your behalf" placement="top">
            <button
              css={actionButton}
              disabled={!wallet || !currentContract || isWorking || fn.functionType.toString() === 'utility'}
              onClick={() => onAuthwit(fn.name, parameters[fn.name], fn.functionType === FunctionType.PRIVATE)}
            >
              AUTHWIT
              <VpnKeyIcon style={{ fontSize: '14px', marginLeft: '5px' }} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
