// script_client.js — versione client
// Mantiene i comportamenti originali, filtra solo i campi riservati e aggiunge header full-row

let combinations = [];
let selected = {};
let freeValues = {};
let calcValues = {};
let freeInputVars = new Set();

const HEADERS_BEFORE = [
  { before: 'COLOR', label: 'PRODUCT FEATURES' },
  { before: 'ROLL WEIGHT GR.', label: 'PACKAGING AND LOGISTIC' },
  { before: 'PURCHASE FORECAST IN NR. OF PALLET', label: 'PRICES AND OFFERS' }
];

const HIDDEN_VARS = new Set([
  'EXTERNAL ROLL DIAMETER cm',
  'PACKAGES / PALLET',
  'M.O.Q. PALLETS',
  'DAP PRICE',
  'EXW PRICE'
]);

function ready(fn){ document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }

ready(() => {
  fetch('rotoli_asciugamani_varianti_1.json')
    .then(r => r.json())
    .then(data => { combinations = data || []; computeFreeInputVars(); renderMask(); })
    .catch(() => { combinations = []; renderMask(); });

  const cleanBtn = document.getElementById('cleanBtn');
  if (cleanBtn) cleanBtn.onclick = () => {
    selected = {}; freeValues = {}; calcValues = {};
    document.querySelectorAll('.data-field').forEach(el => el.classList.remove('selected','impossible'));
    document.querySelectorAll('.data-input').forEach(el => { el.value=''; el.classList.remove('filled'); });
    updateFields();
  };

  const checkBtn = document.getElementById('checkBtn');
  if (checkBtn) checkBtn.onclick = () => {
    try {
      if (typeof updateCalculatedFields === 'function') { try{ updateCalculatedFields(); }catch(e){} }
      const payload = { selections: { ...selected, ...freeValues, ...calcValues } };
      localStorage.setItem('orderSelections', JSON.stringify(payload));
    } catch(e){}
    location.href = 'check.html';
  };
});

// ----------------------- helpers (come originale) -----------------------
function _normForEq(x){
  if (x === null || x === undefined) return '##NULL##';
  if (typeof x === 'boolean') return '##BOOL##' + (x ? '1' : '0');
  if (typeof x === 'number') return '##NUM##' + x;
  let s = String(x).trim();
  let sNum = s.replace(',', '.');
  const num = Number(sNum);
  if (!Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(sNum)) return '##NUM##' + num;
  return '##STR##' + s.toUpperCase();
}
function _eqFlex(a,b){ return _normForEq(a) === _normForEq(b); }

function fieldClicked(variable, value, element) {
  if (element.classList.contains('impossible')) return;
  document.querySelectorAll('.section').forEach(section => {
    const label = section.querySelector('.variable-label');
    if (label && label.textContent === variable) {
      section.querySelectorAll('.data-field.selected').forEach(btn => btn.classList.remove('selected'));
    }
  });
  if (selected[variable] === value) {
    delete selected[variable];
    element.classList.remove('selected');
  } else {
    selected[variable] = value;
    element.classList.add('selected');
  }
  updateFields();
}

function updateFields() {
  if (freeInputVars && freeInputVars.size) {
    [...freeInputVars].forEach(v => { if (v in selected) delete selected[v]; });
  }

  updateCalculatedFields();

  const possible = combinations.filter(c =>
    Object.entries(selected).every(([v, val]) => _eqFlex(c[v], val))
  );

  document.querySelectorAll('.data-field').forEach(el => {
    const varName = el.closest('.section').dataset.var;
    const raw = el.textContent;
    const val = isNaN(raw) ? raw : parseFloat(raw);
    if (_eqFlex(selected[varName], val)) {
      el.classList.add('selected'); el.classList.remove('impossible');
    } else {
      const has = possible.some(c => _eqFlex(c[varName], val));
      if (has) { el.classList.remove('impossible'); }
      else { el.classList.add('impossible'); el.classList.remove('selected'); }
    }
  });
}

function _num(x){
  if (x === undefined || x === null) return NaN;
  if (typeof x === 'number') return x;
  const s = String(x).trim().replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/* === PATCH 2025-09-24 — ripristina calcoli reali e scrittura su DOM === */
function _getVarNum(name){
  // priorità: selezionato -> free input -> DOM (active/filled) -> sample
  if (name in selected) return _num(selected[name]);
  if (name in freeValues) return _num(freeValues[name]);

  // fallback DOM: pulsante selezionato o input dentro la sezione
  const sec = document.querySelector('.section[data-var="'+name+'"]');
  if (sec){
    const btn = sec.querySelector('.data-field.selected');
    if (btn) return _num(btn.textContent);
    const inp = sec.querySelector('.data-input');
    if (inp && inp.value) return _num(inp.value);
  }
  // fallback dataset (primo record)
  const sample = combinations && combinations[0] ? combinations[0] : {};
  return _num(sample[name]);
}

function _setCalcOnDOM(varName, value){
  const sec = document.querySelector('.section[data-var="'+varName+'"]');
  if (!sec) return;
  const el = sec.querySelector('.calc-field') || sec.querySelector('.value') || sec;
  el.textContent = (value === undefined || value === null || Number.isNaN(value)) ? '—' : String(value);
}

function updateCalculatedFields(){
  calcValues = {};

  // --- NUMBER OF SHEETS ---
  const L_m = _getVarNum('ROLL LENGHT mt');     // metri
  const sheet_cm = _getVarNum('SHEET SIZE cm'); // centimetri
  if (Number.isFinite(L_m) && Number.isFinite(sheet_cm) && sheet_cm > 0){
    calcValues['NUMBER OF SHEETS'] = Math.round((L_m * 100) / sheet_cm);
  } else {
    calcValues['NUMBER OF SHEETS'] = '—';
  }
  _setCalcOnDOM('NUMBER OF SHEETS', calcValues['NUMBER OF SHEETS']);

  // --- ROLL WEIGHT GR. ---
  const gsm   = _getVarNum('GSM gr.');
  const plies = _getVarNum('NUMBER OF PLIES');
  const width_cm = _getVarNum('WIDTH cm');
  if ([gsm, plies, width_cm, L_m].every(Number.isFinite)){
    const width_m = width_cm / 100;
    const grams = Math.round(gsm * plies * width_m * L_m);
    calcValues['ROLL WEIGHT GR.'] = grams;
  } else {
    calcValues['ROLL WEIGHT GR.'] = '—';
  }
  _setCalcOnDOM('ROLL WEIGHT GR.', calcValues['ROLL WEIGHT GR.']);
}

function computeFreeInputVars(){
  try{
    const keys = Object.keys(combinations[0] || {});
    freeInputVars = new Set();
    keys.forEach(k => {
      const uniq = [...new Set(combinations.map(c => c[k]))];
      if (uniq.some(v => String(v).includes('<campo libero>'))) freeInputVars.add(k);
    });
  }catch(e){ freeInputVars = new Set(); }
}

// ----------------------- renderMask (versione client) -----------------------
function renderMask(){
  // 1) Preleva variabili dal dataset
  let variables = Object.keys(combinations[0] || {});

  // 2) Filtra i campi riservati (invisibili al cliente)
  variables = variables.filter(v => !HIDDEN_VARS.has(v));

  // 3) Evita duplicati: se una variabile ha lo stesso nome di un header, escludila
  const headerLabels = new Set((HEADERS_BEFORE || []).map(h => h.label));
  variables = variables.filter(v => !headerLabels.has(v));

  // 4) Costruisci sequenza con header token prima delle variabili specificate
  const headerMap = new Map((HEADERS_BEFORE || []).map(h => [h.before, h.label]));
  const seq = [];
  for (let i=0; i<variables.length; i++){
    const v = variables[i];
    if (headerMap.has(v)) seq.push('__HDR__' + headerMap.get(v));
    seq.push(v);
  }

  // 5) Render (mantiene markup/classi delle card originali)
  const mask = document.getElementById('mask');
  if (!mask) return;
  mask.innerHTML = '';

  seq.forEach(variable => {
    // Header full-row (teal scuro + testo bianco)
    if (typeof variable === 'string' && variable.startsWith('__HDR__')){
      const label = variable.replace('__HDR__','');
      const hdr = document.createElement('div');
      hdr.className = 'section';
      hdr.style.gridColumn = '1 / -1';
      hdr.style.background = '#0B7A78';
      hdr.style.borderRadius = '10px';
      hdr.style.padding = '6px 10px';
      const h = document.createElement('div');
      h.textContent = label;
      h.style.fontWeight = '800';
      h.style.color = '#FFFFFF';
      h.style.letterSpacing = '.3px';
      hdr.appendChild(h);
      mask.appendChild(hdr);
      return; // passa alla prossima voce
    }

    // Sezione variabile (identica all'originale)
    const section = document.createElement('div');
    section.className = 'section';
    section.dataset.var = variable;

    const label = document.createElement('div');
    label.textContent = variable;
    label.className = 'variable-label';
    section.appendChild(label);

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'options';

    const uniqueValues = [...new Set(combinations.map(c => c[variable]))];
    uniqueValues.forEach(val => {
      let el;
      if (String(val).includes('<campo libero>')) {
        el = document.createElement('input');
        el.type = 'text';
        el.placeholder = 'Enter value';
        el.className = 'data-input';
        el.oninput = () => {
          el.classList.toggle('filled', !!el.value);
          if (!el.value) delete freeValues[variable];
          else freeValues[variable] = el.value;
          if (selected && variable in selected) delete selected[variable];
          updateFields();
        };
      } else if (String(val).includes('<calcolato')) {
        el = document.createElement('span');
        el.textContent = '—';
        el.title = 'Calculated field';
        el.className = 'calc-field';
      } else {
        el = document.createElement('button');
        el.textContent = val;
        el.className = 'data-field';
        el.onclick = () => fieldClicked(variable, val, el);
      }
      optionsWrap.appendChild(el);
    });

    section.appendChild(optionsWrap);
    mask.appendChild(section);
  });

  updateFields();
}
// ---------------------------------------------------------------------------
