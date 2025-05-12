import { type ABIParameter, type AbiType, isAddressStruct } from '@aztec/aztec.js';
import { formatFrAsString, parseAliasedBuffersAsString } from '../../utils/conversion';
import { useContext, useState } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import { AztecContext } from '../../aztecEnv';
import TextField from '@mui/material/TextField';
import { css } from '@mui/styled-engine';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import { capitalize } from '@mui/material/utils';
import IconButton from '@mui/material/IconButton';

const container = css({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: '1rem',
  marginTop: '1rem',
  width: '100%',
});

interface FunctionParameterProps {
  required?: boolean;
  parameter: ABIParameter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onParameterChange: (value: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultValue?: any;
}

export function FunctionParameter({ parameter, required, onParameterChange, defaultValue }: FunctionParameterProps) {
  const { walletDB } = useContext(AztecContext);

  const [manualInput, setManualInput] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleParameterChange = (value: string, type: AbiType) => {
    switch (type.kind) {
      case 'field': {
        onParameterChange(BigInt(value).toString(16));
        break;
      }
      case 'struct': {
        // Otherwise fall through
      }
      default: {
        onParameterChange(value);
        break;
      }
    }
  };

  const [aliasedAddresses, setAliasedAddresses] = useState([]);

  const handleOpen = () => {
    const setAliases = async () => {
      setLoading(true);
      const accountAliases = await walletDB.listAliases('accounts');
      const contractAliases = await walletDB.listAliases('contracts');
      const senderAliases = await walletDB.listAliases('senders');
      setAliasedAddresses(parseAliasedBuffersAsString([...accountAliases, ...contractAliases, ...senderAliases]));
      setLoading(false);
    };
    if (walletDB) {
      setAliases();
    }
  };

  function getParameterType(type: AbiType) {
    switch (type.kind) {
      case 'field':
        return 'number';
      case 'integer':
        return 'number';
      case 'string':
        return 'text';
      default:
        return 'text';
    }
  }

  function getParameterLabel(type: AbiType) {
    switch (type.kind) {
      case 'field':
        return 'number';
      case 'integer':
        return 'int';
      case 'string':
        return 'string';
      case 'boolean':
        return 'bool';
      default:
        return '';
    }
  }

  return (
    <div css={container}>
      {isAddressStruct(parameter.type) && !manualInput ? (
        <Autocomplete
          disablePortal
          key={parameter.name}
          options={aliasedAddresses.map(alias => ({
            id: alias.value,
            label: `${alias.key} (${formatFrAsString(alias.value)})`,
          }))}
          onChange={(_, newValue) => {
            if (newValue) {
              handleParameterChange(newValue.id, parameter.type);
            }
          }}
          onOpen={handleOpen}
          loading={loading}
          fullWidth
          defaultValue={defaultValue}
          sx={{ width: '100%', minWidth: '226px' }}
          css={css}
          renderInput={params => (
            <TextField
              {...params}
              required={required}
              label={capitalize(parameter.name)}
              size='small'
              slotProps={{
                input: {
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loading ? <CircularProgress color="inherit" size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                },
              }}
            />
          )}
        />
      ) : (
        <TextField
          required={required}
          fullWidth
          css={css}
          variant="outlined"
          defaultValue={defaultValue}
          size='small'
          disabled={['array', 'struct', 'tuple'].includes(parameter.type.kind) && !isAddressStruct(parameter.type)}
          key={parameter.name}
          type={getParameterType(parameter.type)}
          label={`${capitalize(parameter.name)}  (${getParameterLabel(parameter.type)})`}
          onChange={e => handleParameterChange(e.target.value, parameter.type)}
        />
      )}
      {isAddressStruct(parameter.type) && (
        <>
          <IconButton onClick={() => setManualInput(!manualInput)}>
            <EditIcon />
          </IconButton>
        </>
      )}
    </div>
  );
}
