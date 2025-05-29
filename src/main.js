import { biparProduto } from "./components/bipagemHandler.js";
import { supabase } from "./api/supabase.js";
import { setContadorBox } from "./utils/box.js";

let romaneio = "";
let historico = [];
let caixas = {};
let imagensRef = {};
let codNfeMap = {};
let pendentes = [];

async function carregarRefs() {
  const { data, error } = await supabase
    .from("produtos_ref")
    .select("sku, imagem");

  if (!error && data) {
    imagensRef = Object.fromEntries(
      data.map((item) => [item.sku, item.imagem])
    );
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await carregarRefs();

  document.getElementById("romaneioInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      document.getElementById("btnIniciar").click();
    }
  });

  document.getElementById("skuInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      document.getElementById("btnBipar").click();
    }
  });
});

function renderBoxCards() {
  const boxContainer = document.getElementById("boxContainer");
  boxContainer.innerHTML = "";

  Object.entries(caixas)
    .filter(([, info]) => info.bipado > 0)
    .sort(([, a], [, b]) => {
      const numA = parseInt((a.box || "").replace(/\D/g, ""), 10);
      const numB = parseInt((b.box || "").replace(/\D/g, ""), 10);
      return numA - numB;
    })
    .forEach(([pedido, info]) => {
      const statusClass =
        info.bipado >= info.total
          ? "bg-success-subtle text-dark"
          : "bg-danger-subtle text-dark";
      const codNfe = codNfeMap[pedido] || "";
      const linkBalc = `https://ge.kaisan.com.br/index2.php?page=meta/view&id_view=nfe_pedido_conf&acao_view=cadastra&cod_del=${codNfe}&where=cod_nfe_pedido=${pedido}`;

      const col = document.createElement("div");
      col.className = "col-6 col-md-4 col-lg-2";
      col.innerHTML = `
        <div class="card box-card text-center p-2 ${statusClass}">
          <strong>${pedido}</strong>
          <div class="badge bg-light text-dark my-2">${info.box}</div>
          <div class="fw-bold mb-1">${info.bipado}/${info.total}</div>
          <a href="${linkBalc}" target="_blank" class="emoji text-dark text-decoration-none">⚖️</a>
        </div>`;
      boxContainer.appendChild(col);
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
        <span class="badge bg-success">${item.box}</span>
      `;
      lista.appendChild(li);
    });
}

function renderPendentes() {
  const lista = document.getElementById("listaPendentes");
  if (!lista) return;
  lista.innerHTML = "";

  const agrupados = {};
  pendentes.forEach(({ sku, pedido, qtd, endereco }) => {
    const key = sku || "SEM SKU";
    if (!agrupados[key]) {
      agrupados[key] = { sku: key, qtd: 0, enderecos: new Set() };
    }
    agrupados[key].qtd += qtd;
    agrupados[key].enderecos.add(endereco || "SEM LOCAL");
  });

  const listaOrdenada = Object.values(agrupados).sort((a, b) => {
    const isAsemLocal = [...a.enderecos].some((e) => e.includes("SEM LOCAL"));
    const isBsemLocal = [...b.enderecos].some((e) => e.includes("SEM LOCAL"));
    if (isAsemLocal && !isBsemLocal) return 1;
    if (!isAsemLocal && isBsemLocal) return -1;

    const ea = [...a.enderecos][0].match(/\d+/g)?.map(Number) || [];
    const eb = [...b.enderecos][0].match(/\d+/g)?.map(Number) || [];
    for (let i = 0; i < Math.max(ea.length, eb.length); i++) {
      const diff = (ea[i] || 0) - (eb[i] || 0);
      if (diff !== 0) return diff;
    }
    return a.sku.localeCompare(b.sku);
  });

  listaOrdenada.forEach((item) => {
    const li = document.createElement("li");
    li.className = "list-group-item small";
    li.innerHTML = `<strong>SKU:</strong> ${
      item.sku
    } | <strong>Qtde:</strong> ${item.qtd} | <strong>Endereço:</strong> ${[
      ...item.enderecos,
    ].join(" • ")}`;
    lista.appendChild(li);
  });
}

function renderCardProduto(result) {
  const area = document.getElementById("cardAtual");
  if (result.status === "erro") {
    area.innerHTML = `
      <div class="card card-erro p-3 mb-3">
        ❌ ${result.msg}
      </div>`;
    return;
  }

  const imagemURL = imagensRef[result.sku] || "https://via.placeholder.com/100";

  area.innerHTML = `
    <div class="card card-produto p-3 mb-3 d-flex flex-row align-items-center justify-content-between">
      <div>
        <div><strong>SKU:</strong> ${result.sku}</div>
        <div><strong>Pedido:</strong> ${result.pedido_id}</div>
      </div>
      <div>
        <img src="${imagemURL}" alt="Imagem do Produto" class="img-produto" />
      </div>
      <div>
        <span class="badge bg-primary fs-1">${result.box}</span>
      </div>
    </div>`;
}

async function carregarBipagemAnterior(romaneio) {
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id")
    .eq("romaneio", romaneio);

  caixas = JSON.parse(localStorage.getItem(`caixas-${romaneio}`)) || {};
  historico = [];
  pendentes = [];

  const pedidoIds = pedidos.map((p) => p.id);

  const { data: produtos } = await supabase
    .from("produtos_pedido")
    .select("pedido_id, sku, qtd, qtd_bipada, box, endereco")
    .in("pedido_id", pedidoIds);

  const { data: nfeData } = await supabase
    .from("pedidos_nfe")
    .select("pedido_id, cod_nfe")
    .in("pedido_id", pedidoIds);

  codNfeMap = {};
  nfeData?.forEach((item) => {
    codNfeMap[item.pedido_id] = item.cod_nfe;
  });

  produtos.forEach((p) => {
    if ((p.qtd_bipada === 0 || !p.box) && p.qtd > 0) {
      pendentes.push({
        sku: p.sku,
        pedido: p.pedido_id,
        qtd: p.qtd,
        endereco: p.endereco || "SEM LOCAL",
      });
    }

    if (!caixas[p.pedido_id]) {
      caixas[p.pedido_id] = { box: p.box, bipado: 0, total: 0 };
    }

    caixas[p.pedido_id].box = p.box;
    caixas[p.pedido_id].total += p.qtd;
    caixas[p.pedido_id].bipado += p.qtd_bipada;

    if (p.qtd_bipada > 0) {
      historico.push({ sku: p.sku, box: p.box, pedido: p.pedido_id });
    }
  });

  localStorage.setItem(`historico-${romaneio}`, JSON.stringify(historico));
  localStorage.setItem(`caixas-${romaneio}`, JSON.stringify(caixas));

  const maioresNumeros = Object.values(caixas)
    .map((c) => parseInt((c.box || "").replace(/\D/g, ""), 10))
    .filter((n) => !isNaN(n));
  const maior = Math.max(0, ...maioresNumeros);
  setContadorBox(maior + 1);

  renderBoxCards();
  renderHistorico();
  renderPendentes();
}

document.getElementById("btnIniciar").addEventListener("click", async () => {
  const input = document.getElementById("romaneioInput");
  romaneio = input.value.trim();
  if (!romaneio) return alert("Digite o romaneio");

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
  const btn = document.getElementById("btnBipar");
  const sku = inputSKU.value.trim();
  if (!sku || !romaneio) return;

  inputSKU.disabled = true;
  btn.disabled = true;

  const result = await biparProduto(sku, romaneio);
  renderCardProduto(result);

  if (result.status === "ok") {
    historico.push({
      sku: result.sku,
      box: result.box,
      pedido: result.pedido_id,
    });
    localStorage.setItem(`historico-${romaneio}`, JSON.stringify(historico));
    renderHistorico();

    document.getElementById("listaHistorico").classList.remove("d-none");

    if (!caixas[result.pedido_id]) {
      caixas[result.pedido_id] = {
        box: result.box,
        bipado: 1,
        total: result.total,
      };
    } else {
      caixas[result.pedido_id].bipado += 1;
    }

    localStorage.setItem(`caixas-${romaneio}`, JSON.stringify(caixas));
    renderBoxCards();
  }

  inputSKU.value = "";
  inputSKU.disabled = false;
  btn.disabled = false;
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

    const confirmacao = confirm(
      "Tem certeza que deseja apagar toda bipagem deste romaneio?"
    );
    if (!confirmacao) return;

    setContadorBox(1);

    const { data: pedidos } = await supabase
      .from("pedidos")
      .select("id")
      .eq("romaneio", romaneio);

    const pedidoIds = pedidos.map((p) => p.id);

    const { error } = await supabase
      .from("produtos_pedido")
      .update({ qtd_bipada: 0, box: null })
      .in("pedido_id", pedidoIds);

    if (error) {
      alert("Erro ao limpar romaneio.");
      return;
    }

    caixas = {};
    historico = [];
    localStorage.removeItem(`caixas-${romaneio}`);
    localStorage.removeItem(`historico-${romaneio}`);

    document.getElementById("cardAtual").innerHTML = "";
    document.getElementById("boxContainer").innerHTML = "";
    document.getElementById("listaHistorico").innerHTML = "";
    document.getElementById("feedback").textContent =
      "✅ Bipagem limpa com sucesso.";
  });
