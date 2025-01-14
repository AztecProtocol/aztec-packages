import { ABIParameter, isAddressStruct } from "@aztec/foundation/abi";
import {
  Autocomplete,
  IconButton,
  TextField,
  capitalize,
  css,
} from "@mui/material";
import { formatFrAsString } from "../../utils/conversion";
import { useState } from "react";
import EditIcon from "@mui/icons-material/Edit";

const container = css({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
});

export function FunctionParameter({
  aliasedAddresses,
  parameter,
  onParameterChange,
}: {
  aliasedAddresses: { key: string; value: string }[];
  parameter: ABIParameter;
  onParameterChange: (value: string) => void;
}) {
  const [manualInput, setManualInput] = useState(false);
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
          onChange={(_, newValue) => onParameterChange(newValue.id)}
          sx={{ width: 300, marginTop: "1rem" }}
          renderInput={(params) => (
            <TextField {...params} label={capitalize(parameter.name)} />
          )}
        />
      ) : (
        <TextField
          variant="outlined"
          key={parameter.name}
          type="text"
          label={capitalize(parameter.name)}
          onChange={(e) => onParameterChange(e.target.value)}
          sx={{ marginTop: "1rem", marginRight: "1rem" }}
          fullWidth
        />
      )}
      {isAddressStruct(parameter.type) && (
        <>
          <div css={{ flex: "1 1 auto" }} />
          <IconButton
            sx={{ marginTop: "1rem" }}
            onClick={() => setManualInput(!manualInput)}
          >
            <EditIcon />
          </IconButton>
        </>
      )}
    </div>
  );
}
