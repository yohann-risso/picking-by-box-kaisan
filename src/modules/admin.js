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

// === Admin module gate: only run when the admin page is active ===
const __ADMIN_MOUNTS__ = ["#accordionAdmin", "#adminApp", "#dashboardAdmin"];
const __ADMIN_ACTIVE__ = __ADMIN_MOUNTS__.some((sel) =>
  document.querySelector(sel)
);
if (!__ADMIN_ACTIVE__) {
  console.info("[admin] page not active — skipping bootstrap.");
} else {
  let chartPedidosHora, chartRanking, chartMotivosErro;
  let autoRefresh;

  // ===== Helpers =====
  function formatarSegundos(segundos) {
    const h = String(Math.floor(segundos / 3600)).padStart(2, "0");
    const m = String(Math.floor((segundos % 3600) / 60)).padStart(2, "0");
    const s = String(segundos % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
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

    const { data: pendentesData } = await supabase.rpc(
      "contar_pecas_pendentes"
    );
    const totalPendentes = pendentesData?.[0]?.total_pedidos ?? 0;
    const totalPecasPendentes = pendentesData?.[0]?.total_pecas ?? 0;

    const { data: pesadosHojeData } = await supabase.rpc(
      "contar_pedidos_pesados_hoje",
      { data: hoje }
    );
    const totalPesadosHoje = pesadosHojeData?.[0]?.total_pedidos ?? 0;
    const totalPecasPesadasHoje = pesadosHojeData?.[0]?.total_pecas ?? 0;

    const { data: metaGeral } = await supabase.rpc(
      "contar_pedidos_nao_pesados"
    );
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
  async function carregarPivotHoras(dataFiltro = null) {
    // Monta query
    let query = supabase.from("view_pedidos_por_hora").select("*");

    if (dataFiltro) {
      query = query.eq("data", formatarParaBR(dataFiltro));
    }
    const { data, error } = await query;
    if (error) {
      console.error("Erro ao carregar pivot:", error);
      return;
    }

    const header = document.getElementById("pivotHeader");
    const body = document.getElementById("pivotBody");

    if (!data?.length) {
      header.innerHTML = "";
      body.innerHTML = `<tr><td colspan="99">Nenhum dado encontrado</td></tr>`;
      return;
    }

    // Obtém colunas dinamicamente (mantém ordem)
    const cols = Object.keys(data[0]);

    // Monta cabeçalho
    header.innerHTML =
      "<tr>" +
      cols.map((c) => `<th>${c.toUpperCase()}</th>`).join("") +
      "</tr>";

    // Monta corpo
    body.innerHTML = "";
    data.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = cols
        .map((c) => {
          const val = row[c];
          return `<td class="${typeof val === "number" ? "text-end" : ""}">
                  ${val ?? 0}
                </td>`;
        })
        .join("");
      body.appendChild(tr);
    });

    // Se houver TOTAL GERAL na view → gera gráfico de pedidos por hora
    const totalGeral = data.find((r) => r.operador === "TOTAL GERAL");
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
                backgroundColor: "rgba(13, 110, 253, 0.2)",
                tension: 0.3,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true },
            },
          },
        }
      );
    }
  }

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
        r.iniciado_em
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
          document.getElementById("erroModal")
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

async function carregarSLAs() {
  const { data, error } = await supabase
    .from("slas_transportadora")
    .select("*")
    .order("criado_em", { ascending: false });

  if (error) return console.error(error);

  const tbody = document.getElementById("slaList");
  tbody.innerHTML = "";

  data.forEach((sla) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${sla.pedido_id || "-"}</strong></td>
      <td>${sla.codigo_rastreio}</td>
      <td>
        <span class="badge-status ${
          sla.entregue
            ? "success"
            : sla.status_atual?.toLowerCase().includes("trânsito")
            ? "info"
            : "secondary"
        }">
          ${sla.status_atual || "-"}
        </span>
      </td>
      <td>${
        sla.data_coleta
          ? new Date(sla.data_coleta).toLocaleDateString("pt-BR")
          : "-"
      }</td>
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
}

async function atualizarTodosSLAs() {
  const { data } = await supabase
    .from("slas_transportadora")
    .select("codigo_rastreio");
  if (!data) return;
  const codigos = data.map((s) => s.codigo_rastreio);
  atualizarRastro(codigos);
}

async function atualizarRastro(codigos) {
  const lista = Array.isArray(codigos) ? codigos : [codigos];

  try {
    const resp = await fetch(
      "https://kinpwzuobsmfkjefnrdc.functions.supabase.co/get-rastro",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ codigos: lista }),
      }
    );

    if (!resp.ok) {
      console.error("Erro ao chamar get-rastro:", resp.status);
      return;
    }

    const resultados = await resp.json();

    for (const resultado of resultados) {
      if (resultado.error) {
        console.error(`Erro no código ${resultado.codigo}:`, resultado.error);
        continue;
      }

      const eventos = resultado.data?.objetos?.[0]?.eventos || [];
      const ultimo = eventos[0];

      await supabase
        .from("slas_transportadora")
        .update({
          status_atual: ultimo?.descricao || "Sem atualização",
          historico: eventos,
          data_postagem:
            eventos.find((e) => e.codigo === "PO")?.dtHrCriado || null,
          data_entrega:
            eventos.find((e) => e.codigo === "BDE")?.dtHrCriado || null,
          entregue: !!eventos.find((e) => e.codigo === "BDE"),
          atualizado_em: new Date().toISOString(),
        })
        .eq("codigo_rastreio", resultado.codigo);
    }

    carregarSLAs();
  } catch (err) {
    console.error("Falha em atualizarRastro:", err);
  }
}

document
  .getElementById("slaFormLote")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data_coleta =
      document.getElementById("slaData").value ||
      new Date().toISOString().slice(0, 10);
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
      rastreio = rastreio?.trim();

      if (pedido && rastreio) {
        insertData.push({
          pedido_id: pedido,
          codigo_rastreio: rastreio,
          data_coleta,
          transportadora: "Correios",
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

window.carregarSLAs = carregarSLAs;
window.atualizarRastro = atualizarRastro;
window.atualizarTodosSLAs = atualizarTodosSLAs;
