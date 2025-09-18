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

      <!-- Cards -->
      <div class="row g-3 mb-4" id="metricCards">
        <div class="col-md-2"><div class="card text-bg-primary shadow-sm h-100"><div class="card-body"><h6>Usuários Ativos</h6><h2 id="usuariosAtivosCount">0</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-success shadow-sm h-100"><div class="card-body"><h6>Pedidos Hoje</h6><h2 id="pedidosHojeCount">0</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-info shadow-sm h-100"><div class="card-body"><h6>Pendentes</h6><h2 id="pedidosPendentesCount">0</h2></div></div></div>
        <div class="col-md-2"><div class="card text-bg-secondary shadow-sm h-100"><div class="card-body"><h6>Pesados Hoje</h6><h2 id="pedidosPesadosCount">0</h2></div></div></div>
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

      <!-- Tabela de Pedidos por Hora -->
      <div class="card shadow-sm">
        <div class="card-header">Pedidos por Hora (Pivotado)</div>
        <div class="table-responsive">
          <table class="table table-sm table-striped mb-0">
            <thead class="table-light" id="pivotHeader"></thead>
            <tbody id="pivotBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  carregarMetricas();
  carregarResumoOperadores();
  carregarPivotHoras();

  supabase
    .channel("dashboard_admin")
    .on("postgres_changes", { event: "*", schema: "public" }, () => {
      carregarMetricas();
      carregarResumoOperadores();
      carregarPivotHoras();
    })
    .subscribe();
}

// ---- Métricas principais ----
async function carregarMetricas() {
  const hoje = new Date().toISOString().slice(0, 10);

  // Usuários ativos
  const { count: usuarios } = await supabase
    .from("usuarios_ativos")
    .select("*", { count: "exact", head: true });
  document.getElementById("usuariosAtivosCount").textContent = usuarios ?? 0;

  // Pedidos hoje
  const { count: pedidos } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .gte("data", hoje);
  document.getElementById("pedidosHojeCount").textContent = pedidos ?? 0;

  // Pendentes
  const { count: pendentes } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente")
    .gte("data", hoje);
  document.getElementById("pedidosPendentesCount").textContent = pendentes ?? 0;

  // Pesados
  const { count: pesados } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("status", "PESADO")
    .gte("data", hoje);
  document.getElementById("pedidosPesadosCount").textContent = pesados ?? 0;

  // Peças do dia
  const { data: pecas } = await supabase
    .from("pesagens")
    .select("qtde_pecas")
    .gte("data", `${hoje}T00:00:00`);
  document.getElementById("pecasHojeCount").textContent =
    pecas?.reduce((acc, p) => acc + p.qtde_pecas, 0) ?? 0;

  // Romaneios em uso
  const { count: romaneios } = await supabase
    .from("romaneios_em_uso")
    .select("*", { count: "exact", head: true });
  document.getElementById("romaneiosAbertosCount").textContent = romaneios ?? 0;
}

// ---- Resumo Operadores ----
async function carregarResumoOperadores() {
  const { data, error } = await supabase
    .from("view_resumo_operadores_dia")
    .select("*");
  if (error) {
    console.error("Erro view_resumo_operadores_dia:", error);
    return;
  }

  const tbody = document.getElementById("resumoOperadoresBody");
  tbody.innerHTML = "";

  data.forEach((row) => {
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
}

// ---- Pivot de pedidos por hora ----
async function carregarPivotHoras() {
  const { data, error } = await supabase
    .from("view_pedidos_por_hora")
    .select("*");
  if (error) {
    console.error("Erro view_pedidos_por_hora:", error);
    return;
  }

  const header = document.getElementById("pivotHeader");
  const body = document.getElementById("pivotBody");

  if (!data || data.length === 0) return;

  // monta header dinamicamente
  const cols = Object.keys(data[0]);
  header.innerHTML =
    "<tr>" + cols.map((c) => `<th>${c.toUpperCase()}</th>`).join("") + "</tr>";

  body.innerHTML = "";
  data.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = cols.map((c) => `<td>${row[c] ?? 0}</td>`).join("");
    body.appendChild(tr);
  });
}

initAdmin();
