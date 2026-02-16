/**
 * soap-review.component.ts — SOAP Review Component
 * Medical Scribe Enterprise v3.0 (Angular 17)
 * Direct translation of renderSOAPReview() from app.js
 * Displays SOAP cards, vitals table with vital-danger, jsonUniversal, dialog preview
 */

import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

// ── Interfaces (same structure as JS MVP) ──

interface PressaoArterial {
    sistolica: number;
    diastolica: number;
    raw: string;
}

interface SinalVital {
    valor: number;
    raw: string;
}

interface SinaisVitais {
    pa: PressaoArterial | null;
    fc: SinalVital | null;
    temperatura: SinalVital | null;
    sato2: SinalVital | null;
    fr: SinalVital | null;
}

interface CidPrincipal {
    code: string;
    desc: string;
}

interface ClinicalData {
    cid_principal: CidPrincipal;
    sinais_vitais: SinaisVitais;
    medicacoes_atuais: string[];
    alergias: string[];
    comorbidades: string[];
    gravidade: string;
}

interface SOAPSection {
    title: string;
    icon: string;
    content: string;
    sinais_vitais?: SinaisVitais;
    [key: string]: any;
}

interface JsonUniversal {
    HDA_Tecnica: string;
    Comorbidades: string[];
    Alergias: string[];
    'Medicações_Atuais': string[];
}

interface DialogEntry {
    speaker: string;
    text: string;
}

interface ProcessingMetadata {
    total_falas: number;
    falas_medico: number;
    falas_paciente: number;
    processado_em: string;
}

interface PatientData {
    iniciais: string;
    paciente_id: string;
    idade: number;
    cenario_atendimento: string;
}

// ── Vital sign row for template ──

interface VitalRow {
    icon: string;
    label: string;
    value: string;
    ref: string;
    danger: boolean;
}

@Component({
    selector: 'app-soap-review',
    standalone: true,
    imports: [CommonModule],
    template: `
    <!-- Patient Header -->
    <div class="patient-header" *ngIf="patient">
      <div class="patient-info">
        <span class="patient-initials">{{ patient.iniciais }}</span>
        <span class="patient-detail">{{ patient.idade }} anos</span>
        <span class="cenario-tag" [ngClass]="'tag-' + patient.cenario_atendimento.toLowerCase()">
          {{ patient.cenario_atendimento }}
        </span>
        <span class="lgpd-badge" title="Dados anonimizados conforme LGPD">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          LGPD
        </span>
      </div>
      <div class="patient-meta">
        <span>ID: {{ patient.paciente_id }}</span>
        <span>Gravidade:
          <strong [ngClass]="'grav-' + gravidade.toLowerCase()">{{ gravidade }}</strong>
        </span>
      </div>
    </div>

    <!-- SOAP Cards Grid -->
    <div class="soap-grid">
      <div *ngFor="let entry of soapEntries"
           class="soap-card"
           [ngClass]="'soap-' + entry.key">
        <div class="soap-card-header">
          <span class="soap-icon">{{ entry.section.icon || '' }}</span>
          <h3>{{ entry.section.title || entry.key }}</h3>
        </div>
        <div class="soap-card-content">
          <p>{{ entry.section.content || '' }}</p>

          <!-- Vitals Table (Objective card only) -->
          <table class="vitals-table" *ngIf="entry.key === 'objetivo' && vitalRows.length > 0">
            <thead>
              <tr>
                <th>Parâmetro</th>
                <th>Valor</th>
                <th>Ref.</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of vitalRows">
                <th>{{ row.icon }} {{ row.label }}</th>
                <td [class.vital-danger]="row.danger">{{ row.value }}</td>
                <td>{{ row.ref }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- JSON Universal Card -->
    <div class="json-card" *ngIf="jsonUniversal">
      <h4>📊 JSON Clínico Universal</h4>
      <div class="json-grid">
        <div class="json-item">
          <label>HDA Técnica</label>
          <p>{{ jsonUniversal.HDA_Tecnica || 'Não disponível' }}</p>
        </div>
        <div class="json-item">
          <label>Comorbidades</label>
          <p>{{ (jsonUniversal.Comorbidades || []).length > 0
                ? jsonUniversal.Comorbidades.join(', ')
                : 'Nenhuma identificada' }}</p>
        </div>
        <div class="json-item alergias-highlight">
          <label>⚠️ Alergias</label>
          <p class="alergias-text">
            {{ (jsonUniversal.Alergias || []).length > 0
                ? jsonUniversal.Alergias.join(', ')
                : 'NKDA' }}
          </p>
        </div>
        <div class="json-item">
          <label>Medicações Atuais</label>
          <p>{{ (medicacoesAtuais || []).length > 0
                ? medicacoesAtuais.join(', ')
                : 'Nenhuma registrada' }}</p>
        </div>
      </div>
    </div>

    <!-- Diarization Preview -->
    <div class="dialog-preview" *ngIf="dialog && dialog.length > 0">
      <h4>🎙️ Diarização ({{ totalFalas }} falas: {{ falasMedico }} médico, {{ falasPaciente }} paciente)</h4>
      <div class="dialog-entries">
        <div *ngFor="let entry of dialogPreview"
             class="dialog-entry"
             [ngClass]="'speaker-' + entry.speaker">
          <span class="speaker-badge">
            {{ entry.speaker === 'medico' ? '👨‍⚕️' : '🧑‍🦱' }}
            {{ entry.speaker === 'medico' ? 'Médico' : 'Paciente' }}
          </span>
          <p>{{ entry.text }}</p>
        </div>
      </div>
    </div>
  `,
    styles: [`
    /* ── Same CSS from styles.css (vital-danger, soap cards) ── */

    .patient-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .patient-info { display: flex; align-items: center; gap: 12px; }
    .patient-initials {
      font-size: 1.2rem;
      font-weight: 700;
      color: #2563EB;
    }
    .patient-detail { color: #94A3B8; }
    .patient-meta { display: flex; gap: 16px; color: #94A3B8; font-size: 0.9rem; }

    .cenario-tag {
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .tag-ubs { background: #06D6A033; color: #06D6A0; }
    .tag-ps { background: #F59E0B33; color: #F59E0B; }
    .tag-uti { background: #EF444433; color: #EF4444; }
    .tag-consultório { background: #2563EB33; color: #2563EB; }

    .lgpd-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: rgba(6, 214, 160, 0.15);
      color: #06D6A0;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .grav-leve { color: #06D6A0; }
    .grav-moderada { color: #F59E0B; }
    .grav-grave { color: #EF4444; }
    .grav-n\/a { color: #94A3B8; }

    /* SOAP Grid */
    .soap-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
    .soap-card {
      background: #1e293b;
      border-radius: 12px;
      overflow: hidden;
      border-left: 4px solid #2563EB;
    }
    .soap-subjetivo { border-left-color: #06D6A0; }
    .soap-objetivo { border-left-color: #2563EB; }
    .soap-avaliacao { border-left-color: #F59E0B; }
    .soap-plano { border-left-color: #8B5CF6; }

    .soap-card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: rgba(255,255,255,0.03);
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .soap-icon { font-size: 1.3rem; }
    .soap-card-header h3 {
      margin: 0;
      font-size: 0.95rem;
      color: #E2E8F0;
    }
    .soap-card-content {
      padding: 14px 16px;
      color: #CBD5E1;
      font-size: 0.9rem;
      line-height: 1.6;
    }
    .soap-card-content p { margin: 0; }

    /* Vitals Table — same thresholds as JS MVP */
    .vitals-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 0.85rem;
    }
    .vitals-table th, .vitals-table td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      color: #CBD5E1;
    }
    .vitals-table thead th {
      color: #94A3B8;
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
    }
    /* vital-danger — same red highlight from CSS */
    .vital-danger {
      color: #EF4444 !important;
      font-weight: 700;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 4px;
    }

    /* JSON Universal Card */
    .json-card {
      background: #1e293b;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .json-card h4 { margin: 0 0 16px; color: #E2E8F0; }
    .json-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }
    .json-item label {
      display: block;
      color: #94A3B8;
      font-size: 0.8rem;
      margin-bottom: 4px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .json-item p { margin: 0; color: #CBD5E1; font-size: 0.9rem; }
    .alergias-highlight {
      background: rgba(239, 68, 68, 0.08);
      border-radius: 8px;
      padding: 8px 12px;
    }
    .alergias-text { color: #EF4444 !important; font-weight: 700; }

    /* Dialog Preview */
    .dialog-preview {
      background: #1e293b;
      border-radius: 12px;
      padding: 20px;
    }
    .dialog-preview h4 { margin: 0 0 12px; color: #E2E8F0; }
    .dialog-entries { display: flex; flex-direction: column; gap: 8px; }
    .dialog-entry {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 8px;
      background: rgba(255,255,255,0.02);
    }
    .speaker-medico { border-left: 3px solid #2563EB; }
    .speaker-paciente { border-left: 3px solid #06D6A0; }
    .speaker-badge {
      white-space: nowrap;
      font-size: 0.8rem;
      font-weight: 600;
      color: #94A3B8;
    }
    .dialog-entry p { margin: 0; color: #CBD5E1; font-size: 0.9rem; }
  `]
})
export class SoapReviewComponent implements OnChanges {

    @Input() soapResult: any = null;
    @Input() patient: PatientData | null = null;

    // Derived state
    soap: Record<string, SOAPSection> = {};
    jsonUniversal: JsonUniversal | null = null;
    clinicalData: ClinicalData | null = null;
    dialog: DialogEntry[] = [];
    metadata: ProcessingMetadata | null = null;

    soapEntries: { key: string; section: SOAPSection }[] = [];
    vitalRows: VitalRow[] = [];
    medicacoesAtuais: string[] = [];
    dialogPreview: DialogEntry[] = [];

    gravidade = 'N/A';
    totalFalas = 0;
    falasMedico = 0;
    falasPaciente = 0;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['soapResult'] || changes['patient']) {
            this.processData();
        }
    }

    private processData(): void {
        if (!this.soapResult) return;

        // ── Safe defaults (same null safety from app.js) ──
        this.soap = this.soapResult.soap || {};
        this.jsonUniversal = this.soapResult.jsonUniversal || {
            HDA_Tecnica: '',
            Comorbidades: [],
            Alergias: [],
            'Medicações_Atuais': [],
        };
        this.clinicalData = this.soapResult.clinicalData || {
            cid_principal: { code: '—', desc: 'Não identificado' },
            gravidade: 'N/A',
        } as ClinicalData;
        this.dialog = this.soapResult.dialog || [];
        this.metadata = this.soapResult.metadata || {};

        // Safe access helpers
        this.gravidade = this.clinicalData?.gravidade || 'N/A';
        this.totalFalas = this.metadata?.total_falas || this.dialog.length || 0;
        this.falasMedico = this.metadata?.falas_medico
            || this.dialog.filter(d => d.speaker === 'medico').length || 0;
        this.falasPaciente = this.metadata?.falas_paciente
            || this.dialog.filter(d => d.speaker === 'paciente').length || 0;
        this.medicacoesAtuais = (this.jsonUniversal as any)?.['Medicações_Atuais'] || [];
        this.dialogPreview = this.dialog.slice(0, 10);

        // Build SOAP entries array for template
        this.soapEntries = Object.entries(this.soap)
            .filter(([, section]) => !!section)
            .map(([key, section]) => ({ key, section }));

        // Build vital rows for Objective card
        this.buildVitalRows();
    }

    /**
     * Build vital sign rows with danger thresholds.
     * Same thresholds as renderSOAPReview() in app.js:
     * PA: 90-140 / 60-90, FC: 50-100, FR: 12-22, SatO2: ≥94%, Temp: 35.5-37.8
     */
    private buildVitalRows(): void {
        this.vitalRows = [];
        const sv = this.soap['objetivo']?.sinais_vitais;
        if (!sv) return;

        const isAbnormal = (val: number | null | undefined, low: number, high: number): boolean =>
            val !== null && val !== undefined && (val < low || val > high);

        if (sv.pa) {
            const abnormal = isAbnormal(sv.pa.sistolica, 90, 140) || isAbnormal(sv.pa.diastolica, 60, 90);
            this.vitalRows.push({
                icon: '🫀', label: 'PA',
                value: `${sv.pa.sistolica}x${sv.pa.diastolica} mmHg`,
                ref: '90-140 / 60-90', danger: abnormal,
            });
        }
        if (sv.fc) {
            this.vitalRows.push({
                icon: '💓', label: 'FC',
                value: `${sv.fc.valor} bpm`,
                ref: '50-100', danger: isAbnormal(sv.fc.valor, 50, 100),
            });
        }
        if (sv.fr) {
            this.vitalRows.push({
                icon: '🌬️', label: 'FR',
                value: `${sv.fr.valor} irpm`,
                ref: '12-22', danger: isAbnormal(sv.fr.valor, 12, 22),
            });
        }
        if (sv.sato2) {
            this.vitalRows.push({
                icon: '🩸', label: 'SpO2',
                value: `${sv.sato2.valor}%`,
                ref: '≥ 94%', danger: sv.sato2.valor < 94,
            });
        }
        if (sv.temperatura) {
            this.vitalRows.push({
                icon: '🌡️', label: 'Temp',
                value: `${sv.temperatura.valor}°C`,
                ref: '35.5-37.8', danger: isAbnormal(sv.temperatura.valor, 35.5, 37.8),
            });
        }
    }
}
