/**
 * 수시 상담 보드 — 시트 백엔드 (P1)
 * =====================================================================
 * 대교협 즐겨찾기 엑셀을 구글 드라이브에 올리면 시트로 열린다. 그 시트를 읽어
 * 학생·지원 레코드로 바꾸고, 상담하면서 쌓이는 것(순위·메모·결과·일정)을 저장한다.
 *
 * 엑셀 파싱을 브라우저가 아니라 여기서 하는 이유
 * ---------------------------------------------
 * 브라우저에서 xlsx를 읽으려면 외부 라이브러리(SheetJS)가 필요한데 학교 망에서
 * CDN이 막힌다. 시트로 열면 라이브러리가 필요 없고, 학생 이름이 브라우저를
 * 거치지도 않는다.
 *
 * 배포
 * ----
 *  즐겨찾기 엑셀을 구글 드라이브에 올려 스프레드시트로 연 뒤, 확장 프로그램 →
 *  Apps Script 에서 이 파일을 붙여넣고 저장한다. 그다음 배포 → 새 배포 →
 *  웹 앱 · 실행: 나 · 액세스: 모든 사용자로 배포하고, 나온 /exec 주소를
 *  보드 화면 설정에 넣으면 된다.
 *
 *  기본은 **주소를 아는 사람이 쓰는** 구조다. 주소를 공유하지 않는 것이 잠금이다.
 *  계정을 지정해 잠그려면 `설정` 시트 A열에 계정을 적는다(access_ 참고).
 *  담임이 볼 반은 서버가 아니라 화면에서 정한다 — 컴퓨터마다 기본 반을 두고,
 *  다른 반이나 학년 전체로는 화면에서 바꾼다.
 *
 *  코드를 고친 뒤에는 배포 → 배포 관리 → 수정(연필) → 새 버전 → 배포를 해야
 *  바뀐 내용이 반영된다.
 *
 * 레코드 모양은 board/CONTRACT.md 가 정본이다. 고칠 때는 그 문서를 먼저 고친다.
 */

/* ===== 설정 ========================================================= */

/** 즐겨찾기 원본이 들어 있는 시트 이름. 여러 개면 앞에서부터 찾는다. */
var SOURCE_SHEETS = ['다운로드 원본', '원본', '즐겨찾기'];

var SHEET = {
  config:  '설정',      // 쓸 수 있는 교사 계정
  state:   '배치',      // 6칸 배치
  note:    '메모',
  result:  '결과',
  date:    '일정',
  share:   '공유',      // 학생별 토큰
  log:     '기록'
};

var HEADERS = {
  설정:  ['이메일', '메모'],
  배치:  ['id', 'hak', 'slot', 'rank', 'by', 'at'],
  메모:  ['noteId', 'hak', 'id', 'text', 'visible', 'by', 'at'],
  결과:  ['id', 'hak', 'stage1', 'final', 'reason', 'waitNo', 'enrolled', 'by', 'at'],
  일정:  ['id', 'hak', 'kind', 'from', 'to', 'status', 'by', 'at'],
  공유:  ['hak', 'token', 'issuedAt', 'expiresAt'],
  기록:  ['at', 'who', 'action', 'detail']
};

/* ===== 헤더 사전 ====================================================
 * 연도마다 컬럼 이름이 바뀐다. 2022 시트는 36열, 2026 시트는 82열이고
 * 「후보순위」가 「최초후보순위」로, 「합격자발표」가 「최종발표일」로 바뀌었다.
 * 그래서 순서가 아니라 이름으로 읽고, 아는 이름을 여기 모아 둔다.
 * 여기에 없는 컬럼은 버리지 않고 Application.unknown 에 남긴다.
 * ==================================================================== */

var FIELD = {
  '학년': 'grade', '반': 'cls', '번호': 'no', '이름': 'name', '성명': 'name',
  '학교유형': 'univType', '지역': 'region', '대학명': 'univ', '대학': 'univ',
  '모집시기': 'period', '전형유형': 'typeCat',
  '전형명(대)': 'typeName', '전형명': 'typeName', '전형': 'typeName',
  '세부유형': 'typeSub', '계열': 'track',
  '모집단위': 'dept', '학과': 'dept',
  '모집인원': 'quotaText', '선발유형': 'selectType',
  '최저학력기준': 'minReqText', '수능최저학력기준': 'minReqText',
  '1단계': 'stage1', '최종단계': 'final', '불합격사유': 'reason',
  '최초후보순위': 'waitNo', '후보순위': 'waitNo', '예비번호': 'waitNo',
  '등록여부': 'enrolled', '비고': 'memo',
  '면접일자': 'd면접', '실기일자': 'd실기', '논술일자': 'd논술', '적성일자': 'd적성',
  '최종발표일': 'd최종발표', '합격자발표': 'd최종발표', '1단계발표': 'd1단계발표'
};

/** (9등급)/(5등급) 아래에 붙는 하위 헤더 */
var SCORE_FIELD = {
  '내점수(환산)': 'myScore',
  '내등급(환산)': 'myGrade'
};

var SUNEUNG_HEAD = '한국사';   // 이 컬럼부터 오른쪽은 수능 블록
var SUNEUNG_SUB = { '과목': 'subject', '표점': 'std', '백분위': 'pct', '등급': 'grade' };

/* ===== 웹앱 진입점 =================================================== */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    out = handle_(p);
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  var body = JSON.stringify(out);
  if (p.callback) {
    return ContentService.createTextOutput(p.callback + '(' + body + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) { return doGet(e); }

function handle_(p) {
  var action = p.action || 'ping';

  // 학생용 경로는 토큰으로만 연다 — 자기 것만 보이고, 자기 것만 고칠 수 있다
  if (action.indexOf('student') === 0) return studentAction_(action, p);

  var me = access_();
  if (!me) {
    return { ok: false, error: '이 보드를 쓸 수 있는 계정이 아닙니다. 3학년실에 문의하세요.' };
  }
  var who = me.email || '이름 없는 접속';

  switch (action) {
    case 'ping':       return { ok: true, who: who, locked: me.locked, at: now_() };
    case 'students':   return loadAll_(me);
    case 'setState':   return setState_(p, who);
    case 'addNote':    return addNote_(p, who);
    case 'removeNote': return removeNote_(p, who);
    case 'setResult':  return setResult_(p, who);
    case 'setDate':    return setDate_(p, who, 'confirmed');
    case 'approveDate': return approveDate_(p, who);
    case 'issueToken': return issueToken_(p, who);
    case 'issueAll':   return issueAll_(p, who);
    default:           return { ok: false, error: '알 수 없는 요청입니다: ' + action };
  }
}

/**
 * 쓸 수 있는지 본다.
 *
 * 기본은 **열린 상태**다. 배포 주소를 아는 사람만 들어올 수 있고, 선생님들이
 * 학교 컴퓨터·집·휴대폰을 오가며 쓰기 때문에 구글 계정으로 고정하면 정작
 * 써야 할 사람이 막히는 일이 더 잦다. 주소 자체가 열쇠인 셈이라,
 * **주소를 공유하지 않는 것**이 이 도구의 실질적인 잠금이다.
 *
 * 잠그고 싶으면 `설정` 시트 A열에 쓸 계정을 적는다. **한 줄이라도 적히면**
 * 그때부터는 그 명단만 들어올 수 있다. 코드에 폴백 명단을 두지 않으므로
 * 시트에서 지우면 곧바로 반영된다.
 *
 * @return {?{email:string, locked:boolean}}
 */
function access_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (err) { email = ''; }

  var list = rows_(SHEET.config).filter(function (r) {
    return String(r['이메일'] || '').trim();
  });
  if (!list.length) return { email: email, locked: false };

  for (var i = 0; i < list.length; i++) {
    if (String(list[i]['이메일']).trim().toLowerCase() === email.toLowerCase()) {
      return { email: email, locked: true };
    }
  }
  return null;
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/* ===== 파서 =========================================================
 * 아래 세 함수는 시트 API를 쓰지 않는 순수 함수다. board/parse.test.mjs 가
 * 실제 2022·2026 시트를 그대로 먹여서 검증한다. 고칠 때 테스트를 같이 돌린다.
 * ==================================================================== */

/**
 * 헤더 2줄을 읽어 컬럼 지도를 만든다.
 * 병합 헤더라 위 줄이 비어 있으면 왼쪽 값을 이어받는다.
 * @return {{main:string[], sub:string[], suneungAt:number, dataFrom:number}}
 */
function readHeader_(values) {
  var main = [], sub = [], carry = '';
  var row0 = values[0] || [], row1 = values[1] || [];
  var width = 0;
  for (var i = 0; i < values.length && i < 3; i++) {
    width = Math.max(width, (values[i] || []).length);
  }
  for (var c = 0; c < width; c++) {
    var top = String(row0[c] == null ? '' : row0[c]).trim();
    if (top) carry = top;
    main.push(top ? top : carry);
    sub.push(String(row1[c] == null ? '' : row1[c]).trim());
  }

  // 수능 블록의 시작
  var suneungAt = -1;
  for (var k = 0; k < main.length; k++) {
    if (main[k] === SUNEUNG_HEAD) { suneungAt = k; break; }
  }

  // 데이터 첫 줄 = 학년 칸이 숫자인 첫 줄
  var dataFrom = 2;
  for (var r = 1; r < values.length; r++) {
    if (/^\d+$/.test(String((values[r] || [])[0] || '').trim())) { dataFrom = r; break; }
  }
  return { main: main, sub: sub, suneungAt: suneungAt, dataFrom: dataFrom };
}

/** "2025-11-29 ~ 2025-11-30" · "11.25(수)~11.27(금)" · "2025.12.12.(금) 14:00" 등 */
function parseDates_(text, hintYear) {
  var s = String(text == null ? '' : text).trim();
  if (!s) return null;
  var parts = s.split(/[~∼〜–—]/);
  var got = [];
  for (var i = 0; i < parts.length; i++) {
    var d = parseOneDate_(parts[i], hintYear);
    if (d) got.push(d);
  }
  if (!got.length) return null;
  var from = got[0], to = got[got.length - 1];
  if (to < from) to = from;
  return { from: from, to: to, fixed: from === to };
}

function parseOneDate_(chunk, hintYear) {
  var s = String(chunk || '').trim();
  if (!s) return null;
  var m = s.match(/(\d{4})\D{1,2}(\d{1,2})\D{1,2}(\d{1,2})/);      // 2025-11-29 · 2025.12.12.
  if (m) return iso_(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);                   // 12월 18일(금)
  if (m) return iso_(hintYear || fallbackYear_(+m[1]), +m[1], +m[2]);
  m = s.match(/(?:^|[^\d.])(\d{1,2})\.(\d{1,2})(?!\d*\.\d)/);       // 11.25(수)
  if (m) return iso_(hintYear || fallbackYear_(+m[1]), +m[1], +m[2]);
  return null;
}

/** 수시 일정은 9~12월이면 그해, 1~2월이면 다음 해로 본다. */
function fallbackYear_(month) {
  var y = new Date().getFullYear();
  return month <= 2 ? y + 1 : y;
}

function iso_(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return y + '-' + pad2_(m) + '-' + pad2_(d);
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** "586" → 586 · "(29)" → 29 · "7(<10)" → 7 · "" → null */
function parseQuota_(text) {
  var m = String(text == null ? '' : text).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function num_(v) {
  if (v == null || v === '') return null;
  var s = String(v).replace(/^'/, '').trim();          // 시트의 "'-" 같은 표기
  if (!s || s === '-' || s === '–') return null;
  var n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function txt_(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

/**
 * 즐겨찾기 시트(2차원 배열)를 학생·지원 레코드로 바꾼다.
 * @return {{students:Object[], apps:Object[], unknownCols:string[], skipped:number}}
 */
function parseFavorites_(values, opts) {
  opts = opts || {};
  var H = readHeader_(values);
  var students = {}, order = [], apps = [], unknownCols = {}, skipped = 0;

  for (var r = H.dataFrom; r < values.length; r++) {
    var row = values[r] || [];
    var g = txt_(row[0]);
    if (!/^\d+$/.test(g)) { if (row.join('')) skipped++; continue; }

    var f = {}, naesin = {}, suneung = {}, unknown = {}, dates = {};

    for (var c = 0; c < H.main.length; c++) {
      var raw = row[c];
      if (raw == null || raw === '') continue;
      var mainName = H.main[c], subName = H.sub[c];

      if (H.suneungAt >= 0 && c >= H.suneungAt) {          // ── 수능 블록
        var slot = suneung[mainName] || (suneung[mainName] = {});
        var key = SUNEUNG_SUB[subName] || (subName || 'grade');
        slot[key] = (key === 'subject') ? txt_(raw) : num_(raw);
        continue;
      }

      if (SCORE_FIELD[mainName]) { f[SCORE_FIELD[mainName]] = num_(raw); continue; }

      var field = FIELD[mainName];
      if (field) { f[field] = txt_(raw); continue; }

      // (9등급)/(5등급) 아래 일반점수·일반등급
      if (/^\(\d+등급\)$/.test(mainName)) {
        f['scale' + mainName.replace(/\D/g, '') + '_' + (subName || 'x')] = num_(raw);
        continue;
      }

      // 남은 것 중 이름이 조합처럼 생겼으면 내신, 아니면 미인식
      if (isNaesinName_(mainName)) {
        var nk = mainName + (subName && subName !== '100' ? '(' + subName + ')' : '');
        naesin[nk] = num_(raw);
      } else {
        var label = mainName + (subName ? '/' + subName : '');
        unknown[label] = txt_(raw);
        unknownCols[label] = true;
      }
    }

    // 학번은 4자리다 — 3217 = 3학년 2반 17번. 반은 한 자리, 번호는 두 자리로 채운다.
    var hak = f.grade && f.cls && f.no
      ? txt_(f.grade) + txt_(f.cls) + pad2_(parseInt(f.no, 10))
      : '';
    if (!hak || !f.name) { skipped++; continue; }

    // 학생 (첫 행에서 성적을 집는다)
    if (!students[hak]) {
      students[hak] = {
        hak: hak, grade: parseInt(f.grade, 10), cls: txt_(f.cls), no: txt_(f.no),
        name: f.name, naesin: naesin, suneung: suneung, apps: []
      };
      order.push(hak);
    }

    // 일정
    for (var fk in f) {
      if (fk.charAt(0) !== 'd' || fk.length < 2) continue;
      var kind = fk.slice(1);
      var parsed = parseDates_(f[fk], opts.year);
      if (parsed) dates[kind] = parsed;
      else if (f[fk]) unknown['일정/' + kind] = f[fk];
    }

    var app = {
      id: '', hak: hak,
      univType: f.univType || '', region: f.region || '', univ: f.univ || '',
      period: f.period || '', typeCat: f.typeCat || '', typeName: f.typeName || '',
      typeSub: f.typeSub || '', track: f.track || '', dept: f.dept || '',
      quotaText: f.quotaText || '', quota: parseQuota_(f.quotaText),
      selectType: f.selectType || '', minReqText: f.minReqText || '',
      myScore: (f.myScore != null || f.myGrade != null)
        ? { score: f.myScore == null ? null : f.myScore,
            grade: f.myGrade == null ? null : f.myGrade }
        : null,
      dates: dates,
      result: {
        stage1: f.stage1 || null, final: f.final || null, reason: f.reason || null,
        waitNo: f.waitNo || null, enrolled: f.enrolled || null
      },
      unknown: unknown
    };
    app.id = appId_(app);
    if (!app.univ || !app.dept) { skipped++; continue; }
    apps.push(app);
    students[hak].apps.push(app.id);
  }

  var list = [];
  for (var i = 0; i < order.length; i++) list.push(students[order[i]]);
  var cols = [];
  for (var u in unknownCols) cols.push(u);
  return { students: list, apps: apps, unknownCols: cols, skipped: skipped };
}

/** 안정키 — 원본을 갈아끼워도 메모·순위가 붙어 있게 한다. CONTRACT.md §3 */
function appId_(app) {
  // 구분자는 학과명·전형명에 절대 나오지 않는 문자여야 한다. 공백으로 이으면
  // `가 나` + `다` 와 `가` + `나 다` 가 같은 씨앗이 되어 메모가 뒤섞인다.
  var seed = [app.hak, app.univ, app.typeSub, app.dept].join('\u0001');
  return sha1_(seed).slice(0, 16);
}

function sha1_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, s, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

var NAESIN_HINT = /^(전교과|국|영|수|사|과|한국사)|[가-힣]+\/[가-힣]+$/;
var NAESIN_EXACT = {
  '국어': 1, '영어': 1, '수학': 1, '사회': 1, '과학': 1, '전교과': 1,
  '국영수': 1, '국영수사': 1, '국영사': 1, '국영수과': 1, '수영과': 1, '국영수사/과': 1
};

function isNaesinName_(name) {
  if (NAESIN_EXACT[name]) return true;
  return NAESIN_HINT.test(name) && name.length <= 8;
}

/* ===== 시트 읽기·쓰기 ================================================ */

function sourceSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    for (var j = 0; j < SOURCE_SHEETS.length; j++) {
      if (name.indexOf(SOURCE_SHEETS[j]) >= 0) return sheets[i];
    }
  }
  return sheets[0];
}

function tab_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    var head = HEADERS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_(name) {
  var sh = tab_(name), last = sh.getLastRow();
  if (last < 2) return [];
  var head = HEADERS[name];
  var vals = sh.getRange(2, 1, last - 1, head.length).getValues(), out = [];
  for (var i = 0; i < vals.length; i++) {
    if (!String(vals[i].join('')).trim()) continue;
    var o = {};
    for (var j = 0; j < head.length; j++) o[head[j]] = vals[i][j];
    o._row = i + 2;
    out.push(o);
  }
  return out;
}

/** 같은 키의 행이 있으면 덮어쓰고 없으면 붙인다. */
function upsert_(name, keyCols, obj) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = tab_(name), head = HEADERS[name], existing = rows_(name);
    var at = -1;
    for (var i = 0; i < existing.length && at < 0; i++) {
      var same = true;
      for (var k = 0; k < keyCols.length; k++) {
        if (String(existing[i][keyCols[k]]) !== String(obj[keyCols[k]])) { same = false; break; }
      }
      if (same) at = existing[i]._row;
    }
    var line = [];
    for (var c = 0; c < head.length; c++) {
      line.push(obj[head[c]] == null ? '' : obj[head[c]]);
    }
    if (at > 0) sh.getRange(at, 1, 1, head.length).setValues([line]);
    else sh.appendRow(line);
    return at > 0 ? 'updated' : 'added';
  } finally {
    lock.releaseLock();
  }
}

function log_(who, action, detail) {
  try {
    tab_(SHEET.log).appendRow([now_(), who, action, detail || '']);
  } catch (err) { /* 기록 실패가 본 작업을 막지 않게 한다 */ }
}

/* ===== 액션 ========================================================= */

/**
 * 학년 전체를 보낸다.
 *
 * 반을 서버에서 잘라 보내지 않는 이유 — 담임도 다른 반을 봐야 할 때가 있고,
 * 3학년실은 전체를 본다. 대신 화면이 이 컴퓨터에 정해 둔 반을 먼저 보여 주고,
 * 다른 반이나 학년 전체로는 화면에서 바꾼다.
 */
function loadAll_(me) {
  var parsed = parseFavorites_(sourceSheet_().getDataRange().getValues());
  return {
    ok: true, who: me.email || '이름 없는 접속', locked: me.locked, at: now_(),
    students: parsed.students, apps: parsed.apps,
    unknownCols: parsed.unknownCols, skipped: parsed.skipped,
    state: rows_(SHEET.state), notes: rows_(SHEET.note),
    results: rows_(SHEET.result), dates: rows_(SHEET.date)
  };
}

function setState_(p, who) {
  if (!p.id || !p.hak) return { ok: false, error: 'id 와 hak 이 필요합니다.' };
  var slot = p.slot || 'pool';
  var rank = slot === 'rank' ? parseInt(p.rank, 10) : '';
  if (slot === 'rank' && !(rank >= 1 && rank <= 6)) {
    return { ok: false, error: '순위는 1~6 사이여야 합니다.' };
  }
  upsert_(SHEET.state, ['id'], {
    id: p.id, hak: p.hak, slot: slot, rank: rank, by: who, at: now_()
  });
  log_(who, 'setState', p.hak + ' ' + p.id + ' → ' + slot + (rank ? ('#' + rank) : ''));
  return { ok: true };
}

function addNote_(p, who) {
  if (!p.hak || !String(p.text || '').trim()) {
    return { ok: false, error: '학번과 내용이 필요합니다.' };
  }
  var noteId = String(p.noteId || (new Date().getTime()));
  upsert_(SHEET.note, ['noteId'], {
    noteId: noteId, hak: p.hak, id: p.id || '', text: p.text,
    visible: p.visible === 'true' || p.visible === true ? 'Y' : 'N',
    by: who, at: now_()
  });
  return { ok: true, noteId: noteId };
}

function removeNote_(p, who) {
  var sh = tab_(SHEET.note), all = rows_(SHEET.note);
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].noteId) === String(p.noteId)) {
      sh.deleteRow(all[i]._row);
      log_(who, 'removeNote', String(p.noteId));
      return { ok: true, removed: true };
    }
  }
  return { ok: true, removed: false };
}

function setResult_(p, who) {
  if (!p.id || !p.hak) return { ok: false, error: 'id 와 hak 이 필요합니다.' };
  upsert_(SHEET.result, ['id'], {
    id: p.id, hak: p.hak,
    stage1: p.stage1 || '', final: p.final || '', reason: p.reason || '',
    waitNo: p.waitNo || '', enrolled: p.enrolled || '', by: who, at: now_()
  });
  log_(who, 'setResult', p.hak + ' ' + p.id + ' ' + (p.final || ''));
  return { ok: true };
}

function setDate_(p, who, status) {
  if (!p.id || !p.kind) return { ok: false, error: 'id 와 종목이 필요합니다.' };
  var from = String(p.from || '').trim(), to = String(p.to || from).trim();
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return { ok: false, error: '날짜는 2025-11-29 형식으로 보내주세요.' };
  }
  upsert_(SHEET.date, ['id', 'kind'], {
    id: p.id, hak: p.hak || '', kind: p.kind, from: from, to: to,
    status: status, by: who, at: now_()
  });
  return { ok: true };
}

/* ===== 학생 공유 ====================================================
 * 학생은 토큰으로만 들어오고, 토큰이 가리키는 학번의 것만 읽고 쓴다.
 * 학생이 넣은 값은 곧바로 확정되지 않는다 — `확인 대기`로 들어가고
 * 담임이 눌러야 확정된다. 잘못 적은 날짜로 겹침 판정이 틀어지면 안 되기 때문이다.
 * ==================================================================== */

/** 토큰을 학번으로 바꾼다. 없거나 기한이 지났으면 null. */
function hakOfToken_(token) {
  token = String(token || '').trim();
  if (!token) return null;
  var share = rows_(SHEET.share);
  for (var i = 0; i < share.length; i++) {
    if (String(share[i].token) !== token) continue;
    if (share[i].expiresAt && now_() > String(share[i].expiresAt)) return null;
    return String(share[i].hak);
  }
  return null;
}

/** 그 지원이 정말 이 학생 것인지 확인한다. 남의 것을 고치지 못하게. */
function ownsApp_(hak, id) {
  var parsed = parseFavorites_(sourceSheet_().getDataRange().getValues());
  for (var i = 0; i < parsed.apps.length; i++) {
    if (parsed.apps[i].id === String(id)) return parsed.apps[i].hak === hak;
  }
  return false;
}

function studentAction_(action, p) {
  if (action === 'student') return studentView_(p.token);

  var hak = hakOfToken_(p.token);
  if (!hak) {
    return { ok: false, error: '만료되었거나 잘못된 주소입니다. 담임 선생님께 문의하세요.' };
  }
  if (!p.id || !ownsApp_(hak, p.id)) {
    return { ok: false, error: '본인 지원 내역이 아닙니다.' };
  }
  var who = hak + ' 학생';

  if (action === 'studentDate') return setDate_(p, who, 'pending');
  if (action === 'studentApplyNo') {
    upsert_(SHEET.note, ['noteId'], {
      noteId: 'applyno-' + p.id, hak: hak, id: p.id,
      text: '접수번호 ' + String(p.applyNo || '').trim(),
      visible: 'Y', by: who, at: now_()
    });
    return { ok: true };
  }
  if (action === 'studentAsk') {
    if (!String(p.text || '').trim()) return { ok: false, error: '내용을 적어 주세요.' };
    return addNote_({ hak: hak, id: p.id, text: p.text, visible: 'true' }, who);
  }
  return { ok: false, error: '알 수 없는 요청입니다: ' + action };
}

/** 담임이 학생이 넣은 날짜를 확인해 확정으로 올린다. */
function approveDate_(p, who) {
  if (!p.id || !p.kind) return { ok: false, error: 'id 와 종목이 필요합니다.' };
  var all = rows_(SHEET.date), hit = null;
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].id) === String(p.id) && String(all[i].kind) === String(p.kind)) hit = all[i];
  }
  if (!hit) return { ok: false, error: '확인할 일정이 없습니다.' };
  upsert_(SHEET.date, ['id', 'kind'], {
    id: hit.id, hak: hit.hak, kind: hit.kind, from: hit.from, to: hit.to,
    status: 'confirmed', by: who, at: now_()
  });
  log_(who, 'approveDate', hit.hak + ' ' + hit.kind + ' ' + hit.from);
  return { ok: true };
}

/** 반 전체 토큰을 한 번에 발급한다. 이미 있으면 그대로 둔다. */
function issueAll_(p, who) {
  var parsed = parseFavorites_(sourceSheet_().getDataRange().getValues());
  var only = String(p.cls || '').trim();
  var have = {};
  rows_(SHEET.share).forEach(function (r) { have[String(r.hak)] = String(r.token); });

  var out = [];
  for (var i = 0; i < parsed.students.length; i++) {
    var s = parsed.students[i];
    if (only && String(s.cls) !== only) continue;
    if (!have[s.hak]) {
      var token = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
      upsert_(SHEET.share, ['hak'], {
        hak: s.hak, token: token, issuedAt: now_(), expiresAt: ''
      });
      have[s.hak] = token;
    }
    out.push({ hak: s.hak, name: s.name, token: have[s.hak] });
  }
  log_(who, 'issueAll', (only ? only + '반 ' : '전체 ') + out.length + '명');
  return { ok: true, items: out };
}


function issueToken_(p, who) {
  if (!p.hak) return { ok: false, error: '학번이 필요합니다.' };
  var token = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
  upsert_(SHEET.share, ['hak'], {
    hak: p.hak, token: token, issuedAt: now_(), expiresAt: p.expiresAt || ''
  });
  log_(who, 'issueToken', p.hak);
  return { ok: true, hak: p.hak, token: token };
}

function studentView_(token) {
  token = String(token || '').trim();
  if (!token) return { ok: false, error: '주소가 올바르지 않습니다.' };
  var share = rows_(SHEET.share), hit = null;
  for (var i = 0; i < share.length; i++) {
    if (String(share[i].token) === token) { hit = share[i]; break; }
  }
  if (!hit) return { ok: false, error: '만료되었거나 잘못된 주소입니다. 담임 선생님께 문의하세요.' };
  if (hit.expiresAt && now_() > String(hit.expiresAt)) {
    return { ok: false, error: '기한이 지난 주소입니다. 담임 선생님께 재발급을 요청하세요.' };
  }

  var hak = String(hit.hak);
  var parsed = parseFavorites_(sourceSheet_().getDataRange().getValues());
  var me = null;
  for (var s = 0; s < parsed.students.length; s++) {
    if (parsed.students[s].hak === hak) { me = parsed.students[s]; break; }
  }
  if (!me) return { ok: false, error: '지원 내역을 찾지 못했습니다. 담임 선생님께 문의하세요.' };

  var mine = function (arr) {
    return (arr || []).filter(function (r) { return String(r.hak) === hak; });
  };
  return {
    ok: true, hak: hak, student: me,
    apps: parsed.apps.filter(function (a) { return a.hak === hak; }),
    state: mine(rows_(SHEET.state)),
    dates: mine(rows_(SHEET.date)),
    notes: mine(rows_(SHEET.note)).filter(function (n) { return String(n.visible) === 'Y'; })
  };
}
