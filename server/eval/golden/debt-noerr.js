const fs = require('fs/promises');

async function loadConfig(path) {
  const raw = await fs.readFile(path, 'utf8');
  return JSON.parse(raw);
}

function fetchRates(url) {
  fetch(url).then((res) => res.json()).then((data) => {
    global.rates = data;
  });
}

module.exports = { loadConfig, fetchRates };
