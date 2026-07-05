exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key tidak dikonfigurasi.' }) };
  }

  try {
    const body = JSON.parse(event.body);

    // Konversi format Anthropic → format OpenAI (yang dipakai Groq)
    const messages = [];

    // Tambah system prompt sebagai system message
    if (body.system) {
      messages.push({ role: 'system', content: body.system });
    }

    // Tambah riwayat chat
    for (const msg of body.messages || []) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',   // model terbaik Groq, gratis
        messages,
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: data.error?.message || 'Groq error' }),
      };
    }

    // Konversi format Groq → format Anthropic (yang diharapkan App.jsx)
    const text = data.choices?.[0]?.message?.content || '';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: [{ type: 'text', text }],
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
