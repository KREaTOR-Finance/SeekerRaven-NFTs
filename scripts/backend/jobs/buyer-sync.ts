import { Connection, ConfirmedSignatureInfo, ParsedTransactionWithMeta, PublicKey } from "@solana/web3.js";
import {
  createSqlClient,
  ensureBackendSchema,
  getJobState,
  setJobState,
  upsertBuyerMint
} from "../db.js";
import { getBackendRuntime } from "../runtime.js";

type BuyerSyncState = {
  lastSeenSignature?: string;
};

export type BuyerSyncResult = {
  cluster: "devnet" | "mainnet-beta";
  candyMachine: string;
  scannedSignatureCount: number;
  processedMintCount: number;
  updatedBuyerCount: number;
  lastSeenSignature?: string;
};

function asIsoTimestamp(blockTime: number | null): string | null {
  if (!blockTime) {
    return null;
  }
  return new Date(blockTime * 1000).toISOString();
}

function isMintV2Success(tx: ParsedTransactionWithMeta | null): boolean {
  if (!tx || tx.meta?.err) {
    return false;
  }
  const logs = tx.meta?.logMessages ?? [];
  return logs.some((line) => line.includes("Instruction: MintV2"));
}

function getBuyerFromTransaction(tx: ParsedTransactionWithMeta | null): string | null {
  if (!tx) {
    return null;
  }
  const signer = tx.transaction.message.accountKeys.find((account) => account.signer);
  return signer?.pubkey?.toString() ?? null;
}

async function collectNewSignatures(
  connection: Connection,
  candyMachine: PublicKey,
  lastSeenSignature: string | undefined
): Promise<ConfirmedSignatureInfo[]> {
  const collected: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  let stop = false;
  let pages = 0;

  while (!stop && pages < 20) {
    const page = await connection.getSignaturesForAddress(
      candyMachine,
      {
        before,
        limit: 1000
      },
      "confirmed"
    );

    if (page.length === 0) {
      break;
    }

    for (const info of page) {
      if (lastSeenSignature && info.signature === lastSeenSignature) {
        stop = true;
        break;
      }
      collected.push(info);
    }

    before = page[page.length - 1]?.signature;
    pages += 1;
  }

  return collected;
}

export async function runBuyerSync(): Promise<BuyerSyncResult> {
  const runtime = getBackendRuntime();
  const sql = createSqlClient(runtime.neonDatabaseUrl);
  await ensureBackendSchema(sql);

  const stateKey = `buyers_sync:${runtime.cluster}:${runtime.candyMachineId}`;
  const state = await getJobState<BuyerSyncState>(sql, stateKey);

  const connection = new Connection(runtime.rpcUrl, "confirmed");
  const candyMachine = new PublicKey(runtime.candyMachineId);
  const newSignatures = await collectNewSignatures(connection, candyMachine, state?.lastSeenSignature);
  const ordered = [...newSignatures].reverse();

  let processedMintCount = 0;
  let updatedBuyerCount = 0;

  for (const info of ordered) {
    const tx = await connection.getParsedTransaction(info.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed"
    });

    if (!isMintV2Success(tx)) {
      continue;
    }

    const buyer = getBuyerFromTransaction(tx);
    if (!buyer) {
      continue;
    }

    await upsertBuyerMint(sql, {
      buyer,
      signature: info.signature,
      slot: info.slot ?? null,
      mintedAt: asIsoTimestamp(info.blockTime ?? null)
    });

    processedMintCount += 1;
    updatedBuyerCount += 1;
  }

  const nextLastSeen = newSignatures[0]?.signature ?? state?.lastSeenSignature;

  await setJobState(sql, stateKey, {
    lastSeenSignature: nextLastSeen,
    scannedAt: new Date().toISOString(),
    scannedSignatureCount: newSignatures.length,
    processedMintCount,
    updatedBuyerCount
  });

  return {
    cluster: runtime.cluster,
    candyMachine: runtime.candyMachineId,
    scannedSignatureCount: newSignatures.length,
    processedMintCount,
    updatedBuyerCount,
    lastSeenSignature: nextLastSeen
  };
}

