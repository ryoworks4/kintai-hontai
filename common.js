/**
 * 勤怠システム — 2画面で共通の部品
 *
 * 裏（Apps Script の Web API）とのやりとり・端末の鍵の保存・登録の画面・知らせの帯。
 * サーバーから来た文字は、必ず textContent で入れる（innerHTML を使わない）。
 */

// ── 送る先（作り方 B）──────────────────────────────────
// 作り方 A（Apps Script の画面）に切り替える時は、送る() の中身だけを google.script.run に差し替える
// 段階1の Apps Script（試作とは別・2026-10-12 公開）。版を上げても同じ URL のまま（README の手順）
var 送り先 = 'https://script.google.com/macros/s/AKfycbyQhAS9pau3buvxC2i_NsqwngyPq5Tg9jsEH49jIdySUjDepyWzaR1V9tgWjcA702av/exec';
// 裏の処理は1.2〜3.3秒で終わる（実行数で確認）。それより遅いのは Google の返事の窓口が崩れている時なので、
// 8秒で切って送り直す方が早く済む（2026-10-11 の計測で決定）。送り直しても二重にならない依頼だけを送り直す
var 応答の待ち時間 = 8000;
var 送り直しの間 = [0, 1000, 3000];   // 送り直しつきで送る() の待ち（ミリ秒）。最大3回

/**
 * 裏に1回送る。返すのは { 届いた, 応答 }。
 * 届いた=false は「送れたか分からない」。通信の失敗・時間切れ・形の違う応答をまとめてこう扱う
 * （公開直後に、打刻を送ったのに別の応答が返ったことがある）。
 * 形が正しいか は ok:true の応答の形を確かめる関数。
 */
function 送る(依頼, 形が正しいか) {
  // どの依頼への返事かを照合するための印。送り直す時は同じ依頼を渡すので、同じ印のまま
  if (!依頼.依頼ID) 依頼.依頼ID = 新しい操作ID();
  var 止め = typeof AbortController === 'function' ? new AbortController() : null;
  var 時間切れ;
  var 待つ = new Promise(function (済む) {
    時間切れ = setTimeout(function () { if (止め) 止め.abort(); 済む(null); }, 応答の待ち時間);
  });
  var 通信 = fetch(送り先, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // CORS の事前確認を起こさない
    body: JSON.stringify(依頼),
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal: 止め ? 止め.signal : undefined
  }).then(function (res) {
    return res.ok ? res.json().catch(function () { return null; }) : null;
  }).catch(function () { return null; });

  return Promise.race([通信, 待つ]).then(function (応答) {
    clearTimeout(時間切れ);
    if (!応答 || typeof 応答 !== 'object' || typeof 応答.ok !== 'boolean') return { 届いた: false };
    // この依頼への返事か（「開く」の返事や、別の依頼の返事ではないか）を、断りの返事も含めて照合する
    if (応答.操作 !== 依頼.操作 || 応答.依頼ID !== 依頼.依頼ID) return { 届いた: false };
    if (応答.ok && 形が正しいか && !形が正しいか(応答)) return { 届いた: false };
    if (!応答.ok && (typeof 応答.コード !== 'string' || typeof 応答.理由 !== 'string')) return { 届いた: false };
    return { 届いた: true, 応答: 応答 };
  });
}

/**
 * 届かなければ送り直す（最大3回）。送り直しても二重にならない依頼に使う：
 * 読むだけ・登録（同じトークンなら登録済みと返る）。
 * 打刻は staff.js が自分で送り直す（押した時刻と「送っています」の表示があるため）
 */
function 送り直しつきで送る(依頼, 形が正しいか) {
  var 回 = 0;
  function 一回() {
    return new Promise(function (済む) { setTimeout(済む, 送り直しの間[回]); })
      .then(function () { return 送る(依頼, 形が正しいか); })
      .then(function (結果) {
        var もう一度 = !結果.届いた || ['混雑', '内部'].indexOf(結果.応答.コード) >= 0;
        回++;
        if (もう一度 && 回 < 送り直しの間.length) return 一回();
        return 結果;
      });
  }
  return 一回();
}

// ── 端末の中の置き場（使えない環境でも画面は動く）───────────────────
// 試作と同じ場所（同じオリジン）に公開しても、試作の登録と混ざらないように分ける
var 置き場の頭 = 'kintai:';

function 取り出す(キー) {
  try {
    var 値 = localStorage.getItem(置き場の頭 + キー);
    return 値 === null ? null : JSON.parse(値);
  } catch (e) { return null; }
}

/** 値に null を渡すと消す。しまえなかったら false */
function しまう(キー, 値) {
  try {
    if (値 === null) localStorage.removeItem(置き場の頭 + キー);
    else localStorage.setItem(置き場の頭 + キー, JSON.stringify(値));
    return true;
  } catch (e) { return false; }
}

/** 端末のトークン（英小文字と数字の64桁の乱数）。登録の画面を出すたびに新しく作る */
function 新しいトークン() {
  var b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
}

function 新しい操作ID() {
  if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  var b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
}

// ── 画面の部品 ─────────────────────────────────────────

/**
 * ほかのページの中に埋め込まれていたら、何もしない（埋め込んだ画面の上から「止める」などを押させる手口を防ぐ）。
 * GitHub Pages ではヘッダーで埋め込みを禁止できず、meta の CSP では frame-ancestors が効かないため。止めたら true
 */
function 埋め込まれていたら止める() {
  var 埋め込み;
  try { 埋め込み = window.top !== window.self; } catch (e) { 埋め込み = true; }
  if (!埋め込み) return false;
  document.body.textContent = '';
  document.body.appendChild(作る('p', { class: 'loading', text: 'この画面は、ほかのページの中では使えません。' }));
  return true;
}

function 要素(id) { return document.getElementById(id); }

/** 要素を作る。属性の text は textContent に入れる。中身の文字は文字のまま入る */
function 作る(タグ, 属性, 中身) {
  var el = document.createElement(タグ);
  Object.keys(属性 || {}).forEach(function (k) {
    if (k === 'text') el.textContent = 属性[k];
    else if (k === 'class') el.className = 属性[k];
    else el.setAttribute(k, 属性[k]);
  });
  (中身 || []).forEach(function (子) {
    if (子 === null || 子 === undefined) return;
    el.appendChild(typeof 子 === 'string' ? document.createTextNode(子) : 子);
  });
  return el;
}

/** 読み込み中・登録・本体 のうち1つだけを見せる */
function 画面を切り替える(見せる) {
  ['読み込み中', '登録', '本体'].forEach(function (id) {
    var el = 要素(id);
    if (el) el.hidden = id !== 見せる;
  });
  // 「？ 使い方」は本体を見せている時だけ（登録の画面・読み込み中・断られた時には出さない）
  var 開く = 要素('使い方を開く');
  if (開く) {
    開く.hidden = 見せる !== '本体';
    if (見せる !== '本体' && 使い方.開いている) 使い方を閉じる();
  }
}

/** 画面の上の知らせの帯。文に null を渡すと消す。ボタン = { 名前, 押したら } */
function 知らせる(文, ボタン) {
  var 帯 = 要素('知らせ');
  帯.textContent = '';
  if (!文) { 帯.hidden = true; return; }
  帯.appendChild(作る('span', { text: 文 }));
  if (ボタン) {
    var b = 作る('button', { type: 'button', class: 'btn', text: ボタン.名前 });
    b.addEventListener('click', function () { 知らせる(null); ボタン.押したら(); });
    帯.appendChild(b);
  }
  帯.hidden = false;
}

// ── 「？ 使い方」（2026-11-24。文言は help.js の 使い方の文・形は見本 2026-11-19）────────────
// 説明は操作する画面と重ねない（2026-11-19 矢作さん）。広い画面は右に並べて画面を縮め、狭い画面（スマホ）は下半分に出して
// 「小さくする」で帯にできる。説明の中の緑のボタンを押すと、画面の本物のボタンが光る。

var 横に並べる幅 = 900;   // これより狭い画面は下半分に出す
var 使い方 = { 画面: '', ページ: '', 開いている: false, 小さい: false, 一言の時計: 0, 光の時計: 0 };

/** 画面 = '代表' / '職員'。ページはタブを選んだ時に 使い方のページ() で渡す */
function 使い方を用意する(画面) {
  使い方.画面 = 画面;
  要素('使い方を開く').addEventListener('click', function () {
    if (使い方.開いている && !使い方.小さい) 使い方を閉じる(); else 使い方を開く();
  });
  要素('使い方を閉じる').addEventListener('click', 使い方を閉じる);
  要素('使い方を小さく').addEventListener('click', function () { 使い方.小さい = !使い方.小さい; 使い方の置き方(); });
  if (typeof window.addEventListener === 'function') window.addEventListener('resize', 使い方の置き方);
}

/** タブを変えた時。開いていれば、そのページの説明に描き直す */
function 使い方のページ(名) {
  使い方.ページ = 名;
  if (使い方.開いている) 使い方を描く();
}

function 使い方を開く() {
  使い方.開いている = true;
  使い方.小さい = false;
  使い方を描く();
  使い方の置き方();
}

function 使い方を閉じる() {
  使い方.開いている = false;
  使い方の置き方();
}

function 横に並べるか() { return (window.innerWidth || 横に並べる幅) >= 横に並べる幅; }

/** 開く・閉じる・小さくする・画面の幅が変わった時に、説明の置き方と、本体の縮め方をそろえる */
function 使い方の置き方() {
  var 面 = 要素('使い方'), 開く = 要素('使い方を開く'), 小 = 要素('使い方を小さく');
  if (!面) return;
  var 横 = 横に並べるか(), 開 = 使い方.開いている, 小さい = 開 && !横 && 使い方.小さい;
  面.hidden = !開;
  面.className = 'help ' + (横 ? 'side' : 'sheet') + (小さい ? ' mini' : '');
  document.body.classList.toggle('help-side', 開 && 横);
  document.body.classList.toggle('help-sheet', 開 && !横 && !小さい);
  document.body.classList.toggle('help-mini', 小さい);
  開く.setAttribute('aria-expanded', String(開 && !小さい));
  小.hidden = 横;
  小.textContent = 小さい ? '⌃' : '⌄';
  小.setAttribute('aria-label', 小さい ? '大きくする' : '小さくする');
}

/** 「[認める] を押す」の [ ] を、画面と同じ緑のボタンにする。押すと画面の本物のボタンが光る */
function ボタン入りの文(タグ, 印, 文) {
  var 箱 = 作る(タグ, 印 ? { class: 印 } : {});
  文.split(/(\[[^\]]+\])/).forEach(function (片) {
    if (!片) return;
    if (片.charAt(0) !== '[') { 箱.appendChild(document.createTextNode(片)); return; }
    var 名 = 片.slice(1, -1);
    var b = 作る('button', { type: 'button', class: 'kbtn', text: 名, title: '画面のこのボタンを光らせる' });
    b.addEventListener('click', function () { ボタンを光らせる(名); });
    箱.appendChild(b);
  });
  return 箱;
}

/** やること1行 → 押す順の流れ → 迷いやすい所 → どのページでも同じこと（閉じておく） */
function 使い方を描く() {
  var 画 = 使い方の文[使い方.画面], 頁 = 画 && 画.ページ[使い方.ページ];
  var 中 = 要素('使い方の中身');
  中.textContent = '';
  要素('使い方の知らせ').hidden = true;
  if (!頁) { 要素('使い方の題').textContent = '使い方'; return; }
  要素('使い方の題').textContent = '「' + 頁.題 + '」の使い方';

  var 上 = 作る('div', { class: 'help-lead' }, [作る('p', { class: 'lead', text: 頁.やること })]);
  if (頁.補足) 上.appendChild(作る('p', { class: 'muted small', text: 頁.補足 }));
  中.appendChild(上);

  if (頁.手順.length) {
    var 順 = 作る('ol', { class: 'help-steps' });
    頁.手順.forEach(function (s, i) {
      var 文 = 作る('div', { class: 'st' }, [ボタン入りの文('p', 'do', s.する)]);
      if (s.結果) 文.appendChild(ボタン入りの文('p', 'res', s.結果));
      if (s.注意) 文.appendChild(ボタン入りの文('p', 'hint', s.注意));
      順.appendChild(作る('li', {}, [作る('span', { class: 'no', text: String(i + 1) }), 文]));
    });
    中.appendChild(順);
  }

  if (頁.迷い.length) {
    var 箱 = 作る('div', { class: 'faq' });
    頁.迷い.forEach(function (q) {
      var 答え = 作る('div', { class: 'ans' });
      q[1].forEach(function (t) { 答え.appendChild(ボタン入りの文('p', '', t)); });
      箱.appendChild(作る('details', {}, [作る('summary', { text: q[0] }), 答え]));
    });
    中.appendChild(作る('div', { class: 'faq-box' }, [作る('p', { class: 'faq-title', text: '迷いやすい所' }), 箱]));
  }

  var 共 = 作る('div', { class: 'in' });
  画.共通.forEach(function (m) {
    var 塊 = 作る('div', { class: 'blk' }, [作る('p', { class: 'bh', text: m.見出し })]);
    m.文.forEach(function (t) { 塊.appendChild(ボタン入りの文('p', 'bt', t)); });
    if (m.記号) {
      塊.appendChild(作る('p', { class: 'legend' }, m.記号.map(function (k) {
        return 作る('span', { class: 'key' }, [作る('b', { text: k[0] }), k[1]]);
      })));
    }
    共.appendChild(塊);
  });
  中.appendChild(作る('details', { class: 'common' }, [作る('summary', { text: 'どのページでも同じこと' }), 共]));
}

/**
 * 説明の [名前] に当たる、いま画面に見えている本物のボタン。id が名前と同じボタン（出勤・退勤・日報を送る など）を先に見て、
 * 無ければ、開いているページと上の知らせの中から、文字が名前と同じボタンを探す。見えていなければ null
 */
function 画面のボタンを探す(名) {
  var 見える = function (el) { return typeof el.getClientRects !== 'function' || el.getClientRects().length > 0; };
  var ボタンか = function (el) { return !!el && String(el.tagName).toLowerCase() === 'button'; };
  var 同じid = 要素(名);
  if (ボタンか(同じid)) return 見える(同じid) ? 同じid : null;
  var 場所 = ['面-' + 使い方.ページ, '待ちの知らせ', '知らせ'].map(要素).filter(function (el) { return el && !el.hidden; });
  for (var i = 0; i < 場所.length; i++) {
    var 候補 = Array.prototype.slice.call(場所[i].querySelectorAll('button'));
    for (var j = 0; j < 候補.length; j++) {
      if (String(候補[j].textContent).trim() === 名 && 見える(候補[j])) return 候補[j];
    }
  }
  return null;
}

function ボタンを光らせる(名) {
  var 画 = 使い方の文[使い方.画面] || {}, 頁 = (画.ページ || {})[使い方.ページ] || {};
  var b = 画面のボタンを探す(名);
  if (!b) {
    var 訳 = (頁.出ていない時 || {})[名] || (画.出ていない時 || {})[名] || 'いまの画面には出ていません';
    var 知 = 要素('使い方の知らせ');
    知.textContent = '「' + 名 + '」は' + 訳 + '。';
    知.hidden = false;
    clearTimeout(使い方.一言の時計);
    使い方.一言の時計 = setTimeout(function () { 知.hidden = true; }, 6000);
    return;
  }
  b.classList.toggle('pointing', false);
  void b.offsetWidth;   // 続けて押しても、光り方を最初からやり直す
  b.classList.toggle('pointing', true);
  if (typeof b.scrollIntoView === 'function') {
    var 減らす = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 下半分に説明がある時は、ボタンを画面の上の方に出す（説明に隠れない）。横は見えていない時だけ動かす
    //（表を横に動かしすぎると、日付の列が切れて、どの日のボタンか分からなくなる）
    b.scrollIntoView({ block: 横に並べるか() ? 'center' : 'start', inline: 'nearest', behavior: 減らす ? 'auto' : 'smooth' });
  }
  clearTimeout(使い方.光の時計);
  使い方.光の時計 = setTimeout(function () { b.classList.toggle('pointing', false); }, 3000);
}

// ── 時刻の表示（サーバーは「2026-10-11 09:05:12」の形で返す）──────────

function 時分(日時) {
  var m = /^\d{4}-\d\d-\d\d (\d\d):(\d\d)/.exec(日時 || '');
  return m ? Number(m[1]) + ':' + m[2] : '';
}

function 月日(日時) {
  var m = /^\d{4}-(\d\d)-(\d\d)/.exec(日時 || '');
  return m ? Number(m[1]) + '/' + Number(m[2]) : '';
}

/** 日本時間の今日を「2026-10-11」の形で */
function 今日の日付() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function 今日の表示() {
  var d = new Date(Date.now() + 9 * 3600000);
  return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日（' + '日月火水木金土'[d.getUTCDay()] + '）';
}

function 端末の時分(ミリ秒) {
  var d = new Date(ミリ秒);
  return d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
}

// ── 段階1の表示（日報・1か月の表）────────────────────────────

var 理由を聞く分 = 15;   // 裏と同じ（予定の退勤よりこの分以上長い時だけ理由を聞く）

/** 「yyyy-MM-dd HH:mm(:ss)」→ 分。日本時間の数字のまま数える（差を出すため。今の分() と同じ物差し） */
function 分に(日時) {
  var m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/.exec(日時 || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : null;
}

function 今の分() {
  return Math.floor((Date.now() + 9 * 3600000) / 60000);
}

/** 分 → 「8:12」。負は「−0:05」。無い時は「—」 */
function 時間の表示(分) {
  if (分 === null || 分 === undefined) return '—';
  var a = Math.abs(分);
  return (分 < 0 ? '−' : '') + Math.floor(a / 60) + ':' + ('0' + (a % 60)).slice(-2);
}

/** 分 → 「4時間33分」「40分」「1時間」（符号なし・日本語。2026-10-18 矢作さん：+4:33 では読みにくい） */
function 長さの表示(分) {
  var a = Math.abs(分), 時 = Math.floor(a / 60), 残り = a % 60;
  return (時 ? 時 + '時間' : '') + (残り || !時 ? 残り + '分' : '');
}

/** 予定との差 → 「+4時間33分」「+40分」「−10分」 */
function 差の表示(分) {
  if (分 === null || 分 === undefined) return '';
  return (分 >= 0 ? '+' : '−') + 長さの表示(分);
}

/** 「2026-10-07」→「10/7（水）」 */
function 日付の表示(日付) {
  var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(日付 || '');
  if (!m) return '';
  var 曜 = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return Number(m[2]) + '/' + Number(m[3]) + '（' + '日月火水木金土'[曜] + '）';
}

/** その日の行に出す時刻。次の日の時刻には「翌」を付ける（日をまたぐ退勤・夜の呼び出し） */
function その日の時分(日時, 日付) {
  if (!日時) return '';
  return (日時.slice(0, 10) !== 日付 ? '翌' : '') + 時分(日時);
}

/** 「yyyy-MM-dd」に n 日を足す（月・年をまたいでよい） */
function 日を足す(日付, n) {
  var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(日付);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)).toISOString().slice(0, 10);
}

/** 裏が返す1日分の形。職員向けには 確認・給与へ分・直した欄 が無い */
function 日の形か(d, 管理者向け) {
  var 時刻か = function (v) { return v === '' || /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(v); };
  var 分か = function (v) { return v === null || (typeof v === 'number' && Math.floor(v) === v); };
  return !!d && /^\d{4}-\d\d-\d\d$/.test(d.日付) && 時刻か(d.出勤) && 時刻か(d.退勤) &&
      typeof d.休憩分 === 'number' && 分か(d.働いた分) && 分か(d.差分) &&
      typeof d.理由 === 'string' && typeof d.理由が要る === 'boolean' &&
      // 段階2: 休みの日（予定なし）は 始業・終業が空で 休み=true
      !!d.予定 && typeof d.予定.休み === 'boolean' &&
      (d.予定.休み ? d.予定.始業 === '' && d.予定.終業 === '' : /^\d\d:\d\d$/.test(d.予定.始業) && /^\d\d:\d\d$/.test(d.予定.終業)) &&
      Array.isArray(d.夜) && d.夜.every(function (n) {
        return !!n && typeof n.出発ID === 'string' && 時刻か(n.出発) && 時刻か(n.帰着) && 分か(n.分) && typeof n.数えない === 'boolean' &&
            typeof n.当番でない === 'boolean';
      }) &&
      (!管理者向け || (typeof d.確認 === 'string' && typeof d.給与へ分 === 'number' &&
          Array.isArray(d.直した欄) && d.直した欄.every(function (k) { return typeof k === 'string'; })));
}

// ── 登録の画面（2画面で同じもの）───────────────────────────

function 端末名の見当() {
  var ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  return 'パソコン';
}

/**
 * スマホか（iPad などのタブレットは入れない）。代表の画面はパソコン用で、代表のスマホは職員と同じ画面（2026-11-19 矢作さん）。
 * スマホで代表の画面を開いたら職員の画面へ案内し、職員の画面の「代表の画面へ」はスマホでは出さない
 */
function スマホか() {
  var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  return /iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua));
}

/**
 * もらった登録コード（職員ごとに決まった英数字8文字）で、この端末を登録する。同じコードで何台でも登録できる。
 * トークンはこの端末で作り、送る前に「登録中のトークン」としてしまう。返事が届かないまま押し直しても、
 * 開き直しても、同じトークンで送るので、裏は「登録済み」と応じる（端末は1台分だけ増える）。
 * 済んだら({ トークン, 名前, 役割 }) は、トークンをしまってから呼ぶ。前置き は断られて戻ってきた時の一言。
 */
function 登録の画面を出す(前置き, 済んだら) {
  var 入れ物 = 要素('登録');
  入れ物.textContent = '';
  画面を切り替える('登録');
  知らせる(null);
  var トークン = 取り出す('登録中のトークン');
  if (typeof トークン !== 'string' || !/^[0-9a-f]{64}$/.test(トークン)) トークン = 新しいトークン();

  var コード = 作る('input', {
    id: '登録コードの欄', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    maxlength: '12', class: 'input code-input'
  });
  var 名前 = 作る('input', { id: '端末名の欄', type: 'text', maxlength: '30', class: 'input' });
  名前.value = 端末名の見当();
  var ボタン = 作る('button', { type: 'submit', class: 'btn big', text: '登録する' });
  var 返事 = 作る('p', { class: 'reply', role: 'status' });
  if (前置き) 返事.textContent = 前置き;

  var 用紙 = 作る('form', { class: 'card', novalidate: '' }, [
    作る('h2', { text: 'この端末を登録します' }),
    作る('p', { text: 'もらった登録コード（英数字8文字）を入れてください。登録は、この端末で最初の1回だけです。' }),
    作る('label', { for: '登録コードの欄', class: 'field' }, [作る('span', { text: '登録コード' }), コード]),
    作る('label', { for: '端末名の欄', class: 'field' }, [
      作る('span', { text: 'この端末の名前（あとで見分けるため）' }), 名前
    ]),
    ボタン,
    返事,
    作る('p', { class: 'muted small', text: 'iPhone でホーム画面に追加して使う時は、追加したアイコンから開いて登録してください（ホーム画面とブラウザでは、登録が別になります）。' })
  ]);

  用紙.addEventListener('submit', function (e) {
    e.preventDefault();
    // 送る前にしまう。しまえない画面（プライベートブラウズなど）では、送る前に止める
    if (!しまう('登録中のトークン', トークン)) {
      返事.textContent = 'この画面では登録を残せません（プライベートブラウズなど）。ふつうの画面で開き直してください。';
      return;
    }
    ボタン.disabled = true;
    返事.textContent = '登録しています…';
    送り直しつきで送る({ 操作: '登録', 登録コード: コード.value, 端末名: 名前.value, トークン: トークン }, function (r) {
      return typeof r.名前 === 'string' && typeof r.役割 === 'string';
    }).then(function (結果) {
      ボタン.disabled = false;
      if (!結果.届いた) {
        返事.textContent = '送れませんでした。電波のよい所で、もう一度押してください。';
        return;
      }
      if (!結果.応答.ok) {
        // 登録中のトークンが、前に登録されて止められたものだった時。新しいトークンに替えて押し直してもらう
        if (結果.応答.コード === '未登録') {
          トークン = 新しいトークン();
          しまう('登録中のトークン', null);
          返事.textContent = 'もう一度「登録する」を押してください。';
          return;
        }
        返事.textContent = 結果.応答.理由;
        return;
      }
      if (!しまう('トークン', トークン)) {
        返事.textContent = 'この画面では登録を残せません。ふつうの画面で開き直して、もう一度登録してください。';
        return;
      }
      しまう('登録中のトークン', null);
      済んだら({ トークン: トークン, 名前: 結果.応答.名前, 役割: 結果.応答.役割 });
    });
  });

  入れ物.appendChild(用紙);
}
