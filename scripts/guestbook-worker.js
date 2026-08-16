/**
 * Our Moments · 留言板云端中转（Cloudflare Worker）
 * 作用：匿名访客留言 → 本函数用服务端 Token 写入 GitHub，实现匿名留言实时同步。
 *
 * 部署步骤：
 * 1. 注册 Cloudflare → Workers & Pages → Create → Create Worker
 * 2. 把本文件内容粘贴到编辑器
 * 3. 设置环境变量：GITHUB_TOKEN = 你的 GitHub fine-grained token（moment 仓库 Contents 读写）
 * 4. Deploy，得到形如 https://xxx.workers.dev 的地址，告知站主
 *
 * 接口：POST /messages  body: { "name": "...", "content": "..." }
 */
export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || !url.pathname.endsWith('/messages')) {
      return new Response('not found', { status: 404, headers: cors });
    }

    const TOKEN = env.GITHUB_TOKEN;
    if (!TOKEN) {
      return new Response(JSON.stringify({ error: '服务端未配置 GITHUB_TOKEN' }), { status: 500, headers: cors });
    }

    let body = {};
    try { body = await request.json(); } catch (e) { body = {}; }
    const name = String(body.name || '').trim().slice(0, 30);
    const content = String(body.content || '').trim().slice(0, 300);
    if (!name || !content) {
      return new Response(JSON.stringify({ error: '姓名和内容不能为空' }), { status: 400, headers: cors });
    }

    const msg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '-msg',
      name: name,
      content: content,
      time: new Date().toISOString()
    };

    const gh = function (path, opts) {
      return fetch('https://api.github.com/repos/yuzengyang/moment/contents/' + path, Object.assign({}, opts, {
        headers: {
          'Authorization': 'Bearer ' + TOKEN,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'our-moments-guestbook'
        }
      }));
    };

    // UTF-8 安全 base64
    const b64encode = function (str) {
      const bytes = new TextEncoder().encode(str);
      let bin = '';
      bytes.forEach(function (b) { bin += String.fromCharCode(b); });
      return btoa(bin);
    };
    const b64decode = function (b64) {
      const bin = atob(b64.replace(/\s/g, ''));
      const bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
      return new TextDecoder().decode(bytes);
    };

    // 读现有留言（可能不存在）
    let sha = '';
    let existing = [];
    const cur = await gh('messages.json');
    if (cur.ok) {
      const data = await cur.json();
      sha = data.sha;
      try {
        existing = JSON.parse(b64decode(data.content)).messages || [];
      } catch (e) { existing = []; }
    }

    const updated = { version: 1, messages: [msg].concat(existing) };
    const putBody = {
      message: '新增留言 ' + msg.id,
      content: b64encode(JSON.stringify(updated, null, 2)),
      branch: 'main'
    };
    if (sha) putBody.sha = sha;

    const putRes = await gh('messages.json', { method: 'PUT', body: JSON.stringify(putBody) });
    if (!putRes.ok) {
      return new Response(JSON.stringify({ error: '写入失败 ' + putRes.status }), { status: 500, headers: cors });
    }

    return new Response(JSON.stringify({ ok: true, msg: msg }), {
      headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
    });
  }
};
