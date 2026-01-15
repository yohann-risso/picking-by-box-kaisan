import { supabase } from "../services/supabase.js";

const STATUS_ORDER = [
  "AGUARDANDO SEPARAÇÃO",
  "SEPARANDO",
  "SEPARADO",
  "DESPACHANDO",
  "AGUARDANDO COMPLETAR",
  "AGUARDANDO COLETA",
  "COLETADO",
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fmtDateBR(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("pt-BR");
}

function pill(status) {
  const s = (status || "").toUpperCase();
  const map = {
    "AGUARDANDO SEPARAÇÃO": ["pill pill-gray", "⏳"],
    SEPARANDO: ["pill pill-yellow", "🟡"],
    SEPARADO: ["pill pill-blue", "✅"],
    DESPACHANDO: ["pill pill-blue", "🚚"],
    "AGUARDANDO COMPLETAR": ["pill pill-yellow", "📦"],
    "AGUARDANDO COLETA": ["pill pill-red", "🧾"],
    COLETADO: ["pill pill-green", "📬"],
  };
  const [cls, icon] = map[s] || ["pill pill-gray", "•"];
  return `<span class="${cls}">${icon} <small>${s || "-"}</small></span>`;
}

function separacaoLabel(r) {
  const total = r.qtd_total ?? 0;
  const bip = r.qtd_bipada ?? 0;
  if (!total) return "—";
  const ok = bip >= total;
  const classe = ok ? "text-success fw-bold" : bip > 0 ? "text-warning" : "";
  return `<span class="${classe} mono">${bip}/${total}</span>`;
}

function boolBadge(ok, labelTrue, labelFalse = "—") {
  if (ok === true)
    return `<span class="text-success fw-bold">${labelTrue}</span>`;
  if (ok === false) return `<span class="text-muted">${labelFalse}</span>`;
  return `<span class="text-muted">—</span>`;
}

function normalizeText(s) {
  return (s || "").toString().trim();
}

function matchLike(hay, needle) {
  if (!needle) return true;
  return normalizeText(hay)
    .toLowerCase()
    .includes(normalizeText(needle).toLowerCase());
}

function matchEquals(hay, needle) {
  if (!needle) return true;
  return (
    normalizeText(hay).toUpperCase() === normalizeText(needle).toUpperCase()
  );
}

function renderCardsResumo(rows) {
  const box = document.getElementById("cardsResumo");
  if (!box) return;

  const cont = {};
  rows.forEach((r) => {
    const st = (r.status_consulta || "—").toUpperCase();
    cont[st] = (cont[st] || 0) + 1;
  });

  const makeCard = (st) => {
    const qtd = cont[st] || 0;
    if (!qtd) return "";
    return `
      <div class="col-6 col-md-3 col-lg-2">
        <div class="card status-card">
          <div class="card-body p-2">
            <div class="muted-small">${st}</div>
            <div class="h4 mb-0">${qtd}</div>
          </div>
        </div>
      </div>
    `;
  };

  box.innerHTML = STATUS_ORDER.map(makeCard).join("");
}

function renderTabela(rows) {
  const tbody = document.getElementById("tbodyConsulta");
  const infoQtd = document.getElementById("infoQtd");
  if (!tbody) return;

  infoQtd.textContent = String(rows.length);

  tbody.innerHTML = rows
    .map((r) => {
      const pedido = r.pedido || r.pedido_id_text || r.pedido_id || "-";
      const status = pill(r.status_consulta);
      const rom = r.romaneio || "-";

      const sep = separacaoLabel(r);
      const nl = r.tem_nl
        ? `<span class="text-warning fw-bold">📦 Sim</span>`
        : `<span class="text-muted">—</span>`;
      const pes = r.pesado
        ? `<span class="text-danger fw-bold">🧾 Pesado</span>`
        : `<span class="text-muted">—</span>`;
      const col = r.coletado
        ? `<span class="text-success fw-bold">📬 Coletado</span>`
        : `<span class="text-muted">—</span>`;

      const metodo = r.metodo_envio || "-";
      const cliente = r.cliente || "-";

      return `
        <tr class="clickable-row" data-pedido="${encodeURIComponent(pedido)}">
          <td class="mono fw-bold">${pedido}</td>
          <td>${fmtDateBR(r.data_pedido)}</td>
          <td>${status}</td>
          <td class="mono">${rom}</td>
          <td class="text-center">${sep}</td>
          <td class="text-center">${nl}</td>
          <td class="text-center">${pes}</td>
          <td class="text-center">${col}</td>
          <td>${metodo}</td>
          <td>${cliente}</td>
        </tr>
      `;
    })
    .join("");
}

function renderDetalhe(r) {
  const el = document.getElementById("detalheBody");
  if (!el) return;

  const pedido = r.pedido || "-";
  el.innerHTML = `
    <div class="mb-2">
      <div class="h5 mb-0 mono">${pedido}</div>
      <div class="mt-2">${pill(r.status_consulta)}</div>
    </div>

    <div class="row g-2">
      <div class="col-md-6">
        <div class="card">
          <div class="card-body">
            <div class="fw-bold mb-2">Separação</div>
            <div>Qtd total: <span class="mono fw-bold">${
              r.qtd_total ?? "-"
            }</span></div>
            <div>Qtd bipada: <span class="mono fw-bold">${
              r.qtd_bipada ?? "-"
            }</span></div>
            <div>Iniciada: ${boolBadge(!!r.separacao_iniciada, "Sim")}</div>
            <div>Finalizada: ${boolBadge(!!r.separacao_finalizada, "Sim")}</div>
          </div>
        </div>
      </div>

      <div class="col-md-6">
        <div class="card">
          <div class="card-body">
            <div class="fw-bold mb-2">Romaneio</div>
            <div>Romaneio: <span class="mono fw-bold">${
              r.romaneio ?? "-"
            }</span></div>
            <div>Iniciado: ${boolBadge(!!r.romaneio_iniciado, "Sim")}</div>
            <div>Started: <span class="mono">${
              r.rom_started_at ?? "-"
            }</span></div>
            <div>Ended: <span class="mono">${r.rom_ended_at ?? "-"}</span></div>
          </div>
        </div>
      </div>

      <div class="col-md-6">
        <div class="card">
          <div class="card-body">
            <div class="fw-bold mb-2">NL</div>
            <div>Tem NL: ${boolBadge(!!r.tem_nl, "Sim")}</div>
            <div>Itens NL: <span class="mono fw-bold">${
              r.nl_itens ?? 0
            }</span></div>
            <div>Último: <span class="mono">${
              r.nl_ultimo_em ?? "-"
            }</span></div>
          </div>
        </div>
      </div>

      <div class="col-md-6">
        <div class="card">
          <div class="card-body">
            <div class="fw-bold mb-2">Pesagem & Coleta</div>
            <div>Pesado: ${boolBadge(!!r.pesado, "Sim")}</div>
            <div>Pesado em: <span class="mono">${
              r.pesado_em ?? "-"
            }</span></div>
            <hr class="my-2"/>
            <div>Coletado: ${boolBadge(!!r.coletado, "Sim")}</div>
            <div>Coletado em: <span class="mono">${
              r.coletado_em ?? "-"
            }</span></div>
            <div>Status: <span class="mono">${
              r.status_atual ?? "-"
            }</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function filtrarLocal(rows) {
  const st = document.getElementById("filtroStatus")?.value || "";
  const metodo = document.getElementById("filtroMetodo")?.value || "";
  const cliente = document.getElementById("filtroCliente")?.value || "";

  return (rows || []).filter((r) => {
    const okStatus = !st || matchEquals(r.status_consulta, st);
    const okMetodo = !metodo || matchLike(r.metodo_envio, metodo);
    const okCliente = !cliente || matchLike(r.cliente, cliente);
    return okStatus && okMetodo && okCliente;
  });
}

async function buscarNoSupabasePaginado(
  { pedidoIni, pedidoFim, dataIni, dataFim },
  { pageSize = 1000, maxRows = 20000 } = {}
) {
  const cols = [
    "pedido",
    "pedido_id",
    "data_pedido",
    "romaneio",
    "status_pedido",
    "metodo_envio",
    "cliente",
    "qtd_total",
    "qtd_bipada",
    "separacao_iniciada",
    "separacao_finalizada",
    "tem_nl",
    "nl_itens",
    "nl_ultimo_em",
    "pesado",
    "pesado_em",
    "romaneio_iniciado",
    "rom_started_at",
    "rom_ended_at",
    "coletado",
    "coletado_em",
    "status_atual",
    "status_consulta",
  ].join(",");

  // filtros
  const iniNum = String(pedidoIni || "").replace(/\D/g, "");
  const fimNum = String(pedidoFim || "").replace(/\D/g, "");

  let all = [];
  let from = 0;

  while (true) {
    let q = supabase
      .from("view_consulta_panorama_pedidos")
      .select(cols)
      .order("pedido_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (dataIni) q = q.gte("data_pedido", dataIni);
    if (dataFim) q = q.lte("data_pedido", dataFim);

    if (iniNum) q = q.gte("pedido_id", Number(iniNum));
    if (fimNum) q = q.lte("pedido_id", Number(fimNum));

    const { data, error } = await q;
    if (error) throw error;

    const batch = data || [];
    all = all.concat(batch);

    // paradas
    if (batch.length < pageSize) break; // acabou
    if (all.length >= maxRows) break; // trava de segurança

    from += pageSize;
  }

  return all;
}

async function carregarBaseAtiva() {
  const { data, error } = await supabase
    .from("consulta_base")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.warn("Erro ao carregar base:", error);
    return null;
  }
  return data?.[0] || null;
}

function copiarLista(rows) {
  const texto = (rows || [])
    .map(
      (r) =>
        `${r.pedido || r.pedido_id_text || r.pedido_id}\t${
          r.status_consulta || ""
        }`
    )
    .join("\n");

  navigator.clipboard
    .writeText(texto)
    .then(() => alert("✅ Lista copiada!"))
    .catch(() => alert("❌ Falha ao copiar."));
}

let cacheRows = [];

async function runBusca() {
  const btn = document.getElementById("btnBuscar");
  const hint = document.getElementById("hint");

  const pedidoIni = document.getElementById("pedidoIni")?.value || "";
  const pedidoFim = document.getElementById("pedidoFim")?.value || "";
  const dataIni = document.getElementById("dataIni")?.value || "";
  const dataFim = document.getElementById("dataFim")?.value || "";

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Buscando...`;
  hint.textContent = "Consultando Supabase...";

  try {
    cacheRows = await buscarNoSupabasePaginado(
      { pedidoIni, pedidoFim, dataIni, dataFim },
      { pageSize: 1000, maxRows: 20000 } // ajuste o maxRows
    );

    const filtrados = filtrarLocal(cacheRows);
    renderCardsResumo(filtrados);
    renderTabela(filtrados);

    hint.textContent = `Última atualização: ${new Date().toLocaleString(
      "pt-BR"
    )}`;
  } catch (e) {
    console.error(e);
    alert("❌ Erro ao buscar consulta. Veja o console.");
    hint.textContent = "Erro na consulta.";
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-search"></i> Buscar`;
  }
}

function aplicarFiltrosLocais() {
  const filtrados = filtrarLocal(cacheRows);
  renderCardsResumo(filtrados);
  renderTabela(filtrados);
}

function limparFiltros() {
  document.getElementById("filtroStatus").value = "";
  document.getElementById("filtroMetodo").value = "";
  document.getElementById("filtroCliente").value = "";
  aplicarFiltrosLocais();
}

function setDefaults() {
  const hoje = hojeISO();
  const di = document.getElementById("dataIni");
  const df = document.getElementById("dataFim");
  if (di && !di.value) di.value = hoje;
  if (df && !df.value) df.value = hoje;
}

function attachRowClick() {
  const modalEl = document.getElementById("modalDetalhe");
  if (!modalEl) return;
  const modal = new bootstrap.Modal(modalEl);

  document.getElementById("tbodyConsulta")?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-pedido]");
    if (!tr) return;
    const pedido = decodeURIComponent(tr.dataset.pedido || "");
    const row = cacheRows.find(
      (r) => (r.pedido || r.pedido_id_text || r.pedido_id) == pedido
    );
    if (!row) return;
    renderDetalhe(row);
    modal.show();
  });
}

function attach() {
  setDefaults();

  document.getElementById("btnBuscar")?.addEventListener("click", runBusca);
  document.getElementById("btnRecarregar")?.addEventListener("click", runBusca);

  document
    .getElementById("btnLimpar")
    ?.addEventListener("click", limparFiltros);

  document
    .getElementById("filtroStatus")
    ?.addEventListener("change", aplicarFiltrosLocais);
  document
    .getElementById("filtroMetodo")
    ?.addEventListener("input", aplicarFiltrosLocais);
  document
    .getElementById("filtroCliente")
    ?.addEventListener("input", aplicarFiltrosLocais);

  document.getElementById("btnCopiarLista")?.addEventListener("click", () => {
    const filtrados = filtrarLocal(cacheRows);
    copiarLista(filtrados);
  });

  // Enter dispara busca
  ["pedidoIni", "pedidoFim"].forEach((id) => {
    document.getElementById(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runBusca();
    });
  });

  attachRowClick();
}

attach();

(async function initBase() {
  const base = await carregarBaseAtiva();
  if (!base) return;

  document.getElementById("pedidoIni").value = base.pedido_ini ?? "";
  document.getElementById("pedidoFim").value = base.pedido_fim ?? "";
  document.getElementById("dataIni").value = base.data_ini ?? "";
  document.getElementById("dataFim").value = base.data_fim ?? "";

  const hint = document.getElementById("hint");
  if (hint) {
    hint.textContent = `Base ativa: ${base.label || "Sem label"} — Pedidos ${
      base.pedido_ini
    }→${base.pedido_fim} — ${base.data_ini}→${base.data_fim}`;
  }

  runBusca();
})();
