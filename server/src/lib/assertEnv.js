// Fail fast at boot with a clear message listing every missing env var.
function assertEnv(required) {
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(
      `Missing required environment variable(s): ${missing.join(', ')}\n` +
        'Copy server/.env.example to server/.env and fill in the values.'
    );
    process.exit(1);
  }
}

module.exports = assertEnv;
