#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const net = require('http')
const { promisify } = require('util')

const webdepview = require('../')

const readdir = promisify(fs.readdir)
const readFile = promisify(fs.readFile)

const options = process.argv.filter(x => x.startsWith('--'))
const args = process.argv.filter(x => !x.startsWith('--'))

const maxPort = 65535

const favicon = 'AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAABILAAASCwAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAUwAAACEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAA4AAAAAAAAAAAAAAAAAAAACAAAAXwAAAM4AAAC4AAAAVQAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABUAAAByAAAAEAAAAAAAAAAAAAAAQAAAALYAAADFAAAAwAAAAJEAAAAtAAAADAAAAAQAAAAAAAAAAAAAAAAAAAAdAAAAtAAAAHAAAAABAAAAEgAAAJoAAADDAAAAjAAAAEYAAABJAAAALAAAABgAAAAYAAAACAAAABAAAAAAAAAAJwAAALYAAAC7AAAALQAAAEAAAACYAAAAlAAAAFoAAAAtAAAABgAAAAIAAAAEAAAAFgAAABUAAAAaAAAAFgAAAC8AAAC/AAAAzQAAAHAAAABnAAAAgwAAAGYAAACJAAAAVAAAAA8AAAABAAAAAgAAAAAAAAABAAAAAQAAAAoAAABOAAAAugAAAMwAAACPAAAAegAAAHsAAABiAAAAjgAAAKgAAABgAAAAIwAAAFsAAAAyAAAAAQAAABwAAAAXAAAAhgAAAN0AAADWAAAAjwAAAHoAAACGAAAAcwAAAMUAAAC6AAAAYwAAADkAAAA9AAAALQAAAAsAAAA+AAAAJQAAAHkAAADcAAAA4AAAAIQAAABVAAAAogAAAKIAAADhAAAAsgAAAEIAAAAiAAAAPAAAABIAAAAPAAAAHgAAADgAAAB8AAAAuQAAAMsAAABlAAAAHgAAAKcAAACdAAAAjQAAAHEAAABUAAAAMQAAAEsAAABoAAAAPwAAAAkAAABVAAAAkAAAAIUAAACqAAAALAAAAAAAAABhAAAAnAAAAHUAAAAnAAAAMAAAAGAAAAChAAAAlwAAAIsAAABOAAAAhAAAAJAAAACbAAAAdgAAAAMAAAAAAAAAEQAAAIcAAAClAAAAhwAAAIAAAAClAAAAoQAAAMgAAADLAAAAmgAAALsAAAC0AAAAkgAAABYAAAAAAAAAAAAAAAAAAAAcAAAAjgAAALIAAACsAAAAtwAAAL8AAAC/AAAArQAAAJ0AAACyAAAAkgAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAABgAAAAnwAAALIAAAC7AAAAsgAAAKoAAACQAAAATwAAAA0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABMAAAA7AAAAUQAAAEkAAAAuAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAj/IAAMfzAACB8QAAgHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAgAEAAMADAADgBwAA8B8AAA=='

const createServer = (port = 45033, listener) => new Promise((resolve, reject) => {
  const server = net.createServer(listener)
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

  try {
    const server = await createServer(undefined, async (req, res) => {
      if (req.url === '/favicon.ico') {
        res.writeHead(200, { 'Content-Type': 'image/x-icon' })
        res.write(favicon, 'base64')
        res.end()
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })

      const output = await webdepview({ dependencies, ignoreDev })

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
    </thead>
    <tbody>
    ${output.map(({ name, count, shared }) => {
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
