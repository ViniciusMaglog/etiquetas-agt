"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';

// Declara as bibliotecas no escopo global para o TypeScript
declare global {
  interface Window {
    Papa: any;
    jspdf: any;
    bwipjs: any;
  }
}

// Interface atualizada para os dados da Etiqueta Master AGT
interface CsvRow {
  MODELO: string;        // Ex: AGT-SFT1
  QUANTIDADE: string;    // Ex: 20
  PESO_BRUTO: string;    // Ex: 14,40
  PESO_LIQUIDO: string;  // Ex: 13,60
  DIMENSOES: string;     // Ex: 555 x 365 x 385
  EAN: string;          // Código de barras superior
  DUN: string;          // Código de barras inferior (Caixa Master)
  QTD_ETIQUETAS?: string;
}

export default function HomePage() {
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [scriptsLoaded, setScriptsLoaded] = useState(false);

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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
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
          // Colunas obrigatórias para o modelo AGT
          const requiredColumns = ['MODELO', 'QUANTIDADE', 'PESO_BRUTO', 'PESO_LIQUIDO', 'DIMENSOES', 'EAN', 'DUN'];
          const fileColumns = results.meta.fields || [];
          const missingColumns = requiredColumns.filter(col => !fileColumns.includes(col));

          if (missingColumns.length > 0) {
            setError(`O arquivo CSV não contém as colunas obrigatórias: ${missingColumns.join(', ')}`);
            setCsvData([]);
            return;
          }

          setCsvData(results.data);
        },
        error: (err: any) => {
            setError(`Erro ao processar o arquivo: ${err.message}`);
        }
      });
    }
  };

  const downloadTemplate = () => {
    const csvContent = "\uFEFFMODELO;QUANTIDADE;PESO_BRUTO;PESO_LIQUIDO;DIMENSOES;EAN;DUN;QTD_ETIQUETAS\n" +
                       "AGT-SFT1;20;14,40;13,60;555 x 365 x 385;7898663992717;17898663996118;1";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_etiquetas_agt.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const generatePDF = async () => {
    if (csvData.length === 0) {
      setError("Nenhum dado válido para gerar as etiquetas.");
      return;
    }
    setLoading(true);
    setError('');

    // Configuração PDF: 10cm x 7cm (100mm x 70mm)
    const doc = new window.jspdf.jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [100, 70], 
    });

    // Função para gerar Barcode
    const generateBarcodeImage = (text: string, bcid: string, includeText: boolean): Promise<string> => {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        try {
          window.bwipjs.toCanvas(canvas, {
            bcid: bcid, // 'ean13' ou 'code128' ou 'itf14'
            text: text,
            scale: 3,
            height: 10,
            includetext: includeText,
            textxalign: 'center',
          });
          resolve(canvas.toDataURL("image/png"));
        } catch (e) { reject(e); }
      });
    };

    let isFirstPage = true;

    for (const row of csvData) {
        // Validação básica de linha vazia
        if (!row.MODELO) continue;

        const quantity = parseInt(row.QTD_ETIQUETAS || '1', 10);
        
        try {
            // Gera as imagens dos códigos de barras
            const barcodeTop = await generateBarcodeImage(row.EAN, 'ean13', true);
            const barcodeBottom = await generateBarcodeImage(row.DUN, 'code128', true);

            for (let i = 0; i < quantity; i++) {
                if (!isFirstPage) doc.addPage();
                isFirstPage = false;

                const pageW = 100;
                const pageH = 70;

                // --- 1. CABEÇALHO (MODO ECONÔMICO) ---
                // Removemos o retângulo preto de fundo para economizar tinta
                // doc.setFillColor(26, 26, 26); 
                // doc.rect(0, 0, pageW, 16, 'F'); 
                
                // Texto agora é PRETO (antes era branco)
                doc.setTextColor(0, 0, 0); 
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(26);
                
                // Centraliza o modelo no topo
                doc.text(row.MODELO, pageW / 2, 11, { align: 'center' });
                
                // Adicionei uma linha fina embaixo do título para separar visualmente
                doc.setLineWidth(0.5);
                doc.line(2, 14, pageW - 2, 14);

                // --- CONFIGURAÇÃO DE TEXTO DA ETIQUETA ---
                doc.setTextColor(0, 0, 0); // Garante preto para o resto
                
                // Posições X
                const col1LabelX = 4;
                const col1ValueX = 28;
                
                // --- LINHA 1: QTY ---
                let currentY = 26;
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(10);
                doc.text("QTY.:", col1LabelX, currentY);
                doc.setFont("Helvetica", "normal");
                doc.setFontSize(7);
                doc.text("Quantidade Total", col1LabelX, currentY + 3.5);
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(14);
                doc.text(`${row.QUANTIDADE} unid.`, col1ValueX, currentY + 1);

                // --- LINHA 2: GW (Peso Bruto) ---
                currentY = 38;
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(10);
                doc.text("GW.:", col1LabelX, currentY);
                doc.setFont("Helvetica", "normal");
                doc.setFontSize(7);
                doc.text("Peso Bruto", col1LabelX, currentY + 3.5);
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(14);
                doc.text(`${row.PESO_BRUTO} kg`, col1ValueX, currentY + 1);

                // --- LINHA 3: NW (Peso Líquido) ---
                currentY = 50;
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(10);
                doc.text("NW.:", col1LabelX, currentY);
                doc.setFont("Helvetica", "normal");
                doc.setFontSize(7);
                doc.text("Peso Líquido", col1LabelX, currentY + 3.5);
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(14);
                doc.text(`${row.PESO_LIQUIDO} kg`, col1ValueX, currentY + 1);

                // --- LINHA 4: MEAS (Dimensões) ---
                currentY = 62;
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(10);
                doc.text("MEAS.:", col1LabelX, currentY);
                doc.setFont("Helvetica", "normal");
                doc.setFontSize(7);
                doc.text("Dimensões", col1LabelX, currentY + 3.5);
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(12); 
                doc.text(`${row.DIMENSOES} mm`, col1ValueX, currentY + 1);

                // --- COLUNA DIREITA (CÓDIGOS DE BARRAS) ---
                // Ajuste aqui para controlar a posição e largura do DUN
                const barcodeX = 50;
                const barcodeW = 45; // Aumente aqui se quiser o código mais largo

                // Barcode 1 (Topo)
                doc.addImage(barcodeTop, 'PNG', barcodeX, 18, barcodeW, 12);
                
                // Barcode 2 (Baixo)
                //const boxX = barcodeX - 1;
                const boxY = 44;
                //const boxW = barcodeW + 2;
                const boxH = 14;
                
                doc.setLineWidth(1.5);
                doc.setDrawColor(0);
                //doc.rect(boxX, boxY, boxW, boxH);
                
                doc.addImage(barcodeBottom, 'PNG', barcodeX, boxY + 1, barcodeW, boxH - 2);

                // --- RODAPÉ LOGO ---
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(10);
                doc.text("AGETHERM", pageW - 4, pageH - 3, { align: 'right' });

            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Erro ao gerar etiqueta para ${row.MODELO}: ${errorMessage}`);
            console.error(e);
            continue; 
        }
    }

    if (!error) doc.save("etiquetas_master.pdf");
    setLoading(false);
  };
  
  return (
    <div className="bg-gray-900 min-h-screen flex flex-col items-center justify-center p-4 text-gray-100">
        <div className="w-full max-w-lg bg-gray-800 rounded-2xl shadow-xl p-8 space-y-6">
            <div className='text-center'>
                
                <Image
                  src="/logo.png"
                  alt="Logo da sua Empresa"
                  width={160}
                  height={160}
                  className="w-40 h-auto mx-auto mb-4"
                />

                <h1 className="text-3xl font-bold text-white">Etiqueta Master (AGT)</h1>
                <p className="text-gray-400 mt-2">Gera etiquetas 10x7cm</p>
                {!scriptsLoaded && !error && <p className="text-yellow-400 text-sm mt-2">Carregando dependências...</p>}
            </div>

            {error && (
                <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg text-sm">
                    <p>{error}</p>
                </div>
            )}
            
            <div className="space-y-4">
                <p className="text-sm font-medium text-gray-300">Faça o upload do arquivo CSV:</p>
                
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