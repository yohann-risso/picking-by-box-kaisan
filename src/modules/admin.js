import { supabase } from "../services/supabase.js";

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
      <!-- aqui entram os cards, gráficos e tabelas -->
      <div id="metricas"></div>
      <div id="graficos"></div>
      <div id="usuarios"></div>
    </div>
  `;

  const usuariosAtivosCount = document.getElementById("usuariosAtivosCount");
  const pedidosHojeCount = document.getElementById("pedidosHojeCount");
  const pecasHojeCount = document.getElementById("pecasHojeCount");
  const romaneiosAbertosCount = document.getElementById(
    "romaneiosAbertosCount"
  );
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
}

initAdmin();
