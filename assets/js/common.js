/* ============ Our Moments · 共享常量与工具 ============ */

const ACCOUNTS = {
  wenlinshu: { password: 'yyyuzengyang', name: '温琳舒', role: '她' },
  yuzengyang: { password: 'wwwenlinshu', name: '于增洋', role: '他' }
};

const COMPANIONS = [
  { key: 'lulu',  name: '噜噜', color: '#F2767E', file: 'assets/img/avatars/lulu.svg' },
  { key: 'lumei', name: '噜妹', color: '#F2A65E', file: 'assets/img/avatars/lumei.svg' },
  { key: 'yier',  name: '一二', color: '#9DBE8B', file: 'assets/img/avatars/yier.svg' },
  { key: 'bubu',  name: '布布', color: '#8FB6CE', file: 'assets/img/avatars/bubu.svg' }
];

const CATEGORIES = [
  { key: 'scenery', name: '美景', color: '#7FA36B' },
  { key: 'food', name: '美食', color: '#E06A5E' },
  { key: 'us', name: '我们', color: '#5B8DB8' }
];

function categoryName(key) {
  const c = CATEGORIES.find(function (x) { return x.key === key; });
  return c ? c.name : '';
}

function categoryColor(key) {
  const c = CATEGORIES.find(function (x) { return x.key === key; });
  return c ? c.color : '';
}

const SITE = {
  title: '温琳舒 ♥ 于增洋',
  subtitle: '我们的时光簿',
  repoOwner: 'yuzengyang',
  repoName: 'moment'
};

/* ---------- 工具函数 ---------- */

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function authorName(key) {
  return ACCOUNTS[key] ? ACCOUNTS[key].name : key;
}

/* 评论/署名颜色：于增洋蓝、温琳舒粉 */
function authorColor(key) {
  if (key === 'yuzengyang') return '#5B8DB8';
  if (key === 'wenlinshu') return '#E06A5E';
  return '#F2767E';
}

function companionByKey(key) {
  return COMPANIONS.find(c => c.key === key);
}

/* 伙伴徽章 HTML */
function companionBadges(tags, size = '') {
  if (!tags || !tags.length) return '';
  return tags.map(key => {
    const c = companionByKey(key);
    if (!c) return '';
    return `<span class="badge"><img src="${c.file}" alt="${c.name}" title="${c.name}">${c.name}</span>`;
  }).join('');
}

/* 生成照片 ID：20260815-103015-ab3 */
function genId() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 5)}`;
}

/* 倒计时：deadline(ISO) 距现在的剩余时间 */
function fmtCountdown(deadlineIso) {
  const ms = new Date(deadlineIso).getTime() - Date.now();
  if (ms <= 0) return '已到时间';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const p = function (n) { return String(n).padStart(2, '0'); };
  return d + ' 天 ' + p(h) + ' 小时 ' + p(m) + ' 分 ' + p(sec) + ' 秒';
}

/* 日期（YYYY-MM-DD） */
function fmtDateOnly(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* 图片压缩：最长边 maxSide，JPEG quality，透明底填奶油色 */
function compressImage(file, maxSide = 1920, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片格式不支持，请换成 JPG / PNG / WebP'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFF9F4';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          reject(new Error('压缩失败'));
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* base64(dataURL) 去掉前缀 */
function stripDataPrefix(dataUrl) {
  return dataUrl.split(',')[1] || '';
}

/* GitHub API 返回的 base64（可能带换行）解码为 UTF-8 文本 */
function decodeBase64Utf8(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/* localStorage 工具 */
function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function lsSet(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }
function lsDel(key) { try { localStorage.removeItem(key); } catch (e) {} }

/* ============ EXIF 拍摄日期读取 ============ */

/* 读取 JPEG 的 EXIF 拍摄日期（DateTimeOriginal 或 DateTime），返回 'YYYY-MM-DD' 或 null */
function readExifDate(file) {
  return new Promise(function (resolve) {
    const reader = new FileReader();
    reader.onerror = function () { resolve(null); };
    reader.onload = function () {
      try {
        const view = new DataView(reader.result);
        if (view.byteLength < 4 || view.getUint16(0, false) !== 0xFFD8) { resolve(null); return; }
        let offset = 2;
        while (offset + 4 < view.byteLength) {
          if (view.getUint8(offset) !== 0xFF) { resolve(null); return; }
          const marker = view.getUint8(offset + 1);
          if (marker === 0xDA || marker === 0xD9) { resolve(null); return; }
          const segLen = view.getUint16(offset + 2, false);
          if (marker === 0xE1 && offset + 10 <= view.byteLength) {
            if (view.getUint8(offset + 4) === 0x45 && view.getUint8(offset + 5) === 0x78 &&
                view.getUint8(offset + 6) === 0x69 && view.getUint8(offset + 7) === 0x66 &&
                view.getUint8(offset + 8) === 0x00 && view.getUint8(offset + 9) === 0x00) {
              const dt = parseExifDate(view, offset + 10);
              resolve(dt);
              return;
            }
          }
          offset += 2 + segLen;
        }
        resolve(null);
      } catch (e) { resolve(null); }
    };
    reader.readAsArrayBuffer(file);
  });
}

function parseExifDate(view, tiff) {
  if (tiff + 8 > view.byteLength) return null;
  const b0 = view.getUint8(tiff), b1 = view.getUint8(tiff + 1);
  let little;
  if (b0 === 0x49 && b1 === 0x49) little = true;
  else if (b0 === 0x4D && b1 === 0x4D) little = false;
  else return null;
  const rd16 = function (o) { return view.getUint16(o, little); };
  const rd32 = function (o) { return view.getUint32(o, little); };
  if (rd16(tiff + 2) !== 0x002A) return null;
  const ifd0 = rd32(tiff + 4);
  if (tiff + ifd0 + 2 > view.byteLength) return null;
  const n = rd16(tiff + ifd0);
  for (let i = 0; i < n; i++) {
    const e = tiff + ifd0 + 2 + i * 12;
    if (e + 12 > view.byteLength) break;
    const tag = rd16(e);
    if (tag !== 0x9003 && tag !== 0x0132) continue;
    const type = rd16(e + 2);
    const count = rd32(e + 4);
    if (type !== 2) continue;
    let str = '';
    if (count <= 4) {
      for (let k = 0; k < count; k++) {
        const c = view.getUint8(e + 8 + k);
        if (c === 0) break;
        str += String.fromCharCode(c);
      }
    } else {
      const vo = rd32(e + 8);
      for (let k = 0; k < count; k++) {
        const c = view.getUint8(tiff + vo + k);
        if (c === 0) break;
        str += String.fromCharCode(c);
      }
    }
    const m = str.match(/^(\d{4}):(\d{2}):(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    return null;
  }
  return null;
}

/* ============ 导航栏滚动收缩 ============ */
(function () {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const onScroll = function () {
    nav.classList.toggle('compact', window.scrollY > 80);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
