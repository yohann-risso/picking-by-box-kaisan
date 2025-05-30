import { biparProduto } from "./components/bipagemHandler.js";
import { supabase } from "./api/supabase.js";
import { setContadorBox } from "./utils/box.js";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

let romaneio = "";
let historico = [];
let caixas = {};
let imagensRef = {};
let codNfeMap = {};
let pendentes = [];
let currentProduto = null;
let operador = null;

document.getElementById("inputLogin").addEventListener("keypress", (e) => {
  if (e.key === "Enter") document.getElementById("btnLogin").click();
});

document.getElementById("inputSenha").addEventListener("keypress", (e) => {
  if (e.key === "Enter") document.getElementById("btnLogin").click();
});

// Login do operador
document.getElementById("btnLogin").addEventListener("click", async () => {
  const login = document.getElementById("inputLogin").value.trim();
  const senha = document.getElementById("inputSenha").value.trim();

  if (!login || !senha) {
    alert("Digite login e senha.");
    return;
  }

  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("login_usuario", login)
    .eq("senha_usuario", senha)
    .single();

  if (error || !data) {
    alert("Login ou senha incorretos.");
    return;
  }

  operador = data.nome_completo || data.login_usuario;
  localStorage.setItem("operador", operador);
  document.getElementById("loginArea").style.display = "none";
  document.getElementById("mainApp").style.display = "block";
  document.getElementById(
    "operadorLogado"
  ).textContent = `Operador: ${operador}`;
});

// Carregar operador salvo
window.addEventListener("load", () => {
  const salvo = localStorage.getItem("operador");
  if (salvo) {
    operador = salvo;
    document.getElementById("loginArea").style.display = "none";
    document.getElementById("mainApp").style.display = "block";
    document.getElementById(
      "operadorLogado"
    ).textContent = `Operador: ${operador}`;
  }
});

document.getElementById("btnLogout").addEventListener("click", () => {
  localStorage.removeItem("operador");
  location.reload();
});

async function verificarRomaneioEmUso(romaneio) {
  const { data, error } = await supabase
    .from("romaneios_em_uso")
    .select("*")
    .eq("romaneio", romaneio)
    .single();

  if (data) {
    if (data.operador !== operador) {
      return {
        emUso: true,
        por: data.operador,
      };
    } else {
      // o próprio operador retomando
      return { emUso: false };
    }
  }

  // Registra como em uso
  const { error: insertError } = await supabase
    .from("romaneios_em_uso")
    .insert([{ romaneio, operador }]);

  if (insertError) {
    return { emUso: true, por: "desconhecido" };
  }

  return { emUso: false };
}

async function gerarPdfResumo() {
  const operadorLogado = operador || "Desconhecido";
  const romaneioAtivo = romaneio || "Não informado";
  const dataHoraAtual = new Date().toLocaleString("pt-BR");

  // Ordenar caixas: primeiro as com número, depois as sem
  const caixasOrdenadas = Object.entries(caixas)
    .slice(0, 50)
    .sort((a, b) => {
      const aBox = caixas[a[0]].box ?? "-";
      const bBox = caixas[b[0]].box ?? "-";
      if (aBox === "-" && bBox !== "-") return 1;
      if (bBox === "-" && aBox !== "-") return -1;
      return Number(aBox) - Number(bBox);
    });

  const boxTableRows = caixasOrdenadas
    .map(([pedido, info]) => {
      const box = info.box ?? "-";
      const bipado = info.bipado ?? 0;
      const total = info.total ?? 0;
      const status = info.pesado
        ? "Pesado"
        : bipado >= total
        ? "Completo"
        : "Incompleto";

      return `
        <tr>
          <td>${box}</td>
          <td>${pedido}</td>
          <td>${bipado}</td>
          <td>${total}</td>
          <td>${status}</td>
        </tr>`;
    })
    .join("");

  // Relatório de NL
  const { data: pedidosData } = await supabase
    .from("pedidos")
    .select("id, cliente")
    .eq("romaneio", romaneio);

  const clienteMap = {};
  pedidosData?.forEach((p) => {
    clienteMap[p.id] = p.cliente || "-";
  });

  const pedidosMap = {};
  pendentes.forEach((p) => {
    const cliente = clienteMap[p.pedido] || "-";
    const linha = `
      <tr>
        <td>${p.pedido}</td>
        <td>${cliente}</td>
        <td>${p.descricao || "-"}</td>
        <td>${p.sku}</td>
        <td>${p.qtd}</td>
        <td></td>
        <td></td>
      </tr>`;
    if (!pedidosMap[p.pedido]) pedidosMap[p.pedido] = [];
    pedidosMap[p.pedido].push(linha);
  });

  const linhasNL = Object.values(pedidosMap).flat().join("");

  // HTML final
  const html = `
    <html>
      <head>
        <title>Resumo de Boxes e NL</title>
        <style>
          body { font-family: sans-serif; padding: 20px; margin: 0; }
          h2 { margin-bottom: 10px; }
          .info { margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
          th { background-color: #000; color: white; }
          .page-break { page-break-before: always; }
          tr { page-break-inside: avoid; }
        </style>
      </head>
      <body>
        <!-- Página 1: Resumo de Boxes -->
        <div>
          <h2>Resumo de Boxes</h2>
          <div class="info">
            <strong>Operador:</strong> ${operadorLogado}<br/>
            <strong>Romaneio:</strong> ${romaneioAtivo}<br/>
            <strong>Data:</strong> ${dataHoraAtual}
          </div>
          <table>
            <thead>
              <tr>
                <th>Box</th>
                <th>Pedido</th>
                <th>Qtde. Conferida</th>
                <th>Qtde. Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${boxTableRows}
            </tbody>
          </table>
        </div>

        <!-- Página 2: Relatório de NL -->
        <div class="page-break"></div>
        <h2>Relatório de NL</h2>
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Desc. Produto</th>
              <th>SKU</th>
              <th>Qtde.</th>
              <th>Completo</th>
              <th>Finalizando</th>
            </tr>
          </thead>
          <tbody>
            ${linhasNL}
          </tbody>
        </table>

        <script>
          window.onload = () => { window.print(); window.close(); }
        </script>
      </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

function toggleBoxes() {
  const boxArea = document.getElementById("colBoxes");
  const inputArea = document.getElementById("colInputs");
  const btnToggle = document.getElementById("btnToggleBoxes");

  if (!boxArea || !inputArea || !btnToggle) return;

  if (boxArea.classList.contains("d-none")) {
    boxArea.classList.remove("d-none");
    inputArea.classList.remove("col-12");
    inputArea.classList.add("col-md-4");
    boxArea.classList.add("col-md-8");
    btnToggle.textContent = "Ocultar Boxes";
  } else {
    boxArea.classList.add("d-none");
    inputArea.classList.remove("col-md-4");
    inputArea.classList.add("col-12");
    btnToggle.textContent = "Mostrar Boxes";
  }
}

async function carregarRefs(skuList = []) {
  let query = supabase.from("produtos_ref").select("sku, imagem");

  // se veio lista de SKUs, filtra
  if (skuList.length) {
    // assumindo que no banco sku está em uppercase
    query = query.in("sku", skuList);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Erro ao carregar referências:", error);
    return;
  }

  imagensRef = {};
  data.forEach((item) => {
    const raw = item.sku?.trim().toUpperCase();
    const url = item.imagem?.trim();
    if (!raw || !url) return;
    imagensRef[raw] = url;
    // opcional: permitir lookup indiferente a maiúsc/minúsc
    imagensRef[raw.toLowerCase()] = url;
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await carregarRefs();
  console.log("Mapeamento de imagens:", imagensRef);
  renderProductMap();

  document.getElementById("romaneioInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") document.getElementById("btnIniciar").click();
  });

  document.getElementById("skuInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") document.getElementById("btnBipar").click();
  });

  document
    .getElementById("btnToggleBoxes")
    .addEventListener("click", toggleBoxes);
  document
    .getElementById("btnGerarPdf")
    .addEventListener("click", gerarPdfResumo);
});

async function carregarCodNfeMap(pedidoIds) {
  const { data, error } = await supabase
    .from("pedidos_nfe")
    .select("pedido_id, cod_nfe")
    .in("pedido_id", pedidoIds); // ← aqui estava o erro

  if (error) {
    console.error("Erro ao carregar cod_nfe dos pedidos:", error);
    return;
  }

  data.forEach(({ pedido_id, cod_nfe }) => {
    codNfeMap[pedido_id] = cod_nfe;
  });

  console.log("✅ codNfeMap atualizado:", codNfeMap);
}

function renderBoxCards() {
  const boxContainer = document.getElementById("boxContainer");
  boxContainer.innerHTML = "";

  const entradas = Object.entries(caixas).filter(
    ([_, info]) => info.box != null && Number(info.bipado) > 0
  );
  if (!entradas.length) return;

  const agrupado = {};
  for (const [pedido, info] of entradas) {
    const boxNum = String(info.box);
    if (!agrupado[boxNum]) {
      agrupado[boxNum] = {
        bipado: 0,
        total: 0,
        pedidos: [],
        codNfes: [],
        pedidosPesados: [],
      };
    }
    agrupado[boxNum].bipado += Number(info.bipado);
    agrupado[boxNum].total += Number(info.total);
    agrupado[boxNum].pedidos.push(pedido);
    if (info.pesado) agrupado[boxNum].pedidosPesados.push(pedido);
    if (codNfeMap[pedido]) agrupado[boxNum].codNfes.push(codNfeMap[pedido]);
  }

  Object.keys(agrupado)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((boxNum) => {
      const { bipado, total, pedidos, codNfes } = agrupado[boxNum];
      const pedidoRef = pedidos[0];
      const codNfe = codNfes[0] || "";
      const isPesado = pedidos.every((p) => caixas[p]?.pesado);

      // Define conteúdo do botão de acordo com o status
      const botaoHtml = isPesado
        ? `
          <button class="btn-undo-simple btn-pesado" disabled tabindex="0">
            <i class="bi bi-check-circle-fill"></i> PESADO ✅
          </button>
        `
        : `
          <button
            class="btn-undo-simple btn-transparent btn-pesar"
            data-pedido="${pedidoRef}"
            data-codnfe="${codNfe}"
            tabindex="0"
          >
            <i class="bi bi-balance-scale"></i> PESAR PEDIDO
          </button>
        `;

      let light, solid;
      if (isPesado) {
        light = "bg-primary-subtle text-dark";
        solid = "bg-primary text-white";
      } else if (bipado >= total) {
        light = "bg-success-subtle text-dark";
        solid = "bg-success text-white";
      } else {
        light = "bg-danger-subtle text-dark";
        solid = "bg-danger text-white";
      }

      const wrapper = document.createElement("div");
      wrapper.className = "card-produto"; // mesma estrutura do produto

      const infoCard = document.createElement("div");
      infoCard.className = `card-info ${light}`;
      infoCard.innerHTML = `
        <div class="details text-center w-100">
          <div class="fs-6 fw-bold">${pedidoRef}</div>
          <div>
            <span class="badge bg-dark">${bipado}/${total}</span>
          </div>
          <div class="mt-2">
            ${botaoHtml}
          </div>
        </div>
      `;
      wrapper.appendChild(infoCard);

      const numCard = document.createElement("div");
      numCard.className = `card-number ${solid}`;
      numCard.innerHTML = `<div>${boxNum}</div>`;
      wrapper.appendChild(numCard);

      boxContainer.appendChild(wrapper);
    });

  // Eventos de clique/teclado para botões "PESAR PEDIDO"
  document.querySelectorAll(".btn-pesar").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const codNfe = btn.dataset.codnfe;
      const url = `https://ge.kaisan.com.br/index2.php?page=meta/view&id_view=nfe_pedido_conf&acao_view=cadastra&cod_del=${codNfe}&where=cod_nfe_pedido=${codNfe}#prodweightsomaproduto`;
      window.open(url, "_blank");
      btn.focus();
    });

    btn.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        btn.click();
      }
    });
  });
}

function renderHistorico() {
  const lista = document.getElementById("listaHistorico");
  if (!lista) {
    console.warn("⚠️ Elemento #listaHistorico não encontrado");
    return;
  }
  lista.innerHTML = "";

  historico
    .slice()
    .reverse()
    .forEach((item) => {
      const li = document.createElement("li");
      li.className =
        "list-group-item d-flex justify-content-between align-items-center";
      li.innerHTML = `
        <div class="me-2">
          <strong>${item.sku}</strong><br/>
          Pedido: ${item.pedido}
        </div>
        <div class="h2"><span class="badge bg-primary">${item.box}</span></div>
      `;
      lista.appendChild(li);
    });
}

function renderPendentes() {
  const lista = document.getElementById("listaPendentes");
  if (!lista) return;
  lista.innerHTML = "";

  const listaOrdenada = [...pendentes].sort((a, b) => {
    const ea = (a.endereco || "SEM LOCAL").match(/\d+/g)?.map(Number) || [];
    const eb = (b.endereco || "SEM LOCAL").match(/\d+/g)?.map(Number) || [];
    if (a.endereco?.includes("SEM LOCAL")) return 1;
    if (b.endereco?.includes("SEM LOCAL")) return -1;
    for (let i = 0; i < Math.max(ea.length, eb.length); i++) {
      const diff = (ea[i] || 0) - (eb[i] || 0);
      if (diff !== 0) return diff;
    }
    return (a.sku || "").localeCompare(b.sku || "");
  });

  const table = document.createElement("table");
  table.className = "table table-bordered table-sm align-middle mb-0";
  table.innerHTML = `
    <thead class="table-light">
      <tr>
        <th>SKU</th>
        <th>Qtde.</th>
        <th>Pedido</th>
        <th>Endereço</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  listaOrdenada.forEach(({ sku, qtd, pedido, endereco }) => {
    const enderecos = (endereco || "SEM LOCAL")
      .split(/\s*•\s*/)
      .map((e) => e.trim())
      .filter(Boolean);

    const primeiro = enderecos[0] || "SEM LOCAL";
    const tooltip = enderecos.join(" • ").replace(/"/g, "&quot;");

    let badgeClass = "bg-info text-dark";
    let badgeIcon = "📦";

    if (primeiro === "SEM LOCAL") {
      badgeClass = "bg-danger";
      badgeIcon = "❌";
    } else if (primeiro.toUpperCase() === "PRÉ-VENDA") {
      badgeClass = "bg-warning text-dark";
      badgeIcon = "⏳";
    }

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${sku || "SEM SKU"}</td>
      <td><span class="badge bg-dark">${qtd}</span></td>
      <td>${pedido || "-"}</td>
      <td>
        <span class="badge ${badgeClass} badge-endereco"
              data-bs-toggle="tooltip"
              data-bs-placement="top"
              title="${tooltip}">
          ${badgeIcon} ${primeiro}
        </span>
      </td>
    `;
    tbody.appendChild(row);
  });

  lista.appendChild(table);

  // Ativa os tooltips Bootstrap
  const tooltipTriggerList = document.querySelectorAll(
    '[data-bs-toggle="tooltip"]'
  );
  tooltipTriggerList.forEach((el) => new bootstrap.Tooltip(el));
}

function renderCardProduto(result) {
  const area = document.getElementById("cardAtual");
  if (!area) return;

  // Caso de erro
  if (result.status === "erro") {
    area.innerHTML = `<div class="card-erro">❌ ${result.msg}</div>`;
    return;
  }

  // Preparação dos dados
  const sku = result.sku.trim().toUpperCase();
  const urlImg =
    imagensRef[sku] || "https://via.placeholder.com/80?text=Sem+Img";
  const desc = result.descricao || "Descrição não disponível";
  const ref = sku.replace(/-P$/, "");
  const pedidoId = result.pedido_id;
  const boxNum = result.box;

  // Montagem do HTML
  area.innerHTML = `
    <div class="card-produto">
      <div class="card-info">
        <div class="details">
          <div class="title">${desc} | Ref: ${ref}</div>
          <hr />
          <div class="sku">SKU: ${sku}</div>
          <div class="pedido-undo">
            <span>Pedido: ${pedidoId}</span>
            <button class="btn-undo-simple" title="Desfazer bipagem">
              <i class="bi bi-arrow-counterclockwise"></i> DESFAZER
            </button>
          </div>
        </div>
        <div class="image-container">
          <img
            src="${urlImg}"
            alt="Imagem do Produto"
            onerror="this.onerror=null;this.src='https://via.placeholder.com/80?text=Sem+Img';"
          />
        </div>
      </div>
      <div class="card-number">${boxNum}</div>
    </div>
  `;

  // Associa evento de desfazer
  const btn = area.querySelector(".btn-undo-simple");
  if (btn) btn.addEventListener("click", undoLastBipagem);
}

function renderProgressoConferencia() {
  let total = 0;
  let bipado = 0;

  Object.values(caixas).forEach(({ total: t, bipado: b }) => {
    total += t;
    bipado += b;
  });

  const perc = total > 0 ? Math.round((bipado / total) * 100) : 0;
  const barra = document.getElementById("progressoConferencia");

  if (barra) {
    barra.style.width = `${perc}%`;
    barra.setAttribute("aria-valuenow", perc);
    barra.textContent = `${perc}% (${bipado}/${total})`;
  }
}

// delega o clique no botão “undo”
document.getElementById("cardAtual").addEventListener("click", (e) => {
  if (e.target.closest("#btnUndo")) {
    undoLastBipagem();
  }
});

async function undoLastBipagem() {
  if (!currentProduto?.id) return alert("Nada para desfazer");
  const {
    id,
    sku,
    pedido,
    endereco,
    descricao,
    box: freedBox,
  } = currentProduto;

  // 1) decrementa no Supabase
  const { data: before, error: selErr } = await supabase
    .from("produtos_pedido")
    .select("qtd, qtd_bipada")
    .eq("id", id)
    .single();
  if (selErr) return alert("Erro ao ler bipagem.");

  const novaQtdBipada = Math.max(0, (before.qtd_bipada || 0) - 1);
  const payload = { qtd_bipada: novaQtdBipada };
  if (novaQtdBipada === 0) payload.box = null;

  const { error: updErr } = await supabase
    .from("produtos_pedido")
    .update(payload)
    .eq("id", id);
  if (updErr) return alert("Erro ao desfazer bipagem.");

  // 2) recarrega o row para pegar o qtd original e o novo qtd_bipada
  const { data: after, error: afterErr } = await supabase
    .from("produtos_pedido")
    .select("qtd, qtd_bipada")
    .eq("id", id)
    .single();
  if (afterErr) return alert("Erro ao recarregar bipagem.");

  const restante = (after.qtd || 0) - (after.qtd_bipada || 0);

  // 3) ajusta o objeto de caixas e contador de box
  const info = caixas[pedido];
  if (info) {
    info.bipado = after.qtd_bipada;
    if (info.bipado === 0) {
      delete caixas[pedido];
      setContadorBox(freedBox);
    }
  }

  // 4) atualiza o array de pendentes — SEMPRE com o valor recalc
  const idx = pendentes.findIndex((p) => p.sku === sku && p.pedido === pedido);
  if (restante > 0) {
    if (idx > -1) {
      pendentes[idx].qtd = restante;
    } else {
      pendentes.push({ sku, pedido, qtd: restante, endereco, descricao });
    }
  } else if (idx > -1) {
    // se não restaram unidades, remove a linha
    pendentes.splice(idx, 1);
  }

  // 5) histórico e persistência
  const histIdx = historico.findIndex((h) => h.id === currentProduto.id);

  if (histIdx > -1) {
    historico.splice(histIdx, 1);
  }
  localStorage.setItem(`pendentes-${romaneio}`, JSON.stringify(pendentes));
  localStorage.setItem(`caixas-${romaneio}`, JSON.stringify(caixas));
  localStorage.setItem(`historico-${romaneio}`, JSON.stringify(historico));

  // 6) rerender
  renderPendentes();
  renderBoxCards();
  renderHistorico();
  renderProgressoConferencia();

  // 7) limpa card atual e ajusta ponteiro
  document.getElementById("cardAtual").innerHTML = "";
  currentProduto = historico.length ? historico[historico.length - 1] : null;
}

async function carregarBipagemAnterior(romaneio) {
  // limpa o card atual e zera o ponteiro para evitar push indevido no histórico
  currentProduto = null;
  const cardAtual = document.getElementById("cardAtual");
  if (cardAtual) cardAtual.innerHTML = "";

  // 1) fetch de pedidos
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id")
    .eq("romaneio", romaneio);

  // 2) reset estado
  caixas = {};
  historico = [];
  pendentes = [];

  const pedidoIds = pedidos.map((p) => p.id);

  await carregarCodNfeMap(pedidoIds);

  // 3) fetch de produtos
  const { data: produtos } = await supabase
    .from("produtos_pedido")
    .select("pedido_id,sku,qtd,qtd_bipada,box,endereco,descricao")
    .in("pedido_id", pedidoIds);

  // 4) montar caixas, histórico e pendentes
  produtos.forEach((p) => {
    const qtdBip = p.qtd_bipada || 0;

    // cria a entrada de caixa somente uma vez
    if (!caixas[p.pedido_id]) {
      caixas[p.pedido_id] = {
        box: p.box != null ? p.box : null,
        bipado: 0,
        total: 0,
      };
    }

    // só atualiza box se existir
    if (p.box != null) {
      caixas[p.pedido_id].box = p.box;
    }

    // acumula totais
    caixas[p.pedido_id].total += p.qtd;
    caixas[p.pedido_id].bipado += qtdBip;

    // histórico
    if (qtdBip > 0) {
      historico.push({
        sku: p.sku,
        pedido: p.pedido_id,
        box: caixas[p.pedido_id].box,
      });
    }

    // pendentes (sempre decrementar 1 por bipagem)
    const restante = p.qtd - qtdBip;
    if (restante > 0) {
      pendentes.push({
        sku: p.sku,
        pedido: p.pedido_id,
        qtd: restante,
        endereco: p.endereco,
        descricao: p.descricao,
      });
    }
  });

  // 5) persiste no localStorage
  localStorage.setItem(`caixas-${romaneio}`, JSON.stringify(caixas));
  localStorage.setItem(`historico-${romaneio}`, JSON.stringify(historico));
  localStorage.setItem(`pendentes-${romaneio}`, JSON.stringify(pendentes));

  // 6) acerta o próximo número de box
  const numeros = Object.values(caixas)
    .map((c) => parseInt(c.box, 10))
    .filter((n) => !isNaN(n));
  setContadorBox(numeros.length ? Math.max(...numeros) + 1 : 1);

  // 7) renderiza de fato os boxes e listas
  renderBoxCards();
  renderHistorico();
  renderPendentes();
  renderProgressoConferencia();
}

document.getElementById("btnIniciar").addEventListener("click", async () => {
  const input = document.getElementById("romaneioInput");
  romaneio = input.value.trim();
  if (!romaneio) return alert("Digite o romaneio");

  const status = await verificarRomaneioEmUso(romaneio);
  if (status.emUso) {
    alert(`Este romaneio está em uso por: ${status.por}`);
    return;
  }

  // 1) buscar todos os produtos desse romaneio
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id")
    .eq("romaneio", romaneio);
  const pedidoIds = pedidos.map((p) => p.id);

  await carregarCodNfeMap(pedidoIds);

  const { data: produtos } = await supabase
    .from("produtos_pedido")
    .select("sku")
    .in("pedido_id", pedidoIds);

  // 2) extrair lista única de SKUs
  const skus = Array.from(
    new Set(produtos.map((p) => p.sku?.trim().toUpperCase()).filter(Boolean))
  );

  // 3) carregar só as refs desses SKUs
  await carregarRefs(skus);

  // 4) agora sim carrega o restante do estado
  await carregarBipagemAnterior(romaneio);

  // limpa o cartão antes de liberar o bipar
  currentProduto = null;
  document.getElementById("cardAtual").innerHTML = "";

  // depois segue com o unlock dos campos, focus etc.
  document.getElementById("skuInput").parentElement.classList.remove("d-none");

  await carregarBipagemAnterior(romaneio);

  document.getElementById("skuInput").parentElement.classList.remove("d-none");
  document.getElementById("btnFinalizar").classList.remove("d-none");
  document.getElementById("btnLimparRomaneio").classList.remove("d-none");
  document
    .getElementById("listaHistorico")
    .parentElement.classList.remove("d-none");
  document
    .getElementById("boxContainer")
    .parentElement.parentElement.classList.remove("d-none");

  input.disabled = true;
  document.getElementById("btnIniciar").disabled = true;
  document.getElementById("skuInput").focus();

  await carregarBipagemAnterior(romaneio);
});

document.getElementById("btnBipar").addEventListener("click", async () => {
  const inputSKU = document.getElementById("skuInput");
  const btnBipar = document.getElementById("btnBipar");
  const sku = inputSKU.value.trim();

  // 1) aborta se não houver SKU ou romaneio ativo
  if (!sku || !romaneio) return;

  // 2) desabilita enquanto processa
  inputSKU.disabled = true;
  btnBipar.disabled = true;

  // 3) executa bipagem e renderiza o card
  const result = await biparProduto(sku, romaneio);
  renderCardProduto(result);

  if (result.status === "ok") {
    // 4) só no sucesso empurra o currentProduto anterior para o histórico
    if (currentProduto) {
      historico.push(currentProduto);
      localStorage.setItem(`historico-${romaneio}`, JSON.stringify(historico));
    }

    // 5) registra o novo produto atual
    currentProduto = {
      id: result.id,
      sku: result.sku,
      pedido: result.pedido_id,
      box: result.box,
      endereco: result.endereco,
      descricao: result.descricao,
    };

    // 6) atualiza o estado de “caixas”
    if (!caixas[currentProduto.pedido]) {
      caixas[currentProduto.pedido] = {
        box: currentProduto.box,
        bipado: 0,
        total: result.total,
      };
    }
    caixas[currentProduto.pedido].box = currentProduto.box;
    caixas[currentProduto.pedido].bipado += 1;

    // 7) atualiza “pendentes”
    const idx = pendentes.findIndex(
      (p) => p.sku === currentProduto.sku && p.pedido === currentProduto.pedido
    );
    if (idx > -1) {
      pendentes[idx].qtd -= 1;
      if (pendentes[idx].qtd <= 0) {
        pendentes.splice(idx, 1);
      }
    } // ← fechei o if(idx > -1) aqui

    // 8) persiste no localStorage
    localStorage.setItem(`caixas-${romaneio}`, JSON.stringify(caixas));
    localStorage.setItem(`pendentes-${romaneio}`, JSON.stringify(pendentes));

    // 9) rerenderiza a UI
    renderBoxCards();
    renderPendentes();
    renderHistorico();
    renderProgressoConferencia();
  } else {
    // 10) em caso de erro, zera para não poluir o histórico
    currentProduto = null;
  }

  // 11) restaura o input e o foco
  inputSKU.value = "";
  inputSKU.disabled = false;
  btnBipar.disabled = false;
  inputSKU.focus();
});

document.getElementById("btnFinalizar").addEventListener("click", async () => {
  const confirmacao = confirm("Finalizar e atualizar o banco de dados?");
  if (!confirmacao) return;

  for (const pedido in caixas) {
    const { box } = caixas[pedido];
    await supabase
      .from("produtos_pedido")
      .update({ box })
      .eq("pedido_id", parseInt(pedido));
  }

  await supabase.from("romaneios_em_uso").delete().eq("romaneio", romaneio);

  localStorage.removeItem(`historico-${romaneio}`);
  localStorage.removeItem(`caixas-${romaneio}`);

  document.getElementById("romaneioInput").value = "";
  document.getElementById("romaneioInput").disabled = false;
  document.getElementById("btnIniciar").disabled = false;
  document.getElementById("btnFinalizar").classList.add("d-none");
  document.getElementById("btnLimparRomaneio").classList.add("d-none");
  document.getElementById("cardAtual").innerHTML = "";
  document.getElementById("boxContainer").innerHTML = "";
  document.getElementById("listaHistorico").innerHTML = "";
  document.getElementById("feedback").innerHTML = "";

  caixas = {};
  historico = [];
  romaneio = "";
  renderProgressoConferencia();
});

document
  .getElementById("btnLimparRomaneio")
  .addEventListener("click", async () => {
    if (!romaneio) return;
    if (!confirm("Apagar toda bipagem deste romaneio?")) return;

    // 1) Atualiza o banco
    const { data: pedidos } = await supabase
      .from("pedidos")
      .select("id")
      .eq("romaneio", romaneio);
    const pedidoIds = pedidos.map((p) => p.id);

    await supabase
      .from("produtos_pedido")
      .update({ qtd_bipada: 0, box: null })
      .in("pedido_id", pedidoIds);

    // 2) Recarrega todo o estado da tela:
    await carregarBipagemAnterior(romaneio);

    pendentes = [];
    localStorage.setItem(`pendentes-${romaneio}`, JSON.stringify(pendentes));

    const listaPendentesEl = document.getElementById("listaPendentes");
    if (listaPendentesEl) listaPendentesEl.innerHTML = "";

    await supabase.from("romaneios_em_uso").delete().eq("romaneio", romaneio);

    romaneio = "";
    const romaneioInput = document.getElementById("romaneioInput");
    if (romaneioInput) {
      romaneioInput.value = "";
      romaneioInput.disabled = false;
    }

    // 3) Destrava o input de romaneio
    document.getElementById("romaneioInput").disabled = false;
    document.getElementById("btnIniciar").disabled = false;

    document.getElementById("romaneioInput").focus();
    renderProgressoConferencia();
  });

document.getElementById("btnPrintPendentes")?.addEventListener("click", () => {
  const operadorLogado = operador || "Desconhecido";
  const romaneioAtivo = romaneio || "Não informado";
  const dataHoraAtual = new Date().toLocaleString("pt-BR");

  if (!Array.isArray(pendentes) || pendentes.length === 0) {
    return alert("Nenhum pendente encontrado.");
  }

  // Filtra os pendentes com endereço válido
  const comEndereco = pendentes.filter((p) => {
    if (!p.endereco || typeof p.endereco !== "string") return false;
    const primeiro = p.endereco.split("•")[0]?.trim();
    return primeiro && primeiro.toUpperCase() !== "SEM LOCAL";
  });

  if (comEndereco.length === 0) {
    return alert("Nenhum pendente com endereço válido encontrado.");
  }

  // Agrupar por SKU somando a quantidade e guardando o primeiro endereço
  const agrupado = {};
  comEndereco.forEach(({ sku, qtd, endereco }) => {
    const primeiroEndereco = (endereco || "").split("•")[0]?.trim();
    if (!agrupado[sku]) {
      agrupado[sku] = { qtd: 0, endereco: primeiroEndereco };
    }
    agrupado[sku].qtd += qtd;
  });

  // Gera e ordena os dados agrupados por endereço
  const linhas = Object.entries(agrupado)
    .sort((a, b) => {
      const enderecoA = a[1].endereco?.toUpperCase() || "";
      const enderecoB = b[1].endereco?.toUpperCase() || "";
      return enderecoA.localeCompare(enderecoB);
    })
    .map(
      ([sku, { qtd, endereco }]) => `
      <tr>
        <td>${sku}</td>
        <td>${qtd}</td>
        <td>${endereco}</td>
      </tr>
    `
    )
    .join("");

  // Gera o HTML para impressão
  const htmlImpressao = `
    <html>
      <head>
        <title>Pendentes com Endereço</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          h2 { margin-bottom: 10px; }
          .info { margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #f0f0f0; }
        </style>
      </head>
      <body>
        <h2>Lista de Pendentes com Endereço</h2>
        <div class="info">
          <strong>Operador:</strong> ${operadorLogado}<br/>
          <strong>Romaneio:</strong> ${romaneioAtivo}<br/>
          <strong>Data:</strong> ${dataHoraAtual}
        </div>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Quantidade</th>
              <th>Endereço</th>
            </tr>
          </thead>
          <tbody>
            ${linhas}
          </tbody>
        </table>
        <script>
          window.onload = () => { window.print(); window.close(); }
        </script>
      </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(htmlImpressao);
    win.document.close();
  }
});

document.getElementById("btnPrintBoxes")?.addEventListener("click", () => {
  const operadorLogado = operador || "Desconhecido";
  const romaneioAtivo = romaneio || "Não informado";
  const dataHoraAtual = new Date().toLocaleString("pt-BR");

  const boxList = Object.entries(caixas)
    .filter(([_, info]) => info?.box && info.total > 0)
    .map(([_, info]) => ({
      box: info.box,
      total: info.total,
      bipado: info.bipado,
      status: info.pesado
        ? "Pesado"
        : info.bipado >= info.total
        ? "Completo"
        : "Incompleto",
    }));

  if (boxList.length === 0) {
    return alert("Nenhum box encontrado para impressão.");
  }

  const agrupado = {};
  boxList.forEach(({ box, total, bipado, status }) => {
    agrupado[box] = { total, bipado, status };
  });

  const ordenados = Object.entries(agrupado)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .slice(0, 50);

  const colEsq = ordenados.slice(0, 25);
  const colDir = ordenados.slice(25, 50);

  let linhas = "";

  for (let i = 0; i < 25; i++) {
    const b1 = colEsq[i];
    const b2 = colDir[i];

    const col1 = b1
      ? `<td><strong style="color:white;">${b1[0]}</strong></td><td><strong>${b1[1].bipado}/${b1[1].total}</strong></td><td>${b1[1].status}</td>`
      : "<td></td><td></td><td></td>";

    const col2 = b2
      ? `<td><strong style="color:white;">${b2[0]}</strong></td><td><strong>${b2[1].bipado}/${b2[1].total}</strong></td><td>${b2[1].status}</td>`
      : "<td></td><td></td><td></td>";

    linhas += `<tr>${col1}<td class="spacer"></td>${col2}</tr>`;

    // Quebra visual a cada 5 linhas
    if ((i + 1) % 5 === 0) {
      linhas += `<tr style="height:10px;"><td colspan="7" style="border:none;"></td></tr>`;
    }
  }

  const html = `
    <html>
      <head>
        <title>Resumo de Boxes</title>
        <style>
          body { font-family: sans-serif; padding: 20px; margin: 0; }
          .info { margin-bottom: 16px; }
          h2 { margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: center; }
          th { background-color: #000; color: white; font-weight: bold; }
          td.spacer { border: none; width: 20px; }
          @media print {
            body { margin: 0; }
            tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h2>Resumo de Boxes</h2>
        <div class="info">
          <strong>Operador:</strong> ${operadorLogado}<br/>
          <strong>Romaneio:</strong> ${romaneioAtivo}<br/>
          <strong>Data:</strong> ${dataHoraAtual}
        </div>
        <table>
          <thead>
            <tr>
              <th>Box</th><th>Qtd.</th><th>Status</th>
              <td class="spacer"></td>
              <th>Box</th><th>Qtd.</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${linhas}
          </tbody>
        </table>
        <script>window.onload = () => { window.print(); window.close(); }</script>
      </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
});

function renderProductMap() {
  const gallery = document.getElementById("productGallery");
  if (!gallery) {
    console.warn(
      "⚠️ renderProductMap: elemento #productGallery não encontrado"
    );
    return;
  }
  gallery.innerHTML = "";
  Object.entries(imagensRef).forEach(([sku, urlImg]) => {
    const card = document.createElement("div");
    card.className = "card card-produto p-2";
    card.style.width = "120px";
    card.innerHTML = `
      <img
        src="${urlImg}"
        alt="SKU ${sku}"
        class="img-produto mb-1"
        style="width:100%;height:auto;"
        onerror="this.onerror=null;this.src='https://via.placeholder.com/70?text=Sem+Imagem';"
      />
      <div class="text-center small"><strong>${sku}</strong></div>
    `;
    gallery.appendChild(card);
  });
}
