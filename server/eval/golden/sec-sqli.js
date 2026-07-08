const { pool } = require('./pool');

async function findUser(email) {
  const sql = "SELECT * FROM users WHERE email = '" + email + "'";
  const { rows } = await pool.query(sql);
  return rows[0];
}

module.exports = { findUser };
