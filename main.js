const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db;

function initDB() {
  const dbPath = path.join(app.getPath('userData'), 'entry.db');
  db = new Database(dbPath);
  
  // 5万人規模の書き込み負荷対策 [cite: 25]
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, status TEXT DEFAULT '未入場');
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      participant_id TEXT, 
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, 
      type TEXT, 
      event_name TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_logs_id ON access_logs(participant_id);
  `);
}

app.whenReady().then(() => {
  initDB();
  const win = new BrowserWindow({
    width: 1300, height: 900,
    webPreferences: { 
      preload: path.join(__dirname, 'preload.js'),
      autoplayPolicy: 'no-user-gesture-required' // 音声自動再生を許可
    }
  });
  win.loadFile('index.html');
});

// 判定ロジック [cite: 16, 18]
ipcMain.handle('scan-id', async (event, rawData, config) => {
  const [qrEventName, idRaw] = rawData.split(',');
  const id = (idRaw || '').trim().padStart(6, '0');
  const idNum = parseInt(id, 10);

  // イベント名照合
  if (config.eventName && qrEventName !== config.eventName) return { status: 'error', message: 'イベント不一致', id };
  // 番号制限 [cite: 18]
  if (config.rangeLimitOn && idNum < config.minId) return { status: 'error', message: `無効（${config.minId}未満）`, id };

  const user = db.prepare('SELECT status FROM participants WHERE id = ?').get(id);
  if (!user) return { status: 'error', message: '未登録ID', id };

  if (user.status === '入場済') {
    if (config.allowReEntry) {
      db.prepare('INSERT INTO access_logs (participant_id, type, event_name) VALUES (?, ?, ?)')
        .run(id, '再入場', qrEventName);
      return { status: 're-entry', message: '再入場OK', id };
    }
    return { status: 'warn', message: '重複入場', id };
  }

  const update = db.transaction(() => {
    db.prepare("UPDATE participants SET status = '入場済' WHERE id = ?").run(id);
    db.prepare('INSERT INTO access_logs (participant_id, type, event_name) VALUES (?, ?, ?)').run(id, '初回', qrEventName);
  });
  update();
  return { status: 'success', message: '入場OK', id };
});

ipcMain.handle('open-data-folder', () => {
  shell.showItemInFolder(path.join(app.getPath('userData'), 'entry.db'));
});

ipcMain.handle('get-stats', () => {
  const total = db.prepare('SELECT COUNT(*) as c FROM participants').get().c;
  const entered = db.prepare("SELECT COUNT(*) as c FROM participants WHERE status='入場済'").get().c;
  const logs = db.prepare("SELECT participant_id as id, timestamp, type FROM access_logs ORDER BY id DESC LIMIT 5").all();
  return { total, entered, logs };
});

ipcMain.handle('export-csv', async () => {
  const { filePath } = await dialog.showSaveDialog({ filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (!filePath) return { success: false };
  const writeStream = fs.createWriteStream(filePath);
  writeStream.write('ID,時刻,種別,イベント名\n');
  const stmt = db.prepare('SELECT * FROM access_logs');
  for (const row of stmt.iterate()) {
    writeStream.write(`${row.participant_id},${row.timestamp},${row.type},${row.event_name}\n`);
  }
  writeStream.end();
  return { success: true };
});

ipcMain.handle('initialize-ids', (event, { start, end }) => {
  db.prepare('DELETE FROM participants').run();
  db.prepare('DELETE FROM access_logs').run();
  const insert = db.prepare('INSERT INTO participants (id) VALUES (?)');
  const trans = db.transaction((s, e) => { for (let i = s; i <= e; i++) insert.run(i.toString().padStart(6, '0')); });
  trans(start, end);
  return { success: true, count: end - start + 1 };
});

ipcMain.handle('clear-logs', () => {
  db.transaction(() => {
    db.prepare('DELETE FROM access_logs').run();
    db.prepare("UPDATE participants SET status = '未入場'").run();
    db.prepare('VACUUM').run();
  })();
  return { success: true };
});