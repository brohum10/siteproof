import test from "node:test";
import assert from "node:assert/strict";
import { classifyHref, inspectLinks, normalizeStart, redactHref, scopeFor, summarize } from "../src/core.js";
import { parseArgs } from "../src/cli.js";
import { renderHtml } from "../src/report.js";

test("requires a safe full URL and constrains the crawl to a base path", () => {
  assert.equal(normalizeStart("https://example.org/app/?token=secret#top"), "https://example.org/app/");
  assert.throws(() => normalizeStart("javascript:alert(1)"));
  assert.throws(() => normalizeStart("https://user:pass@example.org/"));
  const scope = scopeFor("https://example.org/app/");
  assert.equal(classifyHref("docs#start", "https://example.org/app/", scope).kind, "internal");
  assert.equal(classifyHref("/outside", "https://example.org/app/", scope).kind, "external");
  assert.equal(classifyHref("https://elsewhere.org/", "https://example.org/app/", scope).kind, "external");
  assert.equal(classifyHref("javascript:alert(1)", "https://example.org/app/", scope).kind, "unsafe");
});

test("reports missing fragments and unsafe links without fetching external pages", () => {
  const url = "https://example.org/app/";
  const result = inspectLinks([{ url, ids: ["present"], anchors: [
    { href: "#present", text: "Good" }, { href: "#missing", text: "Bad" },
    { href: "", text: "Blank" }, { href: "javascript:void(0)", text: "Unsafe" },
    { href: "https://elsewhere.org/", text: "External" },
  ] }], scopeFor(url));
  assert.deepEqual(result.issues.map((issue) => issue.code), ["missing-fragment", "link-empty", "link-unsafe"]);
  assert.equal(result.externalCount, 1);
});

test("redacts contact addresses and URL query values from saved anchors", () => {
  assert.equal(redactHref("mailto:private@example.com", "https://example.org/"), "mailto:[redacted]");
  assert.equal(redactHref("/file?token=secret#part", "https://example.org/"), "https://example.org/file#part");
});

test("CLI parses options and rejects ambiguous values", () => {
  assert.equal(parseArgs(["https://example.org", "--max-pages", "3"]).maxPages, 3);
  assert.throws(() => parseArgs(["https://example.org", "--max-pages"]));
  assert.throws(() => parseArgs(["https://example.org", "https://other.org"]));
});

test("summary and HTML escape untrusted report fields", () => {
  const report = { target: "https://example.org/", scannedAt: "today", pagesSkippedByLimit: 0,
    pages: [{ url: "https://example.org/", title: "<script>alert(1)</script>", anchors: [], violations: [], incomplete: [] }],
    linkIssues: [], networkIssues: [], navigationIssues: [], externalCount: 0, unverifiedCount: 0 };
  report.summary = summarize(report);
  assert.equal(report.summary.passed, true);
  const html = renderHtml(report);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});
