import type { VerificationKeyData } from '@aztec/stdlib/vks';

import HidingKernelToPublicJson from '../../../artifacts/hiding_kernel_to_public.json' with { type: 'json' };
import HidingKernelToRollupJson from '../../../artifacts/hiding_kernel_to_rollup.json' with { type: 'json' };
import PrivateKernelInitJson from '../../../artifacts/private_kernel_init.json' with { type: 'json' };
import PrivateKernelInit2Json from '../../../artifacts/private_kernel_init_2.json' with { type: 'json' };
import PrivateKernelInit3Json from '../../../artifacts/private_kernel_init_3.json' with { type: 'json' };
import PrivateKernelInit4Json from '../../../artifacts/private_kernel_init_4.json' with { type: 'json' };
import PrivateKernelInit5Json from '../../../artifacts/private_kernel_init_5.json' with { type: 'json' };
import PrivateKernelInnerJson from '../../../artifacts/private_kernel_inner.json' with { type: 'json' };
import PrivateKernelInner2Json from '../../../artifacts/private_kernel_inner_2.json' with { type: 'json' };
import PrivateKernelInner3Json from '../../../artifacts/private_kernel_inner_3.json' with { type: 'json' };
import PrivateKernelInner4Json from '../../../artifacts/private_kernel_inner_4.json' with { type: 'json' };
import PrivateKernelInner5Json from '../../../artifacts/private_kernel_inner_5.json' with { type: 'json' };
import {
  PrivateKernelResetTailToPublicVks,
  PrivateKernelResetTailVks,
  PrivateKernelResetVks,
} from '../../private_kernel_reset_vks.js';
import { abiToVKData } from '../../utils/vk_json.js';
import type { ClientProtocolArtifact } from '../types.js';

export const ClientCircuitVks: Record<ClientProtocolArtifact, VerificationKeyData> = {
  PrivateKernelInitArtifact: abiToVKData(PrivateKernelInitJson),
  PrivateKernelInit2Artifact: abiToVKData(PrivateKernelInit2Json),
  PrivateKernelInit3Artifact: abiToVKData(PrivateKernelInit3Json),
  PrivateKernelInit4Artifact: abiToVKData(PrivateKernelInit4Json),
  PrivateKernelInit5Artifact: abiToVKData(PrivateKernelInit5Json),
  PrivateKernelInnerArtifact: abiToVKData(PrivateKernelInnerJson),
  PrivateKernelInner2Artifact: abiToVKData(PrivateKernelInner2Json),
  PrivateKernelInner3Artifact: abiToVKData(PrivateKernelInner3Json),
  PrivateKernelInner4Artifact: abiToVKData(PrivateKernelInner4Json),
  PrivateKernelInner5Artifact: abiToVKData(PrivateKernelInner5Json),
  HidingKernelToRollup: abiToVKData(HidingKernelToRollupJson),
  HidingKernelToPublic: abiToVKData(HidingKernelToPublicJson),
  ...PrivateKernelResetVks,
  ...PrivateKernelResetTailVks,
  ...PrivateKernelResetTailToPublicVks,
};
