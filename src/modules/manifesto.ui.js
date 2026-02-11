import {
  fetchRemessaHtml,
  parseRemessaHtml,
  normalizarTransportadora,
} from "../services/manifesto.parser.js";

const $ = (q) => document.querySelector(q);

const elInicio = $("#inicio");
const elFim = $("#fim");
const elCookie = $("#cookie");
const elLog = $("#log");
const elStatus = $("#status");
const btnGerar = $("#btnGerar");
const btnLimpar = $("#btnLimpar");

const elProgress = document.querySelector("#progressBar");
function setProgress(pct) {
  if (!elProgress) return;
  elProgress.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function log(msg) {
  elLog.textContent += msg + "\n";
  elLog.scrollTop = elLog.scrollHeight;
}
function status(msg) {
  elStatus.textContent = msg;
}

btnLimpar.addEventListener("click", () => {
  elLog.textContent = "";
  status("Pronto.");
  elInicio.value = "";
  elFim.value = "";
  elCookie.value = "";
});

btnGerar.addEventListener("click", async () => {
  elLog.textContent = "";
  const inicio = Number(String(elInicio.value).trim());
  const fim = Number(String(elFim.value).trim());
  const cookie = String(elCookie.value || "").trim();

  if (
    !Number.isFinite(inicio) ||
    !Number.isFinite(fim) ||
    inicio <= 0 ||
    fim <= 0
  ) {
    log("❌ Início/Fim inválidos.");
    return;
  }
  if (fim < inicio) {
    log("❌ Fim menor que início.");
    return;
  }

  btnGerar.disabled = true;
  status("Processando...");

  try {
    // transportadorasMap: { "Loggi": { header, rows[] }, "Correios": { ... } ... }
    const transportadorasMap = new Map(); // transp -> { header, byPedido: Map(), rows: [] }

    for (let id = inicio; id <= fim; id++) {
      await new Promise((r) => setTimeout(r, 150));
      status(`Buscando ${id}...`);
      log(`▶️ Fetch remessa/arquivo ${id}...`);

      let html;
      try {
        html = await fetchRemessaHtml(id, cookie);
      } catch (e) {
        log(`⚠️ Falha no fetch ${id}: ${e?.message || e}`);
        continue;
      }

      const total = fim - inicio + 1;
      let done = 0;

      for (let id = inicio; id <= fim; id++) {
        // ...
        done++;
        setProgress(Math.round((done / total) * 100));
      }

      const parsed = parseRemessaHtml(html);
      if (!parsed?.rows?.length) {
        log(
          `⚠️ Sem linhas encontradas em ${id} (talvez vazio / layout mudou / sem permissão).`,
        );
        continue;
      }

      // normaliza e agrupa
      const transp = normalizarTransportadora(
        parsed.transportadora,
        parsed.rows,
      );
      parsed.transportadora = transp;

      if (!transportadorasMap.has(transp)) {
        transportadorasMap.set(transp, {
          header: {
            endereco: parsed.endereco || "",
            dataColeta: parsed.dataColeta || "",
          },
          byPedido: new Map(),
        });
      }

      const bucket = transportadorasMap.get(transp);

      for (const row of parsed.rows) {
        const pedidoKey = String(row?.pedido || "").trim();
        if (!pedidoKey) continue;

        const existente = bucket.byPedido.get(pedidoKey);
        if (!existente) {
          bucket.byPedido.set(pedidoKey, row);
        } else {
          bucket.byPedido.set(
            pedidoKey,
            escolherMaisAntigoPorRemessa(existente, row),
          );
        }
      }

      log(
        `✅ OK ${id}: ${parsed.rows.length} itens • transp=${transp} • exemplo método=${
          parsed.rows[0]?.metodo_envio || "-"
        }`,
      );
    }

    status("Gerando PDFs...");

    if (!transportadorasMap.size) {
      log("❌ Nenhum dado coletado no intervalo.");
      return;
    }

    // Gera 1 PDF por transportadora (download automático)
    for (const [transportadora, pack] of transportadorasMap.entries()) {
      const rows = Array.from(pack.byPedido.values());

      // ordena por remessa asc e depois pedido
      rows.sort(
        (a, b) =>
          toInt(a.remessa) - toInt(b.remessa) ||
          toInt(a.pedido) - toInt(b.pedido),
      );

      gerarPDFManifestoTransportadora({
        transportadora,
        endereco: pack.header.endereco,
        dataColeta: pack.header.dataColeta,
        rows,
      });
    }

    status("Concluído.");
    log("✅ Finalizado.");
  } finally {
    btnGerar.disabled = false;
  }
});

const { jsPDF } = window.jspdf;

function parsePesoToGramas(pesoStr) {
  // exemplos no pdf: "17.030g", "0.510g" (já vem em g)
  const s = String(pesoStr || "")
    .replace(",", ".")
    .toLowerCase();
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function parseBRL(vdStr) {
  // "R$ 11.042,45"
  const s = String(vdStr || "")
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function fmtGramas(g) {
  // 17030 => "17.030g"
  const n = Math.round(g);
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}g`;
}
function fmtBRL(n) {
  return `R$ ${Number(n || 0)
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function inferMetodo(row, transportadora) {
  if (transportadora === "Correios") {
    const m = String(row.metodo_envio || "").toUpperCase();
    if (m.includes("SEDEX")) return "SEDEX";
    return "PAC";
  }
  // Loggi: mantém o "método de envio" original (ex: Loggi Express Cross Dock) :contentReference[oaicite:5]{index=5}
  return row.metodo_envio || transportadora;
}

function gerarPDFManifestoTransportadora({
  transportadora,
  endereco,
  dataColeta,
  rows,
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // normaliza linhas
  const safeRows = (rows || []).map((r) => ({
    destinatario: r.destinatario || "",
    cep: r.cep || "",
    rastreio: r.rastreio || "",
    peso: r.peso || "",
    pedido: r.pedido || "",
    vd: r.vd || "",
    metodo: inferMetodo(r, transportadora),
    remessa: r.remessa || "",
    operador: r.operador || "",
  }));

  // Totais
  const resumo = new Map(); // metodo -> { qtd, peso, vd }
  let totalQtd = 0;
  let totalPeso = 0;
  let totalVD = 0;

  for (const r of safeRows) {
    const pesoG = parsePesoToGramas(r.peso);
    const vd = parseBRL(r.vd);
    totalQtd += 1;
    totalPeso += pesoG;
    totalVD += vd;

    const key = r.metodo || transportadora;
    if (!resumo.has(key)) resumo.set(key, { qtd: 0, peso: 0, vd: 0 });
    const acc = resumo.get(key);
    acc.qtd += 1;
    acc.peso += pesoG;
    acc.vd += vd;
  }

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("REMESSA DE COLETA", pageW / 2, 42, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  doc.text(`Endereço: ${endereco || "-"}`, 40, 60);
  doc.text(`Transportadora: ${transportadora}`, pageW - 40, 60, {
    align: "right",
  });

  doc.text(`Data da Coleta: ${dataColeta || "-"}`, 40, 74);

  // Se quiser, você pode computar "Remessas de X a Y" pegando min/max de remessa (se vier preenchido)
  const remessasNum = safeRows
    .map((r) => Number(String(r.remessa).replace(/[^\d]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (remessasNum.length) {
    const minR = Math.min(...remessasNum);
    const maxR = Math.max(...remessasNum);
    doc.text(`Remessas de ${minR} a ${maxR}`, 40, 88);
  }

  // Linha de totais (como no manifesto dos Correios) :contentReference[oaicite:6]{index=6}
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL`, 40, 108);
  doc.setFont("helvetica", "normal");
  doc.text(`${totalQtd} objetos`, 90, 108);
  doc.text(`${fmtGramas(totalPeso)}`, 170, 108);
  doc.text(`${fmtBRL(totalVD)}`, 260, 108);

  // Tabela principal
  const body = safeRows.map((r) => [
    r.destinatario,
    r.cep,
    r.rastreio,
    r.peso,
    r.pedido,
    r.vd,
    r.metodo,
    r.remessa,
    r.operador,
  ]);

  doc.autoTable({
    startY: 118,
    head: [
      [
        "Destinatário",
        "CEP",
        "Código de Rastreio",
        "Peso",
        "Pedido",
        "V.D.",
        "Método de Envio",
        "Remessa",
        "Operador",
      ],
    ],
    body,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: 3,
      overflow: "linebreak",
      lineWidth: 0.2,
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [240, 240, 240],
      textColor: 20,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    didDrawPage: function () {
      const pageCount = doc.internal.getNumberOfPages();
      const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Página ${pageNumber} de ${pageCount}`,
        doc.internal.pageSize.getWidth() - 40,
        doc.internal.pageSize.getHeight() - 18,
        { align: "right" },
      );
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 55 },
      2: { cellWidth: 110 },
      3: { cellWidth: 45, halign: "right" },
      4: { cellWidth: 70 },
      5: { cellWidth: 55, halign: "right" },
      6: { cellWidth: 90 },
      7: { cellWidth: 45 },
      8: { cellWidth: 60 },
    },
    margin: { left: 40, right: 40 },
  });

  // Resumo de coleta
  const endY = doc.lastAutoTable.finalY + 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("RESUMO DE COLETA", pageW / 2, endY, { align: "center" });

  const resumoBody = [];
  for (const [metodo, acc] of resumo.entries()) {
    resumoBody.push([
      metodo,
      String(acc.qtd),
      fmtGramas(acc.peso),
      fmtBRL(acc.vd),
    ]);
  }
  resumoBody.push([
    "TOTAL",
    String(totalQtd),
    fmtGramas(totalPeso),
    fmtBRL(totalVD),
  ]);

  doc.autoTable({
    startY: endY + 10,
    head: [["Método de Envio", "Quantidade de objetos", "Peso", "V.D."]],
    body: resumoBody,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 160 },
      1: { cellWidth: 140, halign: "right" },
      2: { cellWidth: 110, halign: "right" },
      3: { cellWidth: 110, halign: "right" },
    },
    margin: { left: 120, right: 120 },
  });

  const filename =
    `manifesto_${transportadora}_${new Date().toISOString().slice(0, 10)}.pdf`
      .replace(/\s+/g, "_")
      .toLowerCase();

  doc.save(filename);
}

function toInt(v) {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : Infinity;
}

function escolherMaisAntigoPorRemessa(a, b) {
  // retorna o registro com menor remessa (mais antigo)
  const ra = toInt(a?.remessa);
  const rb = toInt(b?.remessa);

  if (ra !== rb) return ra < rb ? a : b;

  // fallback se remessa empatar/ausente: usa menor pedido numérico (ou mantém a)
  const pa = toInt(a?.pedido);
  const pb = toInt(b?.pedido);
  if (pa !== pb) return pa < pb ? a : b;

  return a;
}
