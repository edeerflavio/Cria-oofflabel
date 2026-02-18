/**
 * documents.js — Clinical Document Generator
 * Medical Scribe v1.0
 * Generates: Receituário, Atestado, Pedido de Exames, Guia Leiga
 * Requires: "Validado pelo Médico Assistente" before finalization
 */

const Documents = (() => {

    // Exam recommendations by CID category
    const EXAM_MAP = {
        'I': ['ECG', 'Ecocardiograma', 'RX Tórax', 'Hemograma completo', 'Troponina', 'BNP', 'Perfil lipídico'],
        'E': ['Glicemia jejum', 'HbA1c', 'Perfil lipídico', 'Creatinina', 'Ureia', 'TSH', 'T4 livre'],
        'J': ['RX Tórax', 'Hemograma', 'PCR', 'VHS', 'Gasometria arterial', 'Cultura de escarro'],
        'N': ['EAS/Urina I', 'Urocultura', 'Creatinina', 'Ureia', 'Ultrassom renal'],
        'R': ['Hemograma completo', 'PCR', 'VHS', 'Bioquímica básica'],
        'G': ['TC crânio', 'Hemograma', 'Glicemia', 'Eletrólitos'],
        'M': ['RX região afetada', 'Hemograma', 'PCR', 'VHS', 'Ácido úrico'],
        'K': ['EDA', 'Hemograma', 'Amilase', 'Lipase', 'TGO/TGP', 'USG abdome'],
        'F': ['TSH', 'T4 livre', 'Hemograma', 'Glicemia', 'Vitamina B12', 'Vitamina D'],
        'A': ['Hemograma completo', 'PCR', 'Hemocultura', 'Procalcitonina', 'Lactato'],
        'T': ['RX região afetada', 'Hemograma', 'Coagulograma'],
        'U': ['PCR (COVID)', 'Hemograma', 'PCR', 'D-dímero', 'Ferritina', 'DHL'],
    };

    // Common prescriptions by CID
    const PRESCRIPTION_MAP = {
        'R51': [
            { med: 'Dipirona 500mg', dose: '1 comprimido', via: 'VO', freq: '6/6h', duracao: '3 dias', obs: 'se dor' },
            { med: 'Paracetamol 750mg', dose: '1 comprimido', via: 'VO', freq: '6/6h', duracao: '3 dias', obs: 'alternando com dipirona' },
        ],
        'J02': [
            { med: 'Amoxicilina 500mg', dose: '1 comprimido', via: 'VO', freq: '8/8h', duracao: '7 dias', obs: '' },
            { med: 'Ibuprofeno 600mg', dose: '1 comprimido', via: 'VO', freq: '8/8h', duracao: '5 dias', obs: 'após refeições' },
        ],
        'N39.0': [
            { med: 'Ciprofloxacino 500mg', dose: '1 comprimido', via: 'VO', freq: '12/12h', duracao: '7 dias', obs: '' },
            { med: 'Dipirona 500mg', dose: '1 comprimido', via: 'VO', freq: '6/6h', duracao: '3 dias', obs: 'se dor' },
        ],
        'I10': [
            { med: 'Losartana 50mg', dose: '1 comprimido', via: 'VO', freq: '1x/dia', duracao: 'Uso contínuo', obs: 'manhã' },
            { med: 'Hidroclorotiazida 25mg', dose: '1 comprimido', via: 'VO', freq: '1x/dia', duracao: 'Uso contínuo', obs: 'manhã' },
        ],
        'E11': [
            { med: 'Metformina 850mg', dose: '1 comprimido', via: 'VO', freq: '2x/dia', duracao: 'Uso contínuo', obs: 'após refeições' },
        ],
        'J45': [
            { med: 'Salbutamol spray 100mcg', dose: '2 jatos', via: 'Inalatória', freq: '6/6h', duracao: '5 dias', obs: 'com espaçador se disponível' },
            { med: 'Prednisona 20mg', dose: '1 comprimido', via: 'VO', freq: '1x/dia', duracao: '5 dias', obs: 'pela manhã' },
        ],
        'DEFAULT': [
            { med: 'Dipirona 500mg', dose: '1 comprimido', via: 'VO', freq: '6/6h', duracao: '3 dias', obs: 'se dor ou febre' },
            { med: 'Omeprazol 20mg', dose: '1 cápsula', via: 'VO', freq: '1x/dia', duracao: '7 dias', obs: 'em jejum' },
        ],
    };

    // Attestation day suggestions by severity
    const ATTEST_DAYS = { 'Leve': 1, 'Moderada': 3, 'Grave': 7 };

    // Dynamic alert orientations by CID code or category
    const ALERT_MAP = {
        // By specific CID code
        'I10': [
            'Dor de cabeça intensa que não melhora com medicação',
            'Visão turva ou embaçada',
            'Dor no peito ou falta de ar',
            'Sangramento nasal que não para',
            'Confusão mental ou tontura intensa',
        ],
        'E11': [
            'Sede excessiva ou urinar demais',
            'Tontura, confusão mental ou tremores',
            'Visão turva repentina',
            'Feridas nos pés que não cicatrizam',
            'Náuseas, vômitos ou dor abdominal forte',
        ],
        'E10': [
            'Tremores, suor frio ou confusão (hipoglicemia)',
            'Sede excessiva, náuseas ou vômitos',
            'Hálito frutado (possível cetoacidose)',
            'Visão turva repentina',
        ],
        'J45': [
            'Cansaço intenso ao falar ou caminhar',
            'Chiado no peito que não melhora com a bombinha',
            'Lábios ou pontas dos dedos azulados',
            'Dificuldade para respirar mesmo em repouso',
        ],
        'I21': [
            'Dor no peito irradiando para braço, mandíbula ou costas',
            'Sudorese fria e palidez',
            'Falta de ar intensa ou náuseas',
            'LIGUE 192 (SAMU) IMEDIATAMENTE se estes sintomas surgirem',
        ],
        'I64': [
            'Perda de força em um lado do corpo',
            'Fala arrastada ou dificuldade para falar',
            'Confusão mental súbita',
            'Dor de cabeça muito forte e repentina',
            'LIGUE 192 (SAMU) IMEDIATAMENTE — tempo é cérebro!',
        ],
        'A41': [
            'Febre que não cede com medicação',
            'Prostração intensa ou sonolência excessiva',
            'Confusão mental ou desorientação',
            'Pele com manchas ou extremidades frias',
            'Procure emergência IMEDIATAMENTE',
        ],
        'J18': [
            'Febre alta persistente (acima de 38.5°C)',
            'Falta de ar intensa ou dor ao respirar fundo',
            'Tosse com secreção esverdeada ou com sangue',
            'Confusão mental ou sonolência excessiva',
        ],
        'N39.0': [
            'Febre alta (acima de 38°C)',
            'Dor intensa na região lombar',
            'Urina com sangue ou cheiro muito forte',
            'Calafrios ou tremores',
        ],
        'R57': [
            'Extremidades frias ou pálidas',
            'Tontura intensa ao levantar',
            'Confusão mental ou desmaio',
            'Palidez acentuada ou suor frio',
            'Procure emergência IMEDIATAMENTE',
        ],
        'J44': [
            'Falta de ar progressiva, mesmo em repouso',
            'Aumento da tosse com catarro espesso',
            'Lábios ou unhas azulados',
            'Febre associada a piora da falta de ar',
        ],
        'I50': [
            'Falta de ar ao deitar (precisa de travesseiros extras)',
            'Inchaço nas pernas, tornozelos ou barriga',
            'Ganho de peso rápido (mais de 1kg/dia)',
            'Cansaço extremo para atividades simples',
        ],
        'F41': [
            'Pensamentos de se machucar ou machucar outros',
            'Sensação de pânico com dor no peito ou falta de ar',
            'Incapacidade de realizar atividades do dia-a-dia',
            'CVV: ligue 188 se precisar conversar',
        ],
        // By CID category letter (fallback)
        '_I': ['Dor no peito, falta de ar, inchaço nas pernas ou desmaio'],
        '_E': ['Sede excessiva, tontura, tremores ou confusão mental'],
        '_J': ['Falta de ar intensa, febre alta persistente ou lábios azulados'],
        '_N': ['Febre alta, dor lombar intensa ou urina com sangue'],
        '_R': ['Qualquer piora significativa dos sintomas'],
        '_G': ['Dor de cabeça muito forte, convulsões ou confusão mental'],
        '_M': ['Inchaço, vermelhidão intensa ou incapacidade de movimentar'],
        '_K': ['Vômitos com sangue, dor abdominal intensa ou fezes escuras'],
        '_A': ['Febre que não cede, prostração ou confusão mental'],
        '_T': ['Inchaço progressivo, dormência ou sangramento'],
        // Generic fallback
        '_DEFAULT': [
            'Febre persistente acima de 38.5°C',
            'Dor que não melhora com a medicação',
            'Falta de ar ou dificuldade para respirar',
            'Qualquer piora dos sintomas',
        ],
    };

    /**
     * Generate prescription (Receituário)
     */
    function generatePrescription(soapResult) {
        const cid = soapResult.clinicalData.cid_principal.code;
        const items = PRESCRIPTION_MAP[cid] || PRESCRIPTION_MAP['DEFAULT'];

        return {
            type: 'receituario',
            title: 'Receituário Médico',
            icon: '💊',
            validated: false,
            items: items.map((item, i) => ({
                numero: i + 1,
                ...item,
                editavel: true
            })),
            observacoes: 'Uso conforme orientação médica. Retorno se não houver melhora.'
        };
    }

    /**
     * Generate medical certificate (Atestado)
     */
    function generateAttestation(soapResult, patientData) {
        const cid = soapResult.clinicalData.cid_principal;
        const gravidade = soapResult.clinicalData.gravidade;
        const dias = ATTEST_DAYS[gravidade] || 1;

        return {
            type: 'atestado',
            title: 'Atestado Médico',
            icon: '📄',
            validated: false,
            iniciais: patientData.iniciais,
            idade: patientData.idade,
            cid: `${cid.code} - ${cid.desc}`,
            dias_sugeridos: dias,
            texto: `Atesto, para os devidos fins, que o(a) paciente ${patientData.iniciais}, ${patientData.idade} anos, esteve sob cuidados médicos nesta data, necessitando de afastamento de suas atividades por ${dias} dia(s). CID-10: ${cid.code}.`,
            data: new Date().toLocaleDateString('pt-BR'),
            editavel: true
        };
    }

    /**
     * Generate exam request (Pedido de Exames)
     */
    function generateExamRequest(soapResult) {
        const cid = soapResult.clinicalData.cid_principal;
        const category = cid.code.charAt(0);
        const exams = EXAM_MAP[category] || EXAM_MAP['R'];

        return {
            type: 'pedido_exames',
            title: 'Pedido de Exames',
            icon: '🔬',
            validated: false,
            hipotese_diagnostica: `${cid.desc} (${cid.code})`,
            exames: exams.map(exam => ({
                nome: exam,
                urgencia: soapResult.clinicalData.gravidade === 'Grave' ? 'Urgente' : 'Rotina',
                selecionado: true
            })),
            justificativa: `Investigação diagnóstica de ${cid.desc}. Correlacionar com clínica.`,
            editavel: true
        };
    }

    /**
     * Generate patient guide in simple language (Guia de Orientações Leigas)
     */
    function generatePatientGuide(soapResult, patientData) {
        const cid = soapResult.clinicalData.cid_principal;
        const meds = soapResult.clinicalData.medicacoes_atuais;

        const guideLines = [
            `📋 Olá! Aqui está um resumo da sua consulta de hoje (${new Date().toLocaleDateString('pt-BR')}):`,
            '',
            `🩺 O que foi avaliado: ${cid.desc}`,
            '',
            '💊 Seus medicamentos:',
        ];

        if (meds.length > 0) {
            meds.forEach(med => guideLines.push(`   • ${med} — tome conforme orientação médica`));
        } else {
            guideLines.push('   • Medicamentos serão definidos pelo médico');
        }

        // Dynamic alert lookup: specific CID → category letter → generic fallback
        const cidCode = cid.code;
        const cidCategory = `_${cidCode.charAt(0)}`;
        const alerts = ALERT_MAP[cidCode] || ALERT_MAP[cidCategory] || ALERT_MAP['_DEFAULT'];

        guideLines.push('');
        guideLines.push('⚠️ Sinais de alerta — procure o hospital se:');
        alerts.forEach(alert => guideLines.push(`   • ${alert}`));

        guideLines.push('');
        guideLines.push('📅 Retorno: conforme agendamento ou se houver piora.');
        guideLines.push('');
        guideLines.push('❤️ Cuide-se! Mantenha hidratação e repouso.');

        return {
            type: 'guia_paciente',
            title: 'Guia de Orientações para o Paciente',
            icon: '❤️',
            validated: false,
            texto: guideLines.join('\n'),
            linguagem: 'simples',
            editavel: true
        };
    }

    /**
     * Generate all documents from SOAP result
     */
    function generateAll(soapResult, patientData) {
        return {
            receituario: generatePrescription(soapResult),
            atestado: generateAttestation(soapResult, patientData),
            pedido_exames: generateExamRequest(soapResult),
            guia_paciente: generatePatientGuide(soapResult, patientData)
        };
    }

    /**
     * Validate a document (security lock)
     * Returns true only if validated by attending physician
     */
    function validate(document) {
        document.validated = true;
        document.validated_at = new Date().toISOString();
        document.validated_label = '✅ Validado pelo Médico Assistente';
        return document;
    }

    /**
     * Check if document can be exported
     */
    function canExport(document) {
        return document.validated === true;
    }

    return {
        generatePrescription, generateAttestation, generateExamRequest,
        generatePatientGuide, generateAll, validate, canExport
    };
})();
