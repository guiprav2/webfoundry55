let tabs = {};
self.addEventListener('message', ({ source, data }) => data.type === 'webfoundry-register-tab' && (tabs[data.tabId] = source.id));
self.addEventListener('fetch', event => {
  let url = new URL(event.request.url);
  let pathname = url.pathname;
  let prefix = null;
  if (pathname.startsWith('/files/')) prefix = '/files/';
  else if (pathname.startsWith('/preview/')) prefix = '/preview/';
  else return;
  let parts = pathname.slice(prefix.length).split('/');
  let project = parts.shift();
  let isPreview = prefix === '/preview/';
  let path = isPreview && pathname.endsWith('.html') ? 'index.html' : parts.join('/');
  let ref = event.request.referrer ? new URL(event.request.referrer) : null;
  let tabId = url.searchParams.get('webfoundryTabId') || ref && ref.searchParams.get('webfoundryTabId');
  if (!tabId) return;
  event.respondWith(new Promise(async (resolve, reject) => {
    let channel = new MessageChannel();
    let timeout = setTimeout(() => reject(new Error('Timed out')), 30000);
    channel.port1.onmessage = e => {
      clearTimeout(timeout);
      let { status, error, data } = e.data || {};
      if (error) return resolve(new Response(error, { status }));
      resolve(new Response(data, { status }));
    };
    let clientId = tabs[tabId];
    if (!clientId) return reject(new Error('Client ID not registered'));
    let client = await self.clients.get(clientId);
    if (!client) return reject(new Error('Client not found'));
    client.postMessage({ type: 'fetch', project, path }, [channel.port2]);
  }).catch(err => new Response(err.message, { status: 503 })));
});
