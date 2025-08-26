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
  // (rimosso) handler PDF eliminato
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



// ================== PDF STYLING PATCH v3 (0818) ==================
// Requisiti Franco 18/08:
// - Ordine delle righe = stesso della pagina (ordine DOM delle .section)
// - Stile più compatto per stare in UNA pagina A4
// - Colore dei campi DATO uguale per tutti (stile "bianco")
// - Solo ciò che è visibile a schermo
(function(){
  if (!window.jspdf) {
    console.warn("[PDF PATCH v3] jsPDF non trovato. Assicurati di includere jspdf.umd.min.js");
    return;
  }

  // Palette sintetica coerente col tema
  const PDF_COLORS = {
    // label variabile (sezione)
    labelFill: '#AEEBE4',
    labelText: '#0B2A3C',
    labelBorder: '#D3DEE4',
    // valore DATO: stile uniforme "bianco"
    valueFill: '#FFFFFF',
    valueBorder: '#D3DEE4',
    valueText: '#0B2A3C',
    pageText: '#0B2A3C'
  };

  function drawChip(doc, {x, y, w, h, fill, border, text, textColor, bold=false, fontSize=9, paddingX=4}) {
    doc.setDrawColor(border);
    doc.setFillColor(fill);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
    doc.setTextColor(textColor || PDF_COLORS.pageText);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    const tx = x + paddingX;
    const ty = y + h/2 + (fontSize*0.35); // baseline approx
    doc.text(String(text ?? ''), tx, ty, {maxWidth: w - paddingX*2});
  }

  const isVisible = (el) => !!(el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden');

  function getVarNameFromSection(section){
    const label = section.querySelector('.variable-label');
    return label ? (label.textContent || '').trim() : null;
  }

  // Per ogni .section, cerco un "valore" visibile da riportare
  function getRowForSection(section){
    if (!isVisible(section)) return null;
    const vName = getVarNameFromSection(section);
    if (!vName) return null;

    // 1) bottone selezionato
    const sel = section.querySelector('.data-field.selected');
    if (sel && isVisible(sel)) {
      const val = (sel.getAttribute('data-value') || sel.textContent || '').trim();
      if (val) return { v: vName, val };
    }

    // 2) input libero compilato
    const inputs = section.querySelectorAll('input.data-input, textarea.data-input');
    for (const el of inputs) {
      if (!isVisible(el)) continue;
      const v = ('value' in el) ? el.value : (el.textContent || '');
      const val = (v || '').trim();
      if (val) return { v: vName, val };
    }

    // 3) calcolato risolto
    const calc = section.querySelector('.calc-field');
    if (calc && isVisible(calc)) {
      const t = (calc.getAttribute('data-value') || calc.textContent || '').trim();
      if (t && t !== '—') return { v: vName, val: t };
    }

    return null;
  }

  function collectRowsDOM_inPageOrder(){
    const rows = [];
    document.querySelectorAll('.section').forEach(section => {
      const row = getRowForSection(section);
      if (row) rows.push(row);
    });
    return rows;
  }

  function attachPrintHandler_v3(){
    const btn = document.getElementById('printBtn_removed');
    if (!btn) {
      console.warn("[PDF PATCH v3] #printBtn_removed non trovato");
      return;
    }
    btn.onclick = () => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      // Layout più compatto
      const MARGIN_X = 10, MARGIN_Y = 10;
      const GAP_Y = 2.5;
      const ROW_H = 8.0;
      const LABEL_W = 60;   // più stretto
      const VALUE_W = 120;  // più stretto
      let x = MARGIN_X;
      let y = MARGIN_Y;

      // Titolo compatto
      doc.setFontSize(12);
      doc.setTextColor(PDF_COLORS.pageText);
      doc.setFont('helvetica', 'bold');
      doc.text('Riepilogo Ordine', x, y);
      y += 6;

      const rows = collectRowsDOM_inPageOrder();

      doc.setFontSize(9);
      if (!rows.length) {
        doc.setFont('helvetica', 'normal');
        doc.text('Nessun dato visibile selezionato o inserito.', x, y);
        doc.save('riepilogo_ordine.pdf');
        return;
      }

      for (const {v, val} of rows) {
        if (y + ROW_H > 297 - MARGIN_Y) {
          // Se proprio si rischia overflow, aggiungo pagina ma
          // il target è una sola pagina: avvisa e interrompi
          doc.setFont('helvetica', 'italic');
          doc.text('...contenuto troncato per mantenere una pagina.', x, 297 - MARGIN_Y);
          break;
        }

        // Label (chip sezione)
        drawChip(doc, {
          x, y, w: LABEL_W, h: ROW_H,
          fill: PDF_COLORS.labelFill,
          border: PDF_COLORS.labelBorder,
          text: v,
          textColor: PDF_COLORS.labelText,
          bold: true,
          fontSize: 8.5,
          paddingX: 3.2
        });

        // Valore (chip uniforme bianco)
        drawChip(doc, {
          x: x + LABEL_W + 4, y, w: VALUE_W, h: ROW_H,
          fill: PDF_COLORS.valueFill,
          border: PDF_COLORS.valueBorder,
          text: val,
          textColor: PDF_COLORS.valueText,
          bold: false,
          fontSize: 8.5,
          paddingX: 3.2
        });

        y += ROW_H + GAP_Y;
      }

      doc.save('riepilogo_ordine.pdf');
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachPrintHandler_v3);
  } else {
    attachPrintHandler_v3();
  }
})();
// ================== /PDF STYLING PATCH v3 ==================



// ================== PDF STYLING PATCH v3.1 (0818) ==================
// Fix: rimuove eventuali vecchi listener del bottone "Stampa PDF"
// sostituendo il nodo con un clone "pulito" prima di agganciare l'handler.
// Mantiene: ordine DOM, layout compatto, valore uniforme bianco, solo visibili.
(function(){
  if (!window.jspdf) {
    console.warn("[PDF PATCH v3.1] jsPDF non trovato. Assicurati di includere jspdf.umd.min.js");
    return;
  }

  const PDF_COLORS = {
    labelFill: '#AEEBE4',
    labelText: '#0B2A3C',
    labelBorder: '#C8D5DC',    // un filo più scuro
    valueFill: '#FFFFFF',
    valueBorder: '#94A3AF',    // bordo più visibile su bianco
    valueText: '#0B2A3C',
    pageText: '#0B2A3C'
  };

  function drawChip(doc, {x, y, w, h, fill, border, text, textColor, bold=false, fontSize=9, paddingX=4}) {
    doc.setDrawColor(border);
    doc.setFillColor(fill);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
    doc.setTextColor(textColor || PDF_COLORS.pageText);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    const tx = x + paddingX;
    const ty = y + h/2 + (fontSize*0.35);
    doc.text(String(text ?? ''), tx, ty, {maxWidth: w - paddingX*2});
  }

  const isVisible = (el) => !!(el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden');
  const getVarNameFromSection = (section) => {
    const label = section.querySelector('.variable-label');
    return label ? (label.textContent || '').trim() : null;
  };

  function getRowForSection(section){
    if (!isVisible(section)) return null;
    const vName = getVarNameFromSection(section);
    if (!vName) return null;

    const sel = section.querySelector('.data-field.selected');
    if (sel && isVisible(sel)) {
      const val = (sel.getAttribute('data-value') || sel.textContent || '').trim();
      if (val) return { v: vName, val };
    }

    const inputs = section.querySelectorAll('input.data-input, textarea.data-input');
    for (const el of inputs) {
      if (!isVisible(el)) continue;
      const v = ('value' in el) ? el.value : (el.textContent || '');
      const val = (v || '').trim();
      if (val) return { v: vName, val };
    }

    const calc = section.querySelector('.calc-field');
    if (calc && isVisible(calc)) {
      const t = (calc.getAttribute('data-value') || calc.textContent || '').trim();
      if (t && t !== '—') return { v: vName, val: t };
    }

    return null;
  }

  function collectRowsInPageOrder(){
    const rows = [];
    document.querySelectorAll('.section').forEach(section => {
      const row = getRowForSection(section);
      if (row) rows.push(row);
    });
    return rows;
  }

  function attachPrintHandler_v31(){
    let btn = document.getElementById('printBtn_removed');
    if (!btn) {
      console.warn("[PDF PATCH v3.1] #printBtn_removed non trovato");
      return;
    }
    // Rimuove listener precedenti clonando il nodo
    const cleanBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(cleanBtn, btn);
    btn = cleanBtn;

    btn.addEventListener('click', () => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      const MARGIN_X = 10, MARGIN_Y = 10;
      const GAP_Y = 2.2;
      const ROW_H = 7.5;
      const LABEL_W = 58;
      const VALUE_W = 122;
      let x = MARGIN_X;
      let y = MARGIN_Y;

      doc.setFontSize(12);
      doc.setTextColor(PDF_COLORS.pageText);
      doc.setFont('helvetica', 'bold');
      doc.text('Riepilogo Ordine', x, y);
      y += 5.5;

      const rows = collectRowsInPageOrder();
      doc.setFontSize(8.5);

      if (!rows.length) {
        doc.setFont('helvetica', 'normal');
        doc.text('Nessun dato visibile selezionato o inserito.', x, y);
        doc.save('riepilogo_ordine.pdf');
        return;
      }

      for (const {v, val} of rows) {
        if (y + ROW_H > 297 - MARGIN_Y) {
          doc.setFont('helvetica', 'italic');
          doc.text('...contenuto troncato per mantenere una pagina.', x, 297 - MARGIN_Y);
          break;
        }

        drawChip(doc, {
          x, y, w: LABEL_W, h: ROW_H,
          fill: PDF_COLORS.labelFill,
          border: PDF_COLORS.labelBorder,
          text: v,
          textColor: PDF_COLORS.labelText,
          bold: true,
          fontSize: 8.2,
          paddingX: 3
        });

        drawChip(doc, {
          x: x + LABEL_W + 3.5, y, w: VALUE_W, h: ROW_H,
          fill: PDF_COLORS.valueFill,
          border: PDF_COLORS.valueBorder,
          text: val,
          textColor: PDF_COLORS.valueText,
          bold: false,
          fontSize: 8.2,
          paddingX: 3
        });

        y += ROW_H + GAP_Y;
      }

      doc.save('riepilogo_ordine.pdf');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachPrintHandler_v31);
  } else {
    attachPrintHandler_v31();
  }
})();
// ================== /PDF STYLING PATCH v3.1 ==================


// ---- Check Order navigation ----
ready(() => {
  const goBtn = document.getElementById('checkBtn');
  if (goBtn){
    goBtn.onclick = () => {
      // Merge selected + freeValues; include only filled ones
      const payload = { selections: {}, meta: { ts: Date.now() } };
      Object.entries(selected || {}).forEach(([k,v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') payload.selections[k] = v;
      });
      Object.entries(freeValues || {}).forEach(([k,v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') payload.selections[k] = v;
      });
      // (opzionale) includi alcuni calcolati se presenti e numerici
      Object.entries(calcValues || {}).forEach(([k,v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') payload.selections[k] = v;
      });
      try{
        localStorage.setItem('orderSelections', JSON.stringify(payload));
      }catch(e){ console.warn('Impossibile salvare selections', e); }
      window.location.href = 'check.html';
    };
  }
});
