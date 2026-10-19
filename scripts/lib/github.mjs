// Bounded downloads from GitHub. Uses GITHUB_TOKEN when present (CI) to
// avoid the anonymous API rate limit; the server repository is public, so
// no other token is needed.

const API = "https://api.github.com";
const MAX_BYTES = 256 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

function headers(accept) {
  const out = { "User-Agent": "afterhours-2015-launcher-scripts", Accept: accept };
  if (process.env.GITHUB_TOKEN) out.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return out;
}

async function get(url, accept) {
  const response = await fetch(url, {
    headers: headers(accept),
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GET ${url}: HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error(`GET ${url}: ${length} bytes is over the limit.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error(`GET ${url}: response is over the limit.`);
  return bytes;
}

export async function apiJson(path) {
  const bytes = await get(`${API}${path}`, "application/vnd.github+json");
  return JSON.parse(bytes.toString("utf8"));
}

export async function download(url) {
  return get(url, "application/octet-stream");
}

/** The latest published, non-draft, non-prerelease release. */
export async function latestRelease(repository) {
  return apiJson(`/repos/${repository}/releases/latest`);
}

export async function releaseByTag(repository, tag) {
  return apiJson(`/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`);
}
