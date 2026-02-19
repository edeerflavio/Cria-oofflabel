/**
 * export.js — Export Module (Clipboard + PDF)
 * Medical Scribe v1.0
 * Uses html2pdf.js for PDF generation
 */

const ExportModule = (() => {

    /**
     * Copy text to clipboard
     */
    async function copyToClipboard(text, feedbackElement) {
        try {
            await navigator.clipboard.writeText(text);
            if (feedbackElement) {
                const original = feedbackElement.textContent;
                feedbackElement.textContent = '✅ Copiado!';
                feedbackElement.classList.add('copy-success');
                setTimeout(() => {
                    feedbackElement.textContent = original;
                    feedbackElement.classList.remove('copy-success');
                }, 2000);
            }
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                if (feedbackElement) {
                    const original = feedbackElement.textContent;
                    feedbackElement.textContent = '✅ Copiado!';
                    setTimeout(() => { feedbackElement.textContent = original; }, 2000);
                }
                return true;
            } catch (e) {
                console.error('[Export] Falha ao copiar:', e);
                return false;
            } finally {
                document.body.removeChild(textarea);
            }
        }
    }

    /**
     * Format document for clipboard (plain text)
     */
    function formatForClipboard(doc) {
        let text = '';
        switch (doc.type) {
            case 'receituario':
                text = `═══ RECEITUÁRIO MÉDICO ═══\n`;
                text += `Data: ${new Date().toLocaleDateString('pt-BR')}\n\n`;
                doc.items.forEach(item => {
                    text += `${item.numero}. ${item.med}\n`;
                    text += `   Dose: ${item.dose} | Via: ${item.via}\n`;
                    text += `   Frequência: ${item.freq} | Duração: ${item.duracao}\n`;
                    if (item.obs) text += `   Obs: ${item.obs}\n`;
                    text += '\n';
                });
                text += `Observações: ${doc.observacoes}\n`;
                break;

            case 'atestado':
                text = `═══ ATESTADO MÉDICO ═══\n\n`;
                text += doc.texto + '\n\n';
                text += `Data: ${doc.data}\n`;
                text += `CID-10: ${doc.cid}\n`;
                break;

            case 'pedido_exames':
                text = `═══ PEDIDO DE EXAMES ═══\n`;
                text += `Hipótese: ${doc.hipotese_diagnostica}\n\n`;
                doc.exames.filter(e => e.selecionado).forEach((exam, i) => {
                    text += `${i + 1}. ${exam.nome} [${exam.urgencia}]\n`;
                });
                text += `\nJustificativa: ${doc.justificativa}\n`;
                break;

            case 'guia_paciente':
                text = doc.texto;
                break;

            default:
                text = JSON.stringify(doc, null, 2);
        }

        if (doc.validated) {
            text += '\n\n✅ VALIDADO PELO MÉDICO ASSISTENTE';
            text += `\nEm: ${new Date(doc.validated_at).toLocaleString('pt-BR')}`;
        }

        return text;
    }

    /**
     * Copy all documents as "picotados" (segmented)
     */
    async function copyAllPicotados(documents, feedbackElement) {
        let combined = '';
        for (const [key, doc] of Object.entries(documents)) {
            combined += formatForClipboard(doc) + '\n\n' + '─'.repeat(50) + '\n\n';
        }
        return await copyToClipboard(combined.trim(), feedbackElement);
    }

    /**
     * Generate PDF from HTML content
     * Uses html2pdf.js library
     */
    function generatePDF(htmlContent, filename, options = {}) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div style="font-family: 'Inter', Arial, sans-serif; color: #1a1a1a; padding: 30px;">
                <div style="text-align: center; border-bottom: 2px solid #2563EB; padding-bottom: 15px; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #2563EB; font-size: 18px;">🩺 Medical Scribe</h2>
                    <p style="margin: 5px 0 0; color: #666; font-size: 11px;">Sistema de Documentação Clínica</p>
                </div>
                ${htmlContent}
                <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center; font-size: 10px; color: #999;">
                    <p>Documento gerado pelo Medical Scribe em ${new Date().toLocaleString('pt-BR')}</p>
                    <p>Dados anonimizados conforme LGPD — Lei nº 13.709/2018</p>
                </div>
            </div>
        `;

        const pdfOptions = {
            margin: [10, 10, 10, 10],
            filename: filename || 'medical-scribe-document.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            ...options
        };

        if (typeof html2pdf !== 'undefined') {
            html2pdf().set(pdfOptions).from(wrapper).save();
        } else {
            console.error('[Export] html2pdf.js não carregado');
            alert('Biblioteca de PDF não disponível. Tente novamente.');
        }
    }

    /**
     * Generate a specific document as PDF
     */
    function documentToPDF(doc) {
        let html = '';
        const fname = `${doc.type}_${new Date().toISOString().split('T')[0]}.pdf`;

        switch (doc.type) {
            case 'receituario':
                html = `<h3 style="color: #2563EB;">💊 Receituário Médico</h3>`;
                html += `<p style="color: #666;">Data: ${new Date().toLocaleDateString('pt-BR')}</p>`;
                html += `<table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                    <thead><tr style="background: #f0f4ff;">
                        <th style="padding: 8px; text-align: left; border-bottom: 2px solid #2563EB;">#</th>
                        <th style="padding: 8px; text-align: left; border-bottom: 2px solid #2563EB;">Medicamento</th>
                        <th style="padding: 8px; text-align: left; border-bottom: 2px solid #2563EB;">Dose</th>
                        <th style="padding: 8px; text-align: left; border-bottom: 2px solid #2563EB;">Via</th>
                        <th style="padding: 8px; text-align: left; border-bottom: 2px solid #2563EB;">Frequência</th>
                        <th style="padding: 8px; text-align: left; border-bottom: 2px solid #2563EB;">Duração</th>
                    </tr></thead><tbody>`;
                doc.items.forEach(item => {
                    html += `<tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 8px;">${item.numero}</td>
                        <td style="padding: 8px; font-weight: 600;">${item.med}</td>
                        <td style="padding: 8px;">${item.dose}</td>
                        <td style="padding: 8px;">${item.via}</td>
                        <td style="padding: 8px;">${item.freq}</td>
                        <td style="padding: 8px;">${item.duracao}</td>
                    </tr>`;
                });
                html += `</tbody></table>`;
                html += `<p style="margin-top: 15px; font-style: italic; color: #666;">${doc.observacoes}</p>`;
                break;

            case 'atestado':
                html = `<h3 style="color: #2563EB;">📄 Atestado Médico</h3>`;
                html += `<div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 15px 0; line-height: 1.8;">`;
                html += `<p style="font-size: 14px;">${doc.texto}</p>`;
                html += `</div>`;
                html += `<p style="color: #666;">Data: ${doc.data}</p>`;
                html += `<div style="margin-top: 40px; text-align: center;">
                    <div style="border-top: 1px solid #333; width: 250px; margin: 0 auto; padding-top: 8px;">
                        <p style="margin: 0; font-size: 12px;">Assinatura e Carimbo do Médico</p>
                    </div>
                </div>`;
                break;

            case 'pedido_exames':
                html = `<h3 style="color: #2563EB;">🔬 Pedido de Exames</h3>`;
                html += `<p><strong>Hipótese Diagnóstica:</strong> ${doc.hipotese_diagnostica}</p>`;
                html += `<table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                    <thead><tr style="background: #f0f4ff;">
                        <th style="padding: 8px; text-align: left; border-bottom: 2px solid #2563EB;">#</th>
                        <th style="padding: 8px; text-align: left; border-bottom: 2px solid #2563EB;">Exame</th>
                        <th style="padding: 8px; text-align: left; border-bottom: 2px solid #2563EB;">Urgência</th>
                    </tr></thead><tbody>`;
                doc.exames.filter(e => e.selecionado).forEach((exam, i) => {
                    html += `<tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 8px;">${i + 1}</td>
                        <td style="padding: 8px; font-weight: 600;">${exam.nome}</td>
                        <td style="padding: 8px;">${exam.urgencia}</td>
                    </tr>`;
                });
                html += `</tbody></table>`;
                html += `<p style="font-style: italic; color: #666;">Justificativa: ${doc.justificativa}</p>`;
                break;

            case 'guia_paciente':
                html = `<h3 style="color: #2563EB;">❤️ Guia de Orientações para o Paciente</h3>`;
                html += `<div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 15px 0; white-space: pre-line; line-height: 1.8; font-size: 14px;">`;
                html += doc.texto;
                html += `</div>`;
                break;
        }

        if (doc.validated) {
            html += `<div style="margin-top: 20px; padding: 10px; background: #ecfdf5; border: 1px solid #06D6A0; border-radius: 8px; text-align: center;">
                <strong style="color: #059669;">✅ VALIDADO PELO MÉDICO ASSISTENTE</strong>
                <br><small style="color: #666;">Em: ${new Date(doc.validated_at).toLocaleString('pt-BR')}</small>
            </div>`;
        }

        generatePDF(html, fname);
    }

    return { copyToClipboard, formatForClipboard, copyAllPicotados, generatePDF, documentToPDF };
})();
