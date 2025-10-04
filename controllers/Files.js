import prettier from '../other/prettier.js';
import rfiles from '../repos/rfiles.js';
import rprojects from '../repos/rprojects.js';
import structuredFiles from '../other/structuredFiles.js';
import { defaultCtrl, defaultHtml } from '../other/templates.js';
import { debounce, joinPath, loadman } from '../other/util.js';
import { lookup as mimeLookup } from 'https://cdn.skypack.dev/mrmime';

export default class Files {
  state = {
    list: [],
    expandedPaths: new Set(),

    expanded: path => {
      if (!path) return true;
      let paths = [];
      let currentPath = '';
      for (let part of path.split('/').slice(0, -1)) { currentPath += `${part}/`; paths.push(currentPath) }
      return paths.every(x => this.state.expandedPaths.has(x));
    },

    protected: path => ['components', 'controllers', 'media', 'pages'].includes(path),
  };

  actions = {
    init: () => {
      let { bus } = state.event;
      bus.on('projects:select:ready', async () => await loadman.run('files.projectSelect', async () => {
        this.state.list = [];
        d.update();
        await post('files.load');
        if (state.app.panel === 'projects') await post('app.selectPanel', 'files');
      }));
      bus.on('projects:create:ready', async () => await post('files.load'));
      bus.on('projects:mv:ready', async () => await post('files.load'));
      bus.on('projects:rm:ready', async () => await post('files.load'));
      bus.on('files:select:ready', ({ path }) => {
        if (!path || path.endsWith('/')) return;
        let parts = path.split('/').slice(0, -1);
        let partial = '';
        for (let i = 0; i < parts.length; i++) {
          partial += `${parts[i]}/`;
          this.state.expandedPaths.add(partial);
        }
      });
      bus.on('files:create:ready', async ({ path }) => {
        await post('files.load');
        !path.endsWith('/') && await post('files.select', path);
      });
      bus.on('files:mv:ready', async ({ path, newPath }) => {
        let { current } = this.state;
        await post('files.load');
        if (current === path || (path.endsWith('/') && current?.startsWith?.(path))) {
          if (!path.endsWith('/')) await post('files.select', newPath);
          else await post('files.select', current.replace(new RegExp(`^${path}`), newPath));
        }
      });
      bus.on('files:rm:ready', async () => await post('files.load'));
      for (let x of ['save', 'rm']) {
        bus.on(`broadcast:files:${x}`, ({ event, path }) => {
          let name = path.split('/')[0];
          let storage = rprojects.storage(state.projects.list.find(x => x.startsWith(`${name}:`)));
          if (storage !== 'local') return;
          bus.emit(event.split(':').slice(1).join(':'), { path });
        });
        bus.on(`companion:files:${x}`, ({ event, path }) => {
          let name = path.split('/')[0];
          let storage = rprojects.storage(state.projects.list.find(x => x.startsWith(`${name}:`)));
          if (storage !== 'cfs') return;
          bus.emit(event.split(':').slice(1).join(':'), { path });
        });
        bus.on(`files:${x}`, async ({ event, path }) => {
          if (!path.startsWith(`${state.projects.current.split(':')[0]}/`)) return;
          await post('files.load');
        });
      }
      ['push', 'pull'].forEach(x => bus.on(`broadcast:files:${x}`, async () => await post('files.load')));
      bus.on('settings:projects:option:start', async ({ k, v, preventDefault }) => {
        if (k !== 'storage') return;
        preventDefault();
        let project = state.projects.current;
        let [btn] = await showModal('ConfirmationDialog', { title: 'Ya sure?' });
        if (btn !== 'yes') return;
        await post(v === 'local' ? 'files.push' : 'files.pull');
      });
    },

    load: debounce(async () => await loadman.run('files.load', async () => {
      let project = state.projects.current;
      let { bus } = state.event;
      bus.emit('files:load:start');
      let list = await rfiles.list(project);
      if (state.projects.current !== project) return bus.emit('files:load:abort');
      if (!list.includes(this.state.current)) await post('files.select', null);
      this.state.list = structuredFiles(list);
      bus.emit('files:load:ready');
    }), 500),

    select: path => {
      let project = state.projects.current;
      let { bus } = state.event;
      bus.emit('files:select:start');
      if (path?.endsWith?.('/')) {
        if (this.state.expandedPaths.has(path)) this.state.expandedPaths.delete(path);
        else this.state.expandedPaths.add(path);
      } else {
        this.state.current = path;
      }
      bus.emit('files:select:ready', { project, path });
    },

    create: async path => {
      let project = state.projects.current;
      let { bus } = state.event;
      bus.emit('files:create:start');
      let [btn, type, name] = await showModal('CreateFileDialog');
      if (btn !== 'ok') return bus.emit('files:create:abort', { project, path });
      if (type === 'file' && !name.includes('.') && (path === 'pages' || path?.startsWith?.('pages/'))) {
        let [choice] = await showModal('FileExtensionWarningDialog');
        if (!choice) return bus.emit('files:create:abort', { project, path });
        if (choice === 'html') name += '.html';
      }
      let fullpath = path ? joinPath(path, name) : name;
      if (await rfiles.load(project, fullpath)) {
        let [btn2] = await showModal('ConfirmationDialog', { title: 'File exists. Overwrite?' });
        if (btn2 !== 'yes') return bus.emit('files:create:abort', { project, path, name });
      }
      if (type === 'file') {
        let defaultContent = '';
        let betterscroll = true;
        if (fullpath.startsWith('controllers/') && fullpath.endsWith('.js')) defaultContent = defaultCtrl(fullpath);
        if (fullpath.endsWith('.html')) defaultContent = defaultHtml({ betterscroll });
        let iext = name.lastIndexOf('.');
        let parser = iext < 0 ? '' : name.slice(iext + 1);
        defaultContent = await prettier(defaultContent, { parser });
        let blob = new Blob([defaultContent], { type: mimeLookup(fullpath) });
        await loadman.run('files.create', async () => {
          await rfiles.save(project, fullpath, blob);
          bus.emit('files:create:ready', { project, path: fullpath });
        });
      } else {
        await loadman.run('files.create', async () => {
          await rfiles.save(project, `${fullpath}/.keep`, new Blob([''], { type: 'text/plain' }));
          bus.emit('files:create:ready', { project, path: `${fullpath}/.keep` });
        });
      }
    },

    dragstart: (ev, path) => { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', path) },
    dragover: (ev, path) => { ev.preventDefault(); ev.stopPropagation(); ev.dataTransfer.dropEffect = 'move'; this.state.dropTarget = path === '/' ? path : path.slice(0, path.lastIndexOf('/')) },

    drop: async (ev, dest) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.state.dropTarget = null;
      d.update();
      let src = ev.dataTransfer.getData('text/plain');
      let tail = src.split('/').at(src.endsWith('/') ? -2 : -1) + (src.endsWith('/') ? '/' : '');
      await rfiles.mv(state.projects.current, src, dest === '/' ? tail : dest.slice(0, dest.lastIndexOf('/') + 1) + tail);
    },

    dragend: () => { this.state.dropTarget = null },

    mv: async path => {
      let project = state.projects.current;
      let { bus } = state.event;
      bus.emit('files:mv:start');
      let isDir = path.endsWith('/');
      let [btn, newName] = await showModal('RenameFileDialog', { initialValue: path.split('/').at(isDir ? -2 : -1) });
      if (btn !== 'ok') return bus.emit('files:mv:abort', { project, path });
      let newPath = [...path.split('/').slice(0, isDir ? -2 : -1), newName].join('/') + (isDir ? '/' : '');
      await loadman.run('files.mv', async () => {
        await rfiles.mv(project, path, newPath);
        bus.emit('files:mv:ready', { project, path, newPath });
      });
    },

    rm: async path => {
      let project = state.projects.current;
      let { bus } = state.event;
      bus.emit('files:rm:start');
      let [btn] = await showModal('ConfirmationDialog', { title: 'Delete this file or folder?' });
      if (btn !== 'yes') return bus.emit('files:rm:abort', { project, path });
      await loadman.run('files.rm', async () => {
        await rfiles.rm(project, path);
        bus.emit('files:rm:ready', { project, path });
      });
    },

    push: async () => await loadman.run('files.push', async () => {
      let { bus } = state.event;
      let project = state.projects.current;
      bus.emit('files:push:start');
      await rfiles.push(project);
      await post('settings.projectOption', 'storage', 'local', true);
      await post('broadcast.publish', 'files:push', { project });
      bus.emit('files:push:ready');
    }),

    pull: async () => await loadman.run('files.pull', async () => {
      let { bus } = state.event;
      let project = state.projects.current;
      bus.emit('files:pull:start');
      await rfiles.pull(project);
      await post('settings.projectOption', 'storage', 'cfs', true);
      await post('broadcast.publish', 'files:pull', { project });
      bus.emit('files:pull:ready');
    }),
  };
};
