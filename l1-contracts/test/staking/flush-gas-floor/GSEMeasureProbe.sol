// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {GSE} from "@aztec/governance/GSE.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {G1Point, G2Point, BN254Lib} from "@aztec/shared/libraries/BN254Lib.sol";
import {Bn254LibWrapper} from "@aztec/governance/Bn254LibWrapper.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {console} from "forge-std/console.sol";

/**
 * Instrumented GSE used only to measure the gas `GSE.deposit` consumes before the proof-of-possession wrapper call,
 * the input to `FLUSH_GSE_PRE_CHECK_GAS`. `_checkProofOfPossession` is the production body with two `gasleft()`
 * logs around the wrapper call; the caller logs the gas it forwards to `deposit`, so the pre-verification cost is
 * the forwarded gas minus the second log. The body must be kept identical to `GSE._checkProofOfPossession` for the
 * measurement to mean anything.
 */
contract GSEMeasureProbe is GSE {
  Bn254LibWrapper internal immutable PROBE_WRAPPER = new Bn254LibWrapper();

  constructor(address __owner, IERC20 _asset, uint256 _activationThreshold, uint256 _ejectionThreshold)
    GSE(__owner, _asset, _activationThreshold, _ejectionThreshold)
  {}

  function _checkProofOfPossession(
    address _attester,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession
  ) internal override {
    console.log("GSE gasleft at _checkProofOfPossession entry", gasleft());

    G1Point memory previouslyRegisteredPoint = configOf[_attester].publicKey;
    require(
      (previouslyRegisteredPoint.x == 0 && previouslyRegisteredPoint.y == 0),
      Errors.GSE__CannotChangePublicKeys(previouslyRegisteredPoint.x, previouslyRegisteredPoint.y)
    );

    bytes32 hashedIncomingPoint = keccak256(abi.encodePacked(_publicKeyInG1.x, _publicKeyInG1.y));
    require((!ownedPKs[hashedIncomingPoint]), Errors.GSE__ProofOfPossessionAlreadySeen(hashedIncomingPoint));
    ownedPKs[hashedIncomingPoint] = true;

    console.log("GSE gasleft immediately before wrapper call", gasleft());

    require(
      PROBE_WRAPPER.proofOfPossession{
        gas: proofOfPossessionGasLimit
      }(_publicKeyInG1, _publicKeyInG2, _proofOfPossession),
      Errors.GSE__InvalidProofOfPossession()
    );
  }
}
