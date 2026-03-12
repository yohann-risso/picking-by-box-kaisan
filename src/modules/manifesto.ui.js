import {
  fetchRemessaHtml,
  parseRemessaHtml,
  normalizarTransportadora,
} from "../services/manifesto.parser.js";

// ===== DOM =====
const $ = (q) => document.querySelector(q);
const elInicio = $("#inicio");
const elFim = $("#fim");
const elLog = $("#log");
const elStatus = $("#status");
const elProgress = $("#progressBar");

const btnAnalisar = $("#btnAnalisar");
const btnLimpar = $("#btnLimpar");

const previewCard = $("#previewCard");
const previewList = $("#previewList");
const btnMarcarTudo = $("#btnMarcarTudo");
const btnDesmarcarTudo = $("#btnDesmarcarTudo");
const btnGerarSelecionados = $("#btnGerarSelecionados");

// ===== state =====
const state = {
  packs: new Map(), // transportadora -> pack
  selected: new Set(),
};

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
  setProgress(0);
  previewCard.style.display = "none";
  previewList.innerHTML = "";
  state.packs.clear();
  state.selected.clear();
  elInicio.value = "";
  elFim.value = "";
});

btnMarcarTudo?.addEventListener("click", () => {
  state.selected = new Set(state.packs.keys());
  renderPreview();
});

btnDesmarcarTudo?.addEventListener("click", () => {
  state.selected.clear();
  renderPreview();
});

btnAnalisar.addEventListener("click", async () => {
  elLog.textContent = "";
  setProgress(0);

  const inicio = Number(String(elInicio.value).trim());
  const fim = Number(String(elFim.value).trim());

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

  btnAnalisar.disabled = true;
  status("Analisando...");

  try {
    state.packs.clear();
    state.selected.clear();

    const total = fim - inicio + 1;
    let done = 0;

    for (let id = inicio; id <= fim; id++) {
      await new Promise((r) => setTimeout(r, 120));
      status(`Buscando ${id}...`);
      log(`▶️ Fetch remessa/arquivo ${id}...`);

      let html;
      try {
        html = await fetchRemessaHtml(id /* sem cookie na UI */);
      } catch (e) {
        log(`⚠️ Falha no fetch ${id}: ${e?.message || e}`);
        done++;
        setProgress(Math.round((done / total) * 100));
        continue;
      }

      const parsed = parseRemessaHtml(html);

      log(
        `DEBUG remessa=${parsed.remessaFromTitle || id} usuario="${parsed.usuario}" transpDetalhe="${parsed.transportadoraDetalhe}" macro="${parsed.transportadora}"`,
      );

      const operadorDaRemessa = String(parsed.usuario || "").trim();

      if (!parsed?.rows?.length) {
        log(`⚠️ Sem linhas encontradas em ${id}.`);
        done++;
        setProgress(Math.round((done / total) * 100));
        continue;
      }

      const transp = normalizarTransportadora(
        parsed.transportadora,
        parsed.rows,
      );

      // defaults por remessa
      const remessaPadrao = String(parsed.remessaFromTitle || id).trim();
      const metodoPadrao = String(parsed.transportadoraDetalhe || "").trim();
      const operadorPadrao = String(parsed.usuario || "").trim() || "—";

      // cria pack
      if (!state.packs.has(transp)) {
        state.packs.set(transp, {
          transportadora: transp,
          endereco: parsed.endereco || "",
          dataColeta: parsed.dataColeta || "",
          operador: operadorPadrao,
          metodoHint: metodoPadrao || "",
          byPedido: new Map(),
        });
      }

      const pack = state.packs.get(transp);

      // atualiza header se vier vazio
      if (
        (!pack.operador || pack.operador === "—") &&
        operadorPadrao &&
        operadorPadrao !== "—"
      ) {
        pack.operador = operadorPadrao;
      }
      if (!pack.dataColeta && parsed.dataColeta)
        pack.dataColeta = parsed.dataColeta;
      if (!pack.endereco && parsed.endereco) pack.endereco = parsed.endereco;
      if (!pack.metodoHint && metodoPadrao) pack.metodoHint = metodoPadrao;

      // dedup por pedido (mantém remessa menor)
      for (const row of parsed.rows) {
        // garante remessa na linha
        if (!row.remessa) row.remessa = remessaPadrao;

        // REGRA: operador do cabeçalho replica em todas as linhas da remessa
        row.operador = operadorDaRemessa;

        // método por remessa (CorreiosPAC/SEDEX etc)
        if (!row.metodo_envio) row.metodo_envio = metodoPadrao;

        const pedidoKey = String(row?.pedido || "").trim();
        if (!pedidoKey) continue;

        const existente = pack.byPedido.get(pedidoKey);
        if (!existente) pack.byPedido.set(pedidoKey, row);
        else
          pack.byPedido.set(
            pedidoKey,
            escolherMaisAntigoPorRemessa(existente, row),
          );
      }

      log(`✅ OK ${id}: ${parsed.rows.length} itens • transp=${transp}`);
      done++;
      setProgress(Math.round((done / total) * 100));
    }

    if (!state.packs.size) {
      status("Nenhum dado encontrado.");
      log("❌ Nenhum dado coletado no intervalo.");
      previewCard.style.display = "none";
      return;
    }

    // por padrão: marca tudo
    state.selected = new Set(state.packs.keys());

    previewCard.style.display = "block";
    renderPreview();
    status("Selecione e gere.");
  } finally {
    btnAnalisar.disabled = false;
  }
});

btnGerarSelecionados.addEventListener("click", async () => {
  if (!state.selected.size) {
    log("⚠️ Nenhuma transportadora selecionada.");
    return;
  }

  status("Gerando PDFs...");
  for (const transp of state.selected) {
    const pack = state.packs.get(transp);
    if (!pack) continue;

    const rows = Array.from(pack.byPedido.values()).sort(
      (a, b) =>
        toInt(a.remessa) - toInt(b.remessa) ||
        toInt(a.pedido) - toInt(b.pedido),
    );

    await gerarPDFManifestoTransportadora({
      transportadora: transp,
      endereco: pack.endereco,
      dataColeta: pack.dataColeta,
      rows,
    });
  }
  status("Concluído.");
  log("✅ PDFs gerados.");
});

function renderPreview() {
  const items = Array.from(state.packs.values()).map((p) => {
    const qtd = p.byPedido.size;
    const checked = state.selected.has(p.transportadora);

    const operador = p.operador && p.operador.trim() ? p.operador.trim() : "—";
    const metodo =
      p.metodoHint && p.metodoHint.trim() ? p.metodoHint.trim() : "";

    return `
      <label class="manifesto-preview-item">
        <input
          type="checkbox"
          data-transp="${escapeHtml(p.transportadora)}"
          ${checked ? "checked" : ""}
        />

        <div class="manifesto-preview-main">
          <div class="manifesto-preview-title">
            ${escapeHtml(p.transportadora)}
            <span class="manifesto-pill">${qtd}</span>
          </div>

          <div class="muted" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <span class="manifesto-pill manifesto-pill-muted">
              ${escapeHtml(operador)}
            </span>

            ${
              metodo
                ? `<span class="manifesto-pill manifesto-pill-muted">${escapeHtml(metodo)}</span>`
                : ""
            }
          </div>
        </div>
      </label>
    `;
  });

  previewList.innerHTML = items.join("");

  previewList
    .querySelectorAll('input[type="checkbox"][data-transp]')
    .forEach((el) => {
      el.addEventListener("change", (e) => {
        const t = e.target.getAttribute("data-transp");
        if (!t) return;

        if (e.target.checked) state.selected.add(t);
        else state.selected.delete(t);
      });
    });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ===== util: dedup =====
function toInt(v) {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : Infinity;
}
function escolherMaisAntigoPorRemessa(a, b) {
  const ra = toInt(a?.remessa);
  const rb = toInt(b?.remessa);
  if (ra !== rb) return ra < rb ? a : b;
  const pa = toInt(a?.pedido);
  const pb = toInt(b?.pedido);
  if (pa !== pb) return pa < pb ? a : b;
  return a;
}

const { jsPDF } = window.jspdf;

function parsePesoToGramas(pesoStr) {
  // exemplos no pdf: "17.030g", "0.510g" (já vem em g)
  const s = String(pesoStr || "")
    .replace(",", ".")
    .toLowerCase();
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function parseBRL(v) {
  if (v == null) return 0;

  let s = String(v).trim();

  // remove moeda e espaços
  s = s.replace(/\s/g, "").replace(/^R\$/i, "");

  // mantém só dígitos, vírgula, ponto e sinal
  s = s.replace(/[^\d.,-]/g, "");

  if (!s) return 0;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  // Caso 1: tem ponto E vírgula -> assume BR: 1.234,56
  if (hasDot && hasComma) {
    s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // Caso 2: só vírgula -> assume decimal BR: 1234,56
  if (hasComma && !hasDot) {
    s = s.replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // Caso 3: só ponto -> precisa decidir se é decimal (31.10) ou milhar (1.234)
  if (hasDot && !hasComma) {
    const parts = s.split(".");
    // se última parte tem 2 dígitos -> decimal (31.10)
    if (parts.length === 2 && parts[1].length === 2) {
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    }
    // se última parte tem 3 dígitos e tem mais de 1 grupo -> provável milhar
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      s = s.replace(/\./g, "");
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    }
    // fallback: trata como número normal com ponto decimal
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // Caso 4: só dígitos
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

function fmtDataAtualBR() {
  return new Date().toLocaleDateString("pt-BR");
}

function inferMetodo(row, transportadora) {
  if (transportadora === "Correios") {
    const m = String(row.metodo_envio || "").toUpperCase();
    if (m.includes("SEDEX")) return "SEDEX";
    if (m.includes("PAC")) return "PAC";
    return "Correios";
  }
  return row.metodo_envio || transportadora;
}

function trunc(s, max = 26) {
  s = String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

function ellipsize(s, max = 28) {
  s = String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= max) return s;
  if (max <= 1) return "…";
  return s.slice(0, max - 1) + "…";
}

function loadImageBase64(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function gerarPDFManifestoTransportadora({
  transportadora,
  endereco,
  dataColeta,
  rows,
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const M = 36;
  const headerTop = 28;
  const dataAtual = fmtDataAtualBR();

  const logoUrl =
    "https://www.kaisan.com.br/skin/frontend/ultimo/default/images/nova/logo-2020-new.png";

  const img = await loadImageBase64(logoUrl);

  const safeRows = (rows || []).map((r) => {
    const vdNum = parseBRL(r.vd);
    return {
      destinatario: r.destinatario || "",
      cep: r.cep || "",
      rastreio: r.rastreio || "",
      peso: r.peso || "",
      pedido: r.pedido || "",
      vd: fmtBRL(vdNum),
      metodo: inferMetodo(r, transportadora),
      remessa: r.remessa || "",
      operador: r.operador || "",
    };
  });

  const resumo = new Map();
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

  const remessasNum = safeRows
    .map((r) => Number(String(r.remessa || "").replace(/[^\d]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);

  const remessaRange = remessasNum.length
    ? `${Math.min(...remessasNum)}–${Math.max(...remessasNum)}`
    : "-";

  // ================= PÁGINA 1 =================
  if (img) {
    doc.addImage(img, "PNG", M, headerTop, 90, 28);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("MANIFESTO DE COLETA", pageW / 2, headerTop + 18, {
    align: "center",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Transportadora: ${transportadora}`, pageW - M, headerTop + 10, {
    align: "right",
  });
  doc.text(`Data: ${dataAtual}`, pageW - M, headerTop + 22, {
    align: "right",
  });
  doc.text(`Remessas: ${remessaRange}`, pageW - M, headerTop + 34, {
    align: "right",
  });

  const infoTop = headerTop + 46;
  const infoH = 64;

  doc.setDrawColor(0);
  doc.setLineWidth(0.8);
  doc.rect(M, infoTop, pageW - M * 2, infoH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Endereço:", M + 8, infoTop + 16);

  doc.setFont("helvetica", "normal");
  const enderecoTxt = String(endereco || "-")
    .replace(/\s+/g, " ")
    .trim();
  const enderecoLines = doc.splitTextToSize(enderecoTxt, pageW - M * 2 - 90);
  doc.text(enderecoLines.slice(0, 2), M + 72, infoTop + 16);

  doc.setLineWidth(0.4);
  doc.line(M, infoTop + 46, pageW - M, infoTop + 46);

  doc.setFont("helvetica", "bold");
  doc.text("TOTAL:", M + 8, infoTop + 60);

  doc.setFont("helvetica", "normal");
  doc.text(`${totalQtd} objetos`, M + 56, infoTop + 60);
  doc.text(`${fmtGramas(totalPeso)}`, M + 140, infoTop + 60);
  doc.text(`${fmtBRL(totalVD)}`, M + 240, infoTop + 60);

  const body = safeRows.map((r) => [
    ellipsize(r.destinatario, 28),
    r.cep,
    trunc(r.rastreio, 22),
    r.peso,
    r.pedido,
    r.vd,
    trunc(r.metodo, 12),
    r.remessa,
    trunc(r.operador, 14),
  ]);

  const tableStartY = infoTop + infoH + 14;

  doc.autoTable({
    startY: tableStartY,
    head: [
      [
        "Destinatário",
        "CEP",
        "Rastreio",
        "Peso",
        "Pedido",
        "V.D.",
        "Mét.",
        "Rem.",
        "Op.",
      ],
    ],
    body,
    theme: "grid",
    margin: { left: M, right: M },
    tableWidth: "auto",
    styles: {
      fontSize: 6.6,
      cellPadding: 1.6,
      overflow: "ellipsize",
      valign: "middle",
      lineWidth: 0.4,
      lineColor: 0,
      textColor: 0,
    },
    headStyles: {
      fillColor: 0,
      textColor: 255,
      fontStyle: "bold",
      lineWidth: 0.6,
      lineColor: 0,
    },
    columnStyles: {
      0: { cellWidth: 112 },
      1: { cellWidth: 50 },
      2: { cellWidth: 92 },
      3: { cellWidth: "wrap", halign: "right" },
      4: { cellWidth: 66 },
      5: { cellWidth: 54, halign: "right" },
      6: { cellWidth: 40 },
      7: { cellWidth: 34 },
      8: { cellWidth: 58 },
    },
    didDrawPage: () => {
      const pageCount = doc.internal.getNumberOfPages();
      const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Página ${pageNumber} / ${pageCount}`, pageW - M, pageH - 16, {
        align: "right",
      });
    },
  });

  // assinatura na página principal
  const minSpaceForSign = 90;
  let signY = doc.lastAutoTable.finalY + 40;

  if (signY > pageH - minSpaceForSign) {
    doc.addPage();
    signY = 120;
  }

  doc.setDrawColor(0);
  doc.setLineWidth(0.8);
  doc.line(pageW / 2 - 180, signY, pageW / 2 + 180, signY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Assinatura", pageW / 2, signY + 16, { align: "center" });

  doc.setFontSize(9);
  doc.text(
    "OBS: 1a via da unidade de postagem e 2a via do cliente",
    pageW / 2,
    signY + 34,
    { align: "center" },
  );

  // ================= PÁGINA FINAL - RESUMO =================
  doc.addPage();

  if (img) {
    doc.addImage(img, "PNG", M, headerTop, 90, 28);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("RESUMO DE COLETA", pageW / 2, headerTop + 18, {
    align: "center",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Transportadora: ${transportadora}`, pageW - M, headerTop + 10, {
    align: "right",
  });
  doc.text(`Data: ${dataAtual}`, pageW - M, headerTop + 22, {
    align: "right",
  });
  doc.text(`Remessas: ${remessaRange}`, pageW - M, headerTop + 34, {
    align: "right",
  });

  doc.setDrawColor(0);
  doc.setLineWidth(0.8);
  doc.rect(M, infoTop, pageW - M * 2, 52);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Endereço:", M + 8, infoTop + 16);
  doc.text("Resumo geral:", M + 8, infoTop + 36);

  doc.setFont("helvetica", "normal");
  doc.text(enderecoLines.slice(0, 1), M + 72, infoTop + 16);
  doc.text(
    `${totalQtd} objetos   •   ${fmtGramas(totalPeso)}   •   ${fmtBRL(totalVD)}`,
    M + 72,
    infoTop + 36,
  );

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
    startY: infoTop + 70,
    head: [["Método", "Qtd", "Peso", "V.D."]],
    body: resumoBody,
    theme: "grid",
    tableWidth: 340,
    margin: { left: (pageW - 340) / 2 },
    styles: {
      fontSize: 9,
      cellPadding: 4,
      lineWidth: 0.5,
      lineColor: 0,
      textColor: 0,
    },
    headStyles: {
      fillColor: 0,
      textColor: 255,
      fontStyle: "bold",
      lineWidth: 0.6,
      lineColor: 0,
    },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 50, halign: "right" },
      2: { cellWidth: 80, halign: "right" },
      3: { cellWidth: 100, halign: "right" },
    },
    didDrawPage: () => {
      const pageCount = doc.internal.getNumberOfPages();
      const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Página ${pageNumber} / ${pageCount}`, pageW - M, pageH - 16, {
        align: "right",
      });
    },
  });

  const resumoSignY = doc.lastAutoTable.finalY + 50;
  doc.setDrawColor(0);
  doc.setLineWidth(0.8);
  doc.line(pageW / 2 - 180, resumoSignY, pageW / 2 + 180, resumoSignY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Assinatura", pageW / 2, resumoSignY + 16, { align: "center" });

  doc.setFontSize(9);
  doc.text(
    "OBS: 1a via da unidade de postagem e 2a via do cliente",
    pageW / 2,
    resumoSignY + 34,
    { align: "center" },
  );

  // ================= TERCEIRA PÁGINA - RESUMO OPERACIONAL =================
  doc.addPage();

  if (img) {
    doc.addImage(img, "PNG", M, headerTop, 90, 28);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("RESUMO OPERACIONAL", pageW / 2, headerTop + 18, {
    align: "center",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Transportadora: ${transportadora}`, pageW - M, headerTop + 10, {
    align: "right",
  });
  doc.text(`Data: ${dataAtual}`, pageW - M, headerTop + 22, {
    align: "right",
  });
  doc.text(`Remessas: ${remessaRange}`, pageW - M, headerTop + 34, {
    align: "right",
  });

  // construir tabela detalhada
  const resumoOperacionalBody = [];

  for (const [metodo, acc] of resumo.entries()) {
    resumoOperacionalBody.push([
      metodo,
      String(acc.qtd),
      fmtGramas(acc.peso),
      fmtBRL(acc.vd),
    ]);
  }

  // linha total
  resumoOperacionalBody.push([
    "TOTAL",
    String(totalQtd),
    fmtGramas(totalPeso),
    fmtBRL(totalVD),
  ]);

  doc.autoTable({
    startY: headerTop + 60,
    head: [["Método de envio", "Pedidos", "Peso total", "Valor total"]],
    body: resumoOperacionalBody,
    theme: "grid",
    tableWidth: 360,
    margin: { left: (pageW - 360) / 2 },

    styles: {
      fontSize: 10,
      cellPadding: 4,
      lineWidth: 0.5,
      lineColor: 0,
      textColor: 0,
    },

    headStyles: {
      fillColor: 0,
      textColor: 255,
      fontStyle: "bold",
    },

    columnStyles: {
      0: { cellWidth: 150 },
      1: { cellWidth: 60, halign: "right" },
      2: { cellWidth: 80, halign: "right" },
      3: { cellWidth: 90, halign: "right" },
    },
  });

  // assinatura final
  const opSignY = doc.lastAutoTable.finalY + 60;

  doc.line(pageW / 2 - 180, opSignY, pageW / 2 + 180, opSignY);

  doc.setFontSize(10);
  doc.text("Assinatura", pageW / 2, opSignY + 16, { align: "center" });

  doc.setFontSize(9);
  doc.text(
    "OBS: 1a via da unidade de postagem e 2a via do cliente",
    pageW / 2,
    opSignY + 34,
    { align: "center" },
  );

  const filename =
    `manifesto_${transportadora}_${new Date().toISOString().slice(0, 10)}.pdf`
      .replace(/\s+/g, "_")
      .toLowerCase();

  doc.save(filename);
}
