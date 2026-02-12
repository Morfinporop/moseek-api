const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;

const verificationCodes = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of verificationCodes.entries()) {
    if (now > value.expires) {
      verificationCodes.delete(key);
    }
  }
}, 60000);

app.post('/api/generate-code', async (req, res) => {
  const { email, turnstileToken } = req.body;

  if (!email || !turnstileToken) {
    return res.status(400).json({ error: 'Заполни все поля' });
  }

  try {
    const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: TURNSTILE_SECRET,
        response: turnstileToken,
      }),
    });
    const turnstileData = await turnstileRes.json();

    if (!turnstileData.success) {
      return res.status(400).json({ error: 'Проверка безопасности не пройдена' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    verificationCodes.set(email.toLowerCase(), {
      code,
      expires: Date.now() + 10 * 60 * 1000,
    });

    res.json({ success: true, code });
  } catch (error) {
    console.error('Generate code error:', error);
    res.status(500).json({ error: 'Ошибка генерации кода' });
  }
});

app.post('/api/verify-code', (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: 'Заполни все поля' });
  }

  const stored = verificationCodes.get(email.toLowerCase());

  if (!stored) {
    return res.status(400).json({ error: 'Код не найден. Запроси новый' });
  }

  if (Date.now() > stored.expires) {
    verificationCodes.delete(email.toLowerCase());
    return res.status(400).json({ error: 'Код истёк. Запроси новый' });
  }

  if (stored.code !== code) {
    return res.status(400).json({ error: 'Неверный код' });
  }

  verificationCodes.delete(email.toLowerCase());
  res.json({ success: true, verified: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MoSeek API running on port ${PORT}`));
