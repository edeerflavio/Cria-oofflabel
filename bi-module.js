/**
 * bi-module.js — Business Intelligence Module
 * Medical Scribe v1.0
 * Collects anonymous data per cycle and renders Chart.js dashboards
 */

const BIModule = (() => {

    let charts = {};

    /**
     * Record anonymous BI data from a completed consultation cycle
     */
    async function recordCycle(patientData, soapResult) {
        const record = {
            iniciais: patientData.iniciais,
            cenario: patientData.cenario_atendimento,
            cid_principal: soapResult.clinicalData.cid_principal.code,
            cid_desc: soapResult.clinicalData.cid_principal.desc,
            gravidade_estimada: soapResult.clinicalData.gravidade,
            sinais_vitais: soapResult.clinicalData.sinais_vitais || null,
            timestamp: new Date().toISOString(),
            hora: new Date().getHours(),
            dia_semana: new Date().toLocaleDateString('pt-BR', { weekday: 'long' })
        };

        await MedScribeDB.add('bi_records', record);
        return record;
    }

    /**
     * Get all BI records
     */
    async function getAllRecords() {
        return await MedScribeDB.getAll('bi_records');
    }

    /**
     * Generate demo data for dashboard preview
     */
    async function generateDemoData() {
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

        for (let i = 0; i < 50; i++) {
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 30));
            date.setHours(Math.floor(Math.random() * 14) + 7);

            const cenario = cenarios[Math.floor(Math.random() * cenarios.length)];
            // Generate realistic vital signs for demo
            const isICU = cenario === 'UTI';
            const isPS = cenario === 'PS';
            const paS = isICU ? 80 + Math.floor(Math.random() * 130) : 100 + Math.floor(Math.random() * 60);
            const paD = Math.floor(paS * 0.6) + Math.floor(Math.random() * 15);
            const fc = isICU ? 50 + Math.floor(Math.random() * 80) : 60 + Math.floor(Math.random() * 40);
            const sat = isICU ? 82 + Math.floor(Math.random() * 18) : 92 + Math.floor(Math.random() * 8);
            const temp = 36 + Math.random() * 3;
            const fr = 12 + Math.floor(Math.random() * 16);

            const record = {
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
                dia_semana: date.toLocaleDateString('pt-BR', { weekday: 'long' })
            };

            await MedScribeDB.add('bi_records', record);
        }
    }

    /**
     * Render all dashboard charts
     */
    async function renderDashboards(containerId) {
        const records = await getAllRecords();
        const container = document.getElementById(containerId);
        if (!container) return;

        if (records.length === 0) {
            container.innerHTML = `
                <div class="bi-empty">
                    <div class="bi-empty-icon">📊</div>
                    <h3>Nenhum dado ainda</h3>
                    <p>Os dashboards serão populados após o primeiro ciclo de atendimento.</p>
                    <button class="btn btn-secondary" onclick="BIModule.loadDemoAndRender('${containerId}')">
                        Carregar Dados Demo
                    </button>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="bi-stats-row">
                <div class="bi-stat-card">
                    <div class="bi-stat-number" id="biTotalAtend">${records.length}</div>
                    <div class="bi-stat-label">Total Atendimentos</div>
                </div>
                <div class="bi-stat-card">
                    <div class="bi-stat-number" id="biGraves">${records.filter(r => r.gravidade_estimada === 'Grave').length}</div>
                    <div class="bi-stat-label">Casos Graves</div>
                </div>
                <div class="bi-stat-card">
                    <div class="bi-stat-number" id="biCenarios">${[...new Set(records.map(r => r.cenario))].length}</div>
                    <div class="bi-stat-label">Cenários Ativos</div>
                </div>
                <div class="bi-stat-card">
                    <div class="bi-stat-number" id="biCids">${[...new Set(records.map(r => r.cid_principal))].length}</div>
                    <div class="bi-stat-label">CIDs Únicos</div>
                </div>
                ${renderVitalsStatCards(records)}
            </div>
            ${renderCriticalVitalsAlert(records)}
            <div class="bi-charts-grid">
                <div class="bi-chart-card">
                    <h4>Atendimentos por Cenário</h4>
                    <canvas id="chartCenario"></canvas>
                </div>
                <div class="bi-chart-card">
                    <h4>Distribuição de Gravidade</h4>
                    <canvas id="chartGravidade"></canvas>
                </div>
                <div class="bi-chart-card">
                    <h4>Top CIDs</h4>
                    <canvas id="chartCids"></canvas>
                </div>
                <div class="bi-chart-card">
                    <h4>Atendimentos por Horário</h4>
                    <canvas id="chartTimeline"></canvas>
                </div>
            </div>
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
                        <tbody id="biTableBody"></tbody>
                    </table>
                </div>
            </div>
        `;

        renderTable(records);
        renderCenarioChart(records);
        renderGravidadeChart(records);
        renderCidChart(records);
        renderTimelineChart(records);
    }

    function renderTable(records) {
        const tbody = document.getElementById('biTableBody');
        const sorted = [...records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const latest = sorted.slice(0, 15);

        tbody.innerHTML = latest.map(r => {
            const gravClass = r.gravidade_estimada === 'Grave' ? 'grav-grave' :
                r.gravidade_estimada === 'Moderada' ? 'grav-moderada' : 'grav-leve';
            return `<tr>
                <td><span class="lgpd-badge-sm">🔒</span> ${r.iniciais}</td>
                <td><span class="cenario-tag tag-${r.cenario.toLowerCase()}">${r.cenario}</span></td>
                <td>${r.cid_principal}</td>
                <td><span class="grav-badge ${gravClass}">${r.gravidade_estimada}</span></td>
                <td>${new Date(r.timestamp).toLocaleString('pt-BR')}</td>
            </tr>`;
        }).join('');
    }

    function renderCenarioChart(records) {
        const ctx = document.getElementById('chartCenario');
        if (!ctx) return;
        const counts = {};
        records.forEach(r => { counts[r.cenario] = (counts[r.cenario] || 0) + 1; });

        if (charts.cenario) charts.cenario.destroy();
        charts.cenario = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(counts),
                datasets: [{
                    label: 'Atendimentos',
                    data: Object.values(counts),
                    backgroundColor: ['#2563EB', '#06D6A0', '#F59E0B', '#EF4444'],
                    borderRadius: 8,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } },
                    x: { grid: { display: false }, ticks: { color: '#94A3B8' } }
                }
            }
        });
    }

    function renderGravidadeChart(records) {
        const ctx = document.getElementById('chartGravidade');
        if (!ctx) return;
        const counts = { 'Leve': 0, 'Moderada': 0, 'Grave': 0 };
        records.forEach(r => { if (counts[r.gravidade_estimada] !== undefined) counts[r.gravidade_estimada]++; });

        if (charts.gravidade) charts.gravidade.destroy();
        charts.gravidade = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(counts),
                datasets: [{
                    data: Object.values(counts),
                    backgroundColor: ['#06D6A0', '#F59E0B', '#EF4444'],
                    borderWidth: 0,
                    spacing: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#94A3B8', padding: 16, usePointStyle: true } }
                }
            }
        });
    }

    function renderCidChart(records) {
        const ctx = document.getElementById('chartCids');
        if (!ctx) return;
        const counts = {};
        records.forEach(r => { counts[r.cid_principal] = (counts[r.cid_principal] || 0) + 1; });

        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);

        if (charts.cids) charts.cids.destroy();
        charts.cids = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(s => s[0]),
                datasets: [{
                    label: 'Ocorrências',
                    data: sorted.map(s => s[1]),
                    backgroundColor: '#2563EB',
                    borderRadius: 6,
                    borderSkipped: false,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } },
                    y: { grid: { display: false }, ticks: { color: '#94A3B8' } }
                }
            }
        });
    }

    function renderTimelineChart(records) {
        const ctx = document.getElementById('chartTimeline');
        if (!ctx) return;
        const hourCounts = {};
        for (let h = 7; h <= 22; h++) hourCounts[h] = 0;
        records.forEach(r => {
            const h = r.hora || new Date(r.timestamp).getHours();
            if (hourCounts[h] !== undefined) hourCounts[h]++;
        });

        if (charts.timeline) charts.timeline.destroy();
        charts.timeline = new Chart(ctx, {
            type: 'line',
            data: {
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
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } },
                    x: { grid: { display: false }, ticks: { color: '#94A3B8' } }
                }
            }
        });
    }

    /**
     * Compute average vitals for a given scenario filter
     */
    function computeVitalsAvg(records, cenario) {
        const filtered = records.filter(r => r.cenario === cenario && r.sinais_vitais);
        if (filtered.length === 0) return { avgSat: '--', avgFC: '--', count: 0 };

        let satSum = 0, satCount = 0, fcSum = 0, fcCount = 0;
        filtered.forEach(r => {
            if (r.sinais_vitais.sato2 && r.sinais_vitais.sato2.valor) { satSum += r.sinais_vitais.sato2.valor; satCount++; }
            if (r.sinais_vitais.fc && r.sinais_vitais.fc.valor) { fcSum += r.sinais_vitais.fc.valor; fcCount++; }
        });

        return {
            avgSat: satCount > 0 ? (satSum / satCount).toFixed(1) : '--',
            avgFC: fcCount > 0 ? (fcSum / fcCount).toFixed(0) : '--',
            count: filtered.length
        };
    }

    /**
     * Render SatO2/FC stat cards by scenario (PS vs UTI)
     */
    function renderVitalsStatCards(records) {
        const ps = computeVitalsAvg(records, 'PS');
        const uti = computeVitalsAvg(records, 'UTI');

        return `
            <div class="bi-stat-card">
                <div class="bi-stat-number" style="font-size:1.4rem">
                    <span title="PS">🏥 ${ps.avgSat}%</span>
                    <span style="margin:0 4px;opacity:0.4">|</span>
                    <span title="UTI">🏨 ${uti.avgSat}%</span>
                </div>
                <div class="bi-stat-label">Média SatO2 (PS | UTI)</div>
            </div>
            <div class="bi-stat-card">
                <div class="bi-stat-number" style="font-size:1.4rem">
                    <span title="PS">🏥 ${ps.avgFC}</span>
                    <span style="margin:0 4px;opacity:0.4">|</span>
                    <span title="UTI">🏨 ${uti.avgFC}</span>
                </div>
                <div class="bi-stat-label">FC Média bpm (PS | UTI)</div>
            </div>
        `;
    }

    /**
     * Render critical vital signs alert banner
     * Triggers when PA Sist > 180 or SatO2 < 90%
     */
    function renderCriticalVitalsAlert(records) {
        const critical = records.filter(r => {
            if (!r.sinais_vitais) return false;
            const highPA = r.sinais_vitais.pa && r.sinais_vitais.pa.sistolica > 180;
            const lowSat = r.sinais_vitais.sato2 && r.sinais_vitais.sato2.valor < 90;
            return highPA || lowSat;
        });

        if (critical.length === 0) return '';

        const items = critical.slice(0, 5).map(r => {
            const flags = [];
            if (r.sinais_vitais.pa && r.sinais_vitais.pa.sistolica > 180) flags.push(`PA ${r.sinais_vitais.pa.sistolica}x${r.sinais_vitais.pa.diastolica}`);
            if (r.sinais_vitais.sato2 && r.sinais_vitais.sato2.valor < 90) flags.push(`SpO2 ${r.sinais_vitais.sato2.valor}%`);
            return `<div class="bi-critical-item">
                <span class="lgpd-badge-sm">🔒</span> ${r.iniciais}
                <span class="cenario-tag tag-${r.cenario.toLowerCase()}">${r.cenario}</span>
                <strong style="color:#EF4444">${flags.join(' • ')}</strong>
                <span style="opacity:0.6;font-size:0.85rem">${new Date(r.timestamp).toLocaleString('pt-BR')}</span>
            </div>`;
        }).join('');

        return `
            <div class="bi-critical-alert">
                <div class="bi-critical-header">
                    <span class="bi-critical-icon">⚠️</span>
                    <h4>Sinais Vitais Críticos (${critical.length} registro${critical.length > 1 ? 's' : ''})</h4>
                </div>
                <div class="bi-critical-body">
                    ${items}
                    ${critical.length > 5 ? `<div style="opacity:0.6;font-size:0.85rem;margin-top:8px">...e mais ${critical.length - 5} registro(s)</div>` : ''}
                </div>
            </div>
        `;
    }

    async function loadDemoAndRender(containerId) {
        await generateDemoData();
        await renderDashboards(containerId);
    }

    async function getStats() {
        const records = await getAllRecords();
        return {
            total: records.length,
            graves: records.filter(r => r.gravidade_estimada === 'Grave').length,
            cenarios: [...new Set(records.map(r => r.cenario))].length,
            cids: [...new Set(records.map(r => r.cid_principal))].length,
        };
    }

    return { recordCycle, getAllRecords, generateDemoData, renderDashboards, loadDemoAndRender, getStats };
})();
