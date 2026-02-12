const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');

const app = express();
app.use(cors());
app.use(express.json());

const resend = new Resend(process.env.RESEND_API_KEY);
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

app.post('/api/send-code', async (req, res) => {
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

    await resend.emails.send({
      from: 'MoSeek <onboarding@resend.dev>',
      to: email,
      subject: 'Код подтверждения MoSeek',
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 30px; background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%); border-radius: 16px; border: 1px solid rgba(139, 92, 246, 0.2);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #a855f7; font-size: 28px; margin: 0;">MoSeek</h1>
            <p style="color: #666; font-size: 13px; margin-top: 5px;">AI Assistant</p>
          </div>
          <p style="color: #ccc; font-size: 14px; text-align: center;">Твой код подтверждения:</p>
          <div style="text-align: center; padding: 25px 0;">
            <span style="font-size: 36px; font-weight: bold; color: #a855f7; letter-spacing: 10px; background: rgba(139, 92, 246, 0.1); padding: 15px 25px; border-radius: 12px; border: 1px solid rgba(139, 92, 246, 0.3);">
              ${code}
            </span>
          </div>
          <p style="color: #555; font-size: 11px; text-align: center;">Код действителен 10 минут. Если ты не запрашивал код — просто проигнорируй.</p>
        </div>
      `,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Send code error:', error);
    res.status(500).json({ error: 'Ошибка отправки кода' });
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
