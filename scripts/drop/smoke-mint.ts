import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  keypairIdentity,
  publicKey
} from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { mintV2, mplCandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { parseArgs, getArgString } from "../common/args.js";
import { getEnv } from "../common/env.js";
import { readJson } from "../common/io.js";
import { rootPath } from "../common/paths.js";

type DeployArtifact = {
  candyMachine: string;
  candyGuard: string;
  collectionMint: string;
};

function mainError(message: string): never {
  throw new Error(message);
}

function resolveProceedsAta(env: ReturnType<typeof getEnv>): string | undefined {
  return env.PROCEEDS_SKR_ATA ?? env.GUARDIAN_SKR_ATA ?? env.TREASURY_SKR_ATA;
}

function isKnownMintV2VariantError(error: unknown): boolean {
  const candidate = error as {
    message?: string;
    logs?: string[];
    transactionLogs?: string[];
  };
  const message = candidate?.message ?? String(error);
  const logs = [...(candidate?.logs ?? []), ...(candidate?.transactionLogs ?? [])].join("\n");
  const details = `${message}\n${logs}`;
  return details.includes("Instruction: MintV2") && details.includes('Unexpected variant index: 1');
}

async function main(): Promise<void> {
  const env = getEnv();
  const args = parseArgs(process.argv.slice(2));
  const cluster = getArgString(args, "cluster", env.SOLANA_CLUSTER) as "devnet" | "mainnet-beta";
  const strategy = getArgString(args, "strategy", "mintV2") as "mintV2";

  if (!env.DEPLOYER_SECRET_KEY_BASE58) {
    mainError("DEPLOYER_SECRET_KEY_BASE58 is required.");
  }
  if (!env.SKR_MINT || !resolveProceedsAta(env) || !env.CREATOR_WALLET) {
    mainError(
      "SKR_MINT, PROCEEDS_SKR_ATA (or GUARDIAN_SKR_ATA / TREASURY_SKR_ATA), and CREATOR_WALLET are required."
    );
  }
  const skrMint = env.SKR_MINT;
  const proceedsSkrAta = resolveProceedsAta(env)!;
  const creatorWallet = env.CREATOR_WALLET;

  const deploy = readJson<DeployArtifact>(rootPath("artifacts", `deploy.${cluster}.json`));
  const rpcUrl =
    env.SOLANA_RPC_URL ??
    (cluster === "mainnet-beta"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com");

  const keypair = Keypair.fromSecretKey(bs58.decode(env.DEPLOYER_SECRET_KEY_BASE58));
  const umi = createUmi(rpcUrl).use(mplTokenMetadata()).use(mplCandyMachine());
  umi.use(keypairIdentity(fromWeb3JsKeypair(keypair), true));

  const nftMint = generateSigner(umi);
  const tx = mintV2(umi, {
    candyMachine: publicKey(deploy.candyMachine),
    candyGuard: publicKey(deploy.candyGuard),
    nftMint,
    collectionMint: publicKey(deploy.collectionMint),
    collectionUpdateAuthority: publicKey(creatorWallet),
    group: "public",
    mintArgs: {
      tokenPayment: {
        mint: publicKey(skrMint),
        destinationAta: publicKey(proceedsSkrAta)
      },
      mintLimit: {
        id: 2
      }
    }
  });

  const { signature } = await tx.sendAndConfirm(umi);
  console.log(`Smoke mint succeeded via ${strategy}. Signature: ${bs58.encode(signature)}`);
  console.log(`Mint address: ${nftMint.publicKey}`);
}

main().catch((error) => {
  if (isKnownMintV2VariantError(error)) {
    console.error(
      [
        "MintV2 hit on-chain Borsh decode failure: Unexpected variant index: 1.",
        "This is a program-level compatibility issue on current devnet programs, not a wallet/env setup issue."
      ].join(" ")
    );
  }
  console.error(error);
  process.exit(1);
});
