// ============================================
// api/lib/audio-service.js v1.0
// Utilitário: download de áudio do WhatsApp,
// transcrição via Groq Whisper,
// lógica de preferência de canal (2 áudios = preferência),
// geração de áudio via Render (edge-tts)
// NÃO é Serverless Function — apenas importado
// ============================================

import { createLogger } from './logger.js';
import { getPool        } from './helpers.js';

const log = createLogger('audio-service');

// ── Emojis (ASCII-safe) ───────────────────────
const E = {
  micro:   String.fromCodePoint(0x1F3A4),
  audio:   String.fromCodePoint(0x1F509),
  estrela: String.fromCodePoint(0x2728),
  traco:   String.fromCodePoint(0x2014),
};

// ── URL do microserviço TTS no Render ─────────
const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || '';

// ============================================
// 1. DOWNLOAD DO ÁUDIO DO WHATSAPP
//    A Evolution API retorna a URL do mídia
//    já com autenticação embutida.
// ============================================
export async function downloadAudioFromEvolution(mediaUrl, apiKey) {
  try {
    log.info('Baixando áudio do WhatsApp', { url: mediaUrl.substring(0, 80) });

    const res = await fetch(mediaUrl, {
      headers: { 'apikey': apiKey }
    });

    if (!res.ok) {
      throw new Error(`Download falhou: HTTP ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    log.info('Áudio baixado', { bytes: buffer.length });
    return buffer;

  } catch (err) {
    log.error('Erro ao baixar áudio', { message: err.message });
    throw err;
  }
}

// ============================================
// 2. TRANSCRIÇÃO VIA GROQ WHISPER
//    Envia o buffer de áudio para o endpoint
//    de transcrição da Groq API (gratuito).
// ============================================
export async function transcreverAudio(audioBuffer, mimeType = 'audio/ogg') {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY não configurada');

  log.info('Transcrevendo áudio via Groq Whisper', { bytes: audioBuffer.length });

  // Groq Whisper requer multipart/form-data
  // Usamos a API REST diretamente sem SDK
  const boundary = '----IsisAudioBoundary' + Date.now();

  // Monta o corpo multipart manualmente (sem dependências externas)
  const filename  = 'audio.ogg';
  const preamble  = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  );
  const modelPart = Buffer.from(
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `whisper-large-v3` +
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="language"\r\n\r\n` +
    `pt` +
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
    `json` +
    `\r\n--${boundary}--\r\n`
  );

  const body = Buffer.concat([preamble, audioBuffer, modelPart]);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length)
      },
      body
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq Whisper HTTP ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    const texto = data.text?.trim() || '';

    log.info('Transcrição concluída', { chars: texto.length, preview: texto.substring(0, 60) });
    return texto;

  } catch (err) {
    log.error('Erro Groq Whisper', { message: err.message });
    throw err;
  }
}

// ============================================
// 3. GERAR ÁUDIO TTS VIA RENDER (edge-tts)
//    Chama o microserviço Python no Render.
//    Retorna Buffer com o áudio .ogg
// ============================================
export async function gerarAudioTTS(texto) {
  if (!TTS_SERVICE_URL) {
    throw new Error('TTS_SERVICE_URL não configurada');
  }

  log.info('Gerando áudio TTS', { chars: texto.length });

  try {
    const res = await fetch(`${TTS_SERVICE_URL}/tts`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: texto, voice: 'pt-BR-FranciscaNeural' })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`TTS Service HTTP ${res.status}: ${err.substring(0, 200)}`);
    }

    const data = await res.json();
    if (!data.audio_base64) throw new Error('TTS não retornou audio_base64');

    const buffer = Buffer.from(data.audio_base64, 'base64');
    log.info('Áudio TTS gerado', { bytes: buffer.length });
    return buffer;

  } catch (err) {
    log.error('Erro TTS Service', { message: err.message });
    throw err;
  }
}

// ============================================
// 4. ENVIAR ÁUDIO VIA EVOLUTION API
//    Converte buffer para base64 e envia como
//    audioMessage para o WhatsApp do lead.
// ============================================
export async function enviarAudioEvolution(phone, audioBuffer) {
  const baseUrl  = process.env.EVOLUTION_URL;
  const apiKey   = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!baseUrl || !apiKey || !instance) {
    throw new Error('Env vars Evolution não configuradas');
  }

  const phoneClean  = phone.replace(/\D/g, '');
  const audioBase64 = audioBuffer.toString('base64');

  // Evolution API v2 — sendWhatsAppAudio (PTT = push-to-talk, aparece como áudio de voz)
  const payload = {
    number:  phoneClean,
    audio:   audioBase64,
    delay:   1000,
    encoding: true   // converte para opus/ogg automaticamente se necessário
  };

  log.info('Enviando áudio via Evolution', { phone: phoneClean, bytes: audioBuffer.length });

  try {
    const res = await fetch(`${baseUrl}/message/sendWhatsAppAudio/${instance}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':        apiKey
      },
      body: JSON.stringify(payload)
    });

    const responseText = await res.text();
    log.info('Evolution audio response', { status: res.status, body: responseText.substring(0, 200) });

    if (!res.ok) {
      throw new Error(`Evolution HTTP ${res.status}: ${responseText.substring(0, 200)}`);
    }

    return true;

  } catch (err) {
    log.error('Erro ao enviar áudio Evolution', { message: err.message });
    throw err;
  }
}

// ============================================
// 5. ATUALIZAR PREFERÊNCIA DE CANAL NO BANCO
//    Lógica: 2 áudios consecutivos = preferência
//    Qualquer texto = reset para 'texto'
// ============================================
export async function atualizarCanalPreferido(leadId, tipoMensagem) {
  const pool = getPool();

  try {
    if (tipoMensagem === 'audio') {
      // Incrementa contador e verifica se chegou em 2
      const result = await pool.query(
        `UPDATE leads
         SET audio_count = audio_count + 1,
             canal_preferido = CASE WHEN audio_count + 1 >= 2 THEN 'audio' ELSE canal_preferido END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING audio_count, canal_preferido`,
        [leadId]
      );

      const row = result.rows[0];
      log.info('Canal atualizado (áudio)', {
        leadId,
        audio_count: row?.audio_count,
        canal: row?.canal_preferido
      });

      return {
        canal:       row?.canal_preferido || 'texto',
        audio_count: row?.audio_count     || 0
      };

    } else {
      // Lead mandou texto — reset do contador de áudio
      const result = await pool.query(
        `UPDATE leads
         SET audio_count    = 0,
             canal_preferido = 'texto',
             updated_at      = NOW()
         WHERE id = $1
         RETURNING canal_preferido`,
        [leadId]
      );

      log.info('Canal resetado para texto', { leadId });
      return { canal: 'texto', audio_count: 0 };
    }

  } catch (err) {
    log.error('Erro ao atualizar canal', { leadId, message: err.message });
    // Não quebra o fluxo — fallback para texto
    return { canal: 'texto', audio_count: 0 };
  }
}

// ============================================
// 6. BUSCAR PREFERÊNCIA ATUAL DO LEAD
// ============================================
export async function getCanalPreferido(leadId) {
  const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT canal_preferido, audio_count FROM leads WHERE id = $1`,
      [leadId]
    );
    return {
      canal:       result.rows[0]?.canal_preferido || 'texto',
      audio_count: result.rows[0]?.audio_count     || 0
    };
  } catch (err) {
    log.error('Erro ao buscar canal', { leadId, message: err.message });
    return { canal: 'texto', audio_count: 0 };
  }
}

// ============================================
// 7. MENSAGEM DE CONFIRMAÇÃO DE PREFERÊNCIA
//    Enviada quando a Isis detecta que o lead
//    prefere se comunicar por áudio.
// ============================================
export function getMensagemConfirmacaoAudio(nome) {
  const primeiroNome = nome.split(' ')[0];
  return (
    `${primeiroNome}, percebi que voc\u00ea prefere se comunicar por \u00e1udio! ${E.micro}\n` +
    `A partir de agora vou te responder em \u00e1udio tamb\u00e9m. ${E.audio}\n` +
    `${E.traco} Isis ${E.estrela}`
  );
}
