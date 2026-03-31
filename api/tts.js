// ============================================
// api/tts.js v1.0 — Isis AI Agent
// Serverless Function: recebe texto da Isis,
// chama microserviço edge-tts no Render,
// envia áudio de volta via Evolution API
// ============================================

import { createLogger }                        from './lib/logger.js';
import { gerarAudioTTS, enviarAudioEvolution } from './lib/audio-service.js';

const log = createLogger('tts');

function sendJSON(res, status, data) {
  const buffer = Buffer.from(JSON.stringify(data), 'utf-8');
  res.setHeader('Content-Type',   'application/json; charset=utf-8');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey');
  return res.status(status).end(buffer);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET → health check
  if (req.method === 'GET') {
    return sendJSON(res, 200, {
      success:     true,
      service:     'audio-tts',
      version:     '1.0.0',
      tts_url:     process.env.TTS_SERVICE_URL || 'não configurado',
      evolution:   !!process.env.EVOLUTION_URL,
      timestamp:   new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return sendJSON(res, 405, { success: false, error: 'Use POST' });
  }

  try {
    const { texto, phone } = req.body || {};

    if (!texto || !phone) {
      return sendJSON(res, 400, {
        success: false,
        error: 'texto e phone são obrigatórios'
      });
    }

    // Limpa emojis compostos e caracteres problemáticos para o TTS
    // mantendo texto legível em voz
    const textoLimpo = texto
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')   // emojis
      .replace(/[\u{2194}-\u{2BFF}]/gu,   '')    // símbolos variados
      .replace(/[\u{FE00}-\u{FEFF}]/gu,   '')    // variation selectors
      .replace(/\u2014/g,  ' — ')                // travessão → legível
      .replace(/\n+/g,     '. ')                 // quebras de linha → pausa de voz
      .replace(/\s{2,}/g,  ' ')                  // espaços duplos
      .trim();

    if (!textoLimpo) {
      return sendJSON(res, 400, { success: false, error: 'Texto vazio após limpeza' });
    }

    log.info('Gerando TTS e enviando áudio', {
      phone:   phone,
      chars:   textoLimpo.length,
      preview: textoLimpo.substring(0, 60)
    });

    // 1. Gerar áudio via Render (edge-tts, voz pt-BR-FranciscaNeural)
    const audioBuffer = await gerarAudioTTS(textoLimpo);

    // 2. Enviar áudio via Evolution API como mensagem de voz (PTT)
    await enviarAudioEvolution(phone, audioBuffer);

    log.info('Áudio enviado com sucesso', { phone, bytes: audioBuffer.length });

    return sendJSON(res, 200, {
      success: true,
      bytes:   audioBuffer.length,
      phone
    });

  } catch (err) {
    log.error('Erro crítico no TTS', { message: err.message });

    // Não retorna 500 — o evolution.js já tem fallback para texto
    return sendJSON(res, 500, {
      success: false,
      error:   'Erro no TTS: ' + err.message
    });
  }
}
