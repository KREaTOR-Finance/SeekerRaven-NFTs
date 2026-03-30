export const SOL_MINT = "So11111111111111111111111111111111111111112";

type JupiterQuoteResponse = {
  outAmount?: string;
  [key: string]: unknown;
};

export type SolToSkrQuote = {
  outputSkrBaseUnits: bigint;
  raw: JupiterQuoteResponse;
};

export async function fetchSolToSkrQuote(params: {
  quoteUrl: string;
  skrMint: string;
  inputLamports: bigint;
}): Promise<SolToSkrQuote> {
  const url = new URL(params.quoteUrl);
  url.searchParams.set("inputMint", SOL_MINT);
  url.searchParams.set("outputMint", params.skrMint);
  url.searchParams.set("amount", params.inputLamports.toString());
  url.searchParams.set("slippageBps", "50");
  url.searchParams.set("swapMode", "ExactIn");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jupiter quote failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as JupiterQuoteResponse;
  if (!data.outAmount) {
    throw new Error("Jupiter quote response missing outAmount.");
  }

  let outAmount: bigint;
  try {
    outAmount = BigInt(data.outAmount);
  } catch {
    throw new Error(`Invalid Jupiter outAmount: ${data.outAmount}`);
  }

  if (outAmount <= 0n) {
    throw new Error("Jupiter outAmount must be greater than zero.");
  }

  return {
    outputSkrBaseUnits: outAmount,
    raw: data
  };
}

