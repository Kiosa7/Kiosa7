// Generates assets/stats-overview.svg and assets/top-langs.svg from ALL of your
// repos (public + private) using the GitHub CLI. Run from the repo root:
//   node scripts/update-stats.mjs
// Requires `gh auth login` with the `repo` scope.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const USER = "Kiosa7";
const YEAR = new Date().getFullYear();

const gh = (...args) => {
  try {
    return execFileSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 1e9, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};
const ghPages = (path) =>
  gh("--paginate", path)
    .replace(/\]\s*\[/g, ",")
    .trim() || "[]";

const repos = JSON.parse(ghPages(`user/repos?affiliation=owner&per_page=100`)).filter((r) => !r.fork);

let commitsYear = 0;
let commitsAll = 0;
const langBytes = {};
for (const r of repos) {
  for (const [lang, bytes] of Object.entries(JSON.parse(gh(`repos/${r.full_name}/languages`) || "{}"))) {
    langBytes[lang] = (langBytes[lang] || 0) + bytes;
  }
  const commits = JSON.parse(ghPages(`repos/${r.full_name}/commits?per_page=100&author=${USER}`));
  if (!Array.isArray(commits)) continue;
  commitsAll += commits.length;
  commitsYear += commits.filter((c) => c.commit.author.date.startsWith(String(YEAR))).length;
}
const live = repos.filter((r) => r.homepage && !r.homepage.includes("github.com")).length;

// ---------- SVG helpers ----------
const BG = "#0D1117", TITLE = "#58A6FF", TEXT = "#A9B1D6", VALUE = "#E0E6FF", ACCENT = "#00C6FF";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fmt = (n) => n.toLocaleString("en-US");
const card = (w, h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<style>
  .t{font:600 18px 'Segoe UI',Ubuntu,sans-serif;fill:${TITLE}}
  .l{font:400 13px 'Segoe UI',Ubuntu,sans-serif;fill:${TEXT}}
  .v{font:700 26px 'Segoe UI',Ubuntu,sans-serif;fill:${VALUE}}
  .s{font:400 11px 'Segoe UI',Ubuntu,sans-serif;fill:${TEXT}}
  .f{opacity:0;animation:in .6s ease-out forwards}
  @keyframes in{to{opacity:1}}
</style>
<rect width="${w}" height="${h}" rx="10" fill="${BG}"/>
<text x="24" y="36" class="t">${esc(title)}</text>
${body}
</svg>`;

// ---------- Overview card ----------
const tiles = [
  [fmt(commitsYear), `commits in ${YEAR}`],
  [fmt(commitsAll), "commits all-time"],
  [repos.length, "repositories"],
  [live, "live products"],
];
const overview = card(
  495, 170, `${USER} · all work (incl. private)`,
  tiles
    .map(([v, l], i) => {
      const x = 24 + i * 118;
      return `<g class="f" style="animation-delay:${i * 150}ms">
  <text x="${x}" y="98" class="v">${esc(v)}</text>
  <text x="${x}" y="122" class="l">${esc(l)}</text>
  <rect x="${x}" y="136" width="86" height="3" rx="1.5" fill="${ACCENT}" opacity="${1 - i * 0.2}"/>
</g>`;
    })
    .join("\n")
);

// ---------- Languages card ----------
const COLORS = { TypeScript: "#3178c6", JavaScript: "#f1e05a", "C#": "#178600", HTML: "#e34c26", CSS: "#563d7c", PHP: "#4F5D95", PLpgSQL: "#336790", SCSS: "#c6538c", Python: "#3572A5", Rust: "#dea584", Java: "#b07219", Shell: "#89e051" };
const IGNORE = new Set(["Jupyter Notebook", "Hack", "PowerShell", "Dockerfile", "Batchfile"]);
const total = Object.entries(langBytes).filter(([k]) => !IGNORE.has(k)).reduce((a, [, b]) => a + b, 0);
const top = Object.entries(langBytes)
  .filter(([k]) => !IGNORE.has(k))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .map(([k, b]) => [k, (b / total) * 100]);
let x = 24;
const bar = top
  .map(([k, p]) => {
    const w = (p / 100) * 447;
    const r = `<rect x="${x.toFixed(1)}" y="54" width="${w.toFixed(1)}" height="10" fill="${COLORS[k] || "#888"}"/>`;
    x += w;
    return r;
  })
  .join("");
const legend = top
  .map(([k, p], i) => {
    const lx = 24 + (i % 2) * 230, ly = 92 + Math.floor(i / 2) * 22;
    return `<g class="f" style="animation-delay:${i * 80}ms"><circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${COLORS[k] || "#888"}"/><text x="${lx + 16}" y="${ly}" class="l">${esc(k === "PLpgSQL" ? "PL/pgSQL" : k)} <tspan class="s">${p.toFixed(1)}%</tspan></text></g>`;
  })
  .join("\n");
const langs = card(495, 180, "Languages across all repos", `<clipPath id="c"><rect x="24" y="54" width="447" height="10" rx="5"/></clipPath><g clip-path="url(#c)">${bar}</g>\n${legend}`);

mkdirSync("assets", { recursive: true });
writeFileSync("assets/stats-overview.svg", overview);
writeFileSync("assets/top-langs.svg", langs);
console.log({ repos: repos.length, commitsYear, commitsAll, live, top: top.map(([k, p]) => `${k} ${p.toFixed(1)}%`) });
