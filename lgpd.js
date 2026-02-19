/**
 * lgpd.js — LGPD Compliance Module
 * Medical Scribe v1.0
 * Sanitizes patient names to initials, generates anonymous IDs
 */

const LGPD = (() => {

    /**
     * Transforms full name into uppercase initials
     * "João Oliveira Silva" → "J.O.S."
     */
    function sanitizeName(nomeCompleto) {
        if (!nomeCompleto || typeof nomeCompleto !== 'string') return 'N.N.';
        const parts = nomeCompleto.trim().split(/\s+/).filter(p => p.length > 0);
        if (parts.length === 0) return 'N.N.';
        const initials = parts.map(p => p.charAt(0).toUpperCase()).join('.');
        return initials + '.';
    }

    /**
     * Generates anonymous patient ID (hash-based)
     */
    function generateAnonId(nomeCompleto, idade) {
        const raw = `${nomeCompleto}-${idade}-${Date.now()}`;
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
            const char = raw.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return 'PAC-' + Math.abs(hash).toString(36).toUpperCase().padStart(8, '0');
    }

    /**
     * Processes raw patient input with LGPD compliance
     * Returns sanitized object; original name is NEVER stored
     */
    function processPatientInput(rawInput) {
        const { nome_completo, idade, cenario_atendimento, texto_transcrito } = rawInput;

        // Validate required fields
        const errors = [];
        if (!nome_completo || nome_completo.trim().length < 2) errors.push('Nome completo é obrigatório');
        if (!idade || isNaN(parseInt(idade)) || parseInt(idade) < 0 || parseInt(idade) > 150) errors.push('Idade válida é obrigatória');
        if (!cenario_atendimento) errors.push('Cenário de atendimento é obrigatório');

        if (errors.length > 0) {
            return { success: false, errors };
        }

        // Build sanitized output — original name is NEVER kept
        const sanitized = {
            iniciais: sanitizeName(nome_completo),
            paciente_id: generateAnonId(nome_completo, idade),
            idade: parseInt(idade),
            cenario_atendimento,
            texto_transcrito: texto_transcrito || '',
            timestamp: new Date().toISOString(),
            lgpd_conformidade: true
        };

        // Safety: ensure no trace of original name
        // The nome_completo variable only exists in this function scope
        return { success: true, data: sanitized };
    }

    /**
     * Returns LGPD compliance badge HTML
     */
    function getBadgeHTML() {
        return `<span class="lgpd-badge" title="Dados anonimizados conforme LGPD">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            LGPD
        </span>`;
    }

    return { sanitizeName, generateAnonId, processPatientInput, getBadgeHTML };
})();
