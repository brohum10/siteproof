import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { auditSite } from "../src/audit.js";

test("browser audit finds rendered link, asset, and accessibility problems", { timeout: 60000 }, async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end('<!doctype html><html lang="en"><title>Fixture</title><body><h1 id="here">Fixture</h1><button></button><a href="#missing">Missing section</a><a href="/missing">Broken page</a><a href="/file.pdf">PDF</a><a href="https://example.com/">External</a><img src="/missing.png" alt="Fixture image"></body></html>');
    } else if (req.url === "/file.pdf") {
      res.writeHead(200, { "content-type": "application/pdf" }); res.end("%PDF-1.4");
    } else { res.writeHead(404); res.end("missing"); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    const report = await auditSite(url, { maxPages: 3, browserExecutable: process.env.SITEPROOF_BROWSER });
    assert.equal(report.summary.pagesScanned, 1);
    assert.ok(report.linkIssues.some((issue) => issue.code === "missing-fragment"));
    assert.ok(report.navigationIssues.some((issue) => issue.status === 404));
    assert.ok(report.networkIssues.some((issue) => issue.status === 404 && issue.url.endsWith("missing.png")));
    assert.ok(report.pages[0].violations.some((issue) => issue.id === "button-name"));
    assert.equal(report.externalCount, 1);
    assert.equal(report.nonHtmlSkipped.length, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
