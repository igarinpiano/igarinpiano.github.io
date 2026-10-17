(() => {
  'use strict';
  const FS_KEY = 'osworld.fs.v1';
  const SETTINGS_KEY = 'osworld.settings.v1';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const chooser = $('#chooser');
  const bootScreen = $('#boot-screen');
  const desktop = $('#desktop');
  const windowLayer = $('#window-layer');
  const taskbar = $('#taskbar');
  const startMenu = $('#start-menu');
  const modalRoot = $('#modal-root');
  const toastRoot = $('#toast-root');
  const topbarContext = $('#topbar-context');

  const systems = {
    xp: { name: 'Windows XP', short: 'Windows XP-style desktop', icon: '🪟', edition: 'Windows XP · Luna-inspired', mark: '⊞', user: 'User', prompt: 'C:\\Documents and Settings\\User', command: 'cmd' },
    mint: { name: 'Linux Mint', short: 'Linux Mint-style desktop', icon: '🌿', edition: 'Linux Mint · Cinnamon-inspired', mark: '◈', user: 'user', prompt: '/home/user', command: 'bash' },
    studio: { name: 'OS World Studio', short: 'Original experimental desktop', icon: '◈', edition: 'OS World Studio · Experimental', mark: '◈', user: 'creator', prompt: '/home/creator', command: 'shell' }
  };
  let currentOS = null;
  let fsRoot = null;
  let windows = new Map();
  let winSequence = 0;
  let zIndex = 10;
  let focusedWindowId = null;
  let bootTimer = null;
  let bootStarted = 0;
  let pendingConfirmCallback = null;
  let explorerPath = '/home/user';
  let explorerSelected = null;
  let editorCount = 0;
  let lastFocusedTerminal = null;
  let recentApps = [];
  let settings = loadSettings();

  function loadSettings() {
    try { return { ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) }; }
    catch { return {}; }
  }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { toast('設定を保存できませんでした。ストレージ容量を確認してください。', true); } }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function bytes(str) { return new Blob([str]).size; }
  function formatBytes(n) { if (n < 1024) return `${n} B`; if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`; return `${(n/1024/1024).toFixed(2)} MB`; }
  function toast(message, error = false) {
    const node = document.createElement('div'); node.className = `toast${error ? ' error' : ''}`; node.textContent = message; toastRoot.append(node); setTimeout(() => node.remove(), 3300);
  }
  function loadFs() {
    try {
      const parsed = JSON.parse(localStorage.getItem(FS_KEY) || 'null');
      if (parsed && parsed.type === 'dir' && parsed.children) return parsed;
    } catch {}
    const now = new Date().toISOString();
    const dir = (children = {}) => ({ type: 'dir', children, createdAt: now, updatedAt: now });
    const file = content => ({ type: 'file', content, createdAt: now, updatedAt: now });
    const userHome = dir({
      'Desktop': dir({ 'quick-start.txt': file('OS Worldへようこそ！\n\nここはブラウザの中の仮想デスクトップです。\n\n・Terminalを開いて help を実行\n・vim notes.md でVimを体験\n・Filesからファイルを作成\n・StorageからJSONを書き出してバックアップ\n\nファイルは、このWebサイトのローカルストレージに保存されます。') }),
      'Documents': dir({
        'welcome.txt': file('Welcome to OS World.\n\nA tiny computer, inside your browser.\nMake it yours.\n'),
        'notes.md': file('# My notes\n\n- Explore the terminal\n- Try Vim: `vim notes.md`\n- Create a folder with `mkdir experiments`\n\n> Files persist in this browser until you clear them.\n')
      }),
      'Downloads': dir(),
      'Projects': dir({ 'hello.py': file('def main():\n    message = "Hello from OS World!"\n    print(message)\n\nif __name__ == "__main__":\n    main()\n'), 'README.md': file('# Projects\n\nYour experiments live here.\n') }),
      'README.md': file('# OS World\n\nThis is a browser-based desktop experience, not a real operating system.\n\nTry `help`, `ls`, `cat README.md`, and `vim notes.md`.\n')
    });
    const root = dir({ 'home': dir({ 'user': userHome, 'creator': dir({ 'Desktop': dir(), 'Documents': dir(), 'Downloads': dir(), 'Projects': dir() }) }), 'Desktop': dir(), 'Documents': dir(), 'Downloads': dir(), 'tmp': dir(), 'etc': dir({ 'hostname': file('os-world\n'), 'os-release': file('NAME="OS World Browser Lab"\nVERSION="1.0"\n') }), 'var': dir({ 'log': dir() }), 'System': dir({ 'readme.txt': file('OS World virtual system files. Do not expect a real OS kernel here.\n') }) });
    fsRoot = root; persistFs(); return root;
  }
  function createBlankFs() {
    const now = new Date().toISOString();
    const dir = (children = {}) => ({ type: 'dir', children, createdAt: now, updatedAt: now });
    const home = () => dir({ Desktop: dir(), Documents: dir(), Downloads: dir(), Projects: dir() });
    return dir({ home: dir({ user: home(), creator: home() }), tmp: dir(), etc: dir({ 'hostname': { type: 'file', content: 'os-world\n', createdAt: now, updatedAt: now } }), System: dir() });
  }
  function persistFs() {
    try { localStorage.setItem(FS_KEY, JSON.stringify(fsRoot)); return true; }
    catch (e) { toast('保存できませんでした。データをエクスポートして、不要なファイルを削除してください。', true); return false; }
  }
  fsRoot = loadFs();

  function normalizePath(path, cwd = '/home/user') {
    let raw = String(path ?? '').trim();
    if (!raw || raw === '~') return '/home/user';
    raw = raw.replace(/\\/g, '/');
    if (/^[A-Za-z]:/.test(raw)) {
      raw = raw.replace(/^[A-Za-z]:/, '');
      if (!raw || raw === '/') return '/';
      if (/^(\/Users\/[^/]+|\/Documents and Settings\/[^/]+)/i.test(raw)) raw = '/home/user' + raw.replace(/^\/Users\/[^/]+|^\/Documents and Settings\/[^/]+/i, '');
      else if (raw.startsWith('/')) raw = '/home/user' + raw;
    }
    if (raw.startsWith('~/')) raw = '/home/user/' + raw.slice(2);
    if (!raw.startsWith('/')) raw = `${cwd === '/' ? '' : cwd}/${raw}`;
    const stack = [];
    for (const part of raw.split('/')) { if (!part || part === '.') continue; if (part === '..') stack.pop(); else stack.push(part); }
    return '/' + stack.join('/');
  }
  function nodeAt(path) {
    const normalized = normalizePath(path, '/');
    if (normalized === '/') return fsRoot;
    let node = fsRoot;
    for (const part of normalized.slice(1).split('/')) {
      if (!node || node.type !== 'dir' || !Object.prototype.hasOwnProperty.call(node.children, part)) return null;
      node = node.children[part];
    }
    return node || null;
  }
  function parentAt(path) {
    const normalized = normalizePath(path, '/');
    if (normalized === '/') return null;
    const parts = normalized.slice(1).split('/'); const name = parts.pop();
    return { parent: nodeAt('/' + parts.join('/')), name, path: normalized };
  }
  function ensureDir(path) {
    const normalized = normalizePath(path, '/'); let node = fsRoot; const now = new Date().toISOString();
    for (const part of normalized.split('/').filter(Boolean)) {
      if (!node.children[part]) node.children[part] = { type: 'dir', children: {}, createdAt: now, updatedAt: now };
      if (node.children[part].type !== 'dir') return null;
      node = node.children[part];
    }
    persistFs(); return node;
  }
  function writeFile(path, content, opts = {}) {
    const normalized = normalizePath(path, opts.cwd || '/home/user'); const info = parentAt(normalized);
    if (!info || !info.parent || info.parent.type !== 'dir') return { ok:false, error:'親ディレクトリが見つかりません。' };
    if (info.parent.children[info.name]?.type === 'dir') return { ok:false, error:'同名のディレクトリが存在します。' };
    const prior = info.parent.children[info.name]; const now = new Date().toISOString();
    info.parent.children[info.name] = { type:'file', content:String(content), createdAt:prior?.createdAt || now, updatedAt:now };
    persistFs(); return { ok:true, path:normalized };
  }
  function makeDir(path, cwd = '/home/user') {
    const normalized = normalizePath(path, cwd); if (nodeAt(normalized)) return { ok:false, error:'その名前は既に使われています。' };
    const info = parentAt(normalized); if (!info?.parent || info.parent.type !== 'dir') return { ok:false, error:'親ディレクトリが見つかりません。' };
    info.parent.children[info.name] = { type:'dir', children:{}, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }; persistFs(); return { ok:true, path:normalized };
  }
  function removePath(path, cwd = '/home/user') {
    const normalized = normalizePath(path, cwd); if (normalized === '/') return {ok:false,error:'ルートは削除できません。'};
    const info = parentAt(normalized); if (!info?.parent || !info.parent.children[info.name]) return {ok:false,error:'ファイルが見つかりません。'};
    delete info.parent.children[info.name]; persistFs(); return {ok:true};
  }
  function renamePath(path, newName, cwd = '/home/user') {
    const normalized = normalizePath(path, cwd); const info = parentAt(normalized);
    if (!info?.parent || !info.parent.children[info.name]) return {ok:false,error:'対象が見つかりません。'};
    if (!newName || newName.includes('/') || newName.includes('\\') || newName === '.' || newName === '..') return {ok:false,error:'ファイル名が不正です。'};
    if (info.parent.children[newName]) return {ok:false,error:'同じ名前の項目が既に存在します。'};
    info.parent.children[newName] = info.parent.children[info.name]; delete info.parent.children[info.name]; persistFs(); return {ok:true,path:normalizePath(newName, normalizePath('..', normalized))};
  }
  function clonePath(src, dest, cwd) {
    const a = normalizePath(src,cwd), b = normalizePath(dest,cwd), n = nodeAt(a); if (!n) return {ok:false,error:'コピー元が見つかりません。'};
    const destNode = nodeAt(b); let final = b;
    if (destNode?.type === 'dir') final = normalizePath(a.split('/').pop(),b);
    if (nodeAt(final)) return {ok:false,error:'コピー先に同名の項目があります。'};
    const info = parentAt(final); if (!info?.parent || info.parent.type !== 'dir') return {ok:false,error:'コピー先のディレクトリがありません。'};
    info.parent.children[info.name] = JSON.parse(JSON.stringify(n)); persistFs(); return {ok:true,path:final};
  }
  function movePath(src, dest, cwd) {
    const a = normalizePath(src,cwd), b = normalizePath(dest,cwd), n = nodeAt(a); if (!n) return {ok:false,error:'移動元が見つかりません。'};
    if (a === '/' || b.startsWith(a + '/')) return {ok:false,error:'その場所には移動できません。'};
    let final = b; if (nodeAt(b)?.type === 'dir') final = normalizePath(a.split('/').pop(),b);
    if (nodeAt(final)) return {ok:false,error:'移動先に同名の項目があります。'};
    const destInfo = parentAt(final); if (!destInfo?.parent || destInfo.parent.type !== 'dir') return {ok:false,error:'移動先が見つかりません。'};
    const oldInfo = parentAt(a); destInfo.parent.children[destInfo.name] = n; delete oldInfo.parent.children[oldInfo.name]; persistFs(); return {ok:true,path:final};
  }
  function allFilePaths(node = fsRoot, prefix = '') {
    let out = [];
    for (const [name, child] of Object.entries(node.children || {})) { const p = `${prefix}/${name}` || '/'; if (child.type === 'file') out.push(p); else out.push(...allFilePaths(child,p)); }
    return out;
  }
  function countNodes(node = fsRoot) {
    let files=0, dirs=0, size=0;
    for (const child of Object.values(node.children || {})) { if (child.type === 'dir') { dirs++; const c = countNodes(child); files += c.files; dirs += c.dirs; size += c.size; } else { files++; size += bytes(child.content || ''); } }
    return {files,dirs,size};
  }
  function displayPath(path) {
    if (currentOS === 'xp') return 'C:' + normalizePath(path).replace(/^\/home\/user/, '\\Documents and Settings\\User').replace(/\//g,'\\');
    return normalizePath(path);
  }
  function pathName(path) { const p = normalizePath(path, '/'); return p === '/' ? '/' : p.split('/').pop(); }
  function isTextFile(path) { const n = nodeAt(path); return !!n && n.type === 'file'; }
  function fileIcon(name, type) { if (type === 'dir') return '📁'; const ext = name.split('.').pop().toLowerCase(); return ({txt:'📄',md:'📝',js:'🟨',ts:'🟦',json:'🧩',py:'🐍',html:'🌐',css:'🎨',sh:'⌘',command:'⌘',log:'📋',csv:'▦',svg:'🖼️',png:'🖼️',jpg:'🖼️',pdf:'📕',yml:'⚙️',yaml:'⚙️'})[ext] || '📄'; }

  // The selector and startup sequence.
  $$('.system-card').forEach(card => card.addEventListener('click', () => bootInto(card.dataset.os)));
  $('#brand-home').addEventListener('click', e => { e.preventDefault(); returnToChooser(); });
  $('#storage-open').addEventListener('click', openStorageModal);
  $('#about-open').addEventListener('click', openAboutModal);
  $('#modal-root').addEventListener('click', handleModalClick);
  $('#modal-root').addEventListener('submit', handleModalSubmit);
  $('#modal-root').addEventListener('change', handleModalChange);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalRoot.firstElementChild) closeModal(); });

  function bootInto(os) {
    if (!systems[os]) return;
    clearTimeout(bootTimer); currentOS = os;
    chooser.classList.add('hidden'); desktop.classList.add('hidden'); bootScreen.classList.remove('hidden');
    $('#boot-mark').textContent = systems[os].mark; $('#boot-os-name').textContent = systems[os].name.toUpperCase();
    $('#boot-status').textContent = 'INITIALIZING ENVIRONMENT'; $('#boot-progress-fill').style.width = '0%'; $('#boot-percent').textContent = '00%';
    topbarContext.textContent = 'BOOTING ' + systems[os].name.toUpperCase();
    bootStarted = performance.now();
    const statuses = [[0,'INITIALIZING ENVIRONMENT'],[23,'LOADING DESKTOP SERVICES'],[48,'MOUNTING VIRTUAL FILE SYSTEM'],[74,'STARTING USER SESSION'],[92,'PREPARING WORKSPACE']];
    const tick = () => {
      const p = Math.min(100, Math.round((performance.now() - bootStarted) / 1850 * 100));
      $('#boot-progress-fill').style.width = p + '%'; $('#boot-percent').textContent = String(p).padStart(2,'0') + '%';
      const state = [...statuses].reverse().find(x => p >= x[0]); if (state) $('#boot-status').textContent = state[1];
      if (p < 100) bootTimer = setTimeout(tick, 25); else bootTimer = setTimeout(showDesktop, 280);
    }; tick();
  }
  function showDesktop() {
    bootScreen.classList.add('hidden'); desktop.classList.remove('hidden'); desktop.dataset.os = currentOS;
    $('#desktop-wallpaper').style.background = '';
    $('#desktop-edition').textContent = systems[currentOS].edition.toUpperCase(); topbarContext.textContent = systems[currentOS].name.toUpperCase() + ' / SESSION ACTIVE';
    windows = new Map(); winSequence = 0; focusedWindowId = null; recentApps = [];
    renderDesktopIcons(); renderTaskbar(); updateClock();
    if (!settings.seenWelcome) { settings.seenWelcome = true; saveSettings(); setTimeout(() => toast(`${systems[currentOS].name} 風のデスクトップへようこそ。Startからアプリを開けます。`), 350); }
  }
  function returnToChooser() {
    clearTimeout(bootTimer); closeModal(); desktop.classList.add('hidden'); bootScreen.classList.add('hidden'); chooser.classList.remove('hidden');
    topbarContext.textContent = 'SELECT YOUR SYSTEM'; startMenu.classList.add('hidden'); windows.clear(); windowLayer.innerHTML = ''; taskbar.innerHTML=''; currentOS = null;
  }
  $('#desktop').addEventListener('contextmenu', e => {
    if (e.target.closest('.os-window') || e.target.closest('.taskbar') || e.target.closest('.start-menu') || e.target.closest('.desktop-icon')) return;
    e.preventDefault(); showContextMenu(e.clientX,e.clientY,[['＋ New text file',()=>createFileInPath('/home/user')],['📁 Open Files',()=>openWindow('explorer')],['⌘ Open Terminal',()=>openWindow('terminal')],['⚙ Settings',()=>openWindow('settings')],['↺ Refresh desktop',()=>{renderDesktopIcons();toast('デスクトップを更新しました。');}]]);
  });
  function updateClock() {
    const now = new Date(); const time = now.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}); const date = now.toLocaleDateString('ja-JP',{month:'2-digit',day:'2-digit'});
    $('#desktop-clock-top').textContent = time;
    $$('.tray-time-main').forEach(x => x.textContent = time); $$('.tray-date').forEach(x => x.textContent = date);
  }
  setInterval(updateClock, 15000);

  function desktopShortcuts() {
    if (currentOS === 'xp') return [
      ['🖥️','マイ コンピュータ','explorer','/'],['📁','マイ ドキュメント','explorer','/home/user/Documents'],['🌐','Internet Browser','browser'],['⌘','コマンド プロンプト','terminal'],['🗑️','ごみ箱','trash']
    ];
    if (currentOS === 'mint') return [['🗂️','Computer','explorer','/'],['🏠','Home','explorer','/home/user'],['🌐','Web Browser','browser'],['⌘','Terminal','terminal'],['📝','Text Editor','vim','/home/user/Documents/notes.md'],['🗑️','Trash','trash']];
    return [['◈','Workspace','explorer','/home/creator'],['🌐','Browser','browser'],['⌘','Terminal','terminal'],['📝','Vim Editor','vim','/home/user/Documents/notes.md'],['▤','File Cabinet','explorer','/home/user/Documents'],['⚙️','Control Center','settings']];
  }
  function renderDesktopIcons() {
    const root = $('#desktop-icons'); root.innerHTML = '';
    for (const [icon,label,app,path] of desktopShortcuts()) {
      const b = document.createElement('button'); b.className = 'desktop-icon'; b.innerHTML = `<span class="di-art">${icon}</span><span>${esc(label)}</span>`;
      b.addEventListener('click', e => { $$('.desktop-icon').forEach(x=>x.classList.remove('selected')); b.classList.add('selected'); });
      const launch = () => { if (app === 'trash') openTrash(); else if (app === 'explorer') openWindow('explorer',{path:path||'/home/user'}); else if (app==='vim') openWindow('vim',{filename:path}); else openWindow(app); };
      b.addEventListener('dblclick', launch);
      b.addEventListener('pointerup', e => { if (e.pointerType === 'touch') launch(); });
      b.addEventListener('keydown',e=>{if(e.key==='Enter'){launch();}});
      root.append(b);
    }
    root.ondblclick = e => { if (e.target === root) $$('.desktop-icon').forEach(x=>x.classList.remove('selected')); };
  }
  function renderTaskbar() {
    const startLabel = currentOS === 'xp' ? '<span class="start-symbol">⊞</span><span>start</span>' : currentOS === 'mint' ? '<span class="start-symbol">◈</span><span>Menu</span>' : '<span class="start-symbol">◈</span><span>Launcher</span>';
    taskbar.innerHTML = `<button class="start-button" id="start-button">${startLabel}</button><div class="taskbar-apps" id="taskbar-apps"></div><div class="tray"><button class="network-icon" title="Network status">⌁</button><button title="Volume">◖</button><div class="tray-time"><span class="tray-time-main">--:--</span><span class="tray-date">--/--</span></div><button id="tray-storage" title="Storage">▤</button></div>`;
    $('#start-button').addEventListener('click',e=>{e.stopPropagation();startMenu.classList.toggle('hidden');if(!startMenu.classList.contains('hidden'))renderStartMenu();});
    $('#tray-storage').addEventListener('click',openStorageModal);
    taskbar.onclick = e=>{const b=e.target.closest('.taskbar-app');if(!b)return;const id=b.dataset.window;const w=windows.get(id);if(!w)return;if(w.minimized){w.minimized=false;w.el.classList.remove('minimized');focusWindow(id);}else if(focusedWindowId===id){minimizeWindow(id);}else focusWindow(id);};
  }
  function renderTaskApps() {
    const root = $('#taskbar-apps'); if (!root) return; root.innerHTML='';
    for (const [id,w] of windows) {
      const b = document.createElement('button');b.className='taskbar-app'+(focusedWindowId===id&&!w.minimized?' active':'');b.dataset.window=id;b.innerHTML=`<span class="task-icon">${w.icon}</span><span class="task-name">${esc(w.title)}</span>`;root.append(b);
    }
  }
  function renderStartMenu() {
    const isXP=currentOS==='xp'; const user = currentOS==='mint'?'OS World User':currentOS==='xp'?'User':'Creator';
    const items=[['🌐','Web Browser','browser','Open a real website'],['📁','File Manager','explorer','Browse local virtual files'],['⌘','Terminal','terminal','Command line'],['📝','Vim','vim','Modal text editor'],['⚙️','Settings','settings','Storage and system options']];
    startMenu.innerHTML=`<div class="start-profile"><div class="profile-avatar">${systems[currentOS].icon}</div><div class="profile-info"><b>${esc(user)}</b><span>${esc(systems[currentOS].name)} · LOCAL SESSION</span></div></div><div class="start-list">${items.map(([ic,label,app,desc])=>`<button data-start-app="${app}"><span>${ic}</span><span>${label}</span><small>${desc}</small></button>`).join('')}<button data-start-app="storage"><span>▤</span><span>Storage Manager</span><small>BACKUP / RESET</small></button></div><div class="start-bottom"><button data-start-app="switch">⇄ Switch OS</button><button data-start-app="power">⏻ Shut down</button></div>`;
    startMenu.querySelectorAll('[data-start-app]').forEach(b=>b.addEventListener('click',()=>{const app=b.dataset.startApp;startMenu.classList.add('hidden');if(app==='switch')returnToChooser();else if(app==='power')showConfirm('Shut down this session?','セッションを終了してOS選択画面に戻ります。ファイルは保存済みです。','Shut down',returnToChooser);else if(app==='storage')openStorageModal();else if(app==='explorer')openWindow('explorer');else if(app==='vim')openWindow('vim',{filename:'/home/user/Documents/notes.md'});else openWindow(app);}));
  }

  const appDefs = {
    browser:{title:'Web Browser',icon:'🌐',size:[850,570]}, explorer:{title:'File Manager',icon:'📁',size:[760,510]}, terminal:{title:'Terminal',icon:'⌘',size:[760,470]}, vim:{title:'Vim',icon:'📝',size:[780,540]}, settings:{title:'Settings',icon:'⚙️',size:[650,520]}, about:{title:'About OS World',icon:'◈',size:[510,390]}
  };
  function openWindow(type, opts = {}) {
    if (!currentOS) { toast('先にOSを起動してください。',true); return; }
    if (type === 'trash') { openTrash(); return; }
    if (!appDefs[type]) type='about';
    const winId = 'w' + (++winSequence);
    const def = appDefs[type];
    let title = def.title;
    if (type==='terminal') title = currentOS==='xp'?'Command Prompt':currentOS==='mint'?'Terminal':'OS World Shell';
    if(type==='explorer') title = currentOS==='xp'?'Windows Explorer':currentOS==='mint'?'Files':'File Cabinet';
    if(type==='browser') title=currentOS==='xp'?'Internet Explorer · Web Gateway':currentOS==='mint'?'Web Browser':'OS World Browser';
    if(type==='vim') title=`Vim — ${pathName(opts.filename||'/home/user/Documents/notes.md')}`;
    const w={id:winId,type,title,icon:def.icon,opts,minimized:false,maximized:false,normalRect:null,cwd:opts.path?normalizePath(opts.path):'/home/user',history:[],browserHistory:[],browserIndex:-1,editor:null};
    const el=document.createElement('section');el.className='os-window';el.dataset.window=winId;el.dataset.app=type;el.style.width=`min(${def.size[0]}px, calc(100vw - 36px))`;el.style.height=`min(${def.size[1]}px, calc(100% - 36px))`;el.style.zIndex=String(++zIndex);
    el.innerHTML=`<div class="window-titlebar"><div class="window-title"><span class="window-app-icon">${def.icon}</span><span class="window-title-text">${esc(title)}</span></div><div class="window-controls"><button data-window-action="minimize" title="最小化">−</button><button data-window-action="maximize" title="最大化">□</button><button class="close" data-window-action="close" title="閉じる">×</button></div></div><div class="window-content" data-window-content></div>${type==='terminal'?'<div class="window-statusbar"><span>LOCAL VIRTUAL SHELL</span><span>UTF-8</span></div>':type==='explorer'?'<div class="window-statusbar"><span class="explorer-status-left">Ready</span><span>LOCAL STORAGE</span></div>':''}`;
    w.el=el;w.content=$('[data-window-content]',el); windows.set(winId,w); windowLayer.append(el);
    renderApp(w); focusWindow(winId); makeDraggable(w); wireWindowControls(w); renderTaskApps();
    recentApps=[type,...recentApps.filter(x=>x!==type)].slice(0,4);
    if(type==='terminal'){lastFocusedTerminal=winId;setTimeout(()=>$('.terminal-input',el)?.focus(),40);}
    return winId;
  }
  function focusWindow(id) {
    const w=windows.get(id); if(!w)return;
    if(focusedWindowId&&windows.get(focusedWindowId))windows.get(focusedWindowId).el.classList.remove('focused');
    focusedWindowId=id;w.minimized=false;w.el.classList.remove('minimized');w.el.style.zIndex=String(++zIndex);w.el.classList.add('focused');startMenu.classList.add('hidden');renderTaskApps();
  }
  function minimizeWindow(id) {const w=windows.get(id);if(!w)return;w.minimized=true;w.el.classList.add('minimized');if(focusedWindowId===id)focusedWindowId=null;renderTaskApps();}
  function closeWindow(id) {const w=windows.get(id);if(!w)return;if(w.type==='vim'&&w.editor?.dirty){showConfirm('Unsaved changes','Vimに保存していない変更があります。保存しないで閉じますか？','Close without saving',()=>reallyCloseWindow(id),'Cancel');return;}reallyCloseWindow(id);}
  function reallyCloseWindow(id) {const w=windows.get(id);if(!w)return;w.el.remove();windows.delete(id);if(focusedWindowId===id)focusedWindowId=null;const remaining=[...windows.values()].filter(x=>!x.minimized).sort((a,b)=>Number(b.el.style.zIndex)-Number(a.el.style.zIndex))[0];if(remaining)focusWindow(remaining.id);else renderTaskApps();}
  function maximizeWindow(id) {const w=windows.get(id);if(!w)return;if(!w.maximized){w.normalRect={left:w.el.style.left,top:w.el.style.top,width:w.el.style.width,height:w.el.style.height,transform:w.el.style.transform};w.maximized=true;w.el.classList.add('maximized');w.el.style.left='0';w.el.style.top='0';}else{w.maximized=false;w.el.classList.remove('maximized');const r=w.normalRect||{};w.el.style.left=r.left||'';w.el.style.top=r.top||'';w.el.style.width=r.width||'';w.el.style.height=r.height||'';w.el.style.transform=r.transform||'';} }
  function wireWindowControls(w) {
    w.el.addEventListener('pointerdown',e=>{if(e.target.closest('.window-titlebar')||e.target.closest('button'))return;focusWindow(w.id);});
    w.el.querySelectorAll('[data-window-action]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const a=b.dataset.windowAction;if(a==='close')closeWindow(w.id);if(a==='minimize')minimizeWindow(w.id);if(a==='maximize')maximizeWindow(w.id);}));
    w.el.querySelector('.window-titlebar').addEventListener('dblclick',e=>{if(e.target.closest('.window-controls'))return;maximizeWindow(w.id);});
  }
  function makeDraggable(w) {
    const bar=w.el.querySelector('.window-titlebar');let drag=null;
    bar.addEventListener('pointerdown',e=>{if(e.target.closest('.window-controls')||w.maximized)return;focusWindow(w.id);const layerRect=windowLayer.getBoundingClientRect();const rect=w.el.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:rect.left-layerRect.left,top:rect.top-layerRect.top};bar.setPointerCapture(e.pointerId);e.preventDefault();});
    bar.addEventListener('pointermove',e=>{if(!drag)return;const lr=windowLayer.getBoundingClientRect();const width=w.el.offsetWidth,height=w.el.offsetHeight;const left=Math.max(-width+110,Math.min(lr.width-75,drag.left+e.clientX-drag.x));const top=Math.max(0,Math.min(lr.height-40,drag.top+e.clientY-drag.y));w.el.style.left=left+'px';w.el.style.top=top+'px';w.el.style.transform='none';});
    const end=()=>{drag=null;};bar.addEventListener('pointerup',end);bar.addEventListener('pointercancel',end);
  }
  function renderApp(w) {
    if(w.type==='browser') renderBrowser(w);
    else if(w.type==='explorer') renderExplorer(w,w.opts.path||'/home/user');
    else if(w.type==='terminal') renderTerminal(w);
    else if(w.type==='vim') renderVim(w,w.opts.filename||'/home/user/Documents/notes.md');
    else if(w.type==='settings') renderSettings(w);
    else renderAboutApp(w);
  }

  // Browser window: uses the browser engine for embedded sites and provides a one-click real-tab fallback.
  function renderBrowser(w) {
    w.content.innerHTML=`<div class="browser-layout"><div class="browser-toolbar"><button class="tool-btn" data-browser="back" title="戻る">←</button><button class="tool-btn" data-browser="forward" title="進む">→</button><button class="tool-btn" data-browser="reload" title="再読み込み">↻</button><input class="app-input address" data-browser-address aria-label="URL" placeholder="https://example.com" value=""><button class="tool-btn primary" data-browser="go">Go</button><button class="tool-btn" data-browser="external" title="ユーザーのブラウザで開く">↗ <span class="go-external-label">Open</span></button></div><div class="browser-webview"><div class="browser-empty" data-browser-empty><div class="browser-globe">◎</div><h3>Explore the open web.</h3><p>URLを入力してWebサイトを開きます。埋め込みを拒否するサイトは、右上の「Open」から通常のブラウザタブで表示できます。</p><div class="browser-shortcuts"><button data-quick-url="https://www.wikipedia.org">Wikipedia</button><button data-quick-url="https://developer.mozilla.org">MDN Web Docs</button><button data-quick-url="https://github.com">GitHub</button></div></div><iframe class="browser-iframe hidden" data-browser-frame title="Web content" referrerpolicy="no-referrer" loading="lazy" allow="fullscreen; clipboard-read; clipboard-write"></iframe></div><div class="browser-info" data-browser-info>Ready. 外部サイトの表示は接続先の埋め込み制限に従います。</div></div>`;
    const address=$('[data-browser-address]',w.content);
    w.content.querySelectorAll('[data-browser]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.browser;if(a==='go')navigateBrowser(w,address.value);if(a==='external')openExternal(w,address.value);if(a==='reload')reloadBrowser(w);if(a==='back')stepBrowser(w,-1);if(a==='forward')stepBrowser(w,1);}));
    address.addEventListener('keydown',e=>{if(e.key==='Enter')navigateBrowser(w,address.value);});
    w.content.querySelectorAll('[data-quick-url]').forEach(b=>b.addEventListener('click',()=>navigateBrowser(w,b.dataset.quickUrl)));
  }
  function safeUrl(raw) {
    let value=String(raw||'').trim();if(!value)return null;
    if(!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value))value='https://'+value;
    try {const u=new URL(value);if(!['http:','https:'].includes(u.protocol))return null;return u.href;} catch {return null;}
  }
  function navigateBrowser(w, raw, addHistory=true) {
    const url=safeUrl(raw);if(!url){toast('http:// または https:// で始まるURLを入力してください。',true);return;}
    const address=$('[data-browser-address]',w.content);address.value=url;
    const frame=$('[data-browser-frame]',w.content);frame.classList.remove('hidden');$('[data-browser-empty]',w.content).classList.add('hidden');frame.src=url;
    if(addHistory){w.browserHistory=w.browserHistory.slice(0,w.browserIndex+1);w.browserHistory.push(url);w.browserIndex=w.browserHistory.length-1;}
    $('[data-browser-info]',w.content).textContent=`Loading ${url} · サイト側の設定により、この枠内で表示できない場合があります。`;
  }
  function openExternal(w, raw) {const url=safeUrl(raw);if(!url){toast('先に有効なWeb URLを入力してください。',true);return;}const opened=window.open(url,'_blank');if(opened){opened.opener=null;toast('通常のブラウザタブで開きました。');}else toast('ポップアップがブロックされました。ブラウザの設定で新しいタブを許可してください。',true);}
  function reloadBrowser(w) {const frame=$('[data-browser-frame]',w.content);if(frame&&!frame.classList.contains('hidden')){const url=frame.src;frame.src='about:blank';setTimeout(()=>frame.src=url,20);}}
  function stepBrowser(w,delta) {const index=w.browserIndex+delta;if(index<0||index>=w.browserHistory.length)return;w.browserIndex=index;navigateBrowser(w,w.browserHistory[index],false);}

  // Virtual file manager.
  function renderExplorer(w, path) {
    if (explorerSelected?.windowId === w.id) explorerSelected = null;
    w.cwd=normalizePath(path||'/home/user'); if(nodeAt(w.cwd)?.type!=='dir')w.cwd='/home/user';
    const here=nodeAt(w.cwd);const entries=Object.entries(here.children||{}).sort((a,b)=>a[1].type===b[1].type?a[0].localeCompare(b[0]):a[1].type==='dir'?-1:1);
    const favorites=[['🏠','Home','/home/user'],['🖥️','Desktop','/home/user/Desktop'],['📄','Documents','/home/user/Documents'],['⬇️','Downloads','/home/user/Downloads'],['🧰','Projects','/home/user/Projects'],['💽','System','/System']];
    w.content.innerHTML=`<div class="explorer-layout"><div class="explorer-nav"><button class="tool-btn" data-explorer="up" title="上へ">↑</button><input class="app-input path" data-explorer-path value="${esc(displayPath(w.cwd))}" aria-label="Path"><button class="tool-btn" data-explorer="go">Go</button></div><div class="app-toolbar"><button class="tool-btn" data-explorer="newfile">＋ File</button><button class="tool-btn" data-explorer="newfolder">📁 Folder</button><button class="tool-btn" data-explorer="upload">↑ Import</button><button class="tool-btn" data-explorer="download">↓ Export</button><button class="tool-btn danger" data-explorer="delete">Delete</button><input class="hidden" type="file" data-explorer-upload multiple></div><div class="explorer-main"><aside class="explorer-sidebar">${favorites.map(([i,n,p])=>`<button data-folder="${p}" class="${normalizePath(p)===w.cwd?'active':''}"><span>${i}</span><span>${n}</span></button>`).join('')}<div class="section-label" style="padding:12px 8px 5px">LOCAL</div><button data-folder="/"><span>💽</span><span>File system</span></button><button data-folder="/tmp"><span>🧪</span><span>tmp</span></button></aside><div class="explorer-content"><h3 class="explorer-heading">${esc(pathName(w.cwd)==='/'?'File System':pathName(w.cwd))}</h3><div class="file-grid" data-file-grid>${entries.map(([name,n])=>`<button class="file-tile" data-file-name="${esc(name)}" data-file-type="${n.type}" title="${esc(name)}"><span class="file-icon">${fileIcon(name,n.type)}</span><span>${esc(name)}</span>${n.type==='file'?`<small>${formatBytes(bytes(n.content||''))}</small>`:''}</button>`).join('')}</div>${entries.length?'':`<div class="explorer-empty">このフォルダは空です。<br>「＋ File」または「📁 Folder」から始めましょう。</div>`}</div></div></div>`;
    const pathInput=$('[data-explorer-path]',w.content);pathInput.addEventListener('keydown',e=>{if(e.key==='Enter')explorerGo(w,pathInput.value);});
    w.content.querySelectorAll('[data-folder]').forEach(b=>b.addEventListener('click',()=>renderExplorer(w,b.dataset.folder)));
    w.content.querySelectorAll('[data-file-name]').forEach(b=>{
      b.addEventListener('click',()=>{w.content.querySelectorAll('.file-tile').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');explorerSelected={windowId:w.id,path:normalizePath(b.dataset.fileName,w.cwd),name:b.dataset.fileName,type:b.dataset.fileType};const st=w.el.querySelector('.explorer-status-left');if(st)st.textContent=`${b.dataset.fileName} selected`;});
      b.addEventListener('dblclick',()=>{const p=normalizePath(b.dataset.fileName,w.cwd);if(b.dataset.fileType==='dir')renderExplorer(w,p);else openWindow('vim',{filename:p});});
      b.addEventListener('contextmenu',e=>{e.preventDefault();const p=normalizePath(b.dataset.fileName,w.cwd);showContextMenu(e.clientX,e.clientY,[['Open / Edit',()=>b.dataset.fileType==='dir'?renderExplorer(w,p):openWindow('vim',{filename:p})],['Rename',()=>renameDialog(p,w)],['Download',()=>downloadVirtualFile(p)],['Delete',()=>showConfirm('Delete item?',`「${pathName(p)}」を仮想ファイルシステムから削除します。`,'Delete',()=>{removePath(p);renderExplorer(w,w.cwd);toast('削除しました。');})]]);});
    });
    w.content.querySelectorAll('[data-explorer]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.explorer;if(a==='up')renderExplorer(w,normalizePath('..',w.cwd));if(a==='go')explorerGo(w,pathInput.value);if(a==='newfile')createFileInPath(w.cwd,()=>renderExplorer(w,w.cwd));if(a==='newfolder')createFolderInPath(w.cwd,()=>renderExplorer(w,w.cwd));if(a==='upload')$('[data-explorer-upload]',w.content).click();if(a==='download')downloadFolderJson(w.cwd);if(a==='delete'){if(explorerSelected?.windowId===w.id)showConfirm('Delete item?',`「${pathName(explorerSelected.path)}」を削除します。`,'Delete',()=>{removePath(explorerSelected.path);explorerSelected=null;renderExplorer(w,w.cwd);});else toast('先に削除する項目を選択してください。',true);}}));
    $('[data-explorer-upload]',w.content).addEventListener('change',async e=>{const files=[...e.target.files];for(const f of files){const text=await f.text();const res=writeFile(normalizePath(f.name,w.cwd),text,{cwd:w.cwd});if(!res.ok)toast(res.error,true);}renderExplorer(w,w.cwd);toast(`${files.length} 個のファイルを取り込みました。`);});
  }
  function explorerGo(w, value) {const p=normalizePath(value,w.cwd);if(nodeAt(p)?.type!=='dir'){toast('ディレクトリが見つかりません。',true);return;}renderExplorer(w,p);}
  function createFileInPath(path='/home/user', after) {showModal('Create a text file','新しいテキストファイルを仮想ファイルシステムに作成します。',`<form class="modal-form" id="create-file-form"><label>File name<input required name="name" value="untitled.txt" autocomplete="off"></label><label>Initial content<textarea name="content" placeholder="Start writing…"></textarea></label><input type="hidden" name="path" value="${esc(normalizePath(path))}"></form>`,[{label:'Cancel',action:'close'},{label:'Create file',action:'submit',primary:true,form:'create-file-form'}]);pendingModalSubmit=async form=>{const fd=new FormData(form);const name=String(fd.get('name')).trim();const parent=normalizePath(String(fd.get('path')));if(!name||name.includes('/')||name.includes('\\')){toast('ファイル名が不正です。',true);return false;}const full=normalizePath(name,parent);if(nodeAt(full)){toast('同名の項目が存在します。',true);return false;}const r=writeFile(full,String(fd.get('content')||''));if(!r.ok){toast(r.error,true);return false;}closeModal();after?.();toast(`${name} を作成しました。`);if(!after)openWindow('vim',{filename:full});return true;}; }
  let pendingModalSubmit = null;
  function createFolderInPath(path, after) {showModal('Create a folder','このディレクトリに新しいフォルダを作成します。',`<form class="modal-form" id="create-folder-form"><label>Folder name<input required name="name" value="New folder" autocomplete="off"></label><input type="hidden" name="path" value="${esc(normalizePath(path))}"></form>`,[{label:'Cancel',action:'close'},{label:'Create folder',action:'submit',primary:true,form:'create-folder-form'}]);pendingModalSubmit=form=>{const fd=new FormData(form);const name=String(fd.get('name')).trim();const base=normalizePath(String(fd.get('path')));if(!name||name.includes('/')||name.includes('\\')){toast('フォルダ名が不正です。',true);return false;}const res=makeDir(normalizePath(name,base));if(!res.ok){toast(res.error,true);return false;}closeModal();after?.();toast('フォルダを作成しました。');return true;};}
  function renameDialog(path,w) {showModal('Rename item',`名前を変更します。<br><strong>${esc(path)}</strong>`,`<form class="modal-form" id="rename-form"><label>New name<input required name="name" value="${esc(pathName(path))}" autocomplete="off"></label><input type="hidden" name="path" value="${esc(path)}"></form>`,[{label:'Cancel',action:'close'},{label:'Rename',action:'submit',primary:true,form:'rename-form'}]);pendingModalSubmit=form=>{const fd=new FormData(form);const name=String(fd.get('name')).trim();const res=renamePath(String(fd.get('path')),name);if(!res.ok){toast(res.error,true);return false;}closeModal();renderExplorer(w,w.cwd);toast('名前を変更しました。');return true;};}
  function downloadVirtualFile(path) {const n=nodeAt(path);if(!n||n.type!=='file'){toast('ダウンロードできるファイルではありません。',true);return;}downloadBlob(n.content||'',pathName(path),'text/plain;charset=utf-8');}
  function downloadFolderJson(path) {const n=nodeAt(path);if(!n||n.type!=='dir'){toast('フォルダが見つかりません。',true);return;}downloadBlob(JSON.stringify({path,exportedAt:new Date().toISOString(),content:n},null,2),`${pathName(path)==='/'?'root':pathName(path)}-osworld.json`,'application/json');}
  function downloadBlob(content,filename,mime) {const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}

  // Terminal emulator: virtual commands, not host shell access.
  const COMMAND_HELP = [
    'File: ls, dir, pwd, cd, tree, mkdir, touch, cat, type, echo, cp, mv, rm, del, rmdir, find, grep, head, tail, wc',
    'Tools: vim, vi, nano, notepad, browser, open, start, clear, cls, history, help, man, which, where, date, whoami, hostname, uname',
    'System: df, du, free, uptime, env, printenv, ipconfig, ifconfig, ping, ver, neofetch, calc, reboot, exit',
    'Extras: sudo (simulated), apt (simulated), git (limited demo), npm (limited demo), python (not executed)',
    '', 'Note: commands operate only on OS World virtual files. This is not a real shell and cannot run arbitrary programs.'
  ];
  function renderTerminal(w) {
    w.content.innerHTML=`<div class="terminal-layout"><div class="terminal-head"><i class="terminal-dot"></i><i class="terminal-dot"></i><i class="terminal-dot"></i><span style="margin-left:6px">${esc(w.title)}</span><span style="margin-left:auto">${currentOS==='xp'?'C:\\': 'bash'} · UTF-8</span></div><div class="terminal-output" data-terminal-output></div><form class="terminal-prompt-row" data-terminal-form style="padding:0 14px 12px"><span class="terminal-prompt" data-terminal-prompt></span><input class="terminal-input" data-terminal-input autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Command input"></form><div class="terminal-help">Type <b>help</b> for commands · <b>vim file.txt</b> opens Vim · local virtual filesystem only</div></div>`;
    const output=$('[data-terminal-output]',w.content);appendTerm(w,`${systems[currentOS].name} [OS World virtual session]`, 'system');appendTerm(w,`Type "help" to see available commands.`, 'muted');updatePrompt(w);
    const form=$('[data-terminal-form]',w.content);const input=$('[data-terminal-input]',w.content);
    form.addEventListener('submit',e=>{e.preventDefault();const cmd=input.value;input.value='';const prompt=terminalPrompt(w);appendTerm(w,`${prompt} ${cmd}`);if(cmd.trim()){w.history.push(cmd);w.historyIndex=w.history.length;executeCommand(w,cmd);}updatePrompt(w);output.scrollTop=output.scrollHeight;input.focus();});
    input.addEventListener('keydown',e=>{if(e.key==='ArrowUp'){e.preventDefault();w.historyIndex=Math.max(0,(w.historyIndex??w.history.length)-1);input.value=w.history[w.historyIndex]||'';setTimeout(()=>input.setSelectionRange(input.value.length,input.value.length),0);}if(e.key==='ArrowDown'){e.preventDefault();w.historyIndex=Math.min(w.history.length,(w.historyIndex??w.history.length)+1);input.value=w.history[w.historyIndex]||'';}if(e.key==='Tab'){e.preventDefault();const val=input.value;const prefix=val.split(/\s+/).pop();const base=normalizePath(w.cwd);const n=nodeAt(base);const choices=Object.entries(n?.children||{}).map(x=>x[0]).filter(x=>x.startsWith(prefix));if(choices.length===1)input.value=val.slice(0,val.length-prefix.length)+choices[0]+(n.children[choices[0]].type==='dir'?'/':'');}});
  }
  function terminalPrompt(w) {const cwd=w.cwd||'/home/user';if(currentOS==='xp'){const shown=cwd==='/home/user'?'C:\\Documents and Settings\\User':'C:'+cwd.replace(/^\/home\/user/,'\\Documents and Settings\\User').replace(/\//g,'\\');return `${shown}>`;}return `${currentOS==='studio'?'creator':'user'}@os-world:${cwd.replace(/^\/home\/(user|creator)/,'~')}$`;}
  function updatePrompt(w) {const p=$('[data-terminal-prompt]',w.content);if(p)p.textContent=terminalPrompt(w);}
  function appendTerm(w,text,cls='') {const output=$('[data-terminal-output]',w.content);if(!output)return;const line=document.createElement('div');line.className='terminal-line'+(cls?' '+cls:'');line.textContent=String(text);output.append(line);output.scrollTop=output.scrollHeight;}
  function appendTermMany(w,lines,cls='') {for(const line of lines)appendTerm(w,line,cls);}
  function splitArgs(input) {const arr=[];let token="",quote=null;for(let i=0;i<input.length;i++){const ch=input[i];if(ch==="\\"&&quote!=="'"){const next=input[i+1];if(next&&( /\s/.test(next)||next==="\""||next==="'"||next==="\\")){token+=next;i++;}else token+="\\";continue;}if(quote){if(ch===quote)quote=null;else token+=ch;continue;}if(ch==="\""||ch==="'"){quote=ch;continue;}if(/\s/.test(ch)){if(token){arr.push(token);token="";}}else token+=ch;}if(token)arr.push(token);return arr;}
  function splitRedirect(raw) {const m=raw.match(/^(.*?)\s*(>>|>)\s*(.+)$/);return m?{command:m[1].trim(),op:m[2],target:m[3].trim().replace(/^['"]|['"]$/g,'')}:null;}
  function executeCommand(w, raw) {
    let input=String(raw).trim();if(!input)return;
    const redirect=splitRedirect(input);if(redirect){const rendered=executeCommandToText(w,redirect.command);const path=normalizePath(redirect.target,w.cwd);const prior=nodeAt(path);const content=redirect.op==='>>'&&prior?.type==='file'?prior.content+rendered:rendered;const r=writeFile(path,content,{cwd:w.cwd});if(!r.ok)appendTerm(w,r.error,'error');return;}
    // Support a conservative sequence of commands joined with &&.
    const parts=input.split(/\s+&&\s+/);for(const part of parts){const result=runSingleCommand(w,part.trim());if(result==='__EXIT__')break;}
  }
  function executeCommandToText(w, raw) {
    const before=$('[data-terminal-output]',w.content)?.innerText||'';runSingleCommand(w,raw);const after=$('[data-terminal-output]',w.content)?.innerText||'';return after.slice(before.length).replace(/^\n/,'');
  }
  function runSingleCommand(w, raw) {
    const args=splitArgs(raw);if(!args.length)return;let command=args.shift();const lower=command.toLowerCase();const argPath = x=>normalizePath(x,w.cwd);
    const fail=msg=>appendTerm(w,msg,'error');const out=msg=>appendTerm(w,msg);const outLines=arr=>appendTermMany(w,arr);const node=path=>nodeAt(argPath(path||'.'));
    if(lower==='help'||lower==='man'){outLines(COMMAND_HELP);return;}
    if(lower==='clear'||lower==='cls'){const o=$('[data-terminal-output]',w.content);o.innerHTML='';return;}
    if(lower==='pwd'){out(displayPath(w.cwd));return;}
    if(lower==='cd'){if(!args[0]){out(displayPath(w.cwd));return;}const p=argPath(args.join(' '));if(nodeAt(p)?.type!=='dir'){fail('cd: ディレクトリが見つかりません: '+args.join(' '));return;}w.cwd=p;updatePrompt(w);return;}
    if(lower==='ls'||lower==='dir'){const p=args[0]?argPath(args[0]):w.cwd;const n=nodeAt(p);if(!n||n.type!=='dir'){fail('ディレクトリが見つかりません。');return;}const names=Object.entries(n.children).sort((a,b)=>a[1].type===b[1].type?a[0].localeCompare(b[0]):a[1].type==='dir'?-1:1);if(!names.length){out('(empty directory)');return;}if(lower==='dir'&&currentOS==='xp'){out(` Directory of ${displayPath(p)}`);out('');for(const [name,c] of names)out(`${c.type==='dir'?'[DIR] ':String((c.content||'').length).padStart(6)+' '} ${name}`);}else out(names.map(([name,c])=>`${c.type==='dir'?'📁 ':''}${name}${c.type==='dir'?'/':''}`).join('    '));return;}
    if(lower==='tree'){const start=argPath(args[0]||'.');const n=nodeAt(start);if(!n||n.type!=='dir'){fail('tree: not a directory');return;}const lines=[pathName(start)];const walk=(obj,prefix)=>{const entries=Object.entries(obj.children||{});entries.forEach(([name,c],i)=>{const last=i===entries.length-1;lines.push(prefix+(last?'└── ':'├── ')+name+(c.type==='dir'?'/':''));if(c.type==='dir')walk(c,prefix+(last?'    ':'│   '));});};walk(n,'');outLines(lines);return;}
    if(lower==='mkdir'||lower==='md'){if(!args.length){fail('Usage: mkdir <name>');return;}for(const p of args){const res=makeDir(p,w.cwd);res.ok?out('created directory: '+res.path):fail(res.error);}return;}
    if(lower==='touch'){if(!args.length){fail('Usage: touch <file>');return;}for(const p of args){if(nodeAt(argPath(p))){if(nodeAt(argPath(p)).type==='dir')fail(`${p}: is a directory`);else out(`${p}: already exists`);}else{const r=writeFile(p,'',{cwd:w.cwd});r.ok?out(`created ${r.path}`):fail(r.error);}}return;}
    if(lower==='echo'){out(args.join(' '));return;}
    if(['cat','type','more'].includes(lower)){if(!args.length){fail(`Usage: ${lower} <file>`);return;}for(const p of args){const n=nodeAt(argPath(p));if(!n||n.type!=='file'){fail(`${p}: ファイルが見つかりません。`);continue;}appendTermMany(w,(n.content||'').replace(/\n$/,'').split('\n'));}return;}
    if(lower==='vim'||lower==='vi'||lower==='nano'||lower==='notepad'){const filename=args[0]?argPath(args[0]):argPath('untitled.txt');if(nodeAt(filename)?.type==='dir'){fail('指定したパスはディレクトリです。');return;}if(!nodeAt(filename))writeFile(filename,'');appendTerm(w,`Opening Vim: ${displayPath(filename)}`,'system');openWindow('vim',{filename});return;}
    if(lower==='rm'||lower==='del'||lower==='erase'||lower==='rmdir'){if(!args.length){fail(`Usage: ${lower} <path>`);return;}const recursive=args.some(x=>['-r','-rf','-fr','/s'].includes(x));const targets=args.filter(x=>!['-r','-rf','-fr','-f','/s','/q'].includes(x));if(!targets.length){fail(`Usage: ${lower} <path>`);return;}for(const p of targets){const target=argPath(p);const n=nodeAt(target);if(!n){fail(`${p}: ファイルが見つかりません。`);continue;}if(n.type==='dir'&&Object.keys(n.children).length&&(lower==='rmdir'||!recursive)){fail(`${p}: ディレクトリが空ではありません（rm -r ${p} で再帰削除）`);continue;}const r=removePath(target);r.ok?out(`removed ${p}`):fail(r.error);}return;}
    if(lower==='cp'||lower==='copy'){if(args.length<2){fail('Usage: cp <source> <destination>');return;}const r=clonePath(args[0],args[1],w.cwd);r.ok?out(`copied to ${r.path}`):fail(r.error);return;}
    if(lower==='mv'||lower==='move'){if(args.length<2){fail('Usage: mv <source> <destination>');return;}const r=movePath(args[0],args[1],w.cwd);r.ok?out(`moved to ${r.path}`):fail(r.error);return;}
    if(lower==='ren'||lower==='rename'){if(args.length<2){fail('Usage: ren <path> <new-name>');return;}const r=renamePath(args[0],args[1],w.cwd);r.ok?out('renamed successfully'):fail(r.error);return;}
    if(lower==='find'){const needle=args[0];if(!needle){fail('Usage: find <text> [path]');return;}const base=args[1]?argPath(args[1]):'/';const matches=allFilePaths().filter(p=>p.startsWith(base==='/'?'/':base+'/')||p===base).filter(p=>(nodeAt(p).content||'').includes(needle));outLines(matches.length?matches:['No matches found.']);return;}
    if(lower==='grep'){if(args.length<2){fail('Usage: grep <text> <file>');return;}const pattern=args.shift();for(const p of args){const n=nodeAt(argPath(p));if(!n||n.type!=='file'){fail(`grep: ${p}: no such file`);continue;}const lines=(n.content||'').split('\n').map((s,i)=>({s,i})).filter(x=>x.s.includes(pattern));for(const x of lines)out(`${p}:${x.i+1}:${x.s}`);}return;}
    if(lower==='head'||lower==='tail'){const countArg=args.find(x=>x.startsWith('-n'));let count=countArg?Number(countArg.replace('-n',''))||10:10;const p=args.find(x=>!x.startsWith('-'));const n=nodeAt(argPath(p||''));if(!n||n.type!=='file'){fail(`${lower}: file not found`);return;}const lines=(n.content||'').split('\n');outLines((lower==='head'?lines.slice(0,count):lines.slice(-count)));return;}
    if(lower==='wc'){if(!args[0]){fail('Usage: wc <file>');return;}const n=nodeAt(argPath(args[0]));if(!n||n.type!=='file'){fail('wc: file not found');return;}const text=n.content||'';out(`${text.split('\n').length- (text.endsWith('\n')?1:0)} lines, ${text.trim()?text.trim().split(/\s+/).length:0} words, ${bytes(text)} bytes`);return;}
    if(lower==='date'){out(new Date().toString());return;}
    if(lower==='whoami'){out(currentOS==='xp'?'OS-WORLD\\User':systems[currentOS].user);return;}
    if(lower==='hostname'){out('os-world');return;}
    if(lower==='uname'){out(args.includes('-a')?'OS-World browser-lab 1.0 virtual-session x86_64 JavaScript':currentOS==='mint'?'Linux':'OS-World');return;}
    if(lower==='ver'){out('OS World browser session [version 1.0]');return;}
    if(lower==='history'){outLines((w.history||[]).map((h,i)=>`${String(i+1).padStart(4)}  ${h}`));return;}
    if(lower==='which'||lower==='where'){const known=['ls','dir','cd','pwd','mkdir','touch','cat','type','vim','vi','nano','grep','find','cp','mv','rm','echo','clear','help','git','npm','python','browser'];for(const c of args){out(known.includes(c.toLowerCase())?`/usr/bin/${c}`:`${c}: not found`);}return;}
    if(lower==='env'||lower==='printenv'){outLines([`HOME=/home/${systems[currentOS].user}`,`USER=${systems[currentOS].user}`,'SHELL=/bin/bash','TERM=xterm-256color','OS_WORLD=1','PATH=/usr/local/bin:/usr/bin:/bin']);return;}
    if(lower==='df'){out('Filesystem       Size  Used Avail Use% Mounted on');out(`virtual-storage  5.0G  ${(countNodes().size/1024/1024).toFixed(1)}M  ${(5120-countNodes().size/1024/1024).toFixed(1)}M   1% /`);return;}
    if(lower==='du'){const target=argPath(args[0]||'.');const n=nodeAt(target);if(!n){fail('du: path not found');return;}const size=JSON.stringify(n).length;out(`${(size/1024).toFixed(1)}K\t${target}`);return;}
    if(lower==='free'){out('               total        used        free');out('Memory:        8192M       2410M       5782M');out('Swap:          2048M          0M       2048M');out('(simulated values)');return;}
    if(lower==='uptime'){out(`up ${Math.max(1,Math.floor((performance.now()/1000)/60))} min, 1 user, load average: 0.08, 0.04, 0.01 (simulated)`);return;}
    if(lower==='ipconfig'||lower==='ifconfig'||lower==='ip'){out('Network adapter (simulated)');out('  IPv4 address . . . . . . : 192.168.1.42');out('  Gateway . . . . . . . . : 192.168.1.1');out('  Status . . . . . . . . . : browser-managed');return;}
    if(lower==='ping'){const host=args[args.length-1]||'example.com';out(`PING ${host} (93.184.216.34): 56 data bytes`);out('Reply: 64 bytes, time=24ms (simulated)');out('This network command is a visual demo; no ICMP packets were sent.');return;}
    if(lower==='neofetch'){outLines([`        ◈◈◈◈◈          ${systems[currentOS].name}`,`      ◈◈    ◈◈        ─────────────────`, `     ◈  ◈◈◈◈  ◈       OS: OS World Browser Lab`, `     ◈  ◈  ◈  ◈       Kernel: Browser sandbox`, `      ◈◈    ◈◈        Shell: ${systems[currentOS].command}`, `        ◈◈◈◈◈          Files: ${countNodes().files}`, `                       Storage: LocalStorage`]);return;}
    if(lower==='calc'||lower==='expr'){const expression=args.join(' ');if(!/^[\d\s()+*/%.\-]+$/.test(expression)){fail('calc: 数式は数字と + - * / % () のみ対応しています。');return;}try{const result=Function('"use strict";return ('+expression+')')();if(Number.isFinite(result))out(String(result));else fail('invalid expression');}catch{fail('invalid expression');}return;}
    if(lower==='browser'||lower==='open'||lower==='start'){if(args[0]&&/^https?:|^[\w.-]+\.[a-z]{2,}/i.test(args[0])){let id=[...windows.values()].find(x=>x.type==='browser')?.id||openWindow('browser');const bw=windows.get(id);const url=args.join(' ');navigateBrowser(bw,url);openExternal(bw,url);}else if(!args.length){openWindow('browser');out('Browser opened.');}else{const app=args[0].toLowerCase();if(['terminal','cmd','powershell'].includes(app)){openWindow('terminal');}else if(['explorer','files','file-manager'].includes(app)){openWindow('explorer');}else if(['settings','control'].includes(app)){openWindow('settings');}else if(['notepad','vim'].includes(app)){openWindow('vim',{filename:args[1]?argPath(args[1]):argPath('untitled.txt')});}else{fail(`start: 未対応のアプリまたはURL: ${args.join(' ')}`);}}return;}
    if(lower==='sudo'){if(!args.length){out('Usage: sudo <command> (simulated administrator mode)');return;}out('[sudo] simulated authentication accepted');if(['apt','apt-get'].includes(args[0])){out('Package manager actions are simulated. No software is installed.');return;}const inner=args.join(' ');runSingleCommand(w,inner);return;}
    if(lower==='apt'||lower==='apt-get'){if(args.includes('update')){out('Hit:1 https://packages.example.invalid stable InRelease');out('Reading package lists... Done');out('All package operations are simulated in this browser lab.');}else if(args[0]==='list'){out('vim/stable (virtual package)');out('bash/stable (virtual package)');}else out('apt is simulated. No packages can be installed into this web page.');return;}
    if(lower==='git'){if(args[0]==='status'){out('On branch main');out('No commits yet (virtual demonstration)');out('Untracked files: (use "git add <file>..." to include in what will be committed)');out('  (virtual filesystem is not connected to a real Git repository)');}else if(args[0]==='--version'||args[0]==='version')out('git version 2.46.0 (simulated)');else if(args[0]==='log')out('fatal: your current branch has no commits yet');else out('Git is a limited demo here. Try: git status, git --version, git log');return;}
    if(lower==='npm'||lower==='node'){if(args[0]==='--version'||args[0]==='-v')out(lower==='npm'?'10.8.2 (simulated)':'v22.0.0 (simulated)');else out('Node.js/npm commands are not executed. This terminal only emulates common commands.');return;}
    if(lower==='python'||lower==='python3'){if(args[0]==='--version'||args[0]==='-V')out('Python 3.12.0 (simulated)');else out('Python code is not executed in this virtual terminal. Open a .py file in Vim to edit it.');return;}
    if(lower==='reboot'||lower==='shutdown'||lower==='exit'||lower==='logout'){if(lower==='exit'){reallyCloseWindow(w.id);return '__EXIT__';}showConfirm('End this OS session?','OS選択画面に戻ります。仮想ファイルはローカルストレージに保存されています。','Shut down',returnToChooser);return '__EXIT__';}
    if(lower==='about'){openAboutModal();return;}
    fail(`${command}: command not found. Type "help" for available commands.`);
  }

  // Vim-like modal editor. This provides core motions/commands, not a full Vim runtime.
  function renderVim(w, filename) {
    const normalized=normalizePath(filename,'/home/user');let n=nodeAt(normalized);if(n?.type==='dir'){toast('ディレクトリはVimで開けません。',true);reallyCloseWindow(w.id);return;}if(!n){writeFile(normalized,'');n=nodeAt(normalized);}
    w.title=`Vim — ${pathName(normalized)}`;w.el.querySelector('.window-title-text').textContent=w.title;
    w.editor={filename:normalized,buffer:n.content||'',saved:n.content||'',mode:'NORMAL',command:'',pending:'',undo:[],dirty:false,search:''};
    w.content.innerHTML=`<div class="vim-editor"><div class="vim-toolbar"><span>VIM · ${esc(displayPath(normalized))}</span><span class="vim-key-hint">ESC NORMAL · i INSERT · :w SAVE</span></div><div class="vim-buffer"><div class="vim-gutter" data-vim-gutter></div><textarea class="vim-textarea" data-vim-textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Vim buffer"></textarea></div><div class="vim-status"><span data-vim-status>-- NORMAL --</span><span data-vim-position>1:1</span></div><div class="vim-commandbar" data-vim-commandbar></div></div>`;
    const ta=$('[data-vim-textarea]',w.content);ta.value=w.editor.buffer;ta.readOnly=true;
    const update=()=>{const ed=w.editor;const lines=ta.value.split('\n');$('[data-vim-gutter]',w.content).textContent=lines.map((_,i)=>String(i+1).padStart(3,' ')).join('\n');const pos=ta.selectionStart;const before=ta.value.slice(0,pos).split('\n');$('[data-vim-position]',w.content).textContent=`${before.length}:${before[before.length-1].length+1}`;$('[data-vim-status]',w.content).textContent=ed.mode==='INSERT'?'-- INSERT --':ed.mode==='COMMAND'?':'+ed.command:`-- NORMAL --${ed.dirty?' [+]':''}`;$('[data-vim-commandbar]',w.content).textContent=ed.mode==='COMMAND'?':'+ed.command:ed.message||'';ed.message='';};
    w.editor.update=update; w.editor.ta=ta;
    ta.addEventListener('input',()=>{w.editor.buffer=ta.value;w.editor.dirty=w.editor.buffer!==w.editor.saved;w.editor.undo.push(w.editor.buffer);update();});
    ta.addEventListener('scroll',()=>{$('[data-vim-gutter]',w.content).scrollTop=ta.scrollTop;});
    ta.addEventListener('keydown',e=>{
      const ed=w.editor;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveVim(w);return;}
      if(ed.mode==='INSERT'){
        if(e.key==='Escape'){e.preventDefault();ed.mode='NORMAL';ta.readOnly=true;const p=Math.max(0,ta.selectionStart-1);ta.setSelectionRange(p,p);update();return;}
        if(e.key==='Tab'){e.preventDefault();insertTextAtCursor(ta,'  ');ed.buffer=ta.value;ed.dirty=ed.buffer!==ed.saved;update();}return;
      }
      e.preventDefault();
      if(ed.mode==='COMMAND'){
        if(e.key==='Escape'){ed.mode='NORMAL';ed.command='';update();return;}
        if(e.key==='Enter'){executeVimCommand(w,ed.command);ed.mode='NORMAL';ed.command='';update();return;}
        if(e.key==='Backspace'){ed.command=ed.command.slice(0,-1);update();return;}
        if(e.key.length===1&&!e.ctrlKey){ed.command+=e.key;update();}return;
      }
      const pos=ta.selectionStart;const value=ta.value;
      if(e.key==='Escape'){ed.pending='';ed.mode='NORMAL';update();return;}
      if(e.key===':'){ed.mode='COMMAND';ed.command='';update();return;}
      if(e.key==='i'){ed.mode='INSERT';ta.readOnly=false;update();return;}
      if(e.key==='a'){ed.mode='INSERT';ta.readOnly=false;ta.setSelectionRange(Math.min(value.length,pos+1),Math.min(value.length,pos+1));update();return;}
      if(e.key==='o'||e.key==='O'){ed.undo.push(value);const lineStart=value.lastIndexOf('\n',Math.max(0,pos-1))+1;const lineEnd=value.indexOf('\n',pos);const insertAt=e.key==='o'?(lineEnd<0?value.length:lineEnd):(lineStart);const insert=e.key==='o'?'\n':'\n';ta.value=value.slice(0,insertAt)+insert+value.slice(insertAt);const newPos=e.key==='o'?insertAt+1:insertAt;ta.setSelectionRange(newPos,newPos);ed.buffer=ta.value;ed.dirty=ed.buffer!==ed.saved;ed.mode='INSERT';ta.readOnly=false;update();return;}
      if(e.key==='h'||e.key==='ArrowLeft'){ta.setSelectionRange(Math.max(0,pos-1),Math.max(0,pos-1));}
      else if(e.key==='l'||e.key==='ArrowRight'){ta.setSelectionRange(Math.min(value.length,pos+1),Math.min(value.length,pos+1));}
      else if(e.key==='j'||e.key==='ArrowDown'){const before=value.slice(0,pos).split('\n');const line=before.length-1,col=before[before.length-1].length;const lines=value.split('\n');const target=Math.min(lines.length-1,line+1);const np=lines.slice(0,target).reduce((s,x)=>s+x.length+1,0)+Math.min(col,lines[target].length);ta.setSelectionRange(np,np);}
      else if(e.key==='k'||e.key==='ArrowUp'){const before=value.slice(0,pos).split('\n');const line=before.length-1,col=before[before.length-1].length;const lines=value.split('\n');const target=Math.max(0,line-1);const np=lines.slice(0,target).reduce((s,x)=>s+x.length+1,0)+Math.min(col,lines[target].length);ta.setSelectionRange(np,np);}
      else if(e.key==='x'){if(pos<value.length){ed.undo.push(value);ta.value=value.slice(0,pos)+value.slice(pos+1);ed.buffer=ta.value;ed.dirty=ed.buffer!==ed.saved;}}
      else if(e.key==='u'){const prior=ed.undo.pop();if(prior!==undefined){ta.value=prior;ed.buffer=ta.value;ed.dirty=ed.buffer!==ed.saved;}}
      else if(e.key==='d'||e.key==='y'){if(ed.pending===e.key){const lineStart=value.lastIndexOf('\n',Math.max(0,pos-1))+1;let lineEnd=value.indexOf('\n',pos);if(lineEnd<0)lineEnd=value.length;else lineEnd++;const selected=value.slice(lineStart,lineEnd);if(e.key==='d'){ed.undo.push(value);ta.value=value.slice(0,lineStart)+value.slice(lineEnd);ed.buffer=ta.value;ed.dirty=ed.buffer!==ed.saved;}else settings.vimClipboard=selected;ed.pending='';}else ed.pending=e.key;}
      else if(e.key==='p'&&settings.vimClipboard){ed.undo.push(value);ta.value=value.slice(0,pos+1)+'\n'+settings.vimClipboard.replace(/\n$/,'')+value.slice(pos+1);ed.buffer=ta.value;ed.dirty=ed.buffer!==ed.saved;}
      update();
    });
    w.content.addEventListener('click',()=>focusWindow(w.id));ta.focus();update();
  }
  function insertTextAtCursor(ta,text) {const start=ta.selectionStart,end=ta.selectionEnd;ta.setRangeText(text,start,end,'end');}
  function saveVim(w) {const ed=w.editor;if(!ed)return;const r=writeFile(ed.filename,ed.ta.value);if(!r.ok){ed.message=r.error;ed.update();return;}ed.buffer=ed.ta.value;ed.saved=ed.buffer;ed.dirty=false;ed.message=`"${pathName(ed.filename)}" ${ed.buffer.split('\n').length}L written`;ed.update();w.title=`Vim — ${pathName(ed.filename)}`;w.el.querySelector('.window-title-text').textContent=w.title;toast(`${pathName(ed.filename)} を保存しました。`);}
  function executeVimCommand(w, cmd) {
    const ed=w.editor;const ta=ed.ta;const trimmed=cmd.trim();
    if(trimmed==='w'||trimmed.startsWith('w ')){if(trimmed.split(/\s+/)[1]){ed.filename=normalizePath(trimmed.split(/\s+/)[1],'/home/user');}saveVim(w);return;}
    if(trimmed==='wq'){saveVim(w);reallyCloseWindow(w.id);return;}
    if(trimmed==='q'){if(ed.dirty){ed.message='E37: No write since last change (add ! to override)';return;}reallyCloseWindow(w.id);return;}
    if(trimmed==='q!'){reallyCloseWindow(w.id);return;}
    if(trimmed==='x'){saveVim(w);reallyCloseWindow(w.id);return;}
    if(trimmed.startsWith('e ')){const path=normalizePath(trimmed.slice(2).trim(),'/home/user');let n=nodeAt(path);if(!n){writeFile(path,'');n=nodeAt(path);}if(n.type!=='file'){ed.message='E15: Not a file';return;}ed.filename=path;ed.buffer=n.content||'';ed.saved=ed.buffer;ed.dirty=false;ta.value=ed.buffer;w.title=`Vim — ${pathName(path)}`;w.el.querySelector('.window-title-text').textContent=w.title;ed.update();return;}
    if(trimmed==='set number'||trimmed==='set nu'){ed.message='Line numbers are enabled in this Vim view.';return;}
    if(trimmed.startsWith('/')){const term=trimmed.slice(1);const idx=ta.value.indexOf(term,ta.selectionStart+1);if(idx>=0){ta.setSelectionRange(idx,idx+term.length);ed.message=`/${term}`;}else ed.message=`Pattern not found: ${term}`;return;}
    if(/^\d+$/.test(trimmed)){const line=Math.max(1,Number(trimmed));const lines=ta.value.split('\n');const p=lines.slice(0,Math.min(line-1,lines.length)).reduce((s,x)=>s+x.length+1,0);ta.setSelectionRange(p,p);return;}
    ed.message=trimmed?`Not an editor command: ${trimmed}`:'';
  }

  function renderSettings(w) {
    const stats=countNodes();const used=bytes(JSON.stringify(fsRoot));
    w.content.innerHTML=`<div class="settings-layout"><div class="section-label">CONTROL CENTER / LOCAL SESSION</div><h3>Settings</h3><p>デスクトップ環境、ブラウザ内ファイル、エクスポートを管理します。</p><div class="settings-card"><span class="status-pill">● SESSION ACTIVE</span><h4 style="margin-top:9px">${esc(systems[currentOS].name)}</h4><p>この画面は実OSではなく、ブラウザ内の仮想環境です。サイトやホストOSへ特別な権限は与えられていません。</p><div class="settings-actions"><button class="tool-btn" data-settings="switch">⇄ Switch OS</button><button class="tool-btn" data-settings="about">About OS World</button></div></div><div class="settings-card"><h4>Virtual file storage</h4><div class="storage-row"><span>${stats.files} files · ${stats.dirs} folders</span><b>${formatBytes(used)}</b></div><div class="storage-meter"><i style="width:${Math.min(100,used/(5*1024*1024)*100)}%"></i></div><p>データはこのサイトのlocalStorageに保存されます。ブラウザのサイトデータ消去でも削除されます。</p><div class="settings-actions"><button class="tool-btn" data-settings="storage">Manage / Export</button><button class="tool-btn" data-settings="import">Import backup</button><button class="tool-btn danger" data-settings="clear">Clear virtual files</button></div></div><div class="settings-card"><h4>Privacy & limits</h4><p>Webページはユーザーのブラウザエンジンを使用します。任意のシェルコマンドやネイティブアプリは実行しません。ファイルの内容はサーバーにはアップロードせず、このブラウザの保存領域に保持します。</p></div></div>`;
    w.content.querySelectorAll('[data-settings]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.settings;if(a==='switch')returnToChooser();if(a==='about')openAboutModal();if(a==='storage')openStorageModal();if(a==='import')openStorageModal();if(a==='clear')showConfirm('Clear virtual files?','仮想ファイル・フォルダを初期状態に戻します。元に戻せません。先にStorage Managerからバックアップできます。','Clear files',()=>{localStorage.removeItem(FS_KEY);fsRoot=loadFs();toast('仮想ファイルを初期状態に戻しました。');renderSettings(w);});}));
  }
  function renderAboutApp(w) {w.content.innerHTML=`<div class="settings-layout"><div class="section-label">BROWSER DESKTOP LAB</div><h3>OS World</h3><p>A small world inside your browser.</p><div class="settings-card"><h4>What is this?</h4><p>Windows XP風、Linux Mint風、オリジナルデスクトップを操作するためのフロントエンド実験です。実OSのコードやロゴ、壁紙ファイルは含めていません。</p></div><div class="settings-card"><h4>Included</h4><p>仮想ファイルシステム / コマンドエミュレータ / Vim風モーダルエディタ / 外部Webサイトへのナビゲーション / JSONバックアップ。</p></div></div>`;}

  function openTrash() {
    const w=openWindow('explorer',{path:'/home/user/Downloads'});toast('このシミュレータの「Trash」は、まだ独立したごみ箱領域を持ちません。Filesから不要な仮想ファイルを削除できます。');return w;
  }

  // Storage and project info.
  function openStorageModal() {
    const stats=countNodes();const serialized=JSON.stringify(fsRoot);const used=bytes(serialized);const keys=[FS_KEY,SETTINGS_KEY].filter(k=>localStorage.getItem(k)!==null);const total=keys.reduce((sum,k)=>sum+bytes(localStorage.getItem(k)||''),0);
    showModal('Storage Manager','このアプリのデータはブラウザ内に保存されます。サーバーへのアップロードは行いません。',`<div class="settings-card" style="margin-top:0"><div class="section-label">LOCAL STORAGE USAGE</div><div class="storage-row" style="margin-top:9px"><span>Virtual filesystem</span><b>${formatBytes(used)}</b></div><div class="storage-meter"><i style="width:${Math.min(100,used/5/1024/1024*100)}%"></i></div><div class="storage-row"><span>${stats.files} files · ${stats.dirs} folders</span><span>${formatBytes(total)} total app data</span></div></div><div class="settings-card"><h4>Backup & restore</h4><p>JSONファイルに書き出しておけば、別のブラウザへ移すことができます。バックアップにはファイルの内容が含まれます。</p><div class="settings-actions"><button class="tool-btn primary" data-modal-action="export">↓ Export backup</button><button class="tool-btn" data-modal-action="import">↑ Import backup</button><input id="import-json-input" class="hidden" type="file" accept="application/json,.json"></div></div><div class="settings-card"><h4>Clear data</h4><p>「Clear virtual files」はユーザー作成ファイルを初期状態へ戻します。「Clear all app data」はユーザーファイルを空にし、設定をリセットします。ほかのWebサイトのデータには触れません。</p><div class="settings-actions"><button class="modal-btn danger" data-modal-action="clear-files">Clear virtual files</button><button class="modal-btn danger" data-modal-action="clear-all">Clear all app data</button></div></div>`,[{label:'Done',action:'close',primary:true}]);
  }
  function openAboutModal() {
    showModal('About OS World','BROWSER DESKTOP LAB',`<div class="modal-copy"><p><strong>OS World</strong>は、OSの操作感をブラウザ内で体験するための独自実装です。オリジナルの3D風セレクター、各デスクトップ、ウィンドウ管理、仮想ファイル、シェル風コマンド、Vim風エディターを含みます。</p><p><strong>再現の範囲：</strong>本物のWindows / Linuxカーネル、ドライバー、システムAPI、全コマンド、完全なVimを実装したものではありません。シェルの操作は専用の仮想ファイルシステムに限定されます。</p><p><strong>Web：</strong>サイトを埋め込み表示できない場合は、実ブラウザで開くボタンをご利用ください。外部サイト側のセキュリティ設定によりiframe表示は制限されることがあります。</p><p><strong>Privacy：</strong>ファイルはブラウザのlocalStorageに保存されます。Storage Managerからバックアップや消去ができます。</p></div>`,[{label:'Back to desktop',action:'close',primary:true}]);
  }
  function showModal(title, eyebrow, bodyHtml, buttons=[]) {
    const bhtml=buttons.map((b,i)=>`<button class="modal-btn${b.primary?' primary':''}${b.danger?' danger':''}" ${b.action==='submit'?`type="submit" form="${esc(b.form||'')}">`:`type="button" data-modal-action="${esc(b.action||'close')}">`}${esc(b.label)}</button>`).join('');
    modalRoot.innerHTML=`<div class="modal-backdrop"><section class="modal-panel" role="dialog" aria-modal="true"><div class="modal-header"><div><div class="modal-eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2></div><button class="modal-close" data-modal-action="close" aria-label="Close">×</button></div><div class="modal-copy">${bodyHtml}</div><div class="modal-actions">${bhtml}</div></section></div>`;
    const backdrop=$('.modal-backdrop',modalRoot);backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeModal();});
    return modalRoot;
  }
  function closeModal() {modalRoot.innerHTML='';pendingModalSubmit=null;}
  function showConfirm(title, body, confirmLabel, callback, cancelLabel='Cancel') {
    pendingConfirmCallback=callback;
    showModal(title,'CONFIRMATION REQUIRED',`<div class="modal-copy">${esc(body)}</div>`,[{label:cancelLabel,action:'close'},{label:confirmLabel,action:'confirm',danger:true}]);
  }
  function handleModalClick(e) {
    const b=e.target.closest('[data-modal-action]');if(!b)return;const a=b.dataset.modalAction;
    if(a==='close'){closeModal();return;}
    if(a==='export'){exportBackup();return;}
    if(a==='import'){$('#import-json-input',modalRoot)?.click();return;}
    if(a==='clear-files'){closeModal();showConfirm('Clear virtual files?','ファイルシステムを初期状態に戻します。必要なファイルは先にエクスポートしてください。','Clear files',()=>{localStorage.removeItem(FS_KEY);fsRoot=loadFs();toast('仮想ファイルを初期状態に戻しました。');refreshOpenExplorers();});return;}
    if(a==='clear-all'){closeModal();showConfirm('Clear all OS World data?','OS Worldのユーザーファイルを空のフォルダ構成に戻し、設定をリセットします。ほかのサイトの保存データは削除しません。この操作は元に戻せません。','Clear all data',()=>{localStorage.removeItem(FS_KEY);localStorage.removeItem(SETTINGS_KEY);fsRoot=createBlankFs();persistFs();settings={};saveSettings();windows.forEach(w=>{if(w.type==='explorer')renderExplorer(w,'/home/user');if(w.type==='settings')renderSettings(w);});toast('OS Worldのユーザーファイルと設定を消去しました。');});return;}
    if(a==='confirm'){const cb=pendingConfirmCallback;pendingConfirmCallback=null;closeModal();cb?.();return;}
  }
  function handleModalSubmit(e) {const form=e.target;if(!form.matches('form'))return;e.preventDefault();if(pendingModalSubmit){const fn=pendingModalSubmit;const result=fn(form);if(result===false)return;}}
  function handleModalChange(e) {if(e.target.id==='import-json-input')handleImportFile(e);}
  async function handleImportFile(e) {
    const file=e.target.files?.[0];if(!file)return;
    try {const json=JSON.parse(await file.text());const candidate=json.filesystem||json.fsRoot||json.content||json;if(!candidate||candidate.type!=='dir'||!candidate.children)throw new Error('JSONファイルに有効な仮想ファイルシステムがありません。');const valid=validateFs(candidate);if(!valid)throw new Error('バックアップの構造が不正です。');showConfirm('Restore backup?','現在の仮想ファイルシステムを、選択したバックアップの内容に置き換えます。','Restore',()=>{fsRoot=candidate;persistFs();refreshOpenExplorers();toast('バックアップを復元しました。');closeModal();});}catch(err){toast(err.message||'インポートに失敗しました。',true);}e.target.value='';
  }
  function validateFs(node,depth=0) {if(depth>40||!node||!['dir','file'].includes(node.type))return false;if(node.type==='file')return typeof node.content==='string';if(!node.children||typeof node.children!=='object'||Array.isArray(node.children))return false;return Object.entries(node.children).every(([k,v])=>!k.includes('/')&&!k.includes('\\')&&k!=='.'&&k!=='..'&&validateFs(v,depth+1));}
  function exportBackup() {const data={format:'osworld-fs-backup',version:1,exportedAt:new Date().toISOString(),filesystem:fsRoot};downloadBlob(JSON.stringify(data,null,2),'os-world-backup.json','application/json');toast('バックアップを書き出しました。');}
  function refreshOpenExplorers() {for(const w of windows.values()){if(w.type==='explorer')renderExplorer(w,w.cwd);if(w.type==='settings')renderSettings(w);}}

  // Context menu helper.
  let currentContextMenu=null;
  function showContextMenu(x,y,items) {
    const menu=$('#desktop-context-menu');menu.innerHTML=items.map(([label],i)=>`<button data-context-index="${i}">${esc(label)}</button>`).join('');menu.classList.remove('hidden');const r=desktop.getBoundingClientRect();menu.style.left=Math.max(4,Math.min(x-r.left,desktop.clientWidth-190))+'px';menu.style.top=Math.max(4,Math.min(y-r.top,desktop.clientHeight-180))+'px';
    menu.querySelectorAll('button').forEach((b,i)=>b.addEventListener('click',()=>{menu.classList.add('hidden');items[i][1]();}));
    const close=e=>{if(!menu.contains(e.target)){menu.classList.add('hidden');document.removeEventListener('pointerdown',close);}};setTimeout(()=>document.addEventListener('pointerdown',close),0);
  }

  // Import/Export buttons from desktop and settings. Global click closes menus where appropriate.
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#start-menu')&&!e.target.closest('#start-button'))startMenu.classList.add('hidden');if(!e.target.closest('#desktop-context-menu'))$('#desktop-context-menu')?.classList.add('hidden');});

  // Friendly first-use key tips on the top-level screen.
  window.addEventListener('beforeunload',()=>{try{persistFs();}catch{}});
})();
