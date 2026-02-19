
import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class AudioService {
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];

    private ws: WebSocket | null = null;
    private streamRecorder: MediaRecorder | null = null;
    private streamInterval: any = null;
    private currentStream: MediaStream | null = null;

    // Callbacks for streaming
    onPartialTranscript: ((text: string, fullText: string) => void) | null = null;
    onFinalTranscript: ((fullText: string) => void) | null = null;
    onError: ((error: string) => void) | null = null;

    constructor() { }

    async iniciarGravacao(): Promise<void> {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Navegador não suporta gravação de áudio.');
        }

        // Security check: Localhost or HTTPS
        const isSecure = window.location.hostname === 'localhost' || window.location.protocol === 'https:';
        if (!isSecure) {
            throw new Error('Permissão de microfone requer HTTPS ou localhost.');
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Prefer audio/webm for Whisper compatibility
            const options = { mimeType: 'audio/webm' };
            if (!MediaRecorder.isTypeSupported('audio/webm')) {
                console.warn('audio/webm não suportado, usando default.');
                // navigator will choose default
            }

            this.mediaRecorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm') ? options : undefined);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.start();
        } catch (err: any) {
            console.error('Erro ao acessar microfone:', err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                throw new Error('Permissão de microfone negada. Verifique as configurações do navegador.');
            }
            throw err;
        }
    }

    pararGravacao(): Promise<Blob> {
        return new Promise((resolve, reject) => {
            if (!this.mediaRecorder) {
                return reject(new Error('Gravação não iniciada.'));
            }

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.mediaRecorder!.stream.getTracks().forEach(track => track.stop());
                this.mediaRecorder = null;
                resolve(audioBlob);
            };

            this.mediaRecorder.stop();
        });
    }

    estaGravando(): boolean {
        return this.mediaRecorder?.state === 'recording';
    }

    // ══════════════════════════════════════════════════════════════
    // Streaming Methods (WebSocket)
    // ══════════════════════════════════════════════════════════════

    async iniciarGravacaoStreaming(): Promise<void> {
        this.currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws/transcribe`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'partial' && this.onPartialTranscript) {
                this.onPartialTranscript(data.text, data.full_text);
            } else if (data.type === 'final' && this.onFinalTranscript) {
                this.onFinalTranscript(data.full_text);
            } else if (data.type === 'error' && this.onError) {
                this.onError(data.message);
            }
        };

        this.ws.onerror = () => {
            if (this.onError) this.onError('Erro na conexão WebSocket');
        };

        await new Promise<void>((resolve, reject) => {
            if (!this.ws) return reject('No WebSocket');
            this.ws.onopen = () => resolve();
            setTimeout(() => reject('WebSocket timeout'), 5000);
        });

        // Acumular todos os chunks do MediaRecorder
        const allChunks: Blob[] = [];
        let lastSentLength = 0;

        this.streamRecorder = new MediaRecorder(this.currentStream, { mimeType: 'audio/webm;codecs=opus' });

        this.streamRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                allChunks.push(event.data);
            }
        };

        // Usar timeslice de 1 segundo para acumular chunks frequentemente
        this.streamRecorder.start(1000);

        // A cada 5 segundos, montar o Blob completo do início e enviar
        this.streamInterval = setInterval(() => {
            if (allChunks.length > lastSentLength && this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Criar Blob com TODOS os chunks desde o início
                // Isso garante que o header WebM está presente
                const fullBlob = new Blob(allChunks, { type: 'audio/webm;codecs=opus' });
                fullBlob.arrayBuffer().then(buffer => {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(buffer);
                        lastSentLength = allChunks.length;
                    }
                });
            }
        }, 5000);
    }

    async pararGravacaoStreaming(): Promise<void> {
        if (this.streamInterval) {
            clearInterval(this.streamInterval);
            this.streamInterval = null;
        }

        if (this.streamRecorder && this.streamRecorder.state !== 'inactive') {
            this.streamRecorder.stop();
        }

        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send('stop');
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    if (this.ws) {
                        this.ws.close();
                        this.ws = null;
                    }
                    resolve();
                }, 2000);
            });
        }

        this.streamRecorder = null;
    }
}
