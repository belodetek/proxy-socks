require('string.format')

const net = require('net')
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const url = require('url')
const spawn = require('child_process').spawn
const AutoLaunch = require('auto-launch')
const electron = require('electron')
const app = electron.app
const Menu = electron.Menu
const Tray = electron.Tray
const ipc = electron.ipcMain
const BrowserWindow = electron.BrowserWindow
const Client = require('ssh2').Client
const socks = require('socksv5')
const homedir = require('os').homedir()
const debug = /--debug/.test(process.argv[2])
const default_ssh_port = 22
const default_proxy_remote = '172.20.0.10'    // e.g. Docker container running Squid, etc.
const default_socks_port = 1080
const default_squid_port = 3128

let server
let client
let conn
let socks_proxy
let squid_proxy
let mainWindow
let trayIcon
let trayMenu
let mainMenu
let appName = require('./package.json').name
let resourcesPath = path.resolve(__dirname)
let extraResources = path.join(resourcesPath, 'extra')
if (resourcesPath.endsWith('app.asar')) {
  extraResources = path.resolve(resourcesPath, '..', 'extra')
}

let iShouldQuit = app.makeSingleInstance( () => {
  if (mainWindow) {
    if (mainWindow.isMinimized())
      mainWindow.restore()
    }
    if (! mainWindow.isVisible()) {
      mainWindow.show()
    }
    mainWindow.focus()
    return true
})
if(iShouldQuit) {
  app.isQuiting = true
  app.quit()
  return
}

let dir = path.join(homedir, '.' + appName)
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
}
let configPath = path.resolve(dir)
let configFile = path.join(configPath, 'config.json')

let proxy_remote
try {
  proxy_remote = require(configFile).proxyRemote
  assert.notStrictEqual(proxy_remote, undefined)
} catch (err) {
  console.log(err)
  proxy_remote = default_proxy_remote
}
console.log(proxy_remote)

let squid_port
try {
  squid_port = require(configFile).squidPort
  assert.notStrictEqual(squid_port, undefined)
} catch (err) {
  console.log(err)
  squid_port = default_squid_port
}
console.log(squid_port)

let socks_port
try {
  socks_port = require(configFile).socksPort
  assert.notStrictEqual(socks_port, undefined)
} catch (err) {
  console.log(err)
  socks_port = default_socks_port
}
console.log(socks_port)

let privateKeyPath
try {
  privateKeyPath = require(configFile).privateKey
} catch (err) {
  console.log(err)
}
console.log(privateKeyPath)

let ssh_config = {}
try {
  ssh_config.username = require(configFile).username
  assert.notStrictEqual(ssh_config.username, undefined)
} catch (err) {
  console.log(err)
  ssh_config.username = 'tunnel'
}
try {
  ssh_config.host = require(configFile).host
  assert.notStrictEqual(ssh_config.host, undefined)
} catch (err) {
  console.log(err)
  ssh_config.host = 'localhost'
}
try {
  ssh_config.port = require(configFile).port
  assert.notStrictEqual(ssh_config.port, undefined)
} catch (err) {
  console.log(err)
  ssh_config.port = default_ssh_port
}
console.log(ssh_config)

if (resourcesPath.endsWith('app.asar')) {
  let AutoLauncher = new AutoLaunch({
    name: appName
  })
  AutoLauncher.isEnabled().then(function(isEnabled) {
    if(!isEnabled) {
      AutoLauncher.enable()
    }
  }).catch(function(err){
    console.log(err)
  })
}

function createWindow () {
  let windowOptions = {
    width: 450,
    height: 450,
    title: app.getName(),
    webPreferences: {
      pageVisibility: true,
      backgroundThrottling: false,
    }
  }
  if (process.platform === 'linux') {
    windowOptions.icon = path.resolve(
      path.normalize(
        path.join(__dirname, '/assets/app-icon/png/512.png')
      )
    )
  }

  mainWindow = new BrowserWindow(windowOptions)
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, '_index.html'),
    protocol: 'file:',
    slashes: true
  }))

  if (debug) {
    mainWindow.webContents.openDevTools()
    mainWindow.show()
    require('devtron').install()
  } else {
    mainWindow.hide()
  }

  mainWindow.webContents.once('dom-ready', () => {
    try {
      if (fs.existsSync(path.normalize(privateKeyPath))) {
        mainWindow.webContents.send('key-set', privateKeyPath)
      }
    } catch (err) {
      console.log(err)
    }
    ssh_url = ssh_config.username + '@' + ssh_config.host + ':' + ssh_config.port
    mainWindow.webContents.send('connect-set', ssh_url)
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.hide()
  })

  mainWindow.on('restore', (event) => {
    mainWindow.setSkipTaskbar(false)
    event.preventDefault()
    mainWindow.restore()
    mainWindow.focus()
  })

  mainWindow.on('minimize', (event) => {
    mainWindow.setSkipTaskbar(true)
    event.preventDefault()
    mainWindow.minimize()
  })

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
        event.preventDefault()
        mainWindow.hide()
    }
    return false
  })
}

function save_config() {
    let app_config = {
      username: ssh_config.username,
      host: ssh_config.host,
      port: ssh_config.port,
      privateKey: privateKeyPath,
      squidPort: squid_port,
      socksPort: socks_port,
      proxyRemote: proxy_remote
    }
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(configPath)
    }
    fs.writeFileSync(configFile, JSON.stringify(app_config, null, 4), 'utf8')
}

function forward_port(event, rport, lport) {
  let net = require('net')
  conn = new Client()
  try {
    conn.on('ready', function() {
      conn.forwardIn('::', rport, function(err) {
        if (err) {
          console.log(err)
          event.sender.send('stopped-client', err.message)
          client = undefined
        }
        event.sender.send('started-client', `Forwarding port ${rport} on remote to localhost:${lport}`)
        client = true
        save_config()
      })
    }).on('tcp connection', function(info, accept, deny) {
      let stream = accept()
      stream.pause()
      stream.on('error', function(err) {
        console.log(err)
      })
      let socket = net.connect(lport, '::', function () {
        stream.pipe(socket)
        socket.pipe(stream)
        stream.resume()
      })
      socket.on('error', function(err) {
        console.log(err)
      })
    }).on('error', function(err) {
      console.log(err)
      event.sender.send('stopped-client', err.message)
    }).connect(ssh_config)
  } catch (err) {
    console.log(err)
    event.sender.send('stopped-client', err.message)
  }
}

app.once('ready', () => {
  require('update-electron-app')()
  createWindow()
  trayIcon = new Tray(path.resolve(
    path.normalize(
      path.join(__dirname, '/assets/app-icon/png/16.png')
    )
  ))
  trayMenu = Menu.buildFromTemplate([
  {
    label: 'Show',
    click: () => {
      mainWindow.show()
      mainWindow.focus()
    }
  },
  {
    label: 'Quit',
    click: () => {
      app.isQuiting = true
      app.quit()
    }
  }
  ])
  trayIcon.setContextMenu(trayMenu)
  trayIcon.setToolTip(app.getName())
})

ipc.on('connect-input', (event, message) => {
  try {
    ssh_config.username = message.split(':')[0].split('@')[0]
    ssh_config.host = message.split(':')[0].split('@')[1]
    if (message.split(':')[1] !== undefined) {
      ssh_config.port = message.split(':')[1]
    } else {
      ssh_config.port = default_ssh_port
    }
  } catch (err) {
    console.log(err)
    event.sender.send('stopped-client', err.message)
  }
})

ipc.on('key-input', (event, message) => {
  try {
    privateKeyPath = message
    ssh_config.privateKey = fs.readFileSync(path.normalize(message))
  } catch (err) {
    privateKeyPath = undefined
    ssh_config.privateKey = undefined
    console.log(err)
    event.sender.send('stopped-client', err.message)
  }
})

ipc.on('passphrase-input', (event, message) => {
  if (message) {
    ssh_config.passphrase = message
  }
})

// SOCKS proxy (inbound) listing on random local port
ipc.on('start-client', (event) => {
  if (ssh_config.username && ssh_config.host && ssh_config.port && ssh_config.privateKey) {
    if (client === undefined ) {
      event.sender.send('starting-client', 'Starting remote...')
      if (server === undefined ) {
		server = socks.createServer( (info, accept, deny) => {
		  accept()
		}).listen(0, '::').useAuth(socks.auth.None())
	  }
	  server.on('listening', function() {
	    let lport = server.address().port
 		forward_port(event, 0, lport)
	  })
    } else {
      event.sender.send('started-client', 'Already running')
    }
  } else {
    event.sender.send('stopped-client', 'Not ready')
  }
})

ipc.on('stop-client', (event) => {
  if (server !== undefined) {
    server.close()
    server = undefined
  }
  if (client !== undefined) {
    event.sender.send('stopping-client', 'Stopping remote...')
    conn.end()
    conn = undefined
    client = undefined
    event.sender.send('stopped-client', 'Remote stopped')
  } else {
    event.sender.send('stopped-client', 'Not running')
  }
})

ipc.on('start-server', (event) => {
  let proxy_ports = []
  // SSH tunnel localhost:3128 => docker0:3128
  if (squid_proxy === undefined ) {
    event.sender.send('starting-server', 'Starting HTTP(S) proxy tunnel...')
	squid_proxy = net.createServer(function(sock) {
	  if (debug) {
	    console.log(sock)
	  }
	  let conn = new Client()
	  conn.on('ready', function() {
		conn.forwardOut(sock.remoteAddress, sock.remotePort, proxy_remote, squid_port, function(err, stream) {
		  if (err) {
			conn.end()
			return deny()
		  }
		  if (debug) {
			console.log(stream)
		  }
		  stream.pipe(sock).on('error', function (err) {
		    deny()
		  }).on('close', function (err) {
		    conn.end();
		  }).pipe(stream).on('error', function (err) {
		    deny()
		  }).on('close', function() {
	  	    conn.end()
	  	  })
		})
	  }).on('error', function(err) {
		deny()
	  }).connect(ssh_config)
	}).listen(squid_port, '::', () => {
	  if (!proxy_ports.indexOf(squid_port) > -1) { proxy_ports.push(squid_port) }
	  message = 'Proxy tunnel(s) localhost: ' + proxy_ports
	  event.sender.send('started-server', message)
	})
  } else {
    event.sender.send('started-server', 'Already running')
  }

  // SSH tunnel localhost:3128 => docker0:3128
  if (socks_proxy === undefined ) {
    event.sender.send('starting-server', 'Starting SOCKS proxy tunnel...')
	socks_proxy = net.createServer(function(sock) {
	  if (debug) {
	    console.log(sock)
	  }
	  let conn = new Client()
	  conn.on('ready', function() {
		conn.forwardOut(sock.remoteAddress, sock.remotePort, proxy_remote, socks_port, function(err, stream) {
		  if (err) {
			conn.end()
			return deny()
		  }
		  if (debug) {
			console.log(stream)
		  }
		  stream.pipe(sock).on('error', function (err) {
		    deny()
		  }).on('close', function (err) {
		    conn.end();
		  }).pipe(stream).on('error', function (err) {
		    deny()
		  }).on('close', function() {
	  	    conn.end()
	  	  })
		})
	  }).on('error', function(err) {
		deny()
	  }).connect(ssh_config)
	}).listen(socks_port, '::', () => {
	  if (!proxy_ports.indexOf(socks_port) > -1) { proxy_ports.push(socks_port) }
	  message = 'Proxy tunnel(s) localhost: ' + proxy_ports
	  event.sender.send('started-server', message)
	})
  } else {
    event.sender.send('started-server', 'Already running')
  }
})

ipc.on('stop-server', (event) => {
  if (squid_proxy !== undefined ) {
    event.sender.send('stopping-server', 'Stopping tunnel...')
    squid_proxy.close()
    squid_proxy = undefined
    event.sender.send('stopped-server', 'Tunnel stopped')
  } else {
    event.sender.send('stopped-server', 'Not running')
  }

  if (socks_proxy !== undefined ) {
    event.sender.send('stopping-server', 'Stopping tunnel...')
    socks_proxy.close()
    socks_proxy = undefined
    event.sender.send('stopped-server', 'Tunnel stopped')
  } else {
    event.sender.send('stopped-server', 'Not running')
  }
})
