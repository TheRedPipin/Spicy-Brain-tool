const KEY = process.env.OPENROUTER_API_KEY
const MODEL = process.env.OPENROUTER_MODEL || "openrouter/sherlock-dash-alpha"
const PORT = process.env.PORT || 3000;

import http from "http";
if (!KEY) {
  console.warn('WARNING: OPENROUTER_API_KEY is not set. Requests to OpenRouter will fail with 401.\nSet the environment variable OPENROUTER_API_KEY or load it from a .env file.');
}
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/generate-tasks') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : {};
      const { prompt, depth = 5 } = payload;
      if (!prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'missing_prompt' }));
        return;
      }

      const result = await generateTasks(prompt, depth);
      if (result && result.error) {
        const status = result.code === 401 ? 401 : 502;
        res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(result));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(result));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'server_error', message: err.message }));
    }
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  res.end('Hello World\n');
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});


function stripCodeFences(s) {
  if (!s || typeof s !== 'string') return s;
  return s.replace(/```(?:json)?\n?/g, '').replace(/```/g, '');
}

function extractFirstJsonArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return null;
}

function parseAssistantJson(text) {
  if (!text) return null;
  const cleaned = stripCodeFences(text).trim();
  const candidate = extractFirstJsonArray(cleaned) || cleaned;
  try {
    return JSON.parse(candidate);
  } catch (e) {
    try {
      const fixed = candidate.replace(/\n/g, ' ').replace(/'/g, '"');
      return JSON.parse(fixed);
    } catch (e2) {
      throw new Error('Failed to parse JSON from assistant response');
    }
  }
}

async function generateTasks(taskPrompt, depth) {
  if (!KEY) {
    return { error: 'missing_api_key', message: 'OPENROUTER_API_KEY is not configured on the server. Set process.env.OPENROUTER_API_KEY', code: 401 };
  }
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: `Generate a list of ${depth} tasks to accomplish the following goal: ${taskPrompt}. Only return a JSON list of these steps in the format [ { "task_number": 1, "task_title": "Title of the task", "task_description": "A detailed description of the task" }, ... ]`,
        },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    let remoteBody = data;
    try {
      const txt = JSON.stringify(data);
      remoteBody = txt;
    } catch (_) {}
    return { error: 'remote_api_error', message: `OpenRouter API returned ${response.status}`, code: response.status, remote: remoteBody };
  }
  let content = null;
  if (Array.isArray(data.choices) && data.choices[0]) {
    const msg = data.choices[0].message;
    if (typeof msg === 'string') content = msg;
    else if (msg && (typeof msg.content === 'string' || Array.isArray(msg.content))) {
      if (typeof msg.content === 'string') content = msg.content;
      else if (Array.isArray(msg.content)) content = msg.content.map(c => (c?.text ?? c)).join('');
    }
  } else if (Array.isArray(data.output)) {
    content = data.output.map(o => (o?.content ?? JSON.stringify(o))).join('');
  } else if (typeof data.choices?.[0]?.text === 'string') {
    content = data.choices[0].text;
  } else {
    content = JSON.stringify(data);
  }

  try {
    const tasks = parseAssistantJson(content);
    return tasks;
  } catch (err) {
    return { error: 'parse_error', message: err.message, raw: content, rawResponse: data };
  }
}