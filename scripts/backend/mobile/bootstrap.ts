import { readAppConfig } from "../../common/app-config.js";
import { fetchChainDropState, resolveDropPhase } from "./drop.js";
import type { BackendRuntime } from "../runtime.js";

export async function buildMobileBootstrap(runtime: BackendRuntime) {
  const appConfig = readAppConfig(runtime.cluster);
  const chainState = await fetchChainDropState(runtime);
  const phase = resolveDropPhase(appConfig, chainState.mintedCount, chainState.supply);

  return {
    cluster: runtime.cluster,
    clusterFlavor: appConfig.clusterFlavor,
    collectionName: appConfig.collectionName,
    phase,
    supply: chainState.supply,
    mintedCount: chainState.mintedCount,
    remainingCount: chainState.remainingCount,
    allowlistStartIso: appConfig.allowlistStartIso,
    publicStartIso: appConfig.publicStartIso,
    pricing: {
      allowlistSkrBaseUnits: chainState.allowlistPriceSkrBaseUnits,
      publicSkrBaseUnits: chainState.publicPriceSkrBaseUnits
    },
    links: {
      backendBaseUrl: appConfig.backendBaseUrl,
      privacyPolicyUrl: appConfig.privacyPolicyUrl,
      supportUrl: appConfig.supportUrl,
      termsOfUseUrl: appConfig.termsOfUseUrl
    },
    releaseMessage: appConfig.policyAnnouncement
  };
}
