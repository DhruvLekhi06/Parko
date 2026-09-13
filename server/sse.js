const clients = new Set();

export function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('retry: 3000\n: connected\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

export function broadcast(event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(frame);
}

export const clientCount = () => clients.size;

setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 20000).unref();
