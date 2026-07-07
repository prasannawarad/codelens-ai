const crypto = require('crypto');

function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function countLines(content) {
  return content.length === 0 ? 0 : content.split('\n').length;
}

module.exports = { sha256, countLines };
