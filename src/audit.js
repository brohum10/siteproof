import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { classifyHref, inspectLinks, normalizeStart, publicUrl, redactHref, scopeFor, summarize } from "./core.js";

function compactViolation(rule) {
  return {
    id: rule.id,
    impact: rule.impact ?? "unknown",
    help: rule.help,
    helpUrl: rule.helpUrl,
    nodeCount: rule.nodes.length,
    nodes: rule.nodes.slice(0, 12).map((node) => ({ target: node.target, summary: node.failureSummary ?? "" })),
    nodesOmitted: Math.max(0, rule.nodes.length - 12),
  };
}

export async function auditSite(rawTarget, options = {}) {
  const target = normalizeStart(rawTarget);
  const scope = scopeFor(target);
  const maxPages = options.maxPages ?? 8;
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 50) throw new Error("maxPages must be between 1 and 50.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) throw new Error("timeoutMs must be between 1,000 and 60,000.");

  const browser = await chromium.launch({ headless: true, ...(options.browserExecutable ? { executablePath: options.browserExecutable } : {}) });
  const report = {
    schemaVersion: 1,
    target, scopePath: scope.path,
    scannedAt: new Date().toISOString(),
    browserVersion: browser.version(),
    limits: { maxPages, timeoutMs },
    pages: [], linkIssues: [], networkIssues: [], navigationIssues: [],
    externalCount: 0, unverifiedCount: 0, pagesSkippedByLimit: 0,
    nonHtmlSkipped: [],
  };
  const context = await browser.newContext();
  const queue = [target];
  const queued = new Set(queue);
  try {
    while (queue.length && report.pages.length + report.navigationIssues.length < maxPages) {
      const next = queue.shift();
      const page = await context.newPage();
      const networkIssues = new Map();
      page.on("response", (response) => {
        if (response.status() < 400 || response.request().resourceType() === "document") return;
        let url;
        try { url = new URL(response.url()); } catch { return; }
        if (url.origin === scope.origin) {
          const clean = publicUrl(url.href);
          networkIssues.set(clean, { page: next, url: clean, status: response.status() });
        }
      });
      page.on("requestfailed", (request) => {
        if (request.resourceType() === "document") return;
        let url;
        try { url = new URL(request.url()); } catch { return; }
        if (url.origin === scope.origin) {
          const clean = publicUrl(url.href);
          networkIssues.set(clean, { page: next, url: clean, status: request.failure()?.errorText ?? "request failed" });
        }
      });
      try {
        const response = await page.goto(next, { waitUntil: "load", timeout: timeoutMs });
        if (!response || response.status() >= 400) {
          report.navigationIssues.push({ url: next, status: response?.status() ?? "no response" });
          continue;
        }
        if (!response.headers()["content-type"]?.includes("text/html")) {
          report.nonHtmlSkipped.push({ url: next, contentType: response.headers()["content-type"] ?? "unknown" });
          continue;
        }
        const landed = publicUrl(page.url());
        if (new URL(landed).origin !== scope.origin || !new URL(landed).pathname.startsWith(scope.path)) {
          report.navigationIssues.push({ url: next, status: "redirected outside audit scope" });
          continue;
        }
        const dom = await page.evaluate(() => ({
          title: document.title,
          ids: [...document.querySelectorAll("[id], a[name]")].map((item) => item.id || item.getAttribute("name")),
          anchors: [...document.querySelectorAll("a")].map((item) => ({ href: item.getAttribute("href"), text: (item.textContent || item.getAttribute("aria-label") || "").trim().slice(0, 120) })),
        }));
        const axe = await new AxeBuilder({ page }).analyze();
        report.pages.push({
          url: landed,
          title: dom.title,
          ids: [...new Set(dom.ids)],
          anchors: dom.anchors.map((anchor) => ({ ...anchor, href: redactHref(anchor.href, landed) })),
          violations: axe.violations.map(compactViolation),
          incomplete: axe.incomplete.map((rule) => ({ id: rule.id, nodeCount: rule.nodes.length })),
        });
        for (const anchor of dom.anchors) {
          const link = classifyHref(anchor.href, landed, scope);
          if (link.kind === "internal" && !queued.has(link.pageUrl)) {
            queued.add(link.pageUrl);
            queue.push(link.pageUrl);
          }
        }
      } catch (error) {
        report.navigationIssues.push({ url: next, status: error instanceof Error ? error.message.split("\n")[0] : "scan failed" });
      } finally {
        report.networkIssues.push(...networkIssues.values());
        await page.close();
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
  report.pagesSkippedByLimit = queue.length;
  const links = inspectLinks(report.pages, scope);
  report.linkIssues = links.issues;
  report.externalCount = links.externalCount;
  report.unverifiedCount = links.unverifiedCount;
  report.networkIssues = [...new Map(report.networkIssues.map((issue) => [`${issue.page}|${issue.url}|${issue.status}`, issue])).values()];
  report.summary = summarize(report);
  return report;
}
