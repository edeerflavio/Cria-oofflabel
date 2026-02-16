/**
 * dashboard.component.ts — BI Dashboard Component
 * Medical Scribe Enterprise v3.0 (Angular 17)
 * Direct translation of bi-module.js
 * Uses ng2-charts (Chart.js wrapper) for: Cenário bar, Gravidade doughnut,
 * CIDs horizontal bar, Timeline line chart + stat cards + critical alerts
 */

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';

// ── Interfaces ──

interface BIRecord {
    iniciais: string;
    cenario: string;
    cid_principal: string;
    cid_desc: string;
    gravidade_estimada: string;
    sinais_vitais: any;
    timestamp: string;
    hora: number;
    dia_semana: string;
}

interface VitalsAvg {
    avgSat: string;
    avgFC: string;
    count: number;
}

interface CriticalRecord {
    iniciais: string;
    cenario: string;
    flags: string[];
    timestamp: string;
}

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule, BaseChartDirective],
    template: `
    <!-- Empty State -->
    <div class="bi-empty" *ngIf="records.length === 0 && !loading">
      <div class="bi-empty-icon">📊</div>
      <h3>Nenhum dado ainda</h3>
      <p>Os dashboards serão populados após o primeiro ciclo de atendimento.</p>
      <button class="btn btn-secondary" (click)="loadDemoData()">
        Carregar Dados Demo
      </button>
    </div>

    <!-- Dashboard Content -->
    <div *ngIf="records.length > 0">

      <!-- Stat Cards Row -->
      <div class="bi-stats-row">
        <div class="bi-stat-card">
          <div class="bi-stat-number">{{ records.length }}</div>
          <div class="bi-stat-label">Total Atendimentos</div>
        </div>
        <div class="bi-stat-card">
          <div class="bi-stat-number">{{ gravesCount }}</div>
          <div class="bi-stat-label">Casos Graves</div>
        </div>
        <div class="bi-stat-card">
          <div class="bi-stat-number">{{ cenariosCount }}</div>
          <div class="bi-stat-label">Cenários Ativos</div>
        </div>
        <div class="bi-stat-card">
          <div class="bi-stat-number">{{ cidsCount }}</div>
          <div class="bi-stat-label">CIDs Únicos</div>
        </div>

        <!-- Vitals Stat Cards (PS vs UTI) -->
        <div class="bi-stat-card">
          <div class="bi-stat-number" style="font-size:1.4rem">
            <span title="PS">🏥 {{ psVitals.avgSat }}%</span>
            <span style="margin:0 4px;opacity:0.4">|</span>
            <span title="UTI">🏨 {{ utiVitals.avgSat }}%</span>
          </div>
          <div class="bi-stat-label">Média SatO2 (PS | UTI)</div>
        </div>
        <div class="bi-stat-card">
          <div class="bi-stat-number" style="font-size:1.4rem">
            <span title="PS">🏥 {{ psVitals.avgFC }}</span>
            <span style="margin:0 4px;opacity:0.4">|</span>
            <span title="UTI">🏨 {{ utiVitals.avgFC }}</span>
          </div>
          <div class="bi-stat-label">FC Média bpm (PS | UTI)</div>
        </div>
      </div>

      <!-- Critical Vitals Alert -->
      <div class="bi-critical-alert" *ngIf="criticalRecords.length > 0">
        <div class="bi-critical-header">
          <span class="bi-critical-icon">⚠️</span>
          <h4>Sinais Vitais Críticos ({{ criticalRecords.length }} registro{{ criticalRecords.length > 1 ? 's' : '' }})</h4>
        </div>
        <div class="bi-critical-body">
          <div class="bi-critical-item" *ngFor="let r of criticalRecords.slice(0, 5)">
            <span class="lgpd-badge-sm">🔒</span> {{ r.iniciais }}
            <span class="cenario-tag" [ngClass]="'tag-' + r.cenario.toLowerCase()">{{ r.cenario }}</span>
            <strong style="color:#EF4444">{{ r.flags.join(' • ') }}</strong>
            <span style="opacity:0.6;font-size:0.85rem">{{ formatDate(r.timestamp) }}</span>
          </div>
          <div *ngIf="criticalRecords.length > 5" style="opacity:0.6;font-size:0.85rem;margin-top:8px">
            ...e mais {{ criticalRecords.length - 5 }} registro(s)
          </div>
        </div>
      </div>

      <!-- Charts Grid -->
      <div class="bi-charts-grid">
        <!-- Cenário Bar Chart -->
        <div class="bi-chart-card">
          <h4>Atendimentos por Cenário</h4>
          <canvas baseChart
            [datasets]="cenarioData.datasets"
            [labels]="cenarioData.labels"
            [options]="barOptions"
            type="bar">
          </canvas>
        </div>

        <!-- Gravidade Doughnut Chart -->
        <div class="bi-chart-card">
          <h4>Distribuição de Gravidade</h4>
          <canvas baseChart
            [datasets]="gravidadeData.datasets"
            [labels]="gravidadeData.labels"
            [options]="doughnutOptions"
            type="doughnut">
          </canvas>
        </div>

        <!-- Top CIDs Horizontal Bar -->
        <div class="bi-chart-card">
          <h4>Top CIDs</h4>
          <canvas baseChart
            [datasets]="cidData.datasets"
            [labels]="cidData.labels"
            [options]="horizontalBarOptions"
            type="bar">
          </canvas>
        </div>

        <!-- Timeline Line Chart -->
        <div class="bi-chart-card">
          <h4>Atendimentos por Horário</h4>
          <canvas baseChart
            [datasets]="timelineData.datasets"
            [labels]="timelineData.labels"
            [options]="lineOptions"
            type="line">
          </canvas>
        </div>
      </div>

      <!-- Records Table -->
      <div class="bi-table-section">
        <h4>Últimos Registros</h4>
        <div class="bi-table-wrap">
          <table class="bi-table">
            <thead>
              <tr>
                <th>Iniciais</th>
                <th>Cenário</th>
                <th>CID</th>
                <th>Gravidade</th>
                <th>Data/Hora</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of latestRecords">
                <td><span class="lgpd-badge-sm">🔒</span> {{ r.iniciais }}</td>
                <td><span class="cenario-tag" [ngClass]="'tag-' + r.cenario.toLowerCase()">{{ r.cenario }}</span></td>
                <td>{{ r.cid_principal }}</td>
                <td>
                  <span class="grav-badge" [ngClass]="getGravClass(r.gravidade_estimada)">
                    {{ r.gravidade_estimada }}
                  </span>
                </td>
                <td>{{ formatDate(r.timestamp) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
    styles: [`
    /* Same colors & styling from bi-module.js chart config */

    .bi-empty {
      text-align: center;
      padding: 60px 20px;
      color: #94A3B8;
    }
    .bi-empty-icon { font-size: 3rem; margin-bottom: 12px; }
    .bi-empty h3 { color: #E2E8F0; margin-bottom: 8px; }
    .btn-secondary {
      padding: 10px 24px;
      border: 1px solid #2563EB;
      background: transparent;
      color: #2563EB;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      margin-top: 16px;
      transition: all 0.2s;
    }
    .btn-secondary:hover { background: #2563EB; color: white; }

    .bi-stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .bi-stat-card {
      background: #1e293b;
      border-radius: 12px;
      padding: 16px;
      text-align: center;
    }
    .bi-stat-number { font-size: 1.8rem; font-weight: 700; color: #2563EB; }
    .bi-stat-label { color: #94A3B8; font-size: 0.85rem; margin-top: 4px; }

    .bi-critical-alert {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .bi-critical-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .bi-critical-header h4 { color: #EF4444; margin: 0; }
    .bi-critical-icon { font-size: 1.3rem; }
    .bi-critical-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      color: #CBD5E1;
      font-size: 0.9rem;
    }
    .lgpd-badge-sm { font-size: 0.75rem; }

    .bi-charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
    .bi-chart-card {
      background: #1e293b;
      border-radius: 12px;
      padding: 20px;
      min-height: 280px;
    }
    .bi-chart-card h4 { margin: 0 0 16px; color: #E2E8F0; }

    .bi-table-section {
      background: #1e293b;
      border-radius: 12px;
      padding: 20px;
    }
    .bi-table-section h4 { margin: 0 0 12px; color: #E2E8F0; }
    .bi-table-wrap { overflow-x: auto; }
    .bi-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .bi-table th, .bi-table td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      color: #CBD5E1;
    }
    .bi-table thead th { color: #94A3B8; font-weight: 600; text-transform: uppercase; font-size: 0.8rem; }

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

    .grav-badge { padding: 2px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; }
    .grav-grave { background: #EF444433; color: #EF4444; }
    .grav-moderada { background: #F59E0B33; color: #F59E0B; }
    .grav-leve { background: #06D6A033; color: #06D6A0; }
  `]
})
export class DashboardComponent implements OnInit {

    records: BIRecord[] = [];
    loading = false;

    // Derived stats
    gravesCount = 0;
    cenariosCount = 0;
    cidsCount = 0;
    latestRecords: BIRecord[] = [];
    criticalRecords: CriticalRecord[] = [];
    psVitals: VitalsAvg = { avgSat: '--', avgFC: '--', count: 0 };
    utiVitals: VitalsAvg = { avgSat: '--', avgFC: '--', count: 0 };

    // ── Chart configurations (same colors as bi-module.js) ──

    cenarioData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
    gravidadeData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
    cidData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
    timelineData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };

    // Same chart options from bi-module.js
    barOptions: ChartConfiguration<'bar'>['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } },
            x: { grid: { display: false }, ticks: { color: '#94A3B8' } },
        },
    };

    doughnutOptions: ChartConfiguration<'doughnut'>['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
            legend: { position: 'bottom', labels: { color: '#94A3B8', padding: 16, usePointStyle: true } },
        },
    };

    horizontalBarOptions: ChartConfiguration<'bar'>['options'] = {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } },
            y: { grid: { display: false }, ticks: { color: '#94A3B8' } },
        },
    };

    lineOptions: ChartConfiguration<'line'>['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } },
            x: { grid: { display: false }, ticks: { color: '#94A3B8' } },
        },
    };

    ngOnInit(): void {
        // Records would be loaded from a service in production
        // For now, component expects records to be set externally or via loadDemoData()
    }

    /**
     * Load demo data — same generateDemoData() from bi-module.js
     */
    loadDemoData(): void {
        this.loading = true;
        const cenarios = ['UBS', 'PS', 'UTI', 'Consultório'];
        const cids = [
            { code: 'I10', desc: 'Hipertensão' },
            { code: 'E11', desc: 'Diabetes tipo 2' },
            { code: 'J18', desc: 'Pneumonia' },
            { code: 'R51', desc: 'Cefaleia' },
            { code: 'N39.0', desc: 'ITU' },
            { code: 'M54.5', desc: 'Lombalgia' },
            { code: 'J45', desc: 'Asma' },
            { code: 'K29', desc: 'Gastrite' },
            { code: 'F41', desc: 'Ansiedade' },
            { code: 'A90', desc: 'Dengue' },
        ];
        const gravidades = ['Leve', 'Moderada', 'Grave'];
        const iniciais = ['J.O.S.', 'M.A.C.', 'P.R.L.', 'A.B.F.', 'C.D.E.', 'L.M.N.'];

        this.records = [];

        for (let i = 0; i < 50; i++) {
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 30));
            date.setHours(Math.floor(Math.random() * 14) + 7);

            const cenario = cenarios[Math.floor(Math.random() * cenarios.length)];
            const isICU = cenario === 'UTI';

            const paS = isICU ? 80 + Math.floor(Math.random() * 130) : 100 + Math.floor(Math.random() * 60);
            const paD = Math.floor(paS * 0.6) + Math.floor(Math.random() * 15);
            const fc = isICU ? 50 + Math.floor(Math.random() * 80) : 60 + Math.floor(Math.random() * 40);
            const sat = isICU ? 82 + Math.floor(Math.random() * 18) : 92 + Math.floor(Math.random() * 8);
            const temp = 36 + Math.random() * 3;
            const fr = 12 + Math.floor(Math.random() * 16);

            this.records.push({
                iniciais: iniciais[Math.floor(Math.random() * iniciais.length)],
                cenario,
                cid_principal: cids[Math.floor(Math.random() * cids.length)].code,
                cid_desc: cids[Math.floor(Math.random() * cids.length)].desc,
                gravidade_estimada: gravidades[Math.floor(Math.random() * gravidades.length)],
                sinais_vitais: {
                    pa: { sistolica: paS, diastolica: paD, raw: `PA ${paS}x${paD}` },
                    fc: { valor: fc, raw: `FC ${fc}` },
                    sato2: { valor: sat, raw: `SpO2 ${sat}%` },
                    temperatura: { valor: parseFloat(temp.toFixed(1)), raw: `Temp ${temp.toFixed(1)}` },
                    fr: { valor: fr, raw: `FR ${fr}` },
                },
                timestamp: date.toISOString(),
                hora: date.getHours(),
                dia_semana: date.toLocaleDateString('pt-BR', { weekday: 'long' }),
            });
        }

        this.processRecords();
        this.loading = false;
    }

    /**
     * Process records and build all chart data + stats.
     * Same logic as renderDashboards(), renderCenarioChart(), etc. from bi-module.js
     */
    private processRecords(): void {
        // Stats
        this.gravesCount = this.records.filter(r => r.gravidade_estimada === 'Grave').length;
        this.cenariosCount = new Set(this.records.map(r => r.cenario)).size;
        this.cidsCount = new Set(this.records.map(r => r.cid_principal)).size;

        // Latest records (sorted by timestamp, top 15)
        this.latestRecords = [...this.records]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 15);

        // Vitals averages (PS vs UTI) — same as computeVitalsAvg()
        this.psVitals = this.computeVitalsAvg('PS');
        this.utiVitals = this.computeVitalsAvg('UTI');

        // Critical alerts (PA Sist > 180 or SatO2 < 90%) — same as renderCriticalVitalsAlert()
        this.criticalRecords = this.records
            .filter(r => {
                if (!r.sinais_vitais) return false;
                const highPA = r.sinais_vitais.pa && r.sinais_vitais.pa.sistolica > 180;
                const lowSat = r.sinais_vitais.sato2 && r.sinais_vitais.sato2.valor < 90;
                return highPA || lowSat;
            })
            .map(r => {
                const flags: string[] = [];
                if (r.sinais_vitais.pa?.sistolica > 180) {
                    flags.push(`PA ${r.sinais_vitais.pa.sistolica}x${r.sinais_vitais.pa.diastolica}`);
                }
                if (r.sinais_vitais.sato2?.valor < 90) {
                    flags.push(`SpO2 ${r.sinais_vitais.sato2.valor}%`);
                }
                return { iniciais: r.iniciais, cenario: r.cenario, flags, timestamp: r.timestamp };
            });

        // Build charts
        this.buildCenarioChart();
        this.buildGravidadeChart();
        this.buildCidChart();
        this.buildTimelineChart();
    }

    /**
     * Cenário bar chart — same as renderCenarioChart()
     * Colors: #2563EB, #06D6A0, #F59E0B, #EF4444
     */
    private buildCenarioChart(): void {
        const counts: Record<string, number> = {};
        this.records.forEach(r => { counts[r.cenario] = (counts[r.cenario] || 0) + 1; });

        this.cenarioData = {
            labels: Object.keys(counts),
            datasets: [{
                label: 'Atendimentos',
                data: Object.values(counts),
                backgroundColor: ['#2563EB', '#06D6A0', '#F59E0B', '#EF4444'],
                borderRadius: 8,
                borderSkipped: false,
            }],
        };
    }

    /**
     * Gravidade doughnut — same as renderGravidadeChart()
     * Colors: Leve=#06D6A0, Moderada=#F59E0B, Grave=#EF4444
     */
    private buildGravidadeChart(): void {
        const counts: Record<string, number> = { 'Leve': 0, 'Moderada': 0, 'Grave': 0 };
        this.records.forEach(r => {
            if (counts[r.gravidade_estimada] !== undefined) counts[r.gravidade_estimada]++;
        });

        this.gravidadeData = {
            labels: Object.keys(counts),
            datasets: [{
                data: Object.values(counts),
                backgroundColor: ['#06D6A0', '#F59E0B', '#EF4444'],
                borderWidth: 0,
                spacing: 4,
            }],
        };
    }

    /**
     * Top CIDs horizontal bar — same as renderCidChart()
     * Top 8 CIDs sorted by count, color: #2563EB
     */
    private buildCidChart(): void {
        const counts: Record<string, number> = {};
        this.records.forEach(r => { counts[r.cid_principal] = (counts[r.cid_principal] || 0) + 1; });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);

        this.cidData = {
            labels: sorted.map(s => s[0]),
            datasets: [{
                label: 'Ocorrências',
                data: sorted.map(s => s[1]),
                backgroundColor: '#2563EB',
                borderRadius: 6,
                borderSkipped: false,
            }],
        };
    }

    /**
     * Timeline line chart — same as renderTimelineChart()
     * Hours 7-22, color: #2563EB
     */
    private buildTimelineChart(): void {
        const hourCounts: Record<number, number> = {};
        for (let h = 7; h <= 22; h++) hourCounts[h] = 0;
        this.records.forEach(r => {
            const h = r.hora || new Date(r.timestamp).getHours();
            if (hourCounts[h] !== undefined) hourCounts[h]++;
        });

        this.timelineData = {
            labels: Object.keys(hourCounts).map(h => `${h}h`),
            datasets: [{
                label: 'Atendimentos',
                data: Object.values(hourCounts),
                borderColor: '#2563EB',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#2563EB',
                pointBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6,
            }],
        };
    }

    /**
     * Compute average vitals per scenario — same as computeVitalsAvg()
     */
    private computeVitalsAvg(cenario: string): VitalsAvg {
        const filtered = this.records.filter(r => r.cenario === cenario && r.sinais_vitais);
        if (filtered.length === 0) return { avgSat: '--', avgFC: '--', count: 0 };

        let satSum = 0, satCount = 0, fcSum = 0, fcCount = 0;
        filtered.forEach(r => {
            if (r.sinais_vitais.sato2?.valor) { satSum += r.sinais_vitais.sato2.valor; satCount++; }
            if (r.sinais_vitais.fc?.valor) { fcSum += r.sinais_vitais.fc.valor; fcCount++; }
        });

        return {
            avgSat: satCount > 0 ? (satSum / satCount).toFixed(1) : '--',
            avgFC: fcCount > 0 ? (fcSum / fcCount).toFixed(0) : '--',
            count: filtered.length,
        };
    }

    // ── Helpers ──

    getGravClass(grav: string): string {
        if (grav === 'Grave') return 'grav-grave';
        if (grav === 'Moderada') return 'grav-moderada';
        return 'grav-leve';
    }

    formatDate(ts: string): string {
        return new Date(ts).toLocaleString('pt-BR');
    }
}
