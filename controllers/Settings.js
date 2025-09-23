export default class Settings {
  state = {};

  actions = {
    init: async () => {
      this.state.opt = JSON.parse(localStorage.getItem('webfoundry:config') || 'null');
      if (!this.state.opt) {
        this.state.opt = {
          companion: false,
          companionKey: `wf-${crypto.randomUUID()}`,
        };
        await post('settings.save');
      }
    },

    save: () => localStorage.setItem('webfoundry:config', JSON.stringify(this.state.opt)),

    option: async (k, v) => {
      if (v != null) this.state.opt[k] = v;
      else this.state.opt[k] = !this.state.opt[k];
      await post('settings.save');
      state.event.bus.emit('settings:option:done', { k, v: this.state.opt[k] });
    },
  };
};
