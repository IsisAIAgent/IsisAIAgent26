// ============================================
// api/ai.js v6.3 — CORS FIX + Lógica completa
// ============================================

const E = {
  mao:        String.fromCodePoint(0x1F44B),
  foguete:    String.fromCodePoint(0x1F680),
  estrela:    String.fromCodePoint(0x2728),
  fogo:       String.fromCodePoint(0x1F525),
  neve:       String.fromCodePoint(0x2744, 0xFE0F),
  sorriso:    String.fromCodePoint(0x1F60A),
  raio:       String.fromCodePoint(0x26A1),
  dinheiro:   String.fromCodePoint(0x1F4B0),
  calendario: String.fromCodePoint(0x1F4C5),
  traco:      String.fromCodePoint(0x2014),
  lampada:    String.fromCodePoint(0x1F4A1),
};

function sendJSON(res, status, data) {
  const buffer = Buffer.from(JSON.stringify(data), 'utf-8');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
  return res.status(status).end(buffer);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return sendJSON(res, 405, { success: false, error: 'Use POST' });

  try {
    const resultado = await processarRequisicao(req);
    return sendJSON(res, resultado.status, resultado.body);
  } catch (err) {
    console.error('ERRO CRITICO:', err);
    return sendJSON(res, 500, { success: false, error: 'Erro interno', data: null });
  }
}

async function processarRequisicao(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || token.split('.').length !== 3) {
    return { status: 401, body: { success: false, error: 'Nao autorizado' } };
  }

  const { action } = req.query || {};
  const { leadName, leadInteresse } = req.body || {};

  if (!leadName || !leadInteresse) {
    return { status: 400, body: { success: false, error: 'Dados obrigatorios' } };
  }

  if (action === 'analyze') {
    const data = await analisarLead(leadName, leadInteresse);
    return { status: 200, body: { success: true, data } };
  }

  if (action === 'message') {
    const message = await gerarMensagem(leadName, leadInteresse);
    return { status: 200, body: { success: true, data: { message } } };
  }

  return { status: 400, body: { success: false, error: 'Action invalida' } };
}

const RAG = {
  audiovisual: { dores: ['Clientes nao entendem valor do video'], gatilhos: ['video', 'filme'], abordagem: 'focar em ROI' },
  imobiliario: { dores: ['Lead frio nao visita imovel'], gatilhos: ['imovel', 'casa'], abordagem: 'criar urgencia' },
  saas:        { dores: ['Demo sem conversao'], gatilhos: ['software', 'sistema'], abordagem: 'mostrar ROI 90 dias' },
  marketing:   { dores: ['Cliente quer resultado imediato'], gatilhos: ['marketing', 'ads'], abordagem: 'educar sobre atribuicao' },
  ecommerce:   { dores: ['Abandono de carrinho'], gatilhos: ['loja', 'shopify'], abordagem: 'recuperacao automatica' },
  saude:       { dores: ['Agendamento manual'], gatilhos: ['clinica', 'medico'], abordagem: 'reducao de faltas' },
  consultoria: { dores: ['Cliente quer diagnostico gratis'], gatilhos: ['consultoria'], abordagem: 'posicionar como investimento' }
};

function detectarSegmento(texto) {
  const t = texto.toLowerCase();
  for (const [seg, dados] of Object.entries(RAG)) {
    if (dados.gatilhos.some(g => t.includes(g))) return seg;
  }
  return 'servicos';
}

function detectarTemperatura(texto) {
  const t = texto.toLowerCase();
  if (/urgente|agora|hoje|comprar|fechar|investir|orcamento|preciso|quanto custa/.test(t))
    return { label: 'Quente', emoji: E.fogo, score: 85, cor: '#ef4444' };
  if (/talvez|pensando|analisando|depois|quando|futuro|provavelmente/.test(t))
    return { label: 'Frio', emoji: E.neve, score: 35, cor: '#3b82f6' };
  return { label: 'Morno', emoji: E.sorriso, score: 60, cor: '#f59e0b' };
}

function detectarIntencao(texto) {
  const t = texto.toLowerCase();
  if (/urgente|emergencia|critico|agora|imediat/.test(t))
    return { tipo: 'urgencia', emoji: E.raio, badge: 'Urgente', cor: '#dc2626' };
  if (/orcamento|preco|custo|valor|investimento|quanto/.test(t))
    return { tipo: 'orcamento', emoji: E.dinheiro, badge: 'Orcamento', cor: '#2563eb' };
  if (/agendar|reuniao|call|visita|conversa|falar/.test(t))
    return { tipo: 'agendamento', emoji: E.calendario, badge: 'Agendamento', cor: '#16a34a' };
  return { tipo: 'geral', emoji: E.foguete, badge: 'Geral', cor: '#6b7280' };
}

function saudacaoAtual() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

async function analisarLead(nome, interesse) {
  const temp = detectarTemperatura(interesse);
  const segmento = detectarSegmento(interesse);
  const intencao = detectarIntencao(interesse);
  const rag = RAG[segmento] || { dores: ['Processos manuais'], abordagem: 'mostrar resultado' };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return fallbackAnalise(nome, temp, segmento, rag, intencao);

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'system',
          content: `Voce e Isis. Segmento: ${segmento} | Temperatura: ${temp.label}
Dores: ${rag.dores.slice(0, 2).join(', ')}
Retorne JSON: {"resumo":"max 8 palavras","score":75,"principalDor":"...","sugestaoAbordagem":"...","momentoIdeal":"...","objecaoProvavel":"...","proximoPasso":"..."}`
        }, {
          role: 'user',
          content: `Lead: ${nome}\nInteresse: ${interesse}`
        }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
        max_tokens: 400
      })
    });

    if (!resp.ok) throw new Error('Groq HTTP ' + resp.status);

    const groqData = await resp.json();
    const parsed = JSON.parse(groqData.choices[0].message.content);

    return {
      resumo: parsed.resumo || `${nome} busca solucao`,
      score: parsed.score || temp.score,
      temperatura: temp.label,
      temperaturaEmoji: temp.emoji,
      temperaturaCor: temp.cor,
      segmentoDetectado: segmento,
      intencao,
      principalDor: parsed.principalDor || rag.dores[0],
      sugestaoAbordagem: parsed.sugestaoAbordagem || rag.abordagem,
      momentoIdeal: parsed.momentoIdeal || 'Esta semana',
      objecaoProvavel: parsed.objecaoProvavel || 'Investimento vs retorno',
      proximoPasso: parsed.proximoPasso || 'Enviar proposta'
    };

  } catch (err) {
    console.error('Groq error:', err.message);
    return fallbackAnalise(nome, temp, segmento, rag, intencao);
  }
}

function fallbackAnalise(nome, temp, segmento, rag, intencao) {
  return {
    resumo: `${nome} busca solucao em ${segmento}`,
    score: temp.score,
    temperatura: temp.label,
    temperaturaEmoji: temp.emoji,
    temperaturaCor: temp.cor,
    segmentoDetectado: segmento,
    intencao: intencao || { tipo: 'geral', emoji: E.foguete },
    principalDor: rag?.dores?.[0] || 'Processos manuais',
    sugestaoAbordagem: rag?.abordagem || 'mostrar resultado',
    momentoIdeal: temp.label === 'Quente' ? 'Imediato' : 'Esta semana',
    objecaoProvavel: 'Investimento vs retorno esperado',
    proximoPasso: 'Enviar proposta com case'
  };
}

async function gerarMensagem(nome, interesse) {
  const saudacao = saudacaoAtual();
  const segmento = detectarSegmento(interesse);
  const intencao = detectarIntencao(interesse);
  const rag = RAG[segmento] || { dores: ['processos manuais'], abordagem: 'mostrar resultado' };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return fallbackMensagem(saudacao, nome, interesse, intencao);

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'system',
          content: `Voce e Isis. Mensagem WhatsApp em 3 linhas:
1. "${saudacao} [NOME]! 👋"
2. "Entendi que quer [RESUMO]. [empatia] 💡"
3. "Bora [acao]? ${intencao.emoji}"
Regras: sem markdown, sem Prezado, tom direto. Dor: ${rag.dores[0]}`
        }, {
          role: 'user',
          content: `Nome: ${nome}\nInteresse: ${interesse}`
        }],
        temperature: 0.4,
        max_tokens: 180
      })
    });

    if (!resp.ok) throw new Error('Groq HTTP ' + resp.status);

    const groqData = await resp.json();
    let msg = groqData.choices[0].message.content.trim();
    msg = limparMensagem(msg);
    msg = montarMensagemFinal(msg, saudacao, nome, interesse, intencao);
    return msg;

  } catch (err) {
    console.error('Groq error:', err.message);
    return fallbackMensagem(saudacao, nome, interesse, intencao);
  }
}

function limparMensagem(msg) {
  return msg
    .replace(/```[\s\S]*?```/g, '')
    .replace(/Prezado[^\n]*/gi, '')
    .replace(/Caro[^\n]*/gi, '')
    .replace(/Atenciosamente[^\n]*/gi, '')
    .replace(/Cordialmente[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const EMOJI_REGEX = /[\u{1F000}-\u{1FFFF}\u{2194}-\u{2BFF}\u{2702}-\u{27BF}\u{FE00}-\u{FEFF}]/gu;

function montarMensagemFinal(msg, saudacao, nome, interesse, intencao) {
  const linhas = msg.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (linhas.length < 2) return fallbackMensagem(saudacao, nome, interesse, intencao);

  const primeiroNome = nome.split(' ')[0];

  let l1 = linhas[0];
  if (!l1.toLowerCase().includes(primeiroNome.toLowerCase())) l1 = `${saudacao} ${nome}!`;
  l1 = l1.replace(EMOJI_REGEX, '').trim();
  l1 = `${l1.replace(/!?\s*$/, '!')} ${E.mao}`;

  let l2 = linhas[1] || `Entendi que voce quer ${interesse}.`;
  l2 = l2.replace(EMOJI_REGEX, '').trim();
  l2 = `${l2} ${E.lampada}`;

  let l3 = linhas[2] || 'Bora resolver isso';
  l3 = l3.replace(/\d+\s*min(utos?)?/gi, '')
          .replace(/call\s+r[aá]pida?/gi, 'conversar')
          .replace(EMOJI_REGEX, '')
          .trim();
  l3 = `${l3.replace(/[?!\s]*$/, '?')} ${intencao.emoji}`;

  const l4 = `${E.traco} Isis ${E.estrela}`;
  return [l1, l2, l3, l4].join('\n');
}

function fallbackMensagem(saudacao, nome, interesse, intencao) {
  const resumo = interesse.length > 55 ? interesse.substring(0, 52) + '...' : interesse;
  const emoji = intencao?.emoji || E.foguete;
  return `${saudacao} ${nome}! ${E.mao}\n` +
         `Entendi que voce quer ${resumo}. Isso faz toda a diferenca! ${E.lampada}\n` +
         `Bora resolver isso juntos? ${emoji}\n` +
         `${E.traco} Isis ${E.estrela}`;
}
