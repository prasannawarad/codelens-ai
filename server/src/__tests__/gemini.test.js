const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({ generateContent: mockGenerateContent }),
  })),
}));

const {
  runGeminiAudit,
  stripFences,
  parseAuditResponse,
  chunkFiles,
  mergeBatchResults,
} = require('../services/gemini');

const VALID_RESPONSE = JSON.stringify({
  summary: 'Solid codebase with minor issues.',
  scores: { security: 85, performance: 70, maintainability: 90, debt: 60 },
  issues: [
    {
      filename: 'a.js',
      category: 'security',
      severity: 'high',
      title: 'Hardcoded secret',
      description: 'API key committed in source.',
      suggestion: 'Move to environment variables.',
      line_number: 3,
    },
  ],
});

function respondWith(text) {
  return Promise.resolve({ response: { text: () => text } });
}

beforeEach(() => mockGenerateContent.mockReset());

describe('stripFences', () => {
  it('strips ```json fences', () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips bare ``` fences', () => {
    expect(stripFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('leaves unfenced text alone', () => {
    expect(stripFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe('parseAuditResponse', () => {
  it('parses a valid response', () => {
    const result = parseAuditResponse(VALID_RESPONSE);
    expect(result.scores).toEqual({ security: 85, performance: 70, maintainability: 90, debt: 60 });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].title).toBe('Hardcoded secret');
  });

  it('clamps out-of-range scores to [0, 100]', () => {
    const raw = JSON.stringify({
      summary: 's',
      scores: { security: 150, performance: -20, maintainability: 50, debt: 100 },
      issues: [],
    });
    const result = parseAuditResponse(raw);
    expect(result.scores.security).toBe(100);
    expect(result.scores.performance).toBe(0);
  });

  it('throws when a score is missing or non-numeric', () => {
    const raw = JSON.stringify({
      summary: 's',
      scores: { security: 'high', performance: 1, maintainability: 1, debt: 1 },
      issues: [],
    });
    expect(() => parseAuditResponse(raw)).toThrow(/security/);
  });

  it('throws when issues is not an array', () => {
    const raw = JSON.stringify({
      summary: 's',
      scores: { security: 1, performance: 1, maintainability: 1, debt: 1 },
      issues: 'none',
    });
    expect(() => parseAuditResponse(raw)).toThrow(/issues/);
  });

  it('drops malformed issue entries and normalizes fields', () => {
    const raw = JSON.stringify({
      summary: 's',
      scores: { security: 1, performance: 1, maintainability: 1, debt: 1 },
      issues: [{ title: 'ok', line_number: 'seven' }, { notitle: true }, null],
    });
    const result = parseAuditResponse(raw);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].line_number).toBeNull();
    expect(result.issues[0].severity).toBe('medium');
  });
});

describe('runGeminiAudit hardening', () => {
  const files = [{ filename: 'a.js', language: 'javascript', content: 'const a = 1;' }];

  it('returns parsed result on a clean first response', async () => {
    mockGenerateContent.mockReturnValueOnce(respondWith(VALID_RESPONSE));
    const result = await runGeminiAudit(files);
    expect(result.summary).toBe('Solid codebase with minor issues.');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('handles fenced responses', async () => {
    mockGenerateContent.mockReturnValueOnce(respondWith('```json\n' + VALID_RESPONSE + '\n```'));
    const result = await runGeminiAudit(files);
    expect(result.scores.security).toBe(85);
  });

  it('retries once with a stricter instruction on parse failure', async () => {
    mockGenerateContent
      .mockReturnValueOnce(respondWith('Sure! Here is my analysis: it looks fine.'))
      .mockReturnValueOnce(respondWith(VALID_RESPONSE));
    const result = await runGeminiAudit(files);
    expect(result.scores.debt).toBe(60);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    const retryPrompt = mockGenerateContent.mock.calls[1][0];
    expect(retryPrompt).toContain('Return ONLY the JSON object.');
  });

  it('throws with the raw response after a second failure', async () => {
    mockGenerateContent
      .mockReturnValueOnce(respondWith('not json'))
      .mockReturnValueOnce(respondWith('still not json'));
    await expect(runGeminiAudit(files)).rejects.toThrow(/still not json/);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('returns perfect scores without calling the model for empty input', async () => {
    const result = await runGeminiAudit([]);
    expect(result.scores.security).toBe(100);
    expect(result.issues).toEqual([]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

describe('chunking', () => {
  it('keeps small file sets in a single batch', () => {
    const files = [
      { filename: 'a.js', content: 'a'.repeat(1000) },
      { filename: 'b.js', content: 'b'.repeat(1000) },
    ];
    expect(chunkFiles(files)).toHaveLength(1);
  });

  it('splits when concatenated content exceeds the limit', () => {
    const files = [
      { filename: 'a.js', content: 'a'.repeat(50_000) },
      { filename: 'b.js', content: 'b'.repeat(50_000) },
      { filename: 'c.js', content: 'c'.repeat(50_000) },
    ];
    const batches = chunkFiles(files);
    expect(batches).toHaveLength(3);
  });

  it('calls the model once per batch and merges results', async () => {
    const files = [
      { filename: 'a.js', language: 'javascript', content: 'x\n'.repeat(45_000) },
      { filename: 'b.js', language: 'javascript', content: 'y\n'.repeat(45_000) },
    ];
    mockGenerateContent
      .mockReturnValueOnce(respondWith(VALID_RESPONSE))
      .mockReturnValueOnce(respondWith(VALID_RESPONSE));
    const result = await runGeminiAudit(files);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(result.issues).toHaveLength(2);
  });

  it('averages scores weighted by batch LOC', () => {
    const batches = [
      [{ filename: 'a.js', content: 'line\n'.repeat(299) + 'line' }], // 300 lines
      [{ filename: 'b.js', content: 'line\n'.repeat(99) + 'line' }], // 100 lines
    ];
    const results = [
      { scores: { security: 100, performance: 100, maintainability: 100, debt: 100 }, issues: [{ title: 'x' }], summary: 'A.' },
      { scores: { security: 0, performance: 0, maintainability: 0, debt: 0 }, issues: [], summary: 'B.' },
    ];
    const merged = mergeBatchResults(results, batches);
    expect(merged.scores.security).toBe(75); // (100*300 + 0*100) / 400
    expect(merged.issues).toHaveLength(1);
    expect(merged.summary).toBe('A. B.');
  });
});
