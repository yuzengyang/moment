/* ============ 登录页逻辑 ============ */

(function () {
  'use strict';

  const userInput = document.getElementById('user');
  const passInput = document.getElementById('pass');
  const errBox = document.getElementById('loginErr');
  const form = document.getElementById('loginForm');

  /* 两个账号快捷按钮 */
  document.querySelectorAll('.account-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.account-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      userInput.value = btn.dataset.user;
      errBox.classList.remove('show');
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const user = userInput.value.trim().toLowerCase();
    const pass = passInput.value;

    if (!ACCOUNTS[user] || ACCOUNTS[user].password !== pass) {
      errBox.textContent = '账号或密码不对，再试试？';
      errBox.classList.add('show');
      return;
    }

    // 记住登录状态（仅本次会话）
    sessionStorage.setItem('om_session', user);
    sessionStorage.setItem('om_session_name', ACCOUNTS[user].name);
    localStorage.setItem('om_user', user);
    location.href = 'admin.html';
  });

  // 自动填入已登录账号
  const cur = sessionStorage.getItem('om_session');
  if (cur && ACCOUNTS[cur]) {
    userInput.value = cur;
    const btn = document.querySelector('.account-btn[data-user="' + cur + '"]');
    if (btn) btn.classList.add('active');
  }
})();
