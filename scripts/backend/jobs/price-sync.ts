import {
  createSqlClient,
  ensureBackendSchema,
  insertGuardUpdate,
  insertPriceSnapshot,
  setJobState
} from "../db.js";
import { fetchGroupTokenPrices, updateGroupTokenPrices } from "../candy-guard.js";
import { fetchSolToSkrQuote } from "../jupiter.js";
import { getBackendRuntime } from "../runtime.js";

export type PriceSyncResult = {
  cluster: "devnet" | "mainnet-beta";
  candyGuard: string;
  quoteOutAmount: string;
  nextAmount: string;
  currentPublicAmount: string;
  currentAllowlistAmount: string;
  changeBps: number;
  updated: boolean;
  txSignature?: string;
};

function applyBufferBps(amount: bigint, bps: number): bigint {
  const numerator = amount * BigInt(10_000 + bps);
  return (numerator + 9_999n) / 10_000n;
}

function calcChangeBps(current: bigint, next: bigint): number {
  if (current === 0n) {
    return 10_000;
  }
  const delta = current > next ? current - next : next - current;
  return Number((delta * 10_000n) / current);
}

export async function runPriceSync(): Promise<PriceSyncResult> {
  const runtime = getBackendRuntime();
  const sql = createSqlClient(runtime.neonDatabaseUrl);
  await ensureBackendSchema(sql);

  const quote = await fetchSolToSkrQuote({
    quoteUrl: runtime.jupiterQuoteUrl,
    skrMint: runtime.skrMint,
    inputLamports: runtime.priceSyncSolInputLamports
  });
  const nextAmount = applyBufferBps(quote.outputSkrBaseUnits, runtime.priceBufferBps);

  const current = await fetchGroupTokenPrices(runtime);
  const changeBps = calcChangeBps(current.publicAmount, nextAmount);

  await insertPriceSnapshot(sql, {
    cluster: runtime.cluster,
    inputLamports: runtime.priceSyncSolInputLamports.toString(),
    outputSkrBaseUnits: quote.outputSkrBaseUnits.toString(),
    effectiveSkrPrice: nextAmount.toString(),
    quoteResponse: quote.raw
  });

  const baseResult: PriceSyncResult = {
    cluster: runtime.cluster,
    candyGuard: runtime.candyGuardId,
    quoteOutAmount: quote.outputSkrBaseUnits.toString(),
    nextAmount: nextAmount.toString(),
    currentPublicAmount: current.publicAmount.toString(),
    currentAllowlistAmount: current.allowlistAmount.toString(),
    changeBps,
    updated: false
  };

  if (changeBps < runtime.priceUpdateMinChangeBps) {
    await setJobState(sql, `price_sync:${runtime.cluster}:${runtime.candyGuardId}`, {
      ...baseResult,
      reason: "change_below_threshold",
      checkedAt: new Date().toISOString()
    });
    return baseResult;
  }

  const update = await updateGroupTokenPrices(runtime, nextAmount);
  await insertGuardUpdate(sql, {
    cluster: runtime.cluster,
    candyGuard: runtime.candyGuardId,
    previousAmount: update.previousPublicAmount.toString(),
    newAmount: nextAmount.toString(),
    txSignature: update.signature,
    reason: "jupiter_quote_sync"
  });

  const result: PriceSyncResult = {
    ...baseResult,
    updated: true,
    txSignature: update.signature
  };

  await setJobState(sql, `price_sync:${runtime.cluster}:${runtime.candyGuardId}`, {
    ...result,
    checkedAt: new Date().toISOString()
  });

  return result;
}

