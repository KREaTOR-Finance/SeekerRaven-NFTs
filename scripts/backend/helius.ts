export type HeliusAsset = {
  id: string;
  ownership?: {
    owner?: string;
    ownership_model?: string;
  };
  compression?: {
    compressed?: boolean;
  };
  content?: {
    json_uri?: string | null;
    metadata?: {
      name?: string | null;
    };
    files?: Array<{
      uri?: string | null;
    }>;
  };
};

type HeliusError = {
  code?: number;
  message?: string;
};

type HeliusRpcEnvelope<T> = {
  result?: T;
  error?: HeliusError;
};

type PaginatedHeliusResult = {
  total?: number;
  limit?: number;
  page?: number;
  items: HeliusAsset[];
};

async function callHeliusRpc<T>(
  url: string,
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${method}-${Date.now()}`,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`Helius ${method} failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as HeliusRpcEnvelope<T>;
  if (payload.error) {
    throw new Error(payload.error.message ?? `Helius ${method} returned an error.`);
  }
  if (!payload.result) {
    throw new Error(`Helius ${method} returned no result.`);
  }

  return payload.result;
}

async function paginateAssets(
  url: string,
  method: "getAssetsByGroup" | "searchAssets",
  baseParams: Record<string, unknown>
): Promise<HeliusAsset[]> {
  const items: HeliusAsset[] = [];
  let page = 1;
  const limit = 1000;

  while (true) {
    const result = await callHeliusRpc<PaginatedHeliusResult>(url, method, {
      ...baseParams,
      limit,
      page
    });

    items.push(...(result.items ?? []));

    if (!result.items?.length || result.items.length < limit) {
      break;
    }

    page += 1;
  }

  return items;
}

export async function getAssetsByCollection(url: string, collectionMint: string): Promise<HeliusAsset[]> {
  return paginateAssets(url, "getAssetsByGroup", {
    groupKey: "collection",
    groupValue: collectionMint
  });
}

export async function getAssetsByOwnerInCollection(
  url: string,
  ownerAddress: string,
  collectionMint: string
): Promise<HeliusAsset[]> {
  return paginateAssets(url, "searchAssets", {
    ownerAddress,
    grouping: ["collection", collectionMint]
  });
}

export function extractAssetImage(asset: HeliusAsset): string | null {
  const fileUri = asset.content?.files?.find((file) => typeof file.uri === "string" && file.uri)?.uri;
  return fileUri ?? asset.content?.json_uri ?? null;
}
