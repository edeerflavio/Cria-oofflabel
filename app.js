/**
 * app.js — Main Application Controller
 * Medical Scribe v2.0
 * Orchestrates: Recording → Processing → Review → Documents → BI
 * Supports Cloud API via sendToCloudAPI webhook
 */

const App = (() => {

    // ── Cloud API Configuration ──
    const API_CONFIG = {
        endpoint: '',           // Audio endpoint (e.g. 'http://localhost:8000/scribe/process')
        textEndpoint: '',       // Text-only endpoint (e.g. 'http://localhost:8000/scribe/text')
        syncEndpoint: '',       // Sync endpoint (e.g. 'http://localhost:8000/sync/receive')
        apiKey: '',             // API key for auth header
        enabled: false,         // Toggle cloud processing
        timeout: 60000,         // 60s timeout (Whisper + GPT-4o can be slow)
    };

    // Application state
    let state = {
        currentSection: 'gravacao',
        patientData: null,
        soapResult: null,
        documents: null,
        isRecording: false,
        isProcessing: false,
    };

    /**
     * Initialize the application
     */
    async function init() {
        await MedScribeDB.open();

        setupNavigation();
        setupRecordingUI();
        setupFormHandlers();
        updateLGPDBadge();
        updateBIBadge();

        // Start on recording section
        navigateTo('gravacao');

        console.log('[App] Medical Scribe v2.0 initialized');
    }

    /**
     * Navigation between sections
     */
    function setupNavigation() {
        document.querySelectorAll('[data-nav]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(btn.dataset.nav);
            });
        });

        // Hash-based navigation
        window.addEventListener('hashchange', () => {
            const hash = location.hash.replace('#', '');
            if (hash) navigateTo(hash);
        });
    }

    function navigateTo(sectionId) {
        state.currentSection = sectionId;

        // Update nav links
        document.querySelectorAll('[data-nav]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.nav === sectionId);
        });

        // Show/hide sections
        document.querySelectorAll('.section').forEach(sec => {
            sec.classList.toggle('active', sec.id === `section-${sectionId}`);
        });

        // Render BI if navigating to dashboard
        if (sectionId === 'dashboard') {
            BIModule.renderDashboards('biContainer');
        }

        location.hash = sectionId;
    }

    /**
     * Recording UI setup
     */
    function setupRecordingUI() {
        const recordBtn = document.getElementById('btnRecord');
        const statusText = document.getElementById('recordStatus');
        const liveText = document.getElementById('liveTranscript');

        if (!recordBtn) return;

        const speechSupported = Recorder.init({
            onUpdate: (data) => {
                if (liveText) {
                    liveText.innerHTML = `<span class="transcript-final">${data.final}</span> <span class="transcript-interim">${data.interim}</span>`;
                }
            },
            onEnd: (transcript) => {
                if (statusText) statusText.textContent = 'Gravação finalizada';
            },
            onError: (err) => {
                if (statusText) statusText.textContent = `Erro: ${err}`;
            }
        });

        // Show/hide fallback
        const fallback = document.getElementById('manualFallback');
        if (!speechSupported && fallback) {
            fallback.style.display = 'block';
            document.getElementById('speechLabel').textContent = '🎤 Speech API não disponível — use o campo de texto';
        }

        recordBtn.addEventListener('click', toggleRecording);
    }

    function toggleRecording() {
        const btn = document.getElementById('btnRecord');
        const status = document.getElementById('recordStatus');
        const ring = document.getElementById('recordRing');

        if (!state.isRecording) {
            // Start recording
            if (Recorder.isSupported) {
                Recorder.start();
            }
            state.isRecording = true;
            btn.classList.add('recording');
            ring.classList.add('recording');
            status.textContent = '🔴 Gravando... Clique para parar';
            status.className = 'record-status recording';
        } else {
            // Stop recording
            const transcript = Recorder.isSupported ? Recorder.stop() : '';
            state.isRecording = false;
            btn.classList.remove('recording');
            ring.classList.remove('recording');
            status.textContent = '✅ Gravação finalizada';
            status.className = 'record-status done';
        }
    }

    /**
     * Form handlers
     */
    function setupFormHandlers() {
        // Patient form submission
        const form = document.getElementById('patientForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                processConsultation();
            });
        }

        // Manual text send
        const sendManual = document.getElementById('btnSendManual');
        if (sendManual) {
            sendManual.addEventListener('click', () => {
                const textarea = document.getElementById('manualText');
                if (textarea && textarea.value.trim()) {
                    Recorder.appendManualText(textarea.value.trim());
                    const liveText = document.getElementById('liveTranscript');
                    if (liveText) {
                        liveText.innerHTML = `<span class="transcript-final">${Recorder.getTranscript()}</span>`;
                    }
                    textarea.value = '';
                }
            });
        }

        // Use example text
        const useExample = document.getElementById('btnUseExample');
        if (useExample) {
            useExample.addEventListener('click', loadExampleConsultation);
        }
    }

    /**
     * Process full consultation cycle
     */
    async function processConsultation() {
        const nomeCompleto = document.getElementById('inputNome').value;
        const idade = document.getElementById('inputIdade').value;
        const cenario = document.getElementById('selectCenario').value;
        let texto = Recorder.getTranscript();

        // Also grab manual text if user typed directly
        const manualText = document.getElementById('manualText');
        if (manualText && manualText.value.trim()) {
            texto += ' ' + manualText.value.trim();
        }

        // 1. LGPD Processing
        const lgpdResult = LGPD.processPatientInput({
            nome_completo: nomeCompleto,
            idade,
            cenario_atendimento: cenario,
            texto_transcrito: texto
        });

        if (!lgpdResult.success) {
            showToast(lgpdResult.errors.join('; '), 'error');
            return;
        }

        state.patientData = lgpdResult.data;

        // Show processing state
        showProcessingOverlay(true);

        // 2. SOAP Processing — Cloud API or Local
        await new Promise(resolve => setTimeout(resolve, 400));

        let soapResult;

        if (API_CONFIG.enabled && (API_CONFIG.endpoint || API_CONFIG.textEndpoint) && navigator.onLine) {
            // Try cloud API
            try {
                console.log('[App] Sending to Cloud API...');
                const audioBlob = Recorder.isAudioSupported ? Recorder.getAudioBlob() : null;

                const cloudResult = await sendToCloudAPI({
                    texto_transcrito: state.patientData.texto_transcrito,
                    cenario: state.patientData.cenario_atendimento,
                    idade: state.patientData.idade,
                    audioBlob: audioBlob,
                });
                soapResult = cloudResult;
                console.log('[App] Cloud API response received', soapResult.metadata);
            } catch (apiErr) {
                console.warn('[App] Cloud API failed, falling back to local:', apiErr.message);
                showToast('API indisponível — processando localmente', 'warning');
                soapResult = SOAPEngine.process(state.patientData.texto_transcrito);
            }
        } else {
            // Local processing
            soapResult = SOAPEngine.process(state.patientData.texto_transcrito);
        }

        if (!soapResult || !soapResult.success) {
            showProcessingOverlay(false);
            showToast(soapResult?.error || 'Erro no processamento', 'error');
            return;
        }

        state.soapResult = soapResult;

        // 3. Generate Documents
        state.documents = Documents.generateAll(soapResult, state.patientData);

        // 4. Record BI data
        await BIModule.recordCycle(state.patientData, soapResult);

        // 5. Save consultation
        await MedScribeDB.add('consultations', {
            patientData: state.patientData,
            soapResult: state.soapResult,
            documents: state.documents,
            timestamp: new Date().toISOString()
        });

        showProcessingOverlay(false);

        // 6. Render review and navigate
        renderSOAPReview();
        renderDocuments();
        updateBIBadge();
        navigateTo('revisao');

        showToast('Consulta processada com sucesso!', 'success');
    }

    /**
     * Render SOAP review cards
     */
    function renderSOAPReview() {
        const container = document.getElementById('soapCards');
        if (!container || !state.soapResult) return;

        // ── Safe defaults for cloud/local response differences ──
        const soap = state.soapResult.soap || {};
        const jsonUniversal = state.soapResult.jsonUniversal || {
            HDA_Tecnica: '',
            Comorbidades: [],
            Alergias: [],
            'Medicações_Atuais': [],
        };
        const clinicalData = state.soapResult.clinicalData || {
            gravidade: 'N/A',
            cid_principal: { code: '—', desc: 'Não identificado' },
        };
        const metadata = state.soapResult.metadata || {};
        const dialog = state.soapResult.dialog || [];

        // Safe access helpers
        const gravidade = clinicalData.gravidade || 'N/A';
        const totalFalas = metadata.total_falas || dialog.length || 0;
        const falasMedico = metadata.falas_medico || dialog.filter(d => d.speaker === 'medico').length || 0;
        const falasPaciente = metadata.falas_paciente || dialog.filter(d => d.speaker === 'paciente').length || 0;

        let html = `
            <div class="patient-header">
                <div class="patient-info">
                    <span class="patient-initials">${state.patientData.iniciais}</span>
                    <span class="patient-detail">${state.patientData.idade} anos</span>
                    <span class="cenario-tag tag-${state.patientData.cenario_atendimento.toLowerCase()}">${state.patientData.cenario_atendimento}</span>
                    ${LGPD.getBadgeHTML()}
                </div>
                <div class="patient-meta">
                    <span>ID: ${state.patientData.paciente_id}</span>
                    <span>Gravidade: <strong class="grav-${gravidade.toLowerCase()}">${gravidade}</strong></span>
                </div>
            </div>
            <div class="soap-grid">
        `;

        for (const [key, section] of Object.entries(soap)) {
            if (!section) continue;
            let extraContent = '';

            // Render vitals table for Objective card
            if (key === 'objetivo' && section.sinais_vitais) {
                const sv = section.sinais_vitais;
                const hasAny = sv.pa || sv.fc || sv.temperatura || sv.sato2 || sv.fr;
                if (hasAny) {
                    const isAbnormal = (val, low, high) => val !== null && val !== undefined && (val < low || val > high);
                    const dangerClass = (cond) => cond ? ' class="vital-danger"' : '';

                    let rows = '';
                    if (sv.pa) {
                        const abnPA = isAbnormal(sv.pa.sistolica, 90, 140) || isAbnormal(sv.pa.diastolica, 60, 90);
                        rows += `<tr><th>🫀 PA</th><td${dangerClass(abnPA)}>${sv.pa.sistolica}x${sv.pa.diastolica} mmHg</td><td>90-140 / 60-90</td></tr>`;
                    }
                    if (sv.fc) {
                        const abnFC = isAbnormal(sv.fc.valor, 50, 100);
                        rows += `<tr><th>💓 FC</th><td${dangerClass(abnFC)}>${sv.fc.valor} bpm</td><td>50-100</td></tr>`;
                    }
                    if (sv.fr) {
                        const abnFR = isAbnormal(sv.fr.valor, 12, 22);
                        rows += `<tr><th>🌬️ FR</th><td${dangerClass(abnFR)}>${sv.fr.valor} irpm</td><td>12-22</td></tr>`;
                    }
                    if (sv.sato2) {
                        const abnSat = sv.sato2.valor < 94;
                        rows += `<tr><th>🩸 SpO2</th><td${dangerClass(abnSat)}>${sv.sato2.valor}%</td><td>≥ 94%</td></tr>`;
                    }
                    if (sv.temperatura) {
                        const abnTemp = isAbnormal(sv.temperatura.valor, 35.5, 37.8);
                        rows += `<tr><th>🌡️ Temp</th><td${dangerClass(abnTemp)}>${sv.temperatura.valor}°C</td><td>35.5-37.8</td></tr>`;
                    }

                    extraContent = `
                        <table class="vitals-table">
                            <thead><tr><th>Parâmetro</th><th>Valor</th><th>Ref.</th></tr></thead>
                            <tbody>${rows}</tbody>
                        </table>`;
                }
            }

            html += `
                <div class="soap-card soap-${key}">
                    <div class="soap-card-header">
                        <span class="soap-icon">${section.icon || ''}</span>
                        <h3>${section.title || key}</h3>
                    </div>
                    <div class="soap-card-content">
                        <p>${section.content || ''}</p>
                        ${extraContent}
                    </div>
                </div>
            `;
        }
        html += `</div>`;

        // JSON Universal card
        html += `
            <div class="json-card">
                <h4>📊 JSON Clínico Universal</h4>
                <div class="json-grid">
                    <div class="json-item">
                        <label>HDA Técnica</label>
                        <p>${jsonUniversal.HDA_Tecnica || 'Não disponível'}</p>
                    </div>
                    <div class="json-item">
                        <label>Comorbidades</label>
                        <p>${(jsonUniversal.Comorbidades || []).length > 0 ? jsonUniversal.Comorbidades.join(', ') : 'Nenhuma identificada'}</p>
                    </div>
                    <div class="json-item alergias-highlight">
                        <label>⚠️ Alergias</label>
                        <p class="alergias-text">${(jsonUniversal.Alergias || []).length > 0 ? jsonUniversal.Alergias.join(', ') : 'NKDA'}</p>
                    </div>
                    <div class="json-item">
                        <label>Medicações Atuais</label>
                        <p>${(jsonUniversal['Medicações_Atuais'] || []).length > 0 ? jsonUniversal['Medicações_Atuais'].join(', ') : 'Nenhuma identificada'}</p>
                    </div>
                </div>
            </div>
        `;

        // Diarization preview (safe — only render if dialog data exists)
        if (dialog.length > 0) {
            html += `
                <div class="dialog-card">
                    <h4>🗣️ Diarização (${totalFalas} falas: ${falasMedico} médico, ${falasPaciente} paciente)</h4>
                    <div class="dialog-lines">
            `;
            dialog.slice(0, 10).forEach(d => {
                const cls = d.speaker === 'medico' ? 'speaker-doc' : d.speaker === 'paciente' ? 'speaker-pat' : 'speaker-unk';
                const label = d.speaker === 'medico' ? '🩺 Médico' : d.speaker === 'paciente' ? '🧑 Paciente' : '❓';
                html += `<div class="dialog-line ${cls}"><span class="speaker-label">${label}</span><span class="speaker-text">${d.text}</span></div>`;
            });
            html += `</div></div>`;
        }

        container.innerHTML = html;
    }

    /**
     * Render document drafts
     */
    function renderDocuments() {
        const container = document.getElementById('docsContainer');
        if (!container || !state.documents) return;

        let html = `
            <div class="docs-header">
                <h3>📝 Documentos Gerados</h3>
                <div class="docs-actions">
                    <button class="btn btn-secondary" onclick="App.copyAllDocs()">📋 Copiar Todos (Picotados)</button>
                    <button class="btn btn-secondary" onclick="App.exportAllPDF()">📄 Exportar Todos PDF</button>
                </div>
            </div>
            <div class="security-lock-banner">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span>Trava de Segurança: Nenhum documento pode ser finalizado sem validação médica</span>
            </div>
        `;

        for (const [key, doc] of Object.entries(state.documents)) {
            html += renderDocumentCard(key, doc);
        }

        container.innerHTML = html;
    }

    function renderDocumentCard(key, doc) {
        let contentHtml = '';

        switch (doc.type) {
            case 'receituario':
                contentHtml = `<table class="doc-table">
                    <thead><tr><th>#</th><th>Medicamento</th><th>Dose</th><th>Via</th><th>Freq</th><th>Duração</th></tr></thead>
                    <tbody>`;
                doc.items.forEach(item => {
                    contentHtml += `<tr>
                        <td>${item.numero}</td>
                        <td><strong>${item.med}</strong></td>
                        <td>${item.dose}</td>
                        <td>${item.via}</td>
                        <td>${item.freq}</td>
                        <td>${item.duracao}</td>
                    </tr>`;
                });
                contentHtml += `</tbody></table>
                    <p class="doc-obs">${doc.observacoes}</p>`;
                break;

            case 'atestado':
                contentHtml = `
                    <div class="doc-text-block" contenteditable="true">${doc.texto}</div>
                    <div class="doc-meta">
                        <span>CID: ${doc.cid}</span>
                        <span>Dias sugeridos: ${doc.dias_sugeridos}</span>
                    </div>`;
                break;

            case 'pedido_exames':
                contentHtml = `<p class="doc-hypothesis"><strong>Hipótese:</strong> ${doc.hipotese_diagnostica}</p>`;
                contentHtml += `<div class="exam-list">`;
                doc.exames.forEach((exam, i) => {
                    contentHtml += `<label class="exam-item">
                        <input type="checkbox" ${exam.selecionado ? 'checked' : ''} onchange="App.toggleExam(${i})">
                        <span>${exam.nome}</span>
                        <span class="exam-urgency">${exam.urgencia}</span>
                    </label>`;
                });
                contentHtml += `</div>`;
                contentHtml += `<p class="doc-obs">${doc.justificativa}</p>`;
                break;

            case 'guia_paciente':
                contentHtml = `<div class="doc-text-block patient-guide" contenteditable="true">${doc.texto.replace(/\n/g, '<br>')}</div>`;
                break;
        }

        const validatedClass = doc.validated ? 'validated' : '';
        const validatedBadge = doc.validated
            ? `<span class="validated-badge">✅ Validado em ${new Date(doc.validated_at).toLocaleString('pt-BR')}</span>`
            : '';

        return `
            <div class="doc-card ${validatedClass}" id="doc-${key}">
                <div class="doc-card-header">
                    <span class="doc-icon">${doc.icon}</span>
                    <h4>${doc.title}</h4>
                    ${validatedBadge}
                </div>
                <div class="doc-card-content">
                    ${contentHtml}
                </div>
                <div class="doc-card-actions">
                    <button class="btn btn-sm btn-copy" onclick="App.copyDoc('${key}')">📋 Copiar</button>
                    <button class="btn btn-sm btn-pdf" onclick="App.exportDocPDF('${key}')" ${!doc.validated ? 'disabled title="Valide primeiro"' : ''}>📄 PDF</button>
                    ${!doc.validated
                ? `<button class="btn btn-sm btn-validate" onclick="App.validateDoc('${key}')">🔒 Validar pelo Médico</button>`
                : `<span class="lock-open">🔓 Liberado</span>`
            }
                </div>
            </div>
        `;
    }

    /**
     * Document actions
     */
    function validateDoc(key) {
        if (!state.documents || !state.documents[key]) return;

        // Show confirmation modal
        const modal = document.getElementById('validateModal');
        const confirmBtn = document.getElementById('btnConfirmValidate');

        modal.classList.add('show');

        confirmBtn.onclick = () => {
            Documents.validate(state.documents[key]);
            renderDocuments();
            modal.classList.remove('show');
            showToast(`${state.documents[key].title} validado pelo médico assistente`, 'success');
        };

        document.getElementById('btnCancelValidate').onclick = () => {
            modal.classList.remove('show');
        };
    }

    function copyDoc(key) {
        if (!state.documents || !state.documents[key]) return;
        const text = ExportModule.formatForClipboard(state.documents[key]);
        const btn = document.querySelector(`#doc-${key} .btn-copy`);
        ExportModule.copyToClipboard(text, btn);
    }

    function exportDocPDF(key) {
        if (!state.documents || !state.documents[key]) return;
        if (!Documents.canExport(state.documents[key])) {
            showToast('⚠️ Documento precisa ser validado pelo médico antes de exportar PDF', 'warning');
            return;
        }
        ExportModule.documentToPDF(state.documents[key]);
    }

    function copyAllDocs() {
        if (!state.documents) return;
        const btn = document.querySelector('.docs-actions .btn-secondary');
        ExportModule.copyAllPicotados(state.documents, btn);
    }

    function exportAllPDF() {
        if (!state.documents) return;
        const validated = Object.values(state.documents).filter(d => d.validated);
        if (validated.length === 0) {
            showToast('⚠️ Nenhum documento validado para exportar', 'warning');
            return;
        }
        validated.forEach(doc => ExportModule.documentToPDF(doc));
    }

    function toggleExam(index) {
        if (state.documents && state.documents.pedido_exames) {
            state.documents.pedido_exames.exames[index].selecionado =
                !state.documents.pedido_exames.exames[index].selecionado;
        }
    }

    /**
     * Load example consultation data
     */
    function loadExampleConsultation() {
        document.getElementById('inputNome').value = 'Maria Aparecida Santos';
        document.getElementById('inputIdade').value = '54';
        document.getElementById('selectCenario').value = 'UBS';

        const exampleText = `Paciente refere dor de cabeça intensa há 3 dias, do tipo pulsátil, localizada na região frontal. Estou sentindo muita dor, doutor, não consigo dormir. Tenho hipertensão e diabetes tipo 2. Tomo losartana 50mg pela manhã e metformina 850mg duas vezes ao dia. Tenho alergia a dipirona. O médico realizou exame físico: PA 160x100mmHg, FC 88bpm, FR 18irpm, SpO2 98%. Ausculta cardíaca normal, ausculta pulmonar sem alterações. A minha avaliação é cefaleia tensional em paciente hipertensa descompensada. Vou prescrever paracetamol 750mg de 6 em 6 horas por 3 dias. Solicito hemograma e perfil lipídico. Recomendo retorno em 7 dias para reavaliação. Oriento sobre importância da adesão ao tratamento anti-hipertensivo.`;

        const manualText = document.getElementById('manualText');
        if (manualText) {
            manualText.value = exampleText;
        }

        Recorder.appendManualText(exampleText);
        const liveText = document.getElementById('liveTranscript');
        if (liveText) {
            liveText.innerHTML = `<span class="transcript-final">${exampleText}</span>`;
        }

        showToast('Exemplo carregado! Clique em "Processar Consulta"', 'info');
    }

    /**
     * UI Helpers
     */
    function showProcessingOverlay(show) {
        const overlay = document.getElementById('processingOverlay');
        if (overlay) {
            overlay.classList.toggle('show', show);
        }
        state.isProcessing = show;
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${message}</span><button onclick="this.parentElement.remove()">✕</button>`;
        container.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function updateLGPDBadge() {
        // LGPD status indicator in navbar
        const badge = document.getElementById('lgpdStatus');
        if (badge) badge.innerHTML = LGPD.getBadgeHTML();
    }

    async function updateBIBadge() {
        const badge = document.getElementById('biBadge');
        if (badge) {
            const stats = await BIModule.getStats();
            badge.textContent = stats.total;
            badge.style.display = stats.total > 0 ? 'inline-flex' : 'none';
        }
    }

    /**
     * Reset for new consultation
     */
    function newConsultation() {
        state.patientData = null;
        state.soapResult = null;
        state.documents = null;
        state.isRecording = false;

        Recorder.clear();

        // Reset form
        const form = document.getElementById('patientForm');
        if (form) form.reset();

        const liveText = document.getElementById('liveTranscript');
        if (liveText) liveText.innerHTML = '<span class="placeholder-text">A transcrição aparecerá aqui...</span>';

        const manualText = document.getElementById('manualText');
        if (manualText) manualText.value = '';

        navigateTo('gravacao');
        showToast('Pronto para nova consulta', 'info');
    }

    // ══════════════════════════════════════════════════════
    // CLOUD API
    // ══════════════════════════════════════════════════════

    /**
     * Send data to Cloud API (FastAPI Backend)
     * Mode 1: Audio blob → multipart/form-data → /scribe/process (Whisper + GPT-4o)
     * Mode 2: Text only → form-data → /scribe/text (GPT-4o only)
     * 
     * @param {Object} data - { texto_transcrito, cenario, idade, audioBlob? }
     * @returns {Promise<Object>} SOAP result from cloud
     */
    async function sendToCloudAPI(data) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

        try {
            let url, body;

            if (data.audioBlob && API_CONFIG.endpoint) {
                // Mode 1: Audio + Whisper transcription
                console.log('[App] Sending audio to Whisper...', `${(data.audioBlob.size / 1024).toFixed(1)}KB`);
                const formData = new FormData();
                formData.append('audio_file', data.audioBlob, 'recording.webm');
                formData.append('context', data.texto_transcrito || '');
                formData.append('cenario', data.cenario || '');
                formData.append('idade', String(data.idade || ''));
                url = API_CONFIG.endpoint;
                body = formData;
            } else if (API_CONFIG.textEndpoint || API_CONFIG.endpoint) {
                // Mode 2: Text only
                console.log('[App] Sending text to GPT-4o...');
                const formData = new FormData();
                formData.append('texto_transcrito', data.texto_transcrito);
                formData.append('context', '');
                formData.append('cenario', data.cenario || '');
                formData.append('idade', String(data.idade || ''));
                url = API_CONFIG.textEndpoint || API_CONFIG.endpoint;
                body = formData;
            } else {
                throw new Error('No API endpoint configured');
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    ...(API_CONFIG.apiKey ? { 'X-API-Key': API_CONFIG.apiKey } : {}),
                    // Note: Do NOT set Content-Type for FormData — browser sets it with boundary
                },
                body,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text().catch(() => response.statusText);
                throw new Error(`API HTTP ${response.status}: ${errorText}`);
            }

            return await response.json();
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error(`API timeout (${API_CONFIG.timeout / 1000}s)`);
            }
            throw err;
        }
    }

    /**
     * Convenience: Configure API endpoints for local dev
     */
    function connectToBackend(baseUrl = 'http://localhost:8000', apiKey = '') {
        API_CONFIG.endpoint = `${baseUrl}/scribe/process`;
        API_CONFIG.textEndpoint = `${baseUrl}/scribe/text`;
        API_CONFIG.syncEndpoint = `${baseUrl}/sync/receive`;
        API_CONFIG.apiKey = apiKey;
        API_CONFIG.enabled = true;

        // Also configure DB sync
        if (typeof MedScribeDB !== 'undefined' && MedScribeDB.setSyncEndpoint) {
            MedScribeDB.setSyncEndpoint(API_CONFIG.syncEndpoint, apiKey);
        }

        console.log(`[App] Connected to backend: ${baseUrl}`);
        showToast(`Conectado ao backend: ${baseUrl}`, 'success');
    }

    // Public API
    return {
        init, navigateTo, toggleRecording, processConsultation,
        validateDoc, copyDoc, exportDocPDF, copyAllDocs, exportAllPDF,
        toggleExam, loadExampleConsultation, newConsultation, showToast,
        sendToCloudAPI, connectToBackend,
        getState: () => state,
        API_CONFIG,
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
