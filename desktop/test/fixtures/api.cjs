const http = require('node:http');
if (process.env.FIXTURE_MODE === 'exit') process.exit(3);
const server = http.createServer((req, res) => {
  if (process.env.FIXTURE_MODE === 'hang') return;
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><h1 id="managed">Managed API fixture</h1>');
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ service: 'onfilm-local', instanceId:
    process.env.FIXTURE_MODE === 'wrong' ? 'another-process' : process.env.ONFILM_INSTANCE_ID }));
});
server.listen(Number(process.env.ONFILM_API_PORT), '127.0.0.1');
