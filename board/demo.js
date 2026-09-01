/**
 * 화면 확인용 가상 자료
 * =====================================================================
 * 이름·학번은 전부 지어낸 것이다. 실제 학생 자료는 여기에 넣지 않는다.
 * 대학·학과는 입결 자료에 실제로 있는 것을 써서, 지표가 붙는지까지 함께 본다.
 *
 * board.html?demo=1 로 연다.
 */

/** 오늘로부터 며칠 뒤. 데모가 언제 열려도 「다가오는 일정」이 보이게 한다. */
const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const mk = (hak, univ, dept, typeSub, opts = {}) => ({
  id: `${hak}-${univ}-${dept}-${typeSub}`.replace(/\s/g, ''),
  hak,
  univType: opts.univType || '일반대',
  region: opts.region || '',
  univ,
  period: '수시',
  typeCat: opts.cat || '학생부위주(교과)',
  typeName: typeSub,
  typeSub,
  track: opts.track || '인문',
  dept,
  quotaText: String(opts.quota ?? ''),
  quota: opts.quota ?? null,
  selectType: opts.stage || '일괄합산',
  minReqText: opts.min ? '* 수능최저기준: 2개 영역 등급 합 8 이내' : '',
  myScore: { score: opts.score ?? null, grade: opts.conv ?? opts.grade ?? null },
  dates: opts.date
    ? { [opts.dateKind || '면접']: { from: opts.date, to: opts.dateTo || opts.date, fixed: !opts.dateTo } }
    : {},
  result: opts.result || { stage1: null, final: null, reason: null, waitNo: null, enrolled: null },
  unknown: {},
});

/** 결과 칸을 짧게 적기 위한 도우미 — 즐겨찾기가 주는 표기를 그대로 쓴다. */
const won = (extra) => ({
  stage1: '합격', final: extra ? '충원합격' : '최초합격',
  reason: null, waitNo: extra ? String(extra) : null, enrolled: null,
});
const lost = (why) => ({
  stage1: why === '1단계' ? '불합격' : '합격', final: '불합격',
  reason: why === '최저' ? '수능최저 미충족' : null,
  waitNo: null, enrolled: null,
});

const A = [
  mk('3201', '전남대학교(광주)', '영어영문학과', '교과(일반)', { quota: 12, grade: 3.2, conv: 2.94, min: true, result: won() }),
  mk('3201', '한국외국어대학교(서울)', '자유전공학부', '종합(서류형)', { quota: 21, conv: 3.31, cat: '학생부위주(종합)', result: lost('1단계') }),
  mk('3201', '숭실대학교', '영어영문학과', '종합(SSU미래인재)', { quota: 21, conv: 3.08, cat: '학생부위주(종합)', stage: '단계별전형', date: inDays(12) }),
  mk('3201', '건국대학교(서울)', '영어영문학과', '종합(KU자기추천)', { quota: 30, conv: 3.17, cat: '학생부위주(종합)', stage: '단계별전형', date: inDays(14) }),
  mk('3201', '가톨릭대학교(성심)', '영어영문학과', '종합(잠재능력)', { quota: 10, conv: 3.24, cat: '학생부위주(종합)', date: inDays(13) }),
  // 기간 공지 — 「겹칠 수 있음」이 뜨는 자리
  mk('3201', '동국대학교(WISE)', '영어영문학과', '교과(교과전형)',
    { quota: 8, conv: 2.88, date: inDays(12), dateTo: inDays(14) }),
  // 가톨릭대와 같은 날 — 확정 「겹침」이 뜨는 자리
  mk('3201', '조선대학교', '영어교육과', '교과(일반)',
    { quota: 14, conv: 3.02, date: inDays(13) }),

  mk('3204', '동신대학교', '간호학과', '교과(일반)', { quota: 122, grade: 5.6, track: '자연', result: won(7) }),
  /*
   * 송원대 간호는 **두 가지를 한꺼번에 보여 주는 자리**라 둘을 넣어 둔다.
   *   · 전형 이름이 「면접우수자면접전형」이라 입결의 어느 전형과도 글자가 안 겹친다.
   *     작년까지 이어진 전형이 「교과(인성우수)」 하나뿐이라 그것으로 붙는다(alive).
   *   · 같은 학과에 학생이 둘이라 학과 탐색에서 가상 분포 칸이 열린다.
   */
  mk('3204', '송원대학교', '간호학과', '학생부교과(면접우수자면접전형)',
    { quota: 141, grade: 5.6, conv: 5.45, track: '자연', date: inDays(9) }),
  // 이 지원은 일부러 내등급을 비워 둔다 — 성적 탭의 전교과(아래 grades)로
  // 대신 재는 길(gradeOf)이 화면에서 보이는 자리다.
  mk('3218', '송원대학교', '간호학과', '학생부교과(면접우수자면접전형)',
    { quota: 141, track: '자연', date: inDays(9) }),
  mk('3204', '원광대학교', '치위생학과', '교과(지역인재)', { quota: 40, grade: 5.6, track: '자연', result: lost('최저') }),
  /*
   * 올해 신설 전형. 모집요강에 작년 모집인원도 경쟁률도 없다.
   * 작년 이 학과 교과는 「교과(일반계교과)」 4.30 · 「교과(일반계면접)」 4.70 이라
   * 「관련 전형 참고」가 둘을 범위로 보여 준다.
   */
  mk('3212', '경성대학교', '영어영문학과', '교과(지역인재)', { quota: 20, grade: 4.5, conv: 4.4 }),
  /*
   * 이름이 바뀐 학과. 입결에 「일본학과」는 2026 한 해뿐이고 그 앞에
   * 「일본어학과」가 2025까지 네 해 있다. 카드가 그걸 알려 주는지 보려고 둔다.
   */
  mk('3212', '강원대학교', '일본학과', '교과(일반)', { quota: 8, grade: 3.9, conv: 3.8 }),
  mk('3204', '조선대학교', '경영학부', '종합(서류)', { quota: 50, grade: 5.6, cat: '학생부위주(종합)', date: inDays(6), result: won() }),
  mk('3204', '국립목포대학교(목포)', '자율전공학부', '교과(일반)', { quota: 39, grade: 5.6 }),
  mk('3204', '경상국립대학교(진주)', '원예과학부', '교과(일반)', { quota: 40, grade: 5.6, track: '자연' }),
  // 올해 새로 묶인 자유전공 — 제 입결이 없어 「묶이기 전 학과」 선이 뜨는 자리
  mk('3204', '동의대학교', '상경대학자유전공학부', '교과(일반)', { quota: 45, grade: 5.6 }),
  mk('3204', '삼육대학교', '미래융합자유전공학부', '교과(일반)', { quota: 25, grade: 5.6 }),
  // 이름이 달라 안 붙는 자리 — 점검 화면이 무엇을 하는지 보이게 한다
  mk('3204', '조선대학교', '화공생명공학과', '교과(일반)', { quota: 30, grade: 5.6, track: '자연' }),
  mk('3204', '광주보건대학교', '치위생과', '일반전형', { quota: 60, univType: '전문대' }),
  mk('3204', '조선간호대학교', '간호학과', '일반전형', { quota: 80, univType: '전문대' }),
  mk('3204', '동강대학교', '간호학과', '일반전형', { quota: 70, univType: '전문대' }),
  mk('3204', '육군사관학교', '문과', '일반전형', { quota: 30, univType: '특수대' }),

  mk('3212', '서울대학교', '경제학부', '종합(지역균형)', { quota: 6, grade: 1.4, cat: '학생부위주(종합)', min: true }),
  mk('3212', '고려대학교(서울)', '경제학과', '교과(학교추천)', { quota: 21, grade: 1.4, min: true, result: lost('최저') }),
  mk('3212', '연세대학교(서울)', '경제학부', '교과(추천형)', { quota: 24, grade: 1.4, min: true, result: won(3) }),
  mk('3212', '성균관대학교', '글로벌경영학과', '교과(학교장추천)', { quota: 10, grade: 1.4, min: true }),
  mk('3212', '한양대학교(ERICA)', '경제학부', '교과(지역균형)', { quota: 12, grade: 1.4, result: won() }),
];

const students = [
  {
    hak: '3201', grade: 3, cls: '2', no: '01', name: '가나다',
    naesin: { 전교과: 3.2, 국영수: 3.28 },
    suneung: { 국어: { grade: 3 }, 수학: { grade: 4 }, 영어: { grade: 2 }, 탐구1: { grade: 3 }, 탐구2: { grade: 4 } },
    apps: [],
  },
  {
    hak: '3204', grade: 3, cls: '2', no: '04', name: '라마바',
    naesin: { 전교과: 5.6 },
    suneung: { 국어: { grade: 6 }, 수학: { grade: 6 }, 영어: { grade: 5 }, 탐구1: { grade: 5 }, 탐구2: { grade: 6 } },
    apps: [],
  },
  {
    hak: '3212', grade: 3, cls: '2', no: '12', name: '사아자',
    naesin: { 전교과: 1.42 },
    suneung: { 국어: { grade: 1 }, 수학: { grade: 1 }, 영어: { grade: 1 }, 탐구1: { grade: 2 }, 탐구2: { grade: 2 } },
    apps: [],
  },
  {
    hak: '3218', grade: 3, cls: '2', no: '18', name: '차카타',
    naesin: {}, suneung: {}, apps: [],
  },
];

for (const s of students) s.apps = A.filter((a) => a.hak === s.hak).map((a) => a.id);

/**
 * 처음 열었을 때 몇 칸은 이미 차 있게 둔다.
 * 자리 번호(A[3])로 집으면 목록 가운데에 하나만 끼워 넣어도 전부 어긋난다. 이름으로 집는다.
 */
const at = (univ, dept) => {
  const hit = A.find((a) => a.univ.startsWith(univ) && a.dept === dept);
  if (!hit) throw new Error(`데모 자료에 ${univ} ${dept} 가 없습니다`);
  return hit;
};
const put = (univ, dept, slot, rank) => {
  const a = at(univ, dept);
  return { id: a.id, hak: a.hak, slot, rank: rank == null ? '' : rank };
};

const placed = [
  put('전남대', '영어영문학과', 'rank', 6),
  put('한국외국어대', '자유전공학부', 'rank', 2),
  put('숭실대', '영어영문학과', 'rank', 4),
  put('건국대', '영어영문학과', 'rank', 1),
  put('가톨릭대', '영어영문학과', 'rank', 5),
  put('동국대', '영어영문학과', 'archive'),
  put('동신대', '간호학과', 'rank', 1),
  put('원광대', '치위생학과', 'rank', 2),
  put('광주보건대', '치위생과', 'tray'),
];

export const demo = {
  ok: true,
  who: '보기용 계정',
  students,
  apps: A,
  state: placed,
  aliases: [],
  /*
   * 「성적」 탭 — 학년 전체의 전교과 일반등급 명단.
   *   3218  즐겨찾기에 전교과가 없던 학생 → 여기서 채워진다
   *   3204  이름이 일부러 다르다 → 붙지 않고 점검 화면에 경고가 선다
   */
  grades: [
    { hak: '3201', name: '가나다', grade: 3.2 },
    { hak: '3204', name: '마바사', grade: 5.6 },
    { hak: '3212', name: '사아자', grade: 1.42 },
    { hak: '3218', name: '차카타', grade: 6.1 },
  ],
  /*
   * 상담 메모. 카드 왼쪽 띠로 「여기 이야기가 있었다」가 보이는지 확인하려고
   * 6칸 중 둘에만 달아 둔다 — 다 달면 표시가 있으나 마나다.
   */
  notes: [
    { noteId: 'm1', hak: '3201', id: at('건국대', '영어영문학과').id,
      text: '면접 준비 시작. 자기추천서 초안 9/1까지.', visible: 'N',
      by: '보기용 계정', at: '2026-08-20T10:00:00Z' },
    { noteId: 'm2', hak: '3201', id: at('전남대', '영어영문학과').id,
      text: '지역인재 자격 확인함. 최저 2합 6 — 모의고사 추이로는 닿음.', visible: 'Y',
      by: '보기용 계정', at: '2026-08-21T14:30:00Z' },
    /*
     * 학생이 적은 메모. 둘을 다르게 두어 「학생이 적은 메모」 목록이
     * 제대로 갈리는지 보인다.
     *   전남대 — 선생님 메모(8/21) 뒤에 학생 메모(8/22) → 아직 답이 안 간 것
     *   건국대 — 학생 메모(8/19) 뒤에 선생님 메모(8/20) → 이미 답한 것
     */
    { noteId: 'm3', hak: '3201', id: at('건국대', '영어영문학과').id,
      text: '자기추천서에 뭘 써야 할지 모르겠어요.', visible: 'Y',
      by: '3201 학생', at: '2026-08-19T21:04:00Z' },
    { noteId: 'm4', hak: '3201', id: at('전남대', '영어영문학과').id,
      text: '최저 못 맞출까 봐 걱정돼요. 수학이 계속 3등급이에요.', visible: 'Y',
      by: '3201 학생', at: '2026-08-22T22:40:00Z' },
  ],
  // 학생이 적어 두고 선생님 확인을 기다리는 결과. 12월의 흔한 자리다.
  results: [
    { id: at('건국대', '영어영문학과').id, hak: '3201', stage1: '합격',
      final: '충원합격', reason: '', waitNo: '7', enrolled: '',
      status: 'student', by: '3201 학생', at: '2026-12-15T20:11:00Z' },
    { id: at('숭실대', '영어영문학과').id, hak: '3201', stage1: '', final: '불합격',
      reason: '', waitNo: '', enrolled: '',
      status: 'student', by: '3201 학생', at: '2026-12-15T20:12:00Z' },
    { id: at('동신대', '간호학과').id, hak: '3204', stage1: '', final: '최초합격',
      reason: '', waitNo: '', enrolled: '등록',
      status: 'confirmed', by: '보기용 계정', at: '2026-12-16T09:00:00Z' },
    // 1단계만 났다. **최종 칸은 비어 있어야 한다** — 여기 「1단계 합격」이 들어가면
    // 보고서가 최종 합격으로 센다. 그 자리를 데모로 지켜 둔다.
    { id: at('가톨릭대', '영어영문학과').id, hak: '3201', stage1: '합격', final: '',
      reason: '', waitNo: '', enrolled: '',
      status: 'student', by: '3201 학생', at: '2026-11-20T19:40:00Z' },
    // 붙었지만 안 갔다. 합격으로 세되 등록은 아니어야 한다.
    { id: at('원광대', '치위생학과').id, hak: '3204', stage1: '', final: '최초합격',
      reason: '', waitNo: '', enrolled: '미등록',
      status: 'confirmed', by: '보기용 계정', at: '2026-12-20T10:00:00Z' },
  ],
  // 모의면접을 두 번 잡아 둔 자리 — 대학별로 묶여 보이는지 확인하려고
  dates: [
    { id: at('숭실대', '영어영문학과').id, hak: '3201', kind: '모의면접1',
      from: inDays(4), to: inDays(4), status: 'confirmed' },
    { id: at('숭실대', '영어영문학과').id, hak: '3201', kind: '모의면접2',
      from: inDays(9), to: inDays(9), status: 'confirmed' },
    /*
     * 학생이 넣고 아직 확인 안 된 날짜. **가톨릭대 면접일과 같은 날로 둔다** —
     * 확인 전에는 「겹칠 수 있음」, 확인하면 「겹침」이 되는 것을 데모로 볼 수 있게.
     */
    { id: at('건국대', '영어영문학과').id, hak: '3201', kind: '면접',
      from: inDays(13), to: inDays(13), status: 'pending' },
  ],
  /*
   * 원서를 낸 뒤에 채워지는 칸. 하나는 확인 대기, 하나는 확인된 상태로 둬서
   * 담임의 「학생이 적은 칸」 목록과 카드의 「원서를 낸 뒤」 구역을 둘 다 볼 수 있게.
   */
  fields: [
    { id: at('건국대', '영어영문학과').id, hak: '3201', field: '수험번호',
      value: '20260012', status: 'student', by: '3201 학생', at: '2026-09-12T09:10:00Z' },
    { id: at('건국대', '영어영문학과').id, hak: '3201', field: '최종경쟁률',
      value: '14.9', status: 'confirmed', by: '보기용 계정', at: '2026-09-15T10:00:00Z' },
    { id: '', hak: '3201', field: '생년월일',
      value: '2008-03-14', status: 'confirmed', by: '보기용 계정', at: '2026-09-15T10:00:00Z' },
  ],
  unknownCols: [],
  skipped: 0,
};

/** 학생 화면 확인용 — 3201 가나다가 자기 링크로 열었을 때 */
export const studentDemo = {
  ok: true,
  hak: '3201',
  student: students[0],
  apps: A.filter((a) => a.hak === '3201'),
  state: placed.filter((r) => r.hak === '3201'),
  dates: [
    { id: at('가톨릭대', '영어영문학과').id, hak: '3201', kind: '모의면접', from: inDays(10), to: inDays(10), status: 'confirmed' },
    { id: at('건국대', '영어영문학과').id, hak: '3201', kind: '면접', from: inDays(14), to: inDays(14), status: 'pending' },
  ],
  /*
   * 학생 화면이 받는 메모는 `visible: 'Y'` 인 것뿐이다 — 선생님 비공개 메모(m1)는
   * 빠져 있다. 학생이 적은 것과 선생님이 「학생도 보게」로 적은 것이 한 줄에
   * 섞여 보이는지 여기서 확인한다.
   */
  notes: [
    { noteId: 'n1', hak: '3201', id: at('건국대', '영어영문학과').id,
      text: '접수번호 0021170267', visible: 'Y', by: '3201 학생', at: '2026-08-18T09:00:00Z' },
    { noteId: 'm3', hak: '3201', id: at('건국대', '영어영문학과').id,
      text: '자기추천서에 뭘 써야 할지 모르겠어요.', visible: 'Y',
      by: '3201 학생', at: '2026-08-19T21:04:00Z' },
    { noteId: 'm2', hak: '3201', id: at('전남대', '영어영문학과').id,
      text: '지역인재 자격 확인함. 최저 2합 6 — 모의고사 추이로는 닿음.', visible: 'Y',
      by: '보기용 계정', at: '2026-08-21T14:30:00Z' },
    { noteId: 'm4', hak: '3201', id: at('전남대', '영어영문학과').id,
      text: '최저 못 맞출까 봐 걱정돼요. 수학이 계속 3등급이에요.', visible: 'Y',
      by: '3201 학생', at: '2026-08-22T22:40:00Z' },
  ],
  /*
   * **학생 화면에도 결과를 넣어 둔다.** 예전에는 빈 배열이라, 서버가 결과를 안
   * 돌려주는 것을 데모로는 영영 알 수 없었다. 저장하면 그 자리에서는 보이는데
   * 새로고침하면 사라지는 꼴이었다.
   */
  results: [
    { id: at('건국대', '영어영문학과').id, hak: '3201', stage1: '합격', final: '충원합격',
      reason: '', waitNo: '7', enrolled: '', status: 'student' },
    { id: at('가톨릭대', '영어영문학과').id, hak: '3201', stage1: '합격', final: '',
      reason: '', waitNo: '', enrolled: '', status: 'confirmed' },
  ],
  // 접수번호가 적힌 건국대에만 「수험번호·최종경쟁률」 칸이 나온다 — 원서를 냈다는 뜻이다
  fields: [
    { id: at('건국대', '영어영문학과').id, hak: '3201', field: '수험번호',
      value: '20260012', status: 'student' },
    { id: '', hak: '3201', field: '생년월일', value: '2008-03-14', status: 'confirmed' },
  ],
};
