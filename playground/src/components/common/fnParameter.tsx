import {
  ABIParameter,
  AbiType,
  isAddressStruct,
  isU128Struct,
} from "@aztec/foundation/abi";
import {
  Autocomplete,
  CircularProgress,
  IconButton,
  TextField,
  capitalize,
  css,
} from "@mui/material";
import {
  formatFrAsString,
  parseAliasedBuffersAsString,
} from "../../utils/conversion";
import { useContext, useState } from "react";
import EditIcon from "@mui/icons-material/Edit";
import { AztecContext } from "../../aztecEnv";

const container = css({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  marginRight: "1rem",
  marginTop: "1rem",
});

export function FunctionParameter({
  parameter,
  onParameterChange,
}: {
  parameter: ABIParameter;
  onParameterChange: (value: any) => void;
}) {
  const { walletDB } = useContext(AztecContext);

  const [manualInput, setManualInput] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleParameterChange = (value: string, type: AbiType) => {
    switch (type.kind) {
      case "field": {
        onParameterChange(BigInt(value).toString(16));
        break;
      }
      case "struct": {
        if (isU128Struct(type)) {
          onParameterChange(BigInt(value));
          break;
        }
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
      const accountAliases = await walletDB.listAliases("accounts");
      const contractAliases = await walletDB.listAliases("contracts");
      setAliasedAddresses(
        parseAliasedBuffersAsString([...accountAliases, ...contractAliases])
      );
      setLoading(false);
    };
    if (walletDB) {
      setAliases();
    }
  };

  return (
    <div css={container}>
      {isAddressStruct(parameter.type) && !manualInput ? (
        <Autocomplete
          disablePortal
          key={parameter.name}
          options={aliasedAddresses.map((alias) => ({
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
          sx={{ width: "226px" }}
          css={css}
          renderInput={(params) => (
            <TextField
              {...params}
              label={capitalize(parameter.name)}
              slotProps={{
                input: {
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loading ? (
                        <CircularProgress color="inherit" size={20} />
                      ) : null}
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
          fullWidth
          css={css}
          variant="outlined"
          disabled={
            ["array", "struct", "tuple"].includes(parameter.type.kind) &&
            !(isAddressStruct(parameter.type) || isU128Struct(parameter.type))
          }
          key={parameter.name}
          type="text"
          label={capitalize(parameter.name)}
          onChange={(e) =>
            handleParameterChange(e.target.value, parameter.type)
          }
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
