#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { auditSite } from "./audit.js";
import { renderHtml } from "./report.js";

export function parseArgs(args) {
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  const result = { target: null, out: "siteproof-report", maxPages: 8, timeoutMs: 15000, browserExecutable: process.env.SITEPROOF_BROWSER };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (["--out", "--max-pages", "--timeout-ms", "--browser"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      if (arg === "--out") result.out = value;
      if (arg === "--max-pages") result.maxPages = Number(value);
      if (arg === "--timeout-ms") result.timeoutMs = Number(value);
      if (arg === "--browser") result.browserExecutable = value;
    } else if (arg.startsWith("-")) throw new Error(`Unknown option ${arg}`);
    else if (result.target) throw new Error("Provide one site URL.");
    else result.target = arg;
  }
  if (!result.target) throw new Error("Provide a site URL. Use --help for examples.");
  return result;
}

export async function run(args) {
  const options = parseArgs(args);
  if (options.help) {
    console.log("Usage: siteproof <https://site.example/> [--out DIR] [--max-pages 8] [--timeout-ms 15000] [--browser PATH]\n\nThe output directory must not already exist. Exit code 0 = no confirmed issues; 1 = issues; 2 = setup or scan error.");
    return 0;
  }
  const report = await auditSite(options.target, options);
  const destination = resolve(options.out);
  await mkdir(destination, { recursive: false });
  await Promise.all([
    writeFile(join(destination, "report.json"), JSON.stringify(report, null, 2) + "\n"),
    writeFile(join(destination, "index.html"), renderHtml(report)),
  ]);
  console.log(`Scanned ${report.summary.pagesScanned} page(s); ${report.summary.confirmedIssues} confirmed issue(s).`);
  console.log(`Report: ${join(destination, "index.html")}`);
  return report.summary.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`SiteProof: ${error.message}`);
    process.exitCode = 2;
  });
}
