import BiMap from '../other/bimap.js';
import Boo from 'https://esm.sh/@camilaprav/boo@1.0.6';
import actions from '../other/actions.js';
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

    get current() { return this.list.find(x => x.path === state.files.current) },
    get open() { return this.current?.ready },
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
        history: {},
        ihistory: {},
        clipboards: {},
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
      let frame = this.state.current;
      if (!frame) throw new Error(`Designer frame not found: ${path}`);
      frame.el = el;
    },

    frameReady: async (path, err) => {
      let frame = this.state.current;
      if (!frame) throw new Error(`Designer frame not found: ${path}`);
      if (err) return frame.reject(err);
      frame.mutobs = new MutationObserver(async () => {
        await post('designer.maptrack', frame);
        await post('designer.save', frame);
      });
      frame.mutobs.observe(frame.html, { attributes: true, subtree: true, childList: true, characterData: true });
      await post('designer.maptrack', frame);
      frame.html.addEventListener('mousedown', async ev => await post('designer.mousedown', ev), true);
      frame.html.addEventListener('keydown', async ev => await post('designer.keydown', ev), true);
      frame.ready = true;
      frame.resolve();
    },

    maptrack: async frame => [frame.snap, frame.map] = htmlsnap(frame.html, { idtrack: true, map: frame.map }),

    mousedown: async ev => {
      this.state.current.el.focus();
      !ev.target.closest('button') && ev.preventDefault();
      await post('designer.changeSelection', 'master', [ev.target]);
    },

    keydown: async ev => {
      if (/^input|textarea|button$/i.test(document.activeElement.tagName)) return;
      let key = ev.key;
      if (ev.ctrlKey) key = `Ctrl-${key}`;
      let cmd = [...Object.values(actions)].find(x => arrayify(x.shortcut).includes(key));
      if (!cmd || (cmd.condition && !cmd.condition())) return;
      ev.preventDefault();
      ev.stopPropagation();
      await cmd.handler();
    },

    changeSelection: (cur, s) => {
      let frame = this.state.current;
      if (!frame) throw new Error(`Designer not open`);
      s = [...new Set(arrayify(s).filter(x => frame.body.contains(x)).map(x => frame.map.getKey(x)).filter(Boolean))];
      if (!s.length) frame.lastCursors[cur] = frame.cursors[cur];
      frame.cursors[cur] = s;
      state.event.bus.emit('designer:changeSelection:ready', { frame, cur, s });
    },

    toggleSelections: async cur => {
      let frame = this.state.current;
      let sel = frame.cursors[cur] || [];
      if (sel.length) await post('designer.changeSelection', cur, []);
      else if (frame.lastCursors[cur]?.length) await post('designer.changeSelection', cur, frame.lastCursors[cur].map(x => frame.map.get(x)));
    },

    trackCursors: async () => {
      requestAnimationFrame(async () => await post('designer.trackCursors'));
      let frame = this.state.current;
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

    pushHistory: async (cur, op) => {
      let frame = this.state.current;
      if (!frame) throw new Error(`Designer not open`);
      frame.history[cur] ??= [];
      frame.ihistory[cur] ??= 0;
      if (frame.history[cur].length > frame.ihistory[cur]) frame.history[cur].splice(frame.ihistory[cur], frame.history[cur].length);
      await op(true);
      frame.history[cur].push(op);
      ++frame.ihistory[cur];
    },

    undo: async cur => {
      let frame = this.state.current;
      if (!frame) throw new Error(`Designer not open`);
      if (!frame.history[cur] || frame.ihistory[cur] < 1) return;
      --frame.ihistory[cur];
      await frame.history[cur][frame.ihistory[cur]](false);
    },

    redo: async cur => {
      let frame = this.state.current;
      if (!frame) throw new Error(`Designer not open`);
      if (!frame.history[cur] || !frame.history[cur][frame.ihistory[cur]]) return;
      await frame.history[cur][frame.ihistory[cur]](true);
      ++frame.ihistory[cur];
    },

    selectParentElement: async (...xs) => await post('designer.selectRelative', 'parentElement', ...xs),
    selectNextSibling: async (...xs) => await post('designer.selectRelative', 'nextElementSibling', ...xs),
    selectPrevSibling: async (...xs) => await post('designer.selectRelative', 'previousElementSibling', ...xs),
    selectFirstChild: async (...xs) => await post('designer.selectRelative', 'firstElementChild', ...xs),
    selectLastChild: async (...xs) => await post('designer.selectRelative', 'lastElementChild', ...xs),

    selectRelative: async (k, cur, i = 1) => {
      let frame = this.state.current;
      if (!frame) throw new Error(`Designer not open`);
      if (frame.cursors[cur].length !== 1) return;
      while (i-- > 0) {
        let s = frame.map.get(frame.cursors[cur][0]);
        s[k] && frame.body.contains(s[k]) && await post('designer.changeSelection', cur, [s[k]]);
      }
    },

    createNextSibling: async (...xs) => await post('designer.createRelative', 'afterend', ...xs),
    createPrevSibling: async (...xs) => await post('designer.createRelative', 'beforebegin', ...xs),
    createFirstChild: async (...xs) => await post('designer.createRelative', 'afterbegin', ...xs),
    createLastChild: async (...xs) => await post('designer.createRelative', 'beforeend', ...xs),

    createRelative: async (pos, cur, tag, i = 1) => {
      let frame = this.state.current;
      if (!frame) throw new Error(`Designer not open`);
      if (frame.cursors[cur].length !== 1) return;
      let created = [];
      let parents = [];
      while (i-- > 0) {
        let s = frame.map.get(frame.cursors[cur][0]);
        let p = s.parentElement;
        let j = [...p.childNodes].indexOf(s);
        let k = 1;
        let pv;
        if (s.tagName === 'BODY' && (pos === 'beforebegin' || pos === 'afterend')) continue;
        let x = d.el(tag);
        created.push(x);
        parents.push(s);
      }
      await post('designer.pushHistory', cur, async apply => {
        if (apply) {
          for (let i = 0; i < created.length; i++) parents[i].insertAdjacentElement(pos, created[i]);
          await new Promise(pres => setTimeout(pres));
          await post('designer.changeSelection', cur, created);
        } else {
          for (let i = 0; i < created.length; i++) created[i].remove();
          await new Promise(pres => setTimeout(pres));
          await post('designer.changeSelection', cur, [frame.map.get(frame.cursors[cur][0])]);
        }
      });
    },

    copySelected: async cur => {
      let frame = this.state.current;
      if (!frame) throw new Error(`Designer not open`);
      let els = frame.cursors[cur].map(id => frame.map.get(id)).filter(Boolean);
      let html = els.map(n => n.outerHTML).join('\n');
      frame.clipboards[cur] = html;
      cur === 'master' && localStorage.setItem('webfoundry:clipboard', html);
    },

    deleteSelected: async (cur, i = 1) => {
      let frame = this.state.current;
      if (!frame) throw new Error(`Designer not open`);
      await post('designer.copySelected', cur);
      while (i-- > 0) {
        let ss = frame.cursors[cur].map(x => frame.map.get(x)).filter(x => x !== frame.root && x !== frame.body && x !== frame.head);
        if (!ss.length) return;
        let select = new Set();
        let removed = [];
        let ps = ss.map(x => x.parentElement);
        let idxs = ss.map(x => [...x.parentElement.children].indexOf(x));
        for (let s of ss) {
          let p = s.parentElement;
          let i = [...p.children].indexOf(s);
          s.remove();
          removed.push(s);
          select.add(ss.length === 1 ? p.children[i] || p.children[i - 1] || p : p.children[i - 1]);
        }
        select = [...select].filter(Boolean).filter(x => !removed.includes(x));
        if (!select.length) select.push(...ps);
        await post('designer.pushHistory', cur, async apply => {
          if (apply) {
            for (let s of removed) s.remove();
            await new Promise(pres => setTimeout(pres));
            await post('designer.changeSelection', cur, select);
          } else {
            for (let n = 0; n < removed.length; n++) {
              let p = ps[n];
              let i = idxs[n];
              if (p.children[i]) p.insertBefore(removed[n], p.children[i]); else p.appendChild(removed[n]);
            }
            await new Promise(pres => setTimeout(pres));
            await post('designer.changeSelection', cur, removed);
          }
        });
      }
    },

    pasteNextSibling: async cur => await post('designer.pasteRelative', 'afterend', cur),
    pastePrevSibling: async cur => await post('designer.pasteRelative', 'beforebegin', cur),
    pasteLastChild: async cur => await post('designer.pasteRelative', 'beforeend', cur),
    pasteFirstChild: async cur => await post('designer.pasteRelative', 'afterbegin', cur),

    pasteRelative: async (pos, cur) => {
      let frame = this.state.current;
      if (!frame) throw new Error(`Designer not open`);
      let html = frame.clipboards[cur] || (cur === 'master' && localStorage.getItem('webfoundry:clipboard'));
      if (!html) return;
      let template = document.createElement('template');
      template.innerHTML = html;
      let fragments = [...template.content.children];
      if (!fragments.length) return;
      let cursors = frame.cursors[cur];
      let clones = [];
      let reversed = pos === 'afterbegin';
      if (cursors.length === 1) {
        let id = cursors[0];
        let x = frame.map.get(id);
        if (!x) return;
        let items = reversed ? [...fragments].reverse() : fragments;
        for (let i = 0; i < items.length; i++) {
          let y = items[i].cloneNode(true);
          y.removeAttribute('data-htmlsnap');
          x.insertAdjacentElement(pos, y);
          clones.push(y);
        }
      } else {
        let items = reversed ? [...cursors].reverse() : cursors;
        for (let i = 0; i < items.length; i++) {
          let id = items[i];
          let x = frame.map.get(id);
          if (!x) continue;
          let frag = fragments[i % fragments.length];
          let y = frag.cloneNode(true);
          y.removeAttribute('data-htmlsnap');
          x.insertAdjacentElement(pos, y);
          clones.push(y);
        }
      }
      await new Promise(res => setTimeout(res));
      await post('designer.changeSelection', cur, clones);
      await post('designer.pushHistory', cur, async apply => {
        if (apply) {
          for (let n = 0; n < clones.length; n++) {
            let y = clones[n];
            if (!y.isConnected) {
              let ref = cursors[n % cursors.length];
              let x = frame.map.get(ref);
              if (x) x.insertAdjacentElement(pos, y);
            }
          }
          await new Promise(pres => setTimeout(pres));
          await post('designer.changeSelection', cur, clones);
        } else {
          for (let n = 0; n < clones.length; n++) clones[n].remove();
          await new Promise(pres => setTimeout(pres));
          await post('designer.changeSelection', cur, cursors.map(id => frame.map.get(id)).filter(Boolean));
        }
      });
    },
  };
};
