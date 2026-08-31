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
/*
 * 이 코드가 어느 판인지. **배포 확인용이다** — 코드를 고칠 때마다 날짜를 올린다.
 * 배포 뒤 브라우저에서 <웹앱 주소>?action=ping&key=<열쇠> 를 열면 ver 로
 * 새 판이 실제로 배포됐는지 확인할 수 있다. 여태 이걸 확인할 길이 없어서
 * 「배포했는데 안 바뀐다」를 감으로 가려야 했다.
 */
var CODE_VER = '2026-08-31';

var SOURCE_SHEETS = ['다운로드 원본', '원본', '즐겨찾기'];

var SHEET = {
  config:  '설정',      // 쓸 수 있는 교사 계정
  state:   '배치',      // 6칸 배치
  note:    '메모',
  result:  '결과',
  date:    '일정',
  share:   '공유',      // 학생별 토큰
  alias:   '별칭',      // 못 붙인 학과를 손으로 이어 준 것
  field:   '입력',      // 원서를 낸 뒤에 채워지는 칸 (수험번호·최종경쟁률·생년월일)
  log:     '기록'
};

var HEADERS = {
  // B2 에 원본 시트 주소를 적으면 즐겨찾기를 딴 파일에서 읽는다 (sourceBook_ 참고)
  설정:  ['이메일', '원본 즐겨찾기 시트 주소 — 아래 한 칸에만', '교사 열쇠 — 아래 한 칸에만'],
  배치:  ['id', 'hak', 'slot', 'rank', 'by', 'at'],
  메모:  ['noteId', 'hak', 'id', 'text', 'visible', 'by', 'at'],
  // status: 'student' 학생이 적음 · 'confirmed' 선생님이 확인함
  결과:  ['id', 'hak', 'stage1', 'final', 'reason', 'waitNo', 'enrolled',
          'status', 'by', 'at'],
  일정:  ['id', 'hak', 'kind', 'from', 'to', 'status', 'by', 'at'],
  공유:  ['hak', 'token', 'issuedAt', 'expiresAt'],
  // 즐겨찾기 표기 → 자료 쪽 표기. 학생이 아니라 **학과**에 붙는 것이라
  // 엑셀을 갈아끼워도 그대로 남는다.
  별칭:  ['univ', 'dept', 'toUniv', 'toDept', 'note', 'by', 'at'],
  /*
   * 원서를 내고 **나서야** 알게 되는 칸들. 즐겨찾기에도 모집요강에도 없다.
   *   수험번호     원서를 내면 대학이 준다. 면접장에서 부르는 번호다
   *   최종경쟁률   마감 뒤 대학이 발표한다. 예비번호가 얼마나 돌지 가늠할 때 본다
   *   생년월일     합격 조회에 쓴다. 학생 한 명에 하나라 id 는 비워 둔다
   *
   * 메모 탭에 밀어 넣지 않는다. 상담 메모가 묻히고, 나중에 칸을 더할 때마다
   * 「접수번호 …」 같은 앞글자 규칙이 늘어난다.
   * status: 'student' 학생이 적음 · 'confirmed' 선생님이 확인함 — 일정과 같다.
   */
  입력:  ['id', 'hak', 'field', 'value', 'status', 'by', 'at'],
  기록:  ['at', 'who', 'action', 'detail']
};

/* ===== 헤더 사전 ====================================================
 * 연도마다 컬럼 이름이 바뀐다. 2022 시트는 36열, 2026 시트는 82열이고
 * 「후보순위」가 「최초후보순위」로, 「합격자발표」가 「최종발표일」로 바뀌었다.
 * 그래서 순서가 아니라 이름으로 읽고, 아는 이름을 여기 모아 둔다.
 * 여기에 없는 컬럼은 버리지 않고 Application.unknown 에 남긴다.
 * ==================================================================== */

/*
 * 칸 이름 사전. **순서가 아니라 이름으로 읽는다.**
 *
 * 대교협 파일은 해마다 칸이 바뀐다 — 2022 시트는 36열, 2026 시트는 82열이고
 * 「후보순위」가 「최초후보순위」로, 「합격자발표」가 「최종발표일」로 바뀌었다.
 * 그래서 자리를 세지 않고 이름을 본다. 사전에 없는 칸은 버리지 않고
 * `Application.unknown` 에 남겨, 새 칸이 생겨도 자료가 사라지지 않게 한다.
 *
 * 이름은 `head_` 로 다듬어 견준다 — 사이 공백과 줄바꿈을 지운 꼴이다.
 * 그래서 여기 키에도 공백을 넣지 않는다.
 *
 * 아래 묶음이 **「관심대학 리스트」에서 새로 온 이름**이다. 같은 것을 다르게
 * 부르는 것뿐이라 사전에 한 줄씩 더하면 나머지 코드는 그대로 돈다.
 */
var FIELD = {
  '학년': 'grade', '반': 'cls', '번호': 'no', '이름': 'name', '성명': 'name',
  '학교유형': 'univType', '설립구분': 'univType',
  '지역': 'region', '대학명': 'univ', '대학': 'univ',
  '모집시기': 'period', '시기': 'period', '전형유형': 'typeCat',
  '전형명(대)': 'typeName', '전형명': 'typeName', '전형': 'typeName',
  '세부유형': 'typeSub', '계열': 'track',
  '모집단위': 'dept', '학과': 'dept',
  '모집인원': 'quotaText', '선발유형': 'selectType',
  '최저학력기준': 'minReqText', '수능최저학력기준': 'minReqText',
  // 관심대학 리스트는 최저를 「있다/없다」로만 준다. 기준 글은 모집요강에 있다.
  '수능최저유무': 'minReqYN',
  // 1단계에서 무엇을 보는가 — 「서류 100%」 꼴. 단계별인지 가리는 데 쓸 수 있다.
  '1단계반영요소': 'stage1Rule',
  '1단계': 'stage1', '최종단계': 'final', '불합격사유': 'reason',
  '최초후보순위': 'waitNo', '후보순위': 'waitNo', '예비번호': 'waitNo',
  '등록여부': 'enrolled', '비고': 'memo',
  /*
   * 일정 칸은 `날짜:` 를 앞에 붙인다. 예전에는 `d` 한 글자였는데 **`dept`(모집단위)와
   * 부딪혔다** — 「d 로 시작하는 칸은 일정」이라 학과 이름이 날짜로 읽혔고,
   * 못 읽으니 지원마다 `unknown['일정/ept'] = '영어영문학과'` 가 붙었다.
   * 요약에는 안 나와서(미인식 칸은 열 단위로만 센다) 오래 안 보였다.
   */
  '접수일자': '날짜:접수',
  '면접일자': '날짜:면접', '실기일자': '날짜:실기',
  '논술일자': '날짜:논술', '적성일자': '날짜:적성',
  '최종발표일': '날짜:최종발표', '합격자발표': '날짜:최종발표', '1단계발표': '날짜:1단계발표'
};

/** (9등급)/(5등급) 아래에 붙는 하위 헤더 */
var SCORE_FIELD = {
  '내점수(환산)': 'myScore',
  '내등급(환산)': 'myGrade',
  // 관심대학 리스트는 괄호 없이 준다. 아직 안 적었으면 0 으로 오므로 뒤에서 건다.
  '내점수': 'myScore',
  '내등급': 'myGrade'
};

/*
 * 자료가 아닌 칸. 「알아보지 못한 칸」에 올리지 않는다.
 * 관심대학 리스트의 `No` 는 줄 번호라 파일을 열 때마다 경고가 뜨면 소음이다.
 */
var SKIP_COL = { 'No': true, 'NO': true, '연번': true, '순번': true };

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

  /*
   * 학생용 경로는 토큰으로만 연다 — 자기 것만 보이고, 자기 것만 고칠 수 있다.
   *
   * **이름 앞자리로 가르지 않는다.** 예전에는 `action.indexOf('student') === 0` 이었는데
   * 교사 화면의 자료 적재인 **`students` 가 여기 걸렸다**(`'students'.indexOf('student')`
   * 는 0 이다). 토큰이 없으니 늘 「만료되었거나 잘못된 주소입니다」로 떨어졌고,
   * `case 'students'` 는 닿을 수 없는 코드였다. 보드를 실제 시트에 붙이면 자료가
   * 통째로 안 올라온다 — 보기용 자료(`?demo=1`)는 서버를 안 불러서 안 드러났다.
   *
   * 이름을 **또박또박 적어** 가른다. 새 경로를 더할 때 여기 한 줄을 같이 적어야 하고,
   * 그 대가로 교사 경로가 실수로 학생 쪽에 먹히는 일이 없어진다.
   */
  if (STUDENT_ACTION[action]) return studentAction_(action, p);

  /*
   * **교사 경로는 열쇠를 요구한다.**
   *
   * 학생 링크에는 이 배포 주소가 `?api=` 로 그대로 들어 있다. 「액세스: 모든 사용자」로
   * 배포해야 학생이 열 수 있는데, 그러면 구글이 접속자 계정을 안 알려 줘서
   * `access_()` 가 아무나 통과시킨다. 학생이 제 링크에서 주소만 떼어
   * `?action=students` 를 부르면 **전교생 이름·내신·지원 목록에 교사 비공개 메모까지**
   * 그대로 나온다. 실제로 돌려 봤다.
   *
   * 그래서 시트 `설정` 탭 C2 에 아무 글자나 적어 두고, 보드만 그걸 함께 보낸다.
   * 학생 링크에는 안 들어간다. 열쇠를 안 적어 두면 예전처럼 열려 있고 —
   * 옛 시트를 쓰던 분이 갑자기 못 들어오면 그게 더 나쁘다 — 대신 보드가
   * 「지금 아무나 볼 수 있습니다」라고 붉게 알린다.
   */
  var key = teacherKey_();
  if (key && String(p.key || '') !== key) {
    return { ok: false, error: '교사 열쇠가 맞지 않습니다.'
      + ' 보드 설정 화면에서 시트 「설정」 탭 C2 에 적은 열쇠를 넣어 주세요.' };
  }

  var me = access_();
  if (me && me.blind) {
    return { ok: false, error:
      '설정 탭에 계정 명단이 적혀 있는데, 이 배포 방식에서는 누가 들어왔는지 알 수 없어'
      + ' 아무도 못 들어옵니다. 「액세스: 모든 사용자」로 배포하면 구글이 접속자 계정을'
      + ' 알려 주지 않기 때문입니다(학생 링크 때문에 그렇게 배포해야 합니다).'
      + ' 시트의 설정 탭 A열을 비워 주세요. 잠금은 배포 주소를 안 알리는 것으로 합니다.' };
  }
  if (!me) {
    return { ok: false, error: '이 보드를 쓸 수 있는 계정이 아닙니다. 3학년실에 문의하세요.' };
  }
  var who = me.email || '이름 없는 접속';

  switch (action) {
    case 'ping':       return { ok: true, who: who, locked: me.locked, at: now_(), ver: CODE_VER };
    case 'students':   return loadAll_(me);
    case 'setState':   return setState_(p, who);
    case 'setRank':    return setRank_(p, who);
    case 'addNote':    return addNote_(p, who);
    case 'removeNote': return removeNote_(p, who);
    case 'setResult':  return setResult_(p, who, 'confirmed');
    case 'approveResult': return approveResult_(p, who);
    case 'setDate':    return setDate_(p, who, 'confirmed');
    case 'approveDate': return approveDate_(p, who);
    case 'issueToken': return issueToken_(p, who);
    case 'issueAll':   return issueAll_(p, who);
    case 'setField':   return setField_(p, who, 'confirmed');
    case 'approveField': return approveField_(p, who);
    case 'setAlias':   return setAlias_(p, who);
    case 'removeAlias': return removeAlias_(p, who);
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
/**
 * 이 사람이 보드를 쓸 수 있나.
 * =====================================================================
 * `설정` 탭 A열에 계정을 적으면 그 명단만 들어온다. **한 줄이라도 적히면** 잠긴다.
 *
 * 다만 **이 배포 방식에서는 대개 못 잠근다.** 학생 링크 때문에 「액세스: 모든 사용자」
 * 로 배포해야 하는데, 그러면 `Session.getActiveUser().getEmail()` 이 빈 문자열이다.
 * 그 상태에서 명단을 적으면 ''는 어떤 줄과도 안 맞아 **선생님 전원이 잠긴다.**
 *
 * 조용히 「쓸 수 있는 계정이 아닙니다」만 뜨면 왜 그런지 알 길이 없다. 그래서
 * 누구인지 아예 못 알아본 경우와, 알아봤는데 명단에 없는 경우를 **갈라서 말한다.**
 * 잠그는 것 자체는 그대로 둔다 — 열어 주는 쪽으로 봐주면 그건 잠금이 아니다.
 * 되돌리는 길은 시트 주인에게 늘 있다(설정 탭 A열을 비우면 된다).
 */
/*
 * 기본 교사 열쇠. **`board/api.js` 의 `DEFAULT_KEY` 와 같아야 한다.**
 *
 * 시트 `설정` 탭 C2 를 비워 두면 이 값을 쓴다. 설치할 때 손댈 곳이 하나 줄고,
 * 3학년실 컴퓨터 여러 대에서 따로 넣을 것도 없다.
 *
 * **이 값은 공개 저장소에 적혀 있다.** 저장소를 찾아본 사람은 그대로 읽을 수 있다.
 * 그러니 이건 잠금이 아니라 **빗장**이다 — 학생이 제 링크에서 주소만 떼어
 * `?action=students` 를 불러 보는 것은 막지만, 저장소까지 뒤지는 사람은 못 막는다.
 * 진짜로 잠그려면 C2 에 **다른 글자**를 적고 보드 설정에도 같은 글자를 넣는다.
 * 그러면 저장소에 없는 값이라 아무도 모른다.
 */
var DEFAULT_KEY = '84348434';

/** 교사 열쇠. 시트 `설정` 탭 C2 에 적어 두면 그것, 비어 있으면 기본값. */
function teacherKey_() {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.config);
    var own = sh ? String(sh.getRange('C2').getValue() || '').trim() : '';
    return own || DEFAULT_KEY;
  } catch (err) {
    return DEFAULT_KEY;
  }
}

/** 지금 쓰는 열쇠가 저장소에 적힌 기본값인가 — 그러면 보드가 알린다. */
function usingDefaultKey_() {
  return teacherKey_() === DEFAULT_KEY;
}

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
  if (!email) {
    return { blind: true };      // 누구인지 못 알아봤다 — handle_ 이 사유를 적어 준다
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
/**
 * 머리글 이름을 견주기 좋게 다듬는다.
 *
 * 대교협이 내려 주는 파일은 칸 이름 안에 줄바꿈이 들어 있다 — 「모집\n인원」·
 * 「수능\n최저\n유무」. 눈으로는 두 줄이지만 글자로는 `모집\n인원` 이라
 * `FIELD['모집인원']` 에 안 걸린다. 사이 공백을 다 지우고 견준다.
 *
 * 화면에 보여 줄 때는 원본 이름을 쓴다 — 「알아보지 못한 칸」에 `모집인원` 이라
 * 적으면 선생님이 파일에서 그 칸을 못 찾는다.
 */
function head_(v) {
  return String(v == null ? '' : v).replace(/\s+/g, '');
}

/**
 * 머리글이 몇 째 줄인지 **찾는다.** 첫 줄이라고 못 박지 않는다.
 * =====================================================================
 * 대교협 파일이 해마다 모양이 다르다. 여태 쓰던 즐겨찾기는 첫 줄이 머리글이고
 * 둘째 줄이 내신·수능 블록의 아래 머리글이었는데, 이번에 받은 「관심대학 리스트」는
 * 다르다.
 *
 *     1행  (비어 있음)
 *     2행  관심대학 리스트          ← 제목
 *     3행  (비어 있음)
 *     4행  No 학년 반 번호 이름 …   ← 머리글
 *     5행~ 자료
 *
 * 첫 줄을 머리글로 박아 두면 이 파일은 **모든 칸이 미인식**이 되어 통째로 빈다.
 *
 * 그래서 줄 번호를 정하지 않고 **아는 이름이 가장 많이 맞는 줄**을 머리글로 본다.
 * 자료가 바뀌어도 이름만 알아보면 따라간다. 두 벌을 따로 짜서 「이 파일은 A형」
 * 하고 가르는 것보다 낫다 — 내년에 또 다른 모양이 와도 그대로 걸린다.
 *
 * 아래 머리글(`sub`)은 **머리글과 자료 사이에 줄이 있을 때만** 있는 것으로 본다.
 * 즐겨찾기는 있고(내신 조합·수능 과목), 관심대학 리스트는 없다.
 */
function readHeader_(values) {
  /*
   * 앞에서 200줄까지 훑는다. 머리글이 4행인 파일을 봤으니 첫 줄로 못 박을 수 없고,
   * 그렇다고 시트 전체를 훑을 까닭도 없다 — 자료 줄은 아는 이름이 한둘이라 머리글을
   * 이길 수 없어서, 넉넉히 잡아도 엉뚱한 줄을 고르지 않는다.
   */
  var scan = Math.min(values.length, 200);
  var at = 0, best = -1;
  for (var r = 0; r < scan; r++) {
    var row = values[r] || [], hits = 0;
    for (var c = 0; c < row.length; c++) {
      var n = head_(row[c]);
      if (n && (FIELD[n] || SCORE_FIELD[n])) hits++;
    }
    if (hits > best) { best = hits; at = r; }
  }

  // 학번을 만드는 칸(학년)이 몇 째인가. 자료 줄을 가리는 데 쓴다.
  var gradeCol = 0;
  var hrow = values[at] || [];
  for (var g = 0; g < hrow.length; g++) {
    if (FIELD[head_(hrow[g])] === 'grade') { gradeCol = g; break; }
  }

  // 자료 첫 줄 = 머리글 뒤에서 학년 칸이 숫자인 첫 줄
  var dataFrom = at + 1;
  for (var d = at + 1; d < values.length; d++) {
    if (/^\d+$/.test(String((values[d] || [])[gradeCol] || '').trim())) { dataFrom = d; break; }
  }

  var main = [], sub = [], carry = '';
  var subRow = (dataFrom > at + 1) ? (values[at + 1] || []) : [];
  /*
   * **머리글이 한 줄뿐이면 앞 이름을 물려주지 않는다.**
   *
   * 즐겨찾기는 내신·수능 블록의 머리글이 가로로 합쳐져 있어서, 빈 칸은 「왼쪽과
   * 같은 칸」이라는 뜻이다(그래서 `carry`). 그런데 관심대학 리스트는 머리글이 한
   * 줄이고 실기일자와 논술일자 사이에 **이름 없는 빈 열**이 하나 있다. 물려주면
   * 그 열이 「실기일자」가 되어, 나중에 거기 무엇이 들어오면 실기 날짜로 읽힌다.
   * 지금은 502줄 모두 비어 있어 아무 일도 안 일어나지만, 조용히 틀릴 자리다.
   *
   * 합쳐진 머리글은 아래 머리글 줄이 있을 때만 생긴다. 그걸 조건으로 삼는다.
   */
  var merged = subRow.length > 0;
  var width = 0;
  for (var i = at; i < values.length && i <= at + 2; i++) {
    width = Math.max(width, (values[i] || []).length);
  }
  for (var c2 = 0; c2 < width; c2++) {
    var top = head_(hrow[c2]);
    if (top) carry = top;
    main.push(top ? top : (merged ? carry : ''));
    sub.push(head_(subRow[c2]));
  }

  // 수능 블록의 시작
  var suneungAt = -1;
  for (var k = 0; k < main.length; k++) {
    if (main[k] === SUNEUNG_HEAD) { suneungAt = k; break; }
  }
  return {
    main: main, sub: sub, suneungAt: suneungAt, dataFrom: dataFrom,
    headerAt: at, gradeCol: gradeCol, known: best
  };
}

/** "2025-11-29 ~ 2025-11-30" · "11.25(수)~11.27(금)" · "2025.12.12.(금) 14:00" 등 */
/**
 * 날짜 칸이 **비었다는 뜻**인가.
 *
 * 「-」·「미정」은 못 읽은 날짜가 아니라 「아직 없다」는 표시다. 안 가르면
 * 지원마다 「알아보지 못한 일정: -」이 붙는다 — 실제 파일 502줄이 다 그랬다.
 */
function noDate_(v) {
  var s = txt_(v);
  return !s || /^[-–—.·]+$/.test(s) || /^(미정|추후|해당없음|없음)/.test(s);
}

function parseDates_(text, hintYear) {
  var s = txt_(text);
  if (noDate_(s)) return null;
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

/*
 * 칸 하나를 글자로. **시트는 날짜 칸을 Date 객체로 준다.**
 *
 * `getValues()` 는 날짜 서식이 걸린 칸을 문자열이 아니라 Date 로 돌려준다.
 * 그냥 `String()` 하면 「Sun Nov 29 2026 00:00:00 GMT+0900 …」이 되어 날짜
 * 파서가 못 읽고, 면접일이 통째로 사라진다. 여기서 `YYYY-MM-DD` 로 편다.
 *
 * `toISOString()` 을 안 쓴다 — 그건 UTC 로 옮기느라 한국 시간 0시가 전날이 된다.
 * 시트에 보이는 날짜 그대로 읽으려면 지역 시각 게터를 써야 한다.
 */
function txt_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.getFullYear() + '-' + pad2_(v.getMonth() + 1) + '-' + pad2_(v.getDate());
  }
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

/**
 * 성적 칸. **0 은 값이 아니라 「아직 안 적음」이다.**
 *
 * 관심대학 리스트는 내등급·내점수를 안 넣은 줄에 빈칸이 아니라 0 을 준다.
 * 그대로 두면 카드에 「내 환산 등급 0.00」이 떠서 1등급보다 좋은 성적이 된다.
 * 등급은 1~9, 점수는 양수라 0 이 진짜 값인 자리가 없다.
 */
function score_(v) {
  if (v == null || v === '') return null;
  var n = Number(v);
  return (isNaN(n) || n === 0) ? null : n;
}

/** 「Y」·「있음」 → true, 「N」·「없음」 → false, 그 밖에는 null(모른다). */
function yn_(v) {
  var t = String(v == null ? '' : v).trim().toUpperCase();
  if (!t) return null;
  if (t === 'Y' || t === 'O' || t === '있음' || t === '유') return true;
  if (t === 'N' || t === 'X' || t === '없음' || t === '무') return false;
  return null;
}

/**
 * 즐겨찾기 시트(2차원 배열)를 학생·지원 레코드로 바꾼다.
 * @return {{students:Object[], apps:Object[], unknownCols:string[], skipped:number}}
 */
function parseFavorites_(values, opts) {
  opts = opts || {};
  var H = readHeader_(values);
  var students = {}, order = [], apps = [], unknownCols = {}, skipped = 0, dropped = {};

  /*
   * **머리글을 못 찾았으면 읽지 않는다.**
   *
   * 엉뚱한 파일(원본 탭이 아닌 것, 빈 시트, 딴 문서)을 가리키고 있으면 아는 칸이
   * 거의 없다. 그대로 밀고 나가면 「학생 0명」이라고만 나와서, 선생님은 자료가
   * 없는 것인지 파일을 잘못 짚은 것인지 알 길이 없다. 무엇이 문제인지 말한다.
   *
   * 넷으로 잡았다 — 학년·반·번호·이름만 알아봐도 넷이라, 진짜 즐겨찾기라면
   * 이 문턱에 걸릴 수 없다. 반대로 아무 문서나 열면 0~1 이다.
   */
  if (H.known < 4) {
    return {
      students: [], apps: [], unknownCols: [], skipped: 0,
      problem: '이 시트에서 즐겨찾기 머리글을 찾지 못했습니다'
        + ' (알아본 칸 ' + H.known + '개). 원본 탭이 맞는지 확인해 주세요.'
    };
  }

  for (var r = H.dataFrom; r < values.length; r++) {
    var row = values[r] || [];
    /*
     * **학년 칸을 본다. 첫 칸이 아니다.**
     * 관심대학 리스트의 첫 칸은 줄 번호(`No`)라 여태 우연히 맞았을 뿐이다.
     * 그 칸이 비거나 「A-1」 같은 글자면 그 줄이 통째로 사라졌다.
     */
    var g = txt_(row[H.gradeCol]);
    if (!/^\d+$/.test(g)) { if (row.join('')) skipped++; continue; }

    var f = {}, naesin = {}, suneung = {}, unknown = {}, dates = {};

    for (var c = 0; c < H.main.length; c++) {
      var raw = row[c];
      if (raw == null || raw === '') continue;
      var mainName = H.main[c], subName = H.sub[c];
      var shownName = String((values[H.headerAt] || [])[c] || mainName).replace(/\s+/g, ' ').trim();

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

      // 줄 번호처럼 자료가 아닌 칸은 「알아보지 못한 칸」으로도 알리지 않는다
      if (SKIP_COL[mainName]) continue;

      // 남은 것 중 이름이 조합처럼 생겼으면 내신, 아니면 미인식
      if (isNaesinName_(mainName)) {
        var nk = mainName + (subName && subName !== '100' ? '(' + subName + ')' : '');
        naesin[nk] = num_(raw);
      } else {
        var label = (shownName || mainName) + (subName ? '/' + subName : '');
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
      if (fk.indexOf('날짜:') !== 0) continue;
      var kind = fk.slice(3);
      var parsed = parseDates_(f[fk], opts.year);
      if (parsed) dates[kind] = parsed;
      else if (!noDate_(f[fk])) unknown['일정/' + kind] = f[fk];
    }

    var app = {
      id: '', hak: hak,
      univType: f.univType || '', region: f.region || '', univ: f.univ || '',
      period: f.period || '', typeCat: f.typeCat || '', typeName: f.typeName || '',
      typeSub: f.typeSub || '', track: f.track || '', dept: f.dept || '',
      quotaText: f.quotaText || '', quota: parseQuota_(f.quotaText),
      selectType: f.selectType || '', minReqText: f.minReqText || '',
      /*
       * 최저가 있는가. 즐겨찾기는 기준 글을 주고, 관심대학 리스트는 Y/N 만 준다.
       * **N 을 그냥 `minReqText` 에 넣으면 안 된다** — 글자가 있으니 참이 되어
       * 최저가 없는 전형에 「최저 있음」이 붙는다. 셋으로 가른다(있다/없다/모른다).
       */
      minReq: f.minReqText ? true : yn_(f.minReqYN),
      stage1Rule: f.stage1Rule || '',
      /*
       * **0 은 「안 적음」이다.** 관심대학 리스트는 내등급·내점수를 아직 안 넣었을 때
       * 빈칸이 아니라 0 으로 준다. 그대로 두면 카드에 「내 환산 등급 0.00」이 떠서
       * 1등급보다 좋은 성적으로 읽힌다.
       */
      myScore: (score_(f.myScore) != null || score_(f.myGrade) != null)
        ? { score: score_(f.myScore), grade: score_(f.myGrade) }
        : null,
      dates: dates,
      result: {
        stage1: f.stage1 || null, final: f.final || null, reason: f.reason || null,
        waitNo: f.waitNo || null, enrolled: f.enrolled || null
      },
      unknown: unknown
    };
    app.id = appId_(app);
    /*
     * **버릴 때는 누구 줄을 왜 버렸는지 남긴다.**
     *
     * 학생은 위에서 이미 만들어졌고 여기서 지원만 버린다. 그래서 대학이나 학과
     * 칸이 빈 줄뿐인 학생은 **명단에는 있는데 보드가 텅 비는** 꼴이 된다.
     * 여태 `skipped` 를 세기만 하고 화면에 안 냈더니, 선생님은 그 학생이 원래
     * 지원이 없는 건지 자료가 샌 건지 알 길이 없었다.
     */
    if (!app.univ || !app.dept) {
      skipped++;
      var why = !app.univ ? '대학명이 비었습니다' : '모집단위가 비었습니다';
      if (!dropped[hak]) dropped[hak] = { hak: hak, n: 0, why: why, row: r + 1 };
      dropped[hak].n += 1;
      continue;
    }
    apps.push(app);
    students[hak].apps.push(app.id);
  }

  var list = [];
  for (var i = 0; i < order.length; i++) list.push(students[order[i]]);
  var cols = [];
  for (var u in unknownCols) cols.push(u);
  var lost = [];
  for (var h in dropped) lost.push(dropped[h]);
  return {
    students: list, apps: apps, unknownCols: cols, skipped: skipped,
    dropped: lost                 // 어느 학생의 줄이 몇 개 왜 빠졌나
  };
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

/**
 * 즐겨찾기 원본이 든 탭.
 *
 * 못 찾으면 첫 탭을 읽되 **찾은 것인지 아닌지를 함께 돌려준다.** 조용히 첫 탭을
 * 읽으면, 탭 이름이 달랐을 때 엉뚱한 것을 읽고도 화면에는 「학생 0명」만 뜬다.
 * 왜 0명인지 알 길이 없어진다.
 */
/**
 * 즐겨찾기 원본이 어느 탭인가.
 * =====================================================================
 * 기본은 **이 시트 안**이다. `다운로드 원본`·`원본`·`즐겨찾기` 중 하나를 찾는다.
 *
 * 그런데 즐겨찾기는 9월 내내 바뀐다. 학생이 지원을 더하고 빼고, 대교협에서 새로
 * 내려받는다. 그때마다 이 시트의 탭을 지우고 붙여 넣는 것은 위험하다 — 옆에
 * 상담 기록이 여덟 탭이나 같이 있는 파일이라, 붙여 넣다 한 번 어긋나면 그게 다
 * 날아간다.
 *
 * 그래서 **원본을 딴 파일에 두는 길**을 연다. `설정` 탭 **B2** 에 그 파일 주소(또는
 * ID)를 적으면 거기서 읽는다. 그러면 새 엑셀을 받았을 때 그 파일만 갈아끼우면 되고,
 * 상담 기록이 든 이 시트는 건드릴 일이 없다.
 *
 * 순위·메모·결과는 **안정키**(학번+대학+전형+학과)로 붙어 있어서, 원본이 통째로
 * 바뀌어도 같은 지원에는 그대로 다시 붙는다. 없어진 지원의 기록은 시트에 남아
 * 있다가 그 지원이 돌아오면 되살아난다.
 */
function sourceBook_() {
  var here = SpreadsheetApp.getActiveSpreadsheet();
  var ref = '';
  try {
    var cell = here.getSheetByName(SHEET.config);
    // B1 은 머리글 자리다. 값은 바로 아래 B2 에서 읽는다.
    if (cell) ref = String(cell.getRange('B2').getValue() || '').trim();
  } catch (err) { ref = ''; }
  if (!ref) return { book: here, external: false, why: '' };

  var m = ref.match(/[-\w]{25,}/);            // 주소를 통째로 붙여 넣어도 ID만 뽑는다
  var id = m ? m[0] : ref;
  try {
    return { book: SpreadsheetApp.openById(id), external: true, why: '' };
  } catch (err) {
    // 못 열면 **조용히 이 시트로 돌아가지 않는다.** 그러면 옛 자료를 새 자료로 읽는다.
    return { book: here, external: false, why: '설정 B1 의 원본 시트를 열지 못했습니다 — ' + String(err && err.message || err) };
  }
}

function sourceSheet_() {
  var found = sourceBook_();
  var sheets = found.book.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    for (var j = 0; j < SOURCE_SHEETS.length; j++) {
      if (name.indexOf(SOURCE_SHEETS[j]) >= 0) {
        sheets[i].__book = found;
        return sheets[i];
      }
    }
  }
  sheets[0].__book = found;
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

/**
 * **시트가 날짜 칸을 Date 로 되돌려 준다 — 여기서 글자로 씻는다.**
 *
 * 학생이 「2026-11-28」을 넣으면 구글 시트가 그 칸을 날짜형으로 바꾼다. 그대로
 * JSON 에 실으면 UTC 로 적혀 「2026-11-27T15:00:00.000Z」— **하루 전 날짜에
 * 시각까지 붙은 딴 값**이 된다. 달력은 「from ≤ 날짜 ≤ to」 글자 비교라 이 값과는
 * 어떤 날도 안 맞아서, 학생이 넣고 담임이 「맞습니다」까지 누른 면접일이
 * 화면에서 통째로 사라졌다.
 *
 * 자정(KST)이면 날짜만, 시각이 있으면(배치의 at 처럼 — seen 비교가 시각을 쓴다)
 * KST 시각까지 남긴다. parseFavorites_ 쪽 txt_ 와 같은 종류의 함정이다.
 */
function cell_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    var day = Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
    var time = Utilities.formatDate(v, 'Asia/Seoul', 'HH:mm:ss');
    return time === '00:00:00' ? day : day + 'T' + time + '+09:00';
  }
  return v;
}

function rows_(name) {
  var sh = tab_(name), last = sh.getLastRow();
  if (last < 2) return [];
  var head = HEADERS[name];
  var vals = sh.getRange(2, 1, last - 1, head.length).getValues(), out = [];
  for (var i = 0; i < vals.length; i++) {
    if (!String(vals[i].join('')).trim()) continue;
    var o = {};
    for (var j = 0; j < head.length; j++) o[head[j]] = cell_(vals[i][j]);
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
  var src = sourceSheet_();
  var known = false;
  var srcName = src.getName();
  for (var j = 0; j < SOURCE_SHEETS.length; j++) {
    if (srcName.indexOf(SOURCE_SHEETS[j]) >= 0) known = true;
  }
  var book = src.__book || { external: false, why: '' };
  var parsed = parseFavorites_(src.getDataRange().getValues());
  return {
    ok: true, who: me.email || '이름 없는 접속', locked: me.locked, at: now_(),
    sourceSheet: srcName, sourceKnown: known,
    sourceBook: book.external ? src.getParent().getName() : '',
    sourceWarn: book.why || '',
    students: parsed.students, apps: parsed.apps,
    unknownCols: parsed.unknownCols, skipped: parsed.skipped,
    dropped: parsed.dropped || [],
    // 머리글을 못 찾았으면 왜인지 — 조용히 「0명」이 되지 않게 한다
    parseProblem: parsed.problem || '',
    // 저장소에 적힌 기본 열쇠를 쓰고 있으면 보드가 알린다 — 빗장이지 잠금이 아니다
    openToAll: usingDefaultKey_(),
    state: rows_(SHEET.state), notes: rows_(SHEET.note),
    results: rows_(SHEET.result), dates: rows_(SHEET.date),
    fields: rows_(SHEET.field),
    aliases: rows_(SHEET.alias)
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

/**
 * **순위 한 번에 바꾸기 — 자리다툼을 서버가 막는다.**
 * =====================================================================
 * 이제 순위를 담임도 바꾸고 학생도 바꾼다. 둘이 같은 학생의 6칸을 동시에 만지면
 * 화면 쪽에서 두 번 나눠 쓰는 방식으로는 막을 수가 없다.
 *
 *     학생   2순위 카드를 1순위로   →  (쓰기1) 그 카드 rank=1
 *     담임   같은 순간 다른 카드를 1순위로  →  (쓰기1) 그 카드 rank=1
 *     학생   (쓰기2) 밀려난 카드 rank=2
 *     담임   (쓰기2) 밀려난 카드 rank=2
 *
 * 두 카드가 나란히 1순위가 된다. 「같은 학생 안에서 rank 는 겹칠 수 없다」는
 * 약속이 조용히 깨지고, 아무도 못 알아챈다.
 *
 * 그래서 **맞바꾸기를 통째로 서버가 한다.** 잠금 안에서 지금 배치를 읽고, 밀려날
 * 카드를 찾고, 둘을 한꺼번에 쓴다. 중간이 없으니 끼어들 자리도 없다.
 *
 * 거기에 **한 발 늦은 화면을 되돌린다.** 화면은 마지막으로 본 배치의 시각(`seen`)을
 * 같이 보낸다. 그 사이에 누가 이 학생의 배치를 건드렸으면 쓰지 않고 그렇다고
 * 말한다 — 덮어쓰고 나서 알리는 것보다 낫다. `seen` 을 안 보내면 검사하지 않는다
 * (예전 화면과 보기용 자료를 위해서다).
 */
function setRank_(p, who) {
  if (!p.id || !p.hak) return { ok: false, error: 'id 와 hak 이 필요합니다.' };
  var slot = p.slot || 'pool';
  var rank = slot === 'rank' ? parseInt(p.rank, 10) : '';
  if (slot === 'rank' && !(rank >= 1 && rank <= 6)) {
    return { ok: false, error: '순위는 1~6 사이여야 합니다.' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var all = rows_(SHEET.state);
    var mine = [];
    var newest = '';
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].hak) !== String(p.hak)) continue;
      mine.push(all[i]);
      if (String(all[i].at) > newest) newest = String(all[i].at);
    }
    /*
     * `seen` 이 **빈 글자여도 검사한다.** 화면은 「내가 마지막으로 본 시각」을
     * 보내는데, 아직 배치가 하나도 없던 학생을 보고 있었다면 그 값이 빈 글자다.
     * 그 사이에 저쪽이 첫 줄을 만들었으면 이 화면은 한 발 늦은 것이 맞다 —
     * `p.seen &&` 로 거르면 하필 그 경우만 검사를 건너뛰어 조용히 덮어쓴다.
     * 옛 화면(`seen` 을 아예 안 보내는)은 undefined 라 여전히 통과한다.
     */
    if (typeof p.seen !== 'undefined' && p.seen !== null
      && newest && String(p.seen) < newest) {
      return {
        ok: false, stale: true,
        error: '그 사이에 순위가 바뀌었습니다. 새로 불러온 뒤 다시 해 주세요.'
      };
    }

    var was = null;
    var taken = null;
    for (var j = 0; j < mine.length; j++) {
      if (String(mine[j].id) === String(p.id)) was = mine[j];
      else if (slot === 'rank' && String(mine[j].slot) === 'rank'
        && parseInt(mine[j].rank, 10) === rank) taken = mine[j];
    }

    var now = now_();
    var writes = [{ id: p.id, hak: p.hak, slot: slot, rank: rank, by: who, at: now }];
    /*
     * 밀려난 카드는 **누른 카드가 있던 자리로** 간다. 순위끼리면 맞바꾸기가 되고,
     * 후보에서 올라온 것이면 밀려난 쪽이 후보로 내려간다. 조용히 사라지지 않는다.
     */
    if (taken) {
      var backSlot = was && String(was.slot) === 'rank' ? 'rank' : 'pool';
      var backRank = backSlot === 'rank' ? parseInt(was.rank, 10) : '';
      writes.push({
        id: taken.id, hak: p.hak, slot: backSlot, rank: backRank, by: who, at: now
      });
    }
    for (var w = 0; w < writes.length; w++) upsert_(SHEET.state, ['id'], writes[w]);
    log_(who, 'setRank', p.hak + ' ' + p.id + ' → ' + slot + (rank ? ('#' + rank) : '')
      + (taken ? (' (밀려남 ' + taken.id + ')') : ''));
    return { ok: true, at: now, moved: writes };
  } finally {
    lock.releaseLock();
  }
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

/**
 * 결과를 적는다.
 *
 * **주로 학생이 적는다.** 121명 × 6칸이면 700건이라 담임이 다 칠 수 없고,
 * 합격자 발표는 학생이 대학 홈페이지에서 먼저 본다. 예비번호가 몇 번까지 돌았는지도
 * 학생이 실시간으로 안다.
 *
 * 선생님은 확인만 한다(status='confirmed'). 선생님이 직접 적으면 그 자체가 확인이다.
 */
function setResult_(p, who, status) {
  if (!p.id || !p.hak) return { ok: false, error: 'id 와 hak 이 필요합니다.' };
  upsert_(SHEET.result, ['id'], {
    id: p.id, hak: p.hak,
    stage1: p.stage1 || '', final: p.final || '', reason: p.reason || '',
    waitNo: p.waitNo || '', enrolled: p.enrolled || '',
    status: status || 'confirmed', by: who, at: now_()
  });
  log_(who, 'setResult', p.hak + ' ' + p.id + ' ' + (p.final || ''));
  return { ok: true };
}

/** 담임이 학생이 적은 결과를 확인해 확정으로 올린다. */
function approveResult_(p, who) {
  var all = rows_(SHEET.result), hit = null;
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].id) === String(p.id)) hit = all[i];
  }
  if (!hit) return { ok: false, error: '확인할 결과가 없습니다.' };
  upsert_(SHEET.result, ['id'], {
    id: hit.id, hak: hit.hak, stage1: hit.stage1, final: hit.final,
    reason: hit.reason, waitNo: hit.waitNo, enrolled: hit.enrolled,
    status: 'confirmed', by: who, at: now_()
  });
  log_(who, 'approveResult', hit.hak + ' ' + hit.id);
  return { ok: true };
}

function setDate_(p, who, status) {
  if (!p.id || !p.kind) return { ok: false, error: 'id 와 종목이 필요합니다.' };
  var from = String(p.from || '').trim(), to = String(p.to || from).trim();
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return { ok: false, error: '날짜는 2025-11-29 형식으로 보내주세요.' };
  }
  // 빈 날짜는 **지우기**다. 모의면접을 잘못 잡았을 때 되돌릴 길이 있어야 한다.
  if (!from) {
    var sh = tab_(SHEET.date), all = rows_(SHEET.date);
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === String(p.id) && String(all[i].kind) === String(p.kind)) {
        sh.deleteRow(all[i]._row);
        log_(who, 'clearDate', p.kind + ' ' + p.id);
        return { ok: true, removed: true };
      }
    }
    return { ok: true, removed: false };
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

/** 토큰으로 여는 경로. 여기 적힌 것만 학생이 부를 수 있다. */
var STUDENT_ACTION = {
  student: 1, studentDate: 1, studentApplyNo: 1, studentField: 1, studentResult: 1,
  studentNote: 1, studentNoteRemove: 1, studentAsk: 1, studentRank: 1
};

function studentAction_(action, p) {
  if (action === 'student') return studentView_(p.token);

  var hak = hakOfToken_(p.token);
  if (!hak) {
    return { ok: false, error: '만료되었거나 잘못된 주소입니다. 담임 선생님께 문의하세요.' };
  }
  /*
   * 생년월일은 학생 한 명에 하나라 id 가 빈 채로 온다 — 지원 소유 검사에서
   * 빼야 한다. 여태 여기서 「본인 지원 내역이 아닙니다」로 끊겨서
   * **학생이 생년월일을 저장할 길이 아예 없었다.**
   */
  var birthOnly = action === 'studentField' && String(p.field || '').trim() === '생년월일';
  if (!birthOnly && (!p.id || !ownsApp_(hak, p.id))) {
    return { ok: false, error: '본인 지원 내역이 아닙니다.' };
  }
  var who = hak + ' 학생';

  /*
   * **순위는 학생이 바로 바꾼다 — 확인 대기로 두지 않는다.**
   *
   * 날짜·접수번호·결과는 잘못 적으면 판단이 흔들려서 담임이 확인한다. 순위는
   * 다르다. 어디를 몇 순위로 넣을지는 원래 학생이 정하는 것이고, 틀려도 다시
   * 바꾸면 그만이다. 확인을 걸면 학생은 「바꿨는데 안 바뀐다」고 읽는다.
   * 누가 바꿨는지는 `by` 에 「3201 학생」으로 남아 담임이 안다.
   */
  if (action === 'studentRank') return setRank_({ id: p.id, hak: hak, slot: p.slot, rank: p.rank, seen: p.seen }, who);
  /*
   * **학번을 서버가 채운다 — 토큰에서 온 값으로.**
   *
   * 예전에는 p 를 그대로 넘겨서 일정 행의 hak 칸이 비었다. 담임 보드는 전체
   * 행을 읽어 보였고 확정도 됐는데, 학생 화면은 학번으로 제 것만 걸러 받아서
   * **학생이 넣고 담임이 확정한 면접일이 학생에게만 안 돌아왔다.**
   * 클라이언트가 보낸 hak 은 쓰지 않는다 — 남의 학번을 적어 보낼 수 있다.
   */
  if (action === 'studentDate') {
    return setDate_({ id: p.id, hak: hak, kind: p.kind, from: p.from, to: p.to }, who, 'pending');
  }
  if (action === 'studentApplyNo') {
    upsert_(SHEET.note, ['noteId'], {
      noteId: 'applyno-' + p.id, hak: hak, id: p.id,
      text: '접수번호 ' + String(p.applyNo || '').trim(),
      visible: 'Y', by: who, at: now_()
    });
    return { ok: true };
  }
  /*
   * 학생 메모. 선생님 메모와 **같은 탭에 같은 모양으로** 쌓인다.
   *
   * 학생이 적은 것은 늘 `visible: 'Y'` 다 — 자기가 적은 것을 자기가 못 보면
   * 안 된다. 누가 적었는지는 `by` 가 「3201 학생」으로 지고 있어서, 선생님
   * 화면이 그걸로 갈라 보여 준다.
   *
   * `studentAsk` 는 예전 이름이다. 화면에서 부른 적은 없지만 남겨 둔다.
   */
  if (action === 'studentNote' || action === 'studentAsk') {
    if (!String(p.text || '').trim()) return { ok: false, error: '내용을 적어 주세요.' };
    return addNote_({ hak: hak, id: p.id, text: p.text, visible: 'true' }, who);
  }
  /*
   * 지우는 것은 **자기가 적은 것만.** 학번이 같은지(`hak`)와 적은 사람이
   * 자기인지(`by`)를 둘 다 본다. 학번만 보면 선생님이 그 학생에게 적어 둔
   * 메모까지 학생이 지울 수 있다.
   */
  if (action === 'studentNoteRemove') {
    var all = rows_(SHEET.note);
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      if (String(n.noteId) !== String(p.noteId)) continue;
      if (String(n.hak) !== hak || String(n.by) !== who) {
        return { ok: false, error: '본인이 적은 메모만 지울 수 있습니다.' };
      }
      tab_(SHEET.note).deleteRow(n._row);
      log_(who, 'studentNoteRemove', String(p.noteId));
      return { ok: true, removed: true };
    }
    return { ok: true, removed: false };
  }
  // 같은 까닭 — hak 을 서버가 채운다. 안 채우면 「학번이 필요합니다」로 저장이 실패했다.
  if (action === 'studentField') {
    return setField_({ id: p.id, hak: hak, field: p.field, value: p.value }, who, 'student');
  }
  if (action === 'studentResult') {
    return setResult_({ id: p.id, hak: hak, stage1: p.stage1, final: p.final,
      reason: p.reason, waitNo: p.waitNo, enrolled: p.enrolled }, who, 'student');
  }
  return { ok: false, error: '알 수 없는 요청입니다: ' + action };
}

/* ===== 학과 별칭 =====================================================
 * 즐겨찾기가 부르는 이름과 입결·전문대 자료가 부르는 이름이 다를 때, 선생님이
 * 손으로 이어 준 것을 여기 쌓는다.
 *
 * 학생이 아니라 **학과**에 붙는다. 그래서 엑셀 원본을 갈아끼워도, 다음 해가 와도
 * 그대로 남는다. 같은 학과를 해마다 다시 이어 주지 않아도 된다.
 */

function setAlias_(p, who) {
  var univ = String(p.univ || '').trim();
  var dept = String(p.dept || '').trim();
  if (!univ || !dept) return { ok: false, error: '대학과 학과가 필요합니다.' };
  upsert_(SHEET.alias, ['univ', 'dept'], {
    univ: univ, dept: dept,
    toUniv: String(p.toUniv || '').trim(),
    toDept: String(p.toDept || '').trim(),
    note: String(p.note || '').trim(),
    by: who, at: now_()
  });
  log_(who, 'setAlias', univ + ' ' + dept + ' → ' + (p.toDept || '(없음)'));
  return { ok: true };
}

function removeAlias_(p, who) {
  var sh = tab_(SHEET.alias), all = rows_(SHEET.alias);
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].univ) === String(p.univ) && String(all[i].dept) === String(p.dept)) {
      sh.deleteRow(all[i]._row);
      log_(who, 'removeAlias', p.univ + ' ' + p.dept);
      return { ok: true, removed: true };
    }
  }
  return { ok: true, removed: false };
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

/* ===== 원서를 낸 뒤에 채워지는 칸 =================================== */

var FIELDS = ['수험번호', '최종경쟁률', '생년월일'];

/**
 * 수험번호·최종경쟁률·생년월일을 적는다.
 *
 * `생년월일` 은 학생 한 명에 하나라 `id` 를 비워 둔다. 나머지는 지원 한 건에 하나다.
 * **빈 값으로 부르면 지운다** — 잘못 적었을 때 되돌릴 길이 있어야 한다.
 */
function setField_(p, who, status) {
  var field = String(p.field || '').trim();
  if (FIELDS.indexOf(field) < 0) return { ok: false, error: '모르는 칸입니다: ' + field };
  if (!p.hak) return { ok: false, error: '학번이 필요합니다.' };
  var id = field === '생년월일' ? '' : String(p.id || '');
  if (field !== '생년월일' && !id) return { ok: false, error: 'id 가 필요합니다.' };

  var value = String(p.value == null ? '' : p.value).trim();
  if (!value) {
    var all = rows_(SHEET.field);
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === id && String(all[i].hak) === String(p.hak)
          && String(all[i].field) === field) {
        tab_(SHEET.field).deleteRow(all[i]._row);
        log_(who, 'setField', p.hak + ' ' + field + ' 지움');
        return { ok: true };
      }
    }
    return { ok: true };
  }
  upsert_(SHEET.field, ['id', 'hak', 'field'], {
    id: id, hak: String(p.hak), field: field, value: value,
    status: status, by: who, at: now_()
  });
  log_(who, 'setField', p.hak + ' ' + field + ' ' + value);
  return { ok: true };
}

/** 학생이 적은 것을 그대로 확인한다. 일정·결과와 같은 흐름이다. */
function approveField_(p, who) {
  var field = String(p.field || '').trim();
  var id = field === '생년월일' ? '' : String(p.id || '');
  var all = rows_(SHEET.field), hit = null;
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].id) === id && String(all[i].hak) === String(p.hak)
        && String(all[i].field) === field) hit = all[i];
  }
  if (!hit) return { ok: false, error: '확인할 값이 없습니다.' };
  upsert_(SHEET.field, ['id', 'hak', 'field'], {
    id: hit.id, hak: hit.hak, field: hit.field, value: hit.value,
    status: 'confirmed', by: who, at: now_()
  });
  log_(who, 'approveField', hit.hak + ' ' + hit.field);
  return { ok: true };
}

/** 반 전체 토큰을 한 번에 발급한다. 이미 있으면 그대로 둔다. */
function issueAll_(p, who) {
  var parsed = parseFavorites_(sourceSheet_().getDataRange().getValues());
  var only = String(p.cls || '').trim();
  var have = {};
  rows_(SHEET.share).forEach(function (r) { have[String(r.hak)] = String(r.token); });

  /*
   * **한 번에 쓴다.** 예전에는 새 학생마다 upsert_ 를 불렀는데, upsert_ 는 한 번마다
   * 공유 시트를 통째로 다시 읽고 잠금을 잡는다. 학년 전체 121명 첫 발급이면 시트
   * 왕복이 240회쯤 되어 1~3분이 걸리고, 화면은 45초에 포기한 뒤 같은 일을 다시 건다.
   * 토큰 발급이 멱등이라 자료가 깨지지는 않지만, 첫 사용 경험이 「서버가 응답하지
   * 않습니다」가 된다. 데모 4명으로는 안 드러나는 자리다.
   */
  var out = [], fresh = [], at = now_();
  for (var i = 0; i < parsed.students.length; i++) {
    var s = parsed.students[i];
    if (only && String(s.cls) !== only) continue;
    if (!have[s.hak]) {
      var token = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
      have[s.hak] = token;
      fresh.push([s.hak, token, at, '']);        // HEADERS.공유 차례와 같아야 한다
    }
    out.push({ hak: s.hak, name: s.name, token: have[s.hak] });
  }
  if (fresh.length) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var sh = tab_(SHEET.share);
      sh.getRange(sh.getLastRow() + 1, 1, fresh.length, HEADERS[SHEET.share].length)
        .setValues(fresh);
    } finally {
      lock.releaseLock();
    }
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
  /*
   * hak 이 빈 일정 행도 거둔다. studentDate 가 hak 을 안 적던 시절의 행이다 —
   * id 가 내 지원이면 내 것이 맞다(안정키는 학번을 씨앗에 품는다).
   */
  var myApps = {};
  for (var ai = 0; ai < me.apps.length; ai++) myApps[String(me.apps[ai])] = true;
  var myDates = rows_(SHEET.date).filter(function (r) {
    return String(r.hak) === hak || (!String(r.hak || '') && myApps[String(r.id)]);
  });
  return {
    ok: true, hak: hak, student: me,
    apps: parsed.apps.filter(function (a) { return a.hak === hak; }),
    state: mine(rows_(SHEET.state)),
    dates: myDates,
    // 학생이 적어 둔 결과를 돌려주지 않으면, 저장하고 새로고침했을 때 **사라져 보인다.**
    // 시트에는 있는데 화면에서 없어지면 학생은 다시 적거나 도구를 안 믿게 된다.
    results: mine(rows_(SHEET.result)),
    fields: mine(rows_(SHEET.field)),
    /*
     * 별칭(선생님이 손으로 이어 준 학과)도 준다. 안 주면 같은 지원이
     * 선생님 화면에는 작년 참고선이 붙고 학생 화면에는 아무것도 없다.
     * 학번이 안 붙은 자료(대학·학과 이름뿐)라 통째로 줘도 새는 것이 없다.
     */
    aliases: rows_(SHEET.alias),
    notes: mine(rows_(SHEET.note)).filter(function (n) { return String(n.visible) === 'Y'; })
  };
}
