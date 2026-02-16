/**
 * soap-engine.js — SOAP Processing Engine
 * Medical Scribe v1.0
 * Simulated diarization + SOAP structuring + clinical JSON extraction
 * Ready for LLM API replacement
 */

const SOAPEngine = (() => {

    // CID-10 database (common conditions + Emergency + ICU protocols)
    const CID_DATABASE = {
        // ── Emergência: Sepse ──
        'sepse grave': { code: 'A41.9', desc: 'Sepse grave' },
        'choque séptico': { code: 'R65.1', desc: 'Choque séptico' },
        'sirs': { code: 'R65.1', desc: 'Síndrome da resposta inflamatória sistêmica' },
        'bacteremia': { code: 'A49.9', desc: 'Bacteremia' },
        'sepse': { code: 'A41', desc: 'Septicemia' },

        // ── Emergência: IAM / SCA ──
        'iamcsst': { code: 'I21.0', desc: 'IAM com supra de ST (IAMCSST)' },
        'iamssst': { code: 'I21.4', desc: 'IAM sem supra de ST (IAMSSST)' },
        'síndrome coronariana aguda': { code: 'I24.9', desc: 'Síndrome coronariana aguda' },
        'síndrome coronariana': { code: 'I24.9', desc: 'Síndrome coronariana aguda' },
        'angina instável': { code: 'I20.0', desc: 'Angina instável' },
        'iam': { code: 'I21', desc: 'Infarto agudo do miocárdio' },
        'infarto': { code: 'I21', desc: 'Infarto agudo do miocárdio' },

        // ── Emergência: AVC ──
        'avc isquêmico': { code: 'I63', desc: 'AVC isquêmico' },
        'avc hemorrágico': { code: 'I61', desc: 'AVC hemorrágico' },
        'ataque isquêmico transitório': { code: 'G45', desc: 'Ataque isquêmico transitório (AIT)' },
        'ait': { code: 'G45', desc: 'Ataque isquêmico transitório (AIT)' },
        'avc': { code: 'I64', desc: 'Acidente vascular cerebral' },
        'derrame': { code: 'I64', desc: 'Acidente vascular cerebral' },

        // ── Emergência: Choque ──
        'choque hipovolêmico': { code: 'R57.1', desc: 'Choque hipovolêmico' },
        'choque cardiogênico': { code: 'R57.0', desc: 'Choque cardiogênico' },
        'choque anafilático': { code: 'T78.2', desc: 'Choque anafilático' },
        'choque distributivo': { code: 'R57.8', desc: 'Choque distributivo' },

        // ── Terapia Intensiva (UTI) ──
        'sdra': { code: 'J80', desc: 'Síndrome do desconforto respiratório agudo' },
        'insuficiência respiratória aguda': { code: 'J96.0', desc: 'Insuficiência respiratória aguda' },
        'insuficiência respiratória': { code: 'J96', desc: 'Insuficiência respiratória' },
        'parada cardiorrespiratória': { code: 'I46', desc: 'Parada cardiorrespiratória' },
        'pcr': { code: 'I46', desc: 'Parada cardiorrespiratória' },
        'ventilação mecânica': { code: 'Z99.1', desc: 'Dependência de ventilação mecânica' },
        'rabdomiólise': { code: 'M62.8', desc: 'Rabdomiólise' },
        'civd': { code: 'D65', desc: 'Coagulação intravascular disseminada' },
        'politrauma': { code: 'T07', desc: 'Politraumatismo' },
        'edema cerebral': { code: 'G93.6', desc: 'Edema cerebral' },
        'status epilepticus': { code: 'G41', desc: 'Estado de mal epiléptico' },
        'cetoacidose diabética': { code: 'E10.1', desc: 'Cetoacidose diabética' },
        'crise hipertensiva': { code: 'I16', desc: 'Crise hipertensiva' },
        'tamponamento cardíaco': { code: 'I31.4', desc: 'Tamponamento cardíaco' },
        'tromboembolismo pulmonar': { code: 'I26', desc: 'Tromboembolismo pulmonar' },
        'tep': { code: 'I26', desc: 'Tromboembolismo pulmonar' },

        // ── Condições comuns ──
        'hipertensão': { code: 'I10', desc: 'Hipertensão essencial (primária)' },
        'pressão alta': { code: 'I10', desc: 'Hipertensão essencial (primária)' },
        'diabetes tipo 2': { code: 'E11', desc: 'Diabetes mellitus tipo 2' },
        'diabetes tipo 1': { code: 'E10', desc: 'Diabetes mellitus tipo 1' },
        'diabetes': { code: 'E11', desc: 'Diabetes mellitus tipo 2' },
        'asma': { code: 'J45', desc: 'Asma' },
        'pneumonia': { code: 'J18', desc: 'Pneumonia' },
        'covid': { code: 'U07.1', desc: 'COVID-19' },
        'gripe': { code: 'J11', desc: 'Influenza' },
        'infecção urinária': { code: 'N39.0', desc: 'Infecção do trato urinário' },
        'itu': { code: 'N39.0', desc: 'Infecção do trato urinário' },
        'cefaleia': { code: 'R51', desc: 'Cefaleia' },
        'dor de cabeça': { code: 'R51', desc: 'Cefaleia' },
        'enxaqueca': { code: 'G43', desc: 'Enxaqueca' },
        'lombalgia': { code: 'M54.5', desc: 'Lombalgia' },
        'dor lombar': { code: 'M54.5', desc: 'Lombalgia' },
        'dor nas costas': { code: 'M54.5', desc: 'Lombalgia' },
        'gastrite': { code: 'K29', desc: 'Gastrite' },
        'dor abdominal': { code: 'R10', desc: 'Dor abdominal' },
        'dor no peito': { code: 'R07', desc: 'Dor torácica' },
        'dor torácica': { code: 'R07', desc: 'Dor torácica' },
        'febre': { code: 'R50', desc: 'Febre de origem desconhecida' },
        'tosse': { code: 'R05', desc: 'Tosse' },
        'dispneia': { code: 'R06.0', desc: 'Dispneia' },
        'falta de ar': { code: 'R06.0', desc: 'Dispneia' },
        'ansiedade': { code: 'F41', desc: 'Transtornos ansiosos' },
        'depressão': { code: 'F32', desc: 'Episódio depressivo' },
        'insônia': { code: 'G47.0', desc: 'Insônia' },
        'alergia': { code: 'T78.4', desc: 'Alergia não especificada' },
        'rinite': { code: 'J30', desc: 'Rinite alérgica' },
        'sinusite': { code: 'J32', desc: 'Sinusite crônica' },
        'otite': { code: 'H66', desc: 'Otite média' },
        'dor de ouvido': { code: 'H66', desc: 'Otite média' },
        'faringite': { code: 'J02', desc: 'Faringite aguda' },
        'dor de garganta': { code: 'J02', desc: 'Faringite aguda' },
        'dengue': { code: 'A90', desc: 'Dengue' },
        'diarreia': { code: 'A09', desc: 'Diarreia e gastroenterite' },
        'vômito': { code: 'R11', desc: 'Náusea e vômitos' },
        'fratura': { code: 'T14.2', desc: 'Fratura de região do corpo não especificada' },
        'entorse': { code: 'T14.3', desc: 'Luxação, entorse de região não especificada' },
        'icc': { code: 'I50', desc: 'Insuficiência cardíaca' },
        'insuficiência cardíaca': { code: 'I50', desc: 'Insuficiência cardíaca' },
        'dpoc': { code: 'J44', desc: 'Doença pulmonar obstrutiva crônica' },
        'insuficiência renal': { code: 'N18', desc: 'Doença renal crônica' },
        'irc': { code: 'N18', desc: 'Doença renal crônica' },
    };

    // Common medications mapping
    const MED_PATTERNS = [
        'dipirona', 'paracetamol', 'ibuprofeno', 'amoxicilina', 'azitromicina',
        'losartana', 'metformina', 'omeprazol', 'enalapril', 'atenolol',
        'hidroclorotiazida', 'sinvastatina', 'captopril', 'anlodipino',
        'fluoxetina', 'sertralina', 'clonazepam', 'diazepam', 'prednisona',
        'dexametasona', 'cetoprofeno', 'nimesulida', 'ciprofloxacino',
        'cefalexina', 'metronidazol', 'ranitidina', 'insulina', 'aspirina',
        'clopidogrel', 'enoxaparina', 'furosemida', 'espironolactona',
        'salbutamol', 'budesonida', 'loratadina', 'prometazina',
    ];

    // Allergy keywords
    const ALLERGY_KEYWORDS = ['alergia', 'alérgico', 'alérgica', 'alergias', 'intolerância'];

    /**
     * Simulated Diarization: separates Doctor vs Patient speech
     */
    function diarize(rawText) {
        const lines = rawText.split(/[\.\n]+/).map(l => l.trim()).filter(l => l.length > 5);
        const dialog = [];

        // Patterns that suggest doctor speech
        const doctorPatterns = [
            /^(doutor|dra?\.?|médico)/i,
            /vamos (examinar|verificar|avaliar|prescrever)/i,
            /minha (hipótese|avaliação|conduta)/i,
            /(prescrevo|solicito|recomendo|indico|oriento)/i,
            /(exame físico|ausculta|palpação|inspeção)/i,
            /(pa |fc |fr |spo2|sat |temperatura|sinais vitais)/i,
            /(diagnóstico|prognóstico|conduta|plano)/i,
            /^(vou |preciso |solicitar|pedir)/i,
        ];

        // Patterns that suggest patient speech
        const patientPatterns = [
            /^(paciente|pac\.?)/i,
            /(estou sentindo|sinto|tenho sentido|comecei)/i,
            /(dói|doendo|doer|incômodo)/i,
            /(faz .+ dias|há .+ dias|desde)/i,
            /(meu|minha) (dor|febre|tosse|mal[\s-]?estar)/i,
            /(tomo|uso|tomando|usando) .+(mg|ml|comprimido)/i,
            /(me sinto|sinto[\s-]?me|estou)/i,
            /(queixa|queixo|reclamo)/i,
        ];

        for (const line of lines) {
            let speaker = 'indefinido';
            const docScore = doctorPatterns.reduce((s, p) => s + (p.test(line) ? 1 : 0), 0);
            const patScore = patientPatterns.reduce((s, p) => s + (p.test(line) ? 1 : 0), 0);

            if (docScore > patScore) speaker = 'medico';
            else if (patScore > docScore) speaker = 'paciente';
            else speaker = line.length > 60 ? 'paciente' : 'medico';

            dialog.push({ speaker, text: line });
        }

        return dialog;
    }

    /**
     * Extract vital signs from text using regex patterns
     */
    function extractVitalSigns(text) {
        const sinais = { pa: null, fc: null, temperatura: null, sato2: null, fr: null };

        // PA: "PA 120x80", "PA 120/80", "pressão 12 por 8", "PA:120x80"
        const paMatch = text.match(/(?:pa|pressão\s*arterial)[:\s]+?(\d{2,3})\s*[x\/]\s*(\d{2,3})/i)
            || text.match(/pressão\s+(\d{2,3})\s*(?:por|x|\/)\s*(\d{2,3})/i);
        if (paMatch) {
            sinais.pa = { sistolica: parseInt(paMatch[1]), diastolica: parseInt(paMatch[2]), raw: paMatch[0].trim() };
        }

        // FC: "FC 88", "frequência cardíaca 88", "pulso 88", "FC:88bpm"
        const fcMatch = text.match(/(?:fc|frequência\s*cardíaca|pulso)[:\s]+?(\d{2,3})\s*(?:bpm)?/i);
        if (fcMatch) {
            sinais.fc = { valor: parseInt(fcMatch[1]), raw: fcMatch[0].trim() };
        }

        // Temperatura: "temperatura 37.5", "temp 38", "T 37.8°C", "Tax 38.2"
        const tempMatch = text.match(/(?:temperatura|temp|tax)[:\s]+?(\d{2}[.,]?\d?)\s*°?\s*c?/i);
        if (tempMatch) {
            sinais.temperatura = { valor: parseFloat(tempMatch[1].replace(',', '.')), raw: tempMatch[0].trim() };
        }

        // SatO2: "sat 96", "spo2 98", "saturação 94%", "SpO2:92%"
        const satMatch = text.match(/(?:sat(?:ura[çc][aã]o)?|spo2|sato2)[:\s]+?(\d{2,3})\s*%?/i);
        if (satMatch) {
            sinais.sato2 = { valor: parseInt(satMatch[1]), raw: satMatch[0].trim() };
        }

        // FR: "FR 18", "frequência respiratória 20", "FR:24irpm"
        const frMatch = text.match(/(?:fr|frequência\s*respiratória)[:\s]+?(\d{1,2})\s*(?:irpm|rpm)?/i);
        if (frMatch) {
            sinais.fr = { valor: parseInt(frMatch[1]), raw: frMatch[0].trim() };
        }

        return sinais;
    }

    /**
     * Extract clinical data from text
     */
    function extractClinicalData(text) {
        const lower = text.toLowerCase();

        // Extract CID
        let cid_principal = null;
        for (const [keyword, cidInfo] of Object.entries(CID_DATABASE)) {
            if (lower.includes(keyword)) {
                cid_principal = cidInfo;
                break;
            }
        }

        // Extract vital signs
        const sinais_vitais = extractVitalSigns(text);

        // Extract medications
        const medicacoes = [];
        for (const med of MED_PATTERNS) {
            if (lower.includes(med)) {
                medicacoes.push(med.charAt(0).toUpperCase() + med.slice(1));
            }
        }

        // Extract allergies (CAIXA ALTA per requirement)
        const alergias = [];
        for (const keyword of ALLERGY_KEYWORDS) {
            const idx = lower.indexOf(keyword);
            if (idx !== -1) {
                // Extract surrounding words as the allergen
                const surrounding = text.substring(Math.max(0, idx - 5), Math.min(text.length, idx + 60));
                const match = surrounding.match(/(?:alergia|alérgic[oa]|alergias|intolerância)\s+(?:a\s+|ao?\s+)?([^,.\n]+)/i);
                if (match) {
                    alergias.push(match[1].trim().toUpperCase());
                }
            }
        }
        if (alergias.length === 0) {
            alergias.push('NADA (NEGA ALERGIAS CONHECIDAS - NKDA)');
        }

        // Extract comorbidities
        const comorbidades = [];
        const comorbPatterns = ['hipertensão', 'diabetes', 'asma', 'dpoc', 'icc', 'insuficiência renal',
            'insuficiência cardíaca', 'hiv', 'hepatite', 'obesidade', 'dislipidemia',
            'hipotireoidismo', 'hipertireoidismo', 'epilepsia', 'arritmia'];
        for (const comorb of comorbPatterns) {
            if (lower.includes(comorb)) {
                comorbidades.push(comorb.charAt(0).toUpperCase() + comorb.slice(1));
            }
        }

        // Estimate severity
        let gravidade = 'Leve';
        const severeKeywords = ['iam', 'infarto', 'avc', 'derrame', 'sepse', 'pcr', 'choque',
            'rebaixamento', 'coma', 'hemorragia', 'politrauma', 'sdra', 'civd',
            'choque séptico', 'choque cardiogênico', 'tamponamento', 'tep',
            'parada cardiorrespiratória', 'status epilepticus', 'cetoacidose'];
        const moderateKeywords = ['febre alta', 'dispneia', 'falta de ar', 'taquicardia',
            'hipotensão', 'desidratação', 'pneumonia', 'fratura',
            'crise hipertensiva', 'angina instável', 'insuficiência respiratória',
            'rabdomiólise', 'edema cerebral'];
        if (severeKeywords.some(k => lower.includes(k))) gravidade = 'Grave';
        else if (moderateKeywords.some(k => lower.includes(k))) gravidade = 'Moderada';

        return {
            cid_principal: cid_principal || { code: 'R69', desc: 'Causa de morbidade desconhecida' },
            sinais_vitais,
            medicacoes_atuais: medicacoes,
            alergias,
            comorbidades,
            gravidade
        };
    }

    /**
     * Build SOAP structure from diarized dialog
     */
    function buildSOAP(dialog, clinicalData) {
        const patientLines = dialog.filter(d => d.speaker === 'paciente').map(d => d.text);
        const doctorLines = dialog.filter(d => d.speaker === 'medico').map(d => d.text);

        return {
            subjetivo: {
                title: 'Subjetivo (S)',
                icon: '💬',
                content: patientLines.length > 0
                    ? patientLines.join('. ') + '.'
                    : 'Paciente refere queixa principal conforme transcrição.',
                queixa_principal: patientLines[0] || 'Não identificada',
                hda: patientLines.slice(1).join('. ') || 'Detalhes na transcrição completa.'
            },
            objetivo: {
                title: 'Objetivo (O)',
                icon: '🔍',
                content: (() => {
                    const parts = [];
                    const sv = clinicalData.sinais_vitais;
                    if (sv.pa) parts.push(`PA ${sv.pa.sistolica}x${sv.pa.diastolica}mmHg`);
                    if (sv.fc) parts.push(`FC ${sv.fc.valor}bpm`);
                    if (sv.fr) parts.push(`FR ${sv.fr.valor}irpm`);
                    if (sv.sato2) parts.push(`SpO2 ${sv.sato2.valor}%`);
                    if (sv.temperatura) parts.push(`Temp ${sv.temperatura.valor}°C`);
                    const vitalsStr = parts.length > 0 ? `Sinais vitais: ${parts.join(', ')}. ` : '';
                    const examStr = doctorLines.filter(l => /exame|ausculta|palpação|inspeção|vital/i.test(l)).join('. ');
                    return vitalsStr + (examStr || 'Exame físico registrado durante consulta.');
                })(),
                sinais_vitais: clinicalData.sinais_vitais,
                exame_fisico: doctorLines.filter(l => /exame|ausculta|palpação|inspeção/i.test(l)).join('. ') || 'A completar.'
            },
            avaliacao: {
                title: 'Avaliação (A)',
                icon: '🧠',
                content: `Hipótese diagnóstica: ${clinicalData.cid_principal.desc} (${clinicalData.cid_principal.code})`,
                hipotese_diagnostica: clinicalData.cid_principal.desc,
                cid10: clinicalData.cid_principal.code,
                diagnosticos_diferenciais: 'A considerar conforme evolução clínica.'
            },
            plano: {
                title: 'Plano (P)',
                icon: '📋',
                content: doctorLines.filter(l => /prescrevo|solicito|recomendo|indico|oriento|conduta|plano/i.test(l)).join('. ') || 'Conduta a ser definida pelo médico assistente.',
                prescricoes: clinicalData.medicacoes_atuais,
                exames_solicitados: [],
                orientacoes: 'Retorno conforme agendamento.',
                encaminhamentos: []
            }
        };
    }

    /**
     * Main processing function
     * @param {string} rawText - Raw transcription text
     * @returns {Object} Complete SOAP + clinical data
     */
    function process(rawText) {
        if (!rawText || rawText.trim().length < 10) {
            return {
                success: false,
                error: 'Texto insuficiente para processamento. Mínimo de 10 caracteres.'
            };
        }

        const dialog = diarize(rawText);
        const clinicalData = extractClinicalData(rawText);
        const soap = buildSOAP(dialog, clinicalData);

        const jsonUniversal = {
            HDA_Tecnica: soap.subjetivo.hda,
            Comorbidades: clinicalData.comorbidades,
            Alergias: clinicalData.alergias, // Already in CAIXA ALTA
            Medicações_Atuais: clinicalData.medicacoes_atuais
        };

        return {
            success: true,
            dialog,
            soap,
            clinicalData,
            jsonUniversal,
            metadata: {
                total_falas: dialog.length,
                falas_medico: dialog.filter(d => d.speaker === 'medico').length,
                falas_paciente: dialog.filter(d => d.speaker === 'paciente').length,
                processado_em: new Date().toISOString()
            }
        };
    }

    return { process, diarize, extractClinicalData, buildSOAP, CID_DATABASE };
})();
