import type { VerificationKeyData } from '@aztec/stdlib/vks';

import HidingKernelToPublicJson from '../../../artifacts/hiding_kernel_to_public.json' with { type: 'json' };
import HidingKernelToRollupJson from '../../../artifacts/hiding_kernel_to_rollup.json' with { type: 'json' };
import PrivateKernelInitJson from '../../../artifacts/private_kernel_init.json' with { type: 'json' };
import PrivateKernelInnerJson from '../../../artifacts/private_kernel_inner.json' with { type: 'json' };
import PrivateKernelTailJson from '../../../artifacts/private_kernel_tail.json' with { type: 'json' };
import PrivateKernelTailToPublicJson from '../../../artifacts/private_kernel_tail_to_public.json' with { type: 'json' };
import { PrivateKernelResetVks } from '../../private_kernel_reset_vks.js';
import { abiToVKData } from '../../utils/vk_json.js';
import type { ClientProtocolArtifact } from '../types.js';

export const ClientCircuitVks: Record<ClientProtocolArtifact, VerificationKeyData> = {
  PrivateKernelInitArtifact: abiToVKData(PrivateKernelInitJson),
  PrivateKernelInnerArtifact: abiToVKData(PrivateKernelInnerJson),
  PrivateKernelTailArtifact: abiToVKData(PrivateKernelTailJson),
  PrivateKernelTailToPublicArtifact: abiToVKData(PrivateKernelTailToPublicJson),
  HidingKernelToRollup: abiToVKData(HidingKernelToRollupJson),
  HidingKernelToPublic: abiToVKData(HidingKernelToPublicJson),
  ...PrivateKernelResetVks,
};
