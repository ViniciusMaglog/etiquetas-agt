"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image'; // <-- 2. ADICIONADO AQUI

// Declara as bibliotecas no escopo global para o TypeScript
declare global {
  interface Window {
    Papa: any;
    jspdf: any;
    bwipjs: any;
  }
}

// Interface para os dados do CSV
interface CsvRow {
  NOME_CLIENTE: string;
  CODIGO: string;
  EAN: string;
  DESCRICAO: string;
  LOTE?: string;
  VENCIMENTO?: string;
  QUANTIDADE?: string; // Agora é usado em AMBOS os modos
  QTD_ETIQUETAS?: string;
}

// Define os tipos de etiqueta
type LabelType = 'comLote' | 'semLote';

export default function HomePage() {
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [labelType, setLabelType] = useState<LabelType>('comLote'); // Estado para o tipo

  useEffect(() => {
    const loadScript = (src: string) => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    Promise.all([
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'),
      loadScript('https://cdn.jsdelivr.net/npm/bwip-js@4.1.0/dist/bwip-js.min.js')
    ]).then(() => {
      setScriptsLoaded(true);
    }).catch(err => {
      console.error("Falha ao carregar os scripts necessários:", err);
      setError("Não foi possível carregar as dependências. Verifique sua conexão e recarregue a página.");
    });
  }, []);

  // Handler para limpar o CSV ao trocar o tipo de etiqueta
  const handleLabelTypeChange = (newType: LabelType) => {
    setLabelType(newType);
    setCsvData([]);
    setFileName('');
    setError('');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'text/csv') {
        setError('Por favor, selecione um arquivo .csv');
        return;
      }
      
      setFileName(file.name);
      setError('');
      window.Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        delimiter: ";",
        complete: (results: any) => {
          
          const requiredColumns = ['NOME_CLIENTE', 'CODIGO', 'EAN', 'DESCRICAO', 'QUANTIDADE'];
          
          if (labelType === 'comLote') {
            requiredColumns.push('LOTE', 'VENCIMENTO');
          }

          const fileColumns = results.meta.fields || [];
          const missingColumns = requiredColumns.filter(col => !fileColumns.includes(col));

          if (missingColumns.length > 0) {
            setError(`O arquivo CSV não contém as seguintes colunas obrigatórias para este tipo de etiqueta: ${missingColumns.join(', ')}`);
            setCsvData([]);
            setFileName('');
            return;
          }

          // Filtragem de dados
          const filteredData = results.data.filter((row: CsvRow) => {
            const commonValid = row.NOME_CLIENTE && row.CODIGO && row.EAN && row.DESCRICAO && row.QUANTIDADE;
            
            if (labelType === 'comLote') {
              return commonValid && row.LOTE && row.VENCIMENTO;
            } else {
              return commonValid;
            }
          });


          if (filteredData.length === 0) {
             setError('Nenhuma linha válida encontrada no CSV para o tipo de etiqueta selecionado. Verifique se as colunas obrigatórias estão preenchidas.');
             setCsvData([]);
             setFileName('');
             return;
          }

          setCsvData(filteredData);
        },
        error: (err: any) => {
            setError(`Erro ao processar o arquivo: ${err.message}`);
        }
      });
    }
  };

  const downloadTemplate = () => {
    const csvContent = "\uFEFFNOME_CLIENTE;CODIGO;EAN;DESCRICAO;LOTE;VENCIMENTO;QUANTIDADE;QTD_ETIQUETAS\n" +
                       "SYN;CSSK;7891234567890;CREA Sour Morango com Kiwi;GCRMK2408012;02/2027;10 UN;1\n" + 
                       "OUTRO CLIENTE;XYZ-01;9876543210987;Produto Exemplo 2;;;50 UN;5";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_etiquetas.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const generatePDF = async () => {
    if (csvData.length === 0) {
      setError("Nenhum dado válido para gerar as etiquetas. Verifique o arquivo CSV e o tipo de etiqueta selecionado.");
      return;
    }
    setLoading(true);
    setError('');

    const doc = new window.jspdf.jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [100, 70], 
    });

    const generateBarcodeImage = (text: string, height: number): Promise<string> => {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        try {
          window.bwipjs.toCanvas(canvas, {
            bcid: 'code128', text, scale: 3, height, includetext: false, textxalign: 'center',
          });
          resolve(canvas.toDataURL("image/png"));
        } catch (e) { reject(e); }
      });
    };

    let isFirstPage = true;

    for (const row of csvData) {
        const quantity = parseInt(row.QTD_ETIQUETAS || '1', 10);
        if (isNaN(quantity) || quantity < 1) continue;

        try {
            const eanBarcode = await generateBarcodeImage(row.EAN, 8);
            
            let loteBarcode: string | null = null;
            if (labelType === 'comLote' && row.LOTE) {
              loteBarcode = await generateBarcodeImage(row.LOTE, 8);
            }

            for (let i = 0; i < quantity; i++) {
                if (!isFirstPage) doc.addPage();
                isFirstPage = false;

                const margin = 3;
                const pageW = doc.internal.pageSize.getWidth();
                const contentW = pageW - 30; 
                const contentX = margin + 23; 
                const contentCenterX = contentX + (contentW / 2); 

                doc.setDrawColor(0);
                doc.rect(1, 1, pageW - 2, 68); 

                doc.setFont("Helvetica", "bold");
                doc.setFontSize(16); 
                doc.text(row.NOME_CLIENTE, pageW / 2, 7, { align: 'center' });

                // --- CÓDIGO ---
                doc.setFontSize(8); 
                doc.rect(margin, 9, 22, 7);
                doc.text("CÓDIGO", margin + 11, 13.5, { align: 'center' });
                doc.rect(contentX, 9, contentW, 7);
                doc.setFontSize(12); 
                doc.text(row.CODIGO, contentCenterX, 13.5, { align: 'center' });
                
                // --- EAN/DUN ---
                doc.setFontSize(8);
                doc.rect(margin, 17, 22, 7);
                doc.text("EAN/DUN", margin + 11, 21.5, { align: 'center' });
                doc.addImage(eanBarcode, 'PNG', contentX, 16.5, contentW, 8);
                
                // --- DESCRIÇÃO ---
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(8);
                doc.rect(margin, 25, 22, 15);
                doc.text("DESCRIÇÃO", margin + 11, 33.5, { align: 'center' });
                doc.rect(contentX, 25, contentW, 15);
                doc.setFontSize(8);
                
                const descricaoLimitada = row.DESCRICAO.substring(0, 132);
                const descMaxWidth = pageW - 32;
                const descricaoTexto = doc.splitTextToSize(descricaoLimitada, descMaxWidth);
                const lineHeight = doc.getLineHeight() / doc.internal.scaleFactor;
                const boxCenterY = 25 + (15 / 2);
                const startY = boxCenterY - ((descricaoTexto.length - 1) * lineHeight) / 2;
                
                doc.text(descricaoTexto, contentCenterX, startY, { align: 'center' });

                // --- BLOCO CONDICIONAL ---
                if (labelType === 'comLote') {
                    // --- LOTE ---
                    doc.setFont("Helvetica", "bold");
                    doc.setFontSize(8); 
                    doc.rect(margin, 41.5, 22, 15.5);
                    doc.text("LOTE", margin + 11, 49.5, { align: 'center' });
                    doc.rect(contentX, 41.5, contentW, 7);
                    doc.setFontSize(12); 
                    doc.text(row.LOTE!, contentCenterX, 46, { align: 'center' });
                    if (loteBarcode) {
                        doc.addImage(loteBarcode, 'PNG', contentX, 49, contentW, 8);
                    }

                    // --- BLOCO VENCIMENTO + QUANTIDADE ---
                    const boxY = 59;
                    const boxH = 7;
                    const textY = 64; 
                    const labelW = 22;
                    const contentWSmall = (pageW - (margin * 2) - (labelW * 2)) / 2; // (94 - 44) / 2 = 25
                    const fontS = 12; 

                    // --- VENCIMENTO (Metade Esquerda) ---
                    doc.setFont("Helvetica", "bold");
                    doc.setFontSize(8); 
                    doc.rect(margin, boxY, labelW, boxH);
                    doc.text("VENCIMENTO", margin + labelW / 2, 63.5, { align: 'center' });
                    
                    doc.setFontSize(fontS); 
                    doc.rect(margin + labelW, boxY, contentWSmall, boxH);
                    doc.text(row.VENCIMENTO!, margin + labelW + (contentWSmall / 2), textY, { align: 'center' });

                    // --- QUANTIDADE (Metade Direita) ---
                    const vencXEnd = margin + labelW + contentWSmall; 
                    
                    doc.setFont("Helvetica", "bold");
                    doc.setFontSize(8);
                    doc.rect(vencXEnd, boxY, labelW, boxH);
                    doc.text("QUANTIDADE", vencXEnd + labelW / 2, 63.5, { align: 'center' });

                    doc.setFontSize(fontS);
                    doc.rect(vencXEnd + labelW, boxY, contentWSmall, boxH);
                    doc.text(row.QUANTIDADE!, vencXEnd + labelW + (contentWSmall / 2), textY, { align: 'center' });

                } else {
                    // --- QUANTIDADE (Layout 'semLote') ---
                    const qtyBoxY = 41.5;
                    const qtyBoxHeight = 24.5; 
                    const qtyBoxCenterY = qtyBoxY + (qtyBoxHeight / 2);

                    doc.setFont("Helvetica", "bold");
                    doc.setFontSize(8); 
                    doc.rect(margin, qtyBoxY, 22, qtyBoxHeight);
                    doc.text("QUANTIDADE", margin + 11, qtyBoxCenterY, { align: 'center' });
                    
                    doc.rect(contentX, qtyBoxY, contentW, qtyBoxHeight);
                    doc.setFontSize(22); 
                    doc.setFont("Helvetica", "bold");
                    doc.text(row.QUANTIDADE!, contentCenterX, qtyBoxCenterY + 3.5, { align: 'center' });
                }
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Erro ao gerar código de barras para EAN ${row.EAN}: ${errorMessage}`);
            console.error(e);
            continue; 
        }
    }

    if (!error) doc.save("etiquetas.pdf");
    setLoading(false);
  };
  
  return (
    <div className="bg-gray-900 min-h-screen flex flex-col items-center justify-center p-4 text-gray-100">
        <div className="w-full max-w-lg bg-gray-800 rounded-2xl shadow-xl p-8 space-y-6">
            <div className='text-center'>
                
                {/* === 2. CORREÇÃO AQUI === */}
                <Image
                  src="/logo.png"
                  alt="Logo da sua Empresa"
                  width={160}  // 10rem = 160px (w-40)
                  height={160} // Um valor padrão, o 'h-auto' vai ajustar
                  className="w-40 h-auto mx-auto mb-4" // Adicionado h-auto
                />
                {/* === FIM DA CORREÇÃO 2 === */}

                <h1 className="text-3xl font-bold text-white">Gerador de Etiquetas</h1>
                <p className="text-gray-400 mt-2">Importe um arquivo CSV para criar suas etiquetas.</p>
                {!scriptsLoaded && !error && <p className="text-yellow-400 text-sm mt-2">Carregando dependências...</p>}
            </div>

            {/* --- 1. SELETOR DE TIPO DE ETIQUETA --- */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-300">1. Escolha o tipo de etiqueta:</p>
              
              <div className="flex w-full rounded-lg bg-gray-700 p-1">
                <button
                  type="button"
                  onClick={() => handleLabelTypeChange('comLote')}
                  className={`
                    w-1/2 rounded-md py-2 text-center text-sm font-semibold transition-all duration-200
                    ${labelType === 'comLote' 
                      ? 'bg-emerald-600 text-white shadow-sm' 
                      : 'text-gray-300 hover:bg-gray-600/50 hover:text-white'}
                  `}
                >
                  Com Lote e Vencimento
                </button>
                <button
                  type="button"
                  onClick={() => handleLabelTypeChange('semLote')}
                  className={`
                    w-1/2 rounded-md py-2 text-center text-sm font-semibold transition-all duration-200
                    ${labelType === 'semLote' 
                      ? 'bg-emerald-600 text-white shadow-sm' 
                      : 'text-gray-300 hover:bg-gray-600/50 hover:text-white'}
                  `}
                >
                  Sem Lote (com Quantidade)
                </button>
              </div>

            </div>


            {error && (
                <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg text-sm">
                    <p>{error}</p>
                </div>
            )}
            
            {/* --- 2. UPLOAD E BOTÕES --- */}
            <div className="space-y-4">
                <p className="text-sm font-medium text-gray-300">2. Faça o upload do arquivo:</p>
                <p className='text-xs text-gray-400 -mt-2'>
                  {labelType === 'comLote' 
                    ? 'O modo "Com Lote" requer as colunas: LOTE, VENCIMENTO e QUANTIDADE.'
                    : 'O modo "Sem Lote" requer a coluna: QUANTIDADE.'
                  }
                </p>
                <label htmlFor="file-upload" className={`w-full cursor-pointer bg-gray-700 hover:bg-gray-600 transition-colors text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center ${!scriptsLoaded ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {fileName ? `Arquivo: ${fileName}` : 'Escolher Arquivo CSV'}
                </label>
                <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} className="hidden" disabled={!scriptsLoaded} />

                <div className='flex flex-col sm:flex-row gap-4'>
                    <button 
                        onClick={downloadTemplate} 
                        className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300 flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Baixar Modelo
                    </button>

                    <button 
                        onClick={generatePDF} 
                        disabled={loading || csvData.length === 0 || !scriptsLoaded} 
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300 flex items-center justify-center"
                    >
                        {loading ? (
                            <><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Gerando...</>
                        ) : 'Gerar Etiquetas'}
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
}
