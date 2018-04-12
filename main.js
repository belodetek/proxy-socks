require('string.format')

const fs = require('fs')
const assert = require('assert')
const path = require('path')
const url = require('url')
const spawn = require('child_process').spawn
const AutoLaunch = require('auto-launch')
const autoUpdater = require('electron-updater').autoUpdater
const electron = require('electron')
const app = electron.app
const Menu = electron.Menu
const Tray = electron.Tray
const ipc = electron.ipcMain
const BrowserWindow = electron.BrowserWindow
const Client = require('ssh2').Client

const debug = /--debug/.test(process.argv[2])
const default_ssh_port = 22
const default_socks_port = 1080

let server
let client
let conn
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

var iShouldQuit = app.makeSingleInstance( () => {
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

let configPath = path.resolve(process.env.HOME, '.' + appName)
let configFile = path.resolve(configPath, 'config.json')

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

if (path.resolve(__dirname).endsWith('app.asar')) {
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
    pathname: path.join(__dirname, 'index.html'),
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


  console.log(privateKeyPath)


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

app.once('ready', () => {
  autoUpdater.checkForUpdates()
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

ipc.on('start-server', (event) => {
  let socks = require('socksv5')
  if (server === undefined ) {
    event.sender.send('starting-server', 'Starting server...')
    server = socks.createServer( (info, accept, deny) => {
      accept()
    }).listen(socks_port, '0.0.0.0', () => {
      message = 'SOCKS server listening on port ' + socks_port
      event.sender.send('started-server', message)
    }).useAuth(socks.auth.None())
  } else {
    event.sender.send('started-server', 'Already running')
  }
})

ipc.on('stop-server', (event) => {
  if (server !== undefined ) {
    event.sender.send('stopping-server', 'Stopping server...')
    server.close()
    server = undefined
    event.sender.send('stopped-server', 'Server stopped')
  } else {
    event.sender.send('stopped-server', 'Not running')
  }
})

function save_config() {
    let app_config = {
      username: ssh_config.username,
      host: ssh_config.host,
      port: ssh_config.port,
      privateKey: privateKeyPath,
      socksPort: socks_port
    }
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(configPath)
    }
    fs.writeFileSync(configFile, JSON.stringify(app_config, null, 4), 'utf8')
}

function get_port(event) {
  return new Promise(function (resolve, reject) {
    let conn = new Client()
    try {
      conn.on('ready', function() {
        conn.exec('', function(err, stream) {
          if (err) {
            console.log(err)
            event.sender.send('stopped-client', err.message)
          }
          stream.on('close', function() {
            conn.end()
          }).on('data', function(data) {
            resolve(parseInt(data.toString()))
          }).on('error', function(err) {
            console.log(err)
            event.sender.send('stopped-client', err.message)
          })
        })
      }).on('error', function(err) {
        console.log(err)
        event.sender.send('stopped-client', err.message)
      }).connect(ssh_config)
    } catch (err) {
      console.log(err)
      event.sender.send('stopped-client', err.message)
    }
  })
}

function forward_port(event, result) {
  let net = require('net')
  conn = new Client()
  try {
    conn.on('ready', function() {
      conn.forwardIn('127.0.0.1', result, function(err) {
        if (err) {
          console.log(err)
          event.sender.send('stopped-client', err.message)
          client = undefined
        }
        event.sender.send('started-client', `Client started on port ${result}`)
        client = true
        save_config()
      })
    }).on('tcp connection', function(info, accept, deny) {
      var stream = accept()
      stream.pause()
      let socket = net.connect(socks_port, '127.0.0.1', function () {
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

ipc.on('start-client', (event) => {
  if (ssh_config.username && ssh_config.host && ssh_config.port && ssh_config.privateKey) {
    if (client === undefined ) {
      event.sender.send('starting-client', 'Starting client...')
      let p = get_port(event)
      p.then(function(result) {
        forward_port(event, result)
      })
    } else {
      event.sender.send('started-client', 'Already running')
    }
  } else {
    event.sender.send('stopped-client', 'Not ready')
  }
})

ipc.on('stop-client', (event) => {
  if (client !== undefined) {
    event.sender.send('stopping-client', 'Stopping client...')
    conn.end()
    conn = undefined
    client = undefined
    event.sender.send('stopped-client', 'Client stopped')
  } else {
    event.sender.send('stopped-client', 'Not running')
  }
})
