export default class Collab {
  actions = {
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
