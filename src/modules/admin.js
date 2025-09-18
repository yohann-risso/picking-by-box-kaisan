import { supabase } from "../services/supabase.js";

// Carregar Chart.js dinamicamente
const chartScript = document.createElement("script");
chartScript.src = "https://cdn.jsdelivr.net/npm/chart.js";
document.head.appendChild(chartScript);

// Criar container do dashboard
const adminContainer = document.createElement("div");
adminContainer.classList.add("container-fluid", "py-4");
adminContainer.innerHTML = `
  <h2 class="mb-4">📊 Dashboard Administrativo</h2>

  <!-- Métricas principais -->
  <div class="row g-3 mb-4" id="metric-cards">
    <div class="col-md-3"><div class="card text-bg-primary shadow-sm h-100"><div class="card-body"><h6>Usuários Ativos</h6><h2 id="usuariosAtivosCount">0</h2></div></div></div>
    <div class="col-md-3"><div class="card text-bg-success shadow-sm h-100"><div class="card-body"><h6>Pedidos Hoje</h6><h2 id="pedidosHojeCount">0</h2></div></div></div>
    <div class="col-md-3"><div class="card text-bg-warning shadow-sm h-100"><div class="card-body"><h6>Peças do Dia</h6><h2 id="pecasHojeCount">0</h2></div></div></div>
    <div class="col-md-3"><div class="card text-bg-danger shadow-sm h-100"><div class="card-body"><h6>Romaneios Abertos</h6><h2 id="romaneiosAbertosCount">0</h2></div></div></div>
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

  <!-- Tabela de usuários ativos -->
  <div class="card shadow-sm">
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
`;
document.body.appendChild(adminContainer);

const usuariosAtivosCount = document.getElementById("usuariosAtivosCount");
const pedidosHojeCount = document.getElementById("pedidosHojeCount");
const pecasHojeCount = document.getElementById("pecasHojeCount");
const romaneiosAbertosCount = document.getElementById("romaneiosAbertosCount");
const usuariosAtivosTable = document.getElementById("usuariosAtivosTable");

let pedidosPorHoraChart, statusPedidosChart;

// ---- Funções de métricas ----
async function carregarMetricas() {
  const hoje = new Date().toISOString().slice(0, 10);

  const { count: usuarios } = await supabase
    .from("usuarios_ativos")
    .select("*", { count: "exact", head: true });
  usuariosAtivosCount.textContent = usuarios ?? 0;

  const { count: pedidos } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .gte("created_at", `${hoje}T00:00:00`);
  pedidosHojeCount.textContent = pedidos ?? 0;

  const { data: pecas } = await supabase
    .from("pesagem")
    .select("qtde_pecas")
    .gte("data", `${hoje}T00:00:00`);
  pecasHojeCount.textContent =
    pecas?.reduce((acc, p) => acc + p.qtde_pecas, 0) ?? 0;

  const { count: romaneios } = await supabase
    .from("romaneios")
    .select("*", { count: "exact", head: true })
    .is("ended_at", null);
  romaneiosAbertosCount.textContent = romaneios ?? 0;
}

async function carregarUsuarios() {
  const { data } = await supabase
    .from("usuarios_ativos")
    .select("nome, status, pedidos, pecas, duration_sec, updated_at");

  usuariosAtivosTable.innerHTML = "";
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
    usuariosAtivosTable.appendChild(tr);
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

  // Pedidos por hora
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
        datasets: [{ label: "Pedidos", data: valores, borderWidth: 2 }],
      },
    }
  );

  // Status dos pedidos
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
      data: { labels: statusLabels, datasets: [{ data: statusValores }] },
    }
  );
}

// ---- Realtime ----
supabase
  .channel("dashboard_admin")
  .on("postgres_changes", { event: "*", schema: "public" }, () => {
    carregarMetricas();
    carregarUsuarios();
    carregarGraficos();
  })
  .subscribe();

// Inicial
setTimeout(() => {
  carregarMetricas();
  carregarUsuarios();
  carregarGraficos();
}, 1000);
