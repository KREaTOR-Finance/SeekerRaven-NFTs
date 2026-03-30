import { runBuyerSync } from "../jobs/buyer-sync.js";

async function main(): Promise<void> {
  const result = await runBuyerSync();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

