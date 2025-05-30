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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 10;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Cabeçalho
  doc.setFillColor(0, 0, 0);
  doc.setTextColor(255);
  doc.rect(margin, margin, pageWidth - 2 * margin, 10, "F");
  doc.text("RESUMO DE BOXES", pageWidth / 2, margin + 7, { align: "center" });

  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.text(`ROMANEIO: ${romaneio}`, margin, margin + 16);
  doc.text(
    `DATA: ${new Date().toLocaleDateString()}`,
    pageWidth - margin - 30,
    margin + 16
  );

  const { data: pedidosData } = await supabase
    .from("pedidos")
    .select("id, cliente")
    .eq("romaneio", romaneio);

  const clienteMap = {};
  pedidosData.forEach((p) => (clienteMap[p.id] = p.cliente || "-"));

  const body = [];

  Object.entries(caixas)
    .slice(0, 50)
    .forEach(([pedido, info]) => {
      const cliente = clienteMap[pedido] || "-";
      const qtde = info.total || 0;
      const bipado = info.bipado || 0;

      let status = "❌ Incompleto";
      let color = "red";

      if (info.pesado) {
        status = "✔️ Pesado";
        color = "blue";
      } else if (bipado >= qtde && qtde > 0) {
        status = "🟩 Completo";
        color = "green";
      }

      body.push([
        pedido,
        cliente,
        `${bipado}`,
        `${qtde}`,
        { content: status, styles: { textColor: color } },
      ]);
    });

  autoTable(doc, {
    startY: margin + 20,
    head: [["Pedido", "Cliente", "Qtde bipada", "Qtde total", "Status"]],
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [0, 0, 0], textColor: 255, halign: "center" },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 50 },
      2: { cellWidth: 25, halign: "center" },
      3: { cellWidth: 25, halign: "center" },
      4: { cellWidth: 40, halign: "center" },
    },
  });

  // Página 2 – Pendentes
  doc.addPage("a4", "portrait");
  doc.setFontSize(14);
  doc.text("Relatório de NL", pageWidth / 2, margin, { align: "center" });

  const pedidosMap = {};
  pendentes.forEach((p) => {
    const cliente = clienteMap[p.pedido] || "-";
    const linha = [p.pedido, cliente, p.descricao || "-", p.sku, p.qtd, "", ""];
    if (!pedidosMap[p.pedido]) pedidosMap[p.pedido] = [];
    pedidosMap[p.pedido].push(linha);
  });

  const linhasNL = Object.values(pedidosMap).flat();

  autoTable(doc, {
    head: [
      [
        "Pedido",
        "Cliente",
        "Desc. Produto",
        "SKU",
        "Qtde.",
        "Completo",
        "Finalizando",
      ],
    ],
    body: linhasNL,
    startY: margin + 5,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [0, 0, 0], textColor: 255, halign: "center" },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 40 },
      2: { cellWidth: 85 },
      3: { cellWidth: 25 },
      4: { cellWidth: 10 },
      5: { cellWidth: 20 },
      6: { cellWidth: 20 },
    },
  });

  doc.save(`romaneio_${romaneio}_resumo.pdf`);
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
      const { bipado, total, pedidos, codNfes, pedidosPesados } =
        agrupado[boxNum];
      const pedidoRef = pedidos[0];
      const codNfe = codNfes[0] || "";
      const isPesado = pedidos.every((p) => caixas[p]?.pesado);

      let light, solid;
      if (isPesado) {
        light = "bg-primary-subtle text-dark"; // azul claro
        solid = "bg-primary text-white"; // azul forte
      } else if (bipado >= total) {
        light = "bg-success-subtle text-dark";
        solid = "bg-success text-white";
      } else {
        light = "bg-danger-subtle text-dark";
        solid = "bg-danger text-white";
      }

      const wrapper = document.createElement("div");
      wrapper.className = "box-wrapper";

      const infoCard = document.createElement("div");
      infoCard.className = `info-card ${light}`;
      infoCard.innerHTML = `
        <strong class="fs-6 d-block text-center">${pedidoRef}</strong>
        <small class="d-block text-center">
          <span class="badge bg-dark">${bipado}/${total}</span>
        </small>
        <div class="text-center mt-2">
          <button class="btn-undo-simple btn-transparent btn-pesar" data-pedido="${pedidoRef}" data-codnfe="${codNfe}">
            <i class="bi bi-balance-scale"></i> PESAR PEDIDO
          </button>
        </div>
      `;
      wrapper.appendChild(infoCard);

      const numCard = document.createElement("div");
      numCard.className = `number-card ${solid}`;
      numCard.innerHTML = `<strong>${boxNum}</strong>`;
      wrapper.appendChild(numCard);

      boxContainer.appendChild(wrapper);
    });

  // Delegação: adicionar evento aos botões de pesar
  boxContainer.querySelectorAll(".btn-pesar").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const pedido = btn.dataset.pedido;
      const codNfe = btn.dataset.codnfe;

      // Marca como pesado
      if (caixas[pedido]) {
        caixas[pedido].pesado = true;
        localStorage.setItem(`caixas-${romaneio}`, JSON.stringify(caixas));
        renderBoxCards();
      }

      // Abre o link
      window.open(
        `https://ge.kaisan.com.br/index2.php?page=meta/view&id_view=nfe_pedido_conf&acao_view=cadastra&cod_del=${codNfe}&where=cod_nfe_pedido=${codNfe}#prodweightsomaproduto`,
        "_blank"
      );
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

    const badgeEnderecos = enderecos
      .map((end) => {
        let badgeClass = "bg-info text-dark";
        let badgeIcon = "📦";

        if (end === "SEM LOCAL") {
          badgeClass = "bg-danger";
          badgeIcon = "❌";
        } else if (end.toUpperCase() === "PRÉ-VENDA") {
          badgeClass = "bg-warning text-dark";
          badgeIcon = "⏳";
        }

        return `<span class="badge ${badgeClass} badge-endereco me-1" title="${end}">${badgeIcon} ${end}</span>`;
      })
      .join("");

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${sku || "SEM SKU"}</td>
      <td><span class="badge bg-dark">${qtd}</span></td>
      <td>${pedido || "-"}</td>
      <td>${badgeEnderecos}</td>
    `;
    tbody.appendChild(row);
  });

  lista.appendChild(table);
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
