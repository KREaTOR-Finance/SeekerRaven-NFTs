import fs from "node:fs";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { getMerkleProof, getMerkleRoot } from "@metaplex-foundation/mpl-candy-machine";
import { parseArgs, getArgString } from "../common/args.js";
import { parseCsvObjects } from "../common/csv.js";
import { getEnv } from "../common/env.js";
import { ensureDir, writeJson } from "../common/io.js";
import { rootPath } from "../common/paths.js";

type AllowlistRow = { wallet: string };

function loadAllowlist(csvPath: string): string[] {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Allowlist file not found: ${csvPath}`);
  }

  const csvRaw = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsvObjects(csvRaw) as AllowlistRow[];

  const wallets = rows.map((r) => r.wallet).filter(Boolean);
  const deduped = [...new Set(wallets)];

  for (const wallet of deduped) {
    try {
      new PublicKey(wallet);
    } catch {
      throw new Error(`Invalid Solana wallet in allowlist: ${wallet}`);
    }
  }

  return deduped;
}

function main(): void {
  const env = getEnv();
  const args = parseArgs(process.argv.slice(2));
  const cluster = getArgString(args, "cluster", env.SOLANA_CLUSTER);
  const inputPath = getArgString(args, "input", rootPath("data", "allowlist.csv"));

  if (!inputPath) {
    throw new Error("Allowlist input path is required.");
  }

  if (!cluster) {
    throw new Error("Cluster is required.");
  }

  const wallets = loadAllowlist(inputPath);
  const merkleRoot = getMerkleRoot(wallets);

  const proofs: Record<string, string[]> = {};
  for (const wallet of wallets) {
    const rawProof = getMerkleProof(wallets, wallet);
    proofs[wallet] = rawProof.map((node) => bs58.encode(node));
  }

  const artifactsDir = rootPath("artifacts");
  ensureDir(artifactsDir);

  writeJson(rootPath("artifacts", `allowlist-proofs.${cluster}.json`), {
    cluster,
    walletCount: wallets.length,
    merkleRootBase58: bs58.encode(merkleRoot),
    proofs
  });

  writeJson(rootPath("artifacts", `allowlist-wallets.${cluster}.json`), {
    cluster,
    wallets
  });

  console.log(`Built allowlist for ${wallets.length} wallets (cluster: ${cluster}).`);
}

main();
