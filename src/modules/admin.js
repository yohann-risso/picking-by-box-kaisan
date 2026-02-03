import {
  supabase,
  supabaseKey,
  supabaseFunctionsUrl,
} from "../services/supabase.js";
import "../css/admin.css";
async function ensureChart() {
  if (!window.Chart) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
}

function formatarDataISO(dateStr) {
  if (!dateStr) return "-";
  // força tratar como ISO string pura
  const d = new Date(dateStr);
  // monta manualmente sem aplicar timezone local
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(
    d.getUTCMonth() + 1,
  ).padStart(2, "0")}/${d.getUTCFullYear()}`;
}
// === Admin module gate: only run when the admin page is active ===
const __ADMIN_MOUNTS__ = ["#accordionAdmin", "#adminApp", "#dashboardAdmin"];
const __ADMIN_ACTIVE__ = __ADMIN_MOUNTS__.some((sel) =>
  document.querySelector(sel),
);
if (!__ADMIN_ACTIVE__) {
  console.info("[admin] page not active — skipping bootstrap.");
} else {
  let chartPedidosHora, chartRanking, chartMotivosErro;
  let chartMwAlertas, chartMwTopTempos;
  let autoRefresh;

  // ===== Helpers =====
  function formatarSegundos(segundos) {
    const h = String(Math.floor(segundos / 3600)).padStart(2, "0");
    const m = String(Math.floor((segundos % 3600) / 60)).padStart(2, "0");
    const s = String(segundos % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  function badgeSLA(status) {
    if (status === "ESTOUROU")
      return `<span class="badge bg-danger">ESTOUROU</span>`;
    if (status === "EM_RISCO")
      return `<span class="badge bg-warning text-dark">EM RISCO</span>`;
    return `<span class="badge bg-success">OK</span>`;
  }

  function badgeEtapa(etapa) {
    const map = {
      PICKING: "bg-primary",
      AGUARDANDO_BIPAGEM: "bg-secondary",
      BIPAGEM: "bg-info text-dark",
      PACKING: "bg-warning text-dark",
      PESADO: "bg-success",
    };
    const cls = map[etapa] || "bg-secondary";
    return `<span class="badge ${cls}">${etapa || "-"}</span>`;
  }

  function fmtPct(n) {
    if (n == null) return "-";
    return `${Number(n).toFixed(1)}%`;
  }

  function formatarParaBR(isoDate) {
    if (!isoDate) return null;
    const [ano, mes, dia] = isoDate.split("-");
    return `${dia}/${mes}/${ano}`; // dd/mm/yyyy
  }

  function formatarHoraSP(timestamp) {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function animarNumero(el, valorFinal) {
    if (!el) return;
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

  // ===== MINI WMS =====
  async function carregarMiniWMSExpedicao() {
    try {
      const hojeSP = new Date().toLocaleDateString("sv-SE", {
        timeZone: "America/Sao_Paulo",
      });

      const { data, error } = await supabase.rpc("rpc_dashboard_expedicao_v3", {
        p_dia: hojeSP,
      });

      if (error) throw error;
      if (!data) return;

      // --- Cards SLA config ---
      const cfg = data.sla_config || {};
      const slaTotal = cfg.sla_total_expedicao_max ?? null;
      const alertaPerc = cfg.sla_alerta_perc ?? null;

      document.getElementById("mw_slaTotal").textContent =
        slaTotal != null ? formatarSegundos(slaTotal) : "-";
      document.getElementById("mw_slaAlerta").textContent =
        alertaPerc != null ? `Alerta: ${alertaPerc}%` : "Alerta: -%";

      // --- WIP grupos ---
      const wip = Array.isArray(data.wip_grupos) ? data.wip_grupos : [];
      document.getElementById("mw_wipGruposCount").textContent = wip.length;

      const wipBody = document.getElementById("mw_wipBody");
      if (wipBody) {
        wipBody.innerHTML = "";
        if (!wip.length) {
          wipBody.innerHTML = `<tr><td colspan="7" class="text-muted">Sem grupos em WIP</td></tr>`;
        } else {
          wip.forEach((g) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
            <td><strong>${g.grupo ?? "-"}</strong></td>
            <td>${g.bloco ?? "-"}</td>
            <td>${g.operador ?? "-"}</td>
            <td><span class="badge bg-dark">${g.wip_hhmmss ?? formatarSegundos(g.wip_segundos ?? 0)}</span></td>
            <td class="text-end">${(g.pedidos_com_retirada ?? 0).toLocaleString("pt-BR")}</td>
            <td class="text-end">${(g.romaneios_com_retirada ?? 0).toLocaleString("pt-BR")}</td>
            <td>${formatarHoraSP(g.ultima_retirada_ts)}</td>
          `;
            wipBody.appendChild(tr);
          });
        }
      }

      // --- Alertas SLA ---
      const alertas = Array.isArray(data.alertas_sla) ? data.alertas_sla : [];

      let ok = 0,
        risco = 0,
        estourou = 0;

      alertas.forEach((a) => {
        if (a.status_sla === "ESTOUROU") estourou++;
        else if (a.status_sla === "EM_RISCO") risco++;
        else ok++;
      });

      document.getElementById("mw_okCount").textContent = ok;
      document.getElementById("mw_riscoCount").textContent = risco;
      document.getElementById("mw_estourouCount").textContent = estourou;

      const alertasBody = document.getElementById("mw_alertasBody");
      if (alertasBody) {
        alertasBody.innerHTML = "";
        if (!alertas.length) {
          alertasBody.innerHTML = `<tr><td colspan="8" class="text-muted">Sem alertas (todos pesados / sem picking aberto)</td></tr>`;
        } else {
          alertas.forEach((a) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
            <td>${badgeSLA(a.status_sla)}</td>
            <td>${badgeEtapa(a.etapa_atual)}</td>
            <td><strong>${a.pedido ?? "-"}</strong></td>
            <td>${a.romaneio ?? "-"}</td>
            <td>${a.grupo ?? "-"}</td>
            <td><span class="badge bg-dark">${a.tempo_aberto_hhmmss ?? "-"}</span></td>
            <td>${fmtPct(a.perc_sla_total)}</td>
            <td>${formatarHoraSP(a.picking_inicio_ts)}</td>
          `;
            alertasBody.appendChild(tr);
          });
        }
      }

      // --- Pesados no dia ---
      const pesados = Array.isArray(data.pedidos_pesados_dia)
        ? data.pedidos_pesados_dia
        : [];

      const pesadosBody = document.getElementById("mw_pesadosBody");
      if (pesadosBody) {
        pesadosBody.innerHTML = "";
        if (!pesados.length) {
          pesadosBody.innerHTML = `<tr><td colspan="8" class="text-muted">Nenhum pedido pesado hoje</td></tr>`;
        } else {
          pesados.forEach((p) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
            <td><strong>${p.pedido ?? "-"}</strong></td>
            <td>${p.romaneio ?? "-"}</td>
            <td>${p.grupo ?? "-"}</td>
            <td class="text-end">${p.tempo_picking_seg ?? "-"}</td>
            <td class="text-end">${p.tempo_bipagem_seg ?? "-"}</td>
            <td class="text-end">${p.tempo_packing_seg ?? "-"}</td>
            <td class="text-end"><span class="badge bg-dark">${p.tempo_total_expedicao_seg ?? "-"}</span></td>
            <td>${formatarHoraSP(p.pesagem_ts)}</td>
          `;
            pesadosBody.appendChild(tr);
          });
        }
      }

      // --- Chart: Alertas (doughnut) ---
      if (chartMwAlertas) chartMwAlertas.destroy();
      chartMwAlertas = new Chart(document.getElementById("mw_chartAlertas"), {
        type: "doughnut",
        data: {
          labels: ["OK", "EM_RISCO", "ESTOUROU"],
          datasets: [{ data: [ok, risco, estourou] }],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: "bottom" } },
        },
      });

      // --- Chart: Top 10 maiores tempos (bar stacked simples por etapa) ---
      const top = [...pesados]
        .filter((x) => Number.isFinite(x.tempo_total_expedicao_seg))
        .sort(
          (a, b) =>
            (b.tempo_total_expedicao_seg ?? 0) -
            (a.tempo_total_expedicao_seg ?? 0),
        )
        .slice(0, 10);

      const labels = top.map((x) => x.pedido);
      const pickSeg = top.map((x) => x.tempo_picking_seg ?? 0);
      const bipSeg = top.map((x) => x.tempo_bipagem_seg ?? 0);
      const packSeg = top.map((x) => x.tempo_packing_seg ?? 0);

      if (chartMwTopTempos) chartMwTopTempos.destroy();
      chartMwTopTempos = new Chart(
        document.getElementById("mw_chartTopTempos"),
        {
          type: "bar",
          data: {
            labels,
            datasets: [
              { label: "Retirada (seg)", data: pickSeg },
              { label: "Picking by Box (seg)", data: bipSeg },
              { label: "Packing (seg)", data: packSeg },
            ],
          },
          options: {
            responsive: true,
            plugins: { legend: { position: "bottom" } },
            scales: {
              x: { stacked: true },
              y: { stacked: true, beginAtZero: true },
            },
          },
        },
      );

      // --- Last update ---
      const last = new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      });
      const lastEl = document.getElementById("mw_lastUpdate");
      if (lastEl) lastEl.textContent = `Atualizado: ${last}`;
    } catch (err) {
      console.error("Erro MiniWMS:", err);
    }
  }

  // ===== Métricas principais =====
  async function carregarMetricas() {
    const hoje = new Date().toISOString().slice(0, 10);

    const { count: usuarios } = await supabase
      .from("operadores_em_uso")
      .select("operador", { count: "exact", head: true, distinct: true });

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
      pendentes ?? 0,
    );

    const { data: pecas } = await supabase
      .from("pesagens")
      .select("qtde_pecas")
      .gte("data", `${hoje}T00:00:00`);
    animarNumero(
      document.getElementById("pecasHojeCount"),
      pecas?.reduce((a, p) => a + p.qtde_pecas, 0) ?? 0,
    );

    const { count: romaneios } = await supabase
      .from("romaneios_em_uso")
      .select("*", { count: "exact", head: true });
    animarNumero(
      document.getElementById("romaneiosAbertosCount"),
      romaneios ?? 0,
    );
  }

  // ===== Métricas Expedição =====
  async function carregarMetricaExpedicao() {
    const hoje = new Date().toISOString().slice(0, 10);

    const { data: pendentesData } = await supabase.rpc(
      "contar_pecas_pendentes",
    );
    const totalPendentes = pendentesData?.[0]?.total_pedidos ?? 0;
    const totalPecasPendentes = pendentesData?.[0]?.total_pecas ?? 0;

    const { data: pesadosHojeData } = await supabase.rpc(
      "contar_pedidos_pesados_hoje",
      { data: hoje },
    );
    const totalPesadosHoje = pesadosHojeData?.[0]?.total_pedidos ?? 0;
    const totalPecasPesadasHoje = pesadosHojeData?.[0]?.total_pecas ?? 0;

    const { data: metaGeral } = await supabase.rpc(
      "contar_pedidos_nao_pesados",
    );
    const meta80 = Math.round((metaGeral ?? 0) * 0.8);
    const percMeta = metaGeral
      ? Math.round((totalPesadosHoje / metaGeral) * 100)
      : 0;

    document.getElementById("totalPendentes").textContent =
      `${totalPendentes} pedidos`;
    document.getElementById("totalPendentesPecas").textContent =
      `${totalPecasPendentes} peças`;
    document.getElementById("totalPesadosHoje").textContent =
      `${totalPesadosHoje} pedidos`;
    document.getElementById("totalPesadosHojePecas").textContent =
      `${totalPecasPesadasHoje} peças`;
    document.getElementById("metaGeral").textContent = metaGeral ?? 0;
    document.getElementById("meta80").textContent = meta80;
    document.getElementById("percMeta").textContent = `${percMeta}%`;
    document.getElementById("percMetaBar").style.width = `${percMeta}%`;
  }

  // ===== Resumo Operadores =====
  async function carregarResumoOperadores() {
    const tbody = document.getElementById("resumoOperadoresBody");
    const { data, error } = await supabase
      .from("view_leaderboard_dia")
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
  async function carregarPivotHoras(inicio = null, fim = null) {
    let query = supabase.from("view_pedidos_por_hora").select("*");

    // 🧩 Filtro único ou intervalo
    if (inicio && fim && inicio !== fim) {
      query = query.gte("data", inicio).lte("data", fim);
    } else if (inicio) {
      query = query.eq("data", inicio);
    }

    const { data, error } = await query;
    const header = document.getElementById("pivotHeader");
    const body = document.getElementById("pivotBody");
    const titulo = document.getElementById("pivotTitulo");
    const subtitulo = document.getElementById("pivotSubtitulo");

    if (error) {
      console.error("Erro ao carregar pivot:", error);
      titulo.textContent = "Erro ao carregar dados";
      subtitulo.textContent = "";
      return;
    }

    if (!data?.length) {
      header.innerHTML = "";
      body.innerHTML = `<tr><td colspan="99">Nenhum dado encontrado</td></tr>`;
      titulo.textContent = "Nenhum resultado encontrado";
      subtitulo.textContent = "";
      return;
    }

    // 🧮 Consolidar TOTAL GERAL (somatório de todo o período)
    const totaisGerais = data.filter((r) => r.operador === "TOTAL GERAL");
    if (totaisGerais.length > 1) {
      const colsHoras = Object.keys(totaisGerais[0]).filter(
        (c) => c.includes("H") || c === "total",
      );

      const consolidado = { operador: "TOTAL GERAL (Período)" };
      colsHoras.forEach((col) => (consolidado[col] = 0));

      totaisGerais.forEach((row) => {
        colsHoras.forEach((col) => {
          consolidado[col] += row[col] || 0;
        });
      });

      // Remove os TOTAL GERAL diários e adiciona o consolidado no fim
      const dataFiltrada = data.filter((r) => r.operador !== "TOTAL GERAL");
      dataFiltrada.push(consolidado);
      data.length = 0;
      data.push(...dataFiltrada);
    }

    // 🧠 Atualiza título e subtítulo dinâmico
    if (inicio && fim && inicio !== fim) {
      titulo.textContent = `Pedidos por Hora – ${formatarDataBR(
        inicio,
      )} a ${formatarDataBR(fim)} (Consolidado)`;
      subtitulo.textContent = `Exibindo resultados consolidados entre ${formatarDataBR(
        inicio,
      )} e ${formatarDataBR(fim)}.`;
    } else if (inicio) {
      titulo.textContent = `Pedidos por Hora – ${formatarDataBR(inicio)}`;
      subtitulo.textContent = `Exibindo resultados de ${formatarDataBR(
        inicio,
      )}.`;
    } else {
      titulo.textContent = "Pedidos por Hora – Todos os dias";
      subtitulo.textContent = "Exibindo todos os registros disponíveis.";
    }

    // 🧹 Remove colunas internas
    const cols = Object.keys(data[0]).filter(
      (c) => c !== "data" && c !== "ordem",
    );

    // 🧩 Cabeçalho
    header.innerHTML =
      "<tr>" +
      cols.map((c) => `<th>${c.toUpperCase()}</th>`).join("") +
      "</tr>";

    // 🧩 Corpo da tabela
    body.innerHTML = "";
    data.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = cols
        .map((c) => {
          const val = row[c];
          const isTotal = row.operador === "TOTAL GERAL";
          const isPeriodo = row.operador === "TOTAL GERAL (Período)";
          return `<td class="${typeof val === "number" ? "text-end" : ""} ${
            isPeriodo
              ? "fw-bold bg-primary text-white"
              : isTotal
                ? "fw-bold bg-light text-dark"
                : ""
          }">${val ?? 0}</td>`;
        })
        .join("");
      body.appendChild(tr);
    });

    // 🧩 Gráfico de TOTAL GERAL (prioriza o consolidado do período)
    const totalGeral =
      data.find((r) => r.operador === "TOTAL GERAL (Período)") ||
      data.find((r) => r.operador === "TOTAL GERAL");

    if (totalGeral) {
      const horas = cols.filter((c) => c.includes("H"));
      const valores = horas.map((h) => totalGeral[h] ?? 0);

      if (chartPedidosHora) chartPedidosHora.destroy();
      chartPedidosHora = new Chart(
        document.getElementById("chartPedidosHora"),
        {
          type: "line",
          data: {
            labels: horas,
            datasets: [
              {
                label: "Pedidos",
                data: valores,
                borderColor: "#0d6efd",
                backgroundColor: "rgba(13,110,253,0.2)",
                tension: 0.3,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } },
          },
        },
      );
    }
  }

  // 🗓️ Helper: converte YYYY-MM-DD → DD/MM/YYYY
  function formatarDataBR(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  }

  // 🎯 Botão “Filtrar”
  document.getElementById("btnFiltrarPeriodo").addEventListener("click", () => {
    const inicio = document.getElementById("pivotDataInicio").value;
    const fim = document.getElementById("pivotDataFim").value;
    carregarPivotHoras(inicio, fim);
  });

  document.getElementById("pivotData")?.addEventListener("change", (e) => {
    const dataSelecionada = e.target.value; // AAAA-MM-DD
    carregarPivotHoras(dataSelecionada);
  });

  document.getElementById("btnPrintPivot")?.addEventListener("click", () => {
    const dataSelecionada = document.getElementById("pivotData").value || "";
    const tabela = document.querySelector("#collapsePivot table");

    if (!tabela) {
      alert("Nenhum dado de pivot encontrado para imprimir.");
      return;
    }

    const html = `
    <html>
      <head>
        <title>Pivot - Pedidos por Hora</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          h2 { margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: center; }
          th { background-color: #f0f0f0; }
        </style>
      </head>
      <body>
        <h2>Pivot - Pedidos por Hora</h2>
        <div><strong>Data:</strong> ${dataSelecionada || "Hoje"}</div>
        ${tabela.outerHTML}
        <script>window.onload = () => { window.print(); window.close(); }</script>
      </body>
    </html>
  `;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
  });

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
      <td><span class="badge-status info">${formatarHoraSP(
        r.iniciado_em,
      )}</span></td>
    `;
      tbody.appendChild(tr);
    });
  }

  // ===== Relatório de Erros =====
  async function carregarRelatorioErros() {
    const hoje = new Date();
    const mes = hoje.getMonth() + 1;
    const ano = hoje.getFullYear();

    const ultimoDia = new Date(ano, mes, 0).getDate();
    const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const fim = `${ano}-${String(mes).padStart(2, "0")}-${ultimoDia}`;

    // ====== Erros de expedição ======
    const { data: erros, error: errErros } = await supabase
      .from("expedicao_erros")
      .select("operador, motivo, data")
      .gte("data", inicio)
      .lte("data", fim);

    if (errErros) {
      console.error("Erro ao carregar erros:", errErros);
      return;
    }

    const totalErros = erros.length ?? 0;

    // ====== Total de pedidos no mês (pedidos_por_romaneio) ======
    const { count: totalPedidosMes, error: errPedidos } = await supabase
      .from("pedidos_por_romaneio")
      .select("id", { count: "exact", head: true })
      .gte("data", inicio)
      .lte("data", fim);

    if (errPedidos) {
      console.error("Erro ao carregar pedidos do mês:", errPedidos);
    }

    // ====== Calcula % ======
    const percErros = totalPedidosMes
      ? ((totalErros / totalPedidosMes) * 100).toFixed(2)
      : 0;

    // Atualiza card principal
    document.getElementById("totalErrosMes").innerHTML = `
    ${totalErros}<br><small class="text-light">${percErros}% dos pedidos</small>
  `;

    // ===== Leaderboard por operador =====
    const porOperador = {};
    erros.forEach((e) => {
      porOperador[e.operador] = (porOperador[e.operador] || 0) + 1;
    });

    const tbody = document.getElementById("errosLeaderboardBody");
    tbody.innerHTML = "";
    Object.entries(porOperador)
      .sort((a, b) => b[1] - a[1])
      .forEach(([operador, qtd]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
        <td><strong>${operador}</strong></td>
        <td class="text-end"><span class="badge-status danger">${qtd}</span></td>
      `;
        tbody.appendChild(tr);
      });

    // ===== Gráfico pizza por motivo =====
    const motivos = {};
    erros.forEach((e) => {
      motivos[e.motivo] = (motivos[e.motivo] || 0) + 1;
    });

    const labels = Object.keys(motivos);
    const valores = Object.values(motivos);

    if (window.Chart && chartMotivosErro instanceof window.Chart) {
      chartMotivosErro.destroy();
    }
    chartMotivosErro = new Chart(document.getElementById("chartMotivosErro"), {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            data: valores,
            backgroundColor: [
              "#dc3545",
              "#ffc107",
              "#0d6efd",
              "#20c997",
              "#6c757d",
            ],
          },
        ],
      },
      options: { plugins: { legend: { position: "bottom" } } },
    });
  }

  // ===== Salvar Erro =====
  document.addEventListener("click", async (e) => {
    if (e.target && e.target.id === "btnSalvarErro") {
      const payload = {
        data: document.getElementById("erroData").value,
        pedido: document.getElementById("erroPedido").value.trim(),
        romaneio: document.getElementById("erroRomaneio").value.trim(),
        operador: document.getElementById("erroOperador").value.trim(),
        motivo: document.getElementById("erroMotivo").value,
        observacoes: document.getElementById("erroObs").value.trim(),
      };

      const { error } = await supabase
        .from("expedicao_erros")
        .insert([payload]);
      if (error) {
        alert("❌ Erro ao salvar: " + error.message);
      } else {
        alert("✅ Erro registrado com sucesso!");
        document.getElementById("formErroExpedicao").reset();
        bootstrap.Modal.getInstance(
          document.getElementById("erroModal"),
        ).hide();
        carregarRelatorioErros();
      }
    }
  });

  // ===== Init =====
  async function initAdmin() {
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

    await ensureChart();
    carregarMetricas();
    carregarResumoOperadores();
    carregarRomaneios();
    carregarMetricaExpedicao();
    carregarRelatorioErros();
    carregarOperadoresDropdown();
    carregarSLAs();
    bindPeriodoSLA();
    await carregarSLAResumoEAnalisePorPeriodo("mes");
    carregarTempoMedioExpedicao();
    carregarMiniWMSExpedicao();

    // 👉 setar data de hoje (fuso SP) no input e carregar pivot só uma vez
    const hojeSP = new Date().toLocaleDateString("sv-SE", {
      timeZone: "America/Sao_Paulo",
    });
    const pivotInput = document.getElementById("pivotData");
    if (pivotInput) {
      pivotInput.value = hojeSP; // formato YYYY-MM-DD
      carregarPivotHoras(hojeSP);
    }

    autoRefresh = setInterval(() => {
      carregarMetricas();
      carregarResumoOperadores();
      carregarRomaneios();
      carregarMetricaExpedicao();
      carregarRelatorioErros();
      const tipo = document.getElementById("slaPeriodo")?.value || "mes";
      carregarSLAResumoEAnalisePorPeriodo(tipo);
      carregarTempoMedioExpedicao();
      carregarMiniWMSExpedicao();
    }, 30000);
  }

  async function carregarOperadoresDropdown() {
    const { data, error } = await supabase.rpc("listar_operadores_pesagens"); // chama a função

    if (error) {
      console.error("Erro ao carregar operadores:", error);
      return;
    }

    const select = document.getElementById("erroOperador");
    select.innerHTML = `<option value="">Selecione...</option>`;

    data?.forEach(({ operador }) => {
      const opt = document.createElement("option");
      opt.value = operador;
      opt.textContent = operador;
      select.appendChild(opt);
    });
  }

  initAdmin();
}

let pagina = 1;
const pageSize = 20;

async function carregarSLAs(filtro = "") {
  const offset = (pagina - 1) * pageSize;
  let query = supabase
    .from("slas_transportadora")
    .select("*")
    .order("criado_em", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (filtro && filtro !== "fluxo") {
    query = query.eq("status_codigo", filtro);
  } else if (filtro === "fluxo") {
    query = query.not("status_codigo", "in", "('BDE','EX','LDI','LDE')");
  }

  const { data, error } = await query;
  if (error) return console.error(error);

  const tbody = document.getElementById("slaList");
  tbody.innerHTML = "";

  data.forEach((sla) => {
    const eventos = sla.historico || [];

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${sla.pedido_id || "-"}</strong></td>
      <td>${sla.codigo_rastreio}</td>
      <td>${badgeStatusByCodigo(eventos)}</td>
      <td>${formatarDataISO(sla.data_coleta)}</td>
      <td>${
        sla.atualizado_em
          ? new Date(sla.atualizado_em).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })
          : "-"
      }</td>
      <td>
        <button class="btn btn-sm btn-outline-secondary" onclick="atualizarRastro('${
          sla.codigo_rastreio
        }')">
          Atualizar
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Atualiza paginação
  document.getElementById("paginaAtual").textContent = `Página ${pagina}`;

  // 🚀 Atualiza cards pelo RPC
  //carregarMetricasSLA();
}

function badgeStatusByCodigo(eventos) {
  if (!eventos || eventos.length === 0) {
    return '<span class="badge bg-secondary">-</span>';
  }

  const ultimo = eventos[0];
  const codigo = ultimo.codigo;
  const tipo = ultimo.tipo;

  // 🔑 Classificação oficial Correios
  if (codigo === "FC" && tipo === "82")
    return `<span class="badge bg-secondary">Etiqueta emitida</span>`;
  if (codigo === "CO") return `<span class="badge bg-dark">Coletado</span>`;
  if (codigo === "PO") return `<span class="badge bg-primary">Postado</span>`;
  if (["RO", "DO", "TR", "PAR"].includes(codigo))
    return `<span class="badge bg-info text-dark">Em trânsito</span>`;
  if (codigo === "OEC")
    return `<span class="badge bg-warning text-dark">Saiu p/ entrega</span>`;
  if (codigo === "BDE" && tipo === "01")
    return `<span class="badge bg-success">Entregue</span>`;
  if (codigo === "EX") return `<span class="badge bg-danger">Extraviado</span>`;
  if (codigo === "LDI")
    return `<span class="badge bg-dark">Aguardando retirada</span>`;
  if (codigo === "LDE")
    return `<span class="badge bg-secondary">Devolvido</span>`;

  // fallback genérico
  return `<span class="badge bg-light text-dark">${
    ultimo.descricao || codigo
  }</span>`;
}

// Paginação
document.getElementById("prevPage")?.addEventListener("click", () => {
  if (pagina > 1) {
    pagina--;
    carregarSLAs(document.getElementById("filtroStatus").value);
  }
});
document.getElementById("nextPage")?.addEventListener("click", () => {
  pagina++;
  carregarSLAs(document.getElementById("filtroStatus").value);
});

// Filtro
document.getElementById("filtroStatus")?.addEventListener("change", (e) => {
  pagina = 1;
  carregarSLAs(e.target.value);
});

function filtrarSLA(tipo) {
  pagina = 1;
  carregarSLAs(tipo);
}

// ===== Atualizar TODOS (em lotes) =====
async function atualizarTodosSLAs() {
  const codigos = await buscarTodosCodigos();
  if (!codigos.length) {
    alert("Nenhum SLA encontrado para atualizar.");
    return;
  }
  console.log(`🔄 Atualizando ${codigos.length} rastreamentos...`);

  // Processa todos com fila visual
  await atualizarFilaIndividual(codigos);
}

// ===== Atualizar por STATUS específico =====
const STATUS_MAP = {
  etiqueta: [{ codigo: "FC", tipo: "82" }],
  coletado: [], // não existe código, só descrição
  postado: [{ codigo: "PO" }],
  transito: [
    { codigo: "RO" },
    { codigo: "DO" },
    { codigo: "TR" },
    { codigo: "PAR" },
  ],
  saiu_entrega: [{ codigo: "OEC" }],
  entregue: [{ codigo: "BDE", tipo: "01" }],
  extraviado: [{ codigo: "EX" }],
  aguardando: [{ codigo: "LDI" }],
  devolvido: [{ codigo: "LDE" }],
};

async function atualizarPorStatus(statusKey) {
  try {
    let query = supabase
      .from("slas_transportadora")
      .select("codigo_rastreio, status_atual, status_codigo, status_tipo");

    if (statusKey === "coletado") {
      query = query.ilike("status_atual", "%coletado%");
    } else if (STATUS_MAP[statusKey]?.length) {
      const codigos = STATUS_MAP[statusKey].map((s) => s.codigo);
      query = query.in("status_codigo", codigos);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`Erro ao buscar ${statusKey}:`, error);
      return;
    }

    if (!data || data.length === 0) {
      alert(`Nenhum pedido encontrado para "${statusKey}".`);
      return;
    }

    const rastreios = data.map((s) => s.codigo_rastreio);
    console.log(`Atualizando ${rastreios.length} pedidos (${statusKey})...`);

    // Usa a fila visual
    await atualizarFilaIndividual(rastreios);
  } catch (err) {
    console.error(`Erro atualizarPorStatus(${statusKey}):`, err);
  }
}

// ===== Atualizar rastreio (com loader) =====
async function atualizarRastro(codigos) {
  const lista = Array.isArray(codigos) ? codigos : [codigos];
  const loader = document.getElementById("slaLoader");
  const loaderBar = document.getElementById("slaLoaderBar");

  loader.style.display = "block";
  loaderBar.style.width = "0%";
  loaderBar.textContent = "0%";

  try {
    let processados = 0;

    for (const codigo of lista) {
      const resp = await fetch(`${supabaseFunctionsUrl}/get-rastro`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ codigos: [codigo] }),
      });

      if (!resp.ok) {
        console.error("Erro get-rastro:", resp.status, codigo);
        continue;
      }

      const resultados = await resp.json();
      for (const resultado of resultados) {
        if (resultado.error) {
          console.error(`Erro no código ${resultado.codigo}:`, resultado.error);
          continue;
        }

        const { transportadora, eventos } =
          normalizarEventosDoRastro(resultado);
        const ultimo = eventos[0];

        // Correios tem "objeto" com dtPrevista; Loggi não.
        const objetoCorreios = resultado.data?.objetos?.[0];
        const pkgLoggi = resultado.data?.packages?.[0];

        // Atualiza apenas se não for status final
        const isEntregaReal =
          (transportadora === "Correios" &&
            ultimo?.codigo === "BDE" &&
            ultimo?.tipo === "01") ||
          (transportadora === "Loggi" && String(ultimo?.codigo) === "5");

        const payload = {
          codigo_rastreio: resultado.codigo.trim(),
          status_atual: ultimo?.descricao || "Sem atualização",
          transportadora,
          status_codigo: ultimo?.codigo || null,
          status_tipo: ultimo?.tipo || null,
          historico: eventos,
          data_postagem: eventos.find((e) => e.codigo === "PO")
            ? new Date(
                eventos.find((e) => e.codigo === "PO").dtHrCriado,
              ).toISOString()
            : null,
          data_entrega:
            isEntregaReal && ultimo?.dtHrCriado
              ? new Date(ultimo.dtHrCriado).toISOString()
              : null,

          entregue: isEntregaReal,
          dt_prevista:
            transportadora === "Correios" && objetoCorreios?.dtPrevista
              ? new Date(objetoCorreios.dtPrevista).toISOString()
              : // Loggi: se quiser, pode usar promisedDate
                pkgLoggi?.promisedDate
                ? new Date(pkgLoggi.promisedDate + "T00:00:00Z").toISOString()
                : null,
        };

        const { error } = await supabase
          .from("slas_transportadora")
          .upsert(
            { codigo_rastreio: resultado.codigo.trim(), ...payload },
            { onConflict: "codigo_rastreio" },
          );
        if (error) console.error("Erro no upsert:", error);
      }

      processados++;
      const pct = Math.round((processados / lista.length) * 100);
      loaderBar.style.width = `${pct}%`;
      loaderBar.textContent = `${pct}%`;
    }

    carregarSLAs();
  } catch (err) {
    console.error("Falha em atualizarRastro:", err);
  } finally {
    setTimeout(() => {
      loader.style.display = "none";
    }, 800);
  }
}

async function filtrarCodigosNaoEntregues(codigos) {
  const lista = (codigos || [])
    .map((c) => String(c || "").trim())
    .filter(Boolean);
  if (!lista.length) return { processar: [], entregues: [] };

  // Busca status atual no banco (em lotes, pra não estourar URL/limites)
  const chunkSize = 800;
  const entregues = new Set();

  for (let i = 0; i < lista.length; i += chunkSize) {
    const chunk = lista.slice(i, i + chunkSize);

    const { data, error } = await supabase
      .from("slas_transportadora")
      .select("codigo_rastreio, entregue")
      .in("codigo_rastreio", chunk);

    if (error) {
      console.error("Erro ao filtrar entregues:", error);
      // se falhar, não bloqueia a atualização — processa tudo
      return { processar: lista, entregues: [] };
    }

    (data || []).forEach((r) => {
      if (r?.entregue) entregues.add(String(r.codigo_rastreio || "").trim());
    });
  }

  const jaEntregues = lista.filter((c) => entregues.has(c));
  const processar = lista.filter((c) => !entregues.has(c));

  return { processar, entregues: jaEntregues };
}

async function atualizarColetados() {
  const { data, error } = await supabase
    .from("slas_transportadora")
    .select("codigo_rastreio, status_atual")
    .eq("status_atual", "Coletado"); // 👈 filtra só os coletados

  if (error) {
    console.error("Erro ao carregar coletados:", error);
    return;
  }

  if (!data || data.length === 0) {
    alert("Nenhum pedido com status 'Coletado' encontrado.");
    return;
  }

  const codigos = data.map((s) => s.codigo_rastreio);
  console.log(`Atualizando ${codigos.length} pedidos coletados...`);
  atualizarRastro(codigos);
}

document
  .getElementById("slaFormLote")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Obter data informada (YYYY-MM-DD)
    const dataInput = document.getElementById("slaData").value;
    const agora = new Date();

    // Corrige para fuso horário de São Paulo
    const offsetSP = -3 * 60; // -03:00
    const localSP = new Date(
      agora.getTime() - (agora.getTimezoneOffset() - offsetSP) * 60000,
    );

    const horaSP = localSP.toISOString().slice(11, 19); // HH:MM:SS

    // Se o usuário escolheu uma data, monta manualmente em ISO com fuso -03:00
    const data_coleta = dataInput
      ? `${dataInput}T${horaSP}-06:00`
      : localSP.toISOString().replace("Z", "-03:00");
    const lote = document.getElementById("slaLote").value.trim();

    // Quebra por linha
    const linhas = lote
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const insertData = [];

    linhas.forEach((linha) => {
      // tenta split por tab primeiro, depois por ;
      let [pedido, rastreio] = linha.includes("\t")
        ? linha.split("\t")
        : linha.split(";");

      pedido = pedido?.trim();
      rastreio = rastreio?.trim().replace(/\s+/g, "").toUpperCase();

      if (pedido && rastreio) {
        insertData.push({
          pedido_id: pedido,
          codigo_rastreio: rastreio,
          data_coleta,
          transportadora: /^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(rastreio)
            ? "Correios"
            : "Loggi",
        });
      }
    });

    if (!insertData.length) {
      alert("❌ Nenhum dado válido encontrado. Use TAB ou ; como separador.");
      return;
    }

    const { error } = await supabase
      .from("slas_transportadora")
      .insert(insertData);

    if (error) {
      alert("❌ Erro ao salvar: " + error.message);
    } else {
      alert(`✅ ${insertData.length} SLAs adicionados com sucesso!`);
      e.target.reset();
      carregarSLAs();
    }
  });

async function carregarMetricasSLA() {
  const { data, error } = await supabase.rpc("resumo_sla");

  if (error) {
    console.error("Erro ao carregar métricas SLA:", error);
    return;
  }
  if (!data || !data.length) return;

  const resumo = data[0];

  document.getElementById("countEtiqueta").textContent =
    resumo.etiqueta_emitida;
  document.getElementById("countColetado").textContent = resumo.coletado;
  document.getElementById("countPostado").textContent = resumo.postado;
  document.getElementById("countTransito").textContent = resumo.em_transito;
  document.getElementById("countSaiuEntrega").textContent = resumo.saiu_entrega;
  document.getElementById("countEntregue").textContent = resumo.entregue;
  document.getElementById("countExtraviado").textContent = resumo.extraviado;
  document.getElementById("countAguardando").textContent =
    resumo.aguardando_retirada;
  document.getElementById("countDevolvido").textContent = resumo.devolvido;
}

async function carregarMetricasDetalhadasSLA() {
  const { data, error } = await supabase.rpc("metricas_sla");
  if (error) return console.error("Erro métricas SLA:", error);

  const m = data[0];
  document.getElementById("tempoMedioPostagem").textContent =
    m.tempo_medio_postagem ? `D+${m.tempo_medio_postagem}` : "-";
  document.getElementById("tempoMedioEntrega").textContent =
    m.tempo_medio_entrega ? `D+${m.tempo_medio_entrega}` : "-";
  document.getElementById("tempoMedioTransito").textContent =
    m.tempo_medio_transito ? `D+${m.tempo_medio_transito}` : "-";
  document.getElementById("pctNoPrazo").textContent = `${
    m.pct_no_prazo?.toFixed(1) ?? 0
  }%`;
  document.getElementById("pctAtraso").textContent = `${
    m.pct_atraso?.toFixed(1) ?? 0
  }%`;
  document.getElementById("pctExtraviado").textContent = `${
    m.pct_extraviado?.toFixed(1) ?? 0
  }%`;
}

async function carregarTempoMedioExpedicao() {
  try {
    const { data, error } = await supabase
      .from("view_tempo_medio_expedicao_resumo")
      .select("*")
      .single();

    if (error) throw error;
    if (!data) return;

    const horas = data.media_horas ?? 0;
    const dias = data.media_dias ?? 0;

    document.getElementById("tempoMedioExpedicao").textContent =
      horas > 0 ? `${dias.toFixed(1)} dias (${horas.toFixed(1)}h)` : "-";
  } catch (err) {
    console.error("Erro ao carregar tempo médio expedição:", err);
  }
}

async function buscarTodosCodigos() {
  let codigos = [];
  let pagina = 0;
  const pageSize = 1000;
  let continuar = true;

  while (continuar) {
    const { data, error } = await supabase
      .from("slas_transportadora")
      .select("codigo_rastreio")
      .range(pagina * pageSize, (pagina + 1) * pageSize - 1);

    if (error) {
      console.error("Erro ao buscar códigos:", error);
      break;
    }
    if (!data || data.length === 0) {
      continuar = false;
      break;
    }
    codigos = codigos.concat(data.map((d) => d.codigo_rastreio));
    pagina++;
  }
  return codigos;
}

async function atualizarFilaIndividual(codigos) {
  const tbody = document.getElementById("slaQueueList");
  tbody.innerHTML = "";

  // ✅ remove os já entregues ANTES de montar a fila
  const { processar, entregues } = await filtrarCodigosNaoEntregues(codigos);

  if (entregues.length) {
    console.log(`✅ Ignorando ${entregues.length} já entregues:`, entregues);
    // opcional: mostrar um aviso no UI se você quiser
    const aviso = document.getElementById("slaQueueAviso");
    if (aviso) {
      aviso.textContent = `✅ ${entregues.length} rastreios já estavam entregues e foram ignorados.`;
      aviso.style.display = "block";
    }
  }

  if (!processar.length) {
    alert(
      "✅ Todos os rastreios selecionados já estão entregues. Nada para atualizar.",
    );
    carregarSLAs();
    return;
  }

  // Inicializa a fila visual SOMENTE para os que vão processar
  processar.forEach((cod) => {
    const tr = document.createElement("tr");
    tr.id = `fila-${cod}`;
    tr.innerHTML = `
      <td>${cod}</td>
      <td><span class="badge bg-secondary">⏳ Na fila</span></td>
    `;
    tbody.appendChild(tr);
  });

  // Processa item por item
  for (const codigo of processar) {
    const row = document.getElementById(`fila-${codigo}`);
    const badge = row?.querySelector("span");
    if (!badge) continue;

    try {
      badge.className = "badge bg-warning text-dark";
      badge.textContent = "🔄 Atualizando";

      const resp = await fetch(`${supabaseFunctionsUrl}/get-rastro`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ codigos: [codigo] }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const resultados = await resp.json();
      const resultado = resultados[0];
      if (resultado.error) throw new Error(resultado.error);

      // ⚠️ aqui seu código continua igual (normalizar / montar payload / upsert)
      const { transportadora, eventos } = normalizarEventosDoRastro(resultado);
      const ultimo = eventos[0];

      // Correios
      const objetoCorreios = resultado.data?.objetos?.[0];
      // Loggi
      const pkgLoggi = resultado.data?.packages?.[0];

      const isEntregaReal =
        (transportadora === "Correios" &&
          ultimo?.codigo === "BDE" &&
          ultimo?.tipo === "01") ||
        (transportadora === "Loggi" && String(ultimo?.codigo) === "5");

      const payload = {
        codigo_rastreio: codigo,
        status_atual: ultimo?.descricao || "Sem atualização",
        transportadora,
        status_codigo: ultimo?.codigo || null,
        status_tipo: ultimo?.tipo || null,
        historico: eventos,
        data_postagem: eventos.find((e) => e.codigo === "PO")
          ? new Date(
              eventos.find((e) => e.codigo === "PO").dtHrCriado,
            ).toISOString()
          : null,
        data_entrega:
          isEntregaReal && ultimo?.dtHrCriado
            ? new Date(ultimo.dtHrCriado).toISOString()
            : null,
        entregue: isEntregaReal,
        dt_prevista:
          transportadora === "Correios" && objetoCorreios?.dtPrevista
            ? new Date(objetoCorreios.dtPrevista).toISOString()
            : pkgLoggi?.promisedDate
              ? new Date(pkgLoggi.promisedDate + "T00:00:00Z").toISOString()
              : null,
      };

      const { error } = await supabase
        .from("slas_transportadora")
        .upsert(payload, { onConflict: "codigo_rastreio" });

      if (error) throw error;

      badge.className = "badge bg-success";
      badge.textContent = "✅ Atualizado";
    } catch (err) {
      console.error(`Erro no código ${codigo}:`, err);
      badge.className = "badge bg-danger";
      badge.textContent = "❌ Erro";
    }
  }

  carregarSLAs();
}

function renderAdminConsultaBase() {
  const wrap = document.getElementById("adminArea"); // ajuste o id do container
  if (!wrap) return;

  const el = document.createElement("div");
  el.className = "card mt-3";
  el.innerHTML = `
    <div class="card-body">
      <h5 class="mb-2">🔎 Base da Consulta</h5>
      <div class="row g-2">
        <div class="col-md-4">
          <label class="form-label">Label</label>
          <input id="cb_label" class="form-control" placeholder="Ex: Semana 1 Jan" />
        </div>
        <div class="col-md-2">
          <label class="form-label">Pedido início</label>
          <input id="cb_ini" class="form-control" type="number" />
        </div>
        <div class="col-md-2">
          <label class="form-label">Pedido fim</label>
          <input id="cb_fim" class="form-control" type="number" />
        </div>
        <div class="col-md-2">
          <label class="form-label">Data início</label>
          <input id="cb_data_ini" class="form-control" type="date" />
        </div>
        <div class="col-md-2">
          <label class="form-label">Data fim</label>
          <input id="cb_data_fim" class="form-control" type="date" />
        </div>
        <div class="col-12 d-flex gap-2 mt-2">
          <button id="btnSalvarBaseConsulta" class="btn btn-primary btn-sm">
            💾 Salvar Base
          </button>
          <button id="btnAbrirConsulta" class="btn btn-outline-dark btn-sm">
            Abrir Consulta
          </button>
          <span id="cb_status" class="ms-2 small text-muted"></span>
        </div>
      </div>
    </div>
  `;
  wrap.appendChild(el);
}

async function salvarBaseConsulta() {
  const label = document.getElementById("cb_label").value.trim() || null;
  const pedido_ini = Number(document.getElementById("cb_ini").value);
  const pedido_fim = Number(document.getElementById("cb_fim").value);
  const data_ini = document.getElementById("cb_data_ini").value;
  const data_fim = document.getElementById("cb_data_fim").value;

  if (!pedido_ini || !pedido_fim || !data_ini || !data_fim) {
    alert("Preencha pedido_ini, pedido_fim, data_ini e data_fim.");
    return;
  }

  // desativa bases antigas (opcional)
  await supabase
    .from("consulta_base")
    .update({ is_active: false })
    .eq("is_active", true);

  const { error } = await supabase.from("consulta_base").insert([
    {
      created_by: window.operador || null,
      label,
      pedido_ini,
      pedido_fim,
      data_ini,
      data_fim,
      is_active: true,
    },
  ]);

  if (error) {
    console.error(error);
    alert("❌ Erro ao salvar base.");
    return;
  }

  document.getElementById("cb_status").textContent = "✅ Base salva e ativada.";
}

function bindAdminConsultaBase() {
  document
    .getElementById("btnSalvarBaseConsulta")
    ?.addEventListener("click", salvarBaseConsulta);
  document
    .getElementById("btnAbrirConsulta")
    ?.addEventListener("click", () => window.open("/consulta.html", "_blank"));
}

function normalizarEventosDoRastro(resultado) {
  // Correios
  const eventosCorreios = resultado?.data?.objetos?.[0]?.eventos;
  if (Array.isArray(eventosCorreios)) {
    return { transportadora: "Correios", eventos: eventosCorreios };
  }

  // Loggi
  const hist = resultado?.data?.packages?.[0]?.trackingHistory;
  if (Array.isArray(hist)) {
    const eventosLoggi = hist
      .map((h) => ({
        codigo: h?.status?.code ?? null, // "13", "5", etc.
        tipo: null, // Loggi não tem "tipo" estilo Correios
        descricao: h?.status?.description ?? h?.status?.highLevelStatus ?? "",
        dtHrCriado: h?.status?.updatedTime ?? null,
      }))
      .filter((e) => e.codigo && e.dtHrCriado)
      // manter padrão do seu código (eventos[0] = último)
      .sort((a, b) => new Date(b.dtHrCriado) - new Date(a.dtHrCriado));

    return { transportadora: "Loggi", eventos: eventosLoggi };
  }

  return { transportadora: "Desconhecida", eventos: [] };
}

function getHojeSPDateOnly() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  });
}

function getPeriodoSP(tipo) {
  const hoje = getHojeSPDateOnly(); // YYYY-MM-DD

  // helper local (não depende de nada externo)
  const fmtBR = (dateStr) => {
    if (!dateStr) return "";
    const [y, m, d] = String(dateStr).split("-");
    return `${d}/${m}/${y}`;
  };

  if (tipo === "geral")
    return { tipo, label: "Geral", inicio: null, fim: null };

  if (tipo === "mes") {
    const [y, m] = hoje.split("-");
    const inicio = `${y}-${m}-01`;

    const d0 = new Date(`${inicio}T12:00:00-03:00`);
    const proxMes = new Date(d0);
    proxMes.setMonth(proxMes.getMonth() + 1);

    const fim = proxMes.toLocaleDateString("sv-SE", {
      timeZone: "America/Sao_Paulo",
    });
    return { tipo, label: `Mês atual (${m}/${y})`, inicio, fim };
  }

  // semana seg->dom, fim exclusivo
  const base = new Date(`${hoje}T12:00:00-03:00`);
  const day = base.getDay(); // 0 dom, 1 seg...
  const diffToMon = day === 0 ? -6 : 1 - day;

  const inicioDate = new Date(base);
  inicioDate.setDate(base.getDate() + diffToMon);

  const fimDate = new Date(inicioDate);
  fimDate.setDate(inicioDate.getDate() + 7);

  const inicio = inicioDate.toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  });
  const fim = fimDate.toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  });

  const fimInclusivo = new Date(
    fimDate.getTime() - 86400000,
  ).toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  });

  return {
    tipo,
    label: `Semana atual (${fmtBR(inicio)} a ${fmtBR(fimInclusivo)})`,
    inicio,
    fim,
  };
}

async function fetchSLAsPeriodo(inicio, fimExclusivo) {
  let all = [];
  let from = 0;
  const step = 1000;

  while (true) {
    let q = supabase
      .from("slas_transportadora")
      .select(
        "status_codigo, status_tipo, status_atual, entregue, data_coleta, data_postagem, data_entrega, dt_prevista",
        { count: "exact" },
      )
      .order("criado_em", { ascending: false })
      .range(from, from + step - 1);

    if (inicio && fimExclusivo) {
      q = q
        .gte("data_coleta", `${inicio}T00:00:00-03:00`)
        .lt("data_coleta", `${fimExclusivo}T00:00:00-03:00`);
    }

    const { data, error } = await q;
    if (error) throw error;

    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < step) break;

    from += step;
  }

  return all;
}

function diffDias(aIso, bIso) {
  // retorna diferença em dias (b - a)
  if (!aIso || !bIso) return null;
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const ms = b - a;
  if (ms < 0) return null;
  return ms / 86400000;
}

function mean(arr) {
  const v = arr.filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function renderMetricasSLAFront(m) {
  document.getElementById("tempoMedioPostagem").textContent =
    m.tempo_medio_postagem != null
      ? `D+${m.tempo_medio_postagem.toFixed(1)}`
      : "-";

  document.getElementById("tempoMedioEntrega").textContent =
    m.tempo_medio_entrega != null
      ? `D+${m.tempo_medio_entrega.toFixed(1)}`
      : "-";

  document.getElementById("tempoMedioTransito").textContent =
    m.tempo_medio_transito != null
      ? `D+${m.tempo_medio_transito.toFixed(1)}`
      : "-";

  document.getElementById("pctNoPrazo").textContent =
    m.pct_no_prazo != null ? `${m.pct_no_prazo.toFixed(1)}%` : "-";

  document.getElementById("pctAtraso").textContent =
    m.pct_atraso != null ? `${m.pct_atraso.toFixed(1)}%` : "-";

  document.getElementById("pctExtraviado").textContent =
    m.pct_extraviado != null ? `${m.pct_extraviado.toFixed(1)}%` : "-";
}

function contarStatusSLA(rows) {
  const out = {
    etiqueta: 0,
    coletado: 0,
    postado: 0,
    transito: 0,
    saiu_entrega: 0,
    entregue: 0,
    extraviado: 0,
    aguardando: 0,
    devolvido: 0,
    fluxo: 0,
  };

  for (const r of rows) {
    const codigo = r?.status_codigo ?? null;
    const tipo = r?.status_tipo ?? null;
    const statusAtual = String(r?.status_atual ?? "").toLowerCase();

    if (codigo === "FC" && tipo === "82") out.etiqueta++;
    else if (codigo === "CO" || statusAtual.includes("colet")) out.coletado++;
    else if (codigo === "PO") out.postado++;
    else if (["RO", "DO", "TR", "PAR"].includes(codigo)) out.transito++;
    else if (codigo === "OEC") out.saiu_entrega++;
    else if (codigo === "BDE") out.entregue++;
    else if (codigo === "EX") out.extraviado++;
    else if (codigo === "LDI") out.aguardando++;
    else if (codigo === "LDE") out.devolvido++;
  }

  out.fluxo = rows.filter(
    (r) => !["BDE", "EX", "LDI", "LDE"].includes(r?.status_codigo ?? ""),
  ).length;
  return out;
}

function renderCardsSLA(resumo) {
  document.getElementById("countEtiqueta").textContent = resumo.etiqueta;
  document.getElementById("countColetado").textContent = resumo.coletado;
  document.getElementById("countPostado").textContent = resumo.postado;
  document.getElementById("countTransito").textContent = resumo.transito;
  document.getElementById("countSaiuEntrega").textContent = resumo.saiu_entrega;
  document.getElementById("countEntregue").textContent = resumo.entregue;
  document.getElementById("countExtraviado").textContent = resumo.extraviado;
  document.getElementById("countAguardando").textContent = resumo.aguardando;
  document.getElementById("countDevolvido").textContent = resumo.devolvido;

  const fluxoEl = document.getElementById("countFluxo");
  if (fluxoEl) fluxoEl.textContent = resumo.fluxo;
}

async function carregarSLAResumoEAnalisePorPeriodo(tipo) {
  const p = getPeriodoSP(tipo);
  const labelEl = document.getElementById("slaPeriodoLabel");
  if (labelEl) labelEl.textContent = p.label;

  const rows = await fetchSLAsPeriodo(p.inicio, p.fim);

  // ✅ cards de status
  const resumo = contarStatusSLA(rows);
  renderCardsSLA(resumo);

  // ✅ métricas analíticas (só faz sentido para entregues, etc.)
  const difPostagem = [];
  const difEntrega = [];
  const difTransito = [];

  let entreguesComPrev = 0;
  let noPrazo = 0;
  let atraso = 0;

  const total = rows.length || 0;
  const extraviados = rows.filter((r) => r.status_codigo === "EX").length;

  for (const r of rows) {
    // D+ postagem: coleta -> postagem
    const dPost = diffDias(r.data_coleta, r.data_postagem);
    if (dPost != null) difPostagem.push(dPost);

    // D+ entrega: postagem -> entrega (se preferir "coleta->entrega", troque aqui)
    const dEnt = diffDias(r.data_postagem, r.data_entrega);
    if (dEnt != null) difEntrega.push(dEnt);

    // trânsito: postagem -> entrega (mesmo cálculo acima; se quiser outro ponto, ajusta)
    const dTran = diffDias(r.data_postagem, r.data_entrega);
    if (dTran != null) difTransito.push(dTran);

    // No prazo x atraso (precisa dt_prevista e data_entrega)
    if (r.dt_prevista && r.data_entrega) {
      entreguesComPrev++;
      const entrega = new Date(r.data_entrega).getTime();
      const prev = new Date(r.dt_prevista).getTime();
      if (Number.isFinite(entrega) && Number.isFinite(prev)) {
        if (entrega <= prev) noPrazo++;
        else atraso++;
      }
    }
  }

  const m = {
    tempo_medio_postagem: mean(difPostagem),
    tempo_medio_entrega: mean(difEntrega),
    tempo_medio_transito: mean(difTransito),
    pct_no_prazo: entreguesComPrev ? (noPrazo / entreguesComPrev) * 100 : null,
    pct_atraso: entreguesComPrev ? (atraso / entreguesComPrev) * 100 : null,
    pct_extraviado: total ? (extraviados / total) * 100 : null,
  };

  renderMetricasSLAFront(m);
}

function bindPeriodoSLA() {
  const sel = document.getElementById("slaPeriodo");
  if (!sel) return;

  sel.addEventListener("change", async () => {
    const tipo = sel.value || "mes";
    await carregarSLAResumoEAnalisePorPeriodo(tipo);
  });
}

renderAdminConsultaBase();
setTimeout(bindAdminConsultaBase, 0);

window.carregarSLAs = carregarSLAs;
window.atualizarRastro = atualizarRastro;
window.atualizarTodosSLAs = atualizarTodosSLAs;
window.atualizarColetados = atualizarColetados;
window.filtrarSLA = filtrarSLA;
window.carregarMetricasDetalhadasSLA = carregarMetricasDetalhadasSLA;
window.buscarTodosCodigos = buscarTodosCodigos;
window.atualizarPorStatus = atualizarPorStatus;
window.atualizarFilaIndividual = atualizarFilaIndividual;
