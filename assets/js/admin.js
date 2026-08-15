/* ============ 管理页逻辑 ============ */

(function () {
  'use strict';

  let currentUser = '';
  let pendingFiles = [];        // 待上传的 File 对象
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
    toast: document.getElementById('toast')
  };

  let toastTimer = null;
  function toast(msg, kind) {
    els.toast.textContent = msg;
    els.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.className = 'toast'; }, 3200);
  }

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

    if (wantGithub && hasToken) {
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
    pendingFiles = pendingFiles.concat(files);
    renderUploadList();
  }

  function removeFileAt(i) {
    pendingFiles.splice(i, 1);
    renderUploadList();
  }

  function renderUploadList() {
    els.uploadList.innerHTML = '';
    els.uploadBtn.style.display = pendingFiles.length ? '' : 'none';
    els.uploadHint.style.display = pendingFiles.length ? 'none' : '';
    if (!pendingFiles.length) return;

    pendingFiles.forEach(function (file, i) {
      const item = document.createElement('div');
      item.className = 'upload-item';
      item.dataset.i = i;

      const url = URL.createObjectURL(file);
      const today = new Date();
      const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

      item.innerHTML =
        '<div class="up-thumb"><img src="' + url + '" alt="预览"></div>' +
        '<div class="up-fields">' +
          '<div class="up-row">' +
            '<div class="field" style="margin:0"><label>地点</label><input class="input up-loc" placeholder="例如：成都 · 玉林路" value=""></div>' +
            '<div class="field" style="margin:0"><label>日期</label><input class="input up-date" type="date" value="' + iso + '"></div>' +
          '</div>' +
          '<div class="field up-cap" style="margin:0"><label>想说的话</label><textarea class="input textarea up-cap" placeholder="这家店的面很香，下次还要一起来。"></textarea></div>' +
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

      item.querySelector('.up-remove').addEventListener('click', function () { removeFileAt(i); });
      item.querySelectorAll('.tag-opt').forEach(function (badge) {
        badge.addEventListener('click', function () {
          const on = badge.classList.toggle('active');
          const c = companionByKey(badge.dataset.key);
          badge.style.borderColor = on && c ? c.color : '';
        });
      });
      els.uploadList.appendChild(item);
    });
  }

  function collectEntries() {
    const entries = [];
    const items = els.uploadList.querySelectorAll('.upload-item');
    items.forEach(function (item) {
      const idx = Number(item.dataset.i);
      const file = pendingFiles[idx];
      if (!file) return;
      const tags = [];
      item.querySelectorAll('.tag-opt.active').forEach(function (b) { tags.push(b.dataset.key); });
      entries.push({
        file: file,
        location: item.querySelector('.up-loc').value.trim(),
        date: item.querySelector('.up-date').value,
        caption: item.querySelector('.up-cap').value.trim(),
        tags: tags,
        author: currentUser
      });
    });
    return entries;
  }

  async function doUpload() {
    const entries = collectEntries();
    if (!entries.length) { toast('先选几张照片吧', 'err'); return; }

    els.uploadBtn.disabled = true;
    els.uploadBtn.textContent = '正在上传…';
    try {
      // 逐张压缩
      const prepared = [];
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        els.uploadBtn.textContent = '压缩第 ' + (i + 1) + '/' + entries.length + ' 张…';
        const dataUrl = await compressImage(e.file);
        prepared.push({
          id: genId(),
          dataUrl: dataUrl,
          location: e.location,
          date: e.date,
          caption: e.caption,
          tags: e.tags,
          author: e.author
        });
      }
      els.uploadBtn.textContent = '写入照片 ' + prepared.length + ' 张…';
      const n = await uploadPhotos(prepared);
      pendingFiles = [];
      renderUploadList();
      if (lsGet(MODE_KEY) === 'github' && !lsGet('om_token')) {
        toast('照片已存入本机，配置 Token 后需重新上传才会同步到 GitHub', 'ok');
      } else {
        toast('上传成功 ' + n + ' 张，展览页已更新', 'ok');
      }
      refreshManageList();
    } catch (err) {
      toast('上传失败：' + err.message, 'err');
    } finally {
      els.uploadBtn.disabled = false;
      els.uploadBtn.textContent = '全部上传';
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

      const url = detectMode() === 'github'
        ? 'https://raw.githubusercontent.com/' + SITE.repoOwner + '/' + SITE.repoName + '/main/' + p.file
        : '';

      item.innerHTML =
        '<div class="m-thumb"><img src="' + url + '" alt="" onerror="this.style.display=\'none\'"></div>' +
        '<div class="m-info">' +
          '<div class="m-loc">' + esc(p.location || '地点待补充') + '</div>' +
          '<div class="m-cap">' + esc(p.caption || '没有留下文字') + '</div>' +
          '<div class="m-date">' + esc(fmtDate(p.date || p.created)) + ' · 上传于 ' + esc(fmtDateTime(p.created)) + '</div>' +
        '</div>' +
        '<div class="m-ops">' +
          '<button class="btn btn-ghost btn-sm op-edit">编辑</button>' +
          '<button class="btn btn-danger btn-sm op-del">删除</button>' +
        '</div>';

      item.querySelector('.op-del').addEventListener('click', function () {
        if (!confirm('确定删除这张照片吗？')) return;
        deletePhoto(p.id, currentUser).then(function () {
          toast('已删除', 'ok');
          refreshManageList();
        }).catch(function (err) { toast('删除失败：' + err.message, 'err'); });
      });

      item.querySelector('.op-edit').addEventListener('click', function () {
        startEdit(p.id, p);
      });

      els.manageList.appendChild(item);
      if (detectMode() !== 'github' && p.id) {
        getBlobDB(p.id).then(function (blob) {
          if (blob) item.querySelector('.m-thumb img').src = URL.createObjectURL(blob);
        });
      }
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
          tags: tags
        };
        updatePhoto(id, patch, currentUser).then(function () {
          editArea.remove();
          editingId = null;
          toast('已保存', 'ok');
          refreshManageList();
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
      try {
        const res = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + t } });
        if (res.ok) {
          const me = await res.json();
          toast('Token 有效：' + (me.login || 'OK'), 'ok');
          setMode('github');
          refreshModeBar();
          refreshManageList();
        } else {
          toast('Token 无效（' + res.status + '），请检查权限', 'err');
          lsDel(TOKEN_KEY);
          refreshModeBar();
        }
      } catch (e) {
        toast('无法连接 GitHub，请检查网络', 'err');
        refreshModeBar();
      } finally {
        els.tokenSave.disabled = false;
        els.tokenSave.textContent = '保存并验证';
      }
    });

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
    els.uploadBtn.addEventListener('click', doUpload);
    document.getElementById('logoutBtn').addEventListener('click', function () {
      sessionStorage.removeItem('om_session');
      sessionStorage.removeItem('om_session_name');
      location.href = 'index.html';
    });
    refreshManageList();
  }

  init();
})();
