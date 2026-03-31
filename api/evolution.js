// ============================================
// api/evolution.js v3.0 — Isis AI Agent
// Webhook principal da Evolution API
// NOVO: suporte completo a mensagens de áudio
//   • Transcreve via Groq Whisper (audio.js)
//   • Detecta preferência de canal do lead
//   • Responde em áudio se lead preferir (tts.js)
//   • Fallback para texto em qualquer falha
// ============================================

import { createLogger }             from './lib/logger.js';
import { getPool }                  from './lib/helpers.js';
import {
  atualizarCanalPreferido,
  getCanalPreferido,
  getMensagemConfirmacaoAudio
} from './lib/audio-service.js';

const log = createLogger('evolution');

// ── Emojis (ASCII-safe) ───────────────────────
const E = {
  mao:     String.fromCodePoint(0x1F44B),
  lampada: String.fromCodePoint(0x1F4A1),
  foguete: String.fromCodePoint(0x1F680),
  estrela: String.fromCodePoint(0x2728),
  traco:   String.fromCodePoint(0x2014),
  cafe:    String.fromCodePoint(0x2615),
  grafico: String.fromCodePoint(0x1F4C8),
  micro:   String.fromCodePoint(0x1F3A4),
  fogo:    String.fromCodePoint(0x1F525),
};

// ============================================
// ENVIAR MENSAGEM DE TEXTO via Evolution API
// ============================================
async function enviarMensagemTexto(phone, message) {
  const baseUrl  = process.env.EVOLUTION_URL;
  const apiKey   = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!baseUrl || !apiKey || !instance) {
    log.error('Env vars Evolution não configuradas');
    return false;
  }

  const phoneClean = phone.replace(/\D/g, '');
  const payload    = {
    number:          phoneClean,
    text:            message,
    delay:           1200,
    linkPreview:     false,
    mentionsEveryOne: false
  };

  log.info('Enviando texto via Evolution', { phone: phoneClean, preview: message.substring(0, 80) });

  try {
    const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      body:    JSON.stringify(payload)
    });

    const responseText = await res.text();
    if (!res.ok) {
      log.error('Evolution sendText falhou', { status: res.status, body: responseText.substring(0, 200) });
      return false;
    }

    log.info('Texto enviado com sucesso');
    return true;

  } catch (err) {
    log.error('Evolution sendText erro de rede', { message: err.message });
    return false;
  }
}

// ============================================
// TRANSCREVER ÁUDIO via /api/audio (interno)
// Chamada interna para a própria Serverless Function
// ============================================
async function transcreverAudioInterno(mediaUrl, mimeType, phone) {
  // URL base do próprio Vercel
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://isis-ai-agent.vercel.app';

  try {
    log.info('Chamando /api/audio para transcrição', { phone });

    const res = await fetch(`${baseUrl}/api/audio`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mediaUrl, mimeType, phone })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`audio API HTTP ${res.status}: ${err.substring(0, 100)}`);
    }

    const data = await res.json();
    return data;

  } catch (err) {
    log.error('Erro ao chamar /api/audio', { message: err.message });
    return { success: false, texto: '', vazio: true };
  }
}

// ============================================
// ENVIAR RESPOSTA EM ÁUDIO via /api/tts (interno)
// ============================================
async function responderEmAudio(phone, texto) {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://isis-ai-agent.vercel.app';

  try {
    log.info('Chamando /api/tts para resposta em áudio', { phone, chars: texto.length });

    const res = await fetch(`${baseUrl}/api/tts`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ texto, phone })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`tts API HTTP ${res.status}: ${err.substring(0, 100)}`);
    }

    const data = await res.json();
    return data.success === true;

  } catch (err) {
    log.error('Erro ao chamar /api/tts', { message: err.message });
    return false;
  }
}

// ============================================
// GERAR RESPOSTA DE TEXTO via Groq (Isis)
// ============================================
async function gerarMensagemIsis(nome, interesse) {
  const apiKey = process.env.GROQ_API_KEY;
  const h      = new Date().getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  if (!apiKey) {
    return (
      `${saudacao} ${nome}! ${E.mao}\n` +
      `Sou especialista em marketing digital para empresas de qualquer ramo. ` +
      `Posso te ajudar a vender mais! ${E.grafico}\n` +
      `Bora conversar? ${E.cafe}\n${E.traco} Isis ${E.estrela}`
    );
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role:    'system',
            content: `Voc\u00ea \u00e9 Isis, especialista em marketing digital para empresas de qualquer ramo ou atividade. Responde pelo WhatsApp de forma humana, direta e envolvente.

SUAS ESPECIALIDADES (mencione naturalmente quando relevante):
- Marketing digital para qualquer tipo de neg\u00f3cio
- Automa\u00e7\u00e3o de atendimento via WhatsApp com IA
- Qualifica\u00e7\u00e3o e gest\u00e3o de leads (CRM inteligente)
- Estrat\u00e9gias de vendas e capta\u00e7\u00e3o de clientes
- Presen\u00e7a digital: redes sociais, tr\u00e1fego pago, conte\u00fado

REGRAS OBRIGAT\u00d3RIAS:
- Sauda\u00e7\u00e3o: "${saudacao} [NOME]! ${E.mao}"
- M\u00e1ximo 4 linhas curtas e diretas
- Tom: leve, humano, brasileiro \u2014 NUNCA rob\u00f3tico ou formal
- NUNCA use "Prezado", "Cordialmente", "Atenciosamente"
- CTA leve: "Bora conversar?", "15 minutos bastam!", "Me chama aqui!", "Posso te mostrar como?"
- Assine SEMPRE: "\u2014 Isis ${E.estrela}"

QUANDO A MENSAGEM FOR FORA DO CONTEXTO (receitas, pol\u00edtica, clima, esporte, etc.):
- NUNCA diga "n\u00e3o sou especialista em X" ou "minha \u00e1rea \u00e9 outra"
- Acolha com leveza, humor sutil e redirecione com curiosidade
- Conecte o assunto ao seu universo de forma criativa
- Exemplos de desvio elegante:
  * Receita \u2192 "Haha, boa pedida! ${E.cafe} Meu card\u00e1pio \u00e9 diferente \u2014 sirvo estrat\u00e9gias que fazem empresas venderem mais. Posso te mostrar o menu?"
  * Futebol \u2192 "Torcer \u00e9 \u00f3timo! ${E.fogo} Mas meu campeonato \u00e9 outro \u2014 ajudo empresas a marcar gols de vendas todo dia. Bora jogar junto?"
  * Clima \u2192 "Tempo bom \u00e9 sempre bem-vindo! ${E.estrela} Por falar em boas not\u00edcias, ajudo neg\u00f3cios a atrair mais clientes pelo digital. Curiosidade?"
  * Qualquer outro \u2192 Acolha com uma frase leve, fa\u00e7a uma analogia criativa com marketing/vendas e convide para conversar`
          },
          {
            role:    'user',
            content: `Nome do lead: ${nome}\nMensagem recebida: ${interesse}`
          }
        ],
        temperature: 0.75,
        max_tokens:  250
      })
    });

    if (!res.ok) throw new Error('Groq HTTP ' + res.status);

    const data = await res.json();
    let msg = data.choices[0].message.content.trim()
      .replace(/Prezado[^\n]*/gi,        '')
      .replace(/Cordialmente[^\n]*/gi,   '')
      .replace(/Atenciosamente[^\n]*/gi, '')
      .replace(/\n{3,}/g,                '\n\n')
      .trim();

    if (!msg.includes('Isis')) msg += `\n${E.traco} Isis ${E.estrela}`;
    return msg;

  } catch (err) {
    log.error('Groq erro ao gerar mensagem', { message: err.message });
    return (
      `${saudacao} ${nome}! ${E.mao}\n` +
      `Sou especialista em marketing digital para qualquer tipo de neg\u00f3cio. ` +
      `Ajudo empresas a vender mais pelo WhatsApp! ${E.grafico}\n` +
      `Bora conversar? ${E.foguete}\n${E.traco} Isis ${E.estrela}`
    );
  }
}

// ============================================
// POOL POSTGRESQL
// ============================================
async function getDbPool() {
  return getPool();
}

// ============================================
// SALVAR / ATUALIZAR LEAD
// ============================================
async function salvarLead(companyId, nome, phone, interesse) {
  const pool = await getDbPool();
  try {
    const existing = await pool.query(
      'SELECT id FROM leads WHERE company_id = $1 AND phone = $2 LIMIT 1',
      [companyId, phone]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE leads SET updated_at = NOW() WHERE id = $1',
        [existing.rows[0].id]
      );
      log.info('Lead existente atualizado', { leadId: existing.rows[0].id });
      return existing.rows[0].id;
    }

    const key    = Math.random().toString(36).substring(2, 15);
    const result = await pool.query(
      `INSERT INTO leads
         (company_id, name, phone, interesse, status, temperature, signature_key, canal_preferido, audio_count)
       VALUES ($1, $2, $3, $4, 'novo', 'morno', $5, 'texto', 0)
       RETURNING id`,
      [companyId, nome, phone, interesse || 'Contato via WhatsApp', key]
    );

    log.info('Novo lead criado', { leadId: result.rows[0].id });
    return result.rows[0].id;

  } catch (err) {
    log.error('Erro ao salvar lead', { message: err.message });
    throw err;
  }
}

// ============================================
// SALVAR MENSAGEM
// ============================================
async function salvarMensagem(companyId, leadId, content, direction = 'inbound', tipo = 'texto') {
  const pool = await getDbPool();
  try {
    await pool.query(
      `INSERT INTO messages (company_id, lead_id, content, direction, sent_by_ai)
       VALUES ($1, $2, $3, $4, $5)`,
      [companyId, leadId, content, direction, direction === 'outbound']
    );
  } catch (err) {
    log.error('Erro ao salvar mensagem', { message: err.message });
    // Não quebra o fluxo
  }
}

// ============================================
// BUSCAR EMPRESA PELA INSTÂNCIA
// ============================================
async function buscarEmpresa(instanceName) {
  const pool = await getDbPool();
  try {
    const result = await pool.query(
      `SELECT id, name FROM companies
       WHERE evolution_instance = $1 AND active = true LIMIT 1`,
      [instanceName]
    );

    if (result.rows.length > 0) return result.rows[0];

    // Fallback: primeira empresa ativa
    const fallback = await pool.query(
      `SELECT id, name FROM companies WHERE active = true ORDER BY created_at LIMIT 1`
    );
    return fallback.rows[0] || null;

  } catch (err) {
    log.error('Erro ao buscar empresa', { message: err.message });
    throw err;
  }
}

// ============================================
// EXTRAIR DADOS DE ÁUDIO DO PAYLOAD
// Suporta Evolution API v2 com audioMessage,
// pttMessage e documentMessage (áudio como doc)
// ============================================
function extrairDadosAudio(data) {
  const msg = data.message || {};

  // audioMessage padrão
  if (msg.audioMessage) {
    return {
      ehAudio:  true,
      mediaUrl: msg.audioMessage.url          || msg.audioMessage.mediaUrl || '',
      mimeType: msg.audioMessage.mimetype     || 'audio/ogg',
      duracao:  msg.audioMessage.seconds      || 0
    };
  }

  // pttMessage (push-to-talk — nota de voz)
  if (msg.pttMessage) {
    return {
      ehAudio:  true,
      mediaUrl: msg.pttMessage.url            || msg.pttMessage.mediaUrl || '',
      mimeType: msg.pttMessage.mimetype       || 'audio/ogg',
      duracao:  msg.pttMessage.seconds        || 0
    };
  }

  // Alguns clientes enviam como document com mimetype de áudio
  if (msg.documentMessage && msg.documentMessage.mimetype?.startsWith('audio/')) {
    return {
      ehAudio:  true,
      mediaUrl: msg.documentMessage.url       || '',
      mimeType: msg.documentMessage.mimetype  || 'audio/ogg',
      duracao:  0
    };
  }

  return { ehAudio: false };
}

// ============================================
// HANDLER PRINCIPAL
// ============================================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET → health check
  if (req.method === 'GET') {
    return res.status(200).json({
      success:    true,
      version:    '3.0.0',
      audio:      true,
      configured: !!(
        process.env.EVOLUTION_URL    &&
        process.env.EVOLUTION_API_KEY &&
        process.env.EVOLUTION_INSTANCE
      ),
      tts:        !!process.env.TTS_SERVICE_URL,
      instance:   process.env.EVOLUTION_INSTANCE || 'não configurado',
      timestamp:  new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST (webhook) ou GET (status)' });
  }

  try {
    const payload  = req.body;
    log.info('Webhook recebido', { preview: JSON.stringify(payload).substring(0, 300) });

    const data     = payload.data;
    const instance = payload.instance;

    // ── Ignorar mensagens enviadas pela própria instância ──
    if (!data || data.key?.fromMe === true) {
      return res.status(200).json({ success: true, skipped: 'fromMe' });
    }

    // ── Ignorar reactions ──
    if (data.messageType === 'reactionMessage') {
      return res.status(200).json({ success: true, skipped: 'reaction' });
    }

    // ── Ignorar grupos ──
    const remoteJid = data.key?.remoteJid || '';
    if (remoteJid.includes('@g.us')) {
      return res.status(200).json({ success: true, skipped: 'grupo' });
    }

    // ── Extrair dados básicos ──
    const phone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    const nome  = data.pushName || data.key?.participant || 'Lead WhatsApp';

    if (!phone) {
      log.warn('Sem phone, ignorando');
      return res.status(200).json({ success: true, skipped: 'sem phone' });
    }

    // ── Identificar empresa ──
    const empresa = await buscarEmpresa(instance);
    if (!empresa) {
      log.error('Empresa não encontrada', { instance });
      return res.status(200).json({ success: false, error: 'Empresa não encontrada' });
    }

    log.info('Empresa identificada', { nome: empresa.name });

    // ── Verificar se é mensagem de áudio ──
    const audioInfo = extrairDadosAudio(data);

    // ══════════════════════════════════════════
    // FLUXO DE ÁUDIO
    // ══════════════════════════════════════════
    if (audioInfo.ehAudio) {
      log.info('Mensagem de áudio recebida', { phone, duracao: audioInfo.duracao });

      let textoTranscrito = '';
      let transcricaoOk   = false;

      // 1. Tentar transcrever o áudio
      if (audioInfo.mediaUrl) {
        try {
          const resultado = await transcreverAudioInterno(
            audioInfo.mediaUrl,
            audioInfo.mimeType,
            phone
          );
          if (resultado.success && !resultado.vazio) {
            textoTranscrito = resultado.texto;
            transcricaoOk   = true;
            log.info('Transcrição recebida', { preview: textoTranscrito.substring(0, 80) });
          }
        } catch (err) {
          log.error('Transcrição falhou, usando fallback', { message: err.message });
        }
      }

      // 2. Se não transcreveu, usar texto genérico para contexto
      const interesseParaIA = transcricaoOk
        ? textoTranscrito
        : 'Lead enviou mensagem de áudio — demonstrando interesse';

      // 3. Salvar lead com interesse transcrito (ou genérico)
      const leadId = await salvarLead(empresa.id, nome, phone, interesseParaIA);

      // 4. Salvar mensagem inbound
      const conteudoInbound = transcricaoOk
        ? `[ÁUDIO TRANSCRITO] ${textoTranscrito}`
        : '[ÁUDIO - não transcrito]';
      await salvarMensagem(empresa.id, leadId, conteudoInbound, 'inbound', 'audio');

      // 5. Atualizar preferência de canal (lógica dos 2 áudios)
      const { canal, audio_count } = await atualizarCanalPreferido(leadId, 'audio');
      log.info('Canal do lead', { phone, canal, audio_count });

      // 6. Gerar resposta de texto da Isis
      const mensagemIsis = await gerarMensagemIsis(nome, interesseParaIA);

      let enviadoOk    = false;
      let modoResposta = 'texto';

      // 7. Decidir modo de resposta com base na preferência
      if (canal === 'audio') {
        // Lead já preferiu áudio — responder em áudio
        log.info('Respondendo em ÁUDIO (preferência detectada)', { phone });

        try {
          enviadoOk    = await responderEmAudio(phone, mensagemIsis);
          modoResposta = 'audio';
        } catch (err) {
          log.error('Falha ao enviar áudio, fallback para texto', { message: err.message });
        }

        // Fallback para texto se áudio falhar
        if (!enviadoOk) {
          enviadoOk    = await enviarMensagemTexto(phone, mensagemIsis);
          modoResposta = 'texto_fallback';
        }

      } else if (audio_count === 1) {
        // Primeiro áudio — responder em texto normalmente
        // Não notifica ainda, espera o segundo para confirmar preferência
        log.info('Primeiro áudio — respondendo em texto', { phone });
        enviadoOk    = await enviarMensagemTexto(phone, mensagemIsis);
        modoResposta = 'texto';

      } else {
        // audio_count acabou de virar 2 (canal recém mudou para 'audio')
        // Enviar primeiro: mensagem de confirmação da preferência
        log.info('Segundo áudio — confirmando preferência e respondendo em áudio', { phone });

        const confirmacao = getMensagemConfirmacaoAudio(nome);
        await enviarMensagemTexto(phone, confirmacao);
        await salvarMensagem(empresa.id, leadId, confirmacao, 'outbound');

        // Agora responde em áudio
        try {
          enviadoOk    = await responderEmAudio(phone, mensagemIsis);
          modoResposta = 'audio';
        } catch (err) {
          log.error('Falha no primeiro áudio de resposta, fallback texto', { message: err.message });
          enviadoOk    = await enviarMensagemTexto(phone, mensagemIsis);
          modoResposta = 'texto_fallback';
        }
      }

      // 8. Salvar resposta da Isis
      if (enviadoOk) {
        const conteudoOutbound = modoResposta === 'audio'
          ? `[RESPOSTA EM ÁUDIO] ${mensagemIsis}`
          : mensagemIsis;
        await salvarMensagem(empresa.id, leadId, conteudoOutbound, 'outbound', modoResposta);
      }

      return res.status(200).json({
        success:      true,
        lead:         leadId,
        empresa:      empresa.name,
        tipo:         'audio',
        transcricao:  transcricaoOk,
        canal,
        audio_count,
        modo_resposta: modoResposta,
        enviado:      enviadoOk,
        preview:      mensagemIsis.substring(0, 100)
      });
    }

    // ══════════════════════════════════════════
    // FLUXO DE TEXTO (comportamento original)
    // ══════════════════════════════════════════
    const texto = data.message?.conversation
               || data.message?.extendedTextMessage?.text
               || data.message?.imageMessage?.caption
               || data.message?.buttonsResponseMessage?.selectedDisplayText
               || '';

    if (!texto) {
      log.info('Sem texto e sem áudio, ignorando');
      return res.status(200).json({ success: true, skipped: 'sem conteudo' });
    }

    log.info('Mensagem de texto recebida', { phone, preview: texto.substring(0, 80) });

    // Salvar lead
    const leadId = await salvarLead(empresa.id, nome, phone, texto);
    await salvarMensagem(empresa.id, leadId, texto, 'inbound', 'texto');

    // Reset canal para texto (lead voltou a usar texto)
    await atualizarCanalPreferido(leadId, 'texto');

    // Gerar e enviar resposta em texto
    const mensagemIsis  = await gerarMensagemIsis(nome, texto);
    const enviadoOk     = await enviarMensagemTexto(phone, mensagemIsis);

    if (enviadoOk) {
      await salvarMensagem(empresa.id, leadId, mensagemIsis, 'outbound', 'texto');
    }

    return res.status(200).json({
      success:  true,
      lead:     leadId,
      empresa:  empresa.name,
      tipo:     'texto',
      enviado:  enviadoOk,
      preview:  mensagemIsis.substring(0, 100)
    });

  } catch (err) {
    log.error('Erro crítico no handler Evolution', { message: err.message, stack: err.stack });
    // Retorna 200 para Evolution não retentar infinitamente
    return res.status(200).json({ success: false, error: err.message });
  }
}
