import { timingSafeEqual } from 'node:crypto';

// Ponte de publicação: o Activepieces chama esta rota com o token e o site é reconstruído.
// A URL do deploy hook fica só na Vercel (DEPLOY_HOOK_URL) e nunca volta na resposta.
const tokenValido = (recebido = '', esperado = '') => {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, erro: 'Use POST.' });
  }

  const esperado = (process.env.BRIDGE_TOKEN || '').trim();
  const recebido = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!esperado || !tokenValido(recebido, esperado)) {
    return res.status(401).json({ ok: false, erro: 'Token inválido.' });
  }

  const hook = (process.env.DEPLOY_HOOK_URL || '').trim();
  if (!hook) {
    return res.status(500).json({ ok: false, erro: 'DEPLOY_HOOK_URL não configurada.' });
  }

  try {
    const resposta = await fetch(hook, { method: 'POST' });
    if (!resposta.ok) {
      return res.status(502).json({ ok: false, erro: `Deploy hook respondeu ${resposta.status}.` });
    }
    const corpo = await resposta.json().catch(() => ({}));
    return res.status(200).json({ ok: true, job: corpo.job?.id || null });
  } catch (erro) {
    return res.status(502).json({ ok: false, erro: 'Falha ao chamar o deploy hook.' });
  }
}
