import bs58 from "bs58";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  createNoopSigner,
  publicKey,
  signerIdentity,
  transactionBuilder
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mintV2, mplCandyMachine, route } from "@metaplex-foundation/mpl-candy-machine";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { toWeb3JsInstruction } from "@metaplex-foundation/umi-web3js-adapters";
import { readAppConfig } from "../../common/app-config.js";
import { readJson } from "../../common/io.js";
import { rootPath } from "../../common/paths.js";
import { MobileApiError } from "./errors.js";
import { fetchChainDropState, resolveDropPhase } from "./drop.js";
import type { BackendRuntime } from "../runtime.js";

type AllowlistArtifact = {
  merkleRootBase58: string;
  proofs: Record<string, string[]>;
};

export type MintPrepareRequest = {
  wallet: string;
  group: "public" | "allowlist";
  nftMint: string;
};

type PreparedGroup = {
  requestGroup: "public" | "allowlist";
  onChainGroup: "public" | "alwlst";
  mintLimitId: 1 | 2;
};

function readAllowlistArtifact(cluster: "devnet" | "mainnet-beta"): AllowlistArtifact {
  return readJson<AllowlistArtifact>(rootPath("artifacts", `allowlist-proofs.${cluster}.json`));
}

function normalizePublicKey(value: string, label: string): string {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new MobileApiError(400, "invalid_public_key", `${label} is invalid.`);
  }
}

function resolvePreparedGroup(group: MintPrepareRequest["group"]): PreparedGroup {
  if (group === "allowlist") {
    return {
      requestGroup: "allowlist",
      onChainGroup: "alwlst",
      mintLimitId: 1
    };
  }

  return {
    requestGroup: "public",
    onChainGroup: "public",
    mintLimitId: 2
  };
}

function assertGroupAvailable(phase: string, group: PreparedGroup): void {
  if (phase === "sold-out") {
    throw new MobileApiError(409, "sold_out", "The collection is sold out.");
  }

  if (phase === "pre-allowlist") {
    throw new MobileApiError(409, "mint_not_open", "Minting is not open yet.");
  }

  if (phase === "allowlist" && group.requestGroup !== "allowlist") {
    throw new MobileApiError(409, "public_not_open", "Public mint is not open yet.");
  }
}

export async function prepareMintTransaction(runtime: BackendRuntime, request: MintPrepareRequest) {
  const appConfig = readAppConfig(runtime.cluster);
  const chainState = await fetchChainDropState(runtime);
  const phase = resolveDropPhase(appConfig, chainState.mintedCount, chainState.supply);
  const group = resolvePreparedGroup(request.group);
  assertGroupAvailable(phase, group);

  const wallet = normalizePublicKey(request.wallet, "wallet");
  const nftMint = normalizePublicKey(request.nftMint, "nftMint");

  const umi = createUmi(runtime.rpcUrl).use(mplTokenMetadata()).use(mplCandyMachine());
  umi.use(signerIdentity(createNoopSigner(publicKey(wallet)), true));
  const nftMintSigner = createNoopSigner(publicKey(nftMint));
  const builder = transactionBuilder();
  const allowlist = readAllowlistArtifact(runtime.cluster);

  if (group.requestGroup === "allowlist") {
    const merkleRoot = bs58.decode(allowlist.merkleRootBase58);
    const encodedProof = allowlist.proofs[wallet];
    if (!encodedProof) {
      throw new MobileApiError(403, "missing_allowlist_proof", "Wallet is not present in the allowlist.");
    }

    builder.add(
      route(umi, {
        candyMachine: publicKey(appConfig.candyMachine),
        candyGuard: publicKey(appConfig.candyGuard),
        group: group.onChainGroup,
        guard: "allowList",
        routeArgs: {
          path: "proof",
          merkleRoot,
          merkleProof: encodedProof.map((proof) => bs58.decode(proof)),
          minter: publicKey(wallet)
        }
      })
    );
  }

  builder.add(
    mintV2(umi, {
      candyMachine: publicKey(appConfig.candyMachine),
      candyGuard: publicKey(appConfig.candyGuard),
      nftMint: nftMintSigner,
      collectionMint: publicKey(appConfig.collectionMint),
      collectionUpdateAuthority: publicKey(appConfig.collectionUpdateAuthority),
      group: group.onChainGroup,
      mintArgs: {
        ...(group.requestGroup === "allowlist"
          ? { allowList: { merkleRoot: bs58.decode(allowlist.merkleRootBase58) } }
          : {}),
        tokenPayment: {
          mint: publicKey(appConfig.skrMint),
          destinationAta: publicKey(appConfig.proceedsSkrAta)
        },
        mintLimit: {
          id: group.mintLimitId
        }
      }
    })
  );

  const connection = new Connection(runtime.rpcUrl, "confirmed");
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction();
  transaction.feePayer = new PublicKey(wallet);
  transaction.recentBlockhash = latestBlockhash.blockhash;

  for (const instruction of builder.getInstructions()) {
    transaction.add(toWeb3JsInstruction(instruction));
  }

  const expectedPrice =
    group.requestGroup === "allowlist"
      ? chainState.allowlistPriceSkrBaseUnits
      : chainState.publicPriceSkrBaseUnits;

  return {
    wallet,
    mintAddress: nftMint,
    group: group.requestGroup,
    phase,
    expectedPriceSkrBaseUnits: expectedPrice,
    unsignedTransactionBase64: transaction
      .serialize({
        requireAllSignatures: false,
        verifySignatures: false
      })
      .toString("base64"),
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    mintedCount: chainState.mintedCount,
    remainingCount: chainState.remainingCount
  };
}
