import { calculate, defaults } from './calculator.js';
const $ = id => document.getElementById(id);
const form = $('calculator');
const fmt = n => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(n);
const won = n => `${fmt(n)}원`;
const compact = n => n >= 1e8 ? `${fmt(Math.floor(n / 1e8))}억 ${fmt(Math.floor(n % 1e8 / 1e4))}만 원` : `${fmt(Math.round(n / 1e4))}만 원`;
const typeName = n => n === 1 ? '100세연금형' : '종신연금형';
const keys = Object.keys(defaults);
const storageKey = 'one-life-comparisons-v1';
let currentInput = { ...defaults }, currentResult, stale = false, saved = [], toastTimer;
try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(stored)) saved = stored.filter(x => x && x.input && !Object.keys(calculate(x.input).errors).length).slice(0, 3).map(x => ({ input: Object.fromEntries(keys.map(k => [k, x.input[k]])) }));
} catch { saved = []; }

function notify(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3200);
}
function readInput() {
  const data = new FormData(form);
  return Object.fromEntries(keys.map(key => {
    const raw = String(data.get(key) ?? '').replaceAll(',', '').trim();
    return [key, /^\d+$/.test(raw) ? Number(raw) : NaN];
  }));
}
function setInput(input) {
  for (const key of keys) {
    if (key === 'type' || key === 'sex') form.querySelector(`input[name="${key}"][value="${input[key]}"]`).checked = true;
    else $(key).value = key === 'premium' ? fmt(input[key]) : input[key];
  }
  updateHelpers();
}
function updateHelpers() {
  const input = readInput();
  $('premium-hint').textContent = Number.isFinite(input.premium) ? `매월 ${compact(input.premium)} · 30만 원 이상` : '30만 원 이상의 금액을 입력해 주세요.';
  for (const button of form.querySelectorAll('[data-premium]')) button.classList.toggle('active', Number(button.dataset.premium) === input.premium);
  $('timeline-age').textContent = Number.isFinite(input.age) ? `${input.age}세` : '—';
  $('timeline-end').textContent = Number.isFinite(input.age + input.payYears) ? `${input.age + input.payYears}세` : '—';
  $('timeline-start').textContent = Number.isFinite(input.startAge) ? `${input.startAge}세` : '—';
}
function setStale(value) {
  stale = value; $('stale-note').hidden = !value; $('result-content').classList.toggle('stale', value);
  $('save-result').disabled = value; $('copy-result').disabled = value;
  $('form-note').textContent = value ? '변경한 조건으로 다시 계산해 주세요.' : '입력한 조건으로 계산한 참고용 금액입니다.';
}
function renderResult(input, result) {
  currentInput = { ...input }; currentResult = result;
  $('result-type').textContent = typeName(input.type);
  $('result-title').textContent = `${input.startAge}세부터 매월 받는 예상 연금`;
  $('annual').textContent = fmt(result.annual);
  $('monthly').textContent = fmt(result.monthlyPayment);
  $('guarantee').textContent = won(result.guarantee);
  $('paid').replaceChildren(document.createTextNode(fmt(result.totalPaid)), Object.assign(document.createElement('span'), { textContent: '원' }));
  $('total').replaceChildren(document.createTextNode(fmt(result.totalTo100)), Object.assign(document.createElement('span'), { textContent: '원' }));
  $('paid-description').textContent = `월 ${compact(input.premium)} × ${input.payYears}년`;
  $('ratio').textContent = `${result.ratio.toFixed(2)}배`;
  $('paid-bar').style.width = `${Math.min(100, 100 / result.ratio)}%`;
  $('bar-paid').textContent = compact(result.totalPaid);
  $('bar-total').textContent = compact(result.totalTo100);
  $('extra').textContent = `${result.extraTo100 >= 0 ? '+' : ''}${won(result.extraTo100)}`;
  setStale(false);
}
function submit(scroll = false) {
  const input = readInput(), result = calculate(input);
  for (const key of keys) {
    $(`error-${key}`).textContent = result.errors[key] || '';
    for (const control of form.querySelectorAll(`[name="${key}"]`)) control.setAttribute('aria-invalid', String(Boolean(result.errors[key])));
  }
  if (Object.keys(result.errors).length) {
    setStale(true); form.querySelector('[aria-invalid="true"]')?.focus(); notify('입력한 가입조건을 확인해 주세요.'); return;
  }
  $('premium').value = fmt(input.premium);
  renderResult(input, result);
  if (scroll && matchMedia('(max-width:850px)').matches) $('result-content').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}
function changed() {
  updateHelpers();
  const next = readInput();
  setStale(keys.some(key => next[key] !== currentInput[key]));
}
form.addEventListener('input', changed);
form.addEventListener('change', changed);
form.addEventListener('submit', event => { event.preventDefault(); submit(true); });
$('premium').addEventListener('blur', () => { const n = readInput().premium; if (Number.isSafeInteger(n)) $('premium').value = fmt(n); });
for (const button of form.querySelectorAll('[data-premium]')) button.addEventListener('click', () => { $('premium').value = fmt(Number(button.dataset.premium)); changed(); });
$('reset').addEventListener('click', () => { setInput(defaults); submit(); notify('기본 가입조건으로 초기화했습니다.'); });
$('monthly-info').addEventListener('click', () => {
  $('monthly-explanation').hidden = !$('monthly-explanation').hidden;
  $('monthly-info').setAttribute('aria-expanded', String(!$('monthly-explanation').hidden));
});
function persistSaved() {
  try { localStorage.setItem(storageKey, JSON.stringify(saved)); return true; }
  catch { notify('기기 저장 공간을 사용할 수 없어 이번 화면에서만 보관합니다.'); return false; }
}
function renderSaved() {
  $('saved-panel').hidden = !saved.length; $('saved-list').replaceChildren();
  saved.forEach(({ input }, index) => {
    const result = calculate(input), row = document.createElement('div'); row.className = 'saved-item';
    const content = document.createElement('div'), detail = document.createElement('p'), value = document.createElement('strong');
    detail.textContent = `${typeName(input.type)} · ${input.sex === 1 ? '남성' : '여성'} ${input.age}세 · 월 ${compact(input.premium)} · ${input.payYears}년납 · ${input.startAge}세 개시`;
    value.textContent = `매월 ${won(result.monthlyPayment)} · 납입금의 ${result.ratio.toFixed(2)}배`; content.append(detail, value);
    const buttons = document.createElement('div'); buttons.className = 'saved-buttons';
    const load = document.createElement('button'); load.type = 'button'; load.textContent = '불러오기'; load.setAttribute('aria-label', `비교 ${index+1} 불러오기`);
    load.addEventListener('click', () => { setInput(input); submit(); $('input-title').scrollIntoView({block:'start'}); notify('저장한 가입조건을 불러왔습니다.'); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '삭제'; remove.setAttribute('aria-label', `비교 ${index+1} 삭제`);
    remove.addEventListener('click', () => { saved.splice(index,1); persistSaved(); renderSaved(); });
    buttons.append(load,remove); row.append(content,buttons); $('saved-list').append(row);
  });
}
$('save-result').addEventListener('click', () => {
  if(stale) return;
  if(saved.some(({input}) => keys.every(k => input[k] === currentInput[k]))) { notify('같은 가입조건이 이미 저장되어 있습니다.'); return; }
  if(saved.length >= 3) { notify('최대 3개까지 비교할 수 있습니다. 기존 조건을 삭제해 주세요.'); return; }
  saved.push({input:{...currentInput}}); const persisted = persistSaved(); renderSaved(); if(persisted) notify('비교함에 저장했습니다.');
});
$('clear-saved').addEventListener('click', () => { saved=[]; persistSaved(); renderSaved(); notify('저장한 비교조건을 삭제했습니다.'); });
$('copy-result').addEventListener('click', async () => {
  if(stale) return;
  const i=currentInput,r=currentResult;
  const text=`ONE더라이프 연금 계산 (2024.12.17 원본 기준)\n${typeName(i.type)} / ${i.sex===1?'남성':'여성'} ${i.age}세\n월보험료 ${won(i.premium)} / ${i.payYears}년납 / ${i.startAge}세 개시\n총 납입보험료: ${won(r.totalPaid)}\n최저연금기준액: ${won(r.guarantee)}\n매월 예상 연금(월 지급액 환산): ${won(r.monthlyPayment)}\n납입금 대비 총수령 배수(100세까지 가정): ${r.ratio.toFixed(2)}배\n납입금보다 더 받는 금액(100세까지 가정): ${won(r.extraTo100)}\n연 수령액: ${won(r.annual)}\n100세까지 수령 가정 총액: ${won(r.totalTo100)}\n참고용·비공식 계산. 공시이율 입력 0%, 추가납입·중도인출 없음. 원본 내부용 안내 적용. 실제 보험금의 근거가 될 수 없습니다.`;
  try { await navigator.clipboard.writeText(text); notify('결과를 클립보드에 복사했습니다.'); }
  catch { notify('복사를 사용할 수 없습니다. 브라우저의 클립보드 권한을 확인해 주세요.'); }
});
setInput(defaults); submit(); renderSaved();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
