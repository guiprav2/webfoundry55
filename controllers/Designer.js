import BiMap from '../other/bimap.js';
import Boo from 'https://esm.sh/@camilaprav/boo@1.0.6';
import htmlsnap from 'https://esm.sh/@camilaprav/htmlsnap@0.0.5';
import prettier from '../other/prettier.js';
import rfiles from '../repos/rfiles.js';
import { arrayify, debounce } from '../other/util.js';
import { defaultHead } from '../other/templates.js';

export default class Designer {
  state = {
    list: [],

    frameVisible(path) {
      let frame = this.list.find(x => x.path === path);
      return state.files.current === path && frame.ready;
    },

    src(path, preview) {
      let [name, uuid] = state.projects.current.split(':');
      return `/${preview ? 'preview' : 'files'}/${uuid}/${path}`;
    },
  };

  actions = {
    init: async () => {
      let { bus } = state.event;
      bus.on('projects:select:ready', async () => await post('designer.reset'));
      bus.on('files:select:ready', async ({ path }) => {
        if (!/^(components|pages)\/.*\.html$/.test(path)) return;
        await post('designer.select', path);
      });
      await post('designer.trackCursors');
    },

    reset: () => this.state.list = [],

    select: async path => {
      if (this.state.list.find(x => x.path === path)) return;
      let p = Promise.withResolvers();
      this.state.list.push({
        path,
        get doc() { return this.el?.contentDocument },
        get html() { return this.doc?.documentElement },
        get head() { return this.doc?.head },
        get body() { return this.doc?.body },
        mutobs: null,
        snap: null,
        map: new BiMap(),
        cursors: {},
        lastCursors: {},
        overlays: {},
        resolve: p.resolve,
        reject: p.reject,
      });
      await loadman.run('designer.select', async () => {
        try { await p.promise }
        catch (err) {
          console.error(err);
          this.state.list = this.state.list.filter(x => x.path !== path);
        }
      }, true);
    },

    frameAttach: (path, el) => {
      let frame = this.state.list.find(x => x.path === path);
      if (!frame) throw new Error(`Designer frame not found: ${path}`);
      frame.el = el;
    },

    frameReady: async (path, err) => {
      let frame = this.state.list.find(x => x.path === path);
      if (!frame) throw new Error(`Designer frame not found: ${path}`);
      if (err) return frame.reject(err);
      frame.mutobs = new MutationObserver(async () => {
        await post('designer.maptrack', frame);
        await post('designer.save', frame);
      });
      frame.mutobs.observe(frame.html, { attributes: true, subtree: true, childList: true, characterData: true });
      await post('designer.maptrack', frame);
      frame.html.addEventListener('click', async ev => {
        frame.el.focus();
        !ev.target.closest('button') && ev.preventDefault();
        await post('designer.changeSelection', frame, 'master', [ev.target]);
      }, true);
      frame.ready = true;
      frame.resolve();
    },

    maptrack: async frame => [frame.snap, frame.map] = htmlsnap(frame.html, { idtrack: true, map: frame.map }),

    changeSelection: (frame, cur, s) => {
      s = [...new Set(arrayify(s).filter(x => frame.body.contains(x)).map(x => frame.map.getKey(x)).filter(Boolean))];
      if (!s.length) frame.lastCursors[cur] = frame.cursors[cur];
      frame.cursors[cur] = s;
      state.event.bus.emit('designer:changeSelection:ready', { frame, cur, s });
    },

    trackCursors: async () => {
      requestAnimationFrame(async () => await post('designer.trackCursors'));
      let frame = this.state.list.find(x => x.path === state.files.current);
      if (!frame) return;
      for (let [k, ids] of Object.entries(frame.cursors)) {
        let ovs = (frame.overlays[k] ??= []);
        while (ids.length > ovs.length) {
          let i = ovs.length;
          let o = d.el('div', { class: 'hidden border border-blue-400 z-10 pointer-events-none' });
          document.body.append(o);
          ovs.push(new Boo(o, () => frame.map.get(frame.cursors[k][i]), {
            transitionClass: 'transition-all',
            containerOverlayPosition: 'start',
          }));
        }
        while (ovs.length > ids.length) ovs.pop().disable();
      }
    },

    save: debounce(async frame => {
      let project = state.projects.current;
      let body = frame.body.cloneNode(true);
      body.style.display = 'none';
      let betterscroll = true;
      let html = `<!doctype html><html>${defaultHead({ betterscroll })}${frame.body.cloneNode(true).outerHTML}</html>`;
      await rfiles.save(project, frame.path, new Blob([html], { type: 'text/html' }));
      let phtml = await prettier(html, { parser: 'html' });
      if (phtml === html) return;
      await rfiles.save(project, frame.path, new Blob([phtml], { type: 'text/html' }));
      //state.event.bus.emit('designer:save:ready', { project, path });
    }, 200),
  };
};
