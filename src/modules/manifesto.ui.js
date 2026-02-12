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
        if (!row.operador || row.operador === "—")
          row.operador = pack.operador || operadorPadrao;
        if (!row.remessa) row.remessa = remessaPadrao;
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

  // ================= LOGO =================
  const logoUrl =
    "https://www.kaisan.com.br/skin/frontend/ultimo/default/images/nova/logo-2020-new.png";

  const img = await loadImageBase64(logoUrl);
  if (img) {
    doc.addImage(img, "PNG", 20, 18, 110, 35); // x, y, largura, altura
  }

  // normaliza linhas
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
      operador: r.operador || "—",
    };
  });

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
  doc.text("MANIFESTO DE COLETA", pageW / 2, 60, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  doc.text(`Endereço: ${endereco || "-"}`, 40, 78);
  doc.text(`Transportadora: ${transportadora}`, pageW - 40, 78, {
    align: "right",
  });
  doc.text(`Data da Coleta: ${dataColeta || "-"}`, 40, 92);

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
    ellipsize(r.destinatario, 28),
    r.cep,
    trunc(r.rastreio, 22),
    r.peso,
    r.pedido,
    r.vd,
    trunc(r.metodo, 18),
    r.remessa,
    trunc(r.operador, 14),
  ]);

  doc.autoTable({
    startY: 118,
    head: [
      [
        "Destinatário",
        "CEP",
        "Rastreio",
        "Peso",
        "Pedido",
        "V.D.",
        "Método",
        "Rem.",
        "Op.",
      ],
    ],
    body,

    theme: "grid",
    tableWidth: "auto",
    margin: { left: 18, right: 18 },

    styles: {
      fontSize: 6.5,
      cellPadding: 1.6,
      overflow: "ellipsize", // NÃO quebra linha; corta com “...”
      valign: "middle",
      lineWidth: 0.2,
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [240, 240, 240],
      textColor: 20,
    },

    // 👇 aqui está o “pulo do gato”: colunas longas com width fixo curto,
    // e colunas curtas com wrap (conteúdo).
    columnStyles: {
      0: { cellWidth: 112 }, // Destinatário (truncado)
      1: { cellWidth: 50 }, // CEP
      2: { cellWidth: 92 }, // Rastreio (truncado)
      3: { cellWidth: "wrap", halign: "right" }, // Peso (conteúdo)
      4: { cellWidth: 66 }, // Pedido
      5: { cellWidth: 44, halign: "right" }, // V.D.
      6: { cellWidth: 62 }, // Método (truncado)
      7: { cellWidth: 34 }, // Rem.
      8: { cellWidth: 48 }, // Op. (truncado)
    },
  });

  // ================= RESUMO =================
  const endY = doc.lastAutoTable.finalY + 20;

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

  // linha total geral
  resumoBody.push([
    "TOTAL",
    String(totalQtd),
    fmtGramas(totalPeso),
    fmtBRL(totalVD),
  ]);

  doc.autoTable({
    startY: endY + 10,
    head: [["Método", "Qtd", "Peso", "V.D."]],
    body: resumoBody,
    theme: "grid",
    tableWidth: 320,
    margin: { left: (pageW - 320) / 2 },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      valign: "middle",
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [230, 230, 230],
    },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 50, halign: "right" },
      2: { cellWidth: 80, halign: "right" },
      3: { cellWidth: 90, halign: "right" },
    },
  });

  // ================= ASSINATURA =================
  const afterResumoY = doc.lastAutoTable.finalY + 50;

  // linha
  doc.setLineWidth(0.5);
  doc.line(pageW / 2 - 180, afterResumoY, pageW / 2 + 180, afterResumoY);

  // texto "Assinatura"
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Assinatura", pageW / 2, afterResumoY + 15, {
    align: "center",
  });

  // OBS
  doc.setFontSize(9);
  doc.text(
    "OBS: 1a via da unidade de postagem e 2a via do cliente",
    pageW / 2,
    afterResumoY + 32,
    { align: "center" },
  );

  const filename =
    `manifesto_${transportadora}_${new Date().toISOString().slice(0, 10)}.pdf`
      .replace(/\s+/g, "_")
      .toLowerCase();

  doc.save(filename);
}
