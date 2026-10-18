/**
 * 勤怠システム — 代表の画面（タブ2つ：職員ごとの1か月・記録の一覧）
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

  // タブ。前に見ていたタブを覚えておく（この端末の中だけ）
  ['月', '記録'].forEach(function (名) {
    要素('タブ-' + 名).addEventListener('click', function () { タブを選ぶ(名); });
  });
  タブを選ぶ(取り出す('タブ') === '記録' ? '記録' : '月');
  要素('月の職員').addEventListener('change', function () {
    しまう('月の職員', 要素('月の職員').value);
    月を読む();
  });
  要素('前の月').addEventListener('click', function () { 月を動かす(-1); });
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
      if (初めて) 月を読む();
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
    ['月', '記録'].forEach(function (n) {
      var 選んだ = n === 名;
      要素('タブ-' + n).setAttribute('aria-selected', String(選んだ));
      要素('タブ-' + n).classList.toggle('on', 選んだ);
      要素('面-' + n).hidden = !選んだ;
    });
    しまう('タブ', 名);
  }

  function 描く(中身) {
    要素('名前').textContent = 中身.自分.名前;
    要素('読んだ時刻').textContent = 端末の時分(Date.now()) + ' に読み込み';

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
    return !!r.自分 && typeof r.自分.名前 === 'string' &&
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
    }
    tr.appendChild(時刻);

    // 休憩は、出勤か退勤のある日だけ（夜の呼び出しだけの日には出さない）
    tr.appendChild(作る('td', { class: 'num' }, d.出勤 || d.退勤 ? [字(d.休憩分 + '分', 直したか(d, '休憩'))] : []));
    tr.appendChild(作る('td', { class: 'num', text: d.働いた分 === null ? '' : 時間の表示(d.働いた分) }));

    var 差 = 作る('td');
    if (d.前後が重なる) 差.appendChild(作る('span', { class: 'missing small', text: '前後の日と時刻が重なっています。直すまで合計に入れません' }));
    if (d.差分 !== null) {
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
    });
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
})();
