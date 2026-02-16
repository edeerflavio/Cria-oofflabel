/**
 * recorder.js — Audio & Speech Recording Module
 * Medical Scribe v2.0
 * Dual-track: SpeechRecognition (text) + MediaRecorder (audio chunks)
 * Ready for Whisper / Google Speech-to-Text API integration
 */

const Recorder = (() => {

    // ── State ──
    let recognition = null;
    let mediaRecorder = null;
    let audioStream = null;
    let audioChunks = [];
    let transcript = '';
    let interimTranscript = '';
    let isRecording = false;
    let callbacks = {};

    // ── Feature detection ──
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const speechSupported = !!SpeechRecognition;
    const audioSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

    // ── Audio Config ──
    const AUDIO_CONFIG = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000,
        chunkIntervalMs: 5000, // 5-second chunks for API upload
    };

    // Fallback mime types
    function getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4',
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return '';
    }

    /**
     * Initialize the recorder with callbacks
     * @param {Object} opts - { onUpdate(data), onEnd(transcript), onError(err) }
     * @returns {boolean} Whether speech recognition is supported
     */
    function init(opts = {}) {
        callbacks = opts;

        if (speechSupported) {
            recognition = new SpeechRecognition();
            recognition.lang = 'pt-BR';
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;

            recognition.onresult = (event) => {
                let finalText = '';
                let interim = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (result.isFinal) {
                        finalText += result[0].transcript + ' ';
                    } else {
                        interim += result[0].transcript;
                    }
                }

                if (finalText) {
                    transcript += finalText;
                }
                interimTranscript = interim;

                if (callbacks.onUpdate) {
                    callbacks.onUpdate({
                        final: transcript.trim(),
                        interim: interimTranscript,
                    });
                }
            };

            recognition.onerror = (event) => {
                console.warn('[Recorder] Speech error:', event.error);
                if (event.error !== 'no-speech' && callbacks.onError) {
                    callbacks.onError(event.error);
                }
            };

            recognition.onend = () => {
                // Auto-restart if still recording (browser sometimes stops)
                if (isRecording && speechSupported) {
                    try { recognition.start(); } catch (e) { /* already started */ }
                } else if (callbacks.onEnd) {
                    callbacks.onEnd(transcript.trim());
                }
            };
        }

        // Detect supported audio mime type
        if (audioSupported) {
            AUDIO_CONFIG.mimeType = getSupportedMimeType() || AUDIO_CONFIG.mimeType;
        }

        console.log(`[Recorder] Init — Speech: ${speechSupported}, Audio: ${audioSupported}, MIME: ${AUDIO_CONFIG.mimeType}`);
        return speechSupported;
    }

    /**
     * Start recording (speech + audio)
     */
    async function start() {
        if (isRecording) return;
        isRecording = true;
        audioChunks = [];

        // Start speech recognition (text track)
        if (speechSupported && recognition) {
            try {
                recognition.start();
            } catch (e) {
                console.warn('[Recorder] Speech start error:', e);
            }
        }

        // Start MediaRecorder (audio track)
        if (audioSupported) {
            try {
                audioStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        sampleRate: 44100,
                    }
                });

                mediaRecorder = new MediaRecorder(audioStream, {
                    mimeType: AUDIO_CONFIG.mimeType,
                    audioBitsPerSecond: AUDIO_CONFIG.audioBitsPerSecond,
                });

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0) {
                        audioChunks.push({
                            blob: event.data,
                            timestamp: new Date().toISOString(),
                            index: audioChunks.length,
                            size: event.data.size,
                        });
                        console.log(`[Recorder] Audio chunk #${audioChunks.length}: ${(event.data.size / 1024).toFixed(1)}KB`);
                    }
                };

                mediaRecorder.onerror = (event) => {
                    console.error('[Recorder] MediaRecorder error:', event.error);
                };

                // Start capturing in timed chunks
                mediaRecorder.start(AUDIO_CONFIG.chunkIntervalMs);
                console.log('[Recorder] MediaRecorder started — chunk interval:', AUDIO_CONFIG.chunkIntervalMs, 'ms');

            } catch (err) {
                console.warn('[Recorder] Audio capture unavailable:', err.message);
                // Non-fatal: text recording still works
            }
        }
    }

    /**
     * Stop recording (both tracks)
     * @returns {string} The accumulated transcript text
     */
    function stop() {
        isRecording = false;

        // Stop speech recognition
        if (recognition) {
            try { recognition.stop(); } catch (e) { /* ok */ }
        }

        // Stop MediaRecorder and release stream
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            try { mediaRecorder.stop(); } catch (e) { /* ok */ }
        }
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }

        if (callbacks.onEnd) {
            callbacks.onEnd(transcript.trim());
        }

        console.log(`[Recorder] Stopped — Text: ${transcript.length} chars, Audio: ${audioChunks.length} chunks`);
        return transcript.trim();
    }

    /**
     * Get the accumulated transcript text
     */
    function getTranscript() {
        return transcript.trim();
    }

    /**
     * Append manual text to the transcript
     */
    function appendManualText(text) {
        if (text) {
            transcript += (transcript ? ' ' : '') + text;
        }
    }

    /**
     * Clear all recorded data (text + audio)
     */
    function clear() {
        transcript = '';
        interimTranscript = '';
        audioChunks = [];
    }

    // ══════════════════════════════════════════════════════
    // AUDIO CHUNK API (for external transcription services)
    // ══════════════════════════════════════════════════════

    /**
     * Get all audio chunks as array
     * Each chunk: { blob: Blob, timestamp: string, index: number, size: number }
     * @returns {Array} Audio chunks
     */
    function getAudioChunks() {
        return audioChunks;
    }

    /**
     * Get merged audio as single Blob (for full-file upload)
     * @returns {Blob|null} Complete audio blob or null if no audio
     */
    function getAudioBlob() {
        if (audioChunks.length === 0) return null;
        const blobs = audioChunks.map(c => c.blob);
        return new Blob(blobs, { type: AUDIO_CONFIG.mimeType });
    }

    /**
     * Get audio stats
     */
    function getAudioStats() {
        const totalSize = audioChunks.reduce((sum, c) => sum + c.size, 0);
        return {
            chunks: audioChunks.length,
            totalSizeKB: (totalSize / 1024).toFixed(1),
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
            mimeType: AUDIO_CONFIG.mimeType,
            durationEstimateSec: audioChunks.length * (AUDIO_CONFIG.chunkIntervalMs / 1000),
        };
    }

    /**
     * Prepare audio FormData for API upload (Whisper / Google STT)
     * @param {string} fieldName - Form field name (default: 'file')
     * @param {string} fileName - File name (default: 'recording.webm')
     * @returns {FormData|null}
     */
    function prepareAudioUpload(fieldName = 'file', fileName = 'recording.webm') {
        const blob = getAudioBlob();
        if (!blob) return null;

        const formData = new FormData();
        formData.append(fieldName, blob, fileName);
        formData.append('model', 'whisper-1');
        formData.append('language', 'pt');
        formData.append('response_format', 'json');
        return formData;
    }

    /**
     * Send audio to external transcription API
     * @param {string} apiUrl - API endpoint (e.g. Whisper, Google STT)
     * @param {Object} headers - Additional headers (e.g. Authorization)
     * @returns {Promise<Object>} API response
     */
    async function sendToTranscriptionAPI(apiUrl, headers = {}) {
        const formData = prepareAudioUpload();
        if (!formData) {
            return { success: false, error: 'Nenhum áudio gravado' };
        }

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { ...headers },
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            return { success: true, data: result };
        } catch (err) {
            console.error('[Recorder] Transcription API error:', err);
            return { success: false, error: err.message };
        }
    }

    // ── Public API ──
    return {
        init,
        start,
        stop,
        getTranscript,
        appendManualText,
        clear,
        // Audio chunk API
        getAudioChunks,
        getAudioBlob,
        getAudioStats,
        prepareAudioUpload,
        sendToTranscriptionAPI,
        // Feature flags
        get isSupported() { return speechSupported; },
        get isAudioSupported() { return audioSupported; },
        get isRecording() { return isRecording; },
        // Config access
        AUDIO_CONFIG,
    };
})();
