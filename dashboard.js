// ============================================
// DASHBOARD.JS v5.0 — ISIS AI CRM
// Melhorias: sem alert(), toast notifications,
// visibilityAPI para auto-refresh inteligente,
// export correto, webhook URL correta
// ============================================

const API_URL = 'https://isis-ai-agent.vercel.app';
let leads = [];
let selectedLead = null;
let currentFilter = 'all';
let searchQuery = '';
let refreshInterval = null;

const token = localStorage.getItem('crm_token');
const companyData = JSON.parse(localStorage.getItem('crm_company') || '{}');

if (!token) window.location.href = 'index.html';

const STATUS_EMOJIS = {
    'novo': '🆕',
    'em_atendimento': '🔥',
    'convertido': '💰',
    'perdido': '❌',
    'agendado': '📅'
};

const STATUS_LABELS = {
    'novo': 'Novo',
    'em_atendimento': 'Em Conversa',
    'convertido': 'Fechado',
    'perdido': 'Perdido',
    'agendado': 'Agendado'
};

// ============================================
// TOAST — substitui alert()
// ============================================
function toast(message, type = 'info', duration = 3500) {
    const existing = document.getElementById('isis-toast');
    if (existing) existing.remove();

    const colors = {
        success: '#10b981',
        error:   '#ef4444',
        info:    '#6366f1',
        warn:    '#f59e0b'
    };

    const t = document.createElement('div');
    t.id = 'isis-toast';
    t.style.cssText = `
        position:fixed; bottom:30px; right:30px; z-index:9999;
        background:${colors[type] || colors.info};
        color:white; padding:14px 20px; border-radius:12px;
        font-size:14px; font-weight:600; max-width:320px;
        box-shadow:0 8px 32px rgba(0,0,0,0.4);
        animation:fadeIn .2s ease;
        cursor:pointer;
    `;
    t.textContent = message;
    t.onclick = () => t.remove();
    document.body.appendChild(t);
    setTimeout(() => t?.remove(), duration);
}

// ============================================
// UTILS
// ============================================
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================
// INIT
// ============================================
function init() {
    const el = document.getElementById('companyName');
    if (el) el.textContent = companyData.name || 'Empresa';
    updateWebhookInfo();
    loadLeads();
    startAutoRefresh();
}

// ✅ Auto-refresh inteligente — pausa quando aba está oculta
function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        if (!document.hidden) loadLeads();
    }, 120000);
}

// ============================================
// NAVEGAÇÃO
// ============================================
function switchTab(tabId) {
    document.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById('tab-' + tabId);
    const btn = document.getElementById('btn-' + tabId);
    if (tab) tab.classList.add('active');
    if (btn) btn.classList.add('active');
}

function setFilter(filter) {
    currentFilter = filter;
    switchTab('dashboard');
    renderAll();
}

// ============================================
// CARREGAR LEADS
// ============================================
async function loadLeads() {
    const list = document.getElementById('leadsList');
    if (list) list.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">Carregando...</div>';

    try {
        const res = await fetch(API_URL + '/api/leads', {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (res.status === 401) return logout();

        if (!res.ok) {
            const errText = await res.text();
            console.error('Erro API leads:', res.status, errText);
            if (list) list.innerHTML = `<div style="text-align:center;padding:40px;color:#f87171;">Erro ${res.status} ao carregar leads.</div>`;
            return;
        }

        const data = await res.json();
        leads = data.leads || [];

        if (leads.length === 0 && list) {
            list.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8;">
                <div style="font-size:32px;margin-bottom:10px;">📭</div>
                Nenhum lead no banco ainda.<br>
                <small style="color:#64748b;">Use o webhook para cadastrar o primeiro lead.</small>
            </div>`;
        }

        renderAll();

    } catch(err) {
        console.error('Erro ao carregar leads:', err);
        if (list) list.innerHTML = `<div style="text-align:center;padding:40px;color:#f87171;">
            Falha de conexão com a API.<br><small>${escapeHtml(err.message)}</small>
        </div>`;
    }
}

// ============================================
// RENDER
// ============================================
function renderAll() {
    renderStats();
    renderLeadsList();
    renderTable();
    renderKanban();
}

function renderStats() {
    const s = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.textContent = v;
    };
    s('statTotal', leads.length);
    s('statNovos', leads.filter(l => l.status === 'novo').length);
    s('statAtendimento', leads.filter(l => l.status === 'em_atendimento').length);
    s('statConvertidos', leads.filter(l => l.status === 'convertido').length);
}

function renderLeadsList() {
    const list = document.getElementById('leadsList');
    if (!list) return;

    let filtered = currentFilter === 'all'
        ? leads
        : leads.filter(l => l.status === currentFilter);

    if (searchQuery) {
        filtered = filtered.filter(l =>
            (l.name     || '').toLowerCase().includes(searchQuery) ||
            (l.phone    || '').replace(/\D/g,'').includes(searchQuery.replace(/\D/g,'')) ||
            (l.interesse|| '').toLowerCase().includes(searchQuery) ||
            (l.email    || '').toLowerCase().includes(searchQuery)
        );
    }

    const countEl = document.getElementById('countCurrent');
    if (countEl) countEl.textContent = filtered.length;

    if (!filtered.length) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;"><div style="font-size:40px;margin-bottom:10px;">👻</div>Nenhum lead aqui...</div>';
        return;
    }

    list.innerHTML = '';
    filtered.forEach(l => {
        const card = document.createElement('div');
        card.className = `lead-card ${selectedLead?.id === l.id ? 'selected' : ''}`;
        card.style.cssText = 'cursor:pointer;padding:15px;margin-bottom:10px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.1);';
        card.onclick = () => selectLead(l.id);

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;';

        const nameSpan = document.createElement('span');
        nameSpan.style.fontWeight = '600';
        nameSpan.textContent = (STATUS_EMOJIS[l.status] || '❓') + ' ' + l.name;

        header.appendChild(nameSpan);

        if (l.temperature === 'quente') {
            const fire = document.createElement('span');
            fire.textContent = '🔥';
            header.appendChild(fire);
        }

        const phoneDiv = document.createElement('div');
        phoneDiv.style.cssText = 'font-size:13px;color:#94a3b8;';
        phoneDiv.textContent = '📱 ' + l.phone;

        card.appendChild(header);
        card.appendChild(phoneDiv);
        list.appendChild(card);
    });
}

function renderTable() {
    const body = document.getElementById('tableBody');
    if (!body) return;

    body.innerHTML = '';
    leads.forEach(l => {
        const row = document.createElement('tr');

        const td1 = document.createElement('td');
        td1.textContent = l.name;

        const td2 = document.createElement('td');
        td2.textContent = l.phone;

        const td3 = document.createElement('td');
        td3.textContent = (STATUS_EMOJIS[l.status] || '❓') + ' ' + (STATUS_LABELS[l.status] || l.status);

        const td4 = document.createElement('td');
        td4.style.cssText = 'font-family:monospace;font-size:11px;';
        td4.textContent = l.signature_key || '-';

        const td5 = document.createElement('td');
        const btn = document.createElement('button');
        btn.textContent = 'Ver';
        btn.style.cssText = 'background:#6366f1;color:white;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;';
        btn.onclick = () => selectLead(l.id);
        td5.appendChild(btn);

        row.appendChild(td1);
        row.appendChild(td2);
        row.appendChild(td3);
        row.appendChild(td4);
        row.appendChild(td5);
        body.appendChild(row);
    });
}

function renderKanban() {
    const cols = {
        'novo': document.getElementById('col-novo'),
        'em_atendimento': document.getElementById('col-atendimento'),
        'convertido': document.getElementById('col-convertido')
    };

    Object.values(cols).forEach(c => { if (c) c.innerHTML = ''; });

    leads.forEach(l => {
        if (!cols[l.status]) return;

        const temp = l.temperature === 'quente' ? '🔥' :
                     l.temperature === 'morno'  ? '🌤️' : '❄️';

        const card = document.createElement('div');
        card.className = 'kanban-card';
        card.style.cssText = 'padding:15px;margin-bottom:10px;background:#1e293b;border-radius:8px;cursor:pointer;';
        card.onclick = () => selectLead(l.id);

        const strong = document.createElement('strong');
        strong.textContent = l.name;

        const small = document.createElement('small');
        small.style.cssText = 'display:block;color:#64748b;margin-top:5px;';
        small.textContent = temp + ' ' + l.phone;

        card.appendChild(strong);
        card.appendChild(small);
        cols[l.status].appendChild(card);
    });
}

// ============================================
// SELECIONAR LEAD
// ============================================
function selectLead(id) {
    selectedLead = leads.find(l => l.id === id);
    if (!selectedLead) return;

    switchTab('dashboard');
    renderLeadsList();

    const tempBadge = selectedLead.temperature === 'quente' ? '🔥 Quente' :
                      selectedLead.temperature === 'morno'  ? '🌤️ Morno' : '❄️ Frio';

    const phoneClean = String(selectedLead.phone).replace(/\D/g, '');
    const panel = document.getElementById('detailPanel');
    panel.innerHTML = '';

    const container = document.createElement('div');
    container.style.padding = '30px';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:25px;';

    const infoDiv = document.createElement('div');

    const h2 = document.createElement('h2');
    h2.style.cssText = 'margin:0;font-size:24px;';
    h2.textContent = selectedLead.name;

    const phoneP = document.createElement('p');
    phoneP.style.cssText = 'color:#64748b;margin:5px 0 0 0;';
    phoneP.textContent = '📱 ' + selectedLead.phone;

    const tempSpan = document.createElement('span');
    tempSpan.style.cssText = 'display:inline-block;margin-top:10px;padding:4px 10px;background:rgba(255,255,255,0.1);border-radius:20px;font-size:12px;';
    tempSpan.textContent = tempBadge;

    infoDiv.appendChild(h2);
    infoDiv.appendChild(phoneP);
    infoDiv.appendChild(tempSpan);

    const aiBtn = document.createElement('button');
    aiBtn.id = 'btn-ai';
    aiBtn.textContent = '✨ Analisar com Isis';
    aiBtn.style.cssText = 'background:linear-gradient(135deg,#6366f1,#a855f7);color:white;border:none;padding:12px 24px;border-radius:30px;font-weight:bold;cursor:pointer;';
    aiBtn.onclick = analisarLead;

    header.appendChild(infoDiv);
    header.appendChild(aiBtn);

    // AI Result
    const aiResult = document.createElement('div');
    aiResult.id = 'ai-result';
    aiResult.style.cssText = 'display:none;margin-bottom:20px;padding:20px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:16px;';

    const aiContent = document.createElement('div');
    aiContent.id = 'ai-content';

    const msgBtn = document.createElement('button');
    msgBtn.id = 'btn-msg';
    msgBtn.textContent = '💬 Gerar Mensagem WhatsApp';
    msgBtn.style.cssText = 'width:100%;margin-top:15px;padding:15px;background:#25d366;color:white;border:none;border-radius:12px;font-weight:bold;cursor:pointer;font-size:15px;';
    msgBtn.onclick = gerarMensagem;

    aiResult.appendChild(aiContent);
    aiResult.appendChild(msgBtn);

    // Interesse
    const interesseDiv = document.createElement('div');
    interesseDiv.style.cssText = 'background:rgba(0,0,0,0.2);padding:20px;border-radius:12px;margin-bottom:20px;';

    const interesseLabel = document.createElement('label');
    interesseLabel.style.cssText = 'color:#6366f1;font-size:11px;font-weight:bold;text-transform:uppercase;';
    interesseLabel.textContent = '📝 Interesse';

    const interesseP = document.createElement('p');
    interesseP.id = 'txt-interesse';
    interesseP.style.cssText = 'margin-top:10px;color:#cbd5e1;';
    interesseP.textContent = selectedLead.interesse || 'Sem notas...';

    interesseDiv.appendChild(interesseLabel);
    interesseDiv.appendChild(interesseP);

    // Actions
    const actionsDiv = document.createElement('div');
    actionsDiv.style.cssText = 'display:flex;gap:10px;';

    const waLink = document.createElement('a');
    waLink.href = 'https://wa.me/' + phoneClean;
    waLink.target = '_blank';
    waLink.textContent = '💬 Abrir WhatsApp';
    waLink.style.cssText = 'flex:2;background:#25d366;color:white;text-align:center;padding:15px;border-radius:12px;text-decoration:none;font-weight:bold;';

    const statusSelect = document.createElement('select');
    statusSelect.style.cssText = 'flex:1;background:#1e293b;color:white;border-radius:12px;border:1px solid rgba(255,255,255,0.1);padding:10px;cursor:pointer;';
    statusSelect.onchange = function() { atualizarStatus(selectedLead.id, this.value); };

    const options = [
        { value: '', text: '⚡️ Status' },
        { value: 'novo', text: '🆕 Novo' },
        { value: 'em_atendimento', text: '🔥 Em Conversa' },
        { value: 'convertido', text: '💰 Fechado' },
        { value: 'perdido', text: '❌ Perdido' }
    ];

    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        if (opt.value === selectedLead.status) option.selected = true;
        statusSelect.appendChild(option);
    });

    actionsDiv.appendChild(waLink);
    actionsDiv.appendChild(statusSelect);

    container.appendChild(header);
    container.appendChild(aiResult);
    container.appendChild(interesseDiv);
    container.appendChild(actionsDiv);
    panel.appendChild(container);
}

// ============================================
// ANALISAR LEAD COM IA
// ============================================
async function analisarLead() {
    const btn = document.getElementById('btn-ai');
    if (!btn) return;
    btn.textContent = '🧠 Analisando...';
    btn.disabled = true;

    try {
        const res = await fetch(API_URL + '/api/ai?action=analyze', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                leadName: selectedLead.name,
                leadInteresse: selectedLead.interesse || 'Interesse não especificado'
            })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Erro na análise');

        const r = data.data;
        const colors = { 'Frio': '#3b82f6', 'Morno': '#f59e0b', 'Quente': '#ef4444' };
        const color = colors[r.temperatura] || '#64748b';

        const aiContent = document.getElementById('ai-content');
        aiContent.innerHTML = '';

        const headerDiv = document.createElement('div');
        headerDiv.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:15px;';

        const tempBadge = document.createElement('span');
        tempBadge.style.cssText = `background:${color};color:white;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:bold;`;
        tempBadge.textContent = r.temperaturaEmoji + ' ' + r.temperatura;

        const scoreBadge = document.createElement('span');
        scoreBadge.style.cssText = 'font-size:20px;font-weight:800;color:#fbbf24;';
        scoreBadge.textContent = r.score + '/100';

        headerDiv.appendChild(tempBadge);
        headerDiv.appendChild(scoreBadge);

        const resumoP = document.createElement('p');
        resumoP.style.cssText = 'font-size:16px;margin-bottom:15px;color:#f1f5f9;';
        resumoP.textContent = r.resumo;

        const gridDiv = document.createElement('div');
        gridDiv.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:15px;';

        // Dor
        const dorDiv = document.createElement('div');
        dorDiv.style.cssText = 'background:rgba(0,0,0,0.2);padding:12px;border-radius:8px;border-left:3px solid #ef4444;';
        const dorLabel = document.createElement('small');
        dorLabel.style.cssText = 'color:#ef4444;font-size:10px;font-weight:bold;';
        dorLabel.textContent = '🤕 DOR';
        const dorP = document.createElement('p');
        dorP.style.cssText = 'font-size:12px;margin:5px 0 0 0;color:#cbd5e1;';
        dorP.textContent = r.principalDor;
        dorDiv.appendChild(dorLabel);
        dorDiv.appendChild(dorP);

        // Objeção
        const objecaoDiv = document.createElement('div');
        objecaoDiv.style.cssText = 'background:rgba(0,0,0,0.2);padding:12px;border-radius:8px;border-left:3px solid #fbbf24;';
        const objecaoLabel = document.createElement('small');
        objecaoLabel.style.cssText = 'color:#fbbf24;font-size:10px;font-weight:bold;';
        objecaoLabel.textContent = '⚠️ OBJEÇÃO';
        const objecaoP = document.createElement('p');
        objecaoP.style.cssText = 'font-size:12px;margin:5px 0 0 0;color:#cbd5e1;';
        objecaoP.textContent = r.objecaoProvavel;
        objecaoDiv.appendChild(objecaoLabel);
        objecaoDiv.appendChild(objecaoP);

        gridDiv.appendChild(dorDiv);
        gridDiv.appendChild(objecaoDiv);

        // Estratégia
        const estrategiaDiv = document.createElement('div');
        estrategiaDiv.style.cssText = 'background:rgba(99,102,241,0.1);padding:15px;border-radius:8px;';
        const estrategiaLabel = document.createElement('small');
        estrategiaLabel.style.cssText = 'color:#818cf8;font-size:10px;font-weight:bold;';
        estrategiaLabel.textContent = '🎯 ESTRATÉGIA';
        const estrategiaP = document.createElement('p');
        estrategiaP.style.cssText = 'font-size:13px;margin:5px 0 0 0;color:#e2e8f0;';
        estrategiaP.textContent = r.sugestaoAbordagem;
        const momentoSmall = document.createElement('small');
        momentoSmall.style.cssText = 'color:#64748b;display:block;margin-top:8px;';
        momentoSmall.textContent = '⏰ ' + r.momentoIdeal;
        estrategiaDiv.appendChild(estrategiaLabel);
        estrategiaDiv.appendChild(estrategiaP);
        estrategiaDiv.appendChild(momentoSmall);

        aiContent.appendChild(headerDiv);
        aiContent.appendChild(resumoP);
        aiContent.appendChild(gridDiv);
        aiContent.appendChild(estrategiaDiv);

        document.getElementById('ai-result').style.display = 'block';

        if (r.temperatura) {
            selectedLead.temperature = r.temperatura.toLowerCase();
            renderLeadsList();
        }

    } catch(err) {
        console.error('Erro análise:', err);
        toast('😅 Erro na análise. Tente novamente!', 'error');
    } finally {
        btn.textContent = '✨ Analisar com Isis';
        btn.disabled = false;
    }
}

// ============================================
// GERAR MENSAGEM WHATSAPP
// ============================================
async function gerarMensagem() {
    const btn = document.getElementById('btn-msg');
    if (!btn) return;
    btn.textContent = '✍️ Escrevendo...';
    btn.disabled = true;

    try {
        const res = await fetch(API_URL + '/api/ai?action=message', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                leadName: selectedLead.name,
                leadInteresse: selectedLead.interesse || 'Soluções de vendas'
            })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Erro ao gerar mensagem');

        const msg = data.data.message;
        const phoneClean = String(selectedLead.phone).replace(/\D/g, '');

        // Copiar para clipboard ANTES de abrir WhatsApp
        let clipOk = false;
        try {
            await navigator.clipboard.writeText(msg);
            clipOk = true;
        } catch(e) {
            try {
                const ta = document.createElement('textarea');
                ta.value = msg;
                ta.style.cssText = 'position:fixed;opacity:0;';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                clipOk = true;
            } catch(e2) { console.warn('Clipboard falhou:', e2); }
        }

        // Abrir WhatsApp com NFC normalize
        const wppUrl = 'https://api.whatsapp.com/send?phone=' + phoneClean
                     + '&text=' + encodeURIComponent(msg.normalize('NFC'));
        window.open(wppUrl, '_blank');

        // Preview da mensagem
        const aiResult = document.getElementById('ai-result');
        const old = document.getElementById('msg-preview');
        if (old) old.remove();

        const preview = document.createElement('div');
        preview.id = 'msg-preview';
        preview.style.cssText = 'margin-top:15px;border-radius:12px;overflow:hidden;';

        const banner = document.createElement('div');
        banner.style.cssText = 'background:#1d4ed8;padding:10px 15px;font-size:12px;font-weight:bold;color:white;';
        banner.textContent = clipOk
            ? '✅ Mensagem carregada no WhatsApp + copiada no clipboard como backup!'
            : '⚠️ Mensagem carregada no WhatsApp. Se não aparecer, copie abaixo.';

        const msgDiv = document.createElement('div');
        msgDiv.style.cssText = 'padding:15px;background:rgba(37,211,102,0.1);border:1px solid rgba(37,211,102,0.3);white-space:pre-wrap;font-size:13px;color:#d1fae5;line-height:1.6;cursor:pointer;';
        msgDiv.title = 'Clique para copiar novamente';
        msgDiv.textContent = msg;
        msgDiv.onclick = async () => {
            try {
                await navigator.clipboard.writeText(msg);
                banner.textContent = '✅ Copiado novamente!';
                toast('✅ Copiado!', 'success', 2000);
            } catch(e) {}
        };

        preview.appendChild(banner);
        preview.appendChild(msgDiv);
        aiResult.appendChild(preview);

        btn.textContent = '✅ Mensagem gerada!';
        setTimeout(() => {
            btn.textContent = '💬 Gerar Mensagem WhatsApp';
            btn.disabled = false;
        }, 4000);

    } catch(err) {
        console.error('Erro mensagem:', err);
        toast('😅 Erro ao gerar mensagem', 'error');
        btn.textContent = '💬 Gerar Mensagem WhatsApp';
        btn.disabled = false;
    }
}

// ============================================
// ATUALIZAR STATUS
// ============================================
async function atualizarStatus(id, status) {
    if (!status) return;

    try {
        const res = await fetch(API_URL + '/api/leads', {
            method: 'PATCH',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id, status })
        });

        if (!res.ok) throw new Error('HTTP ' + res.status);

        toast('✅ Status atualizado!', 'success', 2000);
        loadLeads();

    } catch(err) {
        console.error('Erro status:', err);
        toast('❌ Erro ao atualizar status', 'error');
    }
}

// ============================================
// BUSCA
// ============================================
function filterDashboard() {
    const input = document.getElementById('searchDashboard');
    searchQuery = (input?.value || '').toLowerCase().trim();
    renderLeadsList();
}

function filterLeadsTable() {
    const search = (document.getElementById('searchLeads')?.value || '').toLowerCase();
    document.querySelectorAll('#tableBody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(search) ? '' : 'none';
    });
}

// ============================================
// WEBHOOK
// ============================================
function updateWebhookInfo() {
    const input = document.getElementById('webhookUrl');
    if (input && companyData.id) {
        // URL correta para receber leads externos (Typebot, site, etc.)
        input.value = API_URL + '/api/leads';
    }
}

function copyWebhook() {
    const input = document.getElementById('webhookUrl');
    if (!input) return;

    navigator.clipboard.writeText(input.value)
        .then(() => toast('✅ URL copiada!', 'success', 2000))
        .catch(() => {
            input.select();
            document.execCommand('copy');
            toast('✅ URL copiada!', 'success', 2000);
        });
}

// ============================================
// EXPORT / BACKUP
// ============================================
async function exportarDados() {
    try {
        const res = await fetch(API_URL + '/api/leads', {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();

        // Formata com metadata de exportação
        const exportData = {
            exportedAt: new Date().toISOString(),
            company: companyData.name,
            totalLeads: data.leads?.length || 0,
            leads: data.leads || []
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'isis-backup-' + new Date().toISOString().split('T')[0] + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast(`✅ Backup de ${exportData.totalLeads} leads exportado!`, 'success');

    } catch(err) {
        console.error('Erro exportar:', err);
        toast('❌ Erro ao exportar dados', 'error');
    }
}

// ============================================
// LOGOUT
// ============================================
function logout() {
    fetch(API_URL + '/api/auth?action=logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .catch(() => {})
    .finally(() => {
        localStorage.clear();
        window.location.href = 'index.html';
    });
}

// ============================================
// EXPOR FUNÇÕES GLOBAIS
// ============================================
window.switchTab      = switchTab;
window.setFilter      = setFilter;
window.selectLead     = selectLead;
window.analisarLead   = analisarLead;
window.gerarMensagem  = gerarMensagem;
window.atualizarStatus= atualizarStatus;
window.copyWebhook    = copyWebhook;
window.logout         = logout;
window.loadLeads      = loadLeads;
window.filterLeadsTable = filterLeadsTable;
window.filterDashboard  = filterDashboard;
window.exportarDados    = exportarDados;

document.addEventListener('DOMContentLoaded', init);
