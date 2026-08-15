/* ============ Our Moments · 共享常量与工具 ============ */

const ACCOUNTS = {
  wenlinshu: { password: 'yuzengyang', name: '温琳舒', role: '她' },
  yuzengyang: { password: 'wenlinshu', name: '于增洋', role: '他' }
};

const COMPANIONS = [
  { key: 'lulu',  name: '噜噜', color: '#F2767E', file: 'assets/img/avatars/lulu.svg' },
  { key: 'lumei', name: '噜妹', color: '#F2A65E', file: 'assets/img/avatars/lumei.svg' },
  { key: 'yier',  name: '一二', color: '#9DBE8B', file: 'assets/img/avatars/yier.svg' },
  { key: 'bubu',  name: '布布', color: '#8FB6CE', file: 'assets/img/avatars/bubu.svg' }
];

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
