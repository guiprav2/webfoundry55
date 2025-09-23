#!/usr/bin/env node
import chokidar from 'chokidar';
import dotenv from 'dotenv';
import fs, { promises as fsp } from 'fs';
import getpass from './getpass.js';
import path from 'path';
import readline from 'readline';
import server from './server.js';
import { glob } from 'glob';
import { mkdirp } from 'mkdirp';
import { rimraf } from 'rimraf';

let configDir = `${process.env.HOME}/.webfoundry`;
mkdirp.sync(configDir);
let configFile = `${configDir}/config.env`;
let ocl = console.log;
console.log = () => null;
fs.existsSync(configFile) && dotenv.config({ path: configFile });
console.log = ocl;
if (!process.env.WF_CLIENT_KEY) {
  console.log(`Since this app offers a shell via WebSocket, it's important to authenticate before allowing access.`);
  console.log(`You can find your Webfoundry client key in the settings menu of the app.`);
  let key = await getpass('Enter a secret Webfoundry client key used for authentication: ');
  if (!key) { console.log('WF_CLIENT_KEY cannot be empty. Exiting.'); process.exit(1) }
  fs.appendFileSync(configFile, `WF_CLIENT_KEY=${key}\n`);
  process.env.WF_CLIENT_KEY = key;
  console.log(`WF_CLIENT_KEY saved to ${configFile}.`);
}

let workspace = process.cwd();
if (!fs.existsSync(`${workspace}/.webfoundry`)) {
  console.log(`No .webfoundry file found in: ${workspace}`);
  await new Promise(pres => {
    let rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Would you like to initialize a Webfoundry workspace here? (y/N): ', answer => {
      rl.close();
      let yes = answer.trim().toLowerCase();
      if (yes !== 'y' && yes !== 'yes') process.exit(0);
      fs.writeFileSync(`${workspace}/.webfoundry`, '');
      pres();
    });
  });
}

let s = server(process.env.WF_CLIENT_KEY);
s.events.on('connected', () => console.log('Client connected (handshake OK).'));
s.events.on('disconnected', () => console.log('Client disconnected.'));

s.rpc('files:list', async ({ path }) => (await glob(`${path}/**/*`, { nodir: true, dot: true })));

s.rpc('files:stat', async ({ path }) => {
  try { return await fsp.stat(path) }
  catch (err) { if (err.code === 'ENOENT') return null; throw err }
});

s.rpc('files:load', async ({ path }) => {
  try { return (await fsp.readFile(path)).toString('base64') }
  catch (err) { if (err.code === 'ENOENT') return null; throw err }
});

s.rpc('files:save', async ({ path, data }) => {
  await mkdirp(path.split('/').slice(0, -1).join('/'));
  await fsp.writeFile(path, Buffer.from(data, 'base64'));
});

s.rpc('files:mv', async ({ path, newPath }) => await fsp.rename(path, newPath));
s.rpc('files:rm', async ({ path }) => await rimraf(path));

let watcher = chokidar.watch(workspace, { ignoreInitial: true, ignored: /^node_modules\/|\/\.git\/|\.swp$/ });
['add', 'change', 'unlink'].forEach(x => watcher.on(x, path => s.broadcast({
  type: `files:${{ add: 'save', change: 'save', unlink: 'rm'}[x]}`,
  path: path.slice(workspace.length + 1),
})));

console.log('Webfoundry Companion listening on ws://localhost:8845/');
console.log(`Current workspace: ${workspace}`);
