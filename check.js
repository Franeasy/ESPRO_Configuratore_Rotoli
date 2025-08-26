
/* check.js — v3 (ordine variabili allineato a CREATE YOUR ROLL)
   - Ordina le righe usando l'ordine delle chiavi nel primo oggetto del JSON
   - Mantiene: titolo centrato, stile chip, PDF in Navy, frase finale
*/
(function(){
  // --- Utils ---
  function ready(fn){ document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }
  function getSelections(){
    try{
      const parsed = JSON.parse(localStorage.getItem('orderSelections') || 'null');
      if (!parsed || !parsed.selections) return {};
      return parsed.selections;
    }catch(e){ return {}; }
  }
  // Cache ordine variabili
  let VAR_ORDER = null;
  function fetchVarOrder(){
    if (VAR_ORDER) return Promise.resolve(VAR_ORDER);
    return fetch('rotoli_asciugamani_varianti_1.json')
      .then(r => r.json())
      .then(data => {
        // Prendi le chiavi del primo record così come sono nel JSON
        VAR_ORDER = Object.keys(data[0] || {});
        return VAR_ORDER;
      }).catch(() => {
        VAR_ORDER = [];
        return VAR_ORDER;
      });
  }
  function toOrderedEntries(selObj, order){
    const entries = Object.entries(selObj || {});
    if (!order || !order.length) return entries;
    const pos = new Map(order.map((k,i)=>[k,i]));
    return entries.sort((a,b)=>{
      const ai = pos.has(a[0]) ? pos.get(a[0]) : 1e9;
      const bi = pos.has(b[0]) ? pos.get(b[0]) : 1e9;
      return ai - bi;
    });
  }

  // Image loader as DataURL
  function loadImageDataURL(path){
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/jpeg'));
      };
      img.onerror = () => resolve(null);
      img.src = path;
    });
  }
  function makeProtocolId(){
    const d = new Date();
    const pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
  function roundedRect(doc, x, y, w, h, r=2){
    if (doc.roundedRect) doc.roundedRect(x, y, w, h, r, r);
    else doc.rect(x, y, w, h);
  }

  // --- Render a video ---
  function renderList(orderedEntries){
    const node = document.getElementById('checkList');
    if (!node) return;
    node.innerHTML = '';
    if (!orderedEntries.length){
      const p = document.createElement('p');
      p.textContent = 'Nessuna voce selezionata nella pagina principale.';
      node.appendChild(p);
      return;
    }
    orderedEntries.forEach(([k,v])=>{
      const row = document.createElement('div');
      row.className = 'check-row';
      const left = document.createElement('div');
      left.className = 'chip-var';
      left.textContent = k;
      const right = document.createElement('div');
      right.className = 'chip-val';
      right.textContent = String(v);
      row.appendChild(left); row.appendChild(right);
      node.appendChild(row);
    });
  }

  
  // --- PDF (single-page, auto-expand body area) ---
  async function createPdfFromSelectionsOrdered(orderedEntries){
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF){
      // graceful fallback: print nativo
      try { window.print(); } catch(e){}
      return;
    }

    const doc = new jsPDF({ unit:'mm', format:'a4', putOnlyUsedFonts:true });
    const pageW = 210, pageH = 297;
    const margin = 12;                // margine più contenuto
    const right = pageW - margin;
    let y = margin;

    // Navy profondo per i testi
    doc.setTextColor(11,42,60);

    // Logo (in alto a sinistra)
    try{
      const logoData = await loadImageDataURL('logo.jpg');
      if (logoData) doc.addImage(logoData, 'JPEG', margin, y-2, 44, 17, undefined, 'FAST');
    }catch(e){}

    // Titolo centrato
    let proto = null;
    try{ proto = localStorage.getItem('currentOrderId'); }catch(e){}
    if (!proto){
      const h2 = document.getElementById('orderTitle');
      const m = h2 ? /Order\s+(\d{8}_\d{2})/.exec(String(h2.textContent||'')) : null;
      if (m) proto = m[1];
    }
    if (!proto && typeof nextDailySeq === 'function'){
      const { ymd, seq } = nextDailySeq(); proto = `${ymd}_${String(seq).padStart(2,'0')}`;
    }
    if (!proto) proto = makeProtocolId();
    doc.setFont('helvetica','bold'); doc.setFontSize(16);
    const title = `Order n° ${proto}`;
    const titleWidth = doc.getTextWidth(title);
    const titleX = (pageW - titleWidth)/2;
    const titleY = y + 18;
    doc.text(title, titleX, titleY);

    // Data a destra
    doc.setFont('helvetica','normal'); doc.setFontSize(12);
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
    doc.text(dateStr, right - doc.getTextWidth(dateStr), titleY);

    // Separatore
    doc.setDrawColor(11,42,60); doc.setLineWidth(0.3);
    doc.line(margin, titleY + 3, right, titleY + 3);
    y = titleY + 8; // body un po' più vicino all'header

    // —— Layout colonne ——
    const boxW = right - margin;
    const labelW = 52;              // più spazio ai valori
    const valW = boxW - labelW - 2;
    const gapY = 2;

    // —— Riserva a fondo pagina per messaggio + immagine ——
    const reserveBottom = 32;  // mm

    // —— Misuratore dinamico per riempire l'area utile senza andare a 2 pagine ——
    const BASE_FONT = 11;
    const BASE_ROW = 8;
    const BASE_LINE = 6.2;

    function totalHeightForFont(fontSize){
      doc.setFontSize(fontSize);
      const lineH = BASE_LINE * (fontSize/BASE_FONT);
      const rowMin = BASE_ROW * (fontSize/BASE_FONT);
      let total = 0;
      for (const [k,v] of orderedEntries){
        const labelText = k;
        const valText = (v === null || v === undefined) ? '' : String(v);
        const linesVal = doc.splitTextToSize(valText, valW - 6);
        const linesLab = doc.splitTextToSize(labelText, labelW - 6);
        const lines = Math.max(linesVal.length, linesLab.length);
        const h = Math.max(rowMin, lines * lineH);
        total += h + gapY;
      }
      if (total > 0) total -= gapY; // niente gap dopo l'ultima riga
      return total;
    }

    const available = (pageH - reserveBottom) - y;

    // Ricerca binaria su font per riempire al meglio l'area senza sforare
    let lo = 9, hi = 16, best = 11;
    for (let i=0; i<12; i++){
      const mid = (lo + hi) / 2;
      const h = totalHeightForFont(mid);
      if (h <= available){ best = mid; lo = mid; } else { hi = mid; }
    }
    // Arrotonda a 0.1 e limita
    const BODY_FONT = Math.min(16, Math.max(9, Math.round(best*10)/10));
    doc.setFontSize(BODY_FONT);
    const lineH = BASE_LINE * (BODY_FONT/BASE_FONT);
    const rowMin = BASE_ROW * (BODY_FONT/BASE_FONT);

    // —— Disegno righe ——
    for (let idx = 0; idx < orderedEntries.length; idx++){
      const [k,v] = orderedEntries[idx];
      const labelText = k;
      const valText = (v === null || v === undefined) ? '' : String(v);

      // Ricalcola line-wrap con il font scelto
      const linesVal = doc.splitTextToSize(valText, valW - 6);
      const linesLab = doc.splitTextToSize(labelText, labelW - 6);
      const lines = Math.max(linesVal.length, linesLab.length);
      const h = Math.max(rowMin, lines * lineH);

      // Box esterno
      roundedRect(doc, margin, y, boxW, h, 2);

      // Etichetta (bold)
      doc.setFont('helvetica','bold');
      doc.text(linesLab, margin + 3, y + 4.8, { baseline:'top' });

      // Divisore verticale e Valore
      doc.setFont('helvetica','normal');
      const valX = margin + labelW;
      doc.line(valX, y, valX, y + h);
      doc.text(linesVal, valX + 3, y + 4.8, { baseline:'top' });

      // Avanza
      y += h + gapY;
    }

    // —— Footer: frase + immagine telefono ——
    const finalY = Math.min(pageH - 14, y + 4);
    const msg = 'La nostra offerta verrà inviata entro 48 ore.';
    doc.setFont('helvetica','italic'); doc.setFontSize(12);
    doc.text(msg, margin, finalY);
    // Didascalia contatti (testo selezionabile e leggibile)
    doc.setFont('helvetica','normal'); doc.setFontSize(10);
    const _capMaxW = (right - margin);
    const _cap1 = 'E.S.PRO SRL - Via del Santo 140/142 - 35010 Limena PD - P.IVA 05123510280';
    const _cap2 = 'Email: info@esprosrl.com - Mob. +39 349 1003324 - Fax +39 049 767027 - PEC e.s.pro.srl@pec.it';
    const _capY1 = Math.min(pageH - margin - 10, finalY + 6);
    const _lines1 = (doc.splitTextToSize ? doc.splitTextToSize(_cap1, _capMaxW) : [_cap1]);
    const _lines2 = (doc.splitTextToSize ? doc.splitTextToSize(_cap2, _capMaxW) : [_cap2]);
    let _yRun = _capY1;
    doc.text(_lines1, margin, _yRun);
    _yRun += 4.6 * _lines1.length;
    doc.text(_lines2, margin, _yRun);
doc.save(`Order_${proto}.pdf`);
  }

  // --- Boot ---
  ready(() => {
    const back = document.getElementById('backBtn');
    if (back) back.onclick = () => history.back();

    const printBtn = document.getElementById('printBtn');
    const selections = getSelections();

    fetchVarOrder().then(order => {
      const orderedEntries = toOrderedEntries(selections, order);
      renderList(orderedEntries);
      if (printBtn){
        printBtn.onclick = () => createPdfFromSelectionsOrdered(orderedEntries);
      }
    });
  });
})();




// === Header counter + Robust Print Modal (capture) ===
const ENABLE_CAPTURE_MODAL = false; // disattivato: lasciamo che il bottone generi il PDF jsPDF
(function(){
  function ready(fn){ document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }
  function pad2(n){ return String(n).padStart(2,'0'); }
  function nextDailySeq(){
    try{
      const now = new Date();
      const ymd = `${now.getFullYear()}${pad2(now.getMonth()+1)}${pad2(now.getDate())}`;
      const key = `orderSeq_${ymd}`;
      let seq = parseInt(localStorage.getItem(key) || '0', 10);
      if (!Number.isFinite(seq) || seq < 0) seq = 0;
      seq += 1;
      localStorage.setItem(key, String(seq));
      return { ymd, seq };
    }catch(e){
      const now = new Date();
      const ymd = `${now.getFullYear()}${pad2(now.getMonth()+1)}${pad2(now.getDate())}`;
      return { ymd, seq: 1 };
    }
  }
  ready(() => {
    // Header counter
    const h = document.getElementById('orderTitle');
    if (h){
      const { ymd, seq } = nextDailySeq();
      const header = `Order ${ymd}_${pad2(seq)}`;
      h.textContent = header;
      document.title = header;
      try{ localStorage.setItem('currentOrderId', header.replace(/^Order\s+/, '')); }catch(e){}
    }

    const btn   = document.getElementById('printBtn');
    const modal = document.getElementById('print-modal');
    if (!btn || !modal) return;

    const openModal = () => { modal.classList.add('is-open'); modal.removeAttribute('aria-hidden'); };
    const closeModal = () => { modal.classList.remove('is-open'); modal.setAttribute('aria-hidden','true'); };

    let armed = false;

    // Capture-phase interceptor to prevent other print handlers from firing immediately
    const onCapture = (ev) => {
      // If modal not open: open it and arm next-click-to-print
      if (!modal.classList.contains('is-open')){
        ev.preventDefault?.();
        ev.stopPropagation?.();
        ev.stopImmediatePropagation?.();
        openModal();
        armed = true;

        const proceed = (e) => {
          document.removeEventListener('click', proceed, true);
          if (!armed) return;
          armed = false;
          closeModal();
          try { window.print(); } catch(e){}
        };
        document.addEventListener('click', proceed, true);
        return;
      }
      // If modal already open, block this click and let the global proceed handler take it
      ev.preventDefault?.();
      ev.stopPropagation?.();
      ev.stopImmediatePropagation?.();
    };

    if (ENABLE_CAPTURE_MODAL) btn.addEventListener('click', onCapture, { capture: true });

    // Esc closes modal without printing
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')){
        armed = false; closeModal();
      }
    });
  });
})();
