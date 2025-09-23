import RealtimeCollaboration from '../other/collab.js';

class Collaborate {
  constructor() {
    window.collaborate = this;
    this.room = crypto.randomUUID();
    this.link = `https://webfoundry-client.netlify.app/#${this.room}`;
    this.collab = new RealtimeCollaboration(this.room);
  }

  selectLink(ev) {
    ev.target.select();
  }

  linkKeyDown(ev) {
    ev.preventDefault();
  }

  async copyLink(ev) {
    let original = ev.target.textContent;
    try {
      await navigator.clipboard.writeText(this.link);
    } catch (err) {
      console.error(err);
      ev.target.disabled = true;
      ev.target.textContent = 'Copy failed!';
      setTimeout(() => {
        ev.target.disabled = false;
        ev.target.textContent = original;
      }, 2000);
      return;
    }
    ev.target.disabled = true;
    ev.target.textContent = 'Link copied!';
    setTimeout(() => {
      ev.target.disabled = false;
      ev.target.textContent = original;
    }, 2000);
  }

  submit = ev => {
    ev.preventDefault();
    this.root.returnDetail = this.collab;
    this.root.close(ev.submitter.value);
  };
}

export default Collaborate;
