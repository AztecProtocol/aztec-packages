import { css } from '@mui/styled-engine';
import { useDropzone } from 'react-dropzone';
import './dropzone.css';
import { useContext, useEffect, useState } from 'react';
import {
  AuthWitness,
  Contract,
  type ContractArtifact,
  type ContractInstanceWithAddress,
  loadContractArtifact,
  getAllFunctionAbis,
  type FunctionAbi,
  FunctionType,
} from '@aztec/aztec.js';
import { AztecContext } from '../../aztecEnv';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import IconButton from '@mui/material/IconButton';
import Input from '@mui/material/Input';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

import FindInPageIcon from '@mui/icons-material/FindInPage';
import { convertFromUTF8BufferAsString, formatFrAsString } from '../../utils/conversion';
import { DeployContractDialog } from './components/deployContractDialog';
import { FunctionParameter } from '../common/fnParameter';
import ClearIcon from '@mui/icons-material/Clear';
import { RegisterContractDialog } from './components/registerContractDialog';
import { CopyToClipboardButton } from '../common/copyToClipboardButton';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import SendIcon from '@mui/icons-material/Send';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { CreateAuthwitDialog } from './components/createAuthwitDialog';
import { parse } from 'buffer-json';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SearchIcon from '@mui/icons-material/Search';
import { LoadingModal } from '../common/LoadingModal';

const container = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  background: '#E9E9E9',
  borderRadius: '10px',
  padding: '45px',
  overflow: 'hidden',
  '@media (max-width: 1100px)': {
    width: 'auto',
    padding: '24px',
  },
});

const headerSection = css({
  width: '100%',
  marginBottom: '24px',
});

const descriptionText = css({
  fontFamily: '"Space Grotesk", sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '18px',
  lineHeight: '120%',
  display: 'flex',
  alignItems: 'center',
  textAlign: 'center',
  color: '#000000',
  marginBottom: '25px',
  width: '100%',
});

const buttonContainer = css({
  display: 'flex',
  justifyContent: 'center',
  gap: '24px',
  marginBottom: '25px',
});

const actionButton = css({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '20px 32px',
  gap: '8px',
  width: '230px',
  height: '56px',
  background: '#CDD1D5',
  borderRadius: '12px',
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '17px',
  lineHeight: '16px',
  color: '#000000',
  '&:hover': {
    backgroundColor: '#BCC0C4',
  }
});

const dropZoneContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '80%',
  border: '3px dashed #9894FF',
  borderRadius: '15px',
  margin: '2rem 0',
  backgroundColor: 'rgba(152, 148, 255, 0.04)',
  alignItems: 'center',
  justifyContent: 'center',
});

const uploadIcon = css({
  fontSize: '64px',
  color: '#9894FF',
  marginBottom: '1rem',
});

const contractFnContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  flex: '1 1 auto',
  height: '0',
  minHeight: '0',
  overflow: 'auto',
});

const tokenSection = css({
  marginTop: '50px',
  marginBottom: '25px',
});

const tokenHeader = css({
  fontFamily: '"Space Grotesk", sans-serif',
  fontStyle: 'normal',
  fontWeight: 700,
  fontSize: '48px',
  lineHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  letterSpacing: '0.02em',
  color: '#2D2D2D',
  marginBottom: '25px',
});

const searchContainer = css({
  width: '361px',
  height: '36px',
  background: 'rgba(250, 250, 250, 0.93)',
  borderRadius: '6px',
  display: 'flex',
  alignItems: 'center',
  padding: '8px',
  marginBottom: '15px',
});

const filterContainer = css({
  display: 'flex',
  flexDirection: 'row',
  gap: '7px',
  marginBottom: '25px',
});

const filterButton = css({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '6px 5px',
  gap: '11px',
  height: '36px',
  background: '#CDD1D5',
  borderRadius: '6px',
  cursor: 'pointer',
  position: 'relative',
});

const filterCheckbox = css({
  width: '24px',
  height: '24px',
  background: '#CDD1D5',
  border: '2px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '6px',
  marginLeft: '5px',
});

const filterLabel = css({
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '16px',
  lineHeight: '19px',
  textAlign: 'center',
  color: '#000000',
});

const filterHelpIcon = css({
  fontSize: '16px',
  marginLeft: '4px',
  color: '#666',
  display: 'none',
});

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
    }
  }
});

const actionButtonsContainer = css({
  display: 'flex',
  flexDirection: 'row',
  gap: '12px',
  marginTop: '15px',
});

const simulateButton = css({
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
  }
});

const sendButton = css({
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
  }
});

const authwitButton = css({
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
  }
});

const loadingArtifactContainer = css({
  display: 'flex',
  flexDirection: 'column',
  textAlign: 'center',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2rem',
  height: '100%',
});

const headerContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  marginBottom: '25px',
});

const functionListContainer = css({
  width: '100%',
  padding: '0',
});

const FORBIDDEN_FUNCTIONS = ['process_log', 'sync_notes', 'public_dispatch'];

const PREDEFINED_CONTRACTS = {
  SIMPLE_VOTING: 'simple_voting',
  SIMPLE_TOKEN: 'simple_token',
  CUSTOM_UPLOAD: 'custom_upload'
};

interface ExtendedFunctionAbi extends FunctionAbi {
  originalName?: string;
}

const TOKEN_FUNCTION_MAPPING = {};

const TOKEN_ALLOWED_FUNCTIONS = [
  // Primary functions in specified order
  'mint_privately',
  'mint_publicly',
  'private_transfer',
  'public_transfer',
  'transfer_from_private_to_public',
  'transfer_from_public_to_private',
  // Other functions after the primary ones
  'name',
  'symbol',
  'decimals',
  'public_get_name',
  'public_get_symbol',
  'public_get_decimals',
  'public_total_supply',
  'public_balance_of',
  'private_balance_of',
  'burn_public',
  'burn_private',
  'prepare_private_balance_increase',
  'finalize_transfer_to_private',
  'finalize_mint_to_private',
  'cancel_authwit'
];

const MOCK_SIMPLE_TOKEN_ARTIFACT = {
  name: 'SimpleToken',
  version: '0.1.0',
  functions: [
    {
      name: 'transfer',
      functionType: 'private',
      parameters: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'field' }
      ],
      returnType: 'bool'
    },
    {
      name: 'balance_of',
      functionType: 'public',
      parameters: [
        { name: 'account', type: 'address' }
      ],
      returnType: 'field'
    },
    {
      name: 'mint',
      functionType: 'public',
      parameters: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'field' }
      ],
      returnType: 'bool'
    }
  ]
};

// Define the missing enum values if not present in the imported FunctionType
declare namespace FunctionTypeExtended {
  enum Type {
    PRIVATE = "private",
    PUBLIC = "public",
    UTILITY = "utility"
  }
}

// Function descriptions for SimpleVoting and SimpleToken contracts
const FUNCTION_DESCRIPTIONS = {
  // SimpleVoting functions
  constructor: "Initialize the voting contract with an admin who can end the vote.",
  cast_vote: "Cast a private vote for a candidate without revealing who you voted for.",
  end_vote: "End the voting process and prevent further vote submissions.",
  get_vote: "View the total number of votes for a specific candidate.",

  // SimpleToken functions
  mint_privately: "Create new tokens privately for a specified address.",
  mint_publicly: "Create new tokens publicly for a specified address.",
  private_transfer: "Transfer tokens without revealing the amount or participants, with complete privacy.",
  public_transfer: "Transfer tokens publicly where amounts and participants are visible to everyone.",
  transfer_from_private_to_public: "Move tokens from private to public state, revealing them on-chain.",
  transfer_from_public_to_private: "Move tokens from public to private state, hiding them from public view.",
  name: "Get the name of the token.",
  symbol: "Get the token's ticker symbol.",
  decimals: "Get the number of decimal places supported by the token.",
  public_get_name: "Get the token name from a public function.",
  public_get_symbol: "Get the token symbol from a public function.",
  public_get_decimals: "Get the token decimals from a public function.",
  public_total_supply: "View the total number of tokens in circulation.",
  public_balance_of: "View the public token balance of a specific address.",
  private_balance_of: "View the private token balance of a specific address.",
  burn_public: "Destroy tokens from a public balance, reducing total supply.",
  burn_private: "Destroy tokens from a private balance, reducing total supply.",
  prepare_private_balance_increase: "Prepare for a private balance increase operation.",
  finalize_transfer_to_private: "Complete a previously initiated transfer to private state.",
  finalize_mint_to_private: "Complete a previously initiated private mint operation.",
  cancel_authwit: "Cancel a previously created authorization witness."
};

export function ContractComponent() {
  const [contractArtifact, setContractArtifact] = useState<ContractArtifact | null>(null);
  const [functionAbis, setFunctionAbis] = useState<ExtendedFunctionAbi[]>([]);
  const [showUploadArea, setShowUploadArea] = useState(false);
  const [showNetworkConnect, setShowNetworkConnect] = useState(false);

  const [filters, setFilters] = useState({
    searchTerm: '',
    private: true,
    public: true,
    utility: true,
  });

  const [isLoadingArtifact, setIsLoadingArtifact] = useState(false);

  const [simulationResults, setSimulationResults] = useState({});
  const [parameters, setParameters] = useState({});

  const [openDeployContractDialog, setOpenDeployContractDialog] = useState(false);
  const [openRegisterContractDialog, setOpenRegisterContractDialog] = useState(false);
  const [openCreateAuthwitDialog, setOpenCreateAuthwitDialog] = useState(false);
  const [authwitFnData, setAuthwitFnData] = useState({
    name: '',
    parameters: [],
    isPrivate: false,
  });

  const {
    wallet,
    walletDB,
    currentContractAddress,
    currentContract,
    selectedPredefinedContract,
    setCurrentContract,
    setCurrentContractAddress,
    setCurrentTx,
    setSelectedPredefinedContract,
    nodeURL,
    isWorking,
    setIsWorking,
  } = useContext(AztecContext);

  const logContractState = (message: string = 'Contract State', contract = currentContract) => {
    console.log(`=== ${message} ===`);
    console.log('Current Contract Address:', currentContractAddress ? currentContractAddress.toString() : 'None');
    console.log('Contract Artifact:', contractArtifact ? {
      name: contractArtifact.name,
      functions: functionAbis.length
    } : 'None');
    console.log('Selected Predefined Contract:', selectedPredefinedContract || 'None');
    console.log('Wallet Connected:', wallet ? `Yes (${wallet.getAddress().toString()})` : 'No');
    console.log('Functions:', functionAbis.map(fn => fn.name));

    if (contract) {
      console.log('Contract Methods:', Object.keys(contract.methods));
      console.log('Contract Address:', contract.address.toString());
    }

    console.log('Is Working:', isWorking);
    console.log('Contract Interface Loaded:', contractArtifact ? 'Yes' : 'No');
    console.log('====================');
  };

  useEffect(() => {
    if (selectedPredefinedContract === PREDEFINED_CONTRACTS.CUSTOM_UPLOAD) {
      setShowUploadArea(true);
      setContractArtifact(null);
      setFunctionAbis([]);
    } else {
      setShowUploadArea(false);
      // Immediately clear the current contract artifact and set loading state
      // when a new contract is selected to provide immediate feedback
      if (selectedPredefinedContract) {
        setContractArtifact(null);
        setFunctionAbis([]);
        setIsLoadingArtifact(true);
      }
    }
    if (selectedPredefinedContract) {
      logContractState('Predefined Contract Selected');
    }
  }, [selectedPredefinedContract]);

  useEffect(() => {
    console.log('Wallet:', wallet);
    console.log('Current Contract:', currentContract);
    console.log('Is Working:', isWorking);
    if (currentContract) {
      logContractState('Contract Updated');
    }
  }, [wallet, currentContract, isWorking]);

  const sortFunctions = (functions: FunctionAbi[], contractName: string): FunctionAbi[] => {
    if (contractName === 'SimplePrivateVoting' || contractName === 'EasyPrivateVoting') {
      const order = ['constructor', 'cast_vote', 'end_vote', 'get_vote'];

      return [...functions].sort((a, b) => {
        const indexA = order.indexOf(a.name);
        const indexB = order.indexOf(b.name);

        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }

        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        return 0;
      });
    } else if (contractName === 'SimpleToken') {
      // For the token contract, order functions according to TOKEN_ALLOWED_FUNCTIONS array
      return [...functions].sort((a, b) => {
        const indexA = TOKEN_ALLOWED_FUNCTIONS.indexOf(a.name);
        const indexB = TOKEN_ALLOWED_FUNCTIONS.indexOf(b.name);

        // If both functions are in our allowed list, sort by their position
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }

        // If only one is in our allowed list, prioritize it
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        // Otherwise keep original order for functions not in our list
        return 0;
      });
    }

    return functions;
  };


  const filterTokenFunctions = (functions: FunctionAbi[]): ExtendedFunctionAbi[] => {
    return functions
      .filter(fn => TOKEN_ALLOWED_FUNCTIONS.includes(fn.name))
      .map(fn => {
        if (TOKEN_FUNCTION_MAPPING[fn.name]) {
          return {
            ...fn,
            name: TOKEN_FUNCTION_MAPPING[fn.name],
            originalName: fn.name
          };
        }
        return fn;
      });
  };

  const registerContractClassWithPXE = async (artifact: ContractArtifact) => {
    if (!wallet) {
      console.warn('Cannot register contract class: wallet not connected');
      return;
    }

    try {
      console.log('Pre-registering contract class with PXE...');
      await wallet.registerContractClass(artifact);
      console.log('Contract class pre-registered successfully');
    } catch (error) {
      console.error('Error pre-registering contract class:', error);
      // Don't throw - we want to continue even if this fails
    }
  };

  useEffect(() => {
    const loadPredefinedContract = async () => {
      setIsLoadingArtifact(true);

      let contractArtifact;

      if (selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_VOTING) {
        try {
          // Use simplified filenames in the public/contracts directory
          const response = await fetch('/contracts/EasyPrivateVoting.json', {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            }
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch contract: ${response.status} ${response.statusText}`);
          }
          const artifact = await response.json();
          contractArtifact = loadContractArtifact(artifact);
        } catch (err) {
          console.error('Error loading EasyPrivateVoting artifact:', err);
        }
      } else if (selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN) {
        try {
          // Use simplified filenames in the public/contracts directory
          const response = await fetch('/contracts/SimpleToken.json', {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            }
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch contract: ${response.status} ${response.statusText}`);
          }
          const artifact = await response.json();
          contractArtifact = loadContractArtifact(artifact);
        } catch (err) {
          console.error('Error loading SimpleToken artifact:', err);
        }
      }

      if (contractArtifact) {
        console.log('Loaded contract artifact:', contractArtifact);
        setContractArtifact(contractArtifact);

        let functionAbis = getAllFunctionAbis(contractArtifact);

        // Add debug logging to show all available functions
        console.log('All contract functions:', functionAbis.map(fn => ({
          name: fn.name,
          type: fn.functionType,
          parameters: fn.parameters.map(p => `${p.name}: ${p.type}`)
        })));

        // Don't filter any functions - we want to see all of them
        // The only filtering we do is through the UI checkboxes

        functionAbis = sortFunctions(functionAbis, contractArtifact.name);

        setFunctionAbis(functionAbis);
        setFilters({
          searchTerm: '',
          private: true,
          public: true,
          utility: true,
        });

        console.log('Setting up contract artifact:', contractArtifact.name);

        // Register the contract class with PXE when a predefined contract is loaded
        if (wallet) {
          await registerContractClassWithPXE(contractArtifact);
        }
      }

      setIsLoadingArtifact(false);
    };

    if (selectedPredefinedContract) {
      loadPredefinedContract();
    }
  }, [selectedPredefinedContract, wallet]);

  // Also register contract artifact when uploaded
  useEffect(() => {
    if (contractArtifact && wallet) {
      registerContractClassWithPXE(contractArtifact);
    }
  }, [contractArtifact, wallet]);

  useEffect(() => {
    const loadCurrentContract = async () => {
      setIsLoadingArtifact(true);
      const artifactAsString = await walletDB.retrieveAlias(`artifacts:${currentContractAddress}`);
      const contractArtifact = loadContractArtifact(parse(convertFromUTF8BufferAsString(artifactAsString)));

      // Register the contract class with PXE before creating Contract instance
      try {
        console.log('Pre-registering contract class before loading contract...');
        await wallet.registerContractClass(contractArtifact);
        console.log('Contract class pre-registered successfully');
      } catch (error) {
        console.error('Error pre-registering contract class:', error);
        // Continue even if registration fails - Contract.at will try to handle it
      }

      const contract = await Contract.at(currentContractAddress, contractArtifact, wallet);
      setCurrentContract(contract);
      setContractArtifact(contract.artifact);
      setFunctionAbis(sortFunctions(getAllFunctionAbis(contract.artifact), contract.artifact.name));
      setFilters({
        searchTerm: '',
        private: true,
        public: true,
        utility: true,
      });
      setIsLoadingArtifact(false);
    };
    if (currentContractAddress && currentContract?.address !== currentContractAddress) {
      loadCurrentContract();
    }
  }, [currentContractAddress]);

  useEffect(() => {
    console.log('DEBUG INFO:');
    console.log('- Contract Artifact:', contractArtifact ? contractArtifact.name : 'None');
    console.log('- Function ABIs Count:', functionAbis.length);
    console.log('- Function Types:', functionAbis.map(fn => fn.functionType));
    console.log('- Current Contract:', currentContract ? 'Available' : 'None');
    console.log('- Filters:', filters);
  }, [contractArtifact, functionAbis, currentContract, filters]);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async files => {
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!file.name.endsWith('.json')) {
        alert('Please upload a JSON file. Other file types are not supported.');
        return;
      }

      const reader = new FileReader();
      setIsLoadingArtifact(true);

      reader.onload = async e => {
        try {
          if (!e.target?.result) {
            throw new Error('Could not read the file content');
          }

          const fileContent = e.target.result as string;
          const artifact = JSON.parse(fileContent);
          const contractArtifact = loadContractArtifact(artifact);

          setSelectedPredefinedContract('');
          setCurrentContractAddress(null);

          setContractArtifact(contractArtifact);

          let functionAbis = getAllFunctionAbis(contractArtifact);
          functionAbis = sortFunctions(functionAbis, contractArtifact.name);
          setFunctionAbis(functionAbis);

          setFilters({
            searchTerm: '',
            private: true,
            public: true,
            utility: true,
          });


          setShowUploadArea(false);

          if (wallet) {
            setTimeout(() => {
              if (confirm('Would you like to deploy this contract now?')) {
                setOpenDeployContractDialog(true);
              }
            }, 500);
          }

        } catch (error) {
          console.error('Error parsing contract artifact:', error);
          alert(`Failed to load contract artifact: ${error.message || 'Unknown error'}`);
        } finally {
          setIsLoadingArtifact(false);
        }
      };

      reader.onerror = () => {
        console.error('Error reading file:', reader.error);
        alert('Error reading the uploaded file. Please try again.');
        setIsLoadingArtifact(false);
      };

      reader.readAsText(file);
    },
    accept: {
      'application/json': ['.json']
    },
    multiple: false
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleParameterChange = (fnName: string, index: number, value: any) => {
    const matchingFn = functionAbis.find(f => f.name === fnName) as ExtendedFunctionAbi;
    // Use the original name only if it exists
    const realFnName = matchingFn?.originalName || fnName;

    const fnParameters = parameters[realFnName] || [];
    fnParameters[index] = value;
    setParameters({ ...parameters, [realFnName]: fnParameters });
  };

  const handleContractDeployment = async (contract?: ContractInstanceWithAddress, alias?: string) => {
    console.log('=== POST-DEPLOYMENT SETUP STARTED ===');
    console.log('Contract instance received:', contract ? 'Yes' : 'No');
    console.log('Alias:', alias);

    // Close the dialog first regardless of contract status
    setOpenDeployContractDialog(false);

    if (contract) {
      setIsWorking(true); // Set isWorking to true when deployment starts

      // Set up a current transaction object for the deployment to track status
      const deploymentTx = {
        status: 'proving' as const,
        fnName: 'deploy',
        contractAddress: contract.address,
      };
      setCurrentTx(deploymentTx);

      console.log('Contract address:', contract.address.toString());
      console.log('Contract class ID:', contract.currentContractClassId.toString());
      console.log('Wallet available:', wallet ? 'Yes' : 'No');
      console.log('Contract artifact available:', contractArtifact ? 'Yes' : 'No');
      console.log('Selected contract type:', selectedPredefinedContract || 'Custom');

      let hasError = false;

      try {
        // Register the contract class with PXE first
        try {
          console.log('Registering contract class with PXE...');
          await wallet.registerContractClass(contractArtifact);
          console.log('Contract class registered successfully with PXE');
        } catch (err) {
          // Log the error but continue
          console.error('Error registering contract class - continuing anyway:', err);
        }

        console.log('Initializing Contract instance at the deployed address...');
        const deployedContract = await Contract.at(contract.address, contractArtifact, wallet);
        console.log('Contract initialized successfully');

        console.log('Setting current contract address...');
        setCurrentContractAddress(deployedContract.address);
        console.log('Setting current contract instance...');
        setCurrentContract(deployedContract);

        console.log('Storing contract in walletDB...');
        await walletDB.storeContract(deployedContract.address, contractArtifact, undefined, alias);
        console.log('Contract stored successfully');

        // List available methods
        console.log('Contract methods available:');
        const methods = Object.keys(deployedContract.methods);
        methods.forEach(method => console.log(`- ${method}`));

        // Update transaction status to success
        setCurrentTx({
          ...deploymentTx,
          status: 'sending' as const, // Use a valid status from the allowed types
        });

        console.log('=== POST-DEPLOYMENT SETUP COMPLETED SUCCESSFULLY ===');
        console.log('Successfully deployed contract at address:', deployedContract.address.toString());
      } catch (error) {
        // Log the error directly
        console.error('=== DEPLOYMENT ERROR ===');
        console.error(error);

        // Mark that we had an error
        hasError = true;

        // Update transaction status to error and include the error message
        setCurrentTx({
          ...deploymentTx,
          status: 'error' as const,
          error: error.message || 'Unknown deployment error',
        });
      } finally {
        // Only set isWorking to false if there was no error
        if (!hasError) {
          setIsWorking(false);
        }
      }
    }
  };

  const handleContractCreation = async (contract?: ContractInstanceWithAddress, alias?: string) => {
    if (contract && alias) {
      setIsWorking(true); // Set isWorking to true when contract registration starts

      // Set up a current transaction object for the registration to track status
      const registrationTx = {
        status: 'proving' as const,
        fnName: 'register',
        contractAddress: contract.address,
      };
      setCurrentTx(registrationTx);

      let hasError = false;

      try {
        await walletDB.storeContract(contract.address, contractArtifact, undefined, alias);
        setCurrentContract(await Contract.at(contract.address, contractArtifact, wallet));
        setCurrentContractAddress(contract.address);
        console.log('Successfully registered contract at address:', contract.address.toString());

        // Update transaction status to success
        setCurrentTx({
          ...registrationTx,
          status: 'sending' as const,
        });
      } catch (error) {
        console.error('Error registering contract:', error);

        // Mark that we had an error
        hasError = true;

        // Update transaction status to error and include the error message
        setCurrentTx({
          ...registrationTx,
          status: 'error' as const,
          error: error.message || 'Unknown registration error',
        });
      } finally {
        // Only set isWorking to false if there was no error
        if (!hasError) {
          setIsWorking(false);
        }
      }
    }
    setOpenDeployContractDialog(false);
    setOpenRegisterContractDialog(false);
  };

  const simulate = async (fnName: string) => {
    console.log(`=== SIMULATING FUNCTION: ${fnName} ===`);

    if (!currentContract) {
      console.error('Simulation failed: No contract instance available');

      // Use error modal instead of alert
      setCurrentTx({
        status: 'error' as const,
        fnName: fnName,
        error: 'You need to deploy this contract before you can simulate functions',
        contractAddress: null // Add contractAddress property
      });
      // Don't set isWorking to false on error to keep modal visible
      return;
    }

    console.log('Contract address:', currentContract.address.toString());
    console.log('Contract methods available:', Object.keys(currentContract.methods));

    const matchingFn = functionAbis.find(f => f.name === fnName) as ExtendedFunctionAbi;

    if (!matchingFn) {
      console.error(`Function ${fnName} not found in contract ABI`);

      // Use error modal instead of alert
      setCurrentTx({
        status: 'error' as const,
        fnName: fnName,
        error: `Function ${fnName} not found in contract ABI`,
        contractAddress: currentContract.address // Add contractAddress property
      });
      // Don't set isWorking to false on error to keep modal visible
      return;
    }

    // Use the original name only if it exists
    const realFnName = matchingFn?.originalName || fnName;

    console.log('Function to call:', realFnName);

    if (!currentContract.methods[realFnName]) {
      console.error(`Method ${realFnName} not found in contract instance`);
      console.log('Available methods:', Object.keys(currentContract.methods));

      // Use error modal instead of alert
      setCurrentTx({
        status: 'error' as const,
        fnName: fnName,
        error: `Method ${realFnName} not found in contract instance`,
        contractAddress: currentContract.address // Add contractAddress property
      });
      // Don't set isWorking to false on error to keep modal visible
      return;
    }

    setIsWorking(true);
    let result;
    try {
      console.log('Getting function parameters...');
      const fnParameters = parameters[realFnName] ?? [];
      console.log('Parameters:', fnParameters);

      console.log('Creating function call...');
      const call = currentContract.methods[realFnName](...fnParameters);
      console.log('Function call created successfully');

      console.log('Simulating function call...');
      result = await call.simulate();
      console.log('Simulation result:', result);

      setSimulationResults({
        ...simulationResults,
        ...{ [fnName]: { success: true, data: result } },
      });
      console.log('=== SIMULATION COMPLETED SUCCESSFULLY ===');
    } catch (error) {
      console.error('=== SIMULATION ERROR ===');
      console.error(error);

      setSimulationResults({
        ...simulationResults,
        ...{ [fnName]: { success: false, error: error.message } },
      });

      // Show error in modal
      setCurrentTx({
        status: 'error' as const,
        fnName: fnName,
        error: error.message || 'Simulation failed',
        contractAddress: currentContract.address // Add contractAddress property
      });
      // Don't set isWorking to false when there's an error
      // so the error modal stays visible
      return;
    } finally {
      // Only set isWorking to false if we haven't encountered an error
      setIsWorking(false);
    }
  };

  const send = async (fnName: string) => {
    console.log(`=== SENDING TRANSACTION: ${fnName} ===`);

    if (!currentContract) {
      console.error('Transaction failed: No contract instance available');

      // Use error modal instead of alert
      setCurrentTx({
        status: 'error' as const,
        fnName: fnName,
        error: 'You need to deploy this contract before you can send transactions',
        contractAddress: null // Add contractAddress property
      });
      return;
    }

    console.log('Contract address:', currentContract.address.toString());
    console.log('Contract methods available:', Object.keys(currentContract.methods));

    setIsWorking(true);
    let receipt;
    let txHash;

    const matchingFn = functionAbis.find(f => f.name === fnName) as ExtendedFunctionAbi;

    if (!matchingFn) {
      console.error(`Function ${fnName} not found in contract ABI`);

      // Use error modal instead of alert
      setCurrentTx({
        status: 'error' as const,
        fnName: fnName,
        error: `Function ${fnName} not found in contract ABI`,
        contractAddress: currentContract.address // Add contractAddress property
      });
      // Don't set isWorking to false on error to keep modal visible
      return;
    }

    // Use the original name only if it exists
    const realFnName = matchingFn?.originalName || fnName;

    console.log('Function to call:', realFnName);

    if (!currentContract.methods[realFnName]) {
      console.error(`Method ${realFnName} not found in contract instance`);
      console.log('Available methods:', Object.keys(currentContract.methods));

      // Use error modal instead of alert
      setCurrentTx({
        status: 'error' as const,
        fnName: fnName,
        error: `Method ${realFnName} not found in contract instance`,
        contractAddress: currentContract.address // Add contractAddress property
      });
      // Don't set isWorking to false on error to keep modal visible
      return;
    }

    const currentTx = {
      status: 'proving' as const,
      fnName: fnName,
      contractAddress: currentContract.address,
    };
    setCurrentTx(currentTx);
    console.log('Transaction status set to proving');

    try {
      console.log('Getting function parameters...');
      const fnParameters = parameters[realFnName] || [];
      console.log('Parameters:', fnParameters);

      console.log('Creating function call...');
      const call = currentContract.methods[realFnName](...fnParameters);
      console.log('Function call created successfully');

      console.log('Creating proof for function call...');
      const provenCall = await call.prove();
      console.log('Proof created successfully');

      console.log('Getting transaction hash...');
      txHash = await provenCall.getTxHash();
      console.log('Transaction hash:', txHash);

      setCurrentTx({
        ...currentTx,
        ...{ txHash, status: 'sending' },
      });
      console.log('Transaction status set to sending');

      console.log('Submitting transaction to the network...');
      receipt = await provenCall.send().wait({ dontThrowOnRevert: true });
      console.log('Transaction receipt:', receipt);

      console.log('Transaction status:', receipt.status);
      if (receipt.error) {
        console.error('Transaction error:', receipt.error);
      }

      console.log('Storing transaction in wallet DB...');
      await walletDB.storeTx({
        contractAddress: currentContract.address,
        txHash,
        fnName,
        receipt,
      });
      console.log('Transaction stored successfully');

      setCurrentTx({
        ...currentTx,
        ...{
          txHash,
          status: receipt.status,
          receipt,
          error: receipt.error,
        },
      });
      console.log('=== TRANSACTION COMPLETED ===');
    } catch (error) {
      console.error('=== TRANSACTION ERROR ===');
      console.error(error);

      // Show error in modal
      setCurrentTx({
        ...currentTx,
        status: 'error' as const,
        error: error.message || 'Transaction failed',
      });
      // Don't set isWorking to false when there's an error
      // so the error modal stays visible
      return;
    } finally {
      // Only set isWorking to false if we haven't encountered an error
      setIsWorking(false);
    }
  };

  const handleAuthwitFnDataChanged = (
    fnName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: any[],
    isPrivate: boolean,
  ) => {
    const matchingFn = functionAbis.find(f => f.name === fnName) as ExtendedFunctionAbi;
    // Use the original name only if it exists
    const realFnName = matchingFn?.originalName || fnName;

    setAuthwitFnData({ name: realFnName, parameters, isPrivate });
    setOpenCreateAuthwitDialog(true);
  };

  const handleAuthwitCreation = async (witness?: AuthWitness, alias?: string) => {
    if (witness && alias) {
      await walletDB.storeAuthwitness(witness, undefined, alias);
    }
    setAuthwitFnData({ name: '', parameters: [], isPrivate: false });
    setOpenCreateAuthwitDialog(false);
  };

  // Debug effect to log filtered functions
  useEffect(() => {
    if (functionAbis.length > 0) {
      const filtered = functionAbis.filter(
        fn => !fn.isInternal &&
        !fn.isInitializer &&
        !FORBIDDEN_FUNCTIONS.includes(fn.name) &&
        ((filters.private && fn.functionType === FunctionType.PRIVATE) ||
          (filters.public && fn.functionType === FunctionType.PUBLIC) ||
          (filters.utility && (fn.functionType === FunctionType.UTILITY || fn.functionType.toString() === "utility"))) &&
        (filters.searchTerm === '' || fn.name.includes(filters.searchTerm))
      );

      const excluded = functionAbis.filter(
        fn => fn.isInternal ||
        fn.isInitializer ||
        FORBIDDEN_FUNCTIONS.includes(fn.name) ||
        !((filters.private && fn.functionType === FunctionType.PRIVATE) ||
          (filters.public && fn.functionType === FunctionType.PUBLIC) ||
          (filters.utility && (fn.functionType === FunctionType.UTILITY || fn.functionType.toString() === "utility"))) ||
        (filters.searchTerm !== '' && !fn.name.includes(filters.searchTerm))
      );

      console.log('Filtered functions:', filtered.map(fn => fn.name));
      console.log('Excluded functions:', excluded.map(fn => ({
        name: fn.name,
        isInternal: fn.isInternal,
        isInitializer: fn.isInitializer,
        functionType: fn.functionType,
        forbidden: FORBIDDEN_FUNCTIONS.includes(fn.name),
        matchesFilter: (filters.private && fn.functionType === FunctionType.PRIVATE) ||
          (filters.public && fn.functionType === FunctionType.PUBLIC) ||
          (filters.utility && (fn.functionType === FunctionType.UTILITY || fn.functionType.toString() === "utility")),
        matchesSearch: filters.searchTerm === '' || fn.name.includes(filters.searchTerm)
      })));
    }
  }, [functionAbis, filters]);

  const resetPXEDatabase = async () => {
    try {
      console.log('=== RESETTING PXE DATABASE ===');

      // Clear IndexedDB database that's causing issues
      const dbs = await window.indexedDB.databases();
      console.log('Found databases:', dbs);

      // Look for any PXE-related or wallet-related databases
      const pxeDbs = dbs.filter(db =>
        db.name && (
          db.name.includes('pxe') ||
          db.name.includes('wallet') ||
          db.name.includes('aztec')
        )
      );

      console.log('PXE databases to reset:', pxeDbs);

      // Delete them one by one
      for (const db of pxeDbs) {
        if (db.name) {
          console.log(`Deleting database: ${db.name}`);
          await new Promise((resolve, reject) => {
            const request = window.indexedDB.deleteDatabase(db.name!);
            request.onsuccess = () => {
              console.log(`Successfully deleted database: ${db.name}`);
              resolve(undefined);
            };
            request.onerror = () => {
              console.error(`Error deleting database: ${db.name}`);
              reject(new Error(`Failed to delete database: ${db.name}`));
            };
          });
        }
      }

      console.log('Database reset complete. Reload the page to reconnect.');
      alert('Database reset successful. Please reload the page to reconnect to the network with a fresh database.');
    } catch (error) {
      console.error('Error resetting PXE database:', error);
      alert('Error resetting PXE database: ' + error.message);
    }
  };

  // Handle the network connection action
  const handleShowNetworkConnect = () => {
    // Send a message to the parent component to show the network connect UI
    window.dispatchEvent(new CustomEvent('aztec:showNetworkConnect'));
  };

  return (
    <div css={container}>
      <LoadingModal />
      {showUploadArea ? (
        !isLoadingArtifact ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '1rem' }}>
            <div css={dropZoneContainer}>
              <div {...getRootProps({ className: 'dropzone' })}>
                <input {...getInputProps()} />
                <UploadFileIcon css={uploadIcon} />
                <Typography variant="h5" sx={{ mb: 2, color: '#9894FF' }}>Upload Contract JSON Artifact</Typography>
                <Typography>Drag and drop a contract JSON file here, or click to select a file</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, mb: 3, display: 'block' }}>
                  The contract artifact should be a JSON file exported from your Noir/Aztec project
                </Typography>
                <Button
                  variant="contained"
                  sx={{ mt: 2, backgroundColor: '#9894FF', '&:hover': { backgroundColor: '#8C7EFF' } }}
                >
                  Select File
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div css={loadingArtifactContainer}>
            <Typography variant="h5">Loading artifact...</Typography>
            <CircularProgress style={{ color: '#9894FF' }} size={100} />
          </div>
        )
      ) : isLoadingArtifact ? (
        <div css={loadingArtifactContainer}>
          <Typography variant="h5">Loading contract...</Typography>
          <CircularProgress style={{ color: '#9894FF' }} size={100} />
        </div>
      ) : !contractArtifact ? (
        <div css={loadingArtifactContainer}>
          <Typography variant="h5">No contract loaded</Typography>
          <Typography>
            Select a contract from the dropdown or upload your own.
          </Typography>
        </div>
      ) : (
        <div css={contractFnContainer}>
          <div css={headerSection}>
            <div css={descriptionText}>
             {selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_VOTING ? (
               <>
                 On this page you can simulate transactions in this contract and send them to the network.
                 <br />
                 This contract allows a person to vote privately on a public vote.
               </>
             ) : selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN ? (
               <>
                 On this page you can simulate transactions in this contract and send them to the network.
                 <br />
                 This is a simple token contract demonstrating holding it both publicly and privately, and being able to transfer publicly and privately, and move it in and out of state publicly and privately.
               </>
             ) : (
               <>
                 On this page you can simulate transactions in this contract and send them to the network.
               </>
             )}
            </div>
            <div css={buttonContainer}>
              <Button
                css={actionButton}
                onClick={() => setOpenDeployContractDialog(true)}
                disabled={!nodeURL}
              >
                Deploy
              </Button>
              <Button
                css={actionButton}
                onClick={() => window.open('https://docs.aztec.network/', '_blank')}
              >
                Go to Docs
              </Button>
              <DeployContractDialog
                contractArtifact={contractArtifact}
                open={openDeployContractDialog}
                onClose={handleContractDeployment}
              />
              <RegisterContractDialog
                contractArtifact={contractArtifact}
                open={openRegisterContractDialog}
                onClose={handleContractCreation}
              />
            </div>
          </div>

          <div css={tokenSection}>
            <div css={tokenHeader}>
              {selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_VOTING ? 'Simple Private Voting' :
               selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN ? 'Simple Token' :
               contractArtifact?.name || 'Contract'}
            </div>
            <div css={searchContainer}>
              <SearchIcon style={{ color: 'rgba(60, 60, 67, 0.6)', marginRight: '8px' }} />
              <Input
                type="text"
                fullWidth
                disableUnderline
                placeholder="Search"
                value={filters.searchTerm}
                onChange={e => setFilters({ ...filters, searchTerm: e.target.value })}
                style={{
                  fontFamily: 'SF Pro Text, sans-serif',
                  fontSize: '17px',
                  color: 'rgba(60, 60, 67, 0.6)'
                }}
              />
            </div>
            <div css={filterContainer}>
              <Tooltip
                title="These functions are simulated locally and only proofs are sent to Aztec"
                arrow
                componentsProps={{
                  tooltip: {
                    sx: {
                      fontSize: '14px',
                      padding: '10px',
                      maxWidth: '300px',
                      lineHeight: '1.4'
                    }
                  }
                }}
              >
                <div css={filterButton}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        css={filterCheckbox}
                        checked={filters.private}
                        onChange={e => setFilters({ ...filters, private: e.target.checked })}
                      />
                    }
                    label={<span css={filterLabel}>Private</span>}
                  />
                </div>
              </Tooltip>
              <Tooltip
                title="These are public functions that work similarly to other blockchains"
                arrow
                componentsProps={{
                  tooltip: {
                    sx: {
                      fontSize: '14px',
                      padding: '10px',
                      maxWidth: '300px',
                      lineHeight: '1.4'
                    }
                  }
                }}
              >
                <div css={filterButton}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        css={filterCheckbox}
                        checked={filters.public}
                        onChange={e => setFilters({ ...filters, public: e.target.checked })}
                      />
                    }
                    label={<span css={filterLabel}>Public</span>}
                  />
                </div>
              </Tooltip>
              <Tooltip
                title="Only invoked by applications that interact with contracts to perform state queries from an off-chain client. They are unconstrained, meaning no proofs are generated"
                arrow
                componentsProps={{
                  tooltip: {
                    sx: {
                      fontSize: '14px',
                      padding: '10px',
                      maxWidth: '350px',
                      lineHeight: '1.4'
                    }
                  }
                }}
              >
                <div css={filterButton}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        css={filterCheckbox}
                        checked={filters.utility}
                        onChange={e => setFilters({ ...filters, utility: e.target.checked })}
                      />
                    }
                    label={<span css={filterLabel}>Utility</span>}
                  />
                </div>
              </Tooltip>
            </div>
          </div>

          {!currentContract && (
            <div style={{ padding: '20px', margin: '10px 0', textAlign: 'center', backgroundColor: 'rgba(152, 148, 255, 0.1)', borderRadius: '8px' }}>
              <Typography variant="subtitle1" style={{ color: '#9894FF' }}>
                {selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_VOTING ? (
                  'This is a simple voting contract that allows users to cast their votes privately. Your vote remains hidden while still being verifiably counted.'
                ) : selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN ? (
                  'This contract demonstrates private token transfers and balances. Users can transact without revealing amounts or participants while maintaining verifiability.'
                ) : (
                  'This is your own uploaded contract. Remember you will need to deploy it before you can interact with it.'
                )}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                {!nodeURL ? (
                  <>
                    You are not connected to a network. Please <span
                      onClick={handleShowNetworkConnect}
                      style={{ color: '#9894FF', cursor: 'pointer', textDecoration: 'underline' }}>
                      connect
                    </span> first.
                  </>
                ) : (
                  <>
                    {selectedPredefinedContract ? 'Remember you will need to deploy it before you can interact with it.' : 'Click the "Deploy" button above to deploy this contract to the network.'}
                    {functionAbis.some(fn => fn.isInitializer) && (
                      <div style={{ marginTop: '8px'}}>
                        This contract has initializer functions that will be available in the deployment dialog.
                      </div>
                    )}
                  </>
                )}
              </Typography>
            </div>
          )}

          {/* Contract functions list */}
          <div css={functionListContainer}>
            {/* Debug information */}
            {functionAbis.length === 0 && contractArtifact && (
              <div style={{ padding: '20px', margin: '10px 0', textAlign: 'center', backgroundColor: 'rgba(255, 235, 59, 0.1)', borderRadius: '8px' }}>
                <Typography variant="subtitle1" style={{ color: '#FF9800' }}>
                  No functions found for this contract. Please check the console for debugging information.
                </Typography>
              </div>
            )}
            {functionAbis
              .filter(
                fn =>
                  !fn.isInternal &&
                  !fn.isInitializer &&
                  !FORBIDDEN_FUNCTIONS.includes(fn.name) &&
                  ((filters.private && fn.functionType === FunctionType.PRIVATE) ||
                    (filters.public && fn.functionType === FunctionType.PUBLIC) ||
                    (filters.utility && (fn.functionType === FunctionType.UTILITY || fn.functionType.toString() === "utility"))) &&
                  (filters.searchTerm === '' || fn.name.includes(filters.searchTerm)),
              )
              .map(fn => (
                <div
                  key={fn.name}
                  css={functionCard}
                >
                  <div style={{ padding: '36px' }}>
                    <div css={functionTypeLabel}>
                      {fn.functionType.toUpperCase()}
                    </div>
                    <div css={functionName}>
                      {fn.name}
                    </div>
                    {selectedPredefinedContract !== PREDEFINED_CONTRACTS.CUSTOM_UPLOAD && FUNCTION_DESCRIPTIONS[fn.name] && (
                      <div css={functionDescription}>
                        {FUNCTION_DESCRIPTIONS[fn.name]}
                      </div>
                    )}

                    {fn.parameters.length > 0 && (
                      <>
                        <div css={parametersLabel}>
                          PARAMETERS
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '15px' }}>
                          {fn.parameters.map((param, i) => (
                            <div key={param.name} style={{ width: '212px', marginRight: '16px' }}>
                              <FunctionParameter
                                parameter={param}
                                onParameterChange={newValue => {
                                  handleParameterChange(fn.name, i, newValue);
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
                      <button
                        css={simulateButton}
                        disabled={!wallet || !currentContract || isWorking}
                        onClick={() => simulate(fn.name)}
                      >
                        SIMULATE
                        <PsychologyIcon style={{ fontSize: '14px', marginLeft: '5px' }} />
                      </button>
                      <button
                        css={sendButton}
                        disabled={!wallet || !currentContract || isWorking || fn.functionType.toString() === "utility"}
                        onClick={() => send(fn.name)}
                      >
                        SEND
                        <SendIcon style={{ fontSize: '14px', marginLeft: '5px' }} />
                      </button>
                      <button
                        css={authwitButton}
                        disabled={!wallet || !currentContract || isWorking || fn.functionType.toString() === "utility"}
                        onClick={() =>
                          handleAuthwitFnDataChanged(fn.name, parameters[fn.name], fn.functionType === FunctionType.PRIVATE)
                        }
                      >
                        AUTHWIT
                        <VpnKeyIcon style={{ fontSize: '14px', marginLeft: '5px' }} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
      <CreateAuthwitDialog
        open={openCreateAuthwitDialog}
        onClose={handleAuthwitCreation}
        fnName={authwitFnData.name}
        args={authwitFnData.parameters}
        isPrivate={authwitFnData.isPrivate}
      />
    </div>
  );
}
