import * as pako from 'https://esm.sh/pako';
import RealtimeCollab from '../other/RealtimeCollab.js';
import rfiles from '../repos/rfiles.js';

export default class Collab {
  state = { rpcs: {} };

  actions = {
    init: async () => {
      let { bus } = state.event;
      if (!location.pathname.startsWith('/collab.html')) {
        bus.on('files:select:ready', async () => await post('collab.sync'));
        bus.on('designer:select:ready', async () => await post('collab.sync'));
        bus.on('designer:save:ready', async () => await post('collab.sync'));
      } else {
        let room = location.hash.slice(1);
        if (!room) { location.href = '/'; return }
        this.state.rtc = new RealtimeCollab(room);
        this.state.rtc.events.on('sync', async ev => await post('collab.apply', ev));
        this.state.rtc.events.on('rpc:response', async ev => await post('collab.rpcResponse', ev));
      }
    },

    setup: async () => {
      let [btn, rtc] = await showModal('Collaborate');
      if (btn !== 'ok') return await rtc.teardown();
      this.state.rtc = rtc;
      rtc.events.on('presence:join', async () => await post('collab.sync'));
      rtc.events.on('rpc:*', async ev => await post('collab.rpcInvoke', ev));
    },

    stop: () => {
      this.state.rtc.teardown();
      this.state.rtc = null;
    },

    rpc: async (proc, data = {}) => {
      let req = { type: null, rpcid: null, ...data, type: `rpc:${proc}`, rpcid: crypto.randomUUID() };
      this.state.rtc.send(req);
      let p = Promise.withResolvers();
      this.state.rpcs[req.rpcid] = { pres: p.resolve, prej: p.reject };
      return await p.promise;
    },

    rpcResponse: async ev => {
      if (ev.peer !== 'master') throw new Error(`RPC response spoof (not from master)`);
      if (!this.state.rpcs[ev.rpcid]) throw new Error(`Unknown RPCID: ${ev.rpcid}`);
      let rpc = this.state.rpcs[ev.rpcid];
      delete this.state.rpcs[ev.rpcid];
      if (ev.error) return rpc.prej(new Error(ev.error));
      rpc.pres(ev.data);
    },

    rpcInvoke: async ev => {
      try {
        let proc = ev.type.split(':')[1];
        let fn = this.rpcs[proc];
        if (!fn) throw new Error(`Unknown RPC: ${proc}`);
        this.state.rtc.send({ type: 'rpc:response', rpcid: ev.rpcid, data: await fn(ev) });
      } catch (err) {
        console.error(err);
        this.state.rtc.send({ type: 'rpc:response', rpcid: ev.rpcid, error: err.toString() });
      }
    },

    sync: async () => {
      this.state.rtc.send({
        type: 'sync',
        project: state.projects.current,
        files: state.files.list,
        expandedPaths: [...state.files.expandedPaths],
        current: state.files.current,
        contents: state.designer.open && state.designer.current.html.outerHTML,
      });
    },

    apply: async ev => {
      state.projects.current = ev.project;
      state.files.list = ev.files;
      state.files.expandedPaths = new Set(ev.expandedPaths);
      if (state.files.current !== ev.current) {
        state.files.current = ev.current;
        await post('designer.select', ev.current);
      }
    },
  };

  rpcs = {
    fetch: async ({ project, path }) => {
      if (state.projects.current !== project) throw new Error(`Wrong project: ${project}`);
      let blob = await rfiles.load(project, path);
      if (!blob) throw new Error(`Not found: ${path}`);
      return await b64(await gzblob(blob));
    },
  };
};

async function gzblob(blob) {
  return new Blob([pako.gzip(new Uint8Array(await blob.arrayBuffer()))], { type: 'application/gzip' });
}

function b64(blob) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
