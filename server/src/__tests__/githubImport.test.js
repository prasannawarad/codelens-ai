jest.mock('../lib/prisma', () => ({
  projectFile: { upsert: jest.fn() },
  project: { update: jest.fn() },
}));

const prisma = require('../lib/prisma');
const {
  parseRepoUrl,
  filterTree,
  importGithubRepo,
  MAX_FILES,
} = require('../services/githubImport');

beforeEach(() => jest.clearAllMocks());

describe('parseRepoUrl', () => {
  it.each([
    ['https://github.com/octocat/hello-world', 'octocat', 'hello-world'],
    ['https://github.com/octocat/hello-world.git', 'octocat', 'hello-world'],
    ['https://github.com/octocat/hello-world/', 'octocat', 'hello-world'],
    ['http://github.com/octocat/hello-world', 'octocat', 'hello-world'],
    ['octocat/hello-world', 'octocat', 'hello-world'],
    ['  octocat/hello.dots  ', 'octocat', 'hello.dots'],
  ])('parses %s', (input, owner, repo) => {
    expect(parseRepoUrl(input)).toEqual({ owner, repo });
  });

  it.each([
    ['not a url'],
    ['https://gitlab.com/owner/repo'],
    ['https://github.com/only-owner'],
    ['owner/repo/extra/path'],
    [''],
    [null],
    [42],
  ])('rejects garbage: %s', (input) => {
    expect(parseRepoUrl(input)).toBeNull();
  });
});

describe('filterTree', () => {
  const blob = (path, size = 100) => ({ path, type: 'blob', size, sha: `sha-${path}` });

  it('keeps only files with known code extensions', () => {
    const { selected } = filterTree([
      blob('src/app.js'),
      blob('README.md'),
      blob('logo.png'),
      blob('main.py'),
    ]);
    expect(selected.map((f) => f.path)).toEqual(expect.arrayContaining(['src/app.js', 'main.py']));
    expect(selected).toHaveLength(2);
  });

  it('skips vendored, built and minified paths', () => {
    const { selected } = filterTree([
      blob('node_modules/lib/index.js'),
      blob('dist/bundle.js'),
      blob('build/out.js'),
      blob('vendor/jquery.js'),
      blob('static/app.min.js'),
      blob('src/keep.js'),
    ]);
    expect(selected.map((f) => f.path)).toEqual(['src/keep.js']);
  });

  it('skips lockfiles', () => {
    // .sql/.js-suffixed lockfile names do not apply; test a js-adjacent one via go.sum being extension-less
    const { selected } = filterTree([
      { path: 'package-lock.json', type: 'blob', size: 10, sha: 'x' },
      blob('src/app.js'),
    ]);
    expect(selected.map((f) => f.path)).toEqual(['src/app.js']);
  });

  it('skips non-blob tree entries', () => {
    const { selected } = filterTree([{ path: 'src', type: 'tree', sha: 'x' }, blob('a.js')]);
    expect(selected.map((f) => f.path)).toEqual(['a.js']);
  });

  it('skips blobs over 100 KB and counts them as skipped', () => {
    const { selected, skipped } = filterTree([blob('big.js', 200 * 1024), blob('ok.js', 500)]);
    expect(selected.map((f) => f.path)).toEqual(['ok.js']);
    expect(skipped).toBe(1);
  });

  it('caps at 50 files taking largest first and reports the rest skipped', () => {
    const tree = Array.from({ length: 60 }, (_, i) => blob(`f${i}.js`, i + 1));
    const { selected, skipped } = filterTree(tree);
    expect(selected).toHaveLength(MAX_FILES);
    expect(skipped).toBe(10);
    // largest-first: the biggest file (size 60) is included, the 10 smallest are not
    expect(selected.map((f) => f.path)).toContain('f59.js');
    expect(selected.map((f) => f.path)).not.toContain('f0.js');
  });
});

describe('importGithubRepo with mocked Octokit', () => {
  const mockOctokit = {
    repos: { getBranch: jest.fn() },
    git: { getTree: jest.fn(), getBlob: jest.fn() },
  };

  beforeEach(() => {
    mockOctokit.repos.getBranch.mockResolvedValue({
      data: { commit: { sha: 'head-sha', commit: { tree: { sha: 'tree-sha' } } } },
    });
    mockOctokit.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { path: 'src/app.js', type: 'blob', size: 120, sha: 'blob-1' },
          { path: 'node_modules/x.js', type: 'blob', size: 50, sha: 'blob-2' },
        ],
      },
    });
    mockOctokit.git.getBlob.mockResolvedValue({
      data: { content: Buffer.from('const a = 1;\n').toString('base64') },
    });
    prisma.projectFile.upsert.mockResolvedValue({});
    prisma.project.update.mockResolvedValue({});
  });

  it('imports filtered blobs as github-sourced files and updates the project', async () => {
    const result = await importGithubRepo(
      'p1',
      'https://github.com/octocat/hello-world',
      undefined,
      null,
      mockOctokit
    );

    expect(result).toEqual({ imported: 1, skipped: 0, headSha: 'head-sha' });
    expect(mockOctokit.repos.getBranch).toHaveBeenCalledWith({
      owner: 'octocat',
      repo: 'hello-world',
      branch: 'main',
    });
    expect(mockOctokit.git.getTree).toHaveBeenCalledWith({
      owner: 'octocat',
      repo: 'hello-world',
      tree_sha: 'tree-sha',
      recursive: 'true',
    });
    expect(prisma.projectFile.upsert).toHaveBeenCalledTimes(1);
    const upsert = prisma.projectFile.upsert.mock.calls[0][0];
    expect(upsert.create.source).toBe('github');
    expect(upsert.create.language).toBe('javascript');
    expect(upsert.create.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        repoUrl: 'https://github.com/octocat/hello-world',
        repoBranch: 'main',
        lastSyncSha: 'head-sha',
        language: 'javascript',
      },
    });
  });

  it('throws 400 on a garbage URL without calling GitHub', async () => {
    await expect(importGithubRepo('p1', 'garbage!!!', 'main', null, mockOctokit)).rejects.toThrow(
      /Invalid GitHub repository URL/
    );
    expect(mockOctokit.repos.getBranch).not.toHaveBeenCalled();
  });

  it('translates rate-limit 403s into a PAT suggestion', async () => {
    mockOctokit.repos.getBranch.mockRejectedValue(
      Object.assign(new Error('rate limited'), {
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': '0' } },
      })
    );
    await expect(
      importGithubRepo('p1', 'octocat/hello-world', 'main', null, mockOctokit)
    ).rejects.toThrow(/personal access token in Settings/);
  });

  it('translates 404s into a friendly message', async () => {
    mockOctokit.repos.getBranch.mockRejectedValue(
      Object.assign(new Error('not found'), { status: 404 })
    );
    await expect(
      importGithubRepo('p1', 'octocat/nope', 'main', null, mockOctokit)
    ).rejects.toThrow(/not found/i);
  });
});
