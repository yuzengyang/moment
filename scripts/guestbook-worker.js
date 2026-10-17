/**
 * Our Moments · 云端中转（Cloudflare Worker）
 *
 * 两个用途：
 *   1) 匿名留言：POST /messages          （Token 在服务端，访客无需凭据）
 *   2) 照片评论：POST /comments          （凭「评论口令」，口令在服务端）
 *                POST /comments/delete
 *   3) 健康检查：GET /health             （不暴露任何密钥）
 *
 * 环境变量（Workers → Settings → Variables and Secrets）：
 *   GITHUB_TOKEN   必填。fine-grained token，仅 moment 仓库 Contents 读写
 *   COMMENT_KEY    选填。设置后评论接口才可用；不设置时 /comments 返回 503（fail closed）
 *
 * 部署：
 *   1. Workers & Pages → our-moments → Edit code → 全选替换为本文件 → Deploy
 *   2. Settings → Variables and Secrets → 添加 COMMENT_KEY（Type 选 Secret）
 */

const REPO = 'yuzengyang/moment';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Comment-Key'
};
const MAX_CONTENT = 300;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, CORS)
  });
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(function (b) { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function b64decode(b64) {
  const bin = atob(String(b64 || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
  return new TextDecoder().decode(bytes);
}

/* 口令比较：长度一致时逐字符异或，避免早退泄露前缀 */
function keyMatches(request, env) {
  const expected = env.COMMENT_KEY || '';
  if (!expected) return false;
  const given = request.headers.get('X-Comment-Key') || '';
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function sanitizeAuthor(v) {
  return (v === 'wenlinshu' || v === 'yuzengyang') ? v : 'owner';
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (request.method === 'GET' && path === '/health') {
      return json({
        ok: true,
        repo: REPO,
        messages: !!env.GITHUB_TOKEN,
        comments: !!env.GITHUB_TOKEN && !!env.COMMENT_KEY
      });
    }

    const TOKEN = env.GITHUB_TOKEN;
    if (!TOKEN) {
      return json({ error: '服务端未配置 GITHUB_TOKEN' }, 500);
    }
    if (request.method !== 'POST') {
      return json({ error: 'not found' }, 404);
    }

    const gh = function (p, opts) {
      return fetch('https://api.github.com/repos/' + REPO + '/contents/' + p, Object.assign({}, opts, {
        headers: {
          'Authorization': 'Bearer ' + TOKEN,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'our-moments-worker'
        }
      }));
    };

    async function readJson(p) {
      const res = await gh(p);
      if (res.status === 404) return { data: null, sha: '' };
      if (!res.ok) throw new Error('读取 ' + p + ' 失败 (' + res.status + ')');
      const raw = await res.json();
      let data = null;
      try { data = JSON.parse(b64decode(raw.content)); } catch (e) { data = null; }
      return { data: data, sha: raw.sha };
    }

    async function writeJson(p, data, sha, message) {
      const body = { message: message, content: b64encode(JSON.stringify(data, null, 2)), branch: 'main' };
      if (sha) body.sha = sha;
      const res = await gh(p, { method: 'PUT', body: JSON.stringify(body) });
      if (!res.ok) {
        const detail = await res.text().catch(function () { return ''; });
        throw new Error('写入 ' + p + ' 失败 (' + res.status + ')' + (detail ? '：' + detail.slice(0, 160) : ''));
      }
      return res.json();
    }

    let body = {};
    try { body = await request.json(); } catch (e) { body = {}; }

    /* ---------- 匿名留言 ---------- */
    if (path === '/messages') {
      const name = String(body.name || '').trim().slice(0, 30);
      const content = String(body.content || '').trim().slice(0, MAX_CONTENT);
      if (!name || !content) return json({ error: '姓名和内容不能为空' }, 400);

      const msg = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '-msg',
        name: name,
        content: content,
        time: new Date().toISOString()
      };
      try {
        const cur = await readJson('messages.json');
        const existing = (cur.data && cur.data.messages) || [];
        await writeJson('messages.json', { version: 1, messages: [msg].concat(existing) }, cur.sha, '新增留言 ' + msg.id);
        return json({ ok: true, msg: msg });
      } catch (e) {
        return json({ error: e.message || '写入失败' }, 500);
      }
    }

    /* ---------- 照片评论 ---------- */
    if (path === '/comments' || path === '/comments/delete') {
      if (!env.COMMENT_KEY) {
        return json({ error: '服务端未配置 COMMENT_KEY，评论接口未启用' }, 503);
      }
      if (!keyMatches(request, env)) {
        return json({ error: '评论口令不对' }, 401);
      }
    }

    if (path === '/comments') {
      const photoId = String(body.photoId || '').trim();
      const content = String(body.content || '').trim().slice(0, MAX_CONTENT);
      if (!/^[A-Za-z0-9_-]{4,40}$/.test(photoId)) return json({ error: '照片 ID 不合法' }, 400);
      if (!content) return json({ error: '评论不能为空' }, 400);

      const comment = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '-c',
        photoId: photoId,
        content: content,
        author: sanitizeAuthor(body.author),
        time: new Date().toISOString()
      };
      try {
        const cur = await readJson('comments.json');
        const existing = (cur.data && cur.data.comments) || [];
        await writeJson('comments.json', { version: 1, comments: [comment].concat(existing) }, cur.sha, '照片评论 ' + comment.id);
        return json({ ok: true, comment: comment });
      } catch (e) {
        return json({ error: e.message || '写入失败' }, 500);
      }
    }

    if (path === '/comments/delete') {
      const id = String(body.id || '').trim();
      if (!id) return json({ error: '缺少评论 id' }, 400);
      try {
        const cur = await readJson('comments.json');
        const existing = (cur.data && cur.data.comments) || [];
        const rest = existing.filter(function (c) { return c.id !== id; });
        if (rest.length === existing.length) return json({ error: '找不到这条评论' }, 404);
        await writeJson('comments.json', { version: 1, comments: rest }, cur.sha, '删除照片评论 ' + id);
        return json({ ok: true });
      } catch (e) {
        return json({ error: e.message || '写入失败' }, 500);
      }
    }

    return json({ error: 'not found' }, 404);
  }
};
