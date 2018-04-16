const electron = require('electron')
const ipc = electron.ipcRenderer
const startServerBtn = document.getElementById('start-server-btn')
const stopServerBtn = document.getElementById('stop-server-btn')
const startClientBtn = document.getElementById('start-client-btn')
const stopClientBtn = document.getElementById('stop-client-btn')
const connectInput = document.getElementById('connect')
const keyInput = document.getElementById('key')
const passphraseInput = document.getElementById('passphrase')

startServerBtn.disabled = false
stopServerBtn.disabled = true
startClientBtn.disabled = false
stopClientBtn.disabled = true

ipc.on('starting-server', function (event, message) {
  startServerBtn.disabled = true
  document.getElementById('server-info').innerHTML = message
})

ipc.on('started-server', function (event, message) {
  document.getElementById('server-info').innerHTML = message
  if (message.toLowerCase().startsWith('socks proxy running on')) {
    stopServerBtn.disabled = false
  } else {
    startServerBtn.disabled = false
    stopServerBtn.disabled = true
  }
})

ipc.on('stopping-server', function (event, message) {
  stopServerBtn.disabled = true
  document.getElementById('server-info').innerHTML = message
})

ipc.on('stopped-server', function (event, message) {
  document.getElementById('server-info').innerHTML = message
  startServerBtn.disabled = false
})

ipc.on('starting-client', function (event, message) {
  startClientBtn.disabled = true
  document.getElementById('client-info').innerHTML = message
})

ipc.on('started-client', function (event, message) {
  document.getElementById('client-info').innerHTML = message
  if (! message.toLowerCase().startsWith('error')) {
    stopClientBtn.disabled = false
  } else {
    startClientBtn.disabled = false
    stopClientBtn.disabled = true
  }
})

ipc.on('stopping-client', function (event, message) {
  stopClientBtn.disabled = true
  document.getElementById('client-info').innerHTML = message
})

ipc.on('stopped-client', function (event, message) {
  document.getElementById('client-info').innerHTML = message
  startClientBtn.disabled = false
})

ipc.on('connect-set', function (event, message) {
  connectInput.value = message
  ipc.send('connect-input', connectInput.value)
})

ipc.on('key-set', function (event, message) {
  keyInput.value = message
  ipc.send('key-input', keyInput.value)
  ipc.send('start-client')
})

startServerBtn.addEventListener('click', function () {
  ipc.send('start-server')
})

stopServerBtn.addEventListener('click', function () {
  ipc.send('stop-server')
})

startClientBtn.addEventListener('click', function () {
  ipc.send('start-client')
})

stopClientBtn.addEventListener('click', function () {
  ipc.send('stop-client')
})

connectInput.addEventListener('change', function() {
  ipc.send('connect-input', connectInput.value)
})

keyInput.addEventListener('change', function() {
  ipc.send('key-input', keyInput.value)
})

passphraseInput.addEventListener('change', function() {
  ipc.send('passphrase-input', passphraseInput.value)
})

ipc.send('start-server')
