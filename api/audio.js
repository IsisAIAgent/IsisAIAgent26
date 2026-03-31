// ============================================
// api/audio.js v1.0 — Isis AI Agent
// Serverless Function: recebe áudio do webhook
// da Evolution API, baixa o arquivo,
// transcreve via Groq Whisper (gratuito)
// e retorna o texto para o evolution.js usar
// ============================================

import { createLogger }        from './lib/logger.js';
import { transcreverAudio,
         downloadAudioFromEvolution } from './lib/audio-service.js';

const log = createLogger('audio');

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
      success:    true,
      service:    'audio-stt',
      version:    '1.0.0',
      whisper:    'whisper-large-v3',
      groq:       !!process.env.GROQ_API_KEY,
      tts_url:    !!process.env.TTS_SERVICE_URL,
      timestamp:  new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return sendJSON(res, 405, { success: false, error: 'Use POST' });
  }

  try {
    const { mediaUrl, mimeType, phone } = req.body || {};

    // Validação básica
    if (!mediaUrl) {
      return sendJSON(res, 400, { success: false, error: 'mediaUrl obrigatório' });
    }

    const apiKey = process.env.EVOLUTION_API_KEY;

    log.info('Requisição de transcrição recebida', {
      phone:    phone || 'desconhecido',
      mimeType: mimeType || 'audio/ogg',
      url:      mediaUrl.substring(0, 80)
    });

    // 1. Baixar o áudio do WhatsApp via Evolution API
    const audioBuffer = await downloadAudioFromEvolution(mediaUrl, apiKey);

    // 2. Transcrever com Groq Whisper
    const texto = await transcreverAudio(audioBuffer, mimeType || 'audio/ogg');

    if (!texto || texto.trim().length === 0) {
      log.warn('Transcrição vazia', { phone });
      return sendJSON(res, 200, {
        success: true,
        texto:   '',
        vazio:   true
      });
    }

    log.info('Transcrição concluída', {
      phone,
      chars:   texto.length,
      preview: texto.substring(0, 80)
    });

    return sendJSON(res, 200, {
      success: true,
      texto,
      vazio:   false
    });

  } catch (err) {
    log.error('Erro crítico na transcrição', { message: err.message });
    return sendJSON(res, 500, {
      success: false,
      error:   'Erro ao processar áudio: ' + err.message
    });
  }
}
