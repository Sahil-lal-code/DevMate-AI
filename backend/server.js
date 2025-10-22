// server.js
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Buffer } from 'buffer';

console.log('🚀 Starting DevMate server.js - UPDATED EXECUTE HANDLER LOADED');

const app = express();
const PORT = process.env.PORT || 5005;

// -------------------- Middleware --------------------
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiter (60 requests per minute)
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
}));

// -------------------- Gemini Setup --------------------
if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️ GEMINI_API_KEY not set — /api/explain and /api/improve will fail.');
}

// Initialize Gemini model (may throw if key missing — that's expected)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  generationConfig: { maxOutputTokens: 2000 }
});

// -------------------- Helpers --------------------
// Determine if a string is base64 by decoding then re-encoding and comparing
const isLikelyBase64 = (str) => {
  if (str == null) return false;
  if (typeof str !== 'string') return false;
  // quick reject: allowed base64 chars only (plus possible newline)
  const maybe = str.trim();
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(maybe)) return false;
  try {
    const decoded = Buffer.from(maybe, 'base64').toString('utf8');
    const reencoded = Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/, '');
    const normalized = maybe.replace(/=+$/, '');
    return reencoded === normalized;
  } catch (e) {
    return false;
  }
};

const safeDecode = (maybeB64) => {
  if (maybeB64 == null) return '';
  const s = String(maybeB64);
  if (isLikelyBase64(s)) {
    try {
      return Buffer.from(s, 'base64').toString('utf8');
    } catch (e) {
      return s;
    }
  }
  // Not base64 — return original (trim trailing whitespace)
  return s;
};

// Local language id mapping (common Judge0 CE ids)
const DEFAULT_LANGUAGE_IDS = {
  python: 71,
  javascript: 63,
  java: 62,
  c: 50,
  'c++': 54
};

// -------------------- Routes --------------------
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Explain endpoint
app.post('/api/explain', async (req, res) => {
  try {
    const { code, language } = req.body;
    if (!code || !language) return res.status(400).json({ error: 'Code and language required' });

    const prompt = `Explain the following ${language} code in simple terms:
1. Break down key components
2. Describe control flow
3. Highlight important variables/functions
4. Use bullet points for clarity

Return ONLY the explanation, no code formatting.

Code:
${code}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text?.() ?? '';
    return res.json({ explanation: text || 'No explanation generated' });
  } catch (err) {
    console.error('Gemini explain error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to generate explanation' });
  }
});

// Improve endpoint
app.post('/api/improve', async (req, res) => {
  try {
    const { code, language } = req.body;
    if (!code || !language) return res.status(400).json({ error: 'Code and language required' });

    const prompt = `Analyze this ${language} code and return ONLY the improved version:
- If the code is already optimal, return "No correction required"
- Do not include any explanations or comments
- Keep the exact same functionality
- Only return the raw code

Code:
${code}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const improvedCode = response.text?.() ?? '';
    return res.json({
      improvedCode: improvedCode.includes('No correction required') ? 'No correction required' : (improvedCode.trim() || 'No correction generated')
    });
  } catch (err) {
    console.error('Gemini improve error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to generate improvements' });
  }
});

// Execute endpoint - robust version with polling & language auto-detection
app.post('/api/execute', async (req, res) => {
  console.log('📥 /api/execute called');
  try {
    const { code, language } = req.body;
    if (!code || !language) return res.status(400).json({ error: 'Code and language required' });

    console.log('Language requested:', language);
    // Resolve language id: local mapping first, else query Judge0 /languages
    let langId = DEFAULT_LANGUAGE_IDS[language];

    if (!langId) {
      console.log(`Language '${language}' not in local map. Querying Judge0 /languages for detection...`);
      try {
        const langsResp = await axios.get('https://judge0-ce.p.rapidapi.com/languages', {
          headers: {
            'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
            'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
          },
          params: { limit: 300 }
        });
        if (Array.isArray(langsResp.data)) {
          const found = langsResp.data.find(l => {
            const name = String(l.name || '').toLowerCase();
            const slug = String(l.slug || '').toLowerCase();
            return name.includes(language.toLowerCase()) || slug.includes(language.toLowerCase());
          });
          if (found) {
            langId = found.id;
            console.log('Auto-detected language:', found.name, 'id=', found.id);
          } else {
            console.log('No matching language found from Judge0 /languages');
          }
        }
      } catch (err) {
        console.warn('Could not fetch /languages from Judge0:', err?.message || err);
      }
    } else {
      console.log('Using local language id mapping:', langId);
    }

    if (!langId) {
      return res.status(400).json({ error: `Unsupported language: ${language}` });
    }

    // Create submission
    const createResp = await axios.post('https://judge0-ce.p.rapidapi.com/submissions', {
      source_code: code,
      language_id: langId,
      stdin: ''
      // optionally add redirect_stderr_to_stdout: true
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
      }
    });

    console.log('Create submission response:', createResp.data?.token ? 'token received' : createResp.data);

    const token = createResp.data?.token;
    if (!token) {
      console.error('No token returned from Judge0 create response:', createResp.data);
      return res.status(500).json({ error: 'Judge0 did not return a token', raw: createResp.data });
    }

    // Poll loop until finished or timeout
    const pollIntervalMs = 800;
    const timeoutMs = 20000; // 20 seconds total timeout
    const startAt = Date.now();
    let resultData = null;

    while (Date.now() - startAt < timeoutMs) {
      const getResp = await axios.get(`https://judge0-ce.p.rapidapi.com/submissions/${token}`, {
        headers: {
          'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
          'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
        },
        params: {}
      });

      resultData = getResp.data;
      console.log('Poll status:', resultData?.status);

      // status.id: 1 = In Queue, 2 = Processing, >=3 = finished
      const statusId = resultData?.status?.id ?? 0;
      if (statusId > 2) break;
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    if (!resultData) {
      console.error('No resultData received after polling.');
      return res.status(500).json({ error: 'No result received from Judge0' });
    }

    // Log raw response (so you can paste it here if needed)
    console.log('Judge0 raw response:', JSON.stringify(resultData, null, 2));

    // Try to decode typical fields (compile_output, stderr, stdout)
    const compileOutput = safeDecode(resultData.compile_output);
    const stderr = safeDecode(resultData.stderr);
    const stdout = safeDecode(resultData.stdout);

    const statusDesc = resultData?.status?.description ?? 'Unknown';
    let output = '';

    // Prefer compile_output for compiled languages, then stderr, then stdout
    if (compileOutput && compileOutput.trim()) output = compileOutput;
    else if (stderr && stderr.trim()) output = stderr;
    else if (stdout && stdout.trim()) output = stdout;
    else output = 'No output';

    return res.json({
      output,
      status: statusDesc,
      token,
      raw: resultData
    });

  } catch (err) {
    console.error('❌ Error in /api/execute:', err?.response?.data || err?.message || err);
    const details = err?.response?.data ? err.response.data : (err?.message || String(err));
    return res.status(500).json({ error: 'Execution failed', details });
  }
});

// -------------------- Start server --------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
