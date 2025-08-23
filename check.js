
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

  // --- PDF ---
  async function createPdfFromSelectionsOrdered(orderedEntries){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'mm', format:'a4', putOnlyUsedFonts:true });
    const pageW = 210, pageH = 297;
    const margin = 15, right = pageW - margin;
    let y = margin;

    // Testo Navy profondo
    doc.setTextColor(11,42,60);

    // Logo
    try{
      const logoData = await loadImageDataURL('logo.jpg');
      if (logoData) doc.addImage(logoData, 'JPEG', margin, y-2, 42, 16, undefined, 'FAST');
    }catch(e){}

    // Titolo centrato
    const proto = makeProtocolId();
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
    y = titleY + 10;

    // Body
    const boxW = right - margin;
    const labelPadX = 3, valPadX = 3, rowH = 8;
    doc.setFontSize(11);

    orderedEntries.forEach(([k,v])=>{
      // calcolo righe a capo se testo lungo
      const labelW = 58;
      let valStr = (v === null || v === undefined) ? '' : String(v);
      const valW = boxW - labelW - 2;
      const linesVal = doc.splitTextToSize(valStr, valW - valPadX*2);
      const linesLab = doc.splitTextToSize(k, labelW - labelPadX*2);
      const lines = Math.max(linesVal.length, linesLab.length);
      const h = Math.max(rowH, lines * 6.2);

      roundedRect(doc, margin, y, boxW, h, 2);
      // etichetta
      doc.setFont('helvetica','bold');
      doc.text(linesLab, margin + labelPadX, y + 5.2, { baseline:'top' });
      // valore
      doc.setFont('helvetica','normal');
      const valX = margin + labelW;
      doc.line(valX, y, valX, y + h); // divisore
      doc.text(linesVal, valX + valPadX, y + 5.2, { baseline:'top' });

      y += h + 2;
      if (y > pageH - 30){
        doc.addPage(); y = margin;
      }
    });

    // Frase finale + icona telefono (se presente)
    const finalY = Math.min(pageH - 18, y + 6);
    const msg = 'La nostra offerta verrà inviata entro 48 ore';
    doc.setFont('helvetica','italic'); doc.setFontSize(12);
    doc.text(msg, margin, finalY);
    try{
      const tel = await loadImageDataURL('telefono.jpg');
      if (tel) doc.addImage(tel, 'JPEG', right - 22, finalY - 6, 18, 12, undefined, 'FAST');
    }catch(e){}

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
    // Header counter (unchanged)
    const h = document.getElementById('orderTitle');
    if (h){
      const { ymd, seq } = nextDailySeq();
      const header = `Order ${ymd}_${pad2(seq)}`;
      h.textContent = header;
      document.title = header;
    }

    const btn   = document.getElementById('printBtn');
    const modal = document.getElementById('print-modal');
    if (!btn || !modal) return;

    const dialog   = modal.querySelector('.print-modal-dialog');
    const proceedB = modal.querySelector('#pm-proceed');
    const cancelB  = modal.querySelector('#pm-cancel');
    const mailLink = modal.querySelector('.pm-mail');
    let lastFocus  = null;

    const openModal = () => {
      lastFocus = document.activeElement;
      modal.classList.add('is-open');
      modal.removeAttribute('aria-hidden');
      (proceedB || dialog).focus();
    };
    const closeModal = () => {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden','true');
      if (lastFocus && lastFocus.focus) setTimeout(() => lastFocus.focus(), 0);
    };

    // Capture-phase interceptor for the Print button
    const onCapture = (ev) => {
      if (!modal.classList.contains('is-open')){
        ev.preventDefault?.();
        ev.stopPropagation?.();
        ev.stopImmediatePropagation?.();
        openModal();
        return;
      }
      ev.preventDefault?.();
      ev.stopPropagation?.();
      ev.stopImmediatePropagation?.();
    };
    btn.addEventListener('click', onCapture, { capture: true });

    // Clicking anywhere on the modal/backdrop/dialog triggers PROCEED,
    // except if the click is on Cancel or on the mail link.
    const shouldCancel = (t) => t && (t.closest && (t.closest('#pm-cancel') || t.closest('.pm-help')));
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.pm-help')){
        // Allow mailto to open and keep the modal (no print)
        return;
      }
      if (t && t.closest && t.closest('#pm-cancel')){
        e.preventDefault();
        e.stopPropagation();
        closeModal();
        return;
      }
      // Otherwise: proceed to print
      e.preventDefault();
      e.stopPropagation();
      closeModal();
      try { window.print(); } catch(e){}
    }, true);

    // Explicit buttons
    if (proceedB) proceedB.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      closeModal();
      try { window.print(); } catch(e){}
    });
    if (cancelB) cancelB.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      closeModal();
    });

    // Esc cancels without printing
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')){
        closeModal();
      }
    });
  });
})();


// === PRINT PATCH v2: native print + dynamic scale to fit one A4 ===
(function(){
  function ready(fn){ document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }
  function mmToPx(mm){ return mm * 96 / 25.4; }

  ready(function(){
    var printBtn = document.getElementById('printBtn');
    // Choose the first existing root among these
    var root = document.querySelector('.container, .check-wrapper, main, body');

    function computeScale(){
      if(!root) return 1;
      var marginMM = 8;
      var targetWpx = mmToPx(210 - 2*marginMM);
      var targetHpx = mmToPx(297 - 2*marginMM);

      // measure full content
      var rect = root.getBoundingClientRect();
      var contentW = Math.max(root.scrollWidth, rect.width);
      var contentH = Math.max(root.scrollHeight, rect.height);

      var scaleW = targetWpx / contentW;
      var scaleH = targetHpx / contentH;
      var scale = Math.min(1, scaleW, scaleH);

      root.style.setProperty('--print-scale', String(Math.max(0.6, scale).toFixed(3)));
      return scale;
    }

    function beforePrint(){ computeScale(); }
    function afterPrint(){ /* no-op */ }

    if (window.matchMedia){
      var mql = window.matchMedia('print');
      try {
        var handler = function(e){ e.matches ? beforePrint() : afterPrint(); };
        mql.addEventListener ? mql.addEventListener('change', handler) : mql.addListener(handler);
      } catch(_) {}
    }
    if (typeof window.onbeforeprint !== 'undefined'){
      window.addEventListener('beforeprint', beforePrint);
      window.addEventListener('afterprint', afterPrint);
    }

    if (printBtn){
      printBtn.onclick = function(){
        beforePrint();
        requestAnimationFrame(function(){ window.print(); });
      };
    }
  });
})();
