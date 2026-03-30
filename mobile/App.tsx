import { StatusBar } from "expo-status-bar";
import { Buffer } from "buffer";
import { useState } from "react";
import {
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
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import {
  createNoopSigner,
  createSignerFromKeypair,
  publicKey,
  signerIdentity
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

type RavenSample = {
  id: string;
  name: string;
  accent: string;
  source: number;
};

const APP_IDENTITY = {
  name: "SeekerRaven Mint",
  uri: "https://yourdomain.com"
} as const;

const CLUSTER_RPC: Record<Cluster, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com"
};

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

export default function App() {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintSignature, setMintSignature] = useState("");
  const [mintAddress, setMintAddress] = useState("");
  const [error, setError] = useState("");

  const cluster = (dropConfig.cluster as Cluster) || "devnet";
  const rpcUrl = resolveRpcUrl(cluster, dropConfig.rpcPrimary, dropConfig.rpcFallback);

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
      setError(e instanceof Error ? e.message : "Wallet connect failed.");
    } finally {
      setIsConnecting(false);
    }
  };

  const mintSeekerRaven = async () => {
    if (!wallet) {
      setError("Connect your wallet first.");
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
        transaction.partialSign(nftMint);

        const signatures = await walletAdapter.signAndSendTransactions({
          transactions: [transaction],
          commitment: "confirmed",
          skipPreflight: false
        });

        if (!signatures[0]) {
          throw new Error("Wallet did not return a mint signature.");
        }

        return {
          session: {
            address: walletAddress,
            authToken: auth.auth_token
          },
          signature: signatures[0],
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
      setError(e instanceof Error ? e.message : "Mint failed.");
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

        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={styles.logoFrame}>
              <Image source={require("./assets/logo.png")} style={styles.logo} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.kicker}>SEEKERRAVEN GENESIS</Text>
              <Text style={styles.title}>THIS IS YOUR RAVEN</Text>
              <Text style={styles.subtitle}>Mint it. Register wallet. Earn while holding.</Text>
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
          <Text style={styles.benefitTitle}>2. Register Wallet, Earn Rewards</Text>
          <Text style={styles.benefitText}>
            Connect your wallet and stay eligible for holder rewards just by holding your raven.
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

        <Pressable style={styles.button} onPress={connectWallet} disabled={isConnecting || isMinting}>
          <Text style={styles.buttonText}>
            {isConnecting ? "Connecting..." : wallet ? "Wallet Registered" : "Register Wallet For Rewards"}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.mintButton, (!wallet || isMinting || isConnecting) && styles.buttonDisabled]}
          onPress={mintSeekerRaven}
          disabled={!wallet || isMinting || isConnecting}
        >
          <Text style={styles.mintButtonText}>{isMinting ? "Minting..." : "Mint SeekerRaven"}</Text>
        </Pressable>

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>{wallet ? "Wallet Ready" : "Connect Wallet To Mint"}</Text>
          <Text style={styles.statusText}>
            {wallet
              ? `Wallet: ${shortenAddress(wallet.address)}`
              : "Use Mobile Wallet Adapter to connect your Solana wallet."}
          </Text>
          <Text style={styles.statusSubtext}>Payments route in SKR through Candy Guard token payment.</Text>
          {mintAddress ? <Text style={styles.successLine}>Minted NFT: {shortenAddress(mintAddress)}</Text> : null}
          {mintSignature ? (
            <Text style={styles.successLine}>Tx Signature: {shortenAddress(mintSignature)}</Text>
          ) : null}
        </View>

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
