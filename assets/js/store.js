/* ============ Our Moments · 数据层 ============
 * 两种存储模式：
 *   github —— 真实模式：照片与元数据写入 GitHub 仓库，展览页通过
 *             GitHub API 实时读取，上传后自动更新。
 *   local  —— 演示模式：照片存浏览器 IndexedDB，元数据存 localStorage，
 *             仅本机同一浏览器可见，方便未部署时预览流程。
 */

const MODE_KEY = 'om_mode';      // 'github' | 'local'
const TOKEN_KEY = 'om_token';
const LOCAL_META_KEY = 'om_photos_local';

const DB_NAME = 'our-moments';
const DB_VER = 1;
const DB_STORE = 'photos';

const GH_API = 'https://api.github.com';
const GH_RAW = 'https://raw.githubusercontent.com';

/* ---------- 模式与配置 ---------- */

function detectMode() {
  if (lsGet(MODE_KEY) === 'github' && lsGet(TOKEN_KEY)) return 'github';
  return 'local';
}

function getToken() { return lsGet(TOKEN_KEY) || ''; }

function setMode(mode) {
  if (mode === 'github') lsSet(MODE_KEY, 'github');
  else { lsDel(MODE_KEY); lsDel(TOKEN_KEY); }
}

function setToken(t) { lsSet(TOKEN_KEY, t.trim()); }

/* ---------- IndexedDB（本地图片存储） ---------- */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function putBlobDB(key, blob) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function getBlobDB(key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE).objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  }));
}

function delBlobDB(key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

/* ---------- 本地元数据 ---------- */

function localMetaFull() {
  try {
    return JSON.parse(lsGet(LOCAL_META_KEY) || '{"version":1,"updated":"","updatedBy":"","photos":[]}');
  } catch (e) { return { version: 1, updated: '', updatedBy: '', photos: [] }; }
}

function localMeta() {
  return localMetaFull().photos || [];
}

function saveLocalMeta(photos, updatedBy) {
  lsSet(LOCAL_META_KEY, JSON.stringify({ version: 1, updated: new Date().toISOString(), updatedBy: updatedBy || '', photos: photos }));
}

/* ---------- GitHub API 封装 ---------- */

function ghHeaders(auth = true) {
  const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (auth) h.Authorization = 'Bearer ' + getToken();
  return h;
}

/* 读取仓库文件；不存在返回 null。auth=false 用于展览页匿名实时读取 */
async function ghGetFile(path, auth = true) {
  const url = GH_API + '/repos/' + SITE.repoOwner + '/' + SITE.repoName + '/contents/' + path;
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 20000);
  try {
    const res = await fetch(url, { headers: ghHeaders(auth), signal: ctrl.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('GitHub 读取失败 (' + res.status + ')');
    const data = await res.json();
    return {
      content: decodeBase64Utf8(data.content),
      sha: data.sha
    };
  } finally {
    clearTimeout(timer);
  }
}

/* 写入/更新仓库文件（自动携带最新 sha） */
async function ghPutFile(path, content, message) {
  const url = GH_API + '/repos/' + SITE.repoOwner + '/' + SITE.repoName + '/contents/' + path;
  const body = { message: message, content: btoaUnicode(content), branch: 'main' };
  try {
    const cur = await ghGetFile(path);
    if (cur) body.sha = cur.sha;
  } catch (e) { /* 文件可能不存在 */ }
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 40000);
  let res;
  try {
    res = await fetch(url, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    clearTimeout(timer);
    throw new Error(e.name === 'AbortError' ? 'GitHub 连接超时，请检查网络后重试' : 'GitHub 连接失败：' + e.message);
  }
  clearTimeout(timer);
  if (!res.ok) {
    const detail = await res.json().catch(function () { return null; });
    throw new Error('GitHub 写入失败 (' + res.status + ')' + (detail && detail.message ? '：' + detail.message : ''));
  }
  return res.json();
}

/* 删除仓库文件 */
async function ghDeleteFile(path, message) {
  const cur = await ghGetFile(path);
  if (!cur) return;
  const url = GH_API + '/repos/' + SITE.repoOwner + '/' + SITE.repoName + '/contents/' + path;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: ghHeaders(),
    body: JSON.stringify({ message: message, sha: cur.sha, branch: 'main' })
  });
  if (!res.ok) throw new Error('GitHub 删除失败 (' + res.status + ')');
}

/* ---------- 编码 ---------- */

function btoaUnicode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const head = parts[0], body = parts.slice(1).join(',');
  const m = head.match(/data:(.*?);/);
  const mime = (m && m[1]) || 'image/jpeg';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* ---------- 读取照片 ---------- */

/* 本地静态 photos.json（部署后为 Pages 静态文件） */
async function loadStaticPhotos() {
  const m = await loadStaticMeta();
  return m ? (Array.isArray(m.photos) ? m.photos : null) : null;
}

async function loadStaticMeta() {
  try {
    const res = await fetch('./photos.json', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

/* 匿名实时拉取 GitHub 上的 photos.json（上传后立即可见） */
async function loadGithubPhotosAnon() {
  const m = await loadGithubMetaAnon();
  return m ? (Array.isArray(m.photos) ? m.photos : null) : null;
}

async function loadGithubMetaAnon() {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 8000);
  try {
    const f = await ghGetFile('photos.json', false);
    if (!f) return null;
    return JSON.parse(f.content);
  } catch (e) { return null; }
  finally { clearTimeout(timer); }
}

/* 展览页统一入口：返回 { photos, source } */
/* source: 'github-live' | 'static' | 'local' */
async function loadGalleryPhotos() {
  if (detectMode() === 'local') {
    const photos = [];
    const metas = localMeta();
    for (let i = 0; i < metas.length; i++) {
      const p = metas[i];
      const blob = await getBlobDB(p.id);
      const url = blob ? URL.createObjectURL(blob) : null;
      photos.push(Object.assign({}, p, { url: url }));
    }
    return { photos: photos, source: 'local' };
  }

  // 先静态（快、无速率限制），再匿名实时刷新（最新）
  const staticPhotos = await loadStaticPhotos();
  const fresh = await loadGithubPhotosAnon();

  if (fresh && fresh.length) {
    return {
      photos: fresh.map(function (p) {
        return Object.assign({}, p, { url: GH_RAW + '/' + SITE.repoOwner + '/' + SITE.repoName + '/main/' + p.file });
      }),
      source: 'github-live'
    };
  }
  if (staticPhotos && staticPhotos.length) {
    return { photos: staticPhotos.map(function (p) { return Object.assign({}, p, { url: p.file }); }), source: 'static' };
  }
  return { photos: staticPhotos || [], source: 'static' };
}

/* 管理页统一入口：返回完整照片列表（github 模式含实时数据） */
async function loadPhotos() {
  if (detectMode() === 'local') return localMeta();
  const fresh = await loadGithubPhotosAnon();
  if (fresh) return fresh;
  return (await loadStaticPhotos()) || [];
}

/* ---------- 上传 ---------- */

/* entries: [{ dataUrl, location, date, caption, tags, author }]
 * onProgress(done, total)：每张处理完成时回调
 * 返回：{ uploaded, failed: [{id, err}] }
 */
async function uploadPhotos(entries, onProgress) {
  if (!entries || !entries.length) return { uploaded: 0, failed: [] };

  if (detectMode() === 'github') {
    const uploadedMetas = [];
    const failed = [];

    // 1) 逐张上传图片（已存在则跳过，支持失败重试）
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const meta = {
        id: e.id,
        file: 'photos/' + e.id + '.jpg',
        location: e.location || '',
        date: e.date || '',
        caption: e.caption || '',
        author: e.author,
        tags: e.tags || [],
        created: new Date().toISOString()
      };
      try {
        const exists = await ghGetFile(meta.file);
        if (!exists) {
          await ghPutFile(meta.file, stripDataPrefix(e.dataUrl), '上传照片 ' + e.id);
        }
        uploadedMetas.push(meta);
      } catch (err) {
        failed.push({ id: e.id, err: err.message });
      }
      if (onProgress) onProgress(i + 1, entries.length);
    }

    // 2) 合并元数据写回 photos.json（已成功的都写入，并去重）
    if (uploadedMetas.length) {
      const existing = await loadPhotos();
      const ids = uploadedMetas.map(function (m) { return m.id; });
      const rest = existing.filter(function (p) { return ids.indexOf(p.id) === -1; });
      const updated = {
        version: 1,
        updated: new Date().toISOString(),
        updatedBy: (entries[0] && entries[0].author) || '',
        photos: uploadedMetas.concat(rest)
      };
      await ghPutFile('photos.json', JSON.stringify(updated, null, 2), '更新照片信息（+' + uploadedMetas.length + '）');
    }
    return { uploaded: uploadedMetas.length, failed: failed };
  }

  // 本地模式
  const existing = localMeta();
  const newMetas = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    await putBlobDB(e.id, dataUrlToBlob(e.dataUrl));
    newMetas.push({
      id: e.id,
      file: 'photos/' + e.id + '.jpg',
      location: e.location || '',
      date: e.date || '',
      caption: e.caption || '',
      author: e.author,
      tags: e.tags || [],
      created: new Date().toISOString()
    });
    if (onProgress) onProgress(i + 1, entries.length);
  }
  saveLocalMeta(newMetas.concat(existing), (entries[0] && entries[0].author) || '');
  return { uploaded: newMetas.length, failed: [] };
}

/* 更新单张照片元数据 */
async function updatePhoto(id, patch, user) {
  const photos = await loadPhotos();
  const idx = photos.findIndex(function (p) { return p.id === id; });
  if (idx === -1) return;
  photos[idx] = Object.assign({}, photos[idx], patch);

  if (detectMode() === 'github') {
    await ghPutFile('photos.json', JSON.stringify({ version: 1, updated: new Date().toISOString(), updatedBy: user || '', photos: photos }, null, 2), '编辑照片 ' + id);
  } else {
    saveLocalMeta(photos, user);
  }
}

/* 删除照片 */
async function deletePhoto(id, user) {
  const photos = await loadPhotos();
  const target = photos.find(function (p) { return p.id === id; });
  if (!target) return;

  if (detectMode() === 'github') {
    await ghDeleteFile(target.file, '删除照片 ' + id);
    const rest = photos.filter(function (p) { return p.id !== id; });
    await ghPutFile('photos.json', JSON.stringify({ version: 1, updated: new Date().toISOString(), updatedBy: user || '', photos: rest }, null, 2), '删除照片 ' + id);
  } else {
    await delBlobDB(id);
    saveLocalMeta(photos.filter(function (p) { return p.id !== id; }), user);
  }
}


/* 页脚更新时间与更新人信息 */
async function loadUpdatedInfo() {
  let meta = null;
  if (detectMode() === 'local') {
    meta = localMetaFull();
  } else {
    meta = await loadGithubMetaAnon() || await loadStaticMeta();
  }
  if (!meta) return { updated: '', updatedBy: '' };
  return { updated: meta.updated || '', updatedBy: meta.updatedBy || '' };
}
