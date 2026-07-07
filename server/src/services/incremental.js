// Incremental audit logic (§7): diff current files against the previous
// completed audit's staticMetrics.perFile snapshot (which stores each file's
// contentHash at audit time — the incremental key).

// currentFiles: [{ filename, contentHash, ... }]
// prevPerFile:  [{ filename, contentHash, ... }] from the previous audit
// changed = new files + files whose hash differs; unchanged = the rest.
function partitionFiles(currentFiles, prevPerFile) {
  const prevHashByName = new Map(
    (prevPerFile || [])
      .filter((e) => e && e.filename && e.contentHash)
      .map((e) => [e.filename, e.contentHash])
  );
  const changed = [];
  const unchanged = [];
  for (const file of currentFiles) {
    if (prevHashByName.get(file.filename) === file.contentHash) unchanged.push(file);
    else changed.push(file);
  }
  return { changed, unchanged };
}

// Carry forward unchanged files' unresolved issues as fresh rows for the new
// audit. Resolved issues are done — they are not copied.
// prevIssues: Issue rows including { file: { filename } | null }.
// Returns issue objects in the Gemini issue shape (filename + line_number).
function carryForwardIssues(prevIssues, unchangedFilenames) {
  const names = new Set(unchangedFilenames);
  return (prevIssues || [])
    .filter((i) => !i.resolved && i.file && names.has(i.file.filename))
    .map((i) => ({
      filename: i.file.filename,
      category: i.category,
      severity: i.severity,
      title: i.title,
      description: i.description,
      suggestion: i.suggestion,
      line_number: i.lineNumber,
    }));
}

module.exports = { partitionFiles, carryForwardIssues };
