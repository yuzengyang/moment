/* ============ 管理页逻辑 ============ */

(function () {
  'use strict';

  let currentUser = '';
  let pendingItems = [];        // { file, dataUrl, status: processing|ready|error, error }
  let processingNow = false;   // 预压缩进行中标记
  let editingId = null;         // 正在内联编辑的照片 id

  const els = {
    whoami: document.getElementById('whoami'),
    modeTag: document.getElementById('modeTag'),
    modeText: document.getElementById('modeText'),
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    uploadList: document.getElementById('uploadList'),
    uploadBtn: document.getElementById('uploadBtn'),
    uploadHint: document.getElementById('uploadHint'),
    bulkLoc: document.getElementById('bulkLoc'),
    bulkLocBtn: document.getElementById('bulkLocBtn'),
    manageList: document.getElementById('manageList'),
    manageCount: document.getElementById('manageCount'),
    // 设置
    radioLocal: document.getElementById('radioLocal'),
    radioGithub: document.getElementById('radioGithub'),
    tokenInput: document.getElementById('tokenInput'),
    tokenSave: document.getElementById('tokenSave'),
    tokenClear: document.getElementById('tokenClear'),
    tokenState: document.getElementById('tokenState'),
    toast: document.getElementById('toast'),
    msgList: document.getElementById('msgList'),
    msgCount: document.getElementById('msgCount'),
    progressWrap: document.getElementById('progressWrap'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText')
  };

  let toastTimer = null;
  function toast(msg, kind) {
    els.toast.textContent = msg;
    els.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.className = 'toast'; }, 5000);
  }

  /* 操作成功后通知其他标签页（展览页）立即刷新 */
  function notifySync() {
    lsSet('om_sync', String(Date.now()));
  }

  function showProgress(pct, text) {
    if (!els.progressWrap) return;
    els.progressWrap.style.display = 'block';
    els.progressFill.style.width = pct + '%';
    els.progressText.textContent = (text || '') + (pct > 0 ? '（' + pct + '%）' : '');
  }

  /* 全局错误捕获：任何未捕获错误都弹出，便于定位 */
  window.addEventListener('error', function (e) {
    toast('页面出错：' + (e.message || '未知错误') + '（' + (e.filename || '').split('/').pop() + ':' + e.lineno + '）', 'err');
  });
  window.addEventListener('unhandledrejection', function (e) {
    const msg = (e.reason && e.reason.message) ? e.reason.message : '未知错误';
    toast('操作失败：' + msg, 'err');
  });

  /* ---------- 登录守卫 ---------- */

  function guard() {
    currentUser = sessionStorage.getItem('om_session') || '';
    if (!ACCOUNTS[currentUser]) {
      location.href = 'login.html';
      return false;
    }
    els.whoami.textContent = ACCOUNTS[currentUser].name;
    return true;
  }

  /* ---------- 模式显示 ---------- */

  function refreshModeBar() {
    const wantGithub = lsGet(MODE_KEY) === 'github';
    const hasToken = !!lsGet('om_token');

    if (!hasToken && wantGithub) {
      els.modeTag.textContent = 'GitHub 未连接';
      els.modeTag.className = 'tag pending';
      els.modeText.textContent = '⚠️ 未检测到 Token（清缓存会清除它）。当前上传/删除只影响本机，不会同步到线上。请在下方粘贴 Token 并保存验证。';
    } else if (wantGithub && hasToken) {
      els.modeTag.textContent = 'GitHub 实时';
      els.modeTag.className = 'tag github';
      els.modeText.textContent = '照片会写入 GitHub 仓库，任何设备打开展览页都能看到最新内容。';
    } else if (wantGithub && !hasToken) {
      els.modeTag.textContent = 'GitHub 待配置';
      els.modeTag.className = 'tag pending';
      els.modeText.textContent = '已选择 GitHub 模式，请在下方向框粘贴 Token 并点「保存并验证」，生效后上传才会写入仓库。';
    } else {
      els.modeTag.textContent = '本地演示';
      els.modeTag.className = 'tag local';
      els.modeText.textContent = '照片只存在这台电脑的浏览器里（仅本机可见），配置 GitHub Token 后即可正式上线。';
    }

    els.radioLocal.checked = !wantGithub;
    els.radioGithub.checked = wantGithub;
    els.tokenInput.value = lsGet('om_token') || '';
    refreshTokenState();
  }

  function refreshTokenState() {
    const t = lsGet('om_token');
    els.tokenState.innerHTML = t
      ? '<b>已保存 Token</b>（' + t.slice(0, 6) + '…' + t.slice(-4) + '）'
      : '尚未配置 Token。Token 只在你的浏览器里保存，不会发送给任何人。';
  }

  /* ---------- 上传 ---------- */

  function setupDropzone() {
    els.dropzone.addEventListener('click', function () { els.fileInput.click(); });
    els.fileInput.addEventListener('change', function () {
      addFiles(Array.from(els.fileInput.files || []));
      els.fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      els.dropzone.addEventListener(ev, function (e) { e.preventDefault(); els.dropzone.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      els.dropzone.addEventListener(ev, function (e) { e.preventDefault(); els.dropzone.classList.remove('drag'); });
    });
    els.dropzone.addEventListener('drop', function (e) {
      const files = Array.from(e.dataTransfer.files || []).filter(function (f) { return f.type.startsWith('image/'); });
      addFiles(files);
    });
  }

  function setupBulkLoc() {
    els.bulkLocBtn.addEventListener('click', function () {
      const v = els.bulkLoc.value.trim();
      if (!v) { toast('先填写统一地点', 'err'); return; }
      els.uploadList.querySelectorAll('.up-loc').forEach(function (inp) { inp.value = v; });
      toast('已应用到全部照片', 'ok');
    });
  }

  function addFiles(files) {
    if (!files.length) return;
    files.forEach(function (f) {
      pendingItems.push({ file: f, dataUrl: null, status: 'processing', error: '' });
    });
    renderUploadList();
    updateUploadBtnState();
    processPending();
  }

  function removeFileAt(i) {
    pendingItems.splice(i, 1);
    renderUploadList();
    updateUploadBtnState();
  }

  /* 选照片后立即逐张压缩，处理完成才能上传（避免上传时才压缩出错） */
  async function processPending() {
    if (processingNow) return;
    processingNow = true;
    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];
      if (item.status !== 'processing') continue;
      try {
        showProgress(Math.round(((i + 1) / pendingItems.length) * 100), '处理照片 ' + (i + 1) + '/' + pendingItems.length);
        item.dataUrl = await compressImage(item.file);
        item.status = 'ready';
      } catch (e) {
        item.status = 'error';
        item.error = e.message;
      }
      renderUploadList();
      updateUploadBtnState();
    }
    processingNow = false;
    updateUploadBtnState();
  }

  function updateUploadBtnState() {
    if (!pendingItems.length) {
      els.uploadBtn.style.display = 'none';
      els.uploadHint.style.display = '';
      els.progressWrap.style.display = 'none';
      return;
    }
    els.uploadBtn.style.display = '';
    els.uploadHint.style.display = 'none';
    const processing = pendingItems.filter(function (i) { return i.status === 'processing'; }).length;
    const ready = pendingItems.filter(function (i) { return i.status === 'ready'; }).length;
    if (processing > 0) {
      els.uploadBtn.disabled = true;
      els.uploadBtn.textContent = '照片处理中…（' + ready + '/' + pendingItems.length + '）';
    } else {
      els.uploadBtn.disabled = false;
      els.uploadBtn.textContent = '全部上传（' + ready + ' 张）';
    }
  }

  function renderUploadList() {
    els.uploadList.innerHTML = '';
    if (!pendingItems.length) return;

    pendingItems.forEach(function (item, i) {
      const el = document.createElement('div');
      el.className = 'upload-item';
      el.dataset.i = i;

      const url = URL.createObjectURL(item.file);
      const today = new Date();
      const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

      const statusHtml = item.status === 'processing'
        ? '<span class="up-status processing">处理中…</span>'
        : item.status === 'error'
          ? '<span class="up-status error">处理失败：' + esc(item.error) + '</span>'
          : '<span class="up-status ready">✓ 已就绪，可以上传</span>';

      el.innerHTML =
        '<div class="up-thumb"><img src="' + url + '" alt="预览"></div>' +
        '<div class="up-fields">' +
          statusHtml +
          '<div class="up-row">' +
            '<div class="field" style="margin:0"><label>地点</label><input class="input up-loc" placeholder="例如：成都 · 玉林路" value=""></div>' +
            '<div class="field" style="margin:0"><label>日期</label><input class="input up-date" type="date" value="' + iso + '"></div>' +
          '</div>' +
          '<div class="field" style="margin:0"><label>想说的话</label><textarea class="input textarea up-cap" placeholder="这家店的面很香，下次还要一起来。"></textarea></div>' +
          '<div class="field" style="margin:0">' +
            '<label>谁一起出镜了？</label>' +
            '<div class="badge-row up-tags">' +
              COMPANIONS.map(function (c) {
                return '<span class="badge tag-opt" data-key="' + c.key + '" style="cursor:pointer"><img src="' + c.file + '" alt="">' + c.name + '</span>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div style="text-align:right"><button class="btn btn-ghost btn-sm up-remove" type="button">移除</button></div>' +
        '</div>';

      el.querySelector('.up-remove').addEventListener('click', function () { removeFileAt(i); });
      el.querySelectorAll('.tag-opt').forEach(function (badge) {
        badge.addEventListener('click', function () {
          const on = badge.classList.toggle('active');
          const c = companionByKey(badge.dataset.key);
          badge.style.borderColor = on && c ? c.color : '';
        });
      });
      els.uploadList.appendChild(el);
    });
  }

  function collectEntries() {
    const entries = [];
    const items = els.uploadList.querySelectorAll('.upload-item');
    items.forEach(function (item) {
      const idx = Number(item.dataset.i);
      const p = pendingItems[idx];
      if (!p || p.status !== 'ready' || !p.dataUrl) return;
      const tags = [];
      item.querySelectorAll('.tag-opt.active').forEach(function (b) { tags.push(b.dataset.key); });
      entries.push({
        dataUrl: p.dataUrl,
        location: item.querySelector('.up-loc').value.trim(),
        date: item.querySelector('.up-date').value,
        caption: item.querySelector('textarea.up-cap').value.trim(),
        tags: tags,
        author: currentUser
      });
    });
    return entries;
  }

  async function doUpload() {
    if (els.uploadBtn.disabled) return;
    const readyCount = pendingItems.filter(function (i) { return i.status === 'ready'; }).length;
    if (!readyCount) {
      toast('照片尚未处理完成，请稍候再试', 'err');
      return;
    }
    els.uploadBtn.disabled = true;
    els.uploadBtn.textContent = '正在准备…';
    try {
      const entries = collectEntries();
      if (!entries.length) { toast('没有可上传的照片', 'err'); return; }

      const prepared = entries.map(function (e) {
        return {
          id: genId(),
          dataUrl: e.dataUrl,
          location: e.location,
          date: e.date,
          caption: e.caption,
          tags: e.tags,
          author: e.author
        };
      });

      const result = await uploadPhotos(prepared, function (done, total) {
        const pct = Math.round((done / total) * 100);
        showProgress(pct, '上传照片 ' + done + '/' + total);
        els.uploadBtn.textContent = '上传中 ' + done + '/' + total;
      });
      showProgress(100, '完成');

      pendingItems = [];
      renderUploadList();
      updateUploadBtnState();
      setTimeout(function () { els.progressWrap.style.display = 'none'; }, 2500);

      const n = result.uploaded || 0;
      const failed = result.failed || [];
      if (failed.length) {
        toast('成功 ' + n + ' 张，失败 ' + failed.length + ' 张：' + failed[0].err, 'err');
      } else {
        toast('上传成功 ' + n + ' 张，展览页已更新', 'ok');
      }
      refreshManageList();
      notifySync();
    } catch (err) {
      toast('上传失败：' + err.message, 'err');
    } finally {
      els.uploadBtn.disabled = false;
      updateUploadBtnState();
    }
  }

  /* ---------- 已有照片管理 ---------- */

  async function refreshManageList() {
    const photos = await loadPhotos();
    els.manageCount.textContent = '共 ' + photos.length + ' 张';
    els.manageList.innerHTML = '';

    if (!photos.length) {
      els.manageList.innerHTML = '<p style="color:var(--ink-soft);font-size:.88rem;padding:10px 0">还没有照片，先上传第一张吧。</p>';
      return;
    }

    photos.forEach(function (p) {
  
      const item = document.createElement('div');
      item.className = 'manage-item';
      item.dataset.id = p.id;

      const rawUrl = 'https://' + SITE.repoOwner + '.github.io/' + SITE.repoName + '/' + p.file;

      item.innerHTML =
        '<div class="m-thumb"><img src="' + rawUrl + '" alt=""></div>' +
        '<div class="m-info">' +
          '<div class="m-loc">' + esc(p.location || '地点待补充') + (p.visibility === 'private' ? ' <span class="vis-tag">仅我可见</span>' : '') + '</div>' +
          '<div class="m-cap">' + esc(p.caption || '没有留下文字') + '</div>' +
          '<div class="m-date">' + esc(fmtDate(p.date || p.created)) + ' · 上传于 ' + esc(fmtDateTime(p.created)) + '</div>' +
        '</div>' +
        '<div class="m-ops">' +
          '<button class="btn btn-ghost btn-sm op-edit">编辑</button>' +
          '<button class="btn btn-danger btn-sm op-del">删除</button>' +
        '</div>';

      item.querySelector('.op-del').addEventListener('click', function () {
        if (!confirm('确定删除这张照片吗？')) return;
        const btn = this;
        btn.disabled = true;
        btn.textContent = '删除中…';
        deletePhoto(p.id, currentUser).then(function () {
          toast('已删除，展览页将自动更新', 'ok');
          refreshManageList();
          notifySync();
        }).catch(function (err) {
          toast('删除失败：' + err.message, 'err');
          btn.disabled = false;
          btn.textContent = '删除';
        });
      });

      item.querySelector('.op-edit').addEventListener('click', function () {
        startEdit(p.id, p);
      });

      els.manageList.appendChild(item);
      const mImg = item.querySelector('.m-thumb img');
      mImg.addEventListener('error', function () {
        const cur = mImg.src;
        const m1 = cur.match(/https:\/\/([^/]+)\.github\.io\/([^/]+)\/(.+)/);
        if (m1) { mImg.src = 'https://cdn.jsdelivr.net/gh/' + m1[1] + '/' + m1[2] + '@main/' + m1[3]; return; }
        const m2 = cur.match(/https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@]+)@main\/(.+)/);
        if (m2) { mImg.src = 'https://raw.githubusercontent.com/' + m2[1] + '/' + m2[2] + '/main/' + m2[3]; return; }
        mImg.style.display = 'none';
      });
      // 本地演示模式下若 IndexedDB 有该照片，用本地图覆盖
      getBlobDB(p.id).then(function (blob) {
        if (blob) item.querySelector('.m-thumb img').src = URL.createObjectURL(blob);
      });
    });
  }

  /* 留言管理 */
  async function refreshMsgList() {
    const msgs = await loadMessages();
    els.msgCount.textContent = '共 ' + msgs.length + ' 条';
    els.msgList.innerHTML = '';
    if (!msgs.length) {
      els.msgList.innerHTML = '<p style="color:var(--ink-soft);font-size:.88rem;padding:10px 0">还没有留言。</p>';
      return;
    }
    msgs.forEach(function (m) {
      const item = document.createElement('div');
      item.className = 'manage-item';
      item.innerHTML =
        '<div class="gb-avatar">' + esc((m.name || '匿').charAt(0)) + '</div>' +
        '<div class="m-info">' +
          '<div class="m-loc">' + esc(m.name || '匿名') + ' <span style="font-weight:400;font-size:.78rem;color:var(--ink-soft)">' + esc(fmtDateTime(m.time)) + '</span></div>' +
          '<div class="m-cap" style="white-space:pre-wrap">' + esc(m.content) + '</div>' +
        '</div>' +
        '<div class="m-ops"><button class="btn btn-danger btn-sm op-msg-del">删除</button></div>';
      item.querySelector('.op-msg-del').addEventListener('click', function () {
        if (!confirm('删除这条留言？')) return;
        deleteMessage(m.id).then(function () {
          toast('留言已删除', 'ok');
          refreshMsgList();
          notifySync();
        }).catch(function (err) { toast('删除失败：' + err.message, 'err'); });
      });
      els.msgList.appendChild(item);
    });
  }

  /* 内联编辑 */
  function startEdit(id, p) {
    editingId = id;
    const items = els.manageList.querySelectorAll('.manage-item');
    items.forEach(function (item) {
      if (item.dataset.id !== id) return;
      const editArea = document.createElement('div');
      editArea.style.cssText = 'grid-column:1/-1;display:flex;flex-direction:column;gap:10px;padding:12px;border-top:1px dashed var(--line)';
      editArea.innerHTML =
        '<div class="up-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<div class="field" style="margin:0"><label>地点</label><input class="input e-loc" value="' + esc(p.location || '') + '"></div>' +
          '<div class="field" style="margin:0"><label>日期</label><input class="input e-date" type="date" value="' + esc(p.date || '') + '"></div>' +
        '</div>' +
        '<div class="field" style="margin:0"><label>可见性</label>' +
          '<select class="select e-vis">' +
            '<option value="public"' + (p.visibility === 'private' ? '' : ' selected') + '>公开（展览页展示）</option>' +
            '<option value="private"' + (p.visibility === 'private' ? ' selected' : '') + '>仅我可见（不在展览页展示）</option>' +
          '</select>' +
        '</div>' +
        '<div class="field" style="margin:0"><label>想说的话</label><textarea class="input textarea e-cap">' + esc(p.caption || '') + '</textarea></div>' +
        '<div class="field" style="margin:0">' +
          '<label>伙伴</label><div class="badge-row e-tags">' +
          COMPANIONS.map(function (c) {
            const on = (p.tags || []).indexOf(c.key) !== -1;
            return '<span class="badge tag-opt' + (on ? ' active' : '') + '" data-key="' + c.key + '" style="cursor:pointer;border-color:' + (on ? c.color : '') + '"><img src="' + c.file + '" alt="">' + c.name + '</span>';
          }).join('') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button class="btn btn-ghost btn-sm e-cancel" type="button">取消</button>' +
          '<button class="btn btn-primary btn-sm e-save" type="button">保存修改</button>' +
        '</div>';
      item.appendChild(editArea);

      editArea.querySelectorAll('.tag-opt').forEach(function (badge) {
        badge.addEventListener('click', function () {
          const on = badge.classList.toggle('active');
          const c = companionByKey(badge.dataset.key);
          badge.style.borderColor = on && c ? c.color : '';
        });
      });
      editArea.querySelector('.e-cancel').addEventListener('click', function () { editArea.remove(); editingId = null; });
      editArea.querySelector('.e-save').addEventListener('click', function () {
        const tags = [];
        editArea.querySelectorAll('.tag-opt.active').forEach(function (b) { tags.push(b.dataset.key); });
        const patch = {
          location: editArea.querySelector('.e-loc').value.trim(),
          date: editArea.querySelector('.e-date').value,
          caption: editArea.querySelector('.e-cap').value.trim(),
          tags: tags,
          visibility: editArea.querySelector('.e-vis').value
        };
        updatePhoto(id, patch, currentUser).then(function () {
          editArea.remove();
          editingId = null;
          toast('已保存', 'ok');
          refreshManageList();
          notifySync();
        }).catch(function (err) { toast('保存失败：' + err.message, 'err'); });
      });
    });
  }

  /* ---------- 设置 ---------- */

  function setupSettings() {
    els.radioLocal.addEventListener('change', function () {
      if (!els.radioLocal.checked) return;
      if (lsGet('om_token')) {
        if (!confirm('切换为本地演示模式后，将不再写入 GitHub。确定切换吗？')) { refreshModeBar(); return; }
      }
      setMode('local');
      refreshModeBar();
      toast('已切换为本地演示模式', 'ok');
      refreshManageList();
    });

    els.radioGithub.addEventListener('change', function () {
      if (!els.radioGithub.checked) return;
      setMode('github');
      refreshModeBar();
      if (!lsGet('om_token')) {
        toast('请粘贴 GitHub Token 并保存验证', 'err');
        els.tokenInput.focus();
        els.tokenInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      toast('已连接 GitHub，此后上传会实时同步', 'ok');
      refreshManageList();
    });

    els.tokenSave.addEventListener('click', async function () {
      const t = els.tokenInput.value.trim();
      if (!t) { toast('Token 不能为空', 'err'); return; }
      setToken(t);
      els.tokenSave.disabled = true;
      els.tokenSave.textContent = '验证中…';
      const login = await verifyToken(t);
      if (login) {
        toast('Token 有效：' + login, 'ok');
        setMode('github');
        refreshModeBar();
        refreshManageList();
      }
      els.tokenSave.disabled = false;
      els.tokenSave.textContent = '保存并验证';
    });

    /* 验证 token：10 秒超时，失败自动重试一次，并给出具体原因 */
    async function verifyToken(t) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(function () { ctrl.abort(); }, 10000);
        try {
          const res = await fetch('https://api.github.com/user', {
            headers: { Authorization: 'Bearer ' + t },
            signal: ctrl.signal
          });
          clearTimeout(timer);
          if (res.ok) {
            const me = await res.json();
            return me.login || 'OK';
          }
          toast('Token 无效（' + res.status + '），请检查权限设置', 'err');
          lsDel(TOKEN_KEY);
          refreshModeBar();
          return null;
        } catch (e) {
          clearTimeout(timer);
          if (attempt === 1) { continue; }
          const reason = e.name === 'AbortError' ? '连接超时' : (e.message || '网络异常');
          toast('无法连接 GitHub：' + reason + '。请确认浏览器能打开 api.github.com，并检查代理/拦截插件', 'err');
          refreshModeBar();
          return null;
        }
      }
      return null;
    }

    els.tokenClear.addEventListener('click', function () {
      if (!confirm('清除已保存的 Token？')) return;
      lsDel(TOKEN_KEY);
      setMode('local');
      refreshModeBar();
      toast('已清除 Token，切换为本地演示模式', 'ok');
      refreshManageList();
    });
  }

  /* ---------- 工具 ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- 启动 ---------- */

  function init() {
    if (!guard()) return;
    refreshModeBar();
    setupDropzone();
    setupBulkLoc();
    setupSettings();
    refreshManageList();
    refreshMsgList();
  }

  /* 关键按钮用事件委托，即使初始化某步出错也能响应 */
  document.addEventListener('click', function (e) {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#uploadBtn')) { doUpload(); return; }
    if (t.closest('#logoutBtn')) {
      sessionStorage.removeItem('om_session');
      sessionStorage.removeItem('om_session_name');
      location.href = 'index.html';
    }
  });

  try {
    init();
  } catch (err) {
    toast('初始化出错：' + err.message, 'err');
  }
})();
