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
  event.respondWith(new Promise(async resolve => {
    let channel = new MessageChannel();
    let timeout = setTimeout(() => resolve(new Response('File request timed out', { status: 504 })), 30000);
    channel.port1.onmessage = event => {
      clearTimeout(timeout);
      let { status, error, data } = event.data || {};
      if (error) return resolve(new Response(error, { status }));
      resolve(new Response(data, { status }));
    };
    let clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    let shellClient = clientsList.find(c => {
      let p = new URL(c.url).pathname;
      return !p.startsWith('/files/') && !p.startsWith('/preview/');
    });
    if (shellClient) shellClient.postMessage({ type: 'fetch', project, path }, [channel.port2]);
    else { clearTimeout(timeout); resolve(new Response('No shell client found', { status: 503 })) }
  }));
});
