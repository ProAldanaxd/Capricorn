#!/usr/bin/env node
'use strict';
// Lo corren Claude Code y Antigravity (sus hooks) para pasarle a Capri lo que está pasando
// y regresar lo que tú elijas.
//   Claude Code:  node capri-hook.js
//   Antigravity:  node capri-hook.js ag pre|post|stop
// Si Capri no está abierta o no contesta, regresa la respuesta "neutral" y todo sigue normal.
const fs = require('fs');
const path = require('path');
const http = require('http');

const [src, ev] = process.argv.slice(2);
const isAg = src === 'ag';
// lo que se imprime si Capri no contesta (Antigravity pide "decision" en PreToolUse)
const NEUTRAL = isAg ? (ev === 'pre' ? '{"decision":"allow"}' : '{}') : '';

const LIMIT = 110 * 1000;
let finished = false;
function done(out) {
  if (finished) return;
  finished = true;
  const o = out || NEUTRAL;
  if (o) process.stdout.write(o);
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
    host: '127.0.0.1', port: info.port, method: 'POST', timeout: LIMIT,
    path: isAg ? '/hook?src=ag&ev=' + encodeURIComponent(ev || '') : '/hook',
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
