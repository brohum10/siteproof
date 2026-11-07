export function normalizeStart(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Enter a full http:// or https:// URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Use an HTTP(S) URL without embedded credentials.");
  }
  url.hash = "";
  url.search = "";
  return url.href;
}

export function scopeFor(startUrl) {
  const url = new URL(startUrl);
  return { origin: url.origin, path: new URL(".", url).pathname };
}

export function publicUrl(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.hash = "";
  url.search = "";
  return url.href;
}

export function redactHref(href, fromUrl) {
  if (typeof href !== "string") return href;
  try {
    const url = new URL(href, fromUrl);
    if (url.protocol === "mailto:") return "mailto:[redacted]";
    if (url.protocol === "tel:") return "tel:[redacted]";
    if (!["http:", "https:"].includes(url.protocol)) return url.protocol;
    url.username = "";
    url.password = "";
    url.search = "";
    return url.href;
  } catch { return href; }
}

export function classifyHref(href, fromUrl, scope) {
  if (typeof href !== "string" || !href.trim()) return { kind: "empty" };
  let url;
  try { url = new URL(href, fromUrl); } catch { return { kind: "invalid" }; }
  if (url.protocol === "javascript:") return { kind: "unsafe" };
  if (!["http:", "https:"].includes(url.protocol)) return { kind: "other" };
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.path)) return { kind: "external" };
  let fragment;
  try { fragment = decodeURIComponent(url.hash.slice(1)); } catch { return { kind: "invalid" }; }
  return { kind: "internal", pageUrl: publicUrl(url.href), fragment };
}

export function inspectLinks(pages, scope) {
  const pageMap = new Map(pages.map((page) => [page.url, page]));
  const issues = [];
  let externalCount = 0;
  let unverifiedCount = 0;
  for (const page of pages) {
    for (const anchor of page.anchors) {
      const link = classifyHref(anchor.href, page.url, scope);
      if (link.kind === "external") externalCount++;
      if (["empty", "invalid", "unsafe"].includes(link.kind)) {
        issues.push({ page: page.url, code: `link-${link.kind}`, href: anchor.href ?? "", text: anchor.text });
      } else if (link.kind === "internal" && link.fragment) {
        const destination = pageMap.get(link.pageUrl);
        if (!destination) unverifiedCount++;
        else if (!destination.ids.includes(link.fragment)) {
          issues.push({ page: page.url, code: "missing-fragment", href: `${link.pageUrl}#${link.fragment}`, text: anchor.text });
        }
      }
    }
  }
  return { issues, externalCount, unverifiedCount };
}

export function summarize(report) {
  const axeViolations = report.pages.reduce((total, page) => total + page.violations.length, 0);
  const axeNodes = report.pages.reduce((total, page) => total + page.violations.reduce((sum, rule) => sum + rule.nodeCount, 0), 0);
  const incomplete = report.pages.reduce((total, page) => total + page.incomplete.length, 0);
  const confirmedIssues = axeViolations + report.linkIssues.length + report.networkIssues.length + report.navigationIssues.length;
  return {
    pagesScanned: report.pages.length, axeViolations, axeNodes, incomplete,
    brokenLinks: report.linkIssues.length, failedRequests: report.networkIssues.length,
    navigationFailures: report.navigationIssues.length,
    externalLinksSkipped: report.externalCount, fragmentChecksSkipped: report.unverifiedCount,
    confirmedIssues, passed: confirmedIssues === 0,
  };
}
