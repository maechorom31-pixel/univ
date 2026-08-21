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
  result: { stage1: null, final: null, reason: null, waitNo: null, enrolled: null },
  unknown: {},
});

const A = [
  mk('3201', '전남대학교(광주)', '영어영문학과', '교과(일반)', { quota: 12, grade: 3.2, conv: 2.94, min: true }),
  mk('3201', '한국외국어대학교(서울)', '자유전공학부', '종합(서류형)', { quota: 21, conv: 3.31, cat: '학생부위주(종합)' }),
  mk('3201', '숭실대학교', '영어영문학과', '종합(SSU미래인재)', { quota: 21, conv: 3.08, cat: '학생부위주(종합)', stage: '단계별전형', date: inDays(12) }),
  mk('3201', '건국대학교(서울)', '영어영문학과', '종합(KU자기추천)', { quota: 30, conv: 3.17, cat: '학생부위주(종합)', stage: '단계별전형', date: inDays(14) }),
  mk('3201', '가톨릭대학교(성심)', '영어영문학과', '종합(잠재능력)', { quota: 10, conv: 3.24, cat: '학생부위주(종합)', date: inDays(13) }),
  // 기간 공지 — 「겹칠 수 있음」이 뜨는 자리
  mk('3201', '동국대학교(WISE)', '영어영문학과', '교과(교과전형)',
    { quota: 8, conv: 2.88, date: inDays(12), dateTo: inDays(14) }),
  // 가톨릭대와 같은 날 — 확정 「겹침」이 뜨는 자리
  mk('3201', '조선대학교', '영어교육과', '교과(일반)',
    { quota: 14, conv: 3.02, date: inDays(13) }),

  mk('3204', '동신대학교', '간호학과', '교과(일반)', { quota: 122, grade: 5.6, track: '자연' }),
  mk('3204', '원광대학교', '치위생학과', '교과(지역인재)', { quota: 40, grade: 5.6, track: '자연' }),
  mk('3204', '조선대학교', '경영학부', '종합(서류)', { quota: 50, grade: 5.6, cat: '학생부위주(종합)', date: inDays(6) }),
  mk('3204', '국립목포대학교(목포)', '자율전공학부', '교과(일반)', { quota: 39, grade: 5.6 }),
  mk('3204', '경상국립대학교(진주)', '원예과학부', '교과(일반)', { quota: 40, grade: 5.6, track: '자연' }),
  mk('3204', '광주보건대학교', '치위생과', '일반전형', { quota: 60, univType: '전문대' }),
  mk('3204', '조선간호대학교', '간호학과', '일반전형', { quota: 80, univType: '전문대' }),
  mk('3204', '동강대학교', '간호학과', '일반전형', { quota: 70, univType: '전문대' }),
  mk('3204', '육군사관학교', '문과', '일반전형', { quota: 30, univType: '특수대' }),

  mk('3212', '서울대학교', '경제학부', '종합(지역균형)', { quota: 6, grade: 1.4, cat: '학생부위주(종합)', min: true }),
  mk('3212', '고려대학교(서울)', '경제학과', '교과(학교추천)', { quota: 21, grade: 1.4, min: true }),
  mk('3212', '연세대학교(서울)', '경제학부', '교과(추천형)', { quota: 24, grade: 1.4, min: true }),
  mk('3212', '성균관대학교', '글로벌경영학과', '교과(학교장추천)', { quota: 10, grade: 1.4, min: true }),
  mk('3212', '한양대학교(ERICA)', '경제학부', '교과(지역균형)', { quota: 12, grade: 1.4 }),
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

/** 처음 열었을 때 몇 칸은 이미 차 있게 둔다 */
const placed = [
  { id: A[0].id, hak: '3201', slot: 'rank', rank: 6 },
  { id: A[1].id, hak: '3201', slot: 'rank', rank: 2 },
  { id: A[2].id, hak: '3201', slot: 'rank', rank: 4 },
  { id: A[3].id, hak: '3201', slot: 'rank', rank: 1 },
  { id: A[4].id, hak: '3201', slot: 'rank', rank: 5 },
  { id: A[5].id, hak: '3201', slot: 'archive', rank: '' },
  { id: A[7].id, hak: '3204', slot: 'rank', rank: 1 },
  { id: A[8].id, hak: '3204', slot: 'rank', rank: 2 },
  { id: A[12].id, hak: '3204', slot: 'tray', rank: '' },
];

export const demo = {
  ok: true,
  who: '보기용 계정',
  students,
  apps: A,
  state: placed,
  notes: [],
  results: [],
  dates: [],
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
    { id: A[4].id, hak: '3201', kind: '모의면접', from: inDays(10), to: inDays(10), status: 'confirmed' },
    { id: A[3].id, hak: '3201', kind: '면접', from: inDays(14), to: inDays(14), status: 'pending' },
  ],
  notes: [{ noteId: 'n1', hak: '3201', id: A[3].id, text: '접수번호 0021170267', visible: 'Y' }],
};
