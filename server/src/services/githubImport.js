// GitHub repo import (§8). Octokit REST; anonymous for public repos, the
// user's stored PAT for private ones. Upserting on (projectId, filename) with
// a fresh contentHash means re-importing after new commits feeds the
// incremental audit path automatically.
const path = require('path');
const { Octokit } = require('@octokit/rest');
const prisma = require('../lib/prisma');
const { LANG_MAP, detectLanguage } = require('../lib/lang');
const { sha256, countLines } = require('../lib/hash');

const MAX_FILES = 50;
const MAX_BLOB_BYTES = 100 * 1024;
const SKIP_PATH_PATTERNS = ['node_modules/', 'dist/', 'build/', 'vendor/', '.min.'];
const LOCKFILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'cargo.lock',
  'poetry.lock',
  'pipfile.lock',
  'gemfile.lock',
  'composer.lock',
  'go.sum',
]);

// Accepts https://github.com/owner/repo (optionally .git / trailing slash)
// or bare owner/repo. Returns {owner, repo} or null on garbage.
function parseRepoUrl(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  let m = trimmed.match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)$/i);
  if (m) return { owner: m[1], repo: m[2] };
  m = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (m) return { owner: m[1], repo: m[2] };
  return null;
}

// Filter tree blobs to auditable code files. `skipped` counts code files
// dropped for size (>100 KB) or the 50-file cap — the caller surfaces it as a
// warning. Path-filtered noise (node_modules, dist, lockfiles…) is not counted.
function filterTree(tree) {
  const candidates = (tree || []).filter(
    (item) =>
      item.type === 'blob' &&
      LANG_MAP[path.extname(item.path).toLowerCase()] !== undefined &&
      !SKIP_PATH_PATTERNS.some((p) => item.path.includes(p)) &&
      !LOCKFILES.has(path.basename(item.path).toLowerCase())
  );
  const selected = candidates
    .filter((item) => (item.size ?? 0) <= MAX_BLOB_BYTES)
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0)) // largest-first under the cap
    .slice(0, MAX_FILES);
  return { selected, skipped: candidates.length - selected.length };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function translateOctokitError(err) {
  if (err.status === 403 && err.response?.headers?.['x-ratelimit-remaining'] === '0') {
    return httpError(
      429,
      'GitHub API rate limit exceeded. Add a personal access token in Settings to raise the limit.'
    );
  }
  if (err.status === 404) {
    return httpError(404, 'Repository or branch not found (private repos need a PAT in Settings).');
  }
  return err;
}

// octokit parameter is injectable for tests.
async function importGithubRepo(projectId, repoUrl, branch, githubToken, octokit = null) {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) throw httpError(400, 'Invalid GitHub repository URL. Use https://github.com/owner/repo or owner/repo.');
  const { owner, repo } = parsed;
  const client = octokit || new Octokit(githubToken ? { auth: githubToken } : {});
  const branchName = branch || 'main';

  let branchData;
  let treeData;
  try {
    branchData = await client.repos.getBranch({ owner, repo, branch: branchName });
    treeData = await client.git.getTree({
      owner,
      repo,
      tree_sha: branchData.data.commit.commit.tree.sha,
      recursive: 'true',
    });
  } catch (err) {
    throw translateOctokitError(err);
  }

  const headSha = branchData.data.commit.sha;
  const { selected, skipped } = filterTree(treeData.data.tree);

  let imported = 0;
  const langCount = {};
  for (const item of selected) {
    let blob;
    try {
      blob = await client.git.getBlob({ owner, repo, file_sha: item.sha });
    } catch (err) {
      throw translateOctokitError(err);
    }
    const content = Buffer.from(blob.data.content, 'base64').toString('utf8');
    const language = detectLanguage(item.path);
    if (language) langCount[language] = (langCount[language] || 0) + 1;
    const data = {
      content,
      contentHash: sha256(content),
      language,
      lineCount: countLines(content),
      source: 'github',
    };
    await prisma.projectFile.upsert({
      where: { projectId_filename: { projectId, filename: item.path } },
      create: { projectId, filename: item.path, ...data },
      update: data,
    });
    imported++;
  }

  const dominantLanguage =
    Object.entries(langCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  await prisma.project.update({
    where: { id: projectId },
    data: {
      repoUrl: `https://github.com/${owner}/${repo}`,
      repoBranch: branchName,
      lastSyncSha: headSha,
      ...(dominantLanguage ? { language: dominantLanguage } : {}),
    },
  });

  return { imported, skipped, headSha };
}

module.exports = { parseRepoUrl, filterTree, importGithubRepo, MAX_FILES, MAX_BLOB_BYTES };
