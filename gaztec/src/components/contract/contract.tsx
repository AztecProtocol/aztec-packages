import { css } from "@emotion/react";
import { useDropzone } from "react-dropzone";
import "./dropzone.css";
import { useContext, useState } from "react";
import {
  AztecAddress,
  Contract,
  ContractArtifact,
  ContractInstanceWithAddress,
  loadContractArtifact,
} from "@aztec/aztec.js";
import { PrivateContext } from "../home/home";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  Divider,
  FormControlLabel,
  FormGroup,
  Input,
  InputAdornment,
  Typography,
} from "@mui/material";
import FindInPageIcon from "@mui/icons-material/FindInPage";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { ABIParameter } from "@aztec/foundation/abi";
import { prepTx } from "../../utils/interactions";
import { formatAddressAsString } from "../../utils/addresses";
import { DeployContractDialog } from "./components/deployContractDialog";

const container = css({
  display: "flex",
  height: "100vh",
  width: "75vw",
  overflow: "hidden",
  justifyContent: "center",
  alignItems: "center",
});

const dropZoneContainer = css({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "80%",
  border: "5px dashed black",
  borderRadius: "15px",
  margin: "5rem",
});

const contractFnContainer = css({
  display: "block",
  width: "100%",
  overflowY: "auto",
  color: "black",
  height: "100%",
});

const header = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-around",
});

const visibilityFilters = css({
  display: "flex",
  flexDirection: "column",
});

const FORBIDDEN_FUNCTIONS = [
  "compute_note_hash_and_optionally_a_nullifier",
  "sync_notes",
];

export function ContractComponent() {
  const [contractArtifact, setContractArtifact] =
    useState<ContractArtifact | null>(null);

  const [filters, setFilters] = useState({
    searchTerm: "",
    private: true,
    public: true,
    unconstrained: true,
  });

  const [isWorking, setIsWorking] = useState(false);

  const [simulationResults, setSimulationResults] = useState({});
  const [parameters, setParameters] = useState({});

  const [contractAddress, setContractAddress] = useState(AztecAddress.ZERO);
  const [openDeployContractDialog, setOpenDeployContractDialog] =
    useState(false);

  const { wallet, walletDB } = useContext(PrivateContext);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async (files) => {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = async (e) => {
        const contractArtifact = loadContractArtifact(
          JSON.parse(e.target?.result as string)
        );
        setContractArtifact(contractArtifact);
        setContractAddress(AztecAddress.ZERO);
      };
      reader.readAsText(file);
    },
  });

  const handleParameterChange = (
    fnName: string,
    param: ABIParameter,
    value: any
  ) => {
    const fnParameters = parameters[fnName] || {};
    fnParameters[param.name] = value;
    setParameters({ ...parameters, [fnName]: fnParameters });
  };

  const simulate = async (fnName: string) => {
    setIsWorking(true);
    const { encodedArgs } = await prepTx(
      contractArtifact,
      fnName,
      parameters[fnName]
    );
    const contract = await Contract.at(
      contractAddress,
      contractArtifact,
      wallet
    );
    const call = contract.methods[fnName](...encodedArgs);
    const result = await call.simulate();
    setSimulationResults({ ...simulationResults, ...{ [fnName]: result } });
    setIsWorking(false);
  };

  const handleContractDeployment = async (
    contract?: ContractInstanceWithAddress,
    alias?: string
  ) => {
    if (!contract || !alias) {
      return;
    }
    await walletDB.storeContract(
      contract.address,
      contractArtifact,
      undefined,
      alias
    );
    setContractAddress(contract.address);
    setOpenDeployContractDialog(false);
  };

  return (
    <div css={container}>
      {!contractArtifact ? (
        <div css={dropZoneContainer}>
          <div {...getRootProps({ className: "dropzone" })}>
            <input {...getInputProps()} />
            <Typography>
              Drag 'n' drop some files here, or click to select files
            </Typography>
          </div>
        </div>
      ) : (
        <div css={contractFnContainer}>
          <div css={header}>
            <Typography variant="h2">{contractArtifact.name}</Typography>
            <Input
              type="text"
              placeholder="Search function"
              onChange={(e) =>
                setFilters({ ...filters, searchTerm: e.target.value })
              }
              endAdornment={
                <InputAdornment position="end">
                  <FindInPageIcon />
                </InputAdornment>
              }
            />
            <FormGroup row>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.private}
                    onChange={(e) =>
                      setFilters({ ...filters, private: e.target.checked })
                    }
                  />
                }
                label="Private"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.public}
                    onChange={(e) =>
                      setFilters({ ...filters, public: e.target.checked })
                    }
                  />
                }
                label="Public"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.unconstrained}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        unconstrained: e.target.checked,
                      })
                    }
                  />
                }
                label="Unconstrained"
              />
            </FormGroup>
            {contractAddress === AztecAddress.ZERO && wallet ? (
              <>
                <Divider orientation="vertical"></Divider>
                <Button onClick={() => setOpenDeployContractDialog(true)}>
                  Deploy
                </Button>
                <DeployContractDialog
                  contractArtifact={contractArtifact}
                  open={openDeployContractDialog}
                  wallet={wallet}
                  onClose={handleContractDeployment}
                />
              </>
            ) : (
              <Typography color="text.secondary">
                {formatAddressAsString(contractAddress.toString())}
              </Typography>
            )}
          </div>
          {contractArtifact.functions
            .filter(
              (fn) =>
                !FORBIDDEN_FUNCTIONS.includes(fn.name) &&
                ((filters.private && fn.functionType === "private") ||
                  (filters.public && fn.functionType === "public") ||
                  (filters.unconstrained &&
                    fn.functionType === "unconstrained")) &&
                (filters.searchTerm === "" ||
                  fn.name.includes(filters.searchTerm))
            )
            .map((fn) => (
              <Card
                key={fn.name}
                variant="outlined"
                sx={{
                  backgroundColor: "primary.light",
                  margin: "1rem",
                }}
              >
                <CardContent sx={{ textAlign: "left" }}>
                  <Typography
                    gutterBottom
                    sx={{ color: "text.secondary", fontSize: 14 }}
                  >
                    {fn.functionType}
                  </Typography>
                  <Typography variant="h5" component="div">
                    {fn.name}
                  </Typography>
                  <Typography
                    gutterBottom
                    sx={{
                      color: "text.secondary",
                      fontSize: 14,
                      marginTop: "1rem",
                    }}
                  >
                    Parameters
                  </Typography>
                  <FormGroup row css={{ marginBottom: "1rem" }}>
                    {fn.parameters.map((param) => (
                      <Input
                        key={param.name}
                        type="text"
                        placeholder={param.name}
                        onChange={(e) =>
                          handleParameterChange(fn.name, param, e.target.value)
                        }
                        sx={{ marginRight: "1rem" }}
                      />
                    ))}
                  </FormGroup>
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography component="span">
                        Simulation results
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      Suspendisse malesuada lacus ex, sit amet blandit leo
                      lobortis eget.
                    </AccordionDetails>
                  </Accordion>
                  <Accordion>
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon />}
                      aria-controls="panel2-content"
                      id="panel2-header"
                    >
                      <Typography component="span">Tx History</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      Suspendisse malesuada lacus ex, sit amet blandit leo
                      lobortis eget.
                    </AccordionDetails>
                  </Accordion>
                </CardContent>
                <CardActions>
                  <Button
                    disabled={
                      !wallet ||
                      isWorking ||
                      contractAddress.equals(AztecAddress.ZERO)
                    }
                    color="secondary"
                    variant="contained"
                    onClick={() => simulate(fn.name)}
                  >
                    Simulate
                  </Button>
                  <Button
                    disabled={
                      !wallet ||
                      isWorking ||
                      contractAddress.equals(AztecAddress.ZERO)
                    }
                    color="secondary"
                    variant="contained"
                  >
                    Send
                  </Button>
                </CardActions>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
