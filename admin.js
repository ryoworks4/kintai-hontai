/**
 * 勤怠システム — 代表の画面（タブ：職員ごとの1か月・勤務表・申請・給与・記録の一覧）
 * 登録コードと使える端末は、矢作さんがスプレッドシートで扱う（2026-10-18 矢作さん）。
 *
 * 読み込みボタンは置かない。開いた時と、ほかのアプリから戻った時に自動で読み込む
 * （池田建設で「読込ボタン・押してから遅い」が不満になった）。
 * 1か月の表では、理由の横で認める・認めない、どの欄も直す（NurseAID で楽だった、理由・承認・直しを一続きに）。
 */
(function () {
  if (埋め込まれていたら止める()) return;

  var 読み直しの間隔 = 5000;   // ミリ秒。戻るたびに読みすぎない

  var 鍵 = 取り出す('トークン');
  var 読んでいる = false;
  var 最後に読んだ = 0;

  // 職員ごとの1か月
  var 月 = 今日の日付().slice(0, 7);
  var 月の中身 = null;          // 裏の「1か月の表」の返事
  var 月を読む番 = 0;           // 読んでいる間に人や月を変えたら、古い返事を使わない
  var 開いている直し = '';      // 直している日（その行の下に直す欄を出す）
  var 変えている日 = {};        // 日付 → 認める・認めない を送っている間の判断
  var 判断し直す日 = {};        // 日付 → 「変える」を押した
  var 直している = false;
  var 開いたまとまり = {};      // 記録の無い日のまとまりの最初の日付 → 開いている（人か月を変えたら閉じる）

  // 段階2：勤務表（横に日付・縦に職員）
  var 勤務表の月 = 今日の日付().slice(0, 7);
  var 勤務表の中身 = null;      // 裏の「勤務表」の返事
  var 勤務表を読む番 = 0;
  var 勤務表を読んでいる = false;
  var 選んだマス = null;        // { 職員ID, 日付, 欄 } 編集の欄を出しているマス
  var 勤務表を送っている = '';  // '' / 'マス' / '作る' / '配る'
  var 配るか聞いている = false;
  var 当番の時刻 = '18:00';     // 途中交代の時刻（最後に選んだもの）

  // タブ。前に見ていたタブを覚えておく（この端末の中だけ）
  var タブの名前 = ['月', '勤務表', '申請', '給与', '記録'];
  // 段階3：申請
  var 申請の中身 = null;       // 裏の「申請の一覧」の返事
  var 申請を読んでいる = false;
  var 判断している = '';       // 送っている申請ID
  var 一言の下書き = {};       // 申請ID → 認めない時の一言
  // 段階4：給与。開いた時は先月（給与は月が終わってから見る）
  var 給与の月 = 月を足す(今日の日付().slice(0, 7), -1);
  var 給与の中身 = null;       // 裏の「給与」の返事
  var 給与を読む番 = 0;
  var 給与を読んでいる = false;
  var 締めている = false;
  var 締めるか聞いている = false;
  var 選んだ給与の人 = '';     // 内訳を出している人
  タブの名前.forEach(function (名) {
    要素('タブ-' + 名).addEventListener('click', function () { タブを選ぶ(名); });
  });
  タブを選ぶ(タブの名前.indexOf(取り出す('タブ')) >= 0 ? 取り出す('タブ') : '月');
  要素('勤務表の前の月').addEventListener('click', function () { 勤務表を動かす(-1); });
  要素('勤務表の次の月').addEventListener('click', function () { 勤務表を動かす(1); });
  要素('月の職員').addEventListener('change', function () {
    しまう('月の職員', 要素('月の職員').value);
    月を読む();
  });
  要素('前の月').addEventListener('click', function () { 月を動かす(-1); });
  要素('給与の前の月').addEventListener('click', function () { 給与を動かす(-1); });
  要素('給与の次の月').addEventListener('click', function () { 給与を動かす(1); });
  要素('次の月').addEventListener('click', function () { 月を動かす(1); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') 戻ってきた();
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) 戻ってきた(); });

  if (鍵) 読み込む(true); else 登録の画面を出す('', 登録できた);

  function 登録できた(応答) {
    鍵 = 応答.トークン;
    読み込む(true);
  }

  function 戻ってきた() {
    if (!鍵 || Date.now() - 最後に読んだ <= 読み直しの間隔) return;
    読み込む(false);
    // 直している途中・送っている途中は、表を読み直さない（入れかけた値が消えないように）
    if (!開いている直し && !直している && !Object.keys(変えている日).length) 月を読む();
    if (勤務表の中身 && !勤務表を送っている && !選んだマス) 勤務表を読む();
    if (申請の中身 && !判断している && !要素('面-申請').hidden) 申請を読む();
    if (給与の中身 && !締めている && !要素('面-給与').hidden) 給与を読む();
  }

  /** 初めて = true の時だけ「読み込んでいます」を出す。2回目からは今の表示のまま裏で読み直す */
  function 読み込む(初めて) {
    if (読んでいる) return;
    読んでいる = true;
    if (初めて) 画面を切り替える('読み込み中');
    else 要素('読んだ時刻').textContent = '読み込んでいます…';
    送り直しつきで送る({ 操作: '管理の一覧', トークン: 鍵 }, 一覧の形か).then(function (結果) {
      読んでいる = false;
      if (!結果.届いた) {
        要素('読んだ時刻').textContent = '';
        知らせる('読み込めませんでした。電波のよい所で、もう一度ためしてください。', {
          名前: 'もう一度', 押したら: function () { 読み込む(初めて); }
        });
        return;
      }
      if (!結果.応答.ok) { 断られた(結果.応答); return; }
      最後に読んだ = Date.now();
      知らせる(null);
      描く(結果.応答);
      画面を切り替える('本体');
      if (初めて) {
        月を読む();
        if (!要素('面-勤務表').hidden && !勤務表の中身 && !勤務表を読んでいる) 勤務表を読む();
        if (!要素('面-申請').hidden && !申請の中身 && !申請を読んでいる) 申請を読む();
        if (!要素('面-給与').hidden && !給与の中身 && !給与を読んでいる) 給与を読む();
      }
    });
  }

  function 断られた(応答) {
    if (応答.コード === '未登録') {
      鍵 = null;
      しまう('トークン', null);
      登録の画面を出す(応答.理由, 登録できた);
      return;
    }
    if (応答.コード === '権限なし') {
      画面を切り替える('');
      知らせる('この画面は代表だけが使えます。');
      要素('職員の画面へ').hidden = false;
      return;
    }
    知らせる(応答.理由);
  }

  function タブを選ぶ(名) {
    タブの名前.forEach(function (n) {
      var 選んだ = n === 名;
      要素('タブ-' + n).setAttribute('aria-selected', String(選んだ));
      要素('タブ-' + n).classList.toggle('on', 選んだ);
      要素('面-' + n).hidden = !選んだ;
    });
    しまう('タブ', 名);
    // 勤務表・申請は、開いた時に初めて読む（1か月の表と同時に読んで遅くしない）
    if (名 === '勤務表' && 鍵 && !勤務表の中身 && !勤務表を読んでいる && !勤務表を送っている) 勤務表を読む();
    if (名 === '申請' && 鍵 && !申請を読んでいる && !判断している) 申請を読む();
    // 給与は、ほかのタブで認めた・直した後に開くことが多いので、開くたびに読み直す
    if (名 === '給与' && 鍵 && !給与を読んでいる && !締めている) 給与を読む();
  }

  function 描く(中身) {
    要素('名前').textContent = 中身.自分.名前;
    要素('読んだ時刻').textContent = 端末の時分(Date.now()) + ' に読み込み';
    申請の件数を出す(中身.確認待ちの申請);

    // 1か月の表を見る人。前に見ていた人を覚えておく（いなければ、代表でない最初の人）
    var 月の選ぶ = 要素('月の職員');
    var 前の選択 = 月の選ぶ.value;
    var 見ていた = 前の選択 || 取り出す('月の職員') || '';
    var 見る人 = 中身.職員.filter(function (人) { return 人.職員ID === 見ていた; })[0] ||
        中身.職員.filter(function (人) { return 人.役割 !== '管理者'; })[0] || 中身.職員[0];
    月の選ぶ.textContent = '';
    中身.職員.forEach(function (人) {
      var o = 作る('option', { value: 人.職員ID, text: 人.名前 + (人.役割 === '管理者' ? '（代表）' : '') });
      if (見る人 && 人.職員ID === 見る人.職員ID) o.selected = true;
      月の選ぶ.appendChild(o);
    });
    // 見ていた人が一覧から消えて（退職など）選択が自動で変わった時も、手で選び直した時と同じく、
    // 前の人の表を消して読み直す ②（2026-10-18 Codex 2回目 C。自動の選択は change を通らない）
    if (前の選択 && 月の選ぶ.value !== 前の選択) 月を読む();

    var 表 = 要素('記録');
    表.textContent = '';
    中身.記録.forEach(function (r) {
      表.appendChild(作る('tr', {}, [
        作る('td', { class: 'mono', text: 月日(r.時刻) + ' ' + 時分(r.時刻) }),
        作る('td', { text: r.名前 }),
        作る('td', {}, [作る('span', { class: 'tag ' + (r.種類 === '出勤' ? 'in' : 'out'), text: r.種類 })])
      ]));
    });
    if (!中身.記録.length) 表.appendChild(作る('tr', {}, [作る('td', { colspan: '3', class: 'muted', text: 'まだ記録はありません' })]));
  }

  /** 一覧の中身の形を、1件ずつ確かめる（欠けた記録を描いて画面が崩れたり、別の返事を一覧と取り違えたりしない） */
  function 一覧の形か(r) {
    var 文字 = function (o, キー) { return キー.every(function (k) { return typeof o[k] === 'string'; }); };
    return !!r.自分 && typeof r.自分.名前 === 'string' && typeof r.確認待ちの申請 === 'number' &&
        Array.isArray(r.職員) && r.職員.every(function (p) { return 文字(p, ['職員ID', '名前', '役割']); }) &&
        Array.isArray(r.記録) && r.記録.every(function (k) { return 文字(k, ['記録ID', '名前', '種類', '時刻']); });
  }

  // ── 職員ごとの1か月 ─────────────────────────────────────

  function 月を動かす(n) {
    var m = /^(\d{4})-(\d\d)$/.exec(月);
    月 = new Date(Date.UTC(+m[1], +m[2] - 1 + n, 1)).toISOString().slice(0, 7);
    月を読む();
  }

  function 月を読む() {
    var 職員ID = 要素('月の職員').value, 見る月 = 月, 番 = ++月を読む番;
    var m = /^(\d{4})-(\d\d)$/.exec(月);
    要素('月の表示').textContent = m[1] + '年' + Number(m[2]) + '月';
    if (!職員ID || !鍵) return;
    開いている直し = '';
    // 人か月を変えたら、前の表をすぐ消す。読み込み中に、残った表から前の人へ認める・直すを送らないため
    //（2026-10-18 Codex 1回目 C）。同じ人・同じ月の読み直しは、表を残したまま（送る時に見ていた値で確かめる）
    if (月の中身 && (月の中身.職員.職員ID !== 職員ID || 月の中身.月 !== 見る月)) 月を消す();
    要素('月の状態').textContent = '読み込んでいます…';
    送り直しつきで送る({ 操作: '1か月の表', トークン: 鍵, 職員ID: 職員ID, 月: 見る月 }, function (r) {
      return !!r.職員 && r.職員.職員ID === 職員ID && typeof r.職員.名前 === 'string' && r.月 === 見る月 &&
          Array.isArray(r.日) && r.日.length >= 28 &&
          r.日.every(function (d) { return 代表の日か(d) && d.日付.slice(0, 7) === 見る月; }) &&
          合計の形か(r.合計) && Array.isArray(r.直した記録) && r.直した記録.every(直しの形か);
    }).then(function (結果) {
      if (番 !== 月を読む番) return;
      if (!結果.届いた) {
        要素('月の状態').textContent = '読み込めませんでした。少し待ってから、人か月を選び直してください。';
        return;
      }
      if (!結果.応答.ok) { 要素('月の状態').textContent = ''; 断られた(結果.応答); return; }
      月の中身 = 結果.応答;
      変えている日 = {};
      判断し直す日 = {};
      要素('月の状態').textContent = '';
      月を描く();
    });
  }

  /**
   * 送る直前に、選択欄の人・いまの月と、出ている表の人・月が同じかを確かめる。違えば送らずに読み直す ②
   *（2026-10-18 Codex 2回目 C。選択が change を通らずに変わっても、前の人の表から送らない）
   */
  function 表と選択が同じか() {
    if (月の中身 && 月の中身.職員.職員ID === 要素('月の職員').value && 月の中身.月 === 月) return true;
    月を読む();
    return false;
  }

  function 月を消す() {
    月の中身 = null;
    開いたまとまり = {};
    変えている日 = {};
    判断し直す日 = {};
    要素('合計').textContent = '';
    要素('月の表').textContent = '';
    要素('直した記録').textContent = '';
  }

  /** 代表に返る1日の形。前後の日との重なり（Codex 2回目 D）が無い返事は、古い裏からの返事とみなして使わない */
  function 代表の日か(d) { return 日の形か(d, true) && typeof d.前後が重なる === 'boolean'; }

  function 合計の形か(g) {
    return !!g && ['働いた分', '差分', '給与へ分', '確認待ち', '夜の回数', '重なる日'].every(function (k) { return typeof g[k] === 'number'; });
  }

  function 直しの形か(r) {
    return !!r && ['直しID', '日付', '欄', '元の値', '新しい値', '理由', '日時', '直した人'].every(function (k) {
      return typeof r[k] === 'string';
    });
  }

  /** 裏と同じ足し方（1日を置き換えた時に、読み直さずに合計を出す） */
  function 合計を出す(日) {
    var g = { 働いた分: 0, 差分: 0, 給与へ分: 0, 確認待ち: 0, 夜の回数: 0, 重なる日: 0 };
    日.forEach(function (d) {
      if (d.働いた分 !== null) g.働いた分 += d.働いた分;
      if (d.差分 !== null && d.差分 > 0) g.差分 += d.差分;
      g.給与へ分 += d.給与へ分;
      if (d.確認 === '確認待ち') g.確認待ち++;
      if (d.前後が重なる) g.重なる日++;
      g.夜の回数 += d.夜.filter(function (n) { return !n.数えない; }).length;
    });
    return g;
  }

  function 日を置き換える(新しい日) {
    if (!月の中身) return;
    月の中身.日 = 月の中身.日.map(function (d) { return d.日付 === 新しい日.日付 ? 新しい日 : d; });
    月の中身.合計 = 合計を出す(月の中身.日);
  }

  function 月を描く() {
    var 中身 = 月の中身;
    if (!中身) return;
    var g = 中身.合計;
    var 合計 = 要素('合計');
    合計.textContent = '';
    [['働いた', 時間の表示(g.働いた分)], ['予定との差', 時間の表示(g.差分)], ['給与へ（認めた残業）', 時間の表示(g.給与へ分)],
     ['確認待ち', g.確認待ち + '日'], ['夜の呼び出し', g.夜の回数 + '回']].forEach(function (x, i) {
      合計.appendChild(作る('div', { class: 'sum' + (i === 3 && g.確認待ち ? ' wait' : '') }, [
        作る('span', { class: 'muted small', text: x[0] }), 作る('b', { class: 'mono', text: x[1] })
      ]));
    });
    // 重なっている日は、時間を合計に入れていない。直すまで目に付くように、ある時だけ出す
    if (g.重なる日) {
      合計.appendChild(作る('div', { class: 'sum wait' }, [
        作る('span', { class: 'muted small', text: '前後の日と重なっている日（合計に入れていない）' }),
        作る('b', { class: 'mono', text: g.重なる日 + '日' })
      ]));
    }

    // 記録の無い日が続く所は1行にまとめ、押すと開く（2026-10-18 矢作さん：月の大半が空の行で長い）
    var 表 = 要素('月の表');
    表.textContent = '';
    まとまりに分ける(中身.日).forEach(function (m) {
      if (m.畳める) {
        var 開いている = !!開いたまとまり[m.日[0].日付] || m.日.some(function (d) { return d.日付 === 開いている直し; });
        表.appendChild(まとまりの行を作る(m.日, 開いている));
        if (!開いている) return;
      }
      m.日.forEach(function (d) {
        表.appendChild(行を作る(d));
        if (開いている直し === d.日付) 表.appendChild(直す行を作る(d));
      });
    });

    var 一覧 = 要素('直した記録');
    一覧.textContent = '';
    中身.直した記録.slice().reverse().forEach(function (r) {
      一覧.appendChild(作る('li', { class: 'li fix' }, [
        作る('span', { class: 'd', text: 月日(r.日付 + ' 00:00') }),
        作る('span', { text: 欄の名前(r.欄) + ' ' + (値の表示(r.欄, r.元の値, r.日付) || 'なし') + ' → ' +
            (値の表示(r.欄, r.新しい値, r.日付) || 'なし') + (r.理由 ? '「' + r.理由 + '」' : '') }),
        作る('span', { class: 'muted small', text: r.直した人 + '・' + 月日(r.日時) })
      ]));
    });
    if (!中身.直した記録.length) 一覧.appendChild(作る('li', { class: 'li empty', text: 'この月に直した所はありません' }));
  }

  /** 記録の無い日：出勤・退勤・夜の呼び出しが無く、代表が直した欄も、重なり・確認の印も無い日 */
  function 記録が無い日か(d) {
    return !d.出勤 && !d.退勤 && !d.夜.length && !d.直した欄.length && !d.前後が重なる && !d.確認;
  }

  /** 日の並びを、記録の無い日が2日以上続く所（畳める）と、それ以外の1日ずつに分ける。1日だけの空きはまとめない */
  function まとまりに分ける(日々) {
    var 出 = [], 続き = [];
    var 区切る = function () {
      if (続き.length >= 2) 出.push({ 畳める: true, 日: 続き });
      else 続き.forEach(function (d) { 出.push({ 畳める: false, 日: [d] }); });
      続き = [];
    };
    日々.forEach(function (d) {
      if (記録が無い日か(d)) { 続き.push(d); return; }
      区切る();
      出.push({ 畳める: false, 日: [d] });
    });
    区切る();
    return 出;
  }

  /** まとまりの1行。押すと開く・畳む。開いたまま直している日があれば、畳む時に直す欄も閉じる */
  function まとまりの行を作る(日々, 開いている) {
    var 最初 = 日々[0].日付, 最後 = 日々[日々.length - 1].日付;
    var b = 作る('button', {
      type: 'button', class: 'fold-btn', 'aria-expanded': String(開いている),
      text: (開いている ? '▾ ' : '▸ ') + 日付の表示(最初) + '〜' + 日付の表示(最後) + '　記録なし ' + 日々.length + '日　' +
          (開いている ? '畳む' : '開く')
    });
    b.disabled = 直している;
    b.addEventListener('click', function () {
      if (開いている) {
        delete 開いたまとまり[最初];
        if (日々.some(function (d) { return d.日付 === 開いている直し; })) 開いている直し = '';
      } else {
        開いたまとまり[最初] = true;
      }
      月を描く();
    });
    return 作る('tr', { class: 'empty fold' }, [作る('td', { colspan: '8' }, [b])]);
  }

  function 欄の名前(欄) {
    var m = /^(出発|帰着):/.exec(欄);
    return m ? '夜の' + m[1] : 欄;
  }

  function 値の表示(欄, 値, 日付) {
    if (欄 === '休憩') return 値 === '' ? '' : 値 + '分';
    if (欄 === '理由') return 値;
    return その日の時分(値, 日付);
  }

  function 直したか(d, 欄) { return d.直した欄.indexOf(欄) >= 0; }

  /** 中身の文字。直した欄は緑にする */
  function 字(文, 直した, 追加) {
    return 作る('span', { class: (直した ? 'edited' : '') + (追加 ? ' ' + 追加 : ''), text: 文 });
  }

  function 行を作る(d) {
    var 記録あり = !!(d.出勤 || d.退勤 || d.夜.length);
    var tr = 作る('tr', { class: d.確認 === '確認待ち' || d.前後が重なる ? 'wait' : (記録あり ? '' : 'empty') });

    tr.appendChild(作る('td', { text: 日付の表示(d.日付) }));

    var 時刻 = 作る('td', { class: 'mono' });
    if (d.出勤 || d.退勤) {
      時刻.appendChild(字(d.出勤 ? その日の時分(d.出勤, d.日付) : '出勤なし', 直したか(d, '出勤'), d.出勤 ? '' : 'missing'));
      時刻.appendChild(document.createTextNode('〜'));
      時刻.appendChild(字(d.退勤 ? その日の時分(d.退勤, d.日付) : '退勤なし', 直したか(d, '退勤'), d.退勤 ? '' : 'missing'));
      // 認めた押し忘れから入った打刻（段階3）
      var 申請から = (d.申請から || []).filter(function (k) { return k === '出勤' || k === '退勤'; });
      if (申請から.length) 時刻.appendChild(作る('span', { class: 'pill no', text: '申請から ' + 申請から.join('・') }));
    }
    tr.appendChild(時刻);

    // 休憩は、出勤か退勤のある日だけ（夜の呼び出しだけの日には出さない）
    tr.appendChild(作る('td', { class: 'num' }, d.出勤 || d.退勤 ? [字(d.休憩分 + '分', 直したか(d, '休憩'))] : []));
    tr.appendChild(作る('td', { class: 'num', text: d.働いた分 === null ? '' : 時間の表示(d.働いた分) }));

    var 差 = 作る('td');
    if (d.前後が重なる) 差.appendChild(作る('span', { class: 'missing small', text: '前後の日と時刻が重なっています。直すまで合計に入れません' }));
    if (d.差分 !== null) {
      // 勤務表で休みの日（予定なし）は、働いた時間が全部「差」（段階2 A）
      if (d.予定.休み) 差.appendChild(作る('span', { class: 'muted small', text: '休みの日 ' }));
      差.appendChild(作る('b', { class: 'mono' + (d.理由が要る ? ' diff' : ' muted'), text: 差の表示(d.差分) }));
      if (d.理由が要る) 差.appendChild(字(' ' + (d.理由 || '理由なし'), 直したか(d, '理由'), d.理由 ? '' : 'muted'));
    }
    tr.appendChild(差);

    tr.appendChild(作る('td', {}, [残業の欄(d)]));

    var 夜 = 作る('td', { class: 'mono' + (d.夜.length ? ' night' : '') });
    d.夜.forEach(function (n, i) {
      if (i) 夜.appendChild(作る('br'));
      var 文 = n.数えない ? '数えない' : その日の時分(n.出発, d.日付) + '→' + (n.帰着 ? その日の時分(n.帰着, d.日付) : '帰着なし');
      夜.appendChild(字(文, 直したか(d, '出発:' + n.出発ID) || 直したか(d, '帰着:' + n.出発ID), n.数えない ? 'muted' : ''));
      // 配った勤務表で当番でない人の呼び出し。断っていないので印だけ（段階2 ⑪）
      if (n.当番でない && !n.数えない) 夜.appendChild(作る('span', { class: 'missing small', text: ' 当番でない' }));
    });
    var 夜の申請 = (d.申請から || []).filter(function (k) { return k === '出発' || k === '帰着'; });
    if (夜の申請.length) 夜.appendChild(作る('span', { class: 'pill no', text: '申請から ' + 夜の申請.join('・') }));
    tr.appendChild(夜);

    var 直す = 作る('button', { type: 'button', class: 'btn ghost small', text: 開いている直し === d.日付 ? '閉じる' : '直す' });
    直す.disabled = 直している;
    直す.addEventListener('click', function () {
      開いている直し = 開いている直し === d.日付 ? '' : d.日付;
      月を描く();
    });
    tr.appendChild(作る('td', {}, [直す]));
    return tr;
  }

  /** 残業の欄。確認待ちは、理由の横でその場で認める・認めない */
  function 残業の欄(d) {
    var 枠 = 作る('div', { class: 'acts' });
    if (!d.理由が要る) return 枠;
    if (変えている日[d.日付]) {
      枠.appendChild(作る('span', { class: 'muted small', text: (変えている日[d.日付] === '認める' ? '認めています…' : '送っています…') }));
      return 枠;
    }
    if (d.確認 === '確認待ち' || 判断し直す日[d.日付]) {
      ['認める', '認めない'].forEach(function (判断) {
        var b = 作る('button', { type: 'button', class: 'btn small' + (判断 === '認めない' ? ' ghost' : ''), text: 判断 });
        b.addEventListener('click', function () { 判断する(d, 判断); });
        枠.appendChild(b);
      });
      return 枠;
    }
    枠.appendChild(作る('span', {
      class: 'pill ' + (d.確認 === '認めた' ? 'ok' : 'no'),
      text: d.確認 === '認めた' ? '認めた ' + 時間の表示(d.給与へ分) : '認めない（残す）'
    }));
    var 変える = 作る('button', { type: 'button', class: 'btn ghost small', text: '変える' });
    変える.addEventListener('click', function () { 判断し直す日[d.日付] = true; 月を描く(); });
    枠.appendChild(変える);
    return 枠;
  }

  /**
   * 押した瞬間に「認めています…」にして送る。送るのは見ていた差。ほかの画面で直されて差が変わっていたら、
   * 裏が断るので表を読み直す。届いたか分からない時も、表を読み直して今の状態を見せる（送り直しても二重にならない）
   */
  function 判断する(d, 判断) {
    if (!表と選択が同じか()) return;
    var 中身 = 月の中身, 職員ID = 中身.職員.職員ID;
    変えている日[d.日付] = 判断;
    月を描く();
    送り直しつきで送る({
      操作: '残業の確認', トークン: 鍵, 操作ID: 新しい操作ID(), 職員ID: 職員ID, 日付: d.日付, 判断: 判断, 差分: d.差分
    }, function (r) {
      return !!r.確認 && r.確認.日付 === d.日付 && r.確認.判断 === 判断 && 代表の日か(r.日) && r.日.日付 === d.日付;
    }).then(function (結果) {
      if (月の中身 !== 中身) return;   // 待っている間に、人か月を変えて読み直した
      delete 変えている日[d.日付];
      delete 判断し直す日[d.日付];
      if (!結果.届いた) {
        知らせる('送れたか分かりませんでした。表を読み直します。');
        月を読む();
        return;
      }
      if (!結果.応答.ok) { 断られた(結果.応答); 月を読む(); return; }
      日を置き換える(結果.応答.日);
      月を描く();
    });
  }

  // ── 直す ──────────────────────────────────────────

  /** 1日分の直す欄。時刻を消すと「なし」。日付は、翌日のしるしと夜の時刻から決める */
  function 直す行を作る(d) {
    var 欄たち = [];   // { 欄, 元の値, 新しい値を出す() }
    var 用紙 = 作る('form', { class: 'fix-form', novalidate: '' });
    var 入れ物 = 作る('div', { class: 'fix-grid' });
    var id = function (名) { return '直す-' + d.日付 + '-' + 名; };
    var 時刻の欄 = function (名, 値) {
      return 作る('input', { id: id(名), type: 'time', class: 'input', value: 値 ? 値.slice(11, 16) : '' });
    };
    // 時刻の欄を変えていなければ、元の値をそのまま使う。日付を作り直すと、触っていない欄が別の日に変わり得る
    //（2026-10-18 Codex 1回目 A: 出発と帰着が同じ時刻だと、帰着が翌日になった）
    var 変えていなければ元 = function (欄, 元, 作り直す) {
      return 欄.value === (元 ? 元.slice(11, 16) : '') ? 元 : 作り直す();
    };
    var 置く = function (ラベル, 名, 中身) {
      入れ物.appendChild(作る('label', { for: id(名), class: 'field' }, [作る('span', { text: ラベル })].concat(中身)));
    };

    var 出勤 = 時刻の欄('出勤', d.出勤);
    置く('出勤', '出勤', [出勤]);
    欄たち.push({ 欄: '出勤', 元の値: d.出勤, 新しい値を出す: function () {
      return 変えていなければ元(出勤, d.出勤, function () { return 出勤.value ? d.日付 + ' ' + 出勤.value : ''; });
    } });

    var 退勤 = 時刻の欄('退勤', d.退勤);
    var 翌日 = 作る('input', { id: id('翌日'), type: 'checkbox', 'aria-label': '退勤が0時を過ぎた（翌日の時刻）' });
    var 元は翌日 = !!d.退勤 && d.退勤.slice(0, 10) !== d.日付;
    翌日.checked = 元は翌日;
    置く('退勤', '退勤', [作る('div', { class: 'stack' }, [退勤, 作る('span', { class: 'check small' }, [翌日, '0時を過ぎた（翌日の時刻）'])])]);
    欄たち.push({ 欄: '退勤', 元の値: d.退勤, 新しい値を出す: function () {
      if (翌日.checked === 元は翌日) {
        return 変えていなければ元(退勤, d.退勤, function () { return 退勤.value ? (翌日.checked ? 日を足す(d.日付, 1) : d.日付) + ' ' + 退勤.value : ''; });
      }
      return 退勤.value ? (翌日.checked ? 日を足す(d.日付, 1) : d.日付) + ' ' + 退勤.value : '';
    } });

    var 休憩 = 作る('input', { id: id('休憩'), type: 'number', class: 'input', min: '0', max: '600', step: '5', inputmode: 'numeric', value: String(d.休憩分) });
    置く('休憩（分）', '休憩', [休憩]);
    欄たち.push({ 欄: '休憩', 元の値: String(d.休憩分), 新しい値を出す: function () { return 休憩.value.trim(); } });

    var 理由 = 作る('select', { id: id('理由'), class: 'input' });
    [''].concat(理由の選択肢一覧()).forEach(function (s) {
      var o = 作る('option', { value: s, text: s || 'なし' });
      if (s === d.理由) o.selected = true;
      理由.appendChild(o);
    });
    置く('理由', '理由', [理由]);
    欄たち.push({ 欄: '理由', 元の値: d.理由, 新しい値を出す: function () { return 理由.value; } });

    d.夜.forEach(function (n, i) {
      var 出発 = 時刻の欄('出発' + i, n.出発), 帰着 = 時刻の欄('帰着' + i, n.帰着);
      // 出発は 0:00〜9:00 なら次の日。帰着は出発の時刻より前なら出発の次の日、同じか後なら出発と同じ日
      var 出発の値 = function () {
        return 変えていなければ元(出発, n.出発, function () {
          if (!出発.value) return '';
          return (出発.value < '09:00' ? 日を足す(d.日付, 1) : d.日付) + ' ' + 出発.value;
        });
      };
      置く('夜の出発' + (d.夜.length > 1 ? (i + 1) : ''), '出発' + i, [出発]);
      置く('夜の帰着' + (d.夜.length > 1 ? (i + 1) : ''), '帰着' + i, [帰着]);
      欄たち.push({ 欄: '出発:' + n.出発ID, 元の値: n.出発, 新しい値を出す: 出発の値 });
      欄たち.push({ 欄: '帰着:' + n.出発ID, 元の値: n.帰着, 新しい値を出す: function () {
        var 発 = 出発の値() || n.出発;
        if (発 === n.出発 && 帰着.value === (n.帰着 ? n.帰着.slice(11, 16) : '')) return n.帰着;
        if (!帰着.value || !発) return '';
        return (帰着.value < 発.slice(11, 16) ? 日を足す(発.slice(0, 10), 1) : 発.slice(0, 10)) + ' ' + 帰着.value;
      } });
    });

    var なぜ = 作る('input', { id: id('なぜ'), type: 'text', class: 'input', maxlength: '100', placeholder: '例: 押し忘れ' });
    置く('なぜ直すか（残ります）', 'なぜ', [なぜ]);

    var 返事 = 作る('p', { class: 'reply', role: 'status' });
    var 送る = 作る('button', { type: 'submit', class: 'btn', text: '直す' });
    var やめる = 作る('button', { type: 'button', class: 'btn ghost', text: 'やめる' });
    やめる.addEventListener('click', function () { 開いている直し = ''; 月を描く(); });
    用紙.appendChild(入れ物);
    用紙.appendChild(作る('p', { class: 'muted small', text: '時刻を消すと「なし」になります。夜の呼び出しの出発を消すと、その呼び出しは数えません。押した時刻の記録は消えずに残ります。' }));
    用紙.appendChild(作る('div', { class: 'acts' }, [送る, やめる]));
    用紙.appendChild(返事);

    用紙.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!表と選択が同じか()) return;
      var 変更 =欄たち.map(function (f) { return { 欄: f.欄, 元の値: f.元の値, 新しい値: f.新しい値を出す() }; })
          .filter(function (c) { return c.新しい値 !== c.元の値; });
      if (!変更.length) { 返事.textContent = '変えた所がありません。'; return; }
      送る.disabled = true;
      やめる.disabled = true;
      直している = true;
      返事.textContent = '直しています…';
      直しを送る(d, 変更, なぜ.value, 返事, function () {
        送る.disabled = false;
        やめる.disabled = false;
      });
    });

    return 作る('tr', { class: 'fix-row' }, [作る('td', { colspan: '8' }, [用紙])]);
  }

  function 理由の選択肢一覧() {
    // 裏の選択肢（D で決定）。1か月の表の返事には入っていないので、ここに同じものを持つ
    return ['記録・申し送り', '訪問が長引いた', '急な対応', '会議・委員会', '勉強（自己研鑽）', '私用', '押すのが遅れただけ'];
  }

  /**
   * 1回の保存を、1つの依頼（1つの操作ID）で送る。裏は全部の欄を確かめてから、まとめて1回で書くので、
   * 1欄だけ直った形は残らない（2026-10-18 Codex 1回目 E）。届いたか分からない時は、同じ操作IDで送り直し、
   * それでも分からなければ表を読み直して今の状態を見せる（送り直しても二重にならない）
   */
  function 直しを送る(d, 変更, なぜ, 返事, 終わったら) {
    var 中身 = 月の中身, 職員ID = 中身.職員.職員ID;
    送り直しつきで送る({
      操作: '直す', トークン: 鍵, 操作ID: 新しい操作ID(), 職員ID: 職員ID, 日付: d.日付, 変更: 変更, 理由: なぜ
    }, function (r) {
      return 代表の日か(r.日) && r.日.日付 === d.日付 && Array.isArray(r.直し) &&
          r.直し.every(function (x) { return 直しの形か(Object.assign({ 直した人: '' }, x)); });
    }).then(function (結果) {
      直している = false;
      if (月の中身 !== 中身) return;   // 待っている間に、人か月を変えて読み直した
      if (!結果.届いた) {
        知らせる('直せたか分かりませんでした。表を読み直しました。');
        月を読む();
        return;
      }
      if (!結果.応答.ok) {
        終わったら();
        // 前後が合わない時は、何も書いていないので、入れた値のまま直せるように欄を開いておく
        if (結果.応答.コード === '入力') { 返事.textContent = '時刻の前後が合いません。まだ何も直していません。'; return; }
        断られた(結果.応答);
        月を読む();
        return;
      }
      知らせる(null);
      月を読む();   // 合計と直した記録をそろえる
    });
  }

  // ── 段階2：勤務表 ──────────────────────────────────────────
  // 1マス＝1回の依頼（マスを変える）。押した瞬間に表示を変え、返事の勤務表の全部で描き直す。
  // 見ていた値（元の値）を一緒に送るので、ほかの画面で先に変わっていれば裏が断り、読み直す ②

  var 休みの区分 = ['休', '祝', '代', '夏', '年', '正'];
  var 休み希望 = '希';

  function 勤務表を動かす(n) {
    var m = /^(\d{4})-(\d\d)$/.exec(勤務表の月);
    勤務表の月 = new Date(Date.UTC(+m[1], +m[2] - 1 + n, 1)).toISOString().slice(0, 7);
    選んだマス = null;
    配るか聞いている = false;
    勤務表を読む();
  }

  function 勤務表を読む() {
    var 見る月 = 勤務表の月, 番 = ++勤務表を読む番;
    var m = /^(\d{4})-(\d\d)$/.exec(見る月);
    要素('勤務表の月の表示').textContent = m[1] + '年' + Number(m[2]) + '月';
    if (!鍵) return;
    // 月を変えたら前の表をすぐ消す（前の月のマスから送らない）
    if (勤務表の中身 && 勤務表の中身.月 !== 見る月) { 勤務表の中身 = null; 選んだマス = null; 勤務表を描く(); }
    要素('勤務表の状態').textContent = '読み込んでいます…';
    勤務表を読んでいる = true;
    送り直しつきで送る({ 操作: '勤務表', トークン: 鍵, 月: 見る月 }, function (r) { return 勤務表の形か(r, 見る月); }).then(function (結果) {
      if (番 !== 勤務表を読む番) return;
      勤務表を読んでいる = false;
      if (!結果.届いた) {
        要素('勤務表の状態').textContent = '読み込めませんでした。少し待ってから、月を選び直してください。';
        return;
      }
      if (!結果.応答.ok) { 要素('勤務表の状態').textContent = ''; 断られた(結果.応答); return; }
      勤務表を受け取る(結果.応答);
    });
  }

  function 勤務表を受け取る(中身) {
    勤務表の中身 = 中身;
    // 選んでいたマスの人が表からいなくなっていたら閉じる
    if (選んだマス && !勤務表の人(選んだマス.職員ID)) 選んだマス = null;
    勤務表を描く();
  }

  function 勤務表の形か(r, 見る月) {
    var 文字 = function (o, キー) { return !!o && キー.every(function (k) { return typeof o[k] === 'string'; }); };
    var 数 = function (o, キー) { return !!o && キー.every(function (k) { return typeof o[k] === 'number'; }); };
    return r.月 === 見る月 && ['', '作った', '配った'].indexOf(r.状態) >= 0 && typeof r.配った日時 === 'string' &&
        Array.isArray(r.型) && r.型.every(function (t) { return 文字(t, ['型', '始業', '終業', '状態']) && 数(t, ['休憩分', '日数']); }) &&
        !!r.祝日 && typeof r.祝日 === 'object' &&
        Array.isArray(r.職員) && r.職員.every(function (p) {
          return 文字(p, ['職員ID', '名前', '役割']) && Array.isArray(p.日) && p.日.length >= 28 &&
              p.日.every(function (d) { return 文字(d, ['日付', '区分', '当番', '代休の元']) && typeof d.変わった === 'boolean' && d.日付.slice(0, 7) === 見る月; }) &&
              数(p.集計, ['日数', '土日祝', '休', '有給', '当番', '代休の残り']);
        }) &&
        Array.isArray(r.足りない日) && r.足りない日.every(function (x) { return 文字(x, ['日付']) && Array.isArray(x.理由); }) &&
        Array.isArray(r.不備) && r.不備.every(function (x) { return 文字(x, ['職員ID', '日付', '文']); });
  }

  function 勤務表の人(職員ID) {
    return 勤務表の中身 ? 勤務表の中身.職員.filter(function (p) { return p.職員ID === 職員ID; })[0] || null : null;
  }

  function 勤務表のマス(職員ID, 日付) {
    var p = 勤務表の人(職員ID);
    return p ? p.日.filter(function (d) { return d.日付 === 日付; })[0] || null : null;
  }

  function 曜日(日付) { return new Date(日付 + 'T00:00:00Z').getUTCDay(); }
  function 土日祝か(日付) { var w = 曜日(日付); return w === 0 || w === 6 || !!(勤務表の中身 && 勤務表の中身.祝日[日付]); }
  function 働く区分か(区分) { return !!勤務表の中身 && 勤務表の中身.型.some(function (t) { return t.型 === 区分; }); }

  function 勤務表を描く() {
    var 中身 = 勤務表の中身;
    var 表 = 要素('勤務表'), 操作 = 要素('勤務表の操作'), 状態 = 要素('勤務表の状態'), 説明 = 要素('勤務表の説明');
    表.textContent = ''; 操作.textContent = '';
    要素('勤務表の凡例').textContent = '';
    要素('勤務表の不備').hidden = true;
    要素('勤務表の不備').textContent = '';
    エディタを描く();
    if (!中身) return;

    var 送っている = !!勤務表を送っている;
    if (中身.状態 === '') {
      状態.textContent = 'この月の勤務表は、まだありません。';
      説明.textContent = '作ると、土日と休業日・祝日に「休」「夏」「正」「祝」が先に入ります。職員にはまだ見えません。';
      var 作るb = 作る('button', { type: 'button', class: 'btn', text: 勤務表を送っている === '作る' ? '作っています…' : 'この月の勤務表を作る' });
      作るb.disabled = 送っている;
      作るb.addEventListener('click', 勤務表を作る);
      操作.appendChild(作るb);
    } else if (中身.状態 === '作った') {
      状態.textContent = '下書き（職員にはまだ見えません）';
      説明.textContent = 'マスを押して入れます。入れ終わったら「配る」を押すと、職員の画面に出ます。';
      配るボタンを置く(操作, 送っている);
    } else {
      状態.textContent = 月日(中身.配った日時) + ' ' + 時分(中身.配った日時) + ' に配りました';
      説明.textContent = '配った後も直せます。直したマスは職員の画面に「変わりました」と出ます。';
    }

    var 日付たち = 中身.職員.length ? 中身.職員[0].日.map(function (d) { return d.日付; }) : [];
    var 足りない = {};
    中身.足りない日.forEach(function (x) { 足りない[x.日付] = x.理由.join('・'); });

    var 見出し = 作る('tr', {}, [作る('th', { text: 勤務表の月.slice(5).replace(/^0/, '') + '月' }), 作る('th', { text: '' })]);
    日付たち.forEach(function (D) {
      var w = 曜日(D), 祝 = 中身.祝日[D];
      var th = 作る('th', { class: (w === 6 ? 'sat' : w === 0 ? 'sun' : 祝 ? 'hol' : '') + (足りない[D] ? ' short' : '') });
      th.appendChild(作る('span', { text: String(Number(D.slice(8))) }));
      th.appendChild(作る('span', { class: 'wd', text: 祝 ? '祝' : '日月火水木金土'[w] }));
      if (足りない[D]) th.setAttribute('title', 足りない[D]);
      見出し.appendChild(th);
    });
    [['日数', '(土日祝)'], ['休', ''], ['有給', ''], ['当番', ''], ['代休', 'の残り']].forEach(function (x) {
      var th = 作る('th', {}, [作る('span', { text: x[0] })]);
      if (x[1]) th.appendChild(作る('span', { class: 'wd', text: x[1] }));
      見出し.appendChild(th);
    });
    表.appendChild(作る('thead', {}, [見出し]));

    var 本体 = 作る('tbody');
    中身.職員.forEach(function (p) {
      var 勤務行 = 作る('tr', { class: 'band' }, [
        作る('td', { class: 'name', rowspan: '2', text: p.名前 + (p.役割 === '管理者' ? '（代表）' : '') }),
        作る('td', { class: 'role', text: '勤務' })
      ]);
      var 当番行 = 作る('tr', {}, [作る('td', { class: 'role', text: '当番' })]);
      p.日.forEach(function (d) {
        勤務行.appendChild(作る('td', {}, [マスのボタン(p, d, '区分')]));
        当番行.appendChild(作る('td', {}, [マスのボタン(p, d, '当番')]));
      });
      var g = p.集計;
      // 集計は勤務の行に。rowspan にすると勤務の行だけが縦に伸びる
      [日数の表示(g.日数) + '(' + g.土日祝 + ')', String(g.休), 日数の表示(g.有給), String(g.当番), String(g.代休の残り)].forEach(function (s) {
        勤務行.appendChild(作る('td', { class: 'tally', text: s }));
        当番行.appendChild(作る('td', { class: 'tally' }));
      });
      本体.appendChild(勤務行);
      本体.appendChild(当番行);
    });
    表.appendChild(本体);

    要素('勤務表の凡例').textContent = (中身.状態 ? '赤い日付＝人の足りない日（当番がいない・2人以上・出勤がいない）。' : '') +
        '枠がオレンジ＝配った後に変えたマス。' +
        (中身.型.some(function (t) { return t.型.indexOf('/') >= 0; }) ? '「/」の左が午前・右が午後（ヤ＝休み・ネ＝年休）。ハ＝早出・オ＝遅出。' : '') + 中身.型.filter(function (t) { return t.状態 === '仮'; }).map(function (t) {
          return t.型 + ' の時間帯（' + 時刻の表示(t.始業) + '〜' + 時刻の表示(t.終業) + '）は仮です。';
        }).join('');

    if (中身.不備.length) {
      var 一覧 = 要素('勤務表の不備');
      一覧.hidden = false;
      中身.不備.forEach(function (x) {
        var 人 = 勤務表の人(x.職員ID);
        一覧.appendChild(作る('li', { class: 'li' }, [
          作る('span', { class: 'd', text: 月日(x.日付 + ' 00:00') }),
          作る('span', { text: (人 ? 人.名前 : '') + '：' + x.文 })
        ]));
      });
    }
  }

  function 日数の表示(n) { return String(n).replace(/\.0$/, ''); }
  function 時刻の表示(t) { return t ? Number(t.slice(0, 2)) + t.slice(2) : ''; }

  /** 1マスのボタン。押すと下に編集の欄が出る。送っている間と、まだ作っていない月は押せない */
  function マスのボタン(p, d, 欄) {
    var 値 = d[欄];
    var 級 = 'cell';
    if (欄 === '区分') {
      if (休みの区分.indexOf(値) >= 0) 級 += ' off';
      if (値 === 休み希望) 級 += ' hope';
    } else if (値) 級 += ' duty';
    if (選んだマス && 選んだマス.職員ID === p.職員ID && 選んだマス.日付 === d.日付 && 選んだマス.欄 === 欄) 級 += ' picked';
    if (d.変わった) 級 += ' changed';
    var b = 作る('button', { type: 'button', class: 級, id: 'マス-' + p.職員ID + '-' + d.日付 + '-' + 欄,
      'aria-label': p.名前 + ' ' + 日付の表示(d.日付) + ' ' + 欄 });
    var m = /^(\d\d:\d\d)(から|まで)$/.exec(値);
    if (m) { b.appendChild(作る('span', { text: m[2] === 'まで' ? '〜' + 時刻の表示(m[1]) : 時刻の表示(m[1]) + '〜' })); b.appendChild(作る('small', { text: m[2] === 'まで' ? '渡す' : '持つ' })); }
    else b.appendChild(作る('span', { text: 値 || (欄 === '区分' ? '　' : '') }));
    if (欄 === '区分' && 値 === '代') b.appendChild(作る('small', { text: d.代休の元 ? '←' + 月日(d.代休の元 + ' 00:00') : '元なし' }));
    // マスを送っている間も、次のマスは押せる（順に送る）。作る・配るの間だけ止める
    b.disabled = !勤務表の中身 || !勤務表の中身.状態 || (!!勤務表を送っている && 勤務表を送っている !== 'マス');
    b.addEventListener('click', function () {
      var 同じ = 選んだマス && 選んだマス.職員ID === p.職員ID && 選んだマス.日付 === d.日付 && 選んだマス.欄 === 欄;
      選んだマス = 同じ ? null : { 職員ID: p.職員ID, 日付: d.日付, 欄: 欄 };
      配るか聞いている = false;
      勤務表を描く();
    });
    return b;
  }

  /** 選んだマスの編集の欄。区分＝型と休みの区分のチップ、当番＝なし・○・まで・から、代＝元の出勤日 */
  function エディタを描く() {
    var 枠 = 要素('マスの編集');
    枠.textContent = '';
    var マス = 選んだマス && 勤務表のマス(選んだマス.職員ID, 選んだマス.日付);
    枠.hidden = !マス;
    if (!マス) return;
    var 人 = 勤務表の人(選んだマス.職員ID), 欄 = 選んだマス.欄;
    var 送っている = !!勤務表を送っている && 勤務表を送っている !== 'マス';   // 作る・配るの間だけ押せない
    var 頭 = 作る('div', { class: 'row' }, [
      作る('b', { text: 人.名前 + '　' + 日付の表示(マス.日付) + '　' + (欄 === '区分' ? '勤務' : '当番') }),
      作る('span', { class: 'muted small', id: 'マスの状態', text: 勤務表を送っている === 'マス' ? '送っています…' : '' })
    ]);
    var 閉じる = 作る('button', { type: 'button', class: 'btn ghost small', text: '閉じる' });
    閉じる.addEventListener('click', function () { 選んだマス = null; 勤務表を描く(); });
    頭.appendChild(閉じる);
    枠.appendChild(頭);

    var チップ = 作る('div', { class: 'chips' });
    var 置く = function (表示, 値, 仮) {
      var b = 作る('button', { type: 'button', class: 'chip' + (マス[欄] === 値 ? ' on' : ''), text: 表示, 'aria-pressed': String(マス[欄] === 値) });
      if (仮) b.appendChild(作る('span', { class: 'tmp', text: '仮' }));
      b.disabled = 送っている;
      b.addEventListener('click', function () { マスを送る(選んだマス, 欄, 値); });
      チップ.appendChild(b);
    };
    if (欄 === '区分') {
      勤務表の中身.型.forEach(function (t) {
        置く(t.型 + ' ' + 時刻の表示(t.始業) + '〜' + 時刻の表示(t.終業), t.型, t.状態 === '仮');
      });
      [['休', '休'], ['祝', '祝'], ['代 代休', '代'], ['夏 夏季', '夏'], ['年 有給', '年'], ['正 年末年始', '正'], ['希 休み希望', 休み希望]].forEach(function (x) { 置く(x[0], x[1]); });
      置く('なし', '');
    } else {
      置く('なし', '');
      置く('○ 一晩の当番', '○');
      置く('〜' + 時刻の表示(当番の時刻) + '（' + 時刻の表示(当番の時刻) + ' に渡す）', 当番の時刻 + 'まで');
      置く(時刻の表示(当番の時刻) + '〜（' + 時刻の表示(当番の時刻) + ' から持つ）', 当番の時刻 + 'から');
    }
    枠.appendChild(チップ);

    if (欄 === '当番') {
      var 時刻 = 作る('select', { id: '交代の時刻', 'aria-label': '途中交代の時刻' });
      for (var h = 12; h < 24; h++) {
        ['00', '15', '30', '45'].forEach(function (mm) {
          var v = ('0' + h).slice(-2) + ':' + mm;
          var o = 作る('option', { value: v, text: h + ':' + mm });
          if (v === 当番の時刻) o.selected = true;
          時刻.appendChild(o);
        });
      }
      時刻.disabled = 送っている;
      時刻.addEventListener('change', function () { 当番の時刻 = 時刻.value; エディタを描く(); });
      枠.appendChild(作る('label', { class: 'row small muted' }, [作る('span', { text: '途中交代の時刻' }), 時刻]));
      枠.appendChild(作る('p', { class: 'muted small', text: 'オンコール手当が付くのは、夜を持つ人（○ と 18:00〜）です。〜18:00 の人には付きません。' }));
    }

    if (欄 === '区分' && マス.区分 === '代') {
      var 元 = 作る('select', { id: '代休の元', 'aria-label': '代休の元になった出勤日' });
      元.appendChild(作る('option', { value: '', text: '元の出勤日を選ぶ' }));
      var 候補 = 人.日.filter(function (d) { return 働く区分か(d.区分) && 土日祝か(d.日付); }).map(function (d) { return d.日付; });
      if (マス.代休の元 && 候補.indexOf(マス.代休の元) < 0) 候補.push(マス.代休の元);
      候補.forEach(function (D) {
        var o = 作る('option', { value: D, text: 日付の表示(D) });
        if (D === マス.代休の元) o.selected = true;
        元.appendChild(o);
      });
      元.disabled = 送っている;
      元.addEventListener('change', function () { マスを送る(選んだマス, '代休の元', 元.value); });
      枠.appendChild(作る('label', { class: 'row small muted' }, [作る('span', { text: '代休の元（土日祝の出勤日）' }), 元]));
    }
  }

  /** 1マスを送る。見ていた値を元の値として送る ②。押した瞬間に表示を変え、返事の勤務表で描き直す */
  var 送る列 = [];   // 押した順に並べ、前の返事が来てから次を送る（見ていた値が前の結果と合う）。裏は1件ずつ数秒かかる
  function マスを送る(どこ, 欄, 新しい値) {
    var マス = 勤務表のマス(どこ.職員ID, どこ.日付);
    if (!マス || (勤務表を送っている && 勤務表を送っている !== 'マス')) return;
    var 元の値 = マス[欄];
    if (元の値 === 新しい値) return;
    マス[欄] = 新しい値;   // 押した瞬間に変える。正しい値は最後の返事で来る
    送る列.push({ 職員ID: どこ.職員ID, 日付: どこ.日付, 欄: 欄, 元の値: 元の値, 新しい値: 新しい値, 月: 勤務表の月 });
    if (勤務表を送っている !== 'マス') 次のマスを送る();
    勤務表を描く();
  }

  function 次のマスを送る() {
    var 次 = 送る列.shift();
    if (!次) { 勤務表を送っている = ''; 勤務表を描く(); return; }
    勤務表を送っている = 'マス';
    var やめる = function () { 送る列 = []; 勤務表を送っている = ''; };
    送り直しつきで送る({ 操作: 'マスを変える', トークン: 鍵, 操作ID: 新しい操作ID(), 職員ID: 次.職員ID, 日付: 次.日付,
      欄: 次.欄, 元の値: 次.元の値, 新しい値: 次.新しい値 }, function (r) { return 勤務表の形か(r, 次.月); }).then(function (結果) {
      if (!結果.届いた) {
        やめる();
        知らせる('送れたか分かりませんでした。表を読み直します。');
        勤務表を読む();
        return;
      }
      if (!結果.応答.ok) {
        やめる();
        断られた(結果.応答);
        勤務表を読む();   // 「変わった」なら、ほかの画面の値で描き直す
        return;
      }
      if (勤務表の月 !== 次.月) { やめる(); return; }
      // まだ送るものがあれば、この返事の表では描き直さない（押した値が一度戻って見えないように）。最後の返事で全部そろう
      if (送る列.length) { 次のマスを送る(); return; }
      勤務表を送っている = '';
      勤務表を受け取る(結果.応答);
    });
  }

  function 勤務表を作る() {
    if (勤務表を送っている || !勤務表の中身 || 勤務表の中身.状態) return;
    var 見る月 = 勤務表の月;
    勤務表を送っている = '作る';
    勤務表を描く();
    送り直しつきで送る({ 操作: '勤務表を作る', トークン: 鍵, 操作ID: 新しい操作ID(), 月: 見る月 },
        function (r) { return 勤務表の形か(r, 見る月); }).then(function (結果) {
      勤務表を送っている = '';
      if (!結果.届いた) { 知らせる('作れたか分かりませんでした。表を読み直します。'); 勤務表を読む(); return; }
      if (!結果.応答.ok) { 断られた(結果.応答); 勤務表を読む(); return; }
      if (勤務表の月 !== 見る月) return;
      勤務表を受け取る(結果.応答);
    });
  }

  /** 配る → その場で「職員に見えるようになります。配りますか？」を出してから送る */
  function 配るボタンを置く(枠, 送っている) {
    if (配るか聞いている) {
      var はい = 作る('button', { type: 'button', class: 'btn small', text: '配る' });
      var いいえ = 作る('button', { type: 'button', class: 'btn ghost small', text: 'やめる' });
      はい.addEventListener('click', 配る);
      いいえ.addEventListener('click', function () { 配るか聞いている = false; 勤務表を描く(); });
      枠.appendChild(作る('span', { class: 'small', text: '職員に見えるようになります。配りますか？' }));
      枠.appendChild(はい);
      枠.appendChild(いいえ);
      return;
    }
    var b = 作る('button', { type: 'button', class: 'btn', text: 勤務表を送っている === '配る' ? '配っています…' : '配る' });
    b.disabled = 送っている;
    b.addEventListener('click', function () { 配るか聞いている = true; 選んだマス = null; 勤務表を描く(); });
    枠.appendChild(b);
  }

  // ── 段階3：申請 ────────────────────────────────────────────
  // 確認待ちの一覧で、その場で認める・認めない（一言つき）。返事の一覧で描き直す。読むだけでも代表の操作なので裏は鍵の中で確かめる

  /** タブの名前に確認待ちの件数（「申請 2」）。0 なら出さない */
  function 申請の件数を出す(n) {
    var タブ = 要素('タブ-申請');
    タブ.textContent = '';
    タブ.appendChild(作る('span', { text: '申請' }));
    if (n > 0) タブ.appendChild(作る('span', { class: 'badge', text: String(n) }));
  }

  function 申請を読む() {
    if (!鍵) return;
    申請を読んでいる = true;
    要素('申請の状態').textContent = '読み込んでいます…';
    送り直しつきで送る({ 操作: '申請の一覧', トークン: 鍵 }, 申請の一覧の形か).then(function (結果) {
      申請を読んでいる = false;
      if (!結果.届いた) { 要素('申請の状態').textContent = '読み込めませんでした。少し待ってから、タブを押し直してください。'; return; }
      if (!結果.応答.ok) { 要素('申請の状態').textContent = ''; 断られた(結果.応答); return; }
      申請を受け取る(結果.応答);
    });
  }

  function 申請を受け取る(中身) {
    申請の中身 = 中身;
    申請の件数を出す(中身.確認待ち);
    申請を描く();
  }

  function 申請の一覧の形か(r) {
    var 文字 = function (o, キー) { return !!o && キー.every(function (k) { return typeof o[k] === 'string'; }); };
    return typeof r.確認待ち === 'number' && Array.isArray(r.申請) && r.申請.every(function (x) {
      return 文字(x, ['申請ID', '職員ID', '名前', '種類', '日付', '内容', '時刻', '理由', '日時', '状態', '一言', '判断の日時']) &&
          ['確認待ち', '認める', '認めない', '取り下げ'].indexOf(x.状態) >= 0 &&
          (x.状態 !== '確認待ち' || (!!x.様子 && typeof x.様子.区分 === 'string' && typeof x.様子.出勤人数 === 'number'));
    });
  }

  function 申請の文(x) {
    if (x.種類 === '休み') return '休みの希望（' + x.内容 + '）';
    return '押し忘れ ' + x.内容 + ' ' + その日の時分(x.時刻, x.日付);
  }

  function 状態の札(x) {
    if (x.状態 === '確認待ち') return 作る('span', { class: 'pill wait', text: '確認待ち' });
    if (x.状態 === '認める') return 作る('span', { class: 'pill ok', text: '認めた' });
    if (x.状態 === '認めない') return 作る('span', { class: 'pill no', text: '認めない' });
    return 作る('span', { class: 'pill no', text: '取り下げ' });
  }

  function 申請を描く() {
    var 表 = 要素('申請の表');
    表.textContent = '';
    var 中身 = 申請の中身;
    if (!中身) return;
    要素('申請の状態').textContent = 中身.申請.length ? '' : 'まだ申請はありません。';
    if (!中身.申請.length) return;
    表.appendChild(作る('thead', {}, [作る('tr', {}, ['送った日', 'だれ', '申請', '勤務表では', '理由', ''].map(function (s) { return 作る('th', { text: s }); }))]));
    var 本体 = 作る('tbody');
    中身.申請.forEach(function (x) {
      var tr = 作る('tr', { class: x.状態 === '確認待ち' ? 'wait' : '' });
      tr.appendChild(作る('td', { text: 月日(x.日時) }));
      tr.appendChild(作る('td', { text: x.名前 }));
      tr.appendChild(作る('td', { text: 日付の表示(x.日付) + ' ' + 申請の文(x) }));
      tr.appendChild(作る('td', { class: 'muted small', text: 様子の文(x) }));
      tr.appendChild(作る('td', { text: x.理由 }));
      tr.appendChild(作る('td', {}, [判断の欄(x)]));
      本体.appendChild(tr);
    });
    表.appendChild(本体);
  }

  /** 確認待ちに添える、その日の勤務表と記録の様子 */
  function 様子の文(x) {
    if (x.状態 !== '確認待ち' || !x.様子) return '';
    var s = x.様子, 出 = [];
    出.push(s.区分 ? s.区分 : 'まだ入れていない');
    出.push('出勤 ' + s.出勤人数 + '人');
    if (s.当番) 出.push('当番 ' + s.当番);
    if (x.種類 === '押し忘れ') {
      出.push('記録：' + (s.出勤 ? '出勤 ' + その日の時分(s.出勤, x.日付) : '出勤なし') + '・' + (s.退勤 ? '退勤 ' + その日の時分(s.退勤, x.日付) : '退勤なし'));
      (s.夜 || []).forEach(function (n) { 出.push('夜 ' + その日の時分(n.出発, x.日付) + '→' + (n.帰着 ? その日の時分(n.帰着, x.日付) : '帰着なし')); });
    }
    return 出.join('・');
  }

  /** 確認待ちは、その場で認める・認めない。認めないは一言（30文字まで・空でもよい）を入れてから */
  function 判断の欄(x) {
    var 枠 = 作る('div', { class: 'acts' });
    if (x.状態 !== '確認待ち') {
      枠.appendChild(状態の札(x));
      if (x.一言) 枠.appendChild(作る('span', { class: 'muted small', text: '「' + x.一言 + '」' }));
      return 枠;
    }
    if (判断している === x.申請ID) { 枠.appendChild(作る('span', { class: 'muted small', text: '送っています…' })); return 枠; }
    var 認める = 作る('button', { type: 'button', class: 'btn small', text: '認める' });
    var 認めない = 作る('button', { type: 'button', class: 'btn ghost small', text: '認めない' });
    認める.disabled = 認めない.disabled = !!判断している;
    認める.addEventListener('click', function () { 判断を送る(x, '認める', ''); });
    認めない.addEventListener('click', function () {
      // 一言の欄を出し、もう一度押すと送る
      if (一言の下書き[x.申請ID] === undefined) { 一言の下書き[x.申請ID] = ''; 申請を描く(); return; }
      判断を送る(x, '認めない', 一言の下書き[x.申請ID]);
    });
    枠.appendChild(認める);
    枠.appendChild(認めない);
    if (一言の下書き[x.申請ID] !== undefined) {
      var 一言 = 作る('input', { type: 'text', class: 'input short', id: '一言-' + x.申請ID, maxlength: '30', placeholder: '一言（なくてもよい）' });
      一言.value = 一言の下書き[x.申請ID];
      一言.addEventListener('input', function () { 一言の下書き[x.申請ID] = 一言.value; });
      枠.appendChild(一言);
    }
    return 枠;
  }

  function 判断を送る(x, 判断, 一言) {
    if (判断している) return;
    判断している = x.申請ID;
    申請を描く();
    送り直しつきで送る({ 操作: '判断する', トークン: 鍵, 操作ID: 新しい操作ID(), 申請ID: x.申請ID, 判断: 判断, 一言: 一言 }, 申請の一覧の形か).then(function (結果) {
      判断している = '';
      delete 一言の下書き[x.申請ID];
      if (!結果.届いた) { 知らせる('送れたか分かりませんでした。一覧を読み直します。'); 申請を読む(); return; }
      if (!結果.応答.ok) { 断られた(結果.応答); 申請を読む(); return; }
      申請を受け取る(結果.応答);
      // 認めた休みは勤務表に、押し忘れは1か月の表に入る。開いていれば読み直す
      if (判断 === '認める') { if (勤務表の中身) 勤務表を読む(); 月を読む(); }
    });
  }


  // ── 段階4：給与 ────────────────────────────────────────────
  // 月の全員の総支給額と、選んだ人の内訳。「この月を締める」は、見ていた計算（目印）と同じ時だけ裏が台帳に書く ⑧

  function 月を足す(年月, n) {
    var m = /^(\d{4})-(\d\d)$/.exec(年月);
    return new Date(Date.UTC(+m[1], +m[2] - 1 + n, 1)).toISOString().slice(0, 7);
  }

  function 給与を動かす(n) {
    給与の月 = 月を足す(給与の月, n);
    締めるか聞いている = false;
    給与を読む();
  }

  function 給与を読む() {
    var 見る月 = 給与の月, 番 = ++給与を読む番;
    var m = /^(\d{4})-(\d\d)$/.exec(見る月);
    要素('給与の月の表示').textContent = m[1] + '年' + Number(m[2]) + '月';
    if (!鍵) return;
    // 月を変えたら前の月の数字をすぐ消す（前の月の目印で締めない）
    if (給与の中身 && 給与の中身.月 !== 見る月) { 給与の中身 = null; 給与を描く(); }
    要素('給与の状態').textContent = '読み込んでいます…';
    給与を読んでいる = true;
    送り直しつきで送る({ 操作: '給与', トークン: 鍵, 月: 見る月 }, function (r) { return 給与の形か(r, 見る月); }).then(function (結果) {
      if (番 !== 給与を読む番) return;
      給与を読んでいる = false;
      if (!結果.届いた) { 要素('給与の状態').textContent = '読み込めませんでした。少し待ってから、月を選び直してください。'; return; }
      if (!結果.応答.ok) { 要素('給与の状態').textContent = ''; 断られた(結果.応答); return; }
      給与の中身 = 結果.応答;
      給与を描く();
    });
  }

  var 時間の欄 = ['働いた分', '法定内分', '時間外25分', '時間外50分', '深夜分', '法定休日分', '出勤日数', '有給の日数', '当番日数', '出発回数', '確認待ち'];
  var 金額の欄 = ['基本給', '毎月決まった手当', '法定内', '時間外25', '時間外50', '深夜', '法定休日', 'オンコール', '緊急訪問', '総支給額'];

  function 給与の形か(r, 見る月) {
    var 文字 = function (o, キー) { return !!o && キー.every(function (k) { return typeof o[k] === 'string'; }); };
    var 数 = function (o, キー) { return !!o && キー.every(function (k) { return typeof o[k] === 'number'; }); };
    var 文字の並び = function (a) { return Array.isArray(a) && a.every(function (x) { return typeof x === 'string'; }); };
    return r.月 === 見る月 && typeof r.終わった === 'boolean' && typeof r.目印 === 'string' && 文字の並び(r.不備) &&
        Array.isArray(r.決まり) && r.決まり.every(function (k) { return 文字(k, ['項目', '値', '状態']); }) &&
        数(r.確認待ち, ['残業', '申請']) &&
        (r.締め === null || (文字(r.締め, ['日時', '名前']) && typeof r.締め.変わった === 'boolean' && !!r.締め.総支給)) &&
        Array.isArray(r.職員) && r.職員.every(function (p) {
          return 文字(p, ['職員ID', '名前', '役割', '目印']) && typeof p.役員 === 'boolean' && 数(p.時間, 時間の欄) &&
              (p.金額 === null || 数(p.金額, 金額の欄)) && (p.時給 === null || typeof p.時給 === 'number') &&
              文字の並び(p.仮) && 文字の並び(p.不備) && Array.isArray(p.気になる日) &&
              p.気になる日.every(function (x) { return 文字(x, ['日付', '文']); });
        });
  }

  function 円の表示(n) { return n === null || n === undefined ? '—' : n.toLocaleString('ja-JP') + '円'; }

  function 仮の印() { return 作る('span', { class: 'tmp', text: '仮' }); }

  function 給与を描く() {
    var 中身 = 給与の中身;
    var 一覧 = 要素('給与の一覧'), 内訳 = 要素('給与の内訳'), 知らせ = 要素('給与の知らせ'), 操作 = 要素('給与の操作');
    [一覧, 内訳, 知らせ, 操作, 要素('給与の気になる日')].forEach(function (el) { el.textContent = ''; });
    要素('給与の内訳の見出し').textContent = '';
    要素('給与の内訳の下').textContent = '';
    要素('給与の気になる日').hidden = true;
    if (!中身) return;

    var 締め = 中身.締め;
    要素('給与の状態').textContent = 締め ? (締め.変わった ? '' : 月日(締め.日時) + ' に締めました（' + 締め.名前 + '）')
        : 中身.終わった ? 'まだ締めていません' : 'この月はまだ途中です（今日までの記録で計算）';

    // 知らせ：締めた後の変化・不備・確認待ち・仮の値
    var 知らせを足す = function (種類, 文) { 知らせ.appendChild(作る('li', { class: 'note ' + 種類 }, 文)); };
    if (締め && 締め.変わった) 知らせを足す('warn', [月日(締め.日時) + ' に締めた後に、記録か設定が変わりました。確かめて、締め直してください。']);
    中身.不備.forEach(function (文) { 知らせを足す('bad', [文]); });
    if (中身.確認待ち.残業 || 中身.確認待ち.申請) {
      知らせを足す('warn', ['確認待ちが残っています（残業 ' + 中身.確認待ち.残業 + '日・申請 ' + 中身.確認待ち.申請 + '件）。認めるか決めると締められます。']);
    }
    var 仮 = [];
    中身.職員.forEach(function (p) { p.仮.forEach(function (k) { if (仮.indexOf(k) < 0) 仮.push(k); }); });
    if (仮.length) 知らせを足す('tmp-note', [仮の印(), ' 代表に確かめる前の値で計算しています：' + 仮.join('・')]);

    締めるボタンを置く(操作);

    if (!中身.職員.length) { 要素('給与の状態').textContent = 'この月に給与の出る人がいません。'; return; }
    if (!中身.職員.some(function (p) { return p.職員ID === 選んだ給与の人; })) {
      選んだ給与の人 = (中身.職員.filter(function (p) { return p.役割 !== '管理者'; })[0] || 中身.職員[0]).職員ID;
    }

    // 一覧：1行1人。名前を押すと下に内訳
    var 見出し = ['名前', '総支給額', '残業（認めた）', '深夜', '法定休日', '当番', '出発'];
    if (締め) 見出し.push('締めた時');
    一覧.appendChild(作る('thead', {}, [作る('tr', {}, 見出し.map(function (s, i) { return 作る('th', { class: i ? 'num' : '', text: s }); }))]));
    var 本体 = 作る('tbody');
    中身.職員.forEach(function (p) {
      var t = p.時間;
      var 名 = 作る('button', { type: 'button', class: 'name-btn', 'aria-pressed': String(p.職員ID === 選んだ給与の人), text: p.名前 });
      名.addEventListener('click', function () { 選んだ給与の人 = p.職員ID; 給与を描く(); });
      var 行 = 作る('tr', { class: p.職員ID === 選んだ給与の人 ? 'picked' : '' }, [
        作る('td', {}, [名, p.役員 ? ' ' : null, p.役員 ? 作る('span', { class: 'pill no', text: '役員' }) : null]),
        作る('td', { class: 'num total' }, p.金額 ? [円の表示(p.金額.総支給額)] : [作る('span', { class: 'missing', text: '金額なし' })]),
        作る('td', { class: 'num', text: 時間の表示(t.法定内分 + t.時間外25分 + t.時間外50分) }),
        作る('td', { class: 'num', text: 時間の表示(t.深夜分) }),
        作る('td', { class: 'num', text: 時間の表示(t.法定休日分) }),
        作る('td', { class: 'num', text: t.当番日数 + '日' }),
        作る('td', { class: 'num', text: t.出発回数 + '回' })
      ]);
      if (締め) {
        var 前 = 締め.総支給[p.職員ID];
        行.appendChild(作る('td', { class: 'num' + (前 !== (p.金額 && p.金額.総支給額) ? ' diff' : ''), text: 前 === undefined ? '—' : 円の表示(前) }));
      }
      本体.appendChild(行);
    });
    一覧.appendChild(本体);

    var 人 = 中身.職員.filter(function (p) { return p.職員ID === 選んだ給与の人; })[0];
    内訳を描く(人, 中身);
  }

  function 内訳を描く(p, 中身) {
    var 内訳 = 要素('給与の内訳'), t = p.時間, 円 = p.金額 || {};
    var 決 = {};
    中身.決まり.forEach(function (k) { 決[k.項目] = k; });
    var 仮か = function (項目) { return p.仮.indexOf(項目) >= 0; };
    要素('給与の内訳の見出し').textContent = p.名前 + ' の内訳';
    var 単価 = function (項目) { return 決[項目] ? Number(決[項目].値).toLocaleString('ja-JP') + '円' : '—'; };
    var 休日 = 決.法定休日の曜日 ? 決.法定休日の曜日.値 + '曜' : '法定休日';
    var 行たち = p.役員 ? [
      ['役員報酬', '給与の設定', '月額', 円.基本給, false],
      ['毎月決まった手当（交通費など）', '給与の設定', '月額', 円.毎月決まった手当, false]
    ] : [
      ['基本給', '給与の設定', '月額', 円.基本給, 仮か('基本給・手当')],
      ['毎月決まった手当', '給与の設定', '月額', 円.毎月決まった手当, 仮か('基本給・手当')],
      ['残業（8時間まで・割増なし）', '認めた残業のうち、1日8時間・週40時間まで', 時間の表示(t.法定内分), 円.法定内, false],
      ['残業（8時間超・25%）', '1日8時間超と、週40時間超（' + (決.週の起算曜日 ? 決.週の起算曜日.値 + '曜から' : '') + '）', 時間の表示(t.時間外25分), 円.時間外25, 仮か('週の起算曜日')],
      ['月60時間超（50%）', '25%の月の合計が60時間を超えた分', 時間の表示(t.時間外50分), 円.時間外50, false],
      ['深夜（22〜5時・+25%）', '出勤〜退勤のうち深夜の時間', 時間の表示(t.深夜分), 円.深夜, false],
      ['法定休日（35%）', 休日 + 'の勤務の全部', 時間の表示(t.法定休日分), 円.法定休日, 仮か('法定休日の曜日') || 仮か('代休の運用')],
      ['オンコール手当', '当番の日数 × ' + 単価('オンコール単価'), t.当番日数 + '日', 円.オンコール, 仮か('オンコール単価')],
      ['緊急訪問手当', '出発の回数 × ' + 単価('緊急訪問単価'), t.出発回数 + '回', 円.緊急訪問, 仮か('緊急訪問単価')]
    ];
    // どこから（数え方）は項目の下に小さく置く（スマホの幅でも金額まで見える）
    内訳.appendChild(作る('thead', {}, [作る('tr', {}, [
      作る('th', { text: '項目' }), 作る('th', { class: 'num', text: '時間・日数' }), 作る('th', { class: 'num', text: '金額' })
    ])]));
    var 本体 = 作る('tbody');
    行たち.forEach(function (x) {
      本体.appendChild(作る('tr', {}, [
        作る('td', {}, [x[0], x[4] ? ' ' : null, x[4] ? 仮の印() : null, 作る('small', { class: 'how', text: x[1] })]),
        作る('td', { class: 'num', text: x[2] }),
        作る('td', { class: 'num', text: p.金額 ? 円の表示(x[3]) : '—' })
      ]));
    });
    本体.appendChild(作る('tr', { class: 'total-row' }, [
      作る('td', { text: '総支給額' }), 作る('td'),
      作る('td', { class: 'num total', text: p.金額 ? 円の表示(円.総支給額) : '金額なし' })
    ]));
    内訳.appendChild(本体);

    var 下 = '出勤 ' + t.出勤日数 + '日・有給 ' + t.有給の日数 + '日・働いた ' + 時間の表示(t.働いた分);
    if (p.役員) 下 += '。役員なので、残業・深夜・休日の割増と、オンコール・緊急訪問の手当は付きません（当番 ' + t.当番日数 + '日・出発 ' + t.出発回数 + '回）';
    if (p.時給 !== null) 下 += '・時給の元 ' + p.時給.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '円（基本給 ÷ 月平均所定労働時間 ' + (決.月平均所定労働時間 ? 決.月平均所定労働時間.値 + '時間' : '') + (仮か('月平均所定労働時間') ? '・仮' : '') + '）';
    要素('給与の内訳の下').textContent = 下;
    var 気 = 要素('給与の気になる日');
    var 確かめる文 = p.不備.concat(p.気になる日.map(function (x) { return 日付の表示(x.日付) + ' ' + x.文; }));
    確かめる文.forEach(function (文) {
      気.appendChild(作る('li', { class: 'li' }, [作る('span', { class: 'missing', text: '確かめる' }), 作る('span', { text: 文 })]));
    });
    気.hidden = !確かめる文.length;
  }

  /** 締める → その場で「台帳に残します。締めますか？」を出してから送る。締められない時は理由を添えて押せなくする */
  function 締めるボタンを置く(枠) {
    var 中身 = 給与の中身;
    if (!中身.終わった) return;
    var 止める理由 = 中身.確認待ち.残業 || 中身.確認待ち.申請 ? '確認待ちあり'
        : 中身.不備.length || 中身.職員.some(function (p) { return !p.金額; }) ? '金額なしの人あり'
        : !中身.職員.length ? '人がいません' : '';
    if (中身.締め && !中身.締め.変わった && !止める理由) {
      枠.appendChild(作る('span', { class: 'pill ok', text: '締めました' }));
      return;
    }
    if (締めるか聞いている && !止める理由 && !締めている) {
      var はい = 作る('button', { type: 'button', class: 'btn small', text: '締める' });
      var いいえ = 作る('button', { type: 'button', class: 'btn ghost small', text: 'やめる' });
      はい.addEventListener('click', 締める);
      いいえ.addEventListener('click', function () { 締めるか聞いている = false; 給与を描く(); });
      枠.appendChild(作る('span', { class: 'small', text: 'この内容を台帳に残します。締めますか？' }));
      枠.appendChild(はい);
      枠.appendChild(いいえ);
      return;
    }
    var 名前 = 締めている ? '締めています…' : 中身.締め ? 'この月を締め直す' : 'この月を締める';
    var b = 作る('button', { type: 'button', class: 'btn', text: 名前 });
    b.disabled = !!止める理由 || 締めている;
    b.addEventListener('click', function () { 締めるか聞いている = true; 給与を描く(); });
    枠.appendChild(b);
    if (止める理由) 枠.appendChild(作る('span', { class: 'pill wait', text: 止める理由 }));
  }

  function 締める() {
    if (締めている || !給与の中身) return;
    var 見る月 = 給与の中身.月, 目印 = 給与の中身.目印;
    締めるか聞いている = false;
    締めている = true;
    給与を描く();
    送り直しつきで送る({ 操作: '締める', トークン: 鍵, 操作ID: 新しい操作ID(), 月: 見る月, 目印: 目印 },
        function (r) { return 給与の形か(r, 見る月); }).then(function (結果) {
      締めている = false;
      if (!結果.届いた) { 知らせる('締められたか分かりませんでした。給与を読み直します。'); 給与を読む(); return; }
      if (!結果.応答.ok) { 断られた(結果.応答); 給与を読む(); return; }
      if (給与の月 !== 見る月) return;
      給与の中身 = 結果.応答;
      給与を描く();
    });
  }

  function 配る() {
    if (勤務表を送っている || !勤務表の中身 || 勤務表の中身.状態 !== '作った') return;
    var 見る月 = 勤務表の月;
    配るか聞いている = false;
    勤務表を送っている = '配る';
    勤務表を描く();
    送り直しつきで送る({ 操作: '配る', トークン: 鍵, 操作ID: 新しい操作ID(), 月: 見る月 },
        function (r) { return 勤務表の形か(r, 見る月); }).then(function (結果) {
      勤務表を送っている = '';
      if (!結果.届いた) { 知らせる('配れたか分かりませんでした。表を読み直します。'); 勤務表を読む(); return; }
      if (!結果.応答.ok) { 断られた(結果.応答); 勤務表を読む(); return; }
      if (勤務表の月 !== 見る月) return;
      勤務表を受け取る(結果.応答);
    });
  }
})();
