'use strict';

// ---------- Armazenamento ----------

const STORAGE_KEY = 'meus-gastos:v1';

const DEFAULT_CATEGORIES = [
  'Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação',
  'Lazer', 'Assinaturas', 'Compras', 'Contas', 'Outros',
];

function emptyState() {
  return {
    categories: [...DEFAULT_CATEGORIES],
    // { id, name, amount, category, dueDay, startMonth, endMonth }
    fixed: [],
    // { "YYYY-MM": { [fixedId]: true } }
    payments: {},
    // { id, description, amount, category, date: "YYYY-MM-DD" }
    variable: [],
    // { "YYYY-MM": number }
    income: {},
    defaultIncome: 0,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    return emptyState();
  }
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Não foi possível salvar os dados neste navegador.');
  }
}

// ---------- Utilidades ----------

const $ = (sel) => document.querySelector(sel);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = (v) => brl.format(v || 0);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Aceita "1.234,56", "1234,56", "1234.56", "R$ 10"
function parseMoney(str) {
  let s = String(str).replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

const formatInputMoney = (n) => (n ? n.toFixed(2).replace('.', ',') : '');

const pad = (n) => String(n).padStart(2, '0');
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- Regras de negócio ----------

let currentMonth = monthKey(new Date());
let variableFilter = '';

function fixedForMonth(key) {
  return state.fixed
    .filter((f) => f.startMonth <= key && (!f.endMonth || f.endMonth >= key))
    .sort((a, b) => (a.dueDay || 99) - (b.dueDay || 99) || a.name.localeCompare(b.name));
}

function variableForMonth(key) {
  return state.variable
    .filter((v) => v.date.startsWith(key))
    .sort((a, b) => b.date.localeCompare(a.date));
}

const isPaid = (key, id) => Boolean(state.payments[key]?.[id]);

function incomeFor(key) {
  return key in state.income ? state.income[key] : state.defaultIncome || 0;
}

function totals(key) {
  const fixed = fixedForMonth(key);
  const fixedTotal = fixed.reduce((s, f) => s + f.amount, 0);
  const fixedPaid = fixed.filter((f) => isPaid(key, f.id)).reduce((s, f) => s + f.amount, 0);
  const variableTotal = variableForMonth(key).reduce((s, v) => s + v.amount, 0);
  const income = incomeFor(key);
  return {
    fixedTotal,
    fixedPaid,
    variableTotal,
    income,
    // Fixos só saem do saldo quando marcados como pagos
    balance: income - fixedPaid - variableTotal,
    // Saldo depois de pagar todos os fixos do mês
    forecast: income - fixedTotal - variableTotal,
  };
}

// Status de vencimento de um fixo não pago no mês exibido
function dueStatus(f) {
  if (!f.dueDay) return null;
  const now = monthKey(new Date());
  const day = Math.min(f.dueDay, daysInMonth(currentMonth));
  if (currentMonth < now) return { cls: 'late', text: 'atrasado' };
  if (currentMonth > now) return null;
  const diff = day - new Date().getDate();
  if (diff < 0) return { cls: 'late', text: 'atrasado' };
  if (diff === 0) return { cls: 'soon', text: 'vence hoje' };
  if (diff <= 3) return { cls: 'soon', text: `vence em ${diff} dia${diff > 1 ? 's' : ''}` };
  return null;
}

// ---------- Renderização ----------

function render() {
  $('#month-label').textContent = monthLabel(currentMonth);
  renderCards();
  renderSummary();
  renderFixed();
  renderVariable();
  renderSettings();
}

function renderCards() {
  const t = totals(currentMonth);
  $('#sum-income').textContent = money(t.income);
  $('#sum-fixed').textContent = money(t.fixedTotal);
  const pending = t.fixedTotal - t.fixedPaid;
  $('#sum-fixed-paid').textContent = pending > 0 ? `${money(pending)} a pagar` : t.fixedTotal ? 'tudo pago ✓' : '';
  $('#sum-variable').textContent = money(t.variableTotal);
  const bal = $('#sum-balance');
  bal.textContent = money(t.balance);
  bal.className = t.balance < 0 ? 'neg' : t.income ? 'pos' : '';
  $('#sum-forecast').textContent = pending > 0 ? `previsto ${money(t.forecast)}` : '';
}

function renderSummary() {
  const byCat = {};
  for (const f of fixedForMonth(currentMonth)) byCat[f.category] = (byCat[f.category] || 0) + f.amount;
  for (const v of variableForMonth(currentMonth)) byCat[v.category] = (byCat[v.category] || 0) + v.amount;
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const max = entries[0]?.[1] || 1;

  $('#category-chart').innerHTML = entries.length
    ? entries.map(([cat, val]) => `
        <div class="bar-row">
          <span>${escapeHtml(cat)}</span>
          <span class="bar-value">${money(val)} · ${Math.round((val / total) * 100)}%</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(val / max) * 100}%"></div></div>
        </div>`).join('')
    : '<p class="hint">Nenhum gasto neste mês ainda.</p>';

  const pending = fixedForMonth(currentMonth).filter((f) => !isPaid(currentMonth, f.id));
  $('#pending-list').innerHTML = pending.length
    ? pending.map(fixedItemHtml).join('')
    : `<li class="empty">${fixedForMonth(currentMonth).length ? 'Tudo pago neste mês 🎉' : 'Nenhum gasto fixo cadastrado.'}</li>`;
}

function fixedItemHtml(f) {
  const paid = isPaid(currentMonth, f.id);
  const status = paid ? null : dueStatus(f);
  const sub = [
    escapeHtml(f.category),
    f.dueDay ? `dia ${f.dueDay}` : null,
    status ? `<span class="${status.cls}">${status.text}</span>` : null,
  ].filter(Boolean).join(' · ');
  return `
    <li class="item ${paid ? 'paid' : ''}">
      <button class="pay-toggle ${paid ? 'on' : ''}" data-pay="${f.id}" aria-label="${paid ? 'Desmarcar pagamento' : 'Marcar como pago'}">${paid ? '✓' : ''}</button>
      <div class="item-main" data-edit-fixed="${f.id}">
        <div class="item-title">${escapeHtml(f.name)}</div>
        <div class="item-sub">${sub}</div>
      </div>
      <span class="item-amount">${money(f.amount)}</span>
    </li>`;
}

function renderFixed() {
  const list = fixedForMonth(currentMonth);
  $('#fixed-list').innerHTML = list.length
    ? list.map(fixedItemHtml).join('')
    : '<li class="empty">Nenhum gasto fixo neste mês. Toque em “+ Novo fixo”.</li>';
}

function renderVariable() {
  const sel = $('#variable-filter');
  sel.innerHTML = `<option value="">Todas as categorias</option>` +
    state.categories.map((c) => `<option ${c === variableFilter ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');

  const list = variableForMonth(currentMonth).filter((v) => !variableFilter || v.category === variableFilter);
  if (!list.length) {
    $('#variable-list').innerHTML = '<li class="empty">Nenhum gasto variável. Toque no “+” para adicionar.</li>';
    return;
  }
  let html = '';
  let lastDate = '';
  for (const v of list) {
    if (v.date !== lastDate) {
      lastDate = v.date;
      const [y, m, d] = v.date.split('-').map(Number);
      const label = new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
      html += `<li class="day-head">${label}</li>`;
    }
    html += `
      <li class="item">
        <div class="item-main" data-edit-variable="${v.id}">
          <div class="item-title">${escapeHtml(v.description)}</div>
          <div class="item-sub">${escapeHtml(v.category)}</div>
        </div>
        <span class="item-amount">${money(v.amount)}</span>
      </li>`;
  }
  $('#variable-list').innerHTML = html;
}

function renderSettings() {
  $('#category-list').innerHTML = state.categories
    .map((c, i) => `<li>${escapeHtml(c)}<button data-del-cat="${i}" aria-label="Remover ${escapeHtml(c)}">×</button></li>`)
    .join('');
}

function fillCategorySelect(select, selected) {
  const cats = [...state.categories];
  if (selected && !cats.includes(selected)) cats.push(selected);
  select.innerHTML = cats.map((c) => `<option ${c === selected ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
}

// ---------- Diálogos ----------

let editingFixedId = null;
let editingVariableId = null;

function openFixedDialog(id = null) {
  editingFixedId = id;
  const f = id ? state.fixed.find((x) => x.id === id) : null;
  const form = $('#fixed-form');
  form.reset();
  $('#fixed-dialog-title').textContent = f ? 'Editar gasto fixo' : 'Novo gasto fixo';
  form.name.value = f?.name || '';
  form.amount.value = f ? formatInputMoney(f.amount) : '';
  form.dueDay.value = f?.dueDay || '';
  fillCategorySelect(form.category, f?.category || 'Moradia');
  $('#fixed-delete').hidden = !f;
  $('#fixed-dialog').showModal();
}

function openVariableDialog(id = null) {
  editingVariableId = id;
  const v = id ? state.variable.find((x) => x.id === id) : null;
  const form = $('#variable-form');
  form.reset();
  $('#variable-dialog-title').textContent = v ? 'Editar gasto' : 'Novo gasto variável';
  form.description.value = v?.description || '';
  form.amount.value = v ? formatInputMoney(v.amount) : '';
  // Novo gasto: hoje se estiver no mês atual, senão dia 1 do mês exibido
  form.date.value = v?.date || (todayISO().startsWith(currentMonth) ? todayISO() : `${currentMonth}-01`);
  fillCategorySelect(form.category, v?.category || 'Alimentação');
  $('#variable-delete').hidden = !v;
  $('#variable-dialog').showModal();
}

$('#fixed-form').addEventListener('submit', (e) => {
  const form = e.target;
  const amount = parseMoney(form.amount.value);
  if (!(amount > 0)) {
    e.preventDefault();
    toast('Informe um valor válido.');
    return;
  }
  const data = {
    name: form.name.value.trim(),
    amount,
    category: form.category.value,
    dueDay: Number(form.dueDay.value) || null,
  };
  if (editingFixedId) {
    Object.assign(state.fixed.find((f) => f.id === editingFixedId), data);
  } else {
    state.fixed.push({ id: uid(), ...data, startMonth: currentMonth, endMonth: null });
  }
  save();
  render();
  toast('Gasto fixo salvo.');
});

$('#fixed-delete').addEventListener('click', () => {
  const f = state.fixed.find((x) => x.id === editingFixedId);
  if (!f) return;
  const ok = confirm(`Encerrar "${f.name}" a partir de ${monthLabel(currentMonth)}?\nOs meses anteriores continuam no histórico.`);
  if (!ok) return;
  const end = shiftMonth(currentMonth, -1);
  if (end < f.startMonth) {
    // Nunca chegou a valer em mês anterior: remove de vez
    state.fixed = state.fixed.filter((x) => x.id !== f.id);
    for (const m of Object.values(state.payments)) delete m[f.id];
  } else {
    f.endMonth = end;
  }
  save();
  $('#fixed-dialog').close();
  render();
  toast('Gasto fixo encerrado.');
});

$('#variable-form').addEventListener('submit', (e) => {
  const form = e.target;
  const amount = parseMoney(form.amount.value);
  if (!(amount > 0)) {
    e.preventDefault();
    toast('Informe um valor válido.');
    return;
  }
  const data = {
    description: form.description.value.trim(),
    amount,
    category: form.category.value,
    date: form.date.value,
  };
  if (editingVariableId) {
    Object.assign(state.variable.find((v) => v.id === editingVariableId), data);
  } else {
    state.variable.push({ id: uid(), ...data });
  }
  save();
  render();
  toast('Gasto salvo.');
});

$('#variable-delete').addEventListener('click', () => {
  if (!confirm('Excluir este gasto?')) return;
  state.variable = state.variable.filter((v) => v.id !== editingVariableId);
  save();
  $('#variable-dialog').close();
  render();
  toast('Gasto excluído.');
});

$('#edit-income').addEventListener('click', () => {
  const form = $('#income-form');
  form.reset();
  form.amount.value = formatInputMoney(incomeFor(currentMonth));
  $('#income-dialog').showModal();
});

$('#income-form').addEventListener('submit', (e) => {
  const form = e.target;
  const amount = form.amount.value.trim() ? parseMoney(form.amount.value) : 0;
  if (!(amount >= 0)) {
    e.preventDefault();
    toast('Informe um valor válido.');
    return;
  }
  state.income[currentMonth] = amount;
  if (form.default.checked) state.defaultIncome = amount;
  save();
  render();
});

document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => b.closest('dialog').close()));

// ---------- Eventos gerais ----------

$('#prev-month').addEventListener('click', () => { currentMonth = shiftMonth(currentMonth, -1); render(); });
$('#next-month').addEventListener('click', () => { currentMonth = shiftMonth(currentMonth, 1); render(); });

document.querySelectorAll('.tabs button').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${btn.dataset.tab}`));
  }));

$('#add-fixed').addEventListener('click', () => openFixedDialog());
$('#add-variable').addEventListener('click', () => openVariableDialog());
$('#fab').addEventListener('click', () => openVariableDialog());

$('#variable-filter').addEventListener('change', (e) => { variableFilter = e.target.value; renderVariable(); });

document.addEventListener('click', (e) => {
  const pay = e.target.closest('[data-pay]');
  if (pay) {
    const id = pay.dataset.pay;
    const month = (state.payments[currentMonth] ||= {});
    if (month[id]) delete month[id];
    else month[id] = true;
    save();
    render();
    return;
  }
  const ef = e.target.closest('[data-edit-fixed]');
  if (ef) return openFixedDialog(ef.dataset.editFixed);
  const ev = e.target.closest('[data-edit-variable]');
  if (ev) return openVariableDialog(ev.dataset.editVariable);
  const dc = e.target.closest('[data-del-cat]');
  if (dc) {
    const name = state.categories[Number(dc.dataset.delCat)];
    if (state.categories.length <= 1) return toast('Mantenha pelo menos uma categoria.');
    if (!confirm(`Remover a categoria "${name}"? Gastos já lançados mantêm o nome.`)) return;
    state.categories.splice(Number(dc.dataset.delCat), 1);
    if (variableFilter === name) variableFilter = '';
    save();
    render();
  }
});

$('#category-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#category-name').value.trim();
  if (!name) return;
  if (state.categories.some((c) => c.toLowerCase() === name.toLowerCase())) return toast('Essa categoria já existe.');
  state.categories.push(name);
  $('#category-name').value = '';
  save();
  render();
});

// ---------- Backup / exportação ----------

async function download(filename, content, type) {
  // No iPhone (app na tela de início) o download direto não funciona bem:
  // usa a folha de compartilhamento para salvar em Arquivos, enviar por WhatsApp etc.
  const file = new File([content], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#export-json').addEventListener('click', () => {
  download(`meus-gastos-backup-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
});

$('#import-json').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.fixed) || !Array.isArray(data.variable)) throw new Error('formato');
    if (!confirm('Importar este backup substituirá os dados atuais. Continuar?')) return;
    state = { ...emptyState(), ...data };
    save();
    render();
    toast('Backup importado.');
  } catch {
    toast('Arquivo de backup inválido.');
  }
});

$('#export-csv').addEventListener('click', () => {
  const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const num = (n) => n.toFixed(2).replace('.', ',');
  const rows = [['Tipo', 'Data/Vencimento', 'Descrição', 'Categoria', 'Valor', 'Pago']];
  for (const f of fixedForMonth(currentMonth)) {
    rows.push(['Fixo', f.dueDay ? `${currentMonth}-${pad(f.dueDay)}` : currentMonth, f.name, f.category, num(f.amount), isPaid(currentMonth, f.id) ? 'Sim' : 'Não']);
  }
  for (const v of variableForMonth(currentMonth)) {
    rows.push(['Variável', v.date, v.description, v.category, num(v.amount), 'Sim']);
  }
  // ";" e BOM para abrir corretamente no Excel em português
  const csv = '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
  download(`gastos-${currentMonth}.csv`, csv, 'text/csv;charset=utf-8');
});

$('#reset-all').addEventListener('click', () => {
  if (!confirm('Apagar TODOS os dados? Essa ação não pode ser desfeita.')) return;
  state = emptyState();
  save();
  render();
  toast('Dados apagados.');
});

// ---------- Inicialização ----------

render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
