// ===== Constantes =====
const CATEGORIES = ['Comida','Transporte','Entretenimiento','Salud','Hogar','Educación','Ropa','Suscripciones','Otros'];
const CAT_COLORS = ['#C08A2E','#3C7A55','#2E3A52','#B3402A','#7A6A9C','#4E8FA6','#A66B4E','#6B7A4E','#8A8A8A'];
const METHODS = [
  {id:'efectivo', label:'Efectivo', icon:'💵'},
  {id:'debito', label:'Débito', icon:'💳'},
  {id:'credito', label:'Crédito', icon:'💳'},
  {id:'wallet', label:'Wallet', icon:'📱'},
];
const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const STORAGE_KEY = 'gastos-app-data';

function catColor(cat){ const i = CATEGORIES.indexOf(cat); return CAT_COLORS[i >= 0 ? i % CAT_COLORS.length : CAT_COLORS.length-1]; }
function fmtCLP(n){ return '$' + Math.round(n||0).toLocaleString('es-CL'); }
function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function ymKey(d){ const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; }
function ymParts(k){ const [y,m] = k.split('-').map(Number); return {y,m}; }
function addMonthsToYM(k,n){
  const {y,m} = ymParts(k);
  const total = (y*12 + (m-1)) + n;
  const ny = Math.floor(total/12), nm = (total%12)+1;
  return `${ny}-${String(nm).padStart(2,'0')}`;
}
function monthDiff(fromYM, toYM){
  const a = ymParts(fromYM), b = ymParts(toYM);
  return (b.y*12+b.m) - (a.y*12+a.m);
}
function portionInMonth(exp, ym){
  const count = exp.cuotas || 1;
  const diff = monthDiff(ymKey(exp.date), ym);
  if(diff < 0 || diff >= count) return 0;
  return exp.amount / count;
}
// Reparte una porción bruta (ya calculada por mes/cuota) entre las personas del gasto.
// Devuelve la parte que efectivamente es "tuya" (cuenta para tu presupuesto).
function myShare(exp, grossPortion){
  const n = exp.splitCount || 1;
  return grossPortion / n;
}
function owedShareTotal(exp){
  const n = exp.splitCount || 1;
  if(n <= 1) return 0;
  return exp.amount * (n - 1) / n;
}

// ===== Estado =====
let state = { expenses: [], fixedCosts: [], budgetGoal: 500000 };
let viewYM = ymKey(new Date());

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) state = JSON.parse(raw);
  }catch(e){ console.error('Error leyendo datos guardados', e); }
}
function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ console.error('Error guardando datos', e); }
}

// ===== Render principal =====
function render(){
  const {y,m} = ymParts(viewYM);
  const monthLabel = `${MONTH_NAMES[m-1]} ${y}`;
  document.getElementById('month-label').textContent = monthLabel;
  document.getElementById('receipt-month').textContent = monthLabel;

  const monthRows = state.expenses
    .map(e => {
      const gross = portionInMonth(e, viewYM);
      const mine = myShare(e, gross);
      return {...e, grossPortion: gross, portion: mine, owedPortion: gross - mine};
    })
    .filter(e => e.grossPortion > 0)
    .sort((a,b) => new Date(b.date) - new Date(a.date));

  const activeFixed = state.fixedCosts.filter(f => f.active);
  const fixedTotal = activeFixed.reduce((s,f) => s + f.amount, 0);
  const expensesTotal = monthRows.reduce((s,e) => s + e.portion, 0);
  const monthTotal = expensesTotal + fixedTotal;

  document.getElementById('receipt-total').textContent = fmtCLP(monthTotal);
  document.getElementById('total-variable').textContent = fmtCLP(expensesTotal);
  document.getElementById('total-fijo').textContent = fmtCLP(fixedTotal);
  document.getElementById('budget-label').textContent = fmtCLP(state.budgetGoal);

  const pct = state.budgetGoal > 0 ? Math.round((monthTotal/state.budgetGoal)*100) : 0;
  const pctClamped = Math.min(150, pct);
  document.getElementById('budget-pct').textContent = pct + '%';
  const fill = document.getElementById('progress-fill');
  fill.style.width = Math.min(100, pctClamped) + '%';

  let color, bg, msg;
  if(pct < 80){ color='var(--green)'; bg='var(--green-soft)'; msg='✓ Vas bien encaminado este mes.'; }
  else if(pct < 100){ color='var(--mustard)'; bg='var(--mustard-soft)'; msg='⚠ Te estás acercando al límite.'; }
  else { color='var(--red)'; bg='var(--red-soft)'; msg='✗ Superaste tu presupuesto mensual.'; }
  fill.style.background = color;
  document.getElementById('budget-pct').style.color = color;
  const statusEl = document.getElementById('status-msg');
  statusEl.textContent = msg;
  statusEl.style.color = color;
  statusEl.style.background = bg;

  renderPie(monthRows, activeFixed);
  renderBarChart();
  renderTransactions(monthRows);
  renderUpcomingCuotas();
  renderOwed();
}

function renderPie(monthRows, activeFixed){
  const map = {};
  monthRows.forEach(e => { map[e.category] = (map[e.category]||0) + e.portion; });
  activeFixed.forEach(f => { const c = f.category || 'Otros'; map[c] = (map[c]||0) + f.amount; });
  const entries = Object.entries(map).map(([name,value]) => ({name,value})).sort((a,b) => b.value - a.value);

  const pieWrap = document.getElementById('pie-wrap');
  const legend = document.getElementById('pie-legend');
  if(entries.length === 0){
    pieWrap.innerHTML = '<div class="empty-note">Sin gastos este mes todavía.</div>';
    legend.innerHTML = '';
    return;
  }
  const total = entries.reduce((s,e) => s+e.value, 0);
  let acc = 0;
  const stops = entries.map(e => {
    const start = (acc/total)*360;
    acc += e.value;
    const end = (acc/total)*360;
    return `${catColor(e.name)} ${start}deg ${end}deg`;
  }).join(', ');
  pieWrap.innerHTML = `<div class="pie-circle" style="background:conic-gradient(${stops});"><div class="pie-hole"></div></div>`;
  legend.innerHTML = entries.slice(0,6).map(e =>
    `<div class="legend-item"><span class="legend-dot" style="background:${catColor(e.name)}"></span>${e.name}</div>`
  ).join('');
}

function renderBarChart(){
  const bars = [];
  for(let i=5; i>=0; i--){
    const ym = addMonthsToYM(viewYM, -i);
    const eTotal = state.expenses.reduce((s,e) => s + myShare(e, portionInMonth(e, ym)), 0);
    const fTotal = state.fixedCosts.filter(f=>f.active).reduce((s,f)=>s+f.amount,0);
    const {m} = ymParts(ym);
    bars.push({ym, label: MONTH_NAMES[m-1].slice(0,3), total: eTotal+fTotal});
  }
  const max = Math.max(1, ...bars.map(b=>b.total));
  const chart = document.getElementById('bar-chart');
  chart.innerHTML = bars.map(b => {
    const h = Math.max(2, Math.round((b.total/max)*120));
    const cls = b.ym === viewYM ? 'bar-fill current' : 'bar-fill';
    return `<div class="bar-col" title="${fmtCLP(b.total)}">
      <div style="height:100%;display:flex;align-items:flex-end;width:100%;">
        <div class="${cls}" style="height:${h}px;"></div>
      </div>
      <div class="bar-label">${b.label}</div>
    </div>`;
  }).join('');
}

function renderTransactions(monthRows){
  const list = document.getElementById('transactions-list');
  if(monthRows.length === 0){
    list.innerHTML = `<div class="empty-note">Aún no registras gastos variables este mes.</div>`;
    return;
  }
  list.innerHTML = monthRows.map(e => {
    const method = METHODS.find(mm => mm.id === e.method) || METHODS[0];
    const idx = monthDiff(ymKey(e.date), viewYM) + 1;
    const cuotasTag = e.cuotas > 1 ? ` · cuota ${idx}/${e.cuotas}` : '';
    const splitTag = (e.splitCount > 1) ? ` · dividido ×${e.splitCount}${e.owedPortion > 0 ? ' (te deben '+fmtCLP(e.owedPortion)+')' : ''}` : '';
    return `<div class="tx-row" data-id="${e.id}">
      <div class="tx-icon">${method.icon}</div>
      <div class="tx-main">
        <div class="tx-desc">${escapeHtml(e.description || e.category)}</div>
        <div class="tx-meta"><span style="color:${catColor(e.category)}">${e.category}</span><span>· ${new Date(e.date).toLocaleDateString('es-CL')}</span><span>${cuotasTag}${splitTag}</span></div>
      </div>
      <div class="tx-amount">${fmtCLP(e.portion)}</div>
      <button class="tx-delete" data-delete-expense="${e.id}">🗑</button>
    </div>`;
  }).join('');
}

function renderOwed(){
  const pending = state.expenses
    .filter(e => e.splitCount > 1 && !e.splitSettled)
    .map(e => ({ id: e.id, desc: e.description || e.category, date: e.date, n: e.splitCount, owed: owedShareTotal(e) }))
    .sort((a,b) => new Date(b.date) - new Date(a.date));

  const card = document.getElementById('owed-card');
  if(pending.length === 0){ card.classList.add('hidden'); return; }
  card.classList.remove('hidden');

  const total = pending.reduce((s,p) => s + p.owed, 0);
  document.getElementById('owed-total-amount').textContent = fmtCLP(total);

  document.getElementById('owed-list').innerHTML = pending.map(p => `
    <div class="cuota-row" data-id="${p.id}" style="align-items:center;">
      <span>${escapeHtml(p.desc)} · ${new Date(p.date).toLocaleDateString('es-CL')} (÷${p.n})</span>
      <span style="display:flex;align-items:center;gap:8px;">
        <b>${fmtCLP(p.owed)}</b>
        <button class="link-btn" data-mark-paid="${p.id}">Marcar pagado</button>
      </span>
    </div>
  `).join('');
}

function renderUpcomingCuotas(){
  const rows = [];
  state.expenses.forEach(e => {
    const count = e.cuotas || 1;
    if(count <= 1) return;
    const startYM = ymKey(e.date);
    for(let i=0;i<count;i++){
      const ym = addMonthsToYM(startYM, i);
      if(monthDiff(viewYM, ym) > 0){
        rows.push({id:e.id+'-'+i, desc:e.description||e.category, ym, index:i+1, count, amount:e.amount/count});
      }
    }
  });
  rows.sort((a,b) => a.ym.localeCompare(b.ym));
  const card = document.getElementById('cuotas-card');
  if(rows.length === 0){ card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  document.getElementById('cuotas-list').innerHTML = rows.slice(0,12).map(r => {
    const {y,m} = ymParts(r.ym);
    return `<div class="cuota-row"><span style="text-transform:capitalize">${MONTH_NAMES[m-1]} ${y} — ${escapeHtml(r.desc)} (${r.index}/${r.count})</span><b>${fmtCLP(r.amount)}</b></div>`;
  }).join('');
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-mark-paid]');
  if(!btn) return;
  const id = btn.dataset.markPaid;
  state.expenses = state.expenses.map(ex => ex.id === id ? {...ex, splitSettled: true} : ex);
  saveState();
  render();
});

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Modales =====
function openModal(id){ document.getElementById(id).classList.remove('hidden'); }
function closeModal(id){ document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if(e.target === overlay) overlay.classList.add('hidden'); });
});

// ===== Formulario: registrar gasto =====
function populateSelect(select){
  select.innerHTML = CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
}
populateSelect(document.getElementById('f-category'));
populateSelect(document.getElementById('ff-category'));

const methodsGrid = document.getElementById('f-methods');
let selectedMethod = 'credito';
methodsGrid.innerHTML = METHODS.map(m =>
  `<button type="button" class="method-btn${m.id===selectedMethod?' active':''}" data-method="${m.id}"><span class="method-icon">${m.icon}</span>${m.label}</button>`
).join('');
methodsGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.method-btn');
  if(!btn) return;
  selectedMethod = btn.dataset.method;
  methodsGrid.querySelectorAll('.method-btn').forEach(b => b.classList.toggle('active', b.dataset.method === selectedMethod));
});

const cuotasToggle = document.getElementById('f-cuotas-toggle');
cuotasToggle.addEventListener('click', () => {
  const on = cuotasToggle.dataset.on === 'true';
  cuotasToggle.dataset.on = (!on).toString();
  document.getElementById('f-cuotas-count-wrap').classList.toggle('hidden', on);
});

const splitToggle = document.getElementById('f-split-toggle');
splitToggle.addEventListener('click', () => {
  const on = splitToggle.dataset.on === 'true';
  splitToggle.dataset.on = (!on).toString();
  document.getElementById('f-split-count-wrap').classList.toggle('hidden', on);
});

document.getElementById('btn-add-expense').addEventListener('click', () => {
  document.getElementById('f-amount').value = '';
  document.getElementById('f-desc').value = '';
  document.getElementById('f-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('f-category').value = CATEGORIES[0];
  selectedMethod = 'credito';
  methodsGrid.querySelectorAll('.method-btn').forEach(b => b.classList.toggle('active', b.dataset.method === selectedMethod));
  cuotasToggle.dataset.on = 'false';
  document.getElementById('f-cuotas-count-wrap').classList.add('hidden');
  document.getElementById('f-cuotas-count').value = 3;
  splitToggle.dataset.on = 'false';
  document.getElementById('f-split-count-wrap').classList.add('hidden');
  document.getElementById('f-split-count').value = 2;
  openModal('modal-expense');
});

document.getElementById('btn-save-expense').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('f-amount').value);
  if(!amount || amount <= 0){ alert('Ingresa un monto válido.'); return; }
  const date = document.getElementById('f-date').value || new Date().toISOString().slice(0,10);
  const category = document.getElementById('f-category').value;
  const description = document.getElementById('f-desc').value.trim();
  const isCuotas = cuotasToggle.dataset.on === 'true';
  const cuotas = isCuotas ? Math.max(2, parseInt(document.getElementById('f-cuotas-count').value)||2) : 1;
  const isSplit = splitToggle.dataset.on === 'true';
  const splitCount = isSplit ? Math.max(2, parseInt(document.getElementById('f-split-count').value)||2) : 1;

  state.expenses.push({ id: uid(), amount, date, category, method: selectedMethod, description, cuotas, splitCount, splitSettled: false });
  saveState();
  closeModal('modal-expense');
  render();
});

document.getElementById('transactions-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-delete-expense]');
  if(!btn) return;
  const id = btn.dataset.deleteExpense;
  state.expenses = state.expenses.filter(ex => ex.id !== id);
  saveState();
  render();
});

// ===== Costos fijos =====
function renderFixedList(){
  const list = document.getElementById('fixed-list');
  if(state.fixedCosts.length === 0){
    list.innerHTML = `<div class="empty-note">Sin costos fijos registrados (arriendo, streaming, gimnasio, etc).</div>`;
  } else {
    list.innerHTML = state.fixedCosts.map(f => `
      <div class="fixed-row" data-id="${f.id}">
        <button class="fixed-toggle" data-on="${f.active}" data-toggle-fixed="${f.id}"><span class="fixed-toggle-knob"></span></button>
        <div class="fixed-main" style="opacity:${f.active?1:0.5}">
          <div class="fixed-name">${escapeHtml(f.name)}</div>
          <div class="fixed-cat">${f.category}</div>
        </div>
        <div class="fixed-amount" style="opacity:${f.active?1:0.5}">${fmtCLP(f.amount)}</div>
        <button class="fixed-delete" data-delete-fixed="${f.id}">🗑</button>
      </div>
    `).join('');
  }
  const totalRow = document.getElementById('fixed-total-row');
  const total = state.fixedCosts.filter(f=>f.active).reduce((s,f)=>s+f.amount,0);
  if(state.fixedCosts.length > 0){
    totalRow.classList.remove('hidden');
    document.getElementById('fixed-total-amount').textContent = fmtCLP(total);
  } else {
    totalRow.classList.add('hidden');
  }
}

document.getElementById('btn-fixed-costs').addEventListener('click', () => {
  document.getElementById('ff-name').value = '';
  document.getElementById('ff-amount').value = '';
  document.getElementById('ff-category').value = CATEGORIES[0];
  renderFixedList();
  openModal('modal-fixed');
});

document.getElementById('btn-add-fixed').addEventListener('click', () => {
  const name = document.getElementById('ff-name').value.trim();
  const amount = parseFloat(document.getElementById('ff-amount').value);
  const category = document.getElementById('ff-category').value;
  if(!name || !amount){ alert('Completa nombre y monto.'); return; }
  state.fixedCosts.push({ id: uid(), name, amount, category, active: true });
  saveState();
  document.getElementById('ff-name').value = '';
  document.getElementById('ff-amount').value = '';
  renderFixedList();
  render();
});

document.getElementById('fixed-list').addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('[data-toggle-fixed]');
  if(toggleBtn){
    const id = toggleBtn.dataset.toggleFixed;
    state.fixedCosts = state.fixedCosts.map(f => f.id === id ? {...f, active: !f.active} : f);
    saveState();
    renderFixedList();
    render();
    return;
  }
  const delBtn = e.target.closest('[data-delete-fixed]');
  if(delBtn){
    const id = delBtn.dataset.deleteFixed;
    state.fixedCosts = state.fixedCosts.filter(f => f.id !== id);
    saveState();
    renderFixedList();
    render();
  }
});

// ===== Presupuesto =====
document.getElementById('btn-settings').addEventListener('click', () => {
  document.getElementById('bg-amount').value = state.budgetGoal;
  openModal('modal-budget');
});
document.getElementById('btn-save-budget').addEventListener('click', () => {
  const v = parseFloat(document.getElementById('bg-amount').value) || 0;
  state.budgetGoal = v;
  saveState();
  closeModal('modal-budget');
  render();
});

// ===== Navegación de mes =====
document.getElementById('btn-prev-month').addEventListener('click', () => { viewYM = addMonthsToYM(viewYM, -1); render(); });
document.getElementById('btn-next-month').addEventListener('click', () => { viewYM = addMonthsToYM(viewYM, 1); render(); });

// ===== Respaldo (exportar / importar) =====
document.getElementById('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `respaldo-gastos-${today}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file').click();
});
document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      if(!parsed.expenses || !parsed.fixedCosts){ throw new Error('Formato inválido'); }
      if(confirm('Esto reemplazará los datos actuales de este dispositivo por los del respaldo. ¿Continuar?')){
        state = { expenses: parsed.expenses||[], fixedCosts: parsed.fixedCosts||[], budgetGoal: parsed.budgetGoal||500000 };
        saveState();
        render();
      }
    }catch(err){
      alert('El archivo no parece un respaldo válido de esta app.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ===== Estado de conexión =====
function updateOnlineBanner(){
  document.getElementById('offline-banner').classList.toggle('hidden', navigator.onLine);
}
window.addEventListener('online', updateOnlineBanner);
window.addEventListener('offline', updateOnlineBanner);

// ===== Service worker (funcionamiento offline) =====
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.error('SW error', err));
  });
}

// ===== Inicio =====
loadState();
updateOnlineBanner();
render();
