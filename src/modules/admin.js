import { supabase } from "../services/supabase.js";
import "../css/admin.css";

let pedidosPorHoraChart, statusPedidosChart;

function initAdmin() {
  const operador = localStorage.getItem("operador1");

  if (!operador) {
    document.body.innerHTML = `
      <div class="d-flex vh-100 justify-content-center align-items-center">
        <div class="alert alert-warning text-center">
          ⚠️ Você precisa logar pelo sistema principal antes de acessar o admin.
        </div>
      </div>`;
    return;
  }

  if (operador.toLowerCase() !== "yohann risso") {
    document.body.innerHTML = `
      <div class="d-flex vh-100 justify-content-center align-items-center">
        <div class="alert alert-danger text-center">
          ❌ Acesso negado. Somente Yohann pode acessar este painel.
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
      <h2 class="mb-4">📊 Dashboard Administrativo</h2>

      <!-- Métricas principais -->
      <div class="row g-3 mb-4">
        <div class="col-md-2"><div class="card text-bg-primary shadow-sm h-100"><div class="card-body"><h6>Usuários Ativos</h6><h2 id="usuariosAtivosCount">0</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-success shadow-sm h-100"><div class="card-body"><h6>Pedidos Hoje</h6><h2 id="pedidosHojeCount">0</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-info shadow-sm h-100"><div class="card-body"><h6>Pedidos Pendentes</h6><h2 id="pedidosPendentesCount">0</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-secondary shadow-sm h-100"><div class="card-body"><h6>Pedidos Pesados</h6><h2 id="pedidosPesadosCount">0</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-warning shadow-sm h-100"><div class="card-body"><h6>Peças do Dia</h6><h2 id="pecasHojeCount">0</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-danger shadow-sm h-100"><div class="card-body"><h6>Romaneios Abertos</h6><h2 id="romaneiosAbertosCount">0</h2></div></div></div>
      </div>

      <!-- Gráficos -->
      <div class="row g-3 mb-4">
        <div class="col-md-8">
          <div class="card shadow-sm">
            <div class="card-header">Pedidos por Hora</div>
            <div class="card-body"><canvas id="pedidosPorHoraChart"></canvas></div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card shadow-sm">
            <div class="card-header">Status dos Pedidos</div>
            <div class="card-body"><canvas id="statusPedidosChart"></canvas></div>
          </div>
        </div>
      </div>

      <!-- Tabela usuários -->
      <div class="card shadow-sm mb-4">
        <div class="card-header">Usuários Ativos</div>
        <div class="table-responsive">
          <table class="table table-sm table-striped align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Operador</th>
                <th>Status</th>
                <th>Pedidos Hoje</th>
                <th>Peças</th>
                <th>Duração Sessão</th>
                <th>Última Atividade</th>
              </tr>
            </thead>
            <tbody id="usuariosAtivosTable"></tbody>
          </table>
        </div>
      </div>

      <!-- Leaderboard -->
      <div class="card shadow-sm">
        <div class="card-header">Leaderboard de Operadores (Hoje)</div>
        <div class="table-responsive">
          <table class="table table-sm table-striped mb-0">
            <thead class="table-light">
              <tr>
                <th>Operador</th>
                <th>Pedidos</th>
                <th>Peças</th>
                <th>Primeiro Peso</th>
                <th>Último Peso</th>
              </tr>
            </thead>
            <tbody id="leaderboardTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  carregarMetricas();
  carregarUsuarios();
  carregarGraficos();
  carregarLeaderboard();

  supabase
    .channel("dashboard_admin")
    .on("postgres_changes", { event: "*", schema: "public" }, () => {
      carregarMetricas();
      carregarUsuarios();
      carregarGraficos();
      carregarLeaderboard();
    })
    .subscribe();
}

// ---- Métricas principais ----
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

// ---- Usuários ativos ----
async function carregarUsuarios() {
  const { data } = await supabase
    .from("usuarios_ativos")
    .select("nome, status, pedidos, pecas, duration_sec, updated_at");

  const tbody = document.getElementById("usuariosAtivosTable");
  tbody.innerHTML = "";
  data?.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.nome}</td>
      <td><span class="badge ${
        u.status === "online" ? "bg-success" : "bg-secondary"
      }">${u.status}</span></td>
      <td>${u.pedidos ?? 0}</td>
      <td>${u.pecas ?? 0}</td>
      <td>${formatarTempo(u.duration_sec ?? 0)}</td>
      <td>${new Date(u.updated_at).toLocaleTimeString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

function formatarTempo(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

// ---- Gráficos ----
async function carregarGraficos() {
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: pedidos } = await supabase.rpc("pedidos_por_hora", {
    data_ref: hoje,
  });
  const labels = pedidos?.map((p) => `${p.hora}h`) ?? [];
  const valores = pedidos?.map((p) => p.total) ?? [];

  if (pedidosPorHoraChart) pedidosPorHoraChart.destroy();
  pedidosPorHoraChart = new Chart(
    document.getElementById("pedidosPorHoraChart"),
    {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Pedidos",
            data: valores,
            borderWidth: 2,
            borderColor: "#0d6efd",
          },
        ],
      },
    }
  );

  const { data: status } = await supabase.rpc("status_pedidos_hoje", {
    data_ref: hoje,
  });
  const statusLabels = status?.map((s) => s.status) ?? [];
  const statusValores = status?.map((s) => s.total) ?? [];

  if (statusPedidosChart) statusPedidosChart.destroy();
  statusPedidosChart = new Chart(
    document.getElementById("statusPedidosChart"),
    {
      type: "pie",
      data: {
        labels: statusLabels,
        datasets: [
          {
            data: statusValores,
            backgroundColor: ["#0d6efd", "#198754", "#ffc107", "#dc3545"],
          },
        ],
      },
    }
  );
}

// ---- Leaderboard ----
async function carregarLeaderboard() {
  const { data, error } = await supabase
    .from("view_leaderboard_dia")
    .select("*");

  if (error) {
    console.error("Erro leaderboard:", error);
    return;
  }

  const tbody = document.getElementById("leaderboardTableBody");
  tbody.innerHTML = "";

  data.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.operador}</td>
      <td>${row.pedidos}</td>
      <td>${row.pecas}</td>
      <td>${
        row.primeiro ? new Date(row.primeiro).toLocaleTimeString() : "-"
      }</td>
      <td>${row.ultimo ? new Date(row.ultimo).toLocaleTimeString() : "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

initAdmin();
