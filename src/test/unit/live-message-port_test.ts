import {expect, test} from 'vite-plus/test';
import {messagePortLike} from '../../panel/figures/live/message-port.js';
import {portPageTransport} from '../../lib/devframe/port-link.js';

test('a MessageChannel carries the page transport both ways', async () => {
  const channel = new MessageChannel();
  const panel = portPageTransport(messagePortLike(channel.port1));
  const page = portPageTransport(messagePortLike(channel.port2));

  const toPage = new Promise((resolve) => page.on('lit:command', resolve));
  const toPanel = new Promise((resolve) => panel.on('lit:announce', resolve));
  panel.send('lit:command', {type: 'tree'});
  page.send('lit:announce', {version: 1});

  expect(await toPage).toEqual({type: 'tree'});
  expect(await toPanel).toEqual({version: 1});
  channel.port1.close();
  channel.port2.close();
});
