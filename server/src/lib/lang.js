const path = require('path');

const LANG_MAP = {
  '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript',
  '.tsx': 'typescript', '.py': 'python', '.java': 'java',
  '.cpp': 'cpp', '.c': 'c', '.rb': 'ruby', '.go': 'go',
  '.rs': 'rust', '.sql': 'sql', '.html': 'html', '.css': 'css',
};

function detectLanguage(filename) {
  return LANG_MAP[path.extname(filename).toLowerCase()] || null;
}

module.exports = { LANG_MAP, detectLanguage };
