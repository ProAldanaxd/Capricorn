#!/usr/bin/env node
'use strict';
// Lo corre Claude Code (hooks en ~/.claude/settings.json): le pasa el aviso a Capri
// y regresa lo que tú elijas. Si Capri no está abierta o no contesta, no imprime nada
// y Claude Code sigue como siempre.
const fs = require('fs');
const path = require('path');
const http = require('http');

const LIMIT = 110 * 1000;
let finished = false;
function done(out) {
  if (finished) return;
  finished = true;
  if (out) process.stdout.write(out);
  process.exit(0);
}
setTimeout(() => done(''), LIMIT + 2000);

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  let info;
  try { info = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', 'capricorn', 'hooks.json'), 'utf8')); }
  catch { return done(''); }
  const req = http.request({
    host: '127.0.0.1', port: info.port, path: '/hook', method: 'POST', timeout: LIMIT,
    headers: { 'content-type': 'application/json', 'x-capri-token': info.token },
  }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (d) => { body += d; });
    res.on('end', () => done(res.statusCode === 200 ? body.trim() : ''));
  });
  req.on('error', () => done(''));
  req.on('timeout', () => { req.destroy(); done(''); });
  req.end(raw);
});
