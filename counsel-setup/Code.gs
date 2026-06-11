/**
 * 내신 중심 진학상담 보드 — Apps Script 백엔드
 * 시트 탭: 학과입결 · 최저타깃 · 내신1반~내신6반 · 모고 · 상담
 * 배포: 웹 앱 / 실행: 나 / 액세스: 모든 사용자(익명)
 */
const LIVE_TABS = ['모고','상담','내신1반','내신2반','내신3반','내신4반','내신5반','내신6반'];
const STATIC_TABS = ['학과입결','최저타깃'];
const COUNSEL_TAB = '상담';

function doGet(e){
  const p = e.parameter || {};
  let out;
  try{
    if(p.action === 'live')        out = readTabs_(LIVE_TABS);
    else if(p.action === 'static') out = readTabs_(STATIC_TABS);
    else if(p.action === 'save')   out = saveCounsel_(p);
    else if(p.action === 'ping')   out = {ok:true, time:new Date().toISOString()};
    else out = {error:'unknown action'};
  }catch(err){ out = {error:String(err)}; }
  const json = JSON.stringify(out);
  if(p.callback){
    return ContentService.createTextOutput(p.callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function readTabs_(names){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = {};
  names.forEach(function(n){
    const sh = ss.getSheetByName(n);
    if(sh && sh.getLastRow() > 0){
      sheets[n] = sh.getDataRange().getDisplayValues();
    }
  });
  return {sheets:sheets};
}

function saveCounsel_(p){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(COUNSEL_TAB);
  if(!sh){
    sh = ss.insertSheet(COUNSEL_TAB);
    sh.appendRow(['일시','학생명','반','번호','대학','학과','전형','우선순위','구분','메모']);
  }
  sh.appendRow([
    Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd HH:mm'),
    p.name||'', p.ban||'', p.no||'',
    p.univ||'', p.major||'', p.type||'', p.prio||'',
    p.kind||'memo', p.memo||''
  ]);
  return {ok:true};
}
