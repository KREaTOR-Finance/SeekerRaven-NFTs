import { StatusBar } from "expo-status-bar";
import { Buffer } from "buffer";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { mplCandyMachine, mintV2 } from "@metaplex-foundation/mpl-candy-machine";
import {
  findMetadataPda,
  mplTokenMetadata,
  safeFetchAllMetadata
} from "@metaplex-foundation/mpl-token-metadata";
import {
  createNoopSigner,
  createSignerFromKeypair,
  publicKey,
  signerIdentity,
  unwrapOption
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsKeypair, toWeb3JsInstruction } from "@metaplex-foundation/umi-web3js-adapters";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import type { Cluster } from "@solana/web3.js";
import dropConfig from "./src/config/drop-config.json";

type WalletState = {
  address: string;
  authToken: string;
};

type ProfileViewState = {
  connected: boolean;
  address: string;
  ownedCount: number;
  ravens: OwnedRavenPreview[];
  isHolder: boolean | null;
  loading: boolean;
  error: string;
  notice: string;
  lastCheckedAt: string;
};

type OwnedRavenPreview = {
  mint: string;
  name: string;
  imageUri: string;
};

type RavenSample = {
  id: string;
  name: string;
  accent: string;
  source: number;
};

type ActiveScreen = "mint" | "profile";

const APP_IDENTITY = {
  name: "SeekerRaven Mint",
  uri: "https://yourdomain.com"
} as const;

const CLUSTER_RPC: Record<Cluster, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com"
};

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const ravenSamples: RavenSample[] = [
  {
    id: "i",
    name: "SeekerRaven I Prime",
    accent: "Neon Green Core",
    source: require("./assets/samples/seekerraven-i.png")
  },
  {
    id: "ii",
    name: "SeekerRaven II Sentinel",
    accent: "Glyph II Armor",
    source: require("./assets/samples/seekerraven-ii.png")
  },
  {
    id: "r-cyan",
    name: "SeekerRaven R Ghostline",
    accent: "Neon Cyan Core",
    source: require("./assets/samples/seekerraven-r-cyan.png")
  },
  {
    id: "r-ember",
    name: "SeekerRaven R Ember",
    accent: "Neon Ember Core",
    source: require("./assets/samples/seekerraven-r-ember.png")
  }
];

const initialProfileState: ProfileViewState = {
  connected: false,
  address: "",
  ownedCount: 0,
  ravens: [],
  isHolder: null,
  loading: false,
  error: "",
  notice: "",
  lastCheckedAt: ""
};

function shortenAddress(address: string): string {
  if (address.length < 12) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function normalizeWalletAddress(address: string): string {
  try {
    return new PublicKey(address).toBase58();
  } catch {
    const decoded = Buffer.from(address, "base64");
    if (decoded.length !== 32) {
      throw new Error("Wallet returned an unsupported address format.");
    }
    return new PublicKey(decoded).toBase58();
  }
}

function resolveRpcUrl(cluster: Cluster, rpcPrimary?: string, rpcFallback?: string): string {
  if (rpcPrimary && !rpcPrimary.includes("YOUR_KEY")) {
    return rpcPrimary;
  }
  if (rpcFallback) {
    return rpcFallback;
  }
  return CLUSTER_RPC[cluster];
}

function formatHolderStatus(profile: ProfileViewState): string {
  if (!profile.connected) {
    return "Connect wallet";
  }
  if (profile.loading) {
    return "Checking";
  }
  if (profile.isHolder === true) {
    return "Holder";
  }
  if (profile.isHolder === false) {
    return "Not a holder";
  }
  return "Unknown";
}

function cleanMetadataText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\0/g, "").trim() : "";
}

function normalizeAssetUri(uri: string): string {
  const cleaned = cleanMetadataText(uri);
  if (!cleaned) {
    return "";
  }
  if (cleaned.startsWith("ar://")) {
    return `https://arweave.net/${cleaned.slice(5)}`;
  }
  return cleaned;
}

async function fetchMetadataPreview(
  metadataUri: string
): Promise<{ name: string; imageUri: string } | null> {
  const normalizedUri = normalizeAssetUri(metadataUri);
  if (!normalizedUri) {
    return null;
  }

  try {
    const response = await fetch(normalizedUri);
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { name?: unknown; image?: unknown };
    const name = cleanMetadataText(payload.name);
    const imageUri = normalizeAssetUri(String(payload.image || ""));
    if (!imageUri) {
      return null;
    }

    return { name, imageUri };
  } catch {
    return null;
  }
}

function describeWalletError(error: unknown, action: "connect" | "mint"): string {
  const fallback = action === "connect" ? "Wallet connect failed." : "Mint failed.";
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = `${error.name}: ${error.message}`;
  const normalized = message.toLowerCase();

  if (
    normalized.includes("cancellationexception") ||
    normalized.includes("cancel") ||
    normalized.includes("declined")
  ) {
    return action === "connect"
      ? "Wallet request canceled. Open Mock MWA Wallet and approve to continue."
      : "Mint request canceled in wallet.";
  }

  if (normalized.includes("no accounts")) {
    return "Wallet authorized but returned no account. Add/import an account in wallet and retry.";
  }

  if (normalized.includes("solanamobilewalletadapter") && normalized.includes("could not be found")) {
    return "Wallet adapter module is missing in this build. Reinstall the app from R:\\mobile and retry.";
  }

  return error.message || fallback;
}

async function readSeekerRavensByOwner(
  rpcUrl: string,
  ownerAddress: string,
  collectionMintAddress: string
): Promise<{ ownedCount: number; ravens: OwnedRavenPreview[] }> {
  const connection = new Connection(rpcUrl, "confirmed");
  const owner = new PublicKey(ownerAddress);

  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID
  });

  const candidateMints = new Set<string>();

  tokenAccounts.value.forEach((tokenAccount) => {
    const info = (tokenAccount.account.data as { parsed?: { info?: any } }).parsed?.info;
    const tokenAmount = info?.tokenAmount;
    if (!info?.mint || !tokenAmount) {
      return;
    }

    if (tokenAmount.amount === "1" && tokenAmount.decimals === 0) {
      candidateMints.add(info.mint as string);
    }
  });

  if (candidateMints.size === 0) {
    return {
      ownedCount: 0,
      ravens: []
    };
  }

  const umi = createUmi(rpcUrl).use(mplTokenMetadata());
  const metadataPdas = Array.from(candidateMints).map(
    (mint) => findMetadataPda(umi, { mint: publicKey(mint) })[0]
  );
  const metadataAccounts = await safeFetchAllMetadata(umi, metadataPdas);

  const ravensInCollection = metadataAccounts
    .filter((metadata) => {
    if (!metadata) {
      return false;
    }

    let collection: { verified: boolean; key: unknown } | null = null;
    try {
      collection = unwrapOption(metadata.collection) as { verified: boolean; key: unknown } | null;
    } catch {
      return false;
    }

    if (!collection?.verified) {
      return false;
    }

    const collectionKey =
      typeof collection.key === "string"
        ? collection.key
        : (collection.key as { toString?: () => string })?.toString?.() || "";

      return collectionKey === collectionMintAddress;
    })
    .map((metadata) => {
      const mint = cleanMetadataText(metadata.mint.toString());
      const name = cleanMetadataText(metadata.name);
      const uri = cleanMetadataText(metadata.uri);

      return { mint, name, uri };
    });

  const previews = await Promise.all(
    ravensInCollection.slice(0, 4).map(async (raven) => {
      const preview = await fetchMetadataPreview(raven.uri);
      if (!preview) {
        return null;
      }

      return {
        mint: raven.mint,
        name: preview.name || raven.name || "SeekerRaven",
        imageUri: preview.imageUri
      };
    })
  );

  return {
    ownedCount: ravensInCollection.length,
    ravens: previews.filter((preview): preview is OwnedRavenPreview => Boolean(preview))
  };
}

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>("mint");
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [profileState, setProfileState] = useState<ProfileViewState>(initialProfileState);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintSignature, setMintSignature] = useState("");
  const [mintAddress, setMintAddress] = useState("");
  const [error, setError] = useState("");

  const cluster = (dropConfig.cluster as Cluster) || "devnet";
  const rpcUrl = resolveRpcUrl(cluster, dropConfig.rpcPrimary, dropConfig.rpcFallback);

  const checkHolderStatus = useCallback(
    async (address: string) => {
      setProfileState((prev) => ({
        ...prev,
        connected: true,
        address,
        loading: true,
        error: "",
        notice: "Checking holder status..."
      }));

      try {
        const ownership = await readSeekerRavensByOwner(rpcUrl, address, dropConfig.collectionMint);
        const ownedCount = ownership.ownedCount;
        setProfileState({
          connected: true,
          address,
          ownedCount,
          ravens: ownership.ravens,
          isHolder: ownedCount > 0,
          loading: false,
          error: "",
          notice:
            ownedCount > 0
              ? `Status refreshed. ${ownedCount} SeekerRaven${ownedCount > 1 ? "s" : ""} found.`
              : "Status refreshed. No SeekerRavens found in this wallet.",
          lastCheckedAt: new Date().toISOString()
        });
      } catch (error) {
        const detail =
          error instanceof Error && error.message
            ? error.message.slice(0, 140)
            : "Unknown RPC/read error";
        setProfileState({
          connected: true,
          address,
          ownedCount: 0,
          ravens: [],
          isHolder: null,
          loading: false,
          error: `Unable to read holder status right now. ${detail}`,
          notice: "",
          lastCheckedAt: new Date().toISOString()
        });
      }
    },
    [rpcUrl]
  );

  useEffect(() => {
    if (!wallet) {
      setProfileState(initialProfileState);
      return;
    }

    let isCancelled = false;
    const load = async () => {
      await checkHolderStatus(wallet.address);
      if (isCancelled) {
        return;
      }
    };

    load();

    return () => {
      isCancelled = true;
    };
  }, [wallet?.address, checkHolderStatus]);

  const connectWallet = async () => {
    setError("");
    setIsConnecting(true);

    try {
      const session = await transact(async (walletAdapter) => {
        const auth = await walletAdapter.authorize({
          cluster,
          identity: APP_IDENTITY
        });

        if (auth.accounts.length === 0) {
          throw new Error("Wallet authorization returned no accounts.");
        }

        return {
          address: normalizeWalletAddress(auth.accounts[0].address),
          authToken: auth.auth_token
        };
      });

      setWallet(session);
    } catch (e) {
      setError(describeWalletError(e, "connect"));
    } finally {
      setIsConnecting(false);
    }
  };

  const refreshHolderStatus = async () => {
    if (!wallet) {
      setError("Connect wallet first.");
      return;
    }
    setError("");
    await checkHolderStatus(wallet.address);
  };

  const mintSeekerRaven = async () => {
    if (!wallet) {
      setError("Connect wallet in Profile first.");
      return;
    }
    if (!dropConfig.collectionUpdateAuthority) {
      setError("collectionUpdateAuthority missing. Run app config sync and refresh.");
      return;
    }

    setError("");
    setMintSignature("");
    setMintAddress("");
    setIsMinting(true);

    try {
      const connection = new Connection(rpcUrl, "confirmed");

      const result = await transact(async (walletAdapter) => {
        let auth;
        try {
          auth = await walletAdapter.reauthorize({
            auth_token: wallet.authToken,
            identity: APP_IDENTITY
          });
        } catch {
          auth = await walletAdapter.authorize({
            cluster,
            identity: APP_IDENTITY
          });
        }

        if (auth.accounts.length === 0) {
          throw new Error("Wallet session does not include an account.");
        }

        const walletAddress = normalizeWalletAddress(auth.accounts[0].address);
        const walletPublicKey = new PublicKey(walletAddress);

        const umi = createUmi(rpcUrl).use(mplTokenMetadata()).use(mplCandyMachine());
        umi.use(signerIdentity(createNoopSigner(publicKey(walletAddress)), true));

        const nftMint = Keypair.generate();
        const nftMintSigner = createSignerFromKeypair(umi, fromWeb3JsKeypair(nftMint));

        const mintBuilder = mintV2(umi, {
          candyMachine: publicKey(dropConfig.candyMachine),
          candyGuard: publicKey(dropConfig.candyGuard),
          nftMint: nftMintSigner,
          collectionMint: publicKey(dropConfig.collectionMint),
          collectionUpdateAuthority: publicKey(dropConfig.collectionUpdateAuthority),
          group: "public",
          mintArgs: {
            tokenPayment: {
              mint: publicKey(dropConfig.skrMint),
              destinationAta: publicKey(dropConfig.proceedsSkrAta)
            },
            mintLimit: {
              id: 2
            }
          }
        });

        const instructions = mintBuilder.getInstructions().map(toWeb3JsInstruction);
        const blockhash = await connection.getLatestBlockhash("confirmed");

        const transaction = new Transaction();
        transaction.feePayer = walletPublicKey;
        transaction.recentBlockhash = blockhash.blockhash;
        instructions.forEach((instruction) => transaction.add(instruction));
        // Ask wallet to sign first, then add the local mint-key signature and submit ourselves.
        // Mock MWA can reject partially-signed payloads during signAndSend.
        const signedTransactions = await walletAdapter.signTransactions({
          transactions: [transaction]
        });
        const signedTransaction = signedTransactions[0];
        if (!signedTransaction) {
          throw new Error("Wallet did not return a signed transaction.");
        }
        if (!(signedTransaction instanceof Transaction)) {
          throw new Error("Wallet returned unsupported transaction format.");
        }

        const walletSignature = signedTransaction.signatures.find((pair) =>
          pair.publicKey.equals(walletPublicKey)
        )?.signature;
        if (!walletSignature) {
          throw new Error("Wallet did not provide a fee-payer signature.");
        }

        // Preserve wallet signature across compile calls, then add mint signer.
        const compiledMessage = signedTransaction.compileMessage();
        const requiredSignerKeys = compiledMessage.accountKeys.slice(
          0,
          compiledMessage.header.numRequiredSignatures
        );
        signedTransaction.signatures = requiredSignerKeys.map((publicKey) => ({
          publicKey,
          signature: publicKey.equals(walletPublicKey) ? Buffer.from(walletSignature) : null
        }));
        signedTransaction.partialSign(nftMint);

        const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed"
        });

        return {
          session: {
            address: walletAddress,
            authToken: auth.auth_token
          },
          signature,
          mintAddress: nftMint.publicKey.toBase58(),
          blockhash: blockhash.blockhash,
          lastValidBlockHeight: blockhash.lastValidBlockHeight
        };
      });

      const confirmation = await connection.confirmTransaction(
        {
          signature: result.signature,
          blockhash: result.blockhash,
          lastValidBlockHeight: result.lastValidBlockHeight
        },
        "confirmed"
      );

      if (confirmation.value.err) {
        throw new Error("Mint transaction failed on-chain.");
      }

      setWallet(result.session);
      setMintSignature(result.signature);
      setMintAddress(result.mintAddress);
    } catch (e) {
      setError(describeWalletError(e, "mint"));
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View pointerEvents="none" style={styles.glowTop} />
        <View pointerEvents="none" style={styles.glowBottom} />
        <View pointerEvents="none" style={styles.glowLeft} />
        <View pointerEvents="none" style={styles.glowRight} />

        {activeScreen === "mint" ? (
          <>
            <View style={styles.topNav}>
              <Text style={styles.topNavBrand}>SeekerRavens Mint</Text>
              <Pressable style={styles.topNavButton} onPress={() => setActiveScreen("profile")}>
                <Text style={styles.topNavButtonText}>Profile</Text>
              </Pressable>
            </View>

            <View style={styles.heroCard}>
              <View style={styles.heroRow}>
                <View style={styles.logoFrame}>
                  <Image source={require("./assets/logo.png")} style={styles.logo} />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={styles.kicker}>SEEKERRAVEN GENESIS</Text>
                  <Text style={styles.title}>THIS IS YOUR RAVEN</Text>
                  <Text style={styles.subtitle}>Mint it. Connect wallet. Hold it.</Text>
                </View>
              </View>
              <View style={styles.heroChipRow}>
                <View style={styles.priceChip}>
                  <Text style={styles.priceChipText}>MINT: 1 SOL-EQUIVALENT SKR</Text>
                </View>
                <View style={styles.rewardsChip}>
                  <Text style={styles.rewardsChipText}>PAY RAIL: SKR</Text>
                </View>
              </View>
            </View>

            <View style={styles.benefitCard}>
              <Text style={styles.benefitTitle}>1. This Is Your SeekerRaven</Text>
              <Text style={styles.benefitText}>
                Minting creates your on-chain SeekerRaven from the Genesis collection.
              </Text>
            </View>

            <View style={styles.benefitCardAlt}>
              <Text style={styles.benefitTitle}>2. Connect Wallet In Profile</Text>
              <Text style={styles.benefitText}>
                Profile tracks if you are connected and if you hold a SeekerRaven.
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>SeekerRaven Samples</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sampleRow}>
                {ravenSamples.map((sample) => (
                  <View key={sample.id} style={styles.sampleCard}>
                    <Image source={sample.source} style={styles.sampleImage} />
                    <View style={styles.sampleInfo}>
                      <Text style={styles.sampleName}>{sample.name}</Text>
                      <Text style={styles.sampleAccent}>{sample.accent}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>

            <Pressable
              style={[styles.mintButton, (!wallet || isMinting || isConnecting) && styles.buttonDisabled]}
              onPress={mintSeekerRaven}
              disabled={!wallet || isMinting || isConnecting}
            >
              <Text style={styles.mintButtonText}>{isMinting ? "Minting..." : "Mint SeekerRaven"}</Text>
            </Pressable>

            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>{wallet ? "Wallet Connected" : "Wallet Not Connected"}</Text>
              <Text style={styles.statusText}>
                {wallet
                  ? `Wallet: ${shortenAddress(wallet.address)}`
                  : "Open Profile and connect your wallet to mint."}
              </Text>
              {mintAddress ? <Text style={styles.successLine}>Minted NFT: {shortenAddress(mintAddress)}</Text> : null}
              {mintSignature ? (
                <Text style={styles.successLine}>Tx Signature: {shortenAddress(mintSignature)}</Text>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <View style={styles.topNav}>
              <Pressable style={styles.topNavButton} onPress={() => setActiveScreen("mint")}>
                <Text style={styles.topNavButtonText}>Back</Text>
              </Pressable>
              <Text style={styles.topNavBrand}>Profile</Text>
              <View style={styles.topNavSpacer} />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Dashboard</Text>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Connected</Text>
                <Text style={styles.profileValue}>{profileState.connected ? "Yes" : "No"}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Wallet</Text>
                <Text style={styles.profileValue}>
                  {profileState.connected ? shortenAddress(profileState.address) : "Not connected"}
                </Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Owned SeekerRavens</Text>
                <Text style={styles.profileValue}>{profileState.connected ? String(profileState.ownedCount) : "0"}</Text>
              </View>

              {profileState.connected && profileState.ownedCount > 0 ? (
                <View style={styles.ownedSection}>
                  <Text style={styles.ownedTitle}>Your SeekerRavens</Text>
                  {profileState.ravens.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.ownedRow}
                    >
                      {profileState.ravens.map((raven) => (
                        <View key={raven.mint} style={styles.ownedCard}>
                          <Image source={{ uri: raven.imageUri }} style={styles.ownedImage} />
                          <Text style={styles.ownedName} numberOfLines={1}>
                            {raven.name}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={styles.ownedFallback}>
                      <Text style={styles.statusSubtext}>
                        Holder found. Metadata image preview not available for this wallet yet.
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}

              <Pressable
                style={[styles.button, (isConnecting || profileState.connected) && styles.buttonDisabled]}
                onPress={connectWallet}
                disabled={isConnecting || profileState.connected}
              >
                <Text style={styles.buttonText}>
                  {isConnecting ? "Connecting..." : profileState.connected ? "Wallet Connected" : "Connect Wallet"}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.refreshButton, (!profileState.connected || profileState.loading) && styles.buttonDisabled]}
                onPress={() => {
                  void refreshHolderStatus();
                }}
                disabled={!profileState.connected || profileState.loading}
              >
                <View style={styles.refreshButtonInner}>
                  {profileState.loading ? <ActivityIndicator color="#9affbe" size="small" /> : null}
                  <Text style={styles.refreshButtonText}>
                    {profileState.loading ? "Checking..." : "Refresh Holder Status"}
                  </Text>
                </View>
              </Pressable>

              {profileState.lastCheckedAt ? (
                <Text style={styles.statusSubtext}>
                  Last check: {new Date(profileState.lastCheckedAt).toLocaleTimeString()}
                </Text>
              ) : null}
              {profileState.notice ? <Text style={styles.statusSubtext}>{profileState.notice}</Text> : null}
            </View>

            <View style={styles.benefitCardAlt}>
              <Text style={styles.sectionTitle}>Rewards</Text>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Connected</Text>
                <Text style={styles.profileValue}>{profileState.connected ? "Yes" : "No"}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Holder status</Text>
                <Text style={styles.profileValue}>{formatHolderStatus(profileState)}</Text>
              </View>
              <Text style={styles.statusSubtext}>Rewards details coming in V2.</Text>
            </View>

            {profileState.error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{profileState.error}</Text>
              </View>
            ) : null}
          </>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#000000"
  },
  container: {
    overflow: "hidden",
    gap: 16,
    padding: 20,
    paddingBottom: 36
  },
  glowTop: {
    position: "absolute",
    top: -160,
    right: -100,
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: "#4dff7d2e"
  },
  glowBottom: {
    position: "absolute",
    bottom: -180,
    left: -110,
    width: 380,
    height: 380,
    borderRadius: 999,
    backgroundColor: "#ff33d933"
  },
  glowLeft: {
    position: "absolute",
    top: 300,
    left: -90,
    width: 250,
    height: 250,
    borderRadius: 999,
    backgroundColor: "#4dff7d24"
  },
  glowRight: {
    position: "absolute",
    top: 230,
    right: -70,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "#ff33d925"
  },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  topNavBrand: {
    color: "#e9ffe6",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.8
  },
  topNavButton: {
    borderColor: "#4dff7d",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#0b1a11"
  },
  topNavButtonText: {
    color: "#9affbe",
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.6
  },
  topNavSpacer: {
    width: 64
  },
  heroCard: {
    borderWidth: 2,
    borderColor: "#4dff7de0",
    borderRadius: 16,
    backgroundColor: "#08080a",
    padding: 16,
    shadowColor: "#4dff7d",
    shadowOpacity: 0.58,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 0
    }
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10
  },
  logoFrame: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2,
    borderColor: "#ff33d9",
    overflow: "hidden",
    shadowColor: "#ff33d9",
    shadowOpacity: 0.72,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 0
    }
  },
  logo: {
    width: "100%",
    height: "100%"
  },
  heroCopy: {
    flex: 1
  },
  kicker: {
    color: "#ff9ff1",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 5
  },
  title: {
    color: "#e9ffe6",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 1.1,
    textShadowColor: "#4dff7ddf",
    textShadowRadius: 20
  },
  subtitle: {
    color: "#66ff94",
    fontSize: 12,
    marginTop: 4
  },
  heroChipRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  priceChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#ff33d9",
    backgroundColor: "#2a0630",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  priceChipText: {
    color: "#ff9ef2",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.9
  },
  rewardsChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#4dff7d",
    backgroundColor: "#091f12",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  rewardsChipText: {
    color: "#9affbe",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.9
  },
  benefitCard: {
    borderColor: "#4dff7d9e",
    borderRadius: 14,
    borderWidth: 2,
    padding: 14,
    backgroundColor: "#09090c",
    shadowColor: "#4dff7d",
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 0
    }
  },
  benefitCardAlt: {
    borderColor: "#ff33d9d1",
    borderRadius: 14,
    borderWidth: 2,
    padding: 14,
    backgroundColor: "#120712",
    shadowColor: "#ff3cf1",
    shadowOpacity: 0.36,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 0
    }
  },
  benefitTitle: {
    color: "#e5ffeb",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 7,
    letterSpacing: 0.7
  },
  benefitText: {
    color: "#dcffe2",
    fontSize: 14,
    lineHeight: 20
  },
  sectionCard: {
    borderColor: "#ff33d9d1",
    borderRadius: 14,
    borderWidth: 2,
    paddingVertical: 14,
    paddingHorizontal: 0,
    backgroundColor: "#100510",
    shadowColor: "#ff3cf1",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 0
    }
  },
  sectionTitle: {
    color: "#ffe3fb",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.7,
    paddingHorizontal: 14,
    marginBottom: 10
  },
  sampleRow: {
    paddingHorizontal: 14,
    gap: 12
  },
  sampleCard: {
    width: 194,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#4dff7d9e",
    backgroundColor: "#09090c",
    overflow: "hidden"
  },
  sampleImage: {
    width: "100%",
    height: 194
  },
  sampleInfo: {
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  sampleName: {
    color: "#effff2",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4
  },
  sampleAccent: {
    color: "#ff9cf1",
    fontSize: 11,
    fontWeight: "700"
  },
  button: {
    borderColor: "#4dff7d",
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: "#ff33d9",
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 14,
    marginTop: 6,
    shadowColor: "#ff33d9",
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 0
    }
  },
  buttonText: {
    color: "#0a050b",
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 1
  },
  refreshButton: {
    borderColor: "#4dff7d",
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: "#0a2312",
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginHorizontal: 14,
    marginTop: 10
  },
  refreshButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  refreshButtonText: {
    color: "#9affbe",
    textAlign: "center",
    fontWeight: "700",
    letterSpacing: 0.6
  },
  ownedSection: {
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 2
  },
  ownedTitle: {
    color: "#dcffe2",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8
  },
  ownedRow: {
    gap: 10
  },
  ownedCard: {
    width: 120,
    borderWidth: 2,
    borderColor: "#4dff7d8a",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#09090c"
  },
  ownedImage: {
    width: "100%",
    height: 112,
    backgroundColor: "#101010"
  },
  ownedName: {
    color: "#effff2",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  ownedFallback: {
    borderColor: "#4dff7d55",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  mintButton: {
    borderColor: "#ff33d9",
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: "#4dff7d",
    paddingVertical: 13,
    paddingHorizontal: 16,
    shadowColor: "#4dff7d",
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 0
    }
  },
  mintButtonText: {
    color: "#09120b",
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 1
  },
  buttonDisabled: {
    opacity: 0.45
  },
  statusCard: {
    borderColor: "#4dff7d9e",
    borderRadius: 14,
    borderWidth: 2,
    padding: 14,
    backgroundColor: "#070c09",
    shadowColor: "#4dff7d",
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 0
    }
  },
  statusTitle: {
    color: "#effff2",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6
  },
  statusText: {
    color: "#deffe4",
    fontSize: 13
  },
  statusSubtext: {
    color: "#ffbff7",
    fontSize: 12,
    marginTop: 7
  },
  successLine: {
    color: "#8fffb5",
    fontSize: 12,
    marginTop: 7
  },
  profileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 8
  },
  profileLabel: {
    color: "#dcffe2",
    fontSize: 13,
    fontWeight: "600"
  },
  profileValue: {
    color: "#effff2",
    fontSize: 13,
    fontWeight: "700"
  },
  errorBox: {
    backgroundColor: "#22060f",
    borderColor: "#ff4f9d",
    borderRadius: 10,
    borderWidth: 2,
    padding: 12,
    shadowColor: "#ff5f7d",
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 0
    }
  },
  errorText: {
    color: "#ff9faf",
    fontSize: 13
  }
});
