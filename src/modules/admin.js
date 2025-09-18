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

function carregarDashboard() {
  const root = document.getElementById("root");
  root.innerHTML = `
    <div class="container-fluid py-4">
      <h2 class="mb-4">🚛 Painel Administrativo de Expedição</h2>

      <!-- Cards -->
      <div class="row g-3 mb-4" id="metricCards">
        <div class="col-md-2"><div class="card text-bg-primary shadow-sm"><div class="card-body"><h6>Usuários Ativos</h6><h2 id="usuariosAtivosCount">0</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-success shadow-sm"><div class="card-body"><h6>Pedidos Hoje</h6><h2 id="pedidosHojeCount">0</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-info shadow-sm"><div class="card-body"><h6>Pendentes</h6><h2 id="pedidosPendentesCount">0</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-secondary shadow-sm"><div class="card-body"><h6>Pesados Hoje</h6><h2 id="pedidosPesadosCount">0</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-warning shadow-sm"><div class="card-body"><h6>Peças do Dia</h6><h2 id="pecasHojeCount">0</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-danger shadow-sm"><div class="card-body"><h6>Romaneios Abertos</h6><h2 id="romaneiosAbertosCount">0</h2></div></div></div>
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
                <th>Média (seg)</th>
              </tr>
            </thead>
            <tbody id="resumoOperadoresBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Pedidos por Hora pivotado -->
      <div class="card shadow-sm mb-4">
        <div class="card-header">Pedidos por Hora (Pivotado)</div>
        <div class="table-responsive">
          <table class="table table-sm table-striped mb-0">
            <thead class="table-light" id="pivotHeader"></thead>
            <tbody id="pivotBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Romaneios em uso -->
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

  supabase
    .channel("dashboard_admin")
    .on("postgres_changes", { event: "*", schema: "public" }, () => {
      carregarMetricas();
      carregarResumoOperadores();
      carregarPivotHoras();
      carregarRomaneios();
    })
    .subscribe();
}

// ---- Métricas principais
async function carregarMetricas() {
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
    .eq("status", "pendente")
    .gte("data", hoje);
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

// ---- Resumo Operadores
async function carregarResumoOperadores() {
  const { data, error } = await supabase
    .from("view_resumo_operadores_dia")
    .select("*");
  if (error) return console.error("Erro resumo:", error);

  const tbody = document.getElementById("resumoOperadoresBody");
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
      <td>${row.media_seg_dia}</td>
    `;
    tbody.appendChild(tr);
  });

  // Ranking operadores (bar chart)
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

// ---- Pivot pedidos por hora
async function carregarPivotHoras() {
  const { data, error } = await supabase
    .from("view_pedidos_por_hora")
    .select("*");
  if (error) return console.error("Erro pivot:", error);
  if (!data || !data.length) return;

  // Atualiza tabela
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

  // Gráfico pedidos por hora (linha)
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

// ---- Romaneios em uso
async function carregarRomaneios() {
  const { data, error } = await supabase
    .from("romaneios_em_uso")
    .select("romaneio, operador1, operador2, iniciado_em");
  if (error) return console.error("Erro romaneios:", error);

  const tbody = document.getElementById("romaneiosEmUsoBody");
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

// ---- Status pedidos (pizza)
async function carregarStatus() {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("pedidos")
    .select("status")
    .gte("data", hoje);
  if (error) return console.error("Erro status:", error);

  const contagem = {};
  data.forEach((p) => {
    contagem[p.status] = (contagem[p.status] || 0) + 1;
  });

  const labels = Object.keys(contagem);
  const valores = Object.values(contagem);

  if (chartStatus) chartStatus.destroy();
  chartStatus = new Chart(document.getElementById("chartStatus"), {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: valores,
          backgroundColor: ["#0d6efd", "#198754", "#ffc107", "#dc3545"],
        },
      ],
    },
  });
}

initAdmin();
setInterval(carregarStatus, 60000); // atualiza status a cada minuto
