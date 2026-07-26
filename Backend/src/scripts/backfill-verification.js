#!/usr/bin/env node
import { backfillLegacyVerification } from "../services/verification.service.js";

const apply = process.argv.includes("--apply");
const report = backfillLegacyVerification({ dryRun: !apply });

console.log(JSON.stringify(report, null, 2));

if (!apply) {
  console.log("\nDry run only. Re-run with --apply after reviewing the summary.");
}
