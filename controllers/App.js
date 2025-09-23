import '../other/util.js';

export default class App {
  actions = {
    init: async () => {
      await post('event.init');
      await post('broadcast.init');
      await post('settings.init');
      await post('projects.init');
      await post('companion.init');
      await post('shell.init');
      await post('files.init');
    },

    selectPanel: x => {
      this.state.panel = x;
      state.event.bus.emit('app:panel:select', { id: x });
    },
  };
};
