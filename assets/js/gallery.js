/* ============ 展览页逻辑 ============ */

(function () {
  'use strict';

  let photos = [];
  let currentIndex = -1;
  const SHOW_INITIAL = 12;   // 主页默认展示最新 12 张
  let expanded = false;      // 是否展开全部

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
    if (m1) { modalImg.src = 'https://cdn.jsdelivr.net/gh/' + m1[1] + '/' + m1[2] + '@main/' + m1[3]; return; }
    const m2 = cur.match(/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@]+)@main\/(.+)/);
    if (m2) { modalImg.src = 'https://' + m2[1] + '.github.io/' + m2[2] + '/' + m2[3]; return; }
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

  function buildCard(p, idx) {
    const card = document.createElement('article');
    card.className = 'photo-card reveal';
    card.dataset.idx = idx;

    const locHtml = p.location
      ? '<span class="loc-chip">' + svgPin() + esc(p.location) + '</span>'
      : '<span class="loc-chip" style="opacity:.75">' + svgPin() + '地点待补充</span>';
    const capHtml = p.caption ? '<p class="cap">' + esc(p.caption) + '</p>' : '<p class="cap" style="opacity:.5">没有留下文字</p>';

    card.innerHTML =
      '<div class="thumb">' +
        '<img data-src="' + esc(p.url || '') + '" alt="' + esc(p.location || '照片') + '" loading="lazy">' +
        locHtml +
      '</div>' +
      '<div class="meta">' + capHtml +
        '<div class="row">' +
          '<span class="date">' + esc(fmtDate(p.date || p.created)) + '</span>' +
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
    countEl.innerHTML = '<b>' + photos.length + '</b> 段时光';
    syncEl.innerHTML = '<span class="pulse-dot"></span>' + (SOURCE_LABEL[photos._source] || '');

    const visible = expanded ? photos : photos.slice(0, SHOW_INITIAL);
    visible.forEach(function (p, idx) { buildCard(p, idx); });
    lazyLoad();

    const moreWrap = document.getElementById('moreWrap');
    const moreBtn = document.getElementById('moreBtn');
    if (photos.length > SHOW_INITIAL && moreWrap) {
      moreWrap.style.display = 'block';
      moreBtn.textContent = expanded ? '收起' : '查看更多照片（共 ' + photos.length + ' 张）';
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
    if (!photos.length) return;
    currentIndex = (currentIndex + dir + photos.length) % photos.length;
    fillModal();
  }

  function fillModal() {
    const p = photos[currentIndex];
    if (!p) return;
    modalImg.src = p.url || '';
    modalImg.alt = p.location || '照片';
    modalCount.textContent = (currentIndex + 1) + ' / ' + photos.length;
    modalLoc.textContent = p.location || '地点待补充';
    modalDate.textContent = (p.date ? fmtDate(p.date) + ' · ' : '') + '上传于 ' + fmtDateTime(p.created);
    modalCap.textContent = p.caption || '这张照片还没有写下故事。';
    modalWho.textContent = p.author ? authorName(p.author) + ' 记录' : '';
    modalBadges.innerHTML = companionBadges(p.tags);
  }

  /* ---------- 工具 ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 页脚更新日期：只显示 YYYY-MM-DD */
  function fmtDateOnly(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* 图片加载失败逐级兜底：raw（实时）→ jsDelivr CDN → Pages 静态 → 占位图 */
  function fallbackImg(img) {
    const cur = img.src;
    if (cur.indexOf('raw.githubusercontent.com') > -1) {
      const m = cur.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/main\/(.+)/);
      if (m) img.src = 'https://cdn.jsdelivr.net/gh/' + m[1] + '/' + m[2] + '@main/' + m[3];
      else { img.src = PLACEHOLDER; img.classList.add('loaded'); }
    } else if (cur.indexOf('cdn.jsdelivr.net') > -1) {
      const m = cur.match(/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@]+)@main\/(.+)/);
      if (m) img.src = 'https://' + m[1] + '.github.io/' + m[2] + '/' + m[3];
      else { img.src = PLACEHOLDER; img.classList.add('loaded'); }
    } else if (cur.indexOf('github.io') > -1) {
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
  }

  async function reload() {
    const res = await loadGalleryPhotos();
    photos = res.photos;
    photos._source = res.source;
    render();
    fillUpdatedInfo();
  }

  function fillUpdatedInfo() {
    const el = document.getElementById('updatedInfo');
    if (!el) return;
    loadUpdatedInfo().then(function (info) {
      if (!info.updated) { el.textContent = ''; return; }
      el.textContent = '最后更新：' + fmtDateOnly(info.updated);
    });
  }

  /* 展览页自动同步：每 30 秒检查 GitHub 上的最新元数据，有更新自动重渲染 */
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
