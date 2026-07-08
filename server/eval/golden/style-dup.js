function formatUserRow(user) {
  const name = (user.name || '').trim();
  const email = (user.email || '').trim().toLowerCase();
  const joined = new Date(user.createdAt).toISOString().slice(0, 10);
  return `${name} <${email}> joined ${joined}`;
}

function formatAdminRow(admin) {
  const name = (admin.name || '').trim();
  const email = (admin.email || '').trim().toLowerCase();
  const joined = new Date(admin.createdAt).toISOString().slice(0, 10);
  return `${name} <${email}> joined ${joined}`;
}

module.exports = { formatUserRow, formatAdminRow };
