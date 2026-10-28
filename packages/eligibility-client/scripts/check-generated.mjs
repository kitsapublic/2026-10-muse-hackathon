// Fails when src/schema.ts is not exactly what openapi-typescript generates from the published schema.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "eligibility-client-"));
try {
  const generated = join(scratch, "schema.ts");
  execFileSync("npx", ["openapi-typescript", "openapi/eligibility-lab.openapi.json", "--output", generated], {
    stdio: "ignore",
  });
  if (readFileSync(generated, "utf8") !== readFileSync("src/schema.ts", "utf8")) {
    console.error("src/schema.ts is stale; run npm run generate");
    process.exit(1);
  }
  console.log("src/schema.ts matches openapi/eligibility-lab.openapi.json");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
