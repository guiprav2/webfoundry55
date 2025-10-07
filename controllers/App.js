import '../other/util.js';

export default class App {
  actions = {
    init: async () => {
      top === window && await navigator.serviceWorker.register('sw.js');
      await post('event.init');
      await post('broadcast.init');
      await post('settings.init');
      await post('projects.init');
      await post('companion.init');
      await post('shell.init');
      await post('files.init');
      await post('codeEditor.init');
      await post('styles.init');
      await post('designer.init');
      await post('app.brandCanvasMonitor');
    },

    selectPanel: x => {
      this.state.panel = x;
      state.event.bus.emit('app:panel:select', { id: x });
    },

    brandCanvasMonitor: () => {
      try {
        let canvas = document.querySelector('#Canvas');
        let empty = [...canvas.children].slice(1).every(x => x.classList.contains('hidden'));
        if (this.state.brandCanvas === empty) return;
        this.state.brandCanvas = empty;
        d.updateSync();
      } finally {
        requestAnimationFrame(async () => await post('app.brandCanvasMonitor'));
      }
    },
  };
};
