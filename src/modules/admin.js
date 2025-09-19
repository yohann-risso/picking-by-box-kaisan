import { supabase } from "../services/supabase.js";
import "../css/admin.css";

let chartPedidosHora, chartRanking;
let autoRefresh;

// ===== Helpers =====
function setLoader(id, small = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = small
    ? `<div class="spinner-border spinner-border-sm text-light" role="status"></div>`
    : `<div class="spinner-border text-light" role="status"></div>`;
}

function formatarSegundos(segundos) {
  const h = String(Math.floor(segundos / 3600)).padStart(2, "0");
  const m = String(Math.floor((segundos % 3600) / 60)).padStart(2, "0");
  const s = String(segundos % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatarHoraSP(timestamp) {
  return new Date(timestamp).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function animarNumero(el, valorFinal) {
  const duracao = 1000;
  const frameRate = 20;
  const incremento = valorFinal / (duracao / frameRate);
  let valorAtual = 0;

  const intervalo = setInterval(() => {
    valorAtual += incremento;
    if (valorAtual >= valorFinal) {
      valorAtual = valorFinal;
      clearInterval(intervalo);
    }
    el.textContent = Math.floor(valorAtual).toLocaleString("pt-BR");
  }, frameRate);
}

// ===== Dashboard =====
function initAdmin() {
  const operador = localStorage.getItem("operador1");
  if (!operador || operador.toLowerCase() !== "yohann risso") {
    document.body.innerHTML = `
      <div class="d-flex vh-100 justify-content-center align-items-center bg-dark text-white">
        <div class="alert alert-danger text-center shadow-lg">
          ❌ Acesso restrito. Somente Yohann pode visualizar este painel.
        </div>
      </div>`;
    return;
  }

  carregarDashboard();
  // Atualização automática a cada 30s
  autoRefresh = setInterval(() => {
    carregarMetricas();
    carregarResumoOperadores();
    carregarPivotHoras();
    carregarRomaneios();
    carregarMetricaExpedicao();
  }, 30000);
}

function carregarDashboard() {
  const root = document.getElementById("root");
  root.innerHTML = `
    <div class="container-fluid py-4">
      <h2 class="mb-4 fw-bold"><i class="bi bi-truck"></i> Dashboard de Expedição</h2>

      <!-- Cards principais -->
      <div class="row g-3 mb-4 text-center">
        <div class="col-md-2"><div class="card bg-primary text-white shadow h-100"><div class="card-body"><h6>Usuários Ativos</h6><h2 id="usuariosAtivosCount">-</h2></div></div></div>
        <div class="col-md-2"><div class="card bg-success text-white shadow h-100"><div class="card-body"><h6>Pedidos Hoje</h6><h2 id="pedidosHojeCount">-</h2></div></div></div>
        <div class="col-md-2"><div class="card bg-info text-white shadow h-100"><div class="card-body"><h6>Pendentes</h6><h2 id="pedidosPendentesCount">-</h2></div></div></div>
        <div class="col-md-2"><div class="card bg-warning text-dark shadow h-100"><div class="card-body"><h6>Peças do Dia</h6><h2 id="pecasHojeCount">-</h2></div></div></div>
        <div class="col-md-2"><div class="card bg-danger text-white shadow h-100"><div class="card-body"><h6>Romaneios Abertos</h6><h2 id="romaneiosAbertosCount">-</h2></div></div></div>
      </div>

      <!-- Cards avançados -->
      <div class="row g-3 mb-4 text-center">
        <div class="col-md-3"><div class="card bg-dark text-white shadow h-100"><div class="card-body"><h6>Total Pendentes</h6><h4 id="totalPendentes">-</h4><small id="totalPendentesPecas">-</small></div></div></div>
        <div class="col-md-3"><div class="card bg-success text-white shadow h-100"><div class="card-body"><h6>Pesados Hoje</h6><h4 id="totalPesadosHoje">-</h4><small id="totalPesadosHojePecas">-</small></div></div></div>
        <div class="col-md-2"><div class="card bg-primary text-white shadow h-100"><div class="card-body"><h6>Meta Geral</h6><h4 id="metaGeral">-</h4></div></div></div>
        <div class="col-md-2"><div class="card bg-info text-white shadow h-100"><div class="card-body"><h6>Meta 80%</h6><h4 id="meta80">-</h4></div></div></div>
        <div class="col-md-2"><div class="card bg-warning text-dark shadow h-100"><div class="card-body"><h6>% Meta Batida</h6><div class="progress"><div id="percMetaBar" class="progress-bar bg-success" role="progressbar" style="width:0%"></div></div><h5 id="percMeta">-</h5></div></div></div>
      </div>

      <!-- Gráficos -->
      <div class="row g-3 mb-4">
        <div class="col-md-7">
          <div class="card shadow">
            <div class="card-header">📈 Pedidos por Hora</div>
            <div class="card-body"><canvas id="chartPedidosHora"></canvas></div>
          </div>
        </div>
        <div class="col-md-5">
          <div class="card shadow">
            <div class="card-header">🏆 Ranking Operadores</div>
            <div class="card-body"><canvas id="chartRanking"></canvas></div>
          </div>
        </div>
      </div>

      <!-- Leaderboard -->
      <div class="card shadow mb-4">
        <div class="card-header">Resumo de Operadores (Hoje)</div>
        <div class="table-responsive">
          <table class="table table-hover table-striped align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Operador</th>
                <th>Pedidos</th>
                <th>Peças</th>
                <th>Romaneios</th>
                <th>Média</th>
              </tr>
            </thead>
            <tbody id="resumoOperadoresBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Pivot -->
      <div class="card shadow mb-4">
        <div class="card-header">Pedidos por Hora (Pivotado)</div>
        <div class="table-responsive">
          <table class="table table-sm table-bordered mb-0">
            <thead class="table-light" id="pivotHeader"></thead>
            <tbody id="pivotBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Romaneios -->
      <div class="card shadow">
        <div class="card-header">Romaneios em Uso</div>
        <div class="table-responsive">
          <table class="table table-sm table-striped mb-0">
            <thead class="table-light">
              <tr>
                <th>Romaneio</th>
                <th>Operador 1</th>
                <th>Operador 2</th>
                <th>Início</th>
              </tr>
            </thead>
            <tbody id="romaneiosEmUsoBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  carregarMetricas();
  carregarResumoOperadores();
  carregarPivotHoras();
  carregarRomaneios();
  carregarMetricaExpedicao();
}

// ===== Métricas principais =====
async function carregarMetricas() {
  const hoje = new Date().toISOString().slice(0, 10);
  const { count: usuarios } = await supabase
    .from("usuarios_ativos")
    .select("*", { count: "exact", head: true });
  animarNumero(document.getElementById("usuariosAtivosCount"), usuarios ?? 0);

  const { count: pedidos } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .gte("data", hoje);
  animarNumero(document.getElementById("pedidosHojeCount"), pedidos ?? 0);

  const { count: pendentes } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");
  animarNumero(
    document.getElementById("pedidosPendentesCount"),
    pendentes ?? 0
  );

  const { data: pecas } = await supabase
    .from("pesagens")
    .select("qtde_pecas")
    .gte("data", `${hoje}T00:00:00`);
  animarNumero(
    document.getElementById("pecasHojeCount"),
    pecas?.reduce((a, p) => a + p.qtde_pecas, 0) ?? 0
  );

  const { count: romaneios } = await supabase
    .from("romaneios_em_uso")
    .select("*", { count: "exact", head: true });
  animarNumero(
    document.getElementById("romaneiosAbertosCount"),
    romaneios ?? 0
  );
}

// ===== Métricas Expedição =====
async function carregarMetricaExpedicao() {
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: pendentesData } = await supabase.rpc("contar_pecas_pendentes");
  const totalPendentes = pendentesData?.[0]?.total_pedidos ?? 0;
  const totalPecasPendentes = pendentesData?.[0]?.total_pecas ?? 0;

  const { data: pesadosHojeData } = await supabase.rpc(
    "contar_pedidos_pesados_hoje",
    { data_ref: hoje }
  );
  const totalPesadosHoje = pesadosHojeData?.[0]?.total_pedidos ?? 0;
  const totalPecasPesadasHoje = pesadosHojeData?.[0]?.total_pecas ?? 0;

  const { data: metaGeral } = await supabase.rpc("contar_pedidos_nao_pesados");
  const meta80 = Math.round((metaGeral ?? 0) * 0.8);
  const percMeta = meta80 ? Math.round((totalPesadosHoje / meta80) * 100) : 0;

  document.getElementById(
    "totalPendentes"
  ).textContent = `${totalPendentes} pedidos`;
  document.getElementById(
    "totalPendentesPecas"
  ).textContent = `${totalPecasPendentes} peças`;
  document.getElementById(
    "totalPesadosHoje"
  ).textContent = `${totalPesadosHoje} pedidos`;
  document.getElementById(
    "totalPesadosHojePecas"
  ).textContent = `${totalPecasPesadasHoje} peças`;
  document.getElementById("metaGeral").textContent = metaGeral ?? 0;
  document.getElementById("meta80").textContent = meta80;
  document.getElementById("percMeta").textContent = `${percMeta}%`;
  document.getElementById("percMetaBar").style.width = `${percMeta}%`;
}

// ===== Resumo Operadores =====
async function carregarResumoOperadores() {
  const tbody = document.getElementById("resumoOperadoresBody");
  const { data, error } = await supabase
    .from("view_resumo_operadores_dia")
    .select("*");

  if (error) {
    console.error("Erro resumo:", error);
    return;
  }

  tbody.innerHTML = "";
  const labels = [],
    pedidos = [],
    pecas = [];

  data.forEach((row) => {
    labels.push(row.operador);
    pedidos.push(row.pedidos_dia);
    pecas.push(row.pecas_dia);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${row.operador}</strong></td>
      <td class="text-end">${row.pedidos_dia}</td>
      <td class="text-end">${row.pecas_dia}</td>
      <td class="text-end">${row.romaneios_dia}</td>
      <td>
        <span class="badge-status ${
          row.media_seg_dia <= 300
            ? "success"
            : row.media_seg_dia <= 600
            ? "warning"
            : "danger"
        }">
          ${formatarSegundos(row.media_seg_dia)}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Gráfico Ranking
  if (chartRanking) chartRanking.destroy();
  chartRanking = new Chart(document.getElementById("chartRanking"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Pedidos", data: pedidos, backgroundColor: "#0d6efd" },
        { label: "Peças", data: pecas, backgroundColor: "#198754" },
      ],
    },
    options: { indexAxis: "y" },
  });
}

// ===== Pivot =====
async function carregarPivotHoras() {
  const { data } = await supabase.from("view_pedidos_por_hora").select("*");
  if (!data?.length) return;

  const header = document.getElementById("pivotHeader");
  const body = document.getElementById("pivotBody");
  const cols = Object.keys(data[0]);
  header.innerHTML =
    "<tr>" + cols.map((c) => `<th>${c.toUpperCase()}</th>`).join("") + "</tr>";
  body.innerHTML = "";

  data.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = cols.map((c) => `<td>${row[c] ?? 0}</td>`).join("");
    body.appendChild(tr);
  });

  const totalGeral = data.find((r) => r.operador === "TOTAL GERAL");
  if (totalGeral) {
    const horas = cols.filter((c) => c.includes("H"));
    const valores = horas.map((h) => totalGeral[h] ?? 0);
    if (chartPedidosHora) chartPedidosHora.destroy();
    chartPedidosHora = new Chart(document.getElementById("chartPedidosHora"), {
      type: "line",
      data: {
        labels: horas,
        datasets: [{ label: "Pedidos", data: valores, borderColor: "#0d6efd" }],
      },
    });
  }
}

// ===== Romaneios =====
async function carregarRomaneios() {
  const tbody = document.getElementById("romaneiosEmUsoBody");
  const { data, error } = await supabase
    .from("romaneios_em_uso")
    .select("romaneio, operador1, operador2, iniciado_em");

  if (error) {
    console.error("Erro romaneios:", error);
    return;
  }

  tbody.innerHTML = "";
  data?.forEach((r) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><strong>${r.romaneio}</strong></td>
      <td>${r.operador1}</td>
      <td>${r.operador2 ?? "-"}</td>
      <td>
        <span class="badge-status info">
          ${r.iniciado_em ? formatarHoraSP(r.iniciado_em) : "-"}
        </span>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

initAdmin();
