import { supabase } from "../services/supabase.js";
import "../css/admin.css";

let chartPedidosHora, chartStatus, chartRanking;

function initAdmin() {
  const operador = localStorage.getItem("operador1");

  if (!operador || operador.toLowerCase() !== "yohann risso") {
    document.body.innerHTML = `
      <div class="d-flex vh-100 justify-content-center align-items-center">
        <div class="alert alert-danger text-center">
          ❌ Acesso restrito. Somente Yohann pode visualizar este painel.
        </div>
      </div>`;
    return;
  }

  carregarDashboard();
}

// ---- Helper de Loader ----
function setLoader(id, small = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = small
    ? `<div class="spinner-border spinner-border-sm text-light" role="status"></div>`
    : `<div class="spinner-border text-light" role="status"></div>`;
}

// ---- Helper Tempo ----
function formatarSegundos(segundos) {
  const h = String(Math.floor(segundos / 3600)).padStart(2, "0");
  const m = String(Math.floor((segundos % 3600) / 60)).padStart(2, "0");
  const s = String(segundos % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// ---- Dashboard ----
function carregarDashboard() {
  const root = document.getElementById("root");
  root.innerHTML = `
    <div class="container-fluid py-4">
      <h2 class="mb-4">🚛 Dashboard de Expedição</h2>

      <!-- Cards principais -->
      <div class="row g-3 mb-4" id="metricCards">
        <div class="col-md-2"><div class="card text-bg-primary shadow-sm"><div class="card-body"><h6>Usuários Ativos</h6><h2 id="usuariosAtivosCount">-</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-success shadow-sm"><div class="card-body"><h6>Pedidos Hoje</h6><h2 id="pedidosHojeCount">-</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-info shadow-sm"><div class="card-body"><h6>Pendentes</h6><h2 id="pedidosPendentesCount">-</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-warning shadow-sm"><div class="card-body"><h6>Peças do Dia</h6><h2 id="pecasHojeCount">-</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-danger shadow-sm"><div class="card-body"><h6>Romaneios Abertos</h6><h2 id="romaneiosAbertosCount">-</h2></div></div></div>
      </div>

      <!-- Cards avançados -->
      <div class="row g-3 mb-4">
        <div class="col-md-3"><div class="card text-bg-dark shadow-sm"><div class="card-body"><h6>Total Pendentes</h6><h4 id="totalPendentes">-</h4><small id="totalPendentesPecas">-</small></div></div></div>
        <div class="col-md-3"><div class="card text-bg-success shadow-sm"><div class="card-body"><h6>Pesados Hoje</h6><h4 id="totalPesadosHoje">-</h4><small id="totalPesadosHojePecas">-</small></div></div></div>
        <div class="col-md-2"><div class="card text-bg-primary shadow-sm"><div class="card-body"><h6>Meta Geral</h6><h4 id="metaGeral">-</h4></div></div></div>
        <div class="col-md-2"><div class="card text-bg-info shadow-sm"><div class="card-body"><h6>Meta 80%</h6><h4 id="meta80">-</h4></div></div></div>
        <div class="col-md-2"><div class="card text-bg-warning shadow-sm"><div class="card-body"><h6>% Meta Batida</h6><h4 id="percMeta">-</h4></div></div></div>
      </div>

      <!-- Gráficos -->
      <div class="row g-3 mb-4">
        <div class="col-md-6">
          <div class="card shadow-sm">
            <div class="card-header">📈 Pedidos por Hora</div>
            <div class="card-body"><canvas id="chartPedidosHora"></canvas></div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card shadow-sm">
            <div class="card-header">📊 Status dos Pedidos</div>
            <div class="card-body"><canvas id="chartStatus"></canvas></div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card shadow-sm">
            <div class="card-header">🏆 Ranking Operadores</div>
            <div class="card-body"><canvas id="chartRanking"></canvas></div>
          </div>
        </div>
      </div>

      <!-- Leaderboard -->
      <div class="card shadow-sm mb-4">
        <div class="card-header">Resumo de Operadores (Hoje)</div>
        <div class="table-responsive">
          <table class="table table-sm table-striped align-middle mb-0">
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
      <div class="card shadow-sm mb-4">
        <div class="card-header">Pedidos por Hora (Pivotado)</div>
        <div class="table-responsive">
          <table class="table table-sm table-striped mb-0">
            <thead class="table-light" id="pivotHeader"></thead>
            <tbody id="pivotBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Romaneios -->
      <div class="card shadow-sm">
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

  supabase
    .channel("dashboard_admin")
    .on("postgres_changes", { event: "*", schema: "public" }, () => {
      carregarMetricas();
      carregarResumoOperadores();
      carregarPivotHoras();
      carregarRomaneios();
      carregarMetricaExpedicao();
    })
    .subscribe();
}

// ---- Métricas principais ----
async function carregarMetricas() {
  // loaders
  setLoader("usuariosAtivosCount");
  setLoader("pedidosHojeCount");
  setLoader("pedidosPendentesCount");
  setLoader("pedidosPesadosCount");
  setLoader("pecasHojeCount");
  setLoader("romaneiosAbertosCount");

  const hoje = new Date().toISOString().slice(0, 10);

  const { count: usuarios } = await supabase
    .from("usuarios_ativos")
    .select("*", { count: "exact", head: true });
  document.getElementById("usuariosAtivosCount").textContent = usuarios ?? 0;

  const { count: pedidos } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .gte("data", hoje);
  document.getElementById("pedidosHojeCount").textContent = pedidos ?? 0;

  const { count: pendentes } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");
  document.getElementById("pedidosPendentesCount").textContent = pendentes ?? 0;

  const { count: pesados } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("status", "PESADO")
    .gte("data", hoje);
  document.getElementById("pedidosPesadosCount").textContent = pesados ?? 0;

  const { data: pecas } = await supabase
    .from("pesagens")
    .select("qtde_pecas")
    .gte("data", `${hoje}T00:00:00`);
  document.getElementById("pecasHojeCount").textContent =
    pecas?.reduce((acc, p) => acc + p.qtde_pecas, 0) ?? 0;

  const { count: romaneios } = await supabase
    .from("romaneios_em_uso")
    .select("*", { count: "exact", head: true });
  document.getElementById("romaneiosAbertosCount").textContent = romaneios ?? 0;
}

// ---- Métricas Expedição ----
async function carregarMetricaExpedicao() {
  // loaders
  setLoader("totalPendentes", true);
  setLoader("totalPendentesPecas", true);
  setLoader("totalPesadosHoje", true);
  setLoader("totalPesadosHojePecas", true);
  setLoader("metaGeral", true);
  setLoader("meta80", true);
  setLoader("percMeta", true);

  const hoje = new Date().toISOString().slice(0, 10);

  // Pendentes
  const { count: totalPendentes } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");

  const { data: pecasPendentes } = await supabase
    .from("produtos_pedido")
    .select("qtd")
    .in(
      "pedido_id",
      (
        await supabase.from("pedidos").select("id").eq("status", "pendente")
      ).data?.map((p) => p.id) ?? []
    );
  const totalPecasPendentes =
    pecasPendentes?.reduce((a, p) => a + (p.qtd || 0), 0) ?? 0;

  // Pesados hoje
  const { data: pesadosHoje, error: errPesados } = await supabase
    .from("pesagens")
    .select("pedido, qtde_pecas")
    .gte("data", `${hoje}T00:00:00`)
    .lte("data", `${hoje}T23:59:59`);

  if (errPesados) {
    console.error("Erro ao buscar pesagens:", errPesados);
  }

  const totalPesadosHoje = new Set(pesadosHoje?.map((p) => p.pedido)).size;
  const totalPecasPesadasHoje =
    pesadosHoje?.reduce((acc, p) => acc + (p.qtde_pecas || 0), 0) ?? 0;

  // Meta Geral via RPC
  const { data: metaGeral, error: errMeta } = await supabase.rpc(
    "contar_pedidos_nao_pesados"
  );
  if (errMeta) console.error("Erro RPC meta geral:", errMeta);

  const meta80 = Math.round((metaGeral ?? 0) * 0.8);
  const percMeta = metaGeral
    ? Math.round((totalPesadosHoje / metaGeral) * 100)
    : 0;

  // Atualiza cards
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
}

// ---- Resumo Operadores ----
async function carregarResumoOperadores() {
  // loader
  const tbody = document.getElementById("resumoOperadoresBody");
  tbody.innerHTML = `<tr><td colspan="5" class="text-center">
    <div class="spinner-border text-primary" role="status"></div>
  </td></tr>`;

  const { data, error } = await supabase
    .from("view_resumo_operadores_dia")
    .select("*");
  if (error) return console.error("Erro resumo:", error);

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
      <td>${row.operador}</td>
      <td>${row.pedidos_dia}</td>
      <td>${row.pecas_dia}</td>
      <td>${row.romaneios_dia}</td>
      <td>${formatarSegundos(row.media_seg_dia)}</td>
    `;
    tbody.appendChild(tr);
  });

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

// ---- Pivot ----
async function carregarPivotHoras() {
  const body = document.getElementById("pivotBody");
  body.innerHTML = `<tr><td colspan="99" class="text-center">
    <div class="spinner-border text-primary" role="status"></div>
  </td></tr>`;

  const { data, error } = await supabase
    .from("view_pedidos_por_hora")
    .select("*");
  if (error) return console.error("Erro pivot:", error);
  if (!data || !data.length) return;

  const header = document.getElementById("pivotHeader");
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

// ---- Romaneios ----
async function carregarRomaneios() {
  const tbody = document.getElementById("romaneiosEmUsoBody");
  tbody.innerHTML = `<tr><td colspan="4" class="text-center">
    <div class="spinner-border text-primary" role="status"></div>
  </td></tr>`;

  const { data, error } = await supabase
    .from("romaneios_em_uso")
    .select("romaneio, operador1, operador2, iniciado_em");
  if (error) return console.error("Erro romaneios:", error);

  tbody.innerHTML = "";
  data?.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.romaneio}</td>
      <td>${r.operador1}</td>
      <td>${r.operador2 ?? "-"}</td>
      <td>${new Date(r.iniciado_em).toLocaleTimeString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

initAdmin();
