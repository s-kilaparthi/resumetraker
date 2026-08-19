const { app, BrowserWindow } = require('electron');

let mainWindow;

async function createWindow() {
  const { serverReady } = require('./server.js');
  await serverReady;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Resume Tracker',
  });

  mainWindow.loadURL('http://localhost:4000');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
