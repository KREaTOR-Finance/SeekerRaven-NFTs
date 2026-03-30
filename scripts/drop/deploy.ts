import fs from "node:fs";
import bs58 from "bs58";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createUmi
} from "@metaplex-foundation/umi-bundle-defaults";
import {
  addConfigLines,
  create,
  findCandyGuardPda,
  mplCandyMachine
} from "@metaplex-foundation/mpl-candy-machine";
import { createNft, mplTokenMetadata, TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import {
  dateTime,
  generateSigner,
  keypairIdentity,
  lamports,
  none,
  percentAmount,
  publicKey
} from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { parseArgs, getArgString } from "../common/args.js";
import { getEnv } from "../common/env.js";
import { readJson, writeJson } from "../common/io.js";
import { rootPath } from "../common/paths.js";

type UploadManifestItem = {
  id: number;
  name: string;
  imageUri: string;
  metadataUri: string;
};

type DropConfig = {
  cluster: "devnet" | "mainnet-beta";
  supply: number;
  symbol: string;
  collectionName: string;
  collectionFamily: string;
  sellerFeeBasisPoints: number;
  allowlistPerWallet: number;
  publicPerWallet: number;
  botTaxLamports: number;
  itemsAvailable: number;
};

type AllowlistArtifact = {
  merkleRootBase58: string;
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function decodeKeypair(base58Secret: string): Keypair {
  const secret = bs58.decode(base58Secret);
  return Keypair.fromSecretKey(secret);
}

function assertPublicKey(name: string, key: string | undefined): string {
  if (!key) {
    throw new Error(`${name} is required.`);
  }
  try {
    return new PublicKey(key).toBase58();
  } catch {
    throw new Error(`${name} is not a valid public key: ${key}`);
  }
}

function resolveProceedsAta(env: ReturnType<typeof getEnv>): string | undefined {
  return env.PROCEEDS_SKR_ATA ?? env.GUARDIAN_SKR_ATA ?? env.TREASURY_SKR_ATA;
}

function resolveProceedsWallet(env: ReturnType<typeof getEnv>): string | undefined {
  return env.PROCEEDS_WALLET ?? env.GUARDIAN_WALLET;
}

async function main(): Promise<void> {
  const env = getEnv();
  const args = parseArgs(process.argv.slice(2));
  const cluster = getArgString(args, "cluster", env.SOLANA_CLUSTER) as "devnet" | "mainnet-beta";

  const config = readJson<DropConfig>(rootPath("config", `drop.${cluster}.json`));
  const uploadManifestPath = rootPath("artifacts", `upload-manifest.${cluster}.json`);
  const allowlistPath = rootPath("artifacts", `allowlist-proofs.${cluster}.json`);

  if (!fs.existsSync(uploadManifestPath)) {
    throw new Error(`Upload manifest missing: ${uploadManifestPath}`);
  }
  if (!fs.existsSync(allowlistPath)) {
    throw new Error(`Allowlist artifact missing: ${allowlistPath}`);
  }

  const uploadManifest = readJson<UploadManifestItem[]>(uploadManifestPath);
  const allowlist = readJson<AllowlistArtifact>(allowlistPath);
  if (uploadManifest.length !== 34) {
    throw new Error(`Upload manifest must contain 34 items, got ${uploadManifest.length}.`);
  }

  const onChainNames = uploadManifest.map((item) => item.name.slice(0, 32));

  const deployerSecret = env.DEPLOYER_SECRET_KEY_BASE58;
  if (!deployerSecret) {
    throw new Error("DEPLOYER_SECRET_KEY_BASE58 is required.");
  }

  const creatorWallet = assertPublicKey("CREATOR_WALLET", env.CREATOR_WALLET);
  const proceedsWallet = assertPublicKey(
    "PROCEEDS_WALLET or GUARDIAN_WALLET",
    resolveProceedsWallet(env)
  );
  const skrMint = assertPublicKey("SKR_MINT", env.SKR_MINT);
  const proceedsSkrAta = assertPublicKey(
    "PROCEEDS_SKR_ATA (or GUARDIAN_SKR_ATA / TREASURY_SKR_ATA)",
    resolveProceedsAta(env)
  );
  const collectionMintOverride = env.COLLECTION_MINT_OVERRIDE
    ? assertPublicKey("COLLECTION_MINT_OVERRIDE", env.COLLECTION_MINT_OVERRIDE)
    : null;

  if (!env.MINT_PRICE_SKR_BASE_UNITS) {
    throw new Error("MINT_PRICE_SKR_BASE_UNITS is required.");
  }
  if (!env.ALLOWLIST_START_ISO || !env.PUBLIC_START_ISO) {
    throw new Error("ALLOWLIST_START_ISO and PUBLIC_START_ISO are required.");
  }

  const rpcUrl =
    env.SOLANA_RPC_URL ??
    (cluster === "mainnet-beta"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com");

  const keypair = decodeKeypair(deployerSecret);
  const umi = createUmi(rpcUrl).use(mplTokenMetadata()).use(mplCandyMachine());
  umi.use(keypairIdentity(fromWeb3JsKeypair(keypair), true));

  const collectionUri = uploadManifest[0]?.metadataUri;
  if (!collectionUri) {
    throw new Error("Upload manifest is empty.");
  }

  const collectionMint = collectionMintOverride ? null : generateSigner(umi);
  const collectionMintPublicKey = collectionMintOverride
    ? publicKey(collectionMintOverride)
    : collectionMint!.publicKey;

  if (collectionMintOverride) {
    console.log(`Using existing collection mint: ${collectionMintOverride}`);
  } else {
    console.log("Creating collection NFT...");
    await createNft(umi, {
      mint: collectionMint!,
      authority: umi.identity,
      name: `${config.collectionName} Collection`,
      uri: collectionUri,
      sellerFeeBasisPoints: percentAmount(config.sellerFeeBasisPoints / 100),
      symbol: config.symbol,
      isCollection: true,
      creators: [
        {
          address: publicKey(creatorWallet),
          verified: false,
          share: 100
        }
      ]
    }).sendAndConfirm(umi);
  }

  const candyMachine = generateSigner(umi);
  const allowlistRoot = bs58.decode(allowlist.merkleRootBase58);
  const mintPrice = BigInt(env.MINT_PRICE_SKR_BASE_UNITS);

  console.log("Creating candy machine and candy guard...");
  const createBuilder = await create(umi, {
    candyMachine,
    collectionMint: collectionMintPublicKey,
    collectionUpdateAuthority: umi.identity,
    tokenStandard: TokenStandard.NonFungible,
    itemsAvailable: config.itemsAvailable,
    sellerFeeBasisPoints: percentAmount(config.sellerFeeBasisPoints / 100),
    symbol: config.symbol,
    maxEditionSupply: 0,
    isMutable: true,
    creators: [
      {
        address: publicKey(creatorWallet),
        verified: false,
        percentageShare: 100
      }
    ],
    configLineSettings: {
      prefixName: "",
      nameLength: Math.max(...onChainNames.map((name) => name.length)),
      prefixUri: "",
      uriLength: Math.max(...uploadManifest.map((i) => i.metadataUri.length)),
      isSequential: false
    },
    hiddenSettings: none(),
    guards: {},
    groups: [
      {
        label: "alwlst",
        guards: {
          startDate: { date: dateTime(env.ALLOWLIST_START_ISO) },
          allowList: { merkleRoot: allowlistRoot },
          tokenPayment: {
            amount: mintPrice,
            mint: publicKey(skrMint),
            destinationAta: publicKey(proceedsSkrAta)
          },
          mintLimit: {
            id: 1,
            limit: config.allowlistPerWallet
          }
        }
      },
      {
        label: "public",
        guards: {
          startDate: { date: dateTime(env.PUBLIC_START_ISO) },
          tokenPayment: {
            amount: mintPrice,
            mint: publicKey(skrMint),
            destinationAta: publicKey(proceedsSkrAta)
          },
          mintLimit: {
            id: 2,
            limit: config.publicPerWallet
          },
          botTax: {
            lamports: lamports(config.botTaxLamports),
            lastInstruction: true
          }
        }
      }
    ]
  });

  await createBuilder.sendAndConfirm(umi);

  console.log("Adding config lines...");
  const configLines = uploadManifest
    .sort((a, b) => a.id - b.id)
    .map((item) => ({ name: item.name.slice(0, 32), uri: item.metadataUri }));

  const chunks = chunk(configLines, 8);
  for (let i = 0; i < chunks.length; i += 1) {
    const tx = addConfigLines(umi, {
      candyMachine: candyMachine.publicKey,
      index: i * 8,
      configLines: chunks[i]
    });
    await tx.sendAndConfirm(umi);
  }

  const candyGuard = findCandyGuardPda(umi, { base: candyMachine.publicKey });

  const deployArtifact = {
    cluster,
    rpcUrl,
    candyMachine: candyMachine.publicKey.toString(),
    candyGuard: candyGuard[0].toString(),
    collectionMint: collectionMintPublicKey.toString(),
    collectionUpdateAuthority: umi.identity.publicKey.toString(),
    proceedsWallet,
    proceedsSkrAta,
    skrMint,
    mintPriceSkrBaseUnits: mintPrice.toString(),
    collectionUri,
    deployedAt: new Date().toISOString()
  };

  writeJson(rootPath("artifacts", `deploy.${cluster}.json`), deployArtifact);
  console.log(`Deployment complete for ${cluster}.`);
  console.log(JSON.stringify(deployArtifact, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
