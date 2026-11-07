# SiteProof

**A browser-based release check for small websites.** SiteProof opens a site in Chromium, follows a bounded set of rendered same-origin links, checks fragments and failed assets, runs [axe-core](https://github.com/dequelabs/axe-core) on HTML pages, and writes a readable HTML report plus machine-readable JSON. It is useful before shipping a portfolio, documentation site, or product landing page.

**[View a real report from my portfolio](https://brohum10.github.io/siteproof/)** · [See the portfolio fix](https://github.com/brohum10/soham-portfolio/commit/eb2c6ef)

## Why I built it

A build can pass while the published page still has inaccessible controls, broken section links, or missing assets. I wanted one repeatable browser check that gives me a short list of observed problems, rather than a score with no path to a fix. The first run on [my portfolio](https://brohum10.github.io/soham-portfolio/) found a low-contrast label and accessible names that did not match visible controls. I fixed those issues and used SiteProof to check the rebuilt site again.

## Run it

Requires Node.js 22+ and Chromium. Playwright can install its own browser:

```bash
npm ci
npx playwright install chromium
node src/cli.js https://example.com/ --out report-example
```

Open `report-example/index.html` in a browser. The same observations are in `report-example/report.json`.

On macOS, an existing Chrome installation can be used without a separate browser download:

```bash
SITEPROOF_BROWSER="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node src/cli.js https://example.com/ --out report-example
```

Options: `--max-pages 8` (1–50), `--timeout-ms 15000` (1,000–60,000), `--browser /path/to/chromium`, and `--help`. The output directory must be new, so an earlier report is never overwritten. Exit status is `0` when no confirmed issues were found, `1` when issues were found, and `2` for setup or scan errors.

## How it works

1. Normalize the starting URL and limit navigation to its origin and directory path. For example, `https://example.com/docs/` stays under `/docs/`.
2. Load each page in Chromium and inspect the **rendered** links and IDs, including content produced by JavaScript. Queue same-origin HTML destinations up to the page limit; count external links without following them. If an internal URL redirects outside the scope, record the navigation as a failure and do not scan the destination.
3. Record missing fragments, unsafe or empty links, failed same-origin assets, and failed navigations. Non-HTML destinations are checked for navigation failures, then skipped for DOM accessibility rules.
4. Run axe-core on each HTML page. Store compact rule details and affected selectors, then generate both report formats.

Queries, embedded URL credentials, and mail or phone link values are stripped from saved anchors. The scanner does not authenticate or submit forms. A page can still load third-party assets, such as fonts or analytics, and an internal URL may redirect to an external page before SiteProof records the out-of-scope navigation; those requests are not counted as external link checks. **Review the JSON before publishing a report** because page titles, selectors, and paths can still contain sensitive information.

## Evidence and limits

The local test suite includes a tiny HTTP fixture with a broken page, missing fragment, failed image, external link, and unnamed button. CI installs Chromium and runs the same tests on every push and pull request.

The [portfolio report](https://brohum10.github.io/siteproof/) is a concrete sample. It describes the site and browser version, scan time, pages visited, confirmed issues, skipped content, and manual-review counts. A clean automated run does **not** certify WCAG compliance: it cannot judge every accessibility requirement, interact with every widget, check an authenticated workflow, or verify external destinations. Test keyboard navigation and screen reader behavior separately.

## Project layout

```text
src/core.js       URL scope, link checks, and summary
src/audit.js      Chromium crawl and axe integration
src/report.js     Self-contained HTML report
src/cli.js        Command-line interface and exit status
tests/            Unit and browser fixture tests
docs/             Published example report
```

License: MIT.
