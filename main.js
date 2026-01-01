const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

let db;

function initDB() {
  const dbPath = path.join(app.getPath('userData'), 'entry.db');
  db = new sqlite3.Database(dbPath);

  db.serialize(() => {
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = NORMAL');
    db.run(`CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, status TEXT DEFAULT '未入場')`);
    db.run(`CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      participant_id TEXT, 
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, 
      type TEXT, 
      event_name TEXT
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_id ON access_logs(participant_id)`);
  });
}

app.whenReady().then(() => {
  initDB();
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    }
  });
  win.loadFile('index.html');
});

// 判定ロジック
ipcMain.handle('scan-id', async (event, rawData, config) => {
  return new Promise((resolve) => {
    const parts = rawData.split(',');
    const qrEventName = parts[0];
    const idRaw = parts[1] || '';
    const id = idRaw.trim().padStart(6, '0');

    if (config.eventName && qrEventName !== config.eventName) {
      return resolve({ status: 'error', message: 'イベント不一致', id });
    }

    db.get('SELECT status FROM participants WHERE id = ?', [id], (err, user) => {
      if (!user) return resolve({ status: 'error', message: '未登録ID', id });
      if (user.status === '入場済') {
        if (config.allowReEntry) {
          db.run('INSERT INTO access_logs (participant_id, type, event_name) VALUES (?, ?, ?)', [id, '再入場', qrEventName]);
          return resolve({ status: 're-entry', message: '再入場OK', id });
        }
        return resolve({ status: 'warn', message: '重複入場', id });
      }
      db.serialize(() => {
        db.run("UPDATE participants SET status = '入場済' WHERE id = ?", [id]);
        db.run('INSERT INTO access_logs (participant_id, type, event_name) VALUES (?, ?, ?)', [id, '初回', qrEventName]);
        resolve({ status: 'success', message: '入場OK', id });
      });
    });
  });
});

ipcMain.handle('get-stats', async () => {
  return new Promise((resolve) => {
    db.get("SELECT COUNT(*) as total, SUM(CASE WHEN status='入場済' THEN 1 ELSE 0 END) as entered FROM participants", (err, row) => {
      db.all("SELECT participant_id as id, timestamp, type FROM access_logs ORDER BY id DESC LIMIT 5", (err, logs) => {
        resolve({ total: row ? row.total : 0, entered: row ? row.entered : 0, logs: logs || [] });
      });
    });
  });
});

ipcMain.handle('initialize-ids', async (event, { start, end }) => {
  return new Promise((resolve) => {
    db.serialize(() => {
      db.run('DELETE FROM participants');
      db.run('DELETE FROM access_logs');
      db.run('BEGIN TRANSACTION');
      const stmt = db.prepare('INSERT INTO participants (id) VALUES (?)');
      for (let i = start; i <= end; i++) {
        stmt.run(i.toString().padStart(6, '0'));
      }
      stmt.finalize();
      db.run('COMMIT', () => resolve({ success: true, count: end - start + 1 }));
    });
  });
});

ipcMain.handle('clear-logs', () => {
  db.serialize(() => {
    db.run('DELETE FROM access_logs');
    db.run("UPDATE participants SET status = '未入場'");
    db.run('VACUUM');
  });
  return { success: true };
});

ipcMain.handle('open-data-folder', () => {
  shell.showItemInFolder(app.getPath('userData'));
});

// CSV出力用のハンドラ
ipcMain.handle('export-csv', async () => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'ログを保存',
    defaultPath: path.join(app.getPath('downloads'), `access_log_${Date.now()}.csv`),
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (!filePath) return { success: false };

  return new Promise((resolve) => {
    db.all("SELECT * FROM access_logs ORDER BY timestamp DESC", (err, rows) => {
      if (err) {
        console.error(err);
        return resolve({ success: false });
      }

      // CSVのヘッダーとデータ作成
      const header = "ID,ユーザーID,日時,種別,イベント名\n";
      const csvContent = rows.map(r => 
        `${r.id},${r.participant_id},${r.timestamp},${r.type},${r.event_name}`
      ).join('\n');

      fs.writeFileSync(filePath, "\uFEFF" + header + csvContent, 'utf-8'); // BOM付きでExcel対策
      resolve({ success: true, filePath });
    });
  });
});