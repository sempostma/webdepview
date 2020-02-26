#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const { promisify } = require('util')
const { URL } = require('url')
const webdepview = require('../')

const readdir = promisify(fs.readdir)
const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const exists = promisify(fs.exists)

const options = process.argv.filter(x => x.startsWith('--'))
const args = process.argv.filter(x => !x.startsWith('--'))

const cacheFile = path.join(__dirname, 'cache')

const maxPort = 65535

const favicon = 'AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAABILAAASCwAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAUwAAACEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAA4AAAAAAAAAAAAAAAAAAAACAAAAXwAAAM4AAAC4AAAAVQAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABUAAAByAAAAEAAAAAAAAAAAAAAAQAAAALYAAADFAAAAwAAAAJEAAAAtAAAADAAAAAQAAAAAAAAAAAAAAAAAAAAdAAAAtAAAAHAAAAABAAAAEgAAAJoAAADDAAAAjAAAAEYAAABJAAAALAAAABgAAAAYAAAACAAAABAAAAAAAAAAJwAAALYAAAC7AAAALQAAAEAAAACYAAAAlAAAAFoAAAAtAAAABgAAAAIAAAAEAAAAFgAAABUAAAAaAAAAFgAAAC8AAAC/AAAAzQAAAHAAAABnAAAAgwAAAGYAAACJAAAAVAAAAA8AAAABAAAAAgAAAAAAAAABAAAAAQAAAAoAAABOAAAAugAAAMwAAACPAAAAegAAAHsAAABiAAAAjgAAAKgAAABgAAAAIwAAAFsAAAAyAAAAAQAAABwAAAAXAAAAhgAAAN0AAADWAAAAjwAAAHoAAACGAAAAcwAAAMUAAAC6AAAAYwAAADkAAAA9AAAALQAAAAsAAAA+AAAAJQAAAHkAAADcAAAA4AAAAIQAAABVAAAAogAAAKIAAADhAAAAsgAAAEIAAAAiAAAAPAAAABIAAAAPAAAAHgAAADgAAAB8AAAAuQAAAMsAAABlAAAAHgAAAKcAAACdAAAAjQAAAHEAAABUAAAAMQAAAEsAAABoAAAAPwAAAAkAAABVAAAAkAAAAIUAAACqAAAALAAAAAAAAABhAAAAnAAAAHUAAAAnAAAAMAAAAGAAAAChAAAAlwAAAIsAAABOAAAAhAAAAJAAAACbAAAAdgAAAAMAAAAAAAAAEQAAAIcAAAClAAAAhwAAAIAAAAClAAAAoQAAAMgAAADLAAAAmgAAALsAAAC0AAAAkgAAABYAAAAAAAAAAAAAAAAAAAAcAAAAjgAAALIAAACsAAAAtwAAAL8AAAC/AAAArQAAAJ0AAACyAAAAkgAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAABgAAAAnwAAALIAAAC7AAAAsgAAAKoAAACQAAAATwAAAA0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABMAAAA7AAAAUQAAAEkAAAAuAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAj/IAAMfzAACB8QAAgHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAgAEAAMADAADgBwAA8B8AAA=='

const throttle = (fn, limit, interval) => {
  if (!Number.isFinite(limit)) {
    throw new TypeError('Expected `limit` to be a finite number');
  }

  if (!Number.isFinite(interval)) {
    throw new TypeError('Expected `interval` to be a finite number');
  }

  const queue = new Map();

  let currentTick = 0;
  let activeCount = 0;

  const throttled = function (...args) {
    let timeout;
    return new Promise((resolve, reject) => {
      const execute = () => {
        resolve(fn.apply(this, args));
        queue.delete(timeout);
      };

      const now = Date.now();

      if ((now - currentTick) > interval) {
        activeCount = 1;
        currentTick = now;
      } else if (activeCount < limit) {
        activeCount++;
      } else {
        currentTick += interval;
        activeCount = 1;
      }

      timeout = setTimeout(execute, currentTick - now);

      queue.set(timeout, reject);
    });
  };

  return throttled;
};

const createServer = (port = 45033, listener) => new Promise((resolve, reject) => {
  const server = http.createServer(listener)
    .once('error', err => {
      if (err.code !== 'EADDRINUSE') return reject(err)
      if (port < maxPort) createServer(port + 1, listener).then(resolve).catch(reject)
    })
    .once('listening', () => {
      console.log('listening to', 'http://localhost:' + port)
      resolve(server)
    })
    .listen(port)
})

const run = async directory => {
  directory = path.resolve('.', directory)
  while ((await readdir(directory)).includes('package-lock.json') === false) {
    const parent = path.dirname(directory)
    if (parent === directory) throw new Error('Could not find package-lock.json file.')
    directory = parent
  }

  const { dependencies } = JSON.parse(
    await readFile(
      path.join(
        directory,
        'package-lock.json'
      )
    )
  )

  const ignoreDev = options.includes('--ignore-dev')

  const dependencySizeCache = await exists(cacheFile)
    ? JSON.parse(await readFile(cacheFile))
    : {}

  const npmSize = throttle(url => new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD' }, res => {
      const bytes = +res.headers['content-length']
      resolve(bytes)
    })
    req.on('error', reject)
    req.end()
  }), 10, 1000)

  const getDependencySize = async ({ resolved }) => {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`Determening size of ${resolved}...`);
    if (Object.prototype.hasOwnProperty.call(dependencySizeCache, resolved)) return dependencySizeCache[resolved]
    else return dependencySizeCache[resolved] = await npmSize(resolved)
  }

  try {
    const server = await createServer(undefined, async (req, res) => {
      if (req.url === '/favicon.ico') {
        res.writeHead(200, { 'Content-Type': 'image/x-icon' })
        res.write(favicon, 'base64')
        res.end()
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })

      const output = await webdepview({ dependencies, ignoreDev, getDependencySize })

      process.stdout.clearLine();
      process.stdout.cursorTo(0);

      await writeFile(cacheFile, JSON.stringify(dependencySizeCache))

      console.log(output)

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>webdepview</title>
  <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico"/>

  <style>
  table, th, td {
    border: 1px solid black;
    border-collapse: collapse;
    padding: 5px;
  }
  </style>
</head>
<body>
  <h1>webdepview</h1>

  <table>
    <thead>
      <th>
        Name
      </th>
      <th>
        Count (unique tree of dependencies for this package)
      </th>
      <th>
        Shared (shared dependencies with other packages)
      </th>
      <th>
        Children size gzipped (unique tree of dependencies for this package)
      </th>
    </thead>
    <tbody>
    ${output.map(({ name, count, shared, childSize }) => {
        return `<tr>
        <td>
          ${name}
        </td>
        <td>
          ${count}
        </td>
        <td>
          ${shared}
        </td>
        <td>
          ${childSize} bytes
        </td>
      </tr>`
      }).join('')}
    </tbody>
  </table>
</body>
</html>`

      res.write(html)
      res.end()
    })

    const url = 'http://localhost:' + server.address().port
    const start = (process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open')
    require('child_process').exec(start + ' ' + url)
  } catch (err) {
    console.error(err)
  }
}

run(args[2] || process.cwd())
