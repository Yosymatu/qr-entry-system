const { useState, useEffect, useRef } = React;

const App = () => {
  const videoRef = useRef(null);
  const soundOk = useRef(new Audio('./assets/ok.wav'));
  const soundNg = useRef(new Audio('./assets/ng.wav'));

  const [config, setConfig] = useState({ eventName: '', allowReEntry: true, rangeLimitOn: false, minId: 1 });
  const [range, setRange] = useState({ start: 1, end: 50000 });
  const [result, setResult] = useState({ status: 'idle', message: '待機中', id: '-' });
  const [stats, setStats] = useState({ total: 0, entered: 0, logs: [] });

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true }).then(s => videoRef.current.srcObject = s);
    const timer = setInterval(async () => {
      const vid = videoRef.current;
      if (!vid || vid.readyState !== vid.HAVE_ENOUGH_DATA) return;
      const canvas = document.createElement('canvas');
      canvas.width = vid.videoWidth; canvas.height = vid.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(vid, 0, 0);
      const code = jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data, canvas.width, canvas.height);
      
      if (code) {
        const res = await window.electron.ipcRenderer.invoke('scan-id', code.data, config);
        setResult(res);

        if (res.status === 'success' || res.status === 're-entry') {
          soundOk.current.currentTime = 0;
          soundOk.current.play();
        } else {
          soundNg.current.currentTime = 0;
          soundNg.current.play();
        }
      }
    }, 400);
    return () => clearInterval(timer);
  }, [config]);

  useEffect(() => {
    const itv = setInterval(async () => setStats(await window.electron.ipcRenderer.invoke('get-stats')), 3000);
    return () => clearInterval(itv);
  }, []);

  const bg = { success:'#22c55e', 're-entry':'#3b82f6', warn:'#eab308', error:'#ef4444', idle:'#f3f4f6' }[result.status];

  return (
    <div style={{ backgroundColor: bg, minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', transition: '0.3s' }}>
      <div style={{ display: 'flex', gap: '20px' }}>
        <video ref={videoRef} autoPlay style={{ width: '50%', border: '5px solid #fff', borderRadius: '8px' }} />
        <div style={{ width: '50%', background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
          <h2 style={{marginTop: 0}}>判定設定</h2>
          <input type="text" placeholder="照合イベント名" value={config.eventName} onChange={e => setConfig({...config, eventName: e.target.value})} style={{width: '100%', padding: '8px', marginBottom: '10px'}} />
          <label><input type="checkbox" checked={config.allowReEntry} onChange={e => setConfig({...config, allowReEntry: e.target.checked})}/> 再入場許可</label><br/>
          <label><input type="checkbox" checked={config.rangeLimitOn} onChange={e => setConfig({...config, rangeLimitOn: e.target.checked})}/> 番号制限</label>
          <input type="number" value={config.minId} onChange={e => setConfig({...config, minId: parseInt(e.target.value)})} style={{width:'100%', marginBottom: '20px'}}/>
          
          <div style={{textAlign:'center', background: '#eee', padding: '20px', borderRadius: '8px'}}>
             <div style={{fontSize:'3.5rem', fontWeight: 'bold'}}>{result.message}</div>
             <div style={{fontSize:'1.5rem'}}>ID: {result.id}</div>
          </div>

          <div style={{marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
            <button onClick={() => window.electron.ipcRenderer.invoke('open-data-folder')} style={{padding:'10px', background:'#64748b', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer'}}>📁 フォルダ開く</button>
            <button onClick={() => window.electron.ipcRenderer.invoke('export-csv')} style={{padding:'10px', background:'#10b981', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer'}}>📥 CSV出力</button>
            <button onClick={async () => { if(window.confirm('履歴を完全消去しますか？')) await window.electron.ipcRenderer.invoke('clear-logs') }} style={{padding:'10px', background:'#ef4444', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer', gridColumn:'span 2'}}>⚠️ 履歴クリア</button>
          </div>

          <h3 style={{borderTop: '1px solid #eee', paddingTop: '10px'}}>状況: {stats.entered} / {stats.total} 名</h3>
          
          <div style={{fontSize: '0.8rem', background: '#f9f9f9', padding: '10px'}}>
            ID生成: <input type="number" value={range.start} onChange={e=>setRange({...range, start:e.target.value})} style={{width:'60px'}}/> 〜 <input type="number" value={range.end} onChange={e=>setRange({...range, end:e.target.value})} style={{width:'60px'}}/>
            <button onClick={() => window.electron.ipcRenderer.invoke('initialize-ids', range)}>実行</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);