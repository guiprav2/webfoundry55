#!/usr/bin/env node
import dotenv from 'dotenv';
import fs, { promises as fsp } from 'fs';
import getpass from './getpass.js';
import path from 'path';
import readline from 'readline';
import server from './server.js';
import { mkdirp } from 'mkdirp';

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

s.rpc('files:save', async ({ path, data }) => {
  console.log('files.save', path);
});

s.rpc('files:load', async ({ path }) => {
  console.log('files.load', path);
});

s.rpc('files:mv', async ({ path, newPath }) => {
  console.log('files.mv', path, newPath);
});

s.rpc('files:rm', async ({ path }) => {
  console.log('files.rm', path);
});

console.log('Webfoundry Companion listening on ws://localhost:8845/');
console.log(`Current workspace: ${workspace}`);
