// ==UserScript==
// @name         칭찬모아 미션 포인트 지급
// @namespace    kids-study
// @version      1.1.0
// @description  체크 앱에서 엄마가 확인한 미션 포인트를 칭찬모아 "포인트 지급하기" 화면에서 직접입력으로 지급해요.
// @match        https://*.chingchanmoa.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        unsafeWindow
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://zzzmk1-tech.github.io/mission/mission-points.user.js
// @downloadURL  https://zzzmk1-tech.github.io/mission/mission-points.user.js
// ==/UserScript==

(function () {
  'use strict';

  // 체크 앱(구글 Apps Script) 웹앱 주소
  const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwuSrzkEBAv1Bnr74_DulKxS5ylLN3Fbe78PHnMBbjxef680qhcidPUZewQSylVHoD5pw/exec';

  // ---------- 저장 / 통신 ----------

  async function getStored(name) {
    try { if (typeof GM !== 'undefined' && GM.getValue) return await GM.getValue(name, ''); } catch (e) {}
    try { if (typeof GM_getValue === 'function') return GM_getValue(name, ''); } catch (e) {}
    try { return localStorage.getItem('kidsStudy.' + name) || ''; } catch (e) { return ''; }
  }

  async function setStored(name, value) {
    try { if (typeof GM !== 'undefined' && GM.setValue) return await GM.setValue(name, value); } catch (e) {}
    try { if (typeof GM_setValue === 'function') return GM_setValue(name, value); } catch (e) {}
    try { localStorage.setItem('kidsStudy.' + name, value); } catch (e) {}
  }

  function httpGet(url) {
    const req = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest
      : (typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null);
    if (!req) return Promise.reject(new Error('스크립트 확장 프로그램에서 실행해 주세요'));
    return new Promise(function (resolve, reject) {
      req({
        method: 'GET', url: url,
        onload: function (r) {
          try { resolve(JSON.parse(r.responseText)); }
          catch (e) { reject(new Error('체크 앱 응답을 읽을 수 없어요')); }
        },
        onerror: function () { reject(new Error('체크 앱에 연결할 수 없어요')); },
      });
    });
  }

  async function api(params) {
    const key = await getStored('key');
    const q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    const res = await httpGet(WEBAPP_URL + '?key=' + encodeURIComponent(key) + '&' + q);
    if (!res.ok) throw new Error(res.error || '체크 앱 오류');
    return res;
  }

  // ---------- 화면 도우미 ----------

  // 칭찬모아 화면 자체의 함수(preview_get 등)를 부를 때 쓰는 window
  const PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

  function callPage(name) {
    try { if (typeof PAGE[name] === 'function') { PAGE[name](); return true; } } catch (e) {}
    return false;
  }

  function fire(el, type) {
    const ev = /^key/.test(type) ? new KeyboardEvent(type, { bubbles: true, cancelable: true })
      : new Event(type, { bubbles: true, cancelable: true });
    try { el.dispatchEvent(ev); } catch (e) {}
  }

  const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  async function waitFor(fn, ms) {
    const end = Date.now() + (ms || 5000);
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(150);
    }
    return null;
  }

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  const norm = function (s) { return (s || '').replace(/\s+/g, ' ').trim(); };

  // 글자가 정확히 같은 화면 요소들 (가장 안쪽 요소만)
  function byText(text, root) {
    const out = [];
    (root || document).querySelectorAll('body *').forEach(function (el) {
      if (el.id === 'kids-study-btn' || !visible(el) || norm(el.textContent) !== text) return;
      const child = Array.prototype.some.call(el.children, function (c) { return norm(c.textContent) === text; });
      if (!child) out.push(el);
    });
    return out;
  }

  function clickable(el) {
    return el.closest('button, a, label, [role="button"], [role="option"], li') || el;
  }

  function click(el) {
    const t = clickable(el);
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(function (type) {
      // view는 넣지 않아요 (Firefox 확장 프로그램의 window는 화면의 window와 달라서 오류가 나요)
      try { t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })); } catch (e) {}
    });
    t.click();
  }

  // 리액트 같은 화면에서도 값이 들어가도록
  function setValue(el, value) {
    // 요소 자신의 원형에서 value 설정 함수를 찾아요 (Firefox 확장 프로그램에서도 동작하게)
    let proto = Object.getPrototypeOf(el);
    let desc = null;
    while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, 'value'))) proto = Object.getPrototypeOf(proto);
    try {
      desc.set.call(el, String(value));
    } catch (e) {
      el.value = String(value);
    }
    if (el.tagName === 'SELECT' && el.value !== String(value)) {
      Array.prototype.forEach.call(el.options, function (o) { o.selected = o.value === String(value); });
    }
    // 칭찬모아는 키를 뗄 때(keyup) 지급 요약을 다시 계산해서, keyup까지 보내요
    ['input', 'keyup', 'change'].forEach(function (t) { fire(el, t); });
  }

  function inputByPlaceholder(word) {
    return Array.prototype.filter.call(document.querySelectorAll('input, textarea'), function (el) {
      return visible(el) && (el.getAttribute('placeholder') || '').indexOf(word) >= 0;
    })[0];
  }

  function balance() {
    const cp = document.getElementById('corp_point');
    if (cp && /\d/.test(cp.textContent)) return Number(cp.textContent.replace(/[^\d]/g, ''));
    const label = byText('학원 보유 포인트')[0];
    if (!label) return null;
    let box = label.parentElement;
    for (let i = 0; i < 3 && box; i++) {
      const m = norm(box.textContent).replace('학원 보유 포인트', '').match(/([\d,]+)/);
      if (m) return Number(m[1].replace(/,/g, ''));
      box = box.parentElement;
    }
    return null;
  }

  function onPayPage() {
    return byText('직접입력').length > 0 && byText('지급 미리보기').length > 0;
  }

  // ---------- 지급 순서 ----------

  async function selectClass(cls) {
    const select = Array.prototype.filter.call(document.querySelectorAll('select'), function (s) {
      return Array.prototype.some.call(s.options, function (o) { return norm(o.textContent) === cls; });
    })[0];
    if (select) {
      const opt = Array.prototype.filter.call(select.options, function (o) { return norm(o.textContent) === cls; })[0];
      setValue(select, opt.value);
      return true;
    }
    // 직접 만든 드롭다운: '학급' 아래에 보이는 칸을 눌러 목록을 열고 고르기
    const label = byText('학급')[0];
    if (!label) return false;
    let trigger = null;
    let box = label.parentElement;
    for (let i = 0; i < 3 && box && !trigger; i++) {
      trigger = Array.prototype.filter.call(box.querySelectorAll('button, [role="combobox"], [aria-haspopup], div'), function (el) {
        return visible(el) && el !== label && !el.contains(label) && /^(초|중|고)\d/.test(norm(el.textContent));
      }).pop() || null;
      box = box.parentElement;
    }
    if (!trigger) return false;
    if (norm(trigger.textContent) === cls) return true;
    click(trigger);
    const opt = await waitFor(function () {
      return byText(cls).filter(function (el) { return !trigger.contains(el); })[0];
    }, 3000);
    if (!opt) return false;
    click(opt);
    await sleep(500);
    return true;
  }

  function previewHas(name) {
    const head = byText('지급 미리보기')[0];
    if (!head) return false;
    let box = head.parentElement;
    for (let i = 0; i < 3 && box; i++) {
      if (norm(box.textContent).indexOf(name) >= 0) return true;
      box = box.parentElement;
    }
    return false;
  }

  // 이름으로 시작하는 가장 안쪽 요소들 (예: "권우재 (kwonwj17)")
  function byNameStart(name) {
    const out = [];
    document.querySelectorAll('body *').forEach(function (el) {
      if (el.id === 'kids-study-btn' || !visible(el)) return;
      const t = norm(el.textContent);
      if (t.indexOf(name) !== 0 || t.length > name.length + 40) return;
      const child = Array.prototype.some.call(el.children, function (c) { return norm(c.textContent).indexOf(name) === 0; });
      if (!child) out.push(el);
    });
    return out;
  }

  // 이름 근처(몇 단계 위)에 있는 체크박스
  function checkboxNear(el) {
    let box = el;
    for (let i = 0; i < 5 && box; i++) {
      const cb = box.querySelector('input[type="checkbox"]');
      if (cb) return cb;
      box = box.parentElement;
    }
    return null;
  }

  function studentRow(name) {
    const all = byNameStart(name);
    return all.filter(function (el) { return checkboxNear(el); })[0] || all[0] || null;
  }

  // 체크박스가 있으면 체크 여부로, 없으면 지급 미리보기에 이름이 보이는지로 확인해요
  function studentSelected(name) {
    const row = studentRow(name);
    const cb = row && checkboxNear(row);
    return cb ? cb.checked : previewHas(name);
  }

  // 칭찬모아 학생 목록의 체크박스 (li.ptg-stu 안 input[name=chk_1])
  function siteCheckbox(name) {
    const li = Array.prototype.filter.call(document.querySelectorAll('li.ptg-stu, li.student_li'), function (el) {
      const nm = el.querySelector('.ptg-stu-nm');
      return el.getAttribute('data-nm') === name || (nm && norm(nm.textContent).indexOf(name) === 0);
    })[0];
    return li ? li.querySelector('input[name="chk_1"]') : null;
  }

  async function selectStudent(name) {
    const none = document.getElementById('un_all_sel_btn') || byText('전체 해제')[0];
    if (none) { click(none); await sleep(300); }
    const site = await waitFor(function () { return siteCheckbox(name); }, 5000);
    if (site) {
      if (!site.checked) site.click();
      callPage('student_cnt');
      callPage('preview_get');
      return !!(await waitFor(function () { const cb = siteCheckbox(name); return cb && cb.checked; }, 2000));
    }
    // 화면 구조가 바뀌었을 때: 이름이 적힌 줄을 찾아서 눌러요
    const row = await waitFor(function () { return studentRow(name); }, 3000);
    if (!row) return false;
    if (studentSelected(name)) return true;
    click(row);
    if (await waitFor(function () { return studentSelected(name); }, 1500)) return true;
    const fresh = studentRow(name);
    const cb = fresh && checkboxNear(fresh);
    if (cb && !cb.checked) cb.click();
    return !!(await waitFor(function () { return studentSelected(name); }, 2000));
  }

  async function chooseDirectInput(memo, amount) {
    const mode = document.getElementById('rdo_1_3');
    if (mode) {
      // 직접입력으로 바꾸면 칭찬모아가 내용·포인트 칸을 비우니, 먼저 바꾸고 나서 채워요
      if (!mode.checked) mode.click();
      await sleep(300);
      const praise = document.getElementById('rdo_2_1');
      if (praise && !praise.checked) praise.click();
    } else {
      const direct = byText('직접입력')[0];
      if (!direct) return false;
      click(direct);
      await sleep(400);
      const praise = byText('칭찬').filter(function (el) {
        const p = clickable(el).parentElement;
        return p && norm(p.textContent).indexOf('주의') >= 0;
      })[0];
      if (praise) { click(praise); await sleep(200); }
    }
    const memoInput = await waitFor(function () {
      return document.getElementById('point_title') || inputByPlaceholder('내용');
    }, 3000);
    const pointInput = document.getElementById('point_value') || inputByPlaceholder('포인트');
    if (!memoInput || !pointInput) return false;
    setValue(memoInput, memo);
    setValue(pointInput, amount);
    callPage('preview_get');
    await sleep(300);
    return true;
  }

  // 칭찬모아가 만든 지급 요약(1인당 포인트·내용)이 우리가 넣은 값과 같은지
  function summaryMatches(kid) {
    const total = document.getElementById('_total_point');
    if (!total) return true; // 요약 칸이 없는 화면이면 확인 생략
    const title = document.getElementById('title');
    return Number(total.value) === Number(kid.amount) && (!title || norm(title.textContent) === norm(kid.memo));
  }

  function checkedStudents() {
    return document.querySelectorAll('input[name="chk_1"]:checked').length;
  }

  function payButton() {
    const cta = document.querySelector('a.ptg-cta, .ptg-cta');
    if (cta && visible(cta)) return { el: cta, sure: true };
    // '지급'이 들어간 버튼 중 메뉴·회수·미리보기가 아닌 것
    const cands = Array.prototype.filter.call(document.querySelectorAll('button, [role="button"], a, input[type="submit"], input[type="button"]'), function (el) {
      const t = norm(el.textContent || el.value);
      const r = el.getBoundingClientRect();
      return el.id !== 'kids-study-btn' && visible(el) && r.right > 0 && r.left < window.innerWidth &&
        t.indexOf('지급') >= 0 && t.indexOf('회수') < 0 && t.indexOf('미리보기') < 0 && t.length <= 30 &&
        !el.closest('nav, aside, header, [class*="menu"], [class*="Menu"], [class*="sidebar"], [class*="Sidebar"], [class*="drawer"]');
    });
    const el = cands.sort(function (a, b) {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (rb.left + rb.top + window.scrollY) - (ra.left + ra.top + window.scrollY);
    })[0];
    return el ? { el: el, sure: false } : null;
  }

  async function confirmDialogIfAny() {
    const ok = await waitFor(function () {
      const dlg = document.querySelector('[role="dialog"], [role="alertdialog"], .modal, [class*="modal"], [class*="Modal"]');
      if (!dlg || !visible(dlg)) return null;
      return ['지급하기', '지급', '확인', '예'].map(function (t) { return byText(t, dlg)[0]; }).filter(Boolean)[0];
    }, 2500);
    if (ok) { click(ok); await sleep(800); }
  }

  async function payOne(kid) {
    status(kid.name + ': 학급 ' + kid.cmClass + ' 고르는 중');
    if (!(await selectClass(kid.cmClass))) throw new Error('학급 "' + kid.cmClass + '"을 고르지 못했어요');
    await sleep(600);
    status(kid.name + ': ' + kid.cmName + ' 선택 중');
    if (!(await selectStudent(kid.cmName))) throw new Error(kid.cmName + ' 학생을 선택하지 못했어요');
    status(kid.name + ': 직접입력 채우는 중');
    if (!(await chooseDirectInput(kid.memo, kid.amount))) throw new Error('직접입력 칸을 찾지 못했어요');

    // 칭찬모아 지급 요약이 맞게 만들어졌는지 확인 (안 맞으면 지급하지 않아요)
    if (!(await waitFor(function () { return summaryMatches(kid); }, 3000))) {
      throw new Error('칭찬모아 지급 요약이 만들어지지 않았어요. 지급하지 않았어요');
    }
    const n = checkedStudents();
    if (document.querySelector('input[name="chk_1"]') && n !== 1) {
      throw new Error('학생이 ' + n + '명 선택돼 있어요. 지급하지 않았어요');
    }

    if (!window.confirm(kid.cmName + '에게 ' + kid.amount + '점을 지급할까요?\n내용: ' + kid.memo +
        '\n\n확인을 누르면 칭찬모아가 "[' + kid.amount + '] 포인트 지급을 하시겠습니까?"를 한 번 더 물어봐요. 거기서도 확인을 눌러주세요.')) {
      return false;
    }
    const before = balance();
    const pb = payButton();
    if (!pb) throw new Error('"포인트 지급하기" 버튼을 찾지 못했어요');
    const btn = pb.el;
    if (!pb.sure && !window.confirm('이 버튼을 누를게요: "' + norm(btn.textContent || btn.value) + '"\n맞으면 확인을 눌러주세요.')) return false;
    try { btn.scrollIntoView({ block: 'center' }); } catch (e) {}
    await sleep(300);
    const token = kid.kid + '-' + Date.now();
    click(btn);
    await confirmDialogIfAny();

    let done = false;
    if (before !== null) {
      done = !!(await waitFor(function () { const b = balance(); return b !== null && b <= before - kid.amount; }, 30000));
    }
    if (!done) {
      done = window.confirm('칭찬모아에서 ' + kid.cmName + ' ' + kid.amount + '점 지급이 완료됐나요?\n' +
        '완료됐으면 "확인", 아니면 "취소"를 눌러주세요. (확인을 누르면 체크 앱에 지급 완료로 기록돼요)');
    }
    if (!done) return false;
    await api({ api: 'paid', kid: kid.kid, amount: kid.amount, memo: kid.memo, token: token });
    return true;
  }

  // ---------- 버튼 ----------

  let running = false;

  function status(text) {
    const b = document.getElementById('kids-study-btn');
    if (b) b.textContent = text;
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      if (!(await getStored('key'))) {
        const k = window.prompt('체크 앱 엄마 비밀번호(PARENT_KEY)를 입력해 주세요. 처음 한 번만 물어봐요.');
        if (!k) return;
        await setStored('key', k.trim());
      }
      status('체크 앱에서 포인트 가져오는 중');
      let list;
      try {
        list = await api({ api: 'payout' });
      } catch (e) {
        if (/비밀번호/.test(e.message)) await setStored('key', '');
        throw e;
      }
      const due = list.kids.filter(function (k) { return k.amount > 0; });
      if (!due.length) { window.alert('지금은 지급할 미션 포인트가 없어요.'); return; }
      const total = due.reduce(function (a, k) { return a + k.amount; }, 0);
      const bal = balance();
      const lines = due.map(function (k) { return '· ' + k.cmName + ' ' + k.amount + '점 (' + k.memo + ')'; }).join('\n');
      if (bal !== null && bal < total) {
        window.alert('학원 보유 포인트(' + bal + ')가 부족해요. 필요한 포인트: ' + total + '\n' + lines + '\n\n포인트를 충전한 뒤 다시 눌러주세요.');
        return;
      }
      if (!window.confirm('엄마가 확인한 미션 포인트를 지급할게요.\n' + lines + '\n\n시작할까요?')) return;
      const paid = [];
      for (const kid of due) {
        if (await payOne(kid)) paid.push(kid.cmName + ' ' + kid.amount + '점');
        await sleep(800);
      }
      window.alert(paid.length ? '지급 완료: ' + paid.join(', ') : '지급하지 않았어요.');
    } catch (e) {
      window.alert('멈췄어요: ' + e.message + '\n\n이미 지급된 건 칭찬모아 "회수"·내역에서 확인해 주세요.');
    } finally {
      running = false;
      status('미션 포인트 가져오기');
    }
  }

  function ensureButton() {
    let b = document.getElementById('kids-study-btn');
    const show = onPayPage();
    if (!b && show) {
      b = document.createElement('button');
      b.id = 'kids-study-btn';
      b.type = 'button';
      b.textContent = '미션 포인트 가져오기';
      b.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;padding:14px 18px;' +
        'border:0;border-radius:14px;background:#2f8f5b;color:#fff;font-size:16px;font-weight:700;' +
        'box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;max-width:calc(100vw - 32px)';
      b.addEventListener('click', run);
      document.body.appendChild(b);
    }
    if (b) b.style.display = show || running ? '' : 'none';
  }

  setInterval(ensureButton, 1000);
})();
