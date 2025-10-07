import RealtimeCollab from '../other/RealtimeCollab.js';

export default class Collab {
  actions = {
    init: async () => {
      if (!location.pathname.startsWith('/collab.html')) return;
      let room = location.hash.slice(1);
      if (!room) { location.href = '/'; return }
      this.state.rtc = new RealtimeCollab(room);
      this.state.rtc.events.on('**', ev => console.log(ev));
    },

    setup: async () => {
      let [btn, rtc] = await showModal('Collaborate');
      if (btn !== 'ok') return await rtc.teardown();
      this.state.rtc = rtc;
    },

    stop: () => {
      this.state.rtc.teardown();
      this.state.rtc = null;
    },
  };
};
