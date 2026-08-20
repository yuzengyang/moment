/* ============ 展览页逻辑 ============ */

(function () {
  'use strict';

  let photos = [];
  let currentIndex = -1;
  const SHOW_INITIAL = 12;   // 主页默认展示最新 12 组
  let expanded = false;      // 是否展开全部
  let filterCategory = 'all'; // 分类筛选：all | scenery | food | us
  let currentList = [];        // 当前实际展示的照片列表（含分类筛选）

  const grid = document.getElementById('grid');
  const countEl = document.getElementById('photoCount');
  const syncEl = document.getElementById('syncState');
  const emptyEl = document.getElementById('emptyState');
  const backdrop = document.getElementById('modal');
  const modalImg = document.getElementById('modalImg');
  const modalLoc = document.getElementById('modalLoc');
  const modalDate = document.getElementById('modalDate');
  const modalCap = document.getElementById('modalCap');
  const modalWho = document.getElementById('modalWho');
  const modalBadges = document.getElementById('modalBadges');
  const modalCount = document.getElementById('modalCount');

  modalImg.addEventListener('error', function () {
    const cur = modalImg.src;
    const m1 = cur.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/main\/(.+)/);
    if (m1) { modalImg.src = 'https://' + m1[1] + '.github.io/' + m1[2] + '/' + m1[3]; return; }
    const m2 = cur.match(/https:\/\/([^/]+)\.github\.io\/([^/]+)\/(.+)/);
    if (m2) { modalImg.src = 'https://cdn.jsdelivr.net/gh/' + m2[1] + '/' + m2[2] + '@main/' + m2[3]; return; }
    if (cur.indexOf('blob:') !== 0) modalImg.src = PLACEHOLDER;
  });

  const PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#FDF1E7"/>' +
    '<circle cx="200" cy="160" r="52" fill="#FFB6A3" opacity="0.5"/>' +
    '<path d="M200 202c-30-17-47-34-47-54 0-15 11-26 25-26 9 0 18 5 22 13 4-8 13-13 22-13 14 0 25 11 25 26 0 20-17 37-47 54z" fill="#F2767E" opacity="0.75"/>' +
    '<path d="M118 296a26 26 0 0 1 4-51.6A36 36 0 0 1 226 222a30 30 0 0 1 44 29.5H118z" fill="#fff" opacity="0.85"/></svg>');

  const SOURCE_LABEL = {
    'local': '本机演示模式',
    'static': '静态档案',
    'github-live': '已连接 GitHub · 实时'
  };

  /* ---------- 渲染 ---------- */

  function buildCard(p, idx, groupCount) {
    const card = document.createElement('article');
    card.className = 'photo-card reveal';
    card.dataset.idx = idx;

    const locHtml = p.location
      ? '<span class="loc-chip">' + svgPin() + esc(p.location) + '</span>'
      : '<span class="loc-chip" style="opacity:.75">' + svgPin() + '地点待补充</span>';
    const capHtml = p.caption ? '<p class="cap">' + esc(p.caption) + '</p>' : '<p class="cap" style="opacity:.5">没有留下文字</p>';

    const groupBadge = groupCount > 1 ? '<span class="grp-badge">共 ' + groupCount + ' 张</span>' : '';
    card.innerHTML =
      '<div class="thumb">' +
        '<img data-src="' + esc(p.url || '') + '" alt="' + esc(p.location || '照片') + '" loading="lazy">' +
        locHtml + groupBadge +
      '</div>' +
      '<div class="meta">' + capHtml +
        '<div class="row">' +
          '<span class="date">' + esc(fmtDate(p.date || p.created)) + (p.category ? ' · <span style="color:' + categoryColor(p.category) + '">' + esc(categoryName(p.category)) + '</span>' : '') + '</span>' +
          (p.author ? '<span class="who">' + esc(authorName(p.author)) + ' 记录</span>' : '') +
        '</div>' +
      '</div>';

    const img = card.querySelector('img');
    img.addEventListener('load', function () { img.classList.add('loaded'); });
    img.addEventListener('error', function () { fallbackImg(img); });

    card.addEventListener('click', function () { openModal(idx); });
    grid.appendChild(card);
  }

  function render() {
    grid.innerHTML = '';
    emptyEl.style.display = photos.length ? 'none' : 'block';
    syncEl.style.display = 'none';

    const filtered = filterCategory === 'all'
      ? photos
      : photos.filter(function (p) { return p.category === filterCategory; });
    countEl.innerHTML = '<b>' + filtered.length + '</b> 段时光';
    // 按组渲染：同 groupId 的照片合并为一张卡片；默认展示 12 组
    const allGroups = [];
    const gmap = {};
    filtered.forEach(function (p) {
      const gid = p.groupId || p.id;
      if (!gmap[gid]) { gmap[gid] = []; allGroups.push(gmap[gid]); }
      gmap[gid].push(p);
    });
    const shownGroups = expanded ? allGroups : allGroups.slice(0, SHOW_INITIAL);
    currentList = [];
    shownGroups.forEach(function (g) { currentList = currentList.concat(g); });
    let flatIdx = 0;
    shownGroups.forEach(function (group) {
      buildCard(group[0], flatIdx, group.length);
      flatIdx += group.length;
    });
    lazyLoad();

    const moreWrap = document.getElementById('moreWrap');
    const moreBtn = document.getElementById('moreBtn');
    const shownTotal = allGroups.length;
    if (shownTotal > SHOW_INITIAL && moreWrap) {
      moreWrap.style.display = 'block';
      moreBtn.innerHTML = expanded ? '收起 <span class="m-arrow">▴</span>' : '更多 <span class="m-arrow">▾</span>';
      moreBtn.title = '还有 ' + (shownTotal - SHOW_INITIAL) + ' 张照片';
    } else if (moreWrap) {
      moreWrap.style.display = 'none';
    }
  }

  /* 懒加载 + 入场动画 */
  function lazyLoad() {
    const imgs = grid.querySelectorAll('img[data-src]');
    const cards = grid.querySelectorAll('.photo-card.reveal');
    if (!('IntersectionObserver' in window)) {
      imgs.forEach(function (img) { img.src = img.dataset.src; });
      cards.forEach(function (c) { c.classList.add('in'); });
      return;
    }
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        const el = en.target;
        if (el.tagName === 'IMG') {
          el.src = el.dataset.src;
          el.removeAttribute('data-src');
        } else {
          el.classList.add('in');
        }
        io.unobserve(el);
      });
    }, { rootMargin: '120px' });
    imgs.forEach(function (img) { io.observe(img); });
    cards.forEach(function (c) { io.observe(c); });
  }

  /* ---------- 详情弹窗 ---------- */

  function openModal(idx) {
    currentIndex = idx;
    fillModal();
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  function step(dir) {
    if (!currentList.length) return;
    currentIndex = (currentIndex + dir + currentList.length) % currentList.length;
    fillModal();
  }

  function fillModal() {
    const p = currentList[currentIndex];
    if (!p) return;
    modalImg.src = p.url || '';
    modalImg.alt = p.location || '照片';
    modalCount.textContent = (currentIndex + 1) + ' / ' + currentList.length;
    modalLoc.textContent = p.location || '地点待补充';
    modalDate.textContent = (p.date ? fmtDate(p.date) + ' · ' : '') + '上传于 ' + fmtDateTime(p.created);
    modalCap.textContent = p.caption || '这张照片还没有写下故事。';
    modalWho.textContent = p.author ? authorName(p.author) + ' 记录' : '';
    modalBadges.innerHTML = companionBadges(p.tags);
    renderComments(p.id);
  }

  /* 评论区：有 token 者可评论 */
  function renderComments(photoId) {
    const list = document.getElementById('cmtList');
    const form = document.getElementById('cmtForm');
    list.innerHTML = '';
    loadComments(photoId).then(function (cmts) {
      if (!cmts.length) {
        list.innerHTML = '<p class="cmt-empty">还没有评论</p>';
        return;
      }
      cmts.forEach(function (c) {
        const item = document.createElement('div');
        item.className = 'cmt-item';
        const who = (c.author && ACCOUNTS[c.author]) ? authorName(c.author) : '我们';
        item.innerHTML =
          '<span class="cmt-author" style="color:' + authorColor(c.author) + '">' + esc(who) + '</span>' +
          '<span class="cmt-content">' + esc(c.content) + '</span>' +
          '<span class="cmt-time">' + esc(fmtDateOnly(c.time)) + '</span>';
        list.appendChild(item);
      });
    }).catch(function () {
      list.innerHTML = '<p class="cmt-empty">评论加载失败，请刷新重试</p>';
    });
    form.style.display = lsGet(TOKEN_KEY) ? '' : 'none';
  }

  /* ---------- 工具 ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 图片加载失败逐级兜底：raw（实时）→ jsDelivr CDN → Pages 静态 → 占位图 */
  function fallbackImg(img) {
    const cur = img.src;
    if (cur.indexOf('raw.githubusercontent.com') > -1) {
      // raw 失败 → Pages 静态（约1-2分钟更新）
      const m = cur.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/main\/(.+)/);
      if (m) img.src = 'https://' + m[1] + '.github.io/' + m[2] + '/' + m[3];
      else { img.src = PLACEHOLDER; img.classList.add('loaded'); }
    } else if (cur.indexOf('github.io') > -1) {
      // Pages 失败 → jsDelivr（缓存最长12h）
      const m = cur.match(/https:\/\/([^/]+)\.github\.io\/([^/]+)\/(.+)/);
      if (m) img.src = 'https://cdn.jsdelivr.net/gh/' + m[1] + '/' + m[2] + '@main/' + m[3];
      else { img.src = PLACEHOLDER; img.classList.add('loaded'); }
    } else if (cur.indexOf('cdn.jsdelivr.net') > -1) {
      img.src = PLACEHOLDER;
      img.classList.add('loaded');
    } else if (cur.indexOf('blob:') !== 0) {
      img.src = PLACEHOLDER;
      img.classList.add('loaded');
    }
  }

  function svgPin() {
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  }

  /* ---------- 事件 ---------- */

  backdrop.addEventListener('click', function (e) {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (!backdrop.classList.contains('open')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalPrev').addEventListener('click', function () { step(-1); });
  document.getElementById('modalNext').addEventListener('click', function () { step(1); });
  const moreBtn = document.getElementById('moreBtn');
  if (moreBtn) {
    moreBtn.addEventListener('click', function () {
      expanded = !expanded;
      render();
    });
  }

  const cmtSubmit = document.getElementById('cmtSubmit');
  if (cmtSubmit) {
    cmtSubmit.addEventListener('click', function () {
      const input = document.getElementById('cmtInput');
      const content = input.value.trim();
      if (!content) return;
      const p = currentList[currentIndex];
      if (!p) return;
      cmtSubmit.disabled = true;
      const author = lsGet('om_user') || 'owner';
      addComment(p.id, content, author).then(function () {
        input.value = '';
        cmtSubmit.disabled = false;
        renderComments(p.id);
      }).catch(function (err) {
        cmtSubmit.disabled = false;
        alert('评论失败：' + err.message);
      });
    });
  }

  const catFilter = document.getElementById('catFilter');
  if (catFilter) {
    catFilter.addEventListener('click', function (e) {
      const chip = e.target.closest ? e.target.closest('.cat-chip') : null;
      if (!chip) return;
      filterCategory = chip.dataset.cat;
      expanded = false;
      catFilter.querySelectorAll('.cat-chip').forEach(function (c) {
        c.classList.toggle('active', c === chip);
      });
      render();
    });
  }

  /* ---------- 回到顶部 ---------- */

  const backTop = document.createElement('button');
  backTop.className = 'back-top';
  backTop.setAttribute('aria-label', '回到顶部');
  backTop.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
  document.body.appendChild(backTop);
  backTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('scroll', function () {
    backTop.classList.toggle('show', window.scrollY > 600);
  }, { passive: true });

  /* ---------- 启动 ---------- */

  async function init() {
    try {
      const res = await loadGalleryPhotos();
      photos = res.photos;
      photos._source = res.source;

      // 本地模式：监听其他标签页的上传，自动刷新
      window.addEventListener('storage', function (e) {
        if (e.key === LOCAL_META_KEY || e.key === 'om_sync') reload();
      });
    } catch (e) {
      photos = [];
      photos._source = 'static';
    }
    render();
    fillUpdatedInfo();
    renderMessages();
    renderPlans();
  }

  async function reload() {
    const res = await loadGalleryPhotos();
    photos = res.photos;
    photos._source = res.source;
    render();
    fillUpdatedInfo();
    renderMessages();
    renderPlans();
  }

  /* ---------- 留言板 ---------- */

  const gbList = document.getElementById('gbList');
  const gbForm = document.getElementById('gbForm');
  const gbName = document.getElementById('gbName');
  const gbContent = document.getElementById('gbContent');
  const gbFeedback = document.getElementById('gbFeedback');

  function renderMessages() {
    loadMessages().then(function (msgs) {
      gbList.innerHTML = '';
      if (!msgs || !msgs.length) {
        gbList.innerHTML = '<p class="gb-empty">还没有留言，来抢沙发吧</p>';
        return;
      }
      msgs.forEach(function (m) {
        const item = document.createElement('div');
        item.className = 'gb-item';
        const avatar = (m.name || '匿').charAt(0);
        item.innerHTML =
          '<div class="gb-avatar">' + esc(avatar) + '</div>' +
          '<div class="gb-body">' +
            '<div class="gb-meta"><span class="gb-name">' + esc(m.name || '匿名') + '</span><span class="gb-time">' + esc(fmtDateOnly(m.time)) + '</span></div>' +
            '<div class="gb-content">' + esc(m.content) + '</div>' +
          '</div>';
        gbList.appendChild(item);
      });
    });
  }

  if (gbForm) {
    gbForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const name = gbName.value.trim();
      const content = gbContent.value.trim();
      if (!name || !content) {
        gbFeedback.textContent = '请填写名字和想说的话';
        gbFeedback.className = 'gb-feedback err';
        return;
      }
      const btn = gbForm.querySelector('button');
      btn.disabled = true;
      btn.textContent = '发送中…';
      addMessage(name, content).then(function (res) {
        gbName.value = '';
        gbContent.value = '';
        gbFeedback.textContent = res.synced ? '留言成功，谢谢你的足迹 ♥' : '留言成功（当前设备未同步，仅本机可见）';
        gbFeedback.className = 'gb-feedback ok';
        renderMessages();
        btn.disabled = false;
        btn.textContent = '留下足迹';
      }).catch(function (err) {
        gbFeedback.textContent = '发送失败：' + err.message;
        gbFeedback.className = 'gb-feedback err';
        btn.disabled = false;
        btn.textContent = '留下足迹';
      });
    });
  }

  /* ---------- 周计划 ---------- */

  const planBox = document.getElementById('weeklyPlan');

  function renderPlans() {
    loadPlans().then(function (plans) {
      if (!plans || !plans.length) {
        planBox.innerHTML = '';
        return;
      }
      const cur = plans[0];
      const st = planStatus(cur);
      const who = authorName(cur.submitter);

      let statusHtml = '';
      if (st === 'pending') {
        statusHtml = '<div class="wp-countdown" id="wpCountdown">剩余 ' + fmtCountdown(cur.deadline) + '</div>';
      } else if (st === 'scored') {
        const pass = cur.score >= 60;
        statusHtml = '<div class="wp-score ' + (pass ? 'pass' : 'fail') + '">' + cur.score + ' 分 · ' + (pass ? '合格 ✓' : '不合格') + '</div>' +
          '<div class="wp-meta">由 ' + authorName(cur.scoredBy) + ' 评分</div>';
      } else {
        statusHtml = '<div class="wp-score fail">已过期 · 未评分</div>';
      }

      const hist = plans.slice(1).map(function (p) {
        const s = planStatus(p);
        const line = s === 'scored' ? (p.score + ' 分 · ' + (p.score >= 60 ? '合格' : '不合格')) : (s === 'expired' ? '已过期未评分' : '进行中');
        return '<div class="wp-hist-item"><span>' + esc(p.content) + '</span><span class="wp-hist-score">' + esc(line) + '</span></div>';
      }).join('');

      planBox.innerHTML =
        '<div class="wp-head"><div class="wp-title">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="#FFB6A3"><path d="M12 21s-7-4.6-9.3-9A5.4 5.4 0 0 1 12 6.3 5.4 5.4 0 0 1 21.3 12C19 16.4 12 21 12 21z"/></svg>' +
          '<h2>周计划</h2>' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="#FFB6A3"><path d="M12 21s-7-4.6-9.3-9A5.4 5.4 0 0 1 12 6.3 5.4 5.4 0 0 1 21.3 12C19 16.4 12 21 12 21z"/></svg>' +
        '</div><p>一周一约，互相督促</p></div>' +
        '<div class="wp-card">' +
          '<div class="wp-content">' + esc(cur.content) + '</div>' +
          '<div class="wp-meta">' + esc(who) + ' 提交 · ' + esc(fmtDateOnly(cur.startTime)) + '</div>' +
          statusHtml +
        '</div>' +
        (hist ? '<div class="wp-hist-title">过去周计划</div><div class="wp-hist">' + hist + '</div>' : '');

      // 倒计时实时刷新
      if (st === 'pending') {
        clearInterval(window.__wpTimer);
        window.__wpTimer = setInterval(function () {
          const el = document.getElementById('wpCountdown');
          if (el) el.textContent = '剩余 ' + fmtCountdown(cur.deadline);
          else clearInterval(window.__wpTimer);
        }, 1000);
      } else {
        clearInterval(window.__wpTimer);
      }
    });
  }

  function fillUpdatedInfo() {
    const el = document.getElementById('updatedInfo');
    if (!el) return;
    loadUpdatedInfo().then(function (info) {
      if (!info.updated) { el.textContent = ''; return; }
      el.textContent = '最后更新：' + fmtDateOnly(info.updated);
    });
  }

  /* 展览页自动同步：每 10 秒检查 GitHub 上的最新元数据，有更新自动重渲染 */
  let lastUpdated = null;
  setInterval(async function () {
    if (photos._source === 'local') return;
    const meta = await loadGithubMetaAnon();
    if (!meta || !meta.updated) return;
    if (lastUpdated === null) { lastUpdated = meta.updated; return; }
    if (meta.updated !== lastUpdated) {
      lastUpdated = meta.updated;
      reload();
    }
  }, 10000);

  init();
})();
