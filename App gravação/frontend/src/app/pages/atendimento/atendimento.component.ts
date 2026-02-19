
import { Component, inject } from '@angular/core';
import { CommonModule, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { AudioService } from '../../services/audio.service';
import { SinaisVitaisValues, SOAPSection, AnalyzeResponse, DialogEntry } from '../../param-types';

interface VitalRow {
  icon: string;
  label: string;
  value: string;
  ref: string;
  danger: boolean;
}

@Component({
  selector: 'app-atendimento',
  standalone: true,
  imports: [CommonModule, FormsModule, JsonPipe],
  template: `
    <!-- ── Input Card ── -->
    <section class="input-card" [class.recording]="gravando">
      <h2>📝 Entrada Clínica</h2>

      <!-- Patient Info Row -->
      <div class="input-row">
        <div class="input-group">
          <label for="nome">Nome Completo</label>
          <input id="nome" type="text" [(ngModel)]="nomeCompleto"
                 placeholder="Ex: João Oliveira Silva" />
        </div>
        <div class="input-group input-small">
          <label for="idade">Idade</label>
          <input id="idade" type="number" [(ngModel)]="idade" min="0" max="150" />
        </div>
        <div class="input-group">
          <label for="cenario">Cenário</label>
          <select id="cenario" [(ngModel)]="cenarioAtendimento">
            <option value="UBS">UBS</option>
            <option value="PS">PS</option>
            <option value="UTI">UTI</option>
            <option value="Consultório">Consultório</option>
          </select>
        </div>
      </div>

      <!-- Transcription Textarea -->
      <div class="input-group full-width">
        <label for="transcricao">Transcrição / Texto Clínico</label>
        <textarea id="transcricao" rows="6"
                  [(ngModel)]="textoTranscrito"
                  placeholder="Cole a transcrição aqui ou use o botão Gravar..."
                  [disabled]="gravando"></textarea>
      </div>

      <!-- Action Buttons -->
      <div class="actions-row">
        <button class="btn btn-record" (click)="alternarGravacao()"
                [class.active]="gravando">
          <span class="rec-dot" *ngIf="gravando"></span>
          {{ gravando ? '⏹ Parar Gravação' : '🎙️ Gravar' }}
        </button>

        <button class="btn btn-primary" (click)="analisar()"
                [disabled]="processando || !textoTranscrito?.trim()">
          <span class="spinner" *ngIf="processando"></span>
          {{ processando ? 'Processando...' : '🧠 Analisar SOAP' }}
        </button>

        <button class="btn btn-ghost" (click)="limpar()"
                *ngIf="resultado">
          🗑️ Limpar
        </button>
      </div>

      <!-- Recording Timer -->
      <div class="recording-timer" *ngIf="gravando">
        <span class="rec-indicator">●</span>
        Gravando... {{ tempoGravacao }}s
      </div>
    </section>

    <!-- ── Error Banner ── -->
    <section class="error-banner" *ngIf="erro">
      <span>⚠️ {{ erro }}</span>
      <button class="btn-close" (click)="erro = ''">✕</button>
    </section>

    <!-- ═══ RESULT SECTION ═══ -->
    <section class="result-section" *ngIf="resultado">

      <!-- Patient Header -->
      <div class="patient-header" *ngIf="resultado.patient">
        <div class="patient-info">
          <span class="patient-initials">{{ resultado.patient.iniciais }}</span>
          <span class="patient-age">{{ resultado.patient.idade }} anos</span>
          <span class="cenario-chip"
                [ngClass]="'chip-' + resultado.patient.cenario_atendimento.toLowerCase()">
            {{ resultado.patient.cenario_atendimento }}
          </span>
          <span class="lgpd-chip">🔒 LGPD</span>
        </div>
        <div class="patient-meta" *ngIf="resultado.data?.clinical_data">
          <span>CID: <strong>{{ resultado.data!.clinical_data!.cid_principal?.code }}</strong>
                — {{ resultado.data!.clinical_data!.cid_principal?.desc }}</span>
          <span>Gravidade:
            <strong [ngClass]="getGravClass(resultado.data!.clinical_data!.gravidade)">
              {{ resultado.data!.clinical_data!.gravidade }}
            </strong>
          </span>
        </div>
      </div>

      <!-- SOAP Cards Grid -->
      <div class="soap-grid" *ngIf="resultado.data?.soap">
        <div *ngFor="let entry of soapEntries"
             class="soap-card"
             [ngClass]="'soap-' + entry.key">
          <div class="soap-card-head">
            <span class="soap-icon">{{ entry.section.icon }}</span>
            <h3>{{ entry.section.title }}</h3>
          </div>
          <div class="soap-card-body">
            <p class="soap-text">{{ entry.section.content }}</p>

            <!-- Vitals table in Objective -->
            <table class="vitals-table" *ngIf="entry.key === 'objetivo' && vitalRows.length > 0">
              <thead>
                <tr><th>Parâmetro</th><th>Valor</th><th>Ref.</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let v of vitalRows">
                  <td>{{ v.icon }} {{ v.label }}</td>
                  <td [class.vital-danger]="v.danger">{{ v.value }}</td>
                  <td class="ref-col">{{ v.ref }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- JSON Universal -->
      <div class="json-card" *ngIf="resultado.data?.json_universal">
        <h3>📊 JSON Clínico Universal</h3>
        <div class="json-grid">
          <div class="json-item">
            <label>HDA Técnica</label>
            <p>{{ resultado.data!.json_universal!['HDA_Tecnica'] || 'N/D' }}</p>
          </div>
          <div class="json-item">
            <label>Comorbidades</label>
            <p>{{ joinOrDefault(resultado.data!.json_universal!['Comorbidades'], 'Nenhuma') }}</p>
          </div>
          <div class="json-item alert-item">
            <label>⚠️ Alergias</label>
            <p class="text-danger">{{ joinOrDefault(resultado.data!.json_universal!['Alergias'], 'NKDA') }}</p>
          </div>
          <div class="json-item">
            <label>Medicações Atuais</label>
            <p>{{ joinOrDefault(resultado.data!.json_universal!['Medicações_Atuais'], 'Nenhuma') }}</p>
          </div>
        </div>
      </div>

      <!-- Dialog Preview -->
      <div class="dialog-section" *ngIf="resultado.data?.dialog && resultado.data!.dialog!.length > 0">
        <h3>🎙️ Diarização
          <span class="dialog-meta">
            ({{ resultado.data?.dialog?.length || 0 }} falas)
          </span>
        </h3>
        <div class="dialog-entries">
          <div *ngFor="let d of resultado.data!.dialog!.slice(0, 12)"
               class="dialog-bubble"
               [ngClass]="'bubble-' + d.speaker">
            <span class="speaker-tag">
              {{ d.speaker === 'medico' ? '👨‍⚕️ Médico' : '🧑‍🦱 Paciente' }}
            </span>
            <p>{{ d.text }}</p>
          </div>
        </div>
      </div>

      <!-- Documents Preview -->
      <div class="docs-section" *ngIf="resultado.documents">
        <h3>📄 Documentos Gerados</h3>
        <div class="docs-grid">
          <div *ngFor="let doc of docEntries" class="doc-card">
            <div class="doc-header">
              <span class="doc-icon">{{ getDocIcon(doc.key) }}</span>
              <h4>{{ doc.value.title }}</h4>
              <span class="doc-status" [class.validated]="doc.value.validated">
                {{ doc.value.validated ? '✅ Validado' : '⏳ Pendente' }}
              </span>
            </div>
            <pre class="doc-content">{{ doc.value.content }}</pre>
          </div>
        </div>
      </div>

      <!-- Raw JSON (collapsible) -->
      <details class="raw-json-section">
        <summary>🔍 JSON Bruto (Debug)</summary>
        <pre class="json-raw">{{ resultado | json }}</pre>
      </details>

    </section>
  `,
  styles: [`
    /* ═══ Input Card ═══ */
    .input-card {
      background: #1E293B;
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 24px;
      border: 1px solid rgba(255,255,255,0.06);
      transition: border-color 250ms ease;
    }
    .input-card.recording {
      border-color: rgba(239, 68, 68, 0.4);
    }
    .input-card h2 {
      margin-bottom: 20px;
      font-size: 1.15rem;
      color: #E2E8F0;
    }

    .input-row {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .input-group { display: flex; flex-direction: column; gap: 6px; }
    .input-group.full-width { margin-bottom: 16px; }
    .input-group label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #94A3B8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .input-group input,
    .input-group select,
    .input-group textarea {
      background: #0F172A;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      color: #E2E8F0;
      padding: 10px 14px;
      font-size: 0.95rem;
      font-family: 'Inter', sans-serif;
      transition: border-color 200ms ease;
      outline: none;
    }
    .input-group input:focus,
    .input-group select:focus,
    .input-group textarea:focus {
      border-color: #2563EB;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }
    .input-group textarea { resize: vertical; line-height: 1.6; }
    .input-group select { cursor: pointer; }

    /* ═══ Action Buttons ═══ */
    .actions-row {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 24px;
      border: none;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 600;
      font-family: 'Inter', sans-serif;
      cursor: pointer;
      transition: all 200ms ease;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-primary {
      background: linear-gradient(135deg, #2563EB, #1D4ED8);
      color: white;
    }
    .btn-primary:hover:not(:disabled) {
      background: linear-gradient(135deg, #3B82F6, #2563EB);
      box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3);
      transform: translateY(-1px);
    }
    .btn-record {
      background: #1E293B;
      color: #E2E8F0;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .btn-record:hover { border-color: #EF4444; color: #EF4444; }
    .btn-record.active {
      background: rgba(239, 68, 68, 0.1);
      border-color: #EF4444;
      color: #EF4444;
      animation: recordPulse 1.5s infinite;
    }
    .rec-dot {
      width: 8px;
      height: 8px;
      background: #EF4444;
      border-radius: 50%;
      animation: pulse 1s infinite;
    }
    .btn-ghost {
      background: transparent;
      color: #94A3B8;
      border: 1px solid transparent;
    }
    .btn-ghost:hover { color: #E2E8F0; border-color: rgba(255,255,255,0.1); }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    .recording-timer {
      margin-top: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #EF4444;
      font-size: 0.9rem;
      font-weight: 600;
    }
    .rec-indicator {
      font-size: 1.2rem;
      animation: pulse 1s infinite;
    }

    /* ═══ Error Banner ═══ */
    .error-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 20px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 12px;
      margin-bottom: 24px;
      color: #EF4444;
      font-weight: 500;
      animation: fadeInUp 300ms ease;
    }
    .btn-close {
      background: none;
      border: none;
      color: #EF4444;
      font-size: 1.1rem;
      cursor: pointer;
      padding: 4px;
    }

    /* ═══ Results ═══ */
    .result-section {
      animation: fadeInUp 400ms ease;
    }

    /* Patient Header */
    .patient-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      background: linear-gradient(135deg, #1E293B, #0F172A);
      border-radius: 14px;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .patient-info { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .patient-initials {
      font-size: 1.3rem;
      font-weight: 800;
      color: #2563EB;
    }
    .patient-age { color: #94A3B8; font-size: 0.95rem; }
    .cenario-chip {
      padding: 3px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .chip-ubs { background: rgba(6,214,160,0.15); color: #06D6A0; }
    .chip-ps { background: rgba(245,158,11,0.15); color: #F59E0B; }
    .chip-uti { background: rgba(239,68,68,0.15); color: #EF4444; }
    .chip-consultório { background: rgba(37,99,235,0.15); color: #2563EB; }
    .lgpd-chip {
      font-size: 0.75rem;
      color: #06D6A0;
      padding: 3px 10px;
      background: rgba(6,214,160,0.1);
      border-radius: 20px;
      font-weight: 600;
    }
    .patient-meta {
      display: flex;
      gap: 20px;
      color: #94A3B8;
      font-size: 0.9rem;
      flex-wrap: wrap;
    }
    .grav-leve { color: #06D6A0; }
    .grav-moderada { color: #F59E0B; }
    .grav-grave { color: #EF4444; }

    /* ═══ SOAP Grid ═══ */
    .soap-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .soap-card {
      background: #1E293B;
      border-radius: 14px;
      overflow: hidden;
      border-left: 4px solid #2563EB;
      animation: fadeInUp 400ms ease;
    }
    .soap-subjetivo { border-left-color: #06D6A0; }
    .soap-objetivo { border-left-color: #2563EB; }
    .soap-avaliacao { border-left-color: #F59E0B; }
    .soap-plano { border-left-color: #8B5CF6; }

    .soap-card-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .soap-icon { font-size: 1.2rem; }
    .soap-card-head h3 {
      font-size: 0.9rem;
      font-weight: 600;
      color: #E2E8F0;
      margin: 0;
    }
    .soap-card-body {
      padding: 14px 16px;
    }
    .soap-text {
      color: #CBD5E1;
      font-size: 0.9rem;
      line-height: 1.7;
      margin: 0;
      white-space: pre-wrap;
    }

    /* Vitals Table */
    .vitals-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 14px;
      font-size: 0.85rem;
    }
    .vitals-table th, .vitals-table td {
      padding: 8px 10px;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      color: #CBD5E1;
    }
    .vitals-table thead th {
      color: #94A3B8;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .ref-col { color: #64748B; font-size: 0.8rem; }

    /* ═══ JSON Universal Card ═══ */
    .json-card {
      background: #1E293B;
      border-radius: 14px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .json-card h3 { margin: 0 0 16px; color: #E2E8F0; font-size: 1rem; }
    .json-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 14px;
    }
    .json-item label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      color: #94A3B8;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .json-item p { margin: 0; color: #CBD5E1; font-size: 0.9rem; }
    .alert-item {
      background: rgba(239,68,68,0.06);
      border-radius: 10px;
      padding: 10px 14px;
    }

    /* ═══ Dialog ═══ */
    .dialog-section {
      background: #1E293B;
      border-radius: 14px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .dialog-section h3 { margin: 0 0 14px; color: #E2E8F0; font-size: 1rem; }
    .dialog-meta { font-size: 0.85rem; color: #94A3B8; font-weight: 400; }
    .dialog-entries { display: flex; flex-direction: column; gap: 8px; }
    .dialog-bubble {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 10px;
      background: rgba(255,255,255,0.02);
    }
    .bubble-medico { border-left: 3px solid #2563EB; }
    .bubble-paciente { border-left: 3px solid #06D6A0; }
    .speaker-tag {
      white-space: nowrap;
      font-size: 0.8rem;
      font-weight: 600;
      color: #94A3B8;
      min-width: 100px;
    }
    .dialog-bubble p { margin: 0; color: #CBD5E1; font-size: 0.9rem; line-height: 1.5; }

    /* ═══ Documents ═══ */
    .docs-section {
      background: #1E293B;
      border-radius: 14px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .docs-section h3 { margin: 0 0 16px; color: #E2E8F0; font-size: 1rem; }
    .docs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 14px;
    }
    .doc-card {
      background: #0F172A;
      border-radius: 12px;
      overflow: hidden;
    }
    .doc-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .doc-icon { font-size: 1.1rem; }
    .doc-header h4 { flex: 1; margin: 0; font-size: 0.85rem; color: #E2E8F0; }
    .doc-status {
      font-size: 0.75rem;
      font-weight: 600;
      color: #F59E0B;
    }
    .doc-status.validated { color: #06D6A0; }
    .doc-content {
      padding: 14px 16px;
      font-size: 0.8rem;
      color: #94A3B8;
      white-space: pre-wrap;
      line-height: 1.5;
      max-height: 180px;
      overflow-y: auto;
      margin: 0;
      font-family: 'Inter', sans-serif;
    }

    /* ═══ Raw JSON ═══ */
    .raw-json-section {
      background: #1E293B;
      border-radius: 14px;
      padding: 16px 24px;
      margin-bottom: 24px;
    }
    .raw-json-section summary {
      cursor: pointer;
      color: #94A3B8;
      font-weight: 600;
      font-size: 0.9rem;
    }
    .json-raw {
      margin-top: 12px;
      background: #0F172A;
      padding: 16px;
      border-radius: 10px;
      font-size: 0.75rem;
      color: #64748B;
      overflow-x: auto;
      max-height: 400px;
      overflow-y: auto;
      white-space: pre-wrap;
      font-family: 'Consolas', 'Menlo', monospace;
    }

    @media (max-width: 768px) {
      .input-row { grid-template-columns: 1fr; }
      .patient-header { flex-direction: column; align-items: flex-start; }
      .soap-grid { grid-template-columns: 1fr; }
      .docs-grid { grid-template-columns: 1fr; }
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes recordPulse {
      0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
      70% { box-shadow: 0 0 0 12px rgba(239,68,68,0); }
      100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
    }
    .text-danger { color: #EF4444; font-weight: bold; }
  `]
})
export class AtendimentoComponent {

  private http = inject(HttpClient);
  private audioService = inject(AudioService);

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  // ── State ──
  nomeCompleto = '';
  idade = 0;
  cenarioAtendimento = 'PS';
  textoTranscrito = '';

  gravando = false;
  processando = false;
  tempoGravacao = 0;
  erro = '';

  resultado: AnalyzeResponse | null = null;
  soapEntries: { key: string; section: SOAPSection }[] = [];
  vitalRows: VitalRow[] = [];
  docEntries: { key: string; value: any }[] = [];

  private gravacaoInterval: any = null;

  // ══════════════════════════════════════════════════════════════
  // alternarGravacao() — REAL Implementation with AudioService
  // ══════════════════════════════════════════════════════════════

  async alternarGravacao(): Promise<void> {
    if (this.gravando) {
      // STOP recording
      clearInterval(this.gravacaoInterval);
      this.gravando = false;

      // Salvar o texto atual antes de parar (o callback pode não chegar a tempo)
      const textoAtual = this.textoTranscrito || '';

      // Configurar callback final para acionar SOAP
      this.audioService.onFinalTranscript = (fullText: string) => {
        if (fullText && fullText.trim()) {
          this.textoTranscrito = fullText;
        }
        // Acionar SOAP com o texto disponível
        const textoFinal = this.textoTranscrito || textoAtual;
        if (textoFinal && textoFinal.trim()) {
          this.textoTranscrito = textoFinal;
          this.analisar();
        }
      };

      try {
        await this.audioService.pararGravacaoStreaming();

        // Fallback: se o callback final não disparou em 3 segundos, acionar SOAP manualmente
        setTimeout(() => {
          if (!this.processando && this.textoTranscrito && this.textoTranscrito.trim()) {
            this.analisar();
          }
        }, 3000);

      } catch (err: any) {
        this.erro = 'Erro ao parar gravação: ' + (err.message || err);
        // Tentar analisar com o texto que já temos
        if (textoAtual.trim()) {
          this.textoTranscrito = textoAtual;
          this.analisar();
        }
      }
    } else {
      // START recording with streaming
      try {
        this.textoTranscrito = '';
        this.erro = '';

        this.audioService.onPartialTranscript = (text: string, fullText: string) => {
          this.textoTranscrito = fullText || '';
        };
        this.audioService.onFinalTranscript = (fullText: string) => {
          this.textoTranscrito = fullText || '';
        };
        this.audioService.onError = (error: string) => {
          this.erro = 'Erro na transcrição: ' + error;
        };

        await this.audioService.iniciarGravacaoStreaming();
        this.gravando = true;
        this.tempoGravacao = 0;
        this.gravacaoInterval = setInterval(() => {
          this.tempoGravacao++;
        }, 1000);
      } catch (err: any) {
        this.erro = err.message || 'Erro ao iniciar gravação';
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // analisar() — Text based (existing)
  // ══════════════════════════════════════════════════════════════

  analisar(): void {
    if (!this.textoTranscrito || !this.textoTranscrito.trim()) return;

    this.processando = true;
    this.erro = '';
    this.resultado = null;

    // Use FormData as backend expects Form(...)
    const formData = new FormData();
    formData.append('nome_completo', this.nomeCompleto || 'Paciente Anônimo');
    formData.append('idade', (this.idade || 0).toString());
    formData.append('cenario_atendimento', this.cenarioAtendimento);
    formData.append('texto_transcrito', this.textoTranscrito);

    this.http.post<AnalyzeResponse>('/api/analyze', formData, { headers: this.getAuthHeaders() })
      .subscribe({
        next: (res) => {
          this.processando = false;
          this.resultado = res;
          this.processResult();
        },
        error: (err: HttpErrorResponse) => {
          this.processando = false;
          this.erro = err.error?.detail
            || err.error?.message
            || `Erro ${err.status}: ${err.statusText}`;
          console.error('Analyze error:', err);
        },
      });
  }

  analisarAudio(blob: Blob) {
    this.processando = true;
    this.erro = '';
    this.resultado = null;

    const formData = new FormData();
    formData.append('file', blob, 'gravacao.webm'); // [FIX] Field name must match backend 'file'
    formData.append('context', '');
    formData.append('cenario_atendimento', this.cenarioAtendimento);
    formData.append('idade', (this.idade || 0).toString());
    formData.append('nome_completo', this.nomeCompleto || 'Paciente Anônimo');

    // Note: Backend endpoint for audio is currently /scribe/process in main.py
    // I should update it to /api/analyze-audio or similar if I want consistency,
    // but sticking to existing endpoints is safer unless asked.
    this.http.post<AnalyzeResponse>('/scribe/process', formData, { headers: this.getAuthHeaders() })
      .subscribe({
        next: (res) => {
          this.processando = false;
          this.resultado = res;
          this.processResult();

          // Optional: If backend returns transcript, update text box
          // (Currently backend response structure in main.py doesn't seem to return raw transcript in main body, maybe in metadata?)
        },
        error: (err: HttpErrorResponse) => {
          this.processando = false;
          this.erro = err.error?.detail || err.message;
        }
      });
  }

  // ══════════════════════════════════════════════════════════════
  // Process result → derived UI state
  // ══════════════════════════════════════════════════════════════

  private processResult(): void {
    if (!this.resultado || !this.resultado.data) return;

    const data = this.resultado.data;

    // SOAP entries
    this.soapEntries = data.soap
      ? Object.entries(data.soap)
        .filter(([, v]) => !!v)
        .map(([key, section]) => ({ key, section }))
      : [];

    // Vital sign rows with danger thresholds (same as app.js)
    this.buildVitalRows();

    // Document entries
    this.docEntries = this.resultado.documents
      ? Object.entries(this.resultado.documents).map(([key, value]) => ({ key, value }))
      : [];
  }

  /**
   * Build vitals table rows.
   * Danger thresholds: PA 90-140/60-90, FC 50-100, FR 12-22, SpO2 ≥94%, Temp 35.5-37.8
   */
  private buildVitalRows(): void {
    this.vitalRows = [];
    if (!this.resultado?.data) return;

    const sv = this.resultado.data.soap?.['objetivo']?.sinais_vitais
      || this.resultado.data.clinical_data?.sinais_vitais;
    if (!sv) return;

    const abnormal = (val: number | undefined | null, lo: number, hi: number): boolean =>
      val != null && (val < lo || val > hi);

    if (sv.pa) {
      const danger = abnormal(sv.pa.sistolica, 90, 140) || abnormal(sv.pa.diastolica, 60, 90);
      this.vitalRows.push({
        icon: '🫀', label: 'PA',
        value: `${sv.pa.sistolica}x${sv.pa.diastolica} mmHg`,
        ref: '90-140 / 60-90', danger,
      });
    }
    if (sv.fc) {
      this.vitalRows.push({
        icon: '💓', label: 'FC',
        value: `${sv.fc.valor} bpm`,
        ref: '50-100', danger: abnormal(sv.fc.valor, 50, 100),
      });
    }
    if (sv.fr) {
      this.vitalRows.push({
        icon: '🌬️', label: 'FR',
        value: `${sv.fr.valor} irpm`,
        ref: '12-22', danger: abnormal(sv.fr.valor, 12, 22),
      });
    }
    if (sv.sato2) {
      this.vitalRows.push({
        icon: '🩸', label: 'SpO2',
        value: `${sv.sato2.valor}%`,
        ref: '≥ 94%', danger: (sv.sato2.valor ?? 100) < 94,
      });
    }
    if (sv.temperatura) {
      this.vitalRows.push({
        icon: '🌡️', label: 'Temp',
        value: `${sv.temperatura.valor}°C`,
        ref: '35.5-37.8', danger: abnormal(sv.temperatura.valor, 35.5, 37.8),
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════════

  limpar(): void {
    this.resultado = null;
    this.soapEntries = [];
    this.vitalRows = [];
    this.docEntries = [];
    this.erro = '';
  }

  getGravClass(grav: string | undefined): string {
    if (!grav) return '';
    if (grav === 'Grave') return 'grav-grave';
    if (grav === 'Moderada') return 'grav-moderada';
    return 'grav-leve';
  }

  joinOrDefault(arr: string[] | undefined | null, fallback: string): string {
    return arr && arr.length > 0 ? arr.join(', ') : fallback;
  }

  getDocIcon(type: string): string {
    const icons: Record<string, string> = {
      prescription: '💊',
      attestation: '📋',
      exam_request: '🔬',
      patient_guide: '📖',
    };
    return icons[type] || '📄';
  }
}
