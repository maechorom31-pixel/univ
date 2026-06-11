/**
 * 내신 중심 진학상담 보드 — Apps Script 백엔드
 * 탭: 학과입결 · 최저타깃 · 입결수정 · 내신1반~내신6반 · 모고 · 상담
 * 배포: 웹 앱 / 실행: 나 / 액세스: 모든 사용자(익명)
 *
 * 입결(학과입결)은 공개자료라 "웹에 게시(CSV)"로 도구가 직접 빠르게 읽고,
 * 수정분(입결수정)·최저·학생·상담은 여기(Apps Script)로 즉시 동기화한다.
 */
const LIVE_TABS   = ['모고','상담','최저타깃','입결수정','트랙안내','내신1반','내신2반','내신3반','내신4반','내신5반','내신6반'];
const STATIC_TABS = ['학과입결']; // 게시-CSV를 안 쓸 때의 폴백
const COUNSEL_TAB = '상담';
const IPEDIT_TAB  = '입결수정';

function doGet(e){
  const p = e.parameter || {};
  let out;
  try{
    if(p.action === 'live')        out = readTabs_(LIVE_TABS);
    else if(p.action === 'static') out = readTabs_(STATIC_TABS);
    else if(p.action === 'save')   out = appendRow_(COUNSEL_TAB,
      ['일시','학생명','반','번호','대학','학과','전형','우선순위','구분','메모'],
      [now_(), p.name, p.ban, p.no, p.univ, p.major, p.type, p.prio, p.kind||'memo', p.memo]);
    else if(p.action === 'saveip') out = appendRow_(IPEDIT_TAB,
      ['대학','카테고리','전형','학과','연도','필드','값','일시'],
      [p.univ, p.cat, p.type, p.major, p.year, p.field, p.val, now_()]);
    else if(p.action === 'savemin'){ // 수능최저 수정: 최저타깃에 누가(나중 행 우선 병합)
      const yy = 'y' + String(p.year||'').slice(-2);
      const row = [p.univ, p.cat, p.type, p.major, '', '', '', '', '', ''];
      const idx = {y23:4, y24:5, y25:6, y26:7, y27:9};
      if(idx[yy] != null) row[idx[yy]] = p.val;
      out = appendRow_('최저타깃',
        ['대학','카테고리','전형','학과','최저2023','최저2024','최저2025','최저2026','메모','최저2027'], row);
    }
    else if(p.action === 'ping')   out = {ok:true, time:now_()};
    else out = {error:'unknown action'};
  }catch(err){ out = {error:String(err)}; }
  const json = JSON.stringify(out);
  return p.callback
    ? ContentService.createTextOutput(p.callback+'('+json+')').setMimeType(ContentService.MimeType.JAVASCRIPT)
    : ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function now_(){ return Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd HH:mm'); }

function readTabs_(names){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = {};
  names.forEach(function(n){
    const sh = ss.getSheetByName(n);
    if(sh && sh.getLastRow() > 0) sheets[n] = sh.getDataRange().getDisplayValues();
  });
  return {sheets:sheets};
}

function appendRow_(tabName, header, row){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(tabName);
  if(!sh){ sh = ss.insertSheet(tabName); sh.appendRow(header); }
  sh.appendRow(row.map(function(v){ return v==null ? '' : v; }));
  return {ok:true};
}
