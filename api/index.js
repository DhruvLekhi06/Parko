import { app, ready } from '../server/app.js';

export default async function handler(req, res) {
  try {
    await ready();
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'BOOT', message: e.message } }));
    return;
  }
  return app(req, res);
}
