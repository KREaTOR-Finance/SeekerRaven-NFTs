import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import {
  fetchCandyGuard,
  mplCandyMachine,
  updateCandyGuard
} from "@metaplex-foundation/mpl-candy-machine";
import { keypairIdentity, publicKey } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { BackendRuntime } from "./runtime.js";

type OptionSome<T> = {
  __option: "Some";
  value: T;
};

type TokenPaymentValue = {
  amount: bigint;
  mint: string;
  destinationAta: string;
};

type GuardGroupLike = {
  label: string;
  guards: {
    tokenPayment: OptionSome<TokenPaymentValue> | { __option: "None" };
    [key: string]: unknown;
  };
};

export type GroupTokenPrices = {
  allowlistAmount: bigint;
  publicAmount: bigint;
};

function createAuthorityUmi(runtime: BackendRuntime) {
  const keypair = Keypair.fromSecretKey(bs58.decode(runtime.deployerSecretKeyBase58));
  const umi = createUmi(runtime.rpcUrl).use(mplTokenMetadata()).use(mplCandyMachine());
  umi.use(keypairIdentity(fromWeb3JsKeypair(keypair), true));
  return umi;
}

function readTokenPaymentAmount(group: GuardGroupLike, label: string): bigint {
  if (group.guards.tokenPayment.__option !== "Some") {
    throw new Error(`${label} group is missing tokenPayment guard.`);
  }
  return group.guards.tokenPayment.value.amount;
}

function updateTokenPayment(group: GuardGroupLike, runtime: BackendRuntime, amount: bigint): GuardGroupLike {
  if (group.guards.tokenPayment.__option !== "Some") {
    throw new Error(`Cannot update tokenPayment for group "${group.label}" because it is disabled.`);
  }

  return {
    ...group,
    guards: {
      ...group.guards,
      tokenPayment: {
        __option: "Some",
        value: {
          amount,
          mint: runtime.skrMint,
          destinationAta: runtime.proceedsSkrAta
        }
      }
    }
  };
}

export async function fetchGroupTokenPrices(runtime: BackendRuntime): Promise<GroupTokenPrices> {
  const umi = createAuthorityUmi(runtime);
  const candyGuard = (await fetchCandyGuard(umi, publicKey(runtime.candyGuardId))) as any;

  const allowlist = candyGuard.groups.find((group: GuardGroupLike) => group.label === "alwlst");
  const publicGroup = candyGuard.groups.find((group: GuardGroupLike) => group.label === "public");

  if (!allowlist || !publicGroup) {
    throw new Error("Candy Guard must include both alwlst and public groups.");
  }

  return {
    allowlistAmount: readTokenPaymentAmount(allowlist, "alwlst"),
    publicAmount: readTokenPaymentAmount(publicGroup, "public")
  };
}

export async function updateGroupTokenPrices(
  runtime: BackendRuntime,
  nextAmount: bigint
): Promise<{ signature: string; previousAllowlistAmount: bigint; previousPublicAmount: bigint }> {
  const umi = createAuthorityUmi(runtime);
  const candyGuard = (await fetchCandyGuard(umi, publicKey(runtime.candyGuardId))) as any;

  const updatedGroups = candyGuard.groups.map((group: GuardGroupLike) => {
    if (group.label === "alwlst" || group.label === "public") {
      return updateTokenPayment(group, runtime, nextAmount);
    }
    return group;
  });

  const allowlist = candyGuard.groups.find((group: GuardGroupLike) => group.label === "alwlst");
  const publicGroup = candyGuard.groups.find((group: GuardGroupLike) => group.label === "public");

  if (!allowlist || !publicGroup) {
    throw new Error("Candy Guard must include both alwlst and public groups.");
  }

  const previousAllowlistAmount = readTokenPaymentAmount(allowlist, "alwlst");
  const previousPublicAmount = readTokenPaymentAmount(publicGroup, "public");

  const tx = await updateCandyGuard(umi, {
    candyGuard: publicKey(runtime.candyGuardId),
    guards: candyGuard.guards,
    groups: updatedGroups
  }).sendAndConfirm(umi);

  return {
    signature: bs58.encode(tx.signature),
    previousAllowlistAmount,
    previousPublicAmount
  };
}

