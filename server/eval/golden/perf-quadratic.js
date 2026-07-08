function findDuplicates(ids) {
  const duplicates = [];
  for (const id of ids) {
    const matches = ids.filter((other) => other === id);
    if (matches.length > 1 && !duplicates.includes(id)) {
      duplicates.push(id);
    }
  }
  return duplicates;
}

module.exports = { findDuplicates };
