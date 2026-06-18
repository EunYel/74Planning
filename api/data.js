import { Redis } from '@upstash/redis';

const redis = new Redis({
  url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const { key } = req.query;

  if (!key || key.length < 4) {
    return res.status(400).json({ error: '키가 너무 짧습니다 (4자 이상)' });
  }

  const storageKey = `74plan:${key}`;

  if (req.method === 'GET') {
    const data = await redis.get(storageKey);
    return res.status(200).json({ data: data ?? null });
  }

  if (req.method === 'POST') {
    await redis.set(storageKey, req.body);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
