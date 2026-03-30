import { runPriceSync } from "../jobs/price-sync.js";

async function main(): Promise<void> {
  const result = await runPriceSync();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

