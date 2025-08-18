// Carica combinazioni da JSON
let combinations = [];
let selected = {};
let freeInputVars = new Set();
let freeValues = {};
let calcValues = {};

// Helper: DOM ready
function ready(fn){ document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }

ready(() => {
  fetch('rotoli_asciugamani_varianti_1.json')
    .then(response => response.json())
    .then(data => {
      combinations = data;
      computeFreeInputVars();
      renderMask();
    });

  // PULISCI
  document.getElementById('cleanBtn').onclick = () => {
    selected = {};
    freeValues = {};
    calcValues = {};
    document.querySelectorAll('.data-field').forEach(el => {
      el.classList.remove('selected', 'impossible');
    });
    document.querySelectorAll('.data-input').forEach(el => {
      el.value = '';
      el.classList.remove('filled');
    });
    updateCalculatedFields();
  };

  // STAMPA
  document.getElementById('printBtn').onclick = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 12;
    doc.setFontSize(14);
    doc.text('Riepilogo Ordine', 10, y);
    y += 8;
    doc.setFontSize(11);
    Object.entries(selected).forEach(([v, val]) => {
      const line = `${v}: ${val}`;
      doc.text(line, 10, y);
      y += 6.5;
      if (y > 280) { doc.addPage(); y = 12; }
    });
    // Include free input values as well
    Object.entries(freeValues).forEach(([v, val]) => {
      if (val === undefined || val === '') return;
      const line = `${v}: ${val}`;
      doc.text(line, 10, y);
      y += 6.5;
      if (y > 280) { doc.addPage(); y = 12; }
    });
    // Include calculated values
    Object.entries(calcValues).forEach(([v, val]) => {
      const line = `${v}: ${val}`;
      doc.text(line, 10, y);
      y += 6.5;
      if (y > 280) { doc.addPage(); y = 12; }
    });
    doc.save('riepilogo_ordine.pdf');
  };
});

function renderMask() {
  const variables = Object.keys(combinations[0]);
  const mask = document.getElementById('mask');
  mask.innerHTML = '';
  variables.forEach(variable => {
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
        el.placeholder = 'Inserisci valore';
        el.className = 'data-input';
        el.oninput = () => {
          el.classList.toggle('filled', !!el.value);
          freeValues[variable] = el.value;
          delete selected[variable];
          updateFields();
        };
      } else if (String(val).includes('<calcolato')) {
        el = document.createElement('span');
        el.textContent = '—';
        el.title = 'Campo calcolato';
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

function fieldClicked(variable, value, element) {
  if (element.classList.contains('impossible')) return;
  // Deseleziona altri nella stessa sezione
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

// Normalizzazione per confronto flessibile
function _normForEq(x){
  if (x === null || x === undefined) return '##NULL##';
  if (typeof x === 'boolean') return '##BOOL##' + (x ? '1' : '0');
  if (typeof x === 'number') return '##NUM##' + x;
  let s = String(x).trim();
  let sNum = s.replace(',', '.');
  const num = Number(sNum);
  if (!Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(sNum)) return '##NUM##' + num;
  return '##STR##' + s.toUpperCase(); // case-insensitive per stringhe tipo "SI"/"No"
}
function _eqFlex(a,b){ return _normForEq(a) === _normForEq(b); }

function updateFields() {
  // Rimuovi eventuali variabili a input libero da 'selected'
  if (freeInputVars && freeInputVars.size) {
    [...freeInputVars].forEach(v => { if (v in selected) delete selected[v]; });
  }

  updateCalculatedFields();

  const possible = combinations.filter(c =>
    Object.entries(selected).every(([v, val]) => {
      if (freeInputVars.has(v)) return true; // non vincola
      return _eqFlex(c[v], val);
    })
  );

  document.querySelectorAll('.data-field').forEach(el => {
    const varName = el.closest('.section').dataset.var;
    const raw = el.textContent;
    const val = isNaN(raw) ? raw : parseFloat(raw);
    if (_eqFlex(selected[varName], val)) {
      el.classList.add('selected');
      el.classList.remove('impossible');
    } else {
      const has = possible.some(c => _eqFlex(c[varName], val));
      if (has) {
        el.classList.remove('impossible');
      } else {
        el.classList.add('impossible');
        el.classList.remove('selected');
      }
    }
  });
}

// Parsing numeri con virgola o punto
function _num(x){
  if (x === undefined || x === null) return NaN;
  if (typeof x === 'number') return x;
  const s = String(x).trim().replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// --- Calcolo dei campi <calcolato> ---
function updateCalculatedFields(){
  calcValues = {};

  // 1) NUMERO STRAPPI = (LUNGHEZZA ROTOLO mt * 100) / FORMATO STRAPPO cm
  const lenm = freeValues['LUNGHEZZA ROTOLO mt'];
  const formatoSel = (selected['FORMATO STRAPPO cm'] !== undefined) ? selected['FORMATO STRAPPO cm'] : freeValues['FORMATO STRAPPO cm'];
  const L = _num(lenm);
  const F = _num(formatoSel);
  let resultStrappi = null;
  if (Number.isFinite(L) && Number.isFinite(F) && F > 0){
    const raw = (L * 100.0) / F;
    const rounded = Math.round(raw);
    calcValues['NUMERO STRAPPI'] = rounded;
    resultStrappi = rounded;
  }

  // 2) GR./ROTOLO APROX per richiesta di Franco
  // Formula base: NUMERO VELI * GRAMMATURA gr./mq * (ALTEZZA cm / 100) * LUNGHEZZA ROTOLO mt
  // Se ANIMA ESTRAIBILE == "SI": + (ALTEZZA cm * 1.5)
  const veli = _num(selected['NUMERO VELI']);
  const gramm = _num(selected['GRAMMATURA gr./mq']);
  const altCm = _num(selected['ALTEZZA cm']);
  const anima = selected['ANIMA ESTRAIBILE']; // stringa "SI"/"NO"
  const A_m = Number.isFinite(altCm) ? (altCm / 100.0) : NaN;
  let grRotolo = null;
  if (Number.isFinite(veli) && Number.isFinite(gramm) && Number.isFinite(A_m) && Number.isFinite(L)){
    let base = veli * gramm * A_m * L;
    let extra = 0;
    if (_eqFlex(anima, 'SI')) {
      extra = altCm * 1.5; // correzione richiesta (senza /100)
    }
    grRotolo = base + extra;
    // Arrotondo al grammo
    grRotolo = Math.round(grRotolo);
    calcValues['GR./ROTOLO APROX'] = grRotolo + ' g';
  }

  // Aggiorna UI dei campi calcolati
  document.querySelectorAll('.section').forEach(section => {
    const varName = section.dataset.var;
    const span = section.querySelector('.calc-field');
    if (!span) return;
    if (varName === 'NUMERO STRAPPI'){
      span.textContent = (resultStrappi !== null) ? String(resultStrappi) : '—';
      span.title = 'Campo calcolato' + ((resultStrappi !== null) ? ` = ${resultStrappi}` : '');
    }
    if (varName === 'GR./ROTOLO APROX'){
      span.textContent = (grRotolo !== null) ? (grRotolo + ' g') : '—';
      span.title = 'Campo calcolato' + ((grRotolo !== null) ? ` ≈ ${grRotolo} g` : '');
    }
  });
}

function computeFreeInputVars(){
  freeInputVars = new Set();
  if(!combinations.length) return;
  const variables = Object.keys(combinations[0]);
  variables.forEach(v => {
    const hasFree = combinations.some(c => String(c[v]).includes('<campo libero>'));
    if(hasFree) freeInputVars.add(v);
  });
}
