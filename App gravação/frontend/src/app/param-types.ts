
export interface CidPrincipal {
    code: string;
    desc: string;
}

export interface SinaisVitaisValues {
    pa?: { sistolica: number; diastolica: number; raw: string } | null;
    fc?: { valor: number; raw: string } | null;
    temperatura?: { valor: number; raw: string } | null;
    sato2?: { valor: number; raw: string } | null;
    fr?: { valor: number; raw: string } | null;
}

export interface SOAPSection {
    title: string;
    icon: string;
    content: string;
    sinais_vitais?: SinaisVitaisValues;
}

export interface DialogEntry {
    speaker: string;
    text: string;
}

export interface AnalyzeResponse {
    status: string; // 'success' or 'error'
    data?: {
        soap?: Record<string, SOAPSection>;
        clinical_data?: {
            cid_principal: CidPrincipal;
            gravidade: string;
            sinais_vitais: SinaisVitaisValues;
            medicacoes_atuais: string[];
            alergias: string[];
            comorbidades: string[];
        };
        json_universal?: Record<string, any>;
        dialog?: DialogEntry[];
    };
    patient?: {
        iniciais: string;
        paciente_id: string;
        idade: number;
        cenario_atendimento: string;
    };
    documents?: Record<string, any>;
    consultation_id?: number;
    errors?: string[];
}
