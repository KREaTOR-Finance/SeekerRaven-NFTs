import { createSqlClient, ensureBackendSchema } from "../db.js";
import { getBackendRuntime } from "../runtime.js";

async function main(): Promise<void> {
  const runtime = getBackendRuntime();
  const sql = createSqlClient(runtime.neonDatabaseUrl);
  await ensureBackendSchema(sql);
  console.log("Backend schema is ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

