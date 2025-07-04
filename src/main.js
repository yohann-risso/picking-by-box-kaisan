import { biparProduto } from "./components/bipagemHandler.js";
import { supabase } from "./services/supabase.js";
import { setContadorBox } from "./utils/box.js";

let romaneio = "";
let historico = [];
let caixas = {};
let imagensRef = {};
let codNfeMap = {};
let pendentes = [];
let currentProduto = null;
let operador1 = null;
let operador2 = null;
let etapaLogin = 1;

let btnProximaEtapa = null;
let btnFinalizarRomaneio = null;
let etapas = ["003", "005", "006"];
let etapaAtualIndex = 0;
let inicioEtapa = null;
let timerEtapa = null;
let inicioTotal = null;
let timerTotal = null;
let pausado = false;
let totalSegundosIdeal = 0;
let tempoAcumuladoEtapa = 0;
let tempoAcumuladoTotal = 0;
window.pecas = 0;
window.pedidos = 0;
let resumo = [];

let ultimoBoxPesado = null;

// --- Constantes para controle de expiração ---
const EXPIRACAO_MS = 720 * 60 * 1000; // 720 minutos em milissegundos

// --- Função auxiliar para carregar dados salvos, se ainda válidos ---
function carregarLoginSeValido() {
  const storedTime = parseInt(localStorage.getItem("loginTime"), 10);
  const now = Date.now();

  if (!storedTime || isNaN(storedTime)) {
    return false; // não há timestamp válido
  }
  if (now - storedTime > EXPIRACAO_MS) {
    // Expirou: apaga tudo
    localStorage.removeItem("operador1");
    localStorage.removeItem("operador2");
    localStorage.removeItem("loginTime");
    return false;
  }

  // Ainda válido: carrega operadores
  const op1 = localStorage.getItem("operador1");
  const op2 = localStorage.getItem("operador2"); // pode ser null ou undefined
  if (op1) {
    operador1 = op1;
    operador2 = op2;
    window.operador = operador1;
    return true;
  }
  return false;
}

// Assim que a página carregar, decide se abre modal ou mostra o app
window.addEventListener("DOMContentLoaded", () => {
  const dadosValidos = carregarLoginSeValido();

  if (dadosValidos) {
    // Pular o modal e mostrar mainApp
    // Exibe “Operador: X” ou “Operadores: X e Y”
    const display = document.getElementById("operadorLogado");
    if (operador2) {
      display.textContent = `Operadores: ${operador1} e ${operador2}`;
    } else {
      display.textContent = `Operador: ${operador1}`;
    }
    document.getElementById("mainApp").style.display = "block";
  } else {
    // Exibe o modal para novos login(s)
    const loginModal = new bootstrap.Modal(
      document.getElementById("loginModal")
    );
    loginModal.show();
    document.getElementById("inputLoginModal").focus();
  }
});

// Função auxiliar para mostrar/ocultar erro de login
function showLoginError(mostrar) {
  const errorDiv = document.getElementById("loginError");
  errorDiv.style.display = mostrar ? "block" : "none";
}

// Ativa o envio ao pressionar Enter em qualquer campo dentro do form
document.getElementById("loginForm").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("btnLoginModal").click();
  }
});

// Listener do botão “Logar”
document.getElementById("btnLoginModal").addEventListener("click", async () => {
  showLoginError(false);
  const loginInput = document.getElementById("inputLoginModal");
  const senhaInput = document.getElementById("inputSenhaModal");
  const loginValue = loginInput.value.trim();
  const senhaValue = senhaInput.value.trim();

  if (!loginValue || !senhaValue) {
    showLoginError(true);
    return;
  }

  // Validação via Supabase
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("login_usuario", loginValue)
    .eq("senha_usuario", senhaValue)
    .single();

  if (error || !data) {
    // Se falhar no passo 2, permanece em “Login de Operador 2” e mostra erro
    showLoginError(true);
    return;
  }

  if (etapaLogin === 1) {
    operador1 = data.nome_completo || data.login_usuario;
    operador2 = null;
    window.senhaOperador1 = senhaValue; // // sem 2º operador
    finalizeLogin();
  } else {
    // etapaLogin === 2
    operador2 = data.nome_completo || data.login_usuario;
    window.senhaOperador2 = senhaValue;
    finalizeLogin();
  }
});

// Listener do botão “Próximo operador”
document
  .getElementById("btnNextOperator")
  .addEventListener("click", async () => {
    showLoginError(false);
    const loginInput = document.getElementById("inputLoginModal");
    const senhaInput = document.getElementById("inputSenhaModal");
    const loginValue = loginInput.value.trim();
    const senhaValue = senhaInput.value.trim();

    if (!loginValue || !senhaValue) {
      showLoginError(true);
      return;
    }

    // Valida Operador 1
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq("login_usuario", loginValue)
      .eq("senha_usuario", senhaValue)
      .single();

    if (error || !data) {
      showLoginError(true);
      return;
    }

    operador1 = data.nome_completo || data.login_usuario;
    etapaLogin = 2;

    // Atualiza título, limpa campos e desabilita “Próximo operador”
    document.getElementById("loginModalLabel").textContent =
      "Login de Operador 2";
    document.getElementById("inputLoginModal").value = "";
    document.getElementById("inputSenhaModal").value = "";
    document.getElementById("btnNextOperator").disabled = true;
    document.getElementById("inputLoginModal").focus();
  });

// Função que finaliza o login (esconde modal, mostra app e salva timestamp)
function finalizeLogin() {
  // Salva operadores e timestamp no localStorage
  localStorage.setItem("operador1", operador1);
  if (operador2) {
    localStorage.setItem("operador2", operador2);
  } else {
    localStorage.removeItem("operador2");
  }
  localStorage.setItem("loginTime", Date.now().toString());

  window.operador = operador1;
  window.operador2 = operador2 || null;

  // Fecha o modal
  const loginModalEl = document.getElementById("loginModal");
  const loginModal = bootstrap.Modal.getInstance(loginModalEl);
  loginModal.hide();

  // Preenche o display de operadores
  const display = document.getElementById("operadorLogado");
  if (operador2) {
    display.textContent = `Operadores: ${operador1} e ${operador2}`;
  } else {
    display.textContent = `Operador: ${operador1}`;
  }

  // Exibe o mainApp
  document.getElementById("mainApp").style.display = "block";
}

// Logout: limpa tudo e retorna ao modal de login
document.getElementById("btnLogout").addEventListener("click", () => {
  // Limpa variáveis e localStorage
  operador1 = null;
  operador2 = null;
  etapaLogin = 1;
  localStorage.removeItem("operador1");
  localStorage.removeItem("operador2");
  localStorage.removeItem("loginTime");

  // Esconde o mainApp
  document.getElementById("mainApp").style.display = "none";

  // Reset do modal para passo 1
  document.getElementById("loginModalLabel").textContent =
    "Login de Operador 1";
  const loginInput = document.getElementById("inputLoginModal");
  const senhaInput = document.getElementById("inputSenhaModal");
  loginInput.value = "";
  senhaInput.value = "";
  showLoginError(false);

  // Reabilita botão “Próximo operador”
  document.getElementById("btnNextOperator").disabled = false;

  // Mostra o modal novamente
  const loginModal = new bootstrap.Modal(document.getElementById("loginModal"));
  loginModal.show();

  // Foca no campo usuário
  loginInput.focus();
});

async function verificarRomaneioEmUso(romaneio) {
  // 1) tenta ler um registro que já exista para este romaneio
  const { data, error } = await supabase
    .from("romaneios_em_uso")
    .select("*")
    .eq("romaneio", romaneio)
    .single();

  // Se der erro “row not found”, tudo bem—vazou, pois a errado === null e data === null.
  // Se der outro erro, logamos no console:
  if (error && error.code !== "PGRST116") {
    console.error("Erro ao buscar romaneio_em_uso:", error);
  }

  if (data) {
    // já existe registro para este romaneio: se BOTH operadores forem os mesmos,
    // deixamos continuar; caso contrário, bloqueamos.
    const registroOp1 = data.operador1;
    const registroOp2 = data.operador2; // pode ser null

    // comparar exatamente string por string; se for o mesmo duo, permite.
    const mesmoOp1 = registroOp1 === operador1;
    const mesmoOp2 = (registroOp2 || "") === (operador2 || "");
    if (mesmoOp1 && mesmoOp2) {
      // o próprio par de operadores está retornando
      return { emUso: false };
    } else {
      // outro(s) usuário(s) está(ão) usando
      const quemUsa =
        registroOp2 && registroOp2.length
          ? `${registroOp1} e ${registroOp2}`
          : registroOp1;
      return {
        emUso: true,
        por: quemUsa,
      };
    }
  }

  // 2) se não havia registro, inserimos um novo com as duas colunas
  const payload = {
    romaneio,
    operador1: operador1,
    operador2: operador2 || null,
    iniciado_em: nowInBrazilISO(),
  };

  const { error: insertError } = await supabase
    .from("romaneios_em_uso")
    .insert([payload]);

  if (insertError) {
    console.error("Erro ao inserir em romaneios_em_uso:", insertError);
    return { emUso: true, por: "desconhecido" };
  }

  return { emUso: false };
}

function nowInBrazilISO() {
  const date = new Date();
  const offset = -3 * 60; // em minutos
  const localDate = new Date(
    date.getTime() - (date.getTimezoneOffset() - offset) * 60000
  );
  return localDate.toISOString();
}

async function gerarPdfResumo() {
  const operadorLogado =
    operador2 && operador2.length
      ? `${operador1} e ${operador2}`
      : operador1 || "Desconhecido";
  const romaneioAtivo = romaneio || "Não informado";
  const dataHoraAtual = new Date().toLocaleString("pt-BR");

  const boxList = Object.entries(caixas)
    .filter(([_, info]) => info?.box && info.total > 0)
    .map(([pedido, info]) => ({
      box: info.box,
      pedido,
      bipado: info.bipado ?? 0,
      total: info.total ?? 0,
      status: info.pesado
        ? info.bipado < info.total
          ? "Pesado Incompleto"
          : "Pesado"
        : info.bipado >= info.total
        ? "Completo"
        : "Incompleto",
    }));

  const ordenados = boxList
    .sort((a, b) => Number(a.box) - Number(b.box))
    .slice(0, 50);
  const colEsq = ordenados.slice(0, 25);
  const colDir = ordenados.slice(25, 50);

  let boxRows = "";
  for (let i = 0; i < 25; i++) {
    const b1 = colEsq[i];
    const b2 = colDir[i];

    const col1 = b1
      ? `<td><strong>${b1.pedido}</strong></td><td><strong>${b1.bipado}/${b1.total}</strong></td><td>${b1.status}</td>`
      : "<td></td><td></td><td></td>";

    const col2 = b2
      ? `<td><strong>${b2.pedido}</strong></td><td><strong>${b2.bipado}/${b2.total}</strong></td><td>${b2.status}</td>`
      : "<td></td><td></td><td></td>";

    boxRows += `<tr>${col1}<td class="spacer"></td>${col2}</tr>`;
  }

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

  // ⏱️ CALCULA tempos ideal e real com base no resumo
  function converterSegundosParaString(totalSegundos) {
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    const pad2 = (n) => String(n).padStart(2, "0");
    return `${pad2(horas)}:${pad2(minutos)}:${pad2(segundos)}`;
  }

  function calcularTempoTotalCronometro(resumo) {
    if (!Array.isArray(resumo)) return 0;
    return resumo.reduce((acc, etapa) => {
      if (!etapa.tempo) return acc;
      const partes = etapa.tempo.split(":").map(Number);
      if (partes.length !== 3) return acc;
      const [h, m, s] = partes;
      return acc + (h * 3600 + m * 60 + s);
    }, 0);
  }

  const tempoRealSegundos = calcularTempoTotalCronometro(window.resumo || []);
  const tempoReal = converterSegundosParaString(tempoRealSegundos);

  const tempo80Map = { "003": 2.42, "005": 13.376, "006": 17.778 };
  const idealSegundos =
    tempo80Map["003"] * (window.pecas || 0) +
    tempo80Map["005"] * (window.pedidos || 0) +
    tempo80Map["006"] * (window.pedidos || 0);
  const tempoIdeal = converterSegundosParaString(Math.round(idealSegundos));

  // Tabela do cronômetro
  let cronometroRows = "";
  document.querySelectorAll("#tbodyTempoIdeal tr").forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    if (tds.length >= 6) {
      cronometroRows += `
        <tr>
          <td>${tds[0].textContent}</td>
          <td>${tds[1].textContent}</td>
          <td>${tds[2].textContent}</td>
          <td>${tds[3].textContent}</td>
          <td>${tds[4].textContent}</td>
          <td>${tds[5].textContent}</td>
        </tr>`;
    }
  });

  const cronometroHtml = `
    <div class="page-break"></div>
    <h2>Resumo do Cronômetro</h2>
    <div class="info">
      <strong>Operador:</strong> ${operadorLogado}<br/>
      <strong>Romaneio:</strong> ${romaneioAtivo}<br/>
      <strong>Data:</strong> ${dataHoraAtual}<br/>
      <strong>Pedidos:</strong> ${window.pedidos || "-"}<br/>
      <strong>Peças:</strong> ${window.pecas || "-"}<br/>
      <strong>Tempo Ideal Total:</strong> ${tempoIdeal}<br/>
      <strong>Tempo Real Total:</strong> ${tempoReal}<br/>
    </div>
    <table>
      <thead>
        <tr>
          <th>Etapa</th>
          <th>Tempo Ideal</th>
          <th>Início</th>
          <th>Fim</th>
          <th>Executado</th>
          <th>Eficiência</th>
        </tr>
      </thead>
      <tbody>
        ${cronometroRows}
      </tbody>
    </table>
  `;

  // HTML final
  const html = `
    <html>
      <head>
        <title>Resumo de Boxes e NL</title>
        <style>
          body { font-family: sans-serif; padding: 20px; margin: 0; }
          h2 { margin-bottom: 10px; }
          .info { margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: center; }
          th { background-color: #000; color: white; font-weight: bold; }
          td.spacer { border: none; width: 24px; }
          .page-break { page-break-before: always; }
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
              <th>Pedido</th><th>Qtd.</th><th>Status</th>
              <td class="spacer"></td>
              <th>Pedido</th><th>Qtd.</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${boxRows}
          </tbody>
        </table>

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

        ${cronometroHtml}

        <script>window.onload = () => { window.print(); window.close(); }</script>
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
  renderProductMap();

  document
    .getElementById("romaneioInput")
    .addEventListener("input", async (e) => {
      const termo = e.target.value.trim();
      if (termo.length < 2) return;

      const { data, error } = await supabase
        .from("romaneios")
        .select("romaneio")
        .ilike("romaneio", `%${termo}%`)
        .limit(10);

      if (error) {
        console.error("Erro ao buscar sugestões:", error);
        return;
      }

      const datalist = document.getElementById("romaneiosSugeridos");
      if (!datalist) return;
      datalist.innerHTML = "";

      data.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.romaneio;
        datalist.appendChild(option);
      });
    });

  document.getElementById("romaneioInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") document.getElementById("btnIniciar").click();
  });

  document.getElementById("skuInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") document.getElementById("btnBipar").click();
  });

  const resumoSalvo = localStorage.getItem(`etapas-${romaneio}`);
  if (resumoSalvo) {
    try {
      window.resumo = JSON.parse(resumoSalvo);
      calcularETrocarTempos(window.pecas, window.pedidos, window.resumo);
    } catch (e) {
      console.warn("⚠️ Resumo inválido salvo:", e);
    }
  }

  document
    .getElementById("btnRegistrarTodosNL")
    ?.addEventListener("click", registrarTodosPendentesNL);

  document
    .getElementById("btnToggleBoxes")
    .addEventListener("click", toggleBoxes);
  document
    .getElementById("btnGerarPdf")
    .addEventListener("click", gerarPdfResumo);
  document
    .getElementById("btnReimprimirEtiquetasNL")
    ?.addEventListener("click", () => {
      // 🔁 Reusa os dados já salvos no localStorage
      const historicoNL = localStorage.getItem(`etiquetasNL-${romaneio}`);
      if (!historicoNL) {
        alert("❌ Nenhuma etiqueta NL encontrada para este romaneio.");
        return;
      }

      const etiquetas = JSON.parse(historicoNL);
      abrirMultiplasEtiquetasNL(etiquetas);
    });
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
}

function renderBoxCards(pedidosEsperados = []) {
  if (!Array.isArray(pedidosEsperados)) {
    console.warn("⚠️ renderBoxCards chamado sem pedidosEsperados");
    pedidosEsperados = window.pedidosEsperados || [];
  }

  const boxContainer = document.getElementById("boxContainer");
  if (!boxContainer) return;
  boxContainer.innerHTML = "";

  // Agrupar por número da box
  const agrupado = {};
  Object.entries(caixas)
    .filter(([_, info]) => info.box != null)
    .forEach(([pedido, info]) => {
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
    });

  // Renderizar boxes normais
  Object.keys(agrupado)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((boxNum) => {
      const { bipado, total, pedidos, codNfes } = agrupado[boxNum];
      const pedidoRef = pedidos[0];
      const codNfe = codNfes[0] || "";

      const isPesado = pedidos.every((p) => caixas[p]?.pesado);
      const isIncompleto = bipado < total;

      let light, solid;
      if (isPesado && isIncompleto) {
        light = "bg-warning-subtle text-dark";
        solid = "bg-warning text-dark fw-bold";
      } else if (isPesado) {
        light = "bg-primary-subtle text-dark";
        solid = "bg-primary text-white";
      } else if (bipado >= total) {
        light = "bg-success-subtle text-dark";
        solid = "bg-success text-white";
      } else {
        light = "bg-danger-subtle text-dark";
        solid = "bg-danger text-white";
      }

      const shadowColor = solid.includes("primary")
        ? "rgba(13, 110, 253, 0.3)"
        : solid.includes("success")
        ? "rgba(25, 135, 84, 0.3)"
        : solid.includes("warning")
        ? "rgba(255, 193, 7, 0.3)"
        : "rgba(220, 53, 69, 0.3)";

      const botaoHtml = `
        <button class="btn-undo-simple btn-pesar ${solid}" 
                data-box="${boxNum}" 
                data-codnfe="${codNfe}" 
                data-pedidos='${JSON.stringify(pedidos)}' 
                style="border:none;box-shadow:none;" tabindex="0">
          <i class="bi bi-balance-scale"></i> PESAR PEDIDO
        </button>`;

      const wrapper = document.createElement("div");
      wrapper.className = "card-produto";
      wrapper.style.boxShadow = `0 2px 8px ${shadowColor}`;
      wrapper.style.borderRadius = "12px";
      wrapper.style.transition = "all 0.2s ease-in-out";

      const infoCard = document.createElement("div");
      infoCard.className = `card-info ${light}`;
      infoCard.innerHTML = `
        <div class="details text-center w-100">
          <div class="fs-6 fw-bold">${pedidoRef}</div>
          <div>
            <span class="badge bg-dark">${bipado}/${total}</span>
          </div>
          <div class="mt-2">${botaoHtml}</div>
        </div>
      `;
      wrapper.appendChild(infoCard);

      const numCard = document.createElement("div");
      numCard.className = `card-number ${solid}`;
      numCard.innerHTML = `<div>${boxNum}</div>`;
      wrapper.appendChild(numCard);

      boxContainer.appendChild(wrapper);
    });

  // Renderizar pedidos esperados sem box (cinza)
  const pedidosComBox = new Set(
    Object.entries(caixas)
      .filter(([_, info]) => info.box != null)
      .map(([pedido]) => pedido)
  );

  pedidosEsperados
    .filter((pedido) => !pedidosComBox.has(pedido))
    .forEach((pedido) => {
      const info = caixas[pedido] || { bipado: 0, total: 0 };
      const wrapper = document.createElement("div");
      wrapper.className = "card-produto";
      wrapper.style.boxShadow = "0 2px 8px rgba(108, 117, 125, 0.2)";
      wrapper.style.borderRadius = "12px";
      wrapper.style.transition = "all 0.2s ease-in-out";

      const infoCard = document.createElement("div");
      infoCard.className = `card-info bg-secondary-subtle text-dark`;
      infoCard.innerHTML = `
        <div class="details text-center w-100">
          <div class="fs-6 fw-bold">${pedido}</div>
          <div><span class="badge bg-dark">${info.bipado}/${info.total}</span></div>
          <div class="mt-2 small text-muted">Aguardando alocação</div>
        </div>
      `;

      const numCard = document.createElement("div");
      numCard.className = `card-number bg-secondary text-white`;
      numCard.innerHTML = `<div>—</div>`;

      wrapper.appendChild(infoCard);
      wrapper.appendChild(numCard);
      boxContainer.appendChild(wrapper);
    });

  // Reaplica os listeners nos botões de pesar
  document.querySelectorAll(".btn-pesar").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const boxNum = btn.dataset.box;
      window.ultimoBoxPesado = boxNum;

      const codNfe = btn.dataset.codnfe;
      const pedidos = JSON.parse(btn.dataset.pedidos || "[]");

      const incompleta = pedidos.some(
        (pid) => caixas[pid]?.bipado < caixas[pid]?.total
      );
      if (
        incompleta &&
        !confirm(`Box ${boxNum} incompleta. Deseja pesar assim mesmo?`)
      )
        return;

      window.open(
        `https://ge.kaisan.com.br/index2.php?page=meta/view&id_view=nfe_pedido_conf&acao_view=cadastra&cod_del=${codNfe}&where=cod_nfe_pedido=${codNfe}#prodweightsomaproduto`,
        "_blank"
      );

      for (const pid of pedidos) {
        caixas[pid].pesado = true;
        await atualizarStatusPedido(pid, "PESADO");
      }

      localStorage.setItem(`caixas-${romaneio}`, JSON.stringify(caixas));
      await carregarBipagemAnterior(romaneio);
      await gerarResumoVisualRomaneio();
      setTimeout(() => {
        renderBoxCards(pedidosEsperados);
        renderProgressoConferencia();
      }, 200);
    });

    btn.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        btn.click();
      }
    });
  });

  // 🔁 Após renderizar, restaura foco no último botão pressionado
  if (window.ultimoBoxPesado) {
    setTimeout(() => {
      const botoesValidos = Array.from(
        document.querySelectorAll(".btn-pesar")
      ).filter((btn) => {
        const card = btn.closest(".card-produto");
        return (
          card &&
          !card.querySelector(".card-info")?.classList.contains("bg-danger") &&
          !card
            .querySelector(".card-info")
            ?.classList.contains("bg-danger-subtle")
        );
      });

      const btnFoco = botoesValidos.find(
        (btn) => btn.dataset.box === String(window.ultimoBoxPesado)
      );

      if (btnFoco) {
        btnFoco.focus();
        btnFoco.classList.add("foco-destaque");
        setTimeout(() => btnFoco.classList.remove("foco-destaque"), 1500);
        btnFoco.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  }
}

async function atualizarStatusPedido(pedidoId, status) {
  return await supabase.from("pedidos").update({ status }).eq("id", pedidoId);
}

function atualizarBoxIndividual(boxNum) {
  const boxContainer = document.getElementById("boxContainer");
  if (!boxContainer) return;

  // Remove o card existente
  const cards = boxContainer.querySelectorAll(".card-produto");
  const totalPedidosNaBox = Object.values(caixas).filter(
    (info) => String(info.box) === String(boxNum)
  ).length;

  if (totalPedidosNaBox === 0) {
    cards.forEach((card) => {
      const num = card.querySelector(".card-number")?.innerText;
      if (num === String(boxNum)) {
        boxContainer.removeChild(card);
      }
    });
  }

  // Reinsere apenas o card atualizado
  const entradas = Object.entries(caixas).filter(
    ([_, info]) => String(info.box) === String(boxNum)
  );

  if (!entradas.length) return;

  // Simula chamada para criar um novo card (usando parte do renderBoxCards)
  for (const [pedido, info] of entradas) {
    const pedidos = [pedido];
    const codNfe = codNfeMap[pedido] || "";
    const isPesado = pedidosNaBox.every((p) => caixas[p]?.pesado);
    const isIncompleto = info.bipado < info.total;

    let light, solid;
    if (isPesado && isIncompleto) {
      light = "bg-warning-subtle text-dark";
      solid = "bg-warning text-dark fw-bold";
    } else if (isPesado) {
      light = "bg-primary-subtle text-dark";
      solid = "bg-primary text-white";
    } else if (info.bipado >= info.total) {
      light = "bg-success-subtle text-dark";
      solid = "bg-success text-white";
    } else {
      light = "bg-danger-subtle text-dark";
      solid = "bg-danger text-white";
    }

    let botaoHtml = "";
    if (isPesado) {
      botaoHtml = `<button class="btn-undo-simple ${solid}" 
        style="border:none;box-shadow:none;" tabindex="0">
        <i class="bi bi-check-circle-fill"></i> PESADO ✅
      </button>`;
    } else {
      botaoHtml = `<button class="btn-undo-simple btn-pesar ${solid}" 
        data-box="${boxNum}" 
        data-codnfe="${codNfe}" 
        data-pedidos='${JSON.stringify(pedidos)}' 
        style="border:none;box-shadow:none;" tabindex="0">
        <i class="bi bi-balance-scale"></i> PESAR PEDIDO
      </button>`;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "card-produto";
    wrapper.style.boxShadow = `0 2px 8px ${shadowColor}`;
    wrapper.style.borderRadius = "12px";
    wrapper.style.transition = "all 0.2s ease-in-out";
    wrapper.style.order = Number(boxNum);

    const infoCard = document.createElement("div");
    infoCard.className = `card-info ${light}`;
    infoCard.innerHTML = `
      <div class="details text-center w-100">
        <div class="fs-6 fw-bold">${pedido}</div>
        <div>
          <span class="badge bg-dark">${info.bipado}/${info.total}</span>
        </div>
        <div class="mt-2">${botaoHtml}</div>
      </div>`;
    wrapper.appendChild(infoCard);

    const numCard = document.createElement("div");
    numCard.className = `card-number ${solid}`;
    numCard.innerHTML = `<div>${boxNum}</div>`;
    wrapper.appendChild(numCard);

    boxContainer.appendChild(wrapper);
  }
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
        <div class="h2"><span class="badge-box">${item.box}</span></div>
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
    <thead class="table-light" style="text-align: center">
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

    let badgeClass = "badge-endereco badge-endereco-localizado";
    let badgeIcon = "📦";

    if (primeiro === "SEM LOCAL") {
      badgeClass = "badge-endereco badge-endereco-sem-local";
      badgeIcon = "❌";
    } else if (primeiro.toUpperCase() === "PRÉ-VENDA") {
      badgeClass = "badge-endereco badge-endereco-pre-venda";
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

async function registrarTodosPendentesNL() {
  const agrupadoPorPedido = {};

  // Agrupa SKUs pendentes por pedido
  for (const p of pendentes) {
    if (!agrupadoPorPedido[p.pedido]) {
      agrupadoPorPedido[p.pedido] = [];
    }
    agrupadoPorPedido[p.pedido].push({ sku: p.sku, qtd: p.qtd });
  }

  const pedidos = Object.keys(agrupadoPorPedido);
  if (pedidos.length === 0) {
    alert("Nenhum pedido pendente para registrar.");
    return;
  }

  // 🧺 Solicita o cesto via modal
  const cesto = await solicitarCestoNL();
  if (!cesto) return;

  // 🔁 Dispara o registro no backend sem bloquear a UI
  const promRegistro = fetch("/api/gas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      func: "registrarMultiplos",
      pedidos,
      cesto,
      produtosPorPedido: agrupadoPorPedido,
    }),
  }).then((res) => res.json());

  // 🔎 Busca dados de cliente (para etiquetas)
  const { data: dadosPedido, error } = await supabase
    .from("pedidos")
    .select("id, cliente")
    .in("id", pedidos);

  if (error) {
    console.warn("Erro ao buscar clientes:", error);
  }

  // 🧾 Gera dados para etiquetas NL
  const etiquetas = pedidos.map((pedido) => {
    const cliente = dadosPedido?.find((p) => p.id == pedido)?.cliente || "—";
    const produtosNL = agrupadoPorPedido[pedido];
    const qtdeNL = produtosNL.reduce((acc, p) => acc + p.qtd, 0);
    const qtdeTotal = caixas[pedido]?.total ?? qtdeNL;
    const qtdeConferida = Math.max(0, qtdeTotal - qtdeNL);

    return {
      pedido,
      romaneio,
      cliente,
      cesto,
      operador1,
      operador2,
      produtosNL,
      qtdeTotal,
      qtdeNL,
      qtdePreVenda: 0,
      qtdeConferida,
    };
  });

  // 🖨️ Mostra imediatamente o modal com etiquetas
  abrirMultiplasEtiquetasNL(etiquetas);

  // ✅ Exibe mensagem de confirmação enquanto o registro ainda está em andamento
  alert(
    `✅ Gerado(s) ${pedidos.length} pedido(s) NL. Registro sendo finalizado...`
  );

  // 📦 Verifica se houve erro no registro depois
  const json = await promRegistro;
  if (!json || json.status !== "ok") {
    console.warn("Erro no registro GAS:", json);
    alert(
      "⚠️ Registro pode ter falhado no backend (Sheets). Verifique manualmente."
    );
  }
}

function abrirEtiquetaNL({
  pedido,
  romaneio,
  cliente,
  cesto,
  operador1,
  operador2,
  produtosNL,
  qtdeTotal,
  qtdeNL,
  qtdePreVenda,
  qtdeConferida,
}) {
  const operadores = operador2 ? `${operador1} e ${operador2}` : operador1;

  const tabela = produtosNL
    .map(({ sku, qtd }) => `<tr><td>${sku}</td><td>${qtd}</td></tr>`)
    .join("");

  const modal = document.getElementById("etiquetaModalNL");
  modal.innerHTML = `
    <div id="etiquetaContainerNL" class="etiqueta-nl-print">
      <style>
        @media print {
          body * {
            display: none !important;
            visibility: hidden !important;
          }

          #containerEtiquetasNL,
          #containerEtiquetasNL * {
            display: block !important;
            visibility: visible !important;
          }

          #containerEtiquetasNL {
            position: static !important;
            width: 105mm !important;
            height: auto !important;
            margin: 0 auto !important;
            background: white !important;
          }

          .modal-backdrop,
          .modal,
          .btn,
          .btn-imprimir-individual {
            display: none !important;
          }

          .etiqueta-nl-print {
            width: 105mm !important;
            height: 148mm !important;
            page-break-after: always;
            break-after: page;
          }
        }

        .etiqueta-nl-print {
          font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
          background: white;
          border: 1px solid #ccc;
          width: 105mm;
          height: 148mm;
          padding: 8mm 10mm;
          margin: 10px auto;
          box-shadow: 0 0 6px rgba(0,0,0,0.15);
          font-size: 10pt;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .etiqueta-nl-print h3 {
          text-align: center;
          letter-spacing: 0.5px;
        }

        .etiqueta-nl-print .info {
          font-size: 9pt;
          margin-bottom: 6px;
        }

        .etiqueta-nl-print .box-destaque {
          font-size: 28pt;
          font-weight: bold;
          color: #000;
          text-align: center;
          margin: 4mm 0;
          letter-spacing: 1px;
        }

        .etiqueta-nl-print table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 6px;
        }

        .etiqueta-nl-print th,
        .etiqueta-nl-print td {
          border: 1px solid #000;
          padding: 3px;
          text-align: center;
          font-size: 9pt;
        }

        .etiqueta-nl-print .section {
          margin-top: 6px;
        }

        .etiqueta-nl-print .resumo td:nth-child(2) { color: red; font-weight: bold; }
        .etiqueta-nl-print .resumo td:nth-child(4) { color: green; font-weight: bold; }

        .qrcode-container {
          position: absolute;
          top: 10mm;
          right: 10mm;
        }

        .qrcode-nl {
          width: 150px;
          height: 150px;
        }
      </style>

      <h3 style="text-align:center;">RELATÓRIO NL</h3>
      <div><strong>Pedido: ${pedido}</strong></div>
      <div><strong>Romaneio:</strong> ${romaneio}</div>
      <div><strong>Cliente:</strong> ${cliente}</div>
      <div style="font-size: 2rem; font-weight: bold; color: #1a1d20; margin: 6px 0;">
        🗃️ BOX ${caixas[pedido]?.box ?? "—"}
      </div>
      <div><strong>Operador(es):</strong> ${operadores}</div>
      <div><strong>Cesto NL:</strong> ${cesto}</div>

      <div class="section">
        <table>
          <thead><tr><th>SKU</th><th>QTD</th></tr></thead>
          <tbody>
            ${tabela}
            ${"<tr><td>&nbsp;</td><td>&nbsp;</td></tr>".repeat(
              9 - produtosNL.length
            )}
          </tbody>
        </table>
      </div>

      <div class="section">
        <table>
          <thead>
            <tr>
              <th>Total</th>
              <th>NL</th>
              <th>Pré-Venda</th>
              <th>Conferida</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${qtdeTotal}</strong></td>
              <td style="color: red;"><strong>${qtdeNL}</strong></td>
              <td>0</td>
              <td style="color: green;"><strong>${qtdeConferida}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top: 12px; text-align: right;">
        <button onclick="window.print()" class="btn btn-sm btn-primary">🖨️ Imprimir</button>
        <button onclick="document.getElementById('etiquetaModalNL').style.display = 'none'" class="btn btn-sm btn-secondary">Fechar</button>
      </div>
    </div>
  `;

  modal.style.display = "block";
}

function abrirMultiplasEtiquetasNL(lista) {
  let etiquetasHtml = "";

  for (const dados of lista) {
    const {
      pedido,
      romaneio,
      cliente,
      cesto,
      operador1,
      operador2,
      produtosNL,
      qtdeTotal,
      qtdeNL,
      qtdePreVenda,
      qtdeConferida,
    } = dados;

    const codNfe = codNfeMap[pedido];
    const linkPesagem = `https://ge.kaisan.com.br/index2.php?page=meta/view&id_view=nfe_pedido_conf&acao_view=cadastra&cod_del=${codNfe}&where=cod_nfe_pedido=${codNfe}#prodweightsomaproduto`;

    const operadores = operador2 ? `${operador1} e ${operador2}` : operador1;

    const tabelaProdutos =
      produtosNL
        .map(({ sku, qtd }) => `<tr><td>${sku}</td><td>${qtd}</td></tr>`)
        .join("") +
      "<tr><td>&nbsp;</td><td>&nbsp;</td></tr>".repeat(
        Math.max(0, 8 - produtosNL.length)
      );

    etiquetasHtml += `
      <div class="etiqueta-nl-print" data-pedido="${pedido}" data-url="${linkPesagem}">
        <div class="qrcode-container">
          <canvas id="qr-${pedido}" width="150" height="150"></canvas>
        </div>
        <h3>RELATÓRIO NL</h3>
        <div><strong>Pedido:</strong> ${pedido}</div>
        <div><strong>Romaneio:</strong> ${romaneio}</div>
        <div><strong>Cliente:</strong> ${cliente}</div>
        <div class="box-destaque">BOX ${caixas[pedido]?.box ?? "—"}</div>
        <div><strong>Operador(es):</strong> ${operadores}</div>
        <div><strong>Cesto NL:</strong> ${cesto}</div>
        <table>
          <thead><tr><th>SKU</th><th>QTD</th></tr></thead>
          <tbody>${tabelaProdutos}</tbody>
        </table>
        <table class="resumo">
          <thead>
            <tr><th>Total</th><th>NL</th><th>Pré-Venda</th><th>Conferida</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>${qtdeTotal}</td>
              <td>${qtdeNL}</td>
              <td>${qtdePreVenda || 0}</td>
              <td>${qtdeConferida}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  localStorage.setItem(`etiquetasNL-${romaneio}`, JSON.stringify(lista));

  const win = window.open("", "_blank");
  if (!win) {
    alert("❌ Não foi possível abrir a nova janela de impressão.");
    return;
  }

  win.document.write(`
    <html>
      <head>
        <title>Etiquetas NL</title>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
        <style>
          @page {
            size: 105mm 148mm;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', sans-serif;
          }
          .etiqueta-nl-print {
            width: 105mm;
            height: 148mm;
            padding: 8mm 10mm;
            margin: 0 auto;
            page-break-after: always;
            font-size: 10pt;
            overflow: hidden;
            position: relative;
          }
          .qrcode-container {
            position: absolute;
            top: 10mm;
            right: 10mm;
          }
          h3 {
            text-align: center;
            font-size: 16pt;
            margin-bottom: 6px;
          }
          .box-destaque {
            font-size: 28pt;
            font-weight: bold;
            text-align: center;
            margin: 8px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
          }
          th, td {
            border: 1px solid #000;
            padding: 4px;
            text-align: center;
            font-size: 9pt;
          }
          .resumo td:nth-child(2) { color: red; font-weight: bold; }
          .resumo td:nth-child(4) { color: green; font-weight: bold; }
        </style>
      </head>
      <body>
        ${etiquetasHtml}
        <script>
          window.onload = () => {
            const etiquetas = document.querySelectorAll(".etiqueta-nl-print");
            etiquetas.forEach((el) => {
              const pedido = el.dataset.pedido;
              const url = el.dataset.url;
              const canvas = document.getElementById("qr-" + pedido);
              if (canvas && window.QRCode) {
                QRCode.toCanvas(canvas, url, { width: 64 }, (err) => {
                  if (err) console.error("Erro ao gerar QRCode:", err);
                });
              }
            });

            setTimeout(() => {
              window.print();
              window.close();
            }, 500);
          };
        </script>
      </body>
    </html>
  `);

  win.document.close();
}

// 🖨️ Função auxiliar global para imprimir etiqueta individual
window.imprimirEtiqueta = function (idEtiqueta) {
  const originalContent = document.body.innerHTML;
  const etiqueta = document.getElementById(idEtiqueta);
  if (!etiqueta) return;

  const html = `
    <html>
      <head>
        <title>Imprimir Etiqueta</title>
        <style>
          @media print {
            body * { visibility: hidden !important; }
            #printArea, #printArea * {
              visibility: visible !important;
            }
            #printArea {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              z-index: 9999;
            }
          }
        </style>
      </head>
      <body>
        <div id="printArea">${etiqueta.outerHTML}</div>
        <script>
          window.onload = () => { window.print(); window.close(); };
        </script>
      </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
};

document.getElementById("btnCopyPendentes").addEventListener("click", () => {
  const table = document.querySelector("#listaPendentes table");
  if (!table) {
    alert("❌ Nenhuma tabela encontrada.");
    return;
  }

  const linhas = [...table.querySelectorAll("tbody tr")];
  const conteudo = linhas
    .map((linha) => {
      const colunas = linha.querySelectorAll("td");
      return [
        colunas[0]?.textContent.trim(),
        colunas[1]?.textContent.trim(),
        colunas[2]?.textContent.trim(),
      ].join("\t");
    })
    .join("\n");

  // Copiar para área de transferência
  navigator.clipboard
    .writeText(conteudo)
    .then(() => {
      alert("✅ Pendentes copiados com sucesso!");
    })
    .catch((err) => {
      console.error("Erro ao copiar:", err);
      alert("❌ Erro ao copiar pendentes.");
    });
});

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
          <div class="title">${desc}</div>
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
    barra.textContent = "";
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

  const { data: after, error: afterErr } = await supabase
    .from("produtos_pedido")
    .select("qtd, qtd_bipada")
    .eq("id", id)
    .single();
  if (afterErr) return alert("Erro ao recarregar bipagem.");

  const restante = (after.qtd || 0) - (after.qtd_bipada || 0);

  const info = caixas[pedido];
  if (info) {
    info.bipado = after.qtd_bipada;
    if (info.bipado === 0) {
      delete caixas[pedido];
      setContadorBox(freedBox);
    }
    if (info.pesado && info.bipado < info.total) {
      info.pesado = false;
      await supabase.from("pedidos").update({ status: "" }).eq("id", pedido);
    }
  }

  const idx = pendentes.findIndex((p) => p.sku === sku && p.pedido === pedido);
  if (restante > 0) {
    if (idx > -1) {
      pendentes[idx].qtd = restante;
    } else {
      pendentes.push({ sku, pedido, qtd: restante, endereco, descricao });
    }
  } else if (idx > -1) {
    pendentes.splice(idx, 1);
  }

  const histIdx = historico.findIndex((h) => h.id === currentProduto.id);
  if (histIdx > -1) {
    historico.splice(histIdx, 1);
  }
  localStorage.setItem(`pendentes-${romaneio}`, JSON.stringify(pendentes));
  localStorage.setItem(`caixas-${romaneio}`, JSON.stringify(caixas));
  localStorage.setItem(`historico-${romaneio}`, JSON.stringify(historico));

  renderPendentes();
  renderBoxCards(window.pedidosEsperados);
  renderHistorico();
  renderProgressoConferencia();

  document.getElementById("cardAtual").innerHTML = "";
  currentProduto = historico.length ? historico[historico.length - 1] : null;
}

async function carregarBipagemAnterior(romaneio) {
  // limpa o card atual e zera o ponteiro para evitar push indevido no histórico
  currentProduto = null;
  const cardAtual = document.getElementById("cardAtual");
  if (cardAtual) cardAtual.innerHTML = "";

  // 1) fetch de pedidos reais (da tabela `pedidos`)
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id, status")
    .eq("romaneio", romaneio);

  const pedidoStatusMap = {};
  pedidos.forEach((p) => {
    pedidoStatusMap[p.id] = p.status;
  });

  const pedidoIds = pedidos.map((p) => p.id);

  // 2) fetch de pedidos esperados (nova tabela `pedidos_por_romaneio`)
  const { data: esperados, error: erroEsperados } = await supabase
    .from("pedidos_por_romaneio")
    .select("pedido")
    .eq("romaneio", romaneio);

  window.pedidosEsperados = esperados?.map((r) => r.pedido) || [];

  // 3) reset estado
  caixas = {};
  historico = [];
  pendentes = [];

  await carregarCodNfeMap(pedidoIds);

  // 4) fetch de produtos
  const { data: produtos } = await supabase
    .from("produtos_pedido")
    .select("pedido_id, sku, qtd, qtd_bipada, box, endereco, descricao")
    .in("pedido_id", pedidoIds);

  // 5) montar caixas, histórico e pendentes
  produtos.forEach((p) => {
    const qtdBip = p.qtd_bipada || 0;

    if (!caixas[p.pedido_id]) {
      caixas[p.pedido_id] = {
        box: p.box != null ? p.box : null,
        bipado: 0,
        total: 0,
        pesado: false,
      };

      caixas[p.pedido_id].pesado = pedidoStatusMap[p.pedido_id] === "PESADO";
    }

    if (p.box != null) {
      caixas[p.pedido_id].box = p.box;
    }

    caixas[p.pedido_id].total += p.qtd;
    caixas[p.pedido_id].bipado += qtdBip;

    if (qtdBip > 0) {
      historico.push({
        sku: p.sku,
        pedido: p.pedido_id,
        box: caixas[p.pedido_id].box,
        id: p.id,
      });
    }

    const restante = p.qtd - qtdBip;
    if (restante > 0) {
      const key = p.sku?.trim().toUpperCase();
      const enderecos = mapaEnderecos[key] || [];

      let enderecoFinal = "SEM LOCAL";

      if (enderecos.length) {
        enderecoFinal = enderecos.join(" • ");
      } else if (p.endereco && typeof p.endereco === "string") {
        enderecoFinal = p.endereco.trim().toUpperCase();
      }

      pendentes.push({
        sku: p.sku,
        pedido: p.pedido_id,
        qtd: restante,
        endereco: enderecoFinal,
        descricao: p.descricao,
      });
    }
  });

  // 6) persistência local
  localStorage.setItem(`caixas-${romaneio}`, JSON.stringify(caixas));
  localStorage.setItem(`historico-${romaneio}`, JSON.stringify(historico));
  localStorage.setItem(`pendentes-${romaneio}`, JSON.stringify(pendentes));

  // 7) acerta o próximo número de box
  const numeros = Object.values(caixas)
    .map((c) => parseInt(c.box, 10))
    .filter((n) => !isNaN(n));
  setContadorBox(numeros.length ? Math.max(...numeros) + 1 : 1);

  // 8) renderiza os componentes, incluindo os boxes cinza
  renderBoxCards(pedidosEsperados);
  renderHistorico();
  renderPendentes();
  renderProgressoConferencia();

  const { bipado, total } = calcularPecasTotaisEBipadas();
  atualizarProgressoPro(bipado, total, window.inicioRomaneioTimestamp);
}

const CACHE_TTL_MINUTOS = 10;

async function carregarEnderecosComCache() {
  const cacheKey = "enderecamentos-cache";
  const timestampKey = "enderecamentos-cache-timestamp";

  const now = Date.now();
  const last = parseInt(localStorage.getItem(timestampKey) || "0", 10);
  const ttl = CACHE_TTL_MINUTOS * 60 * 1000;

  if (now - last < ttl) {
    const raw = localStorage.getItem(cacheKey);
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (e) {
      console.warn("⚠️ Cache corrompido, recarregando Supabase");
    }
  }

  // fetch fresh
  const { data, error } = await supabase
    .from("enderecamentos")
    .select("sku, endereco");

  if (error || !Array.isArray(data)) {
    console.error("❌ Erro ao carregar endereçamentos:", error);
    return {};
  }

  const mapa = {};
  data.forEach(({ sku, endereco }) => {
    const key = sku?.trim().toUpperCase();
    if (!key || !endereco) return;
    if (!mapa[key]) mapa[key] = [];
    if (!mapa[key].includes(endereco.trim())) {
      mapa[key].push(endereco.trim());
    }
  });

  // salva no localStorage
  localStorage.setItem(cacheKey, JSON.stringify(mapa));
  localStorage.setItem(timestampKey, now.toString());

  return mapa;
}

window.mapaEnderecos = {};

document.getElementById("btnIniciar").addEventListener("click", async () => {
  const input = document.getElementById("romaneioInput");
  romaneio = input.value.trim();
  if (!romaneio) return alert("Digite o romaneio");

  // 🔒 Verifica se o romaneio existe no banco de dados
  const { data: romaneioValido, error: erroRom } = await supabase
    .from("romaneios")
    .select("romaneio")
    .eq("romaneio", romaneio)
    .single();

  if (erroRom || !romaneioValido) {
    alert("⚠️ Este romaneio não existe no banco de dados.");
    return;
  }

  window.romaneio = romaneio;
  atualizarCamposDoCronometroModal();

  // Se operador1 não existir, não adianta nem tentar
  if (!operador1) {
    return alert("Você precisa fazer login antes de iniciar um romaneio.");
  }

  // Checa se já há alguém usando:
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
  mapaEnderecos = await carregarEnderecosComCache();

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

  // limpa o cartão antes de liberar o bipar
  currentProduto = null;
  document.getElementById("cardAtual").innerHTML = "";

  // depois segue com o unlock dos campos, focus etc.
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
  document.getElementById("skuInput").disabled = false;
  document.getElementById("skuInput").focus();

  await carregarBipagemAnterior(romaneio);
  await gerarResumoVisualRomaneio();

  if (typeof atualizarInfosCronometro === "function") {
    atualizarInfosCronometro();
  }
  if (typeof buscarEPopularTempoIdeal === "function") {
    buscarEPopularTempoIdeal(romaneio);
  }

  await carregarCronometroNoModal();
});

function atualizarCamposDoCronometroModal() {
  const container = document.getElementById("cronometroModal");
  if (!container) return;

  const elOp1 = container.querySelector("#operadorDisplay");
  const elOp2 = container.querySelector("#operador2Display");
  const elRom = container.querySelector("#romaneioDisplay");

  if (elOp1) elOp1.value = operador1 || "—";
  if (elOp2) elOp2.value = operador2 || "—";
  if (elRom) elRom.value = romaneio || "—";
}

document.getElementById("btnBipar").addEventListener("click", async () => {
  const inputSKU = document.getElementById("skuInput");
  const btnBipar = document.getElementById("btnBipar");
  const sku = inputSKU.value.trim();

  // 1) aborta se não houver SKU ou romaneio ativo
  if (!sku || !romaneio) return;

  // 2) desabilita enquanto processa
  inputSKU.disabled = true;
  btnBipar.disabled = true;

  // Salva o histórico atual antes de bipar
  if (currentProduto) {
    historico.push(currentProduto);
    localStorage.setItem(`historico-${romaneio}`, JSON.stringify(historico));
  }

  // 3) executa bipagem e renderiza o card
  const result = await biparProduto(sku, romaneio);
  renderCardProduto(result);

  if (result.status === "ok") {
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

    // 9) atualiza UI com progresso recalculado após atualizar o estado
    renderBoxCards(window.pedidosEsperados);
    renderPendentes();
    renderHistorico();

    const { bipado, total } = calcularPecasTotaisEBipadas();
    atualizarProgressoPro(bipado, total, window.inicioRomaneioTimestamp);
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

  // Atualiza o status e boxes no Supabase
  for (const pedido in caixas) {
    const { box, pesado } = caixas[pedido];

    await supabase
      .from("produtos_pedido")
      .update({ box })
      .eq("pedido_id", parseInt(pedido));

    if (pesado) {
      await supabase
        .from("pedidos")
        .update({ status: "PESADO" })
        .eq("id", pedido);
    }
  }

  // 🧾 Gera o PDF de resumo
  await gerarPdfResumo();

  // 🔓 Libera o romaneio
  await supabase.from("romaneios_em_uso").delete().eq("romaneio", romaneio);

  // 🧹 Limpa estado local
  localStorage.removeItem(`historico-${romaneio}`);
  localStorage.removeItem(`caixas-${romaneio}`);
  localStorage.removeItem(`pendentes-${romaneio}`);

  caixas = {};
  historico = [];
  pendentes = [];
  romaneio = "";

  // 🧼 Reset UI
  document.getElementById("romaneioInput").value = "";
  document.getElementById("romaneioInput").disabled = false;
  document.getElementById("btnIniciar").disabled = false;
  document.getElementById("btnFinalizar").classList.add("d-none");
  document.getElementById("btnLimparRomaneio").classList.add("d-none");
  document.getElementById("cardAtual").innerHTML = "";
  document.getElementById("boxContainer").innerHTML = "";
  document.getElementById("listaHistorico").innerHTML = "";
  document.getElementById("listaPendentes").innerHTML = "";

  renderProgressoConferencia();
});

document
  .getElementById("btnLimparRomaneio")
  .addEventListener("click", async () => {
    if (!romaneio) return;
    const confirmar = confirm(
      "Apagar TODAS as bipagens deste romaneio?\nIsso limpará banco de dados e histórico local."
    );
    if (!confirmar) return;

    // 1) Apaga no banco: zera bipagens e desvincula boxes
    const { data: pedidos } = await supabase
      .from("pedidos")
      .select("id")
      .eq("romaneio", romaneio);

    const pedidoIds = pedidos.map((p) => p.id);

    await supabase
      .from("produtos_pedido")
      .update({ qtd_bipada: 0, box: null })
      .in("pedido_id", pedidoIds);

    await supabase
      .from("pedidos")
      .update({ status: "" }) // zera status PESADO
      .in("id", pedidoIds);

    // Remove o registro de “romaneios_em_uso” para este romaneio
    await supabase.from("romaneios_em_uso").delete().eq("romaneio", romaneio);

    // 2) Limpa localStorage
    localStorage.removeItem(`caixas-${romaneio}`);
    localStorage.removeItem(`pendentes-${romaneio}`);
    localStorage.removeItem(`historico-${romaneio}`);
    localStorage.removeItem(`etiquetasNL-${romaneio}`);

    // 3) Limpa variáveis em memória
    caixas = {};
    pendentes = [];
    historico = [];
    currentProduto = null;
    romaneio = "";

    // 4) Restaura UI
    document.getElementById("romaneioInput").value = "";
    document.getElementById("romaneioInput").disabled = false;
    document.getElementById("btnIniciar").disabled = false;
    document.getElementById("skuInput").value = "";
    document.getElementById("cardAtual").innerHTML = "";
    document.getElementById("boxContainer").innerHTML = "";
    document.getElementById("listaHistorico").innerHTML = "";
    document.getElementById("listaPendentes").innerHTML = "";
    document.getElementById("btnFinalizar").classList.add("d-none");
    document.getElementById("btnLimparRomaneio").classList.add("d-none");

    renderProgressoConferencia();
    document.getElementById("romaneioInput").focus();
  });

document.getElementById("btnPrintPendentes")?.addEventListener("click", () => {
  const operadorLogado =
    operador2 && operador2.length
      ? `${operador1} e ${operador2}`
      : operador1 || "Desconhecido";
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
    const partesEndereco = (endereco || "").split("•").map((p) => p.trim());
    const doisEnderecos = partesEndereco.slice(0, 2).join(" • ");

    if (!agrupado[sku]) {
      agrupado[sku] = { qtd: 0, endereco: doisEnderecos };
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
  const operadorLogado =
    operador2 && operador2.length
      ? `${operador1} e ${operador2}`
      : operador1 || "Desconhecido";
  const romaneioAtivo = romaneio || "Não informado";
  const dataHoraAtual = new Date().toLocaleString("pt-BR");

  const boxList = Object.entries(caixas)
    .filter(([_, info]) => info?.box && info.total > 0)
    .map(([_, info]) => ({
      box: Number(info.box),
      total: info.total,
      bipado: info.bipado,
      status: info.pesado
        ? info.bipado < info.total
          ? "Pesado Incompleto"
          : "Pesado"
        : info.bipado >= info.total
        ? "Completo"
        : "Incompleto",
    }))
    .sort((a, b) => a.box - b.box)
    .slice(0, 50);

  if (boxList.length === 0) {
    return alert("Nenhum box encontrado para impressão.");
  }

  const colEsq = boxList.slice(0, 25);
  const colDir = boxList.slice(25, 50);

  let linhas = "";

  for (let i = 0; i < 25; i++) {
    const b1 = colEsq[i];
    const b2 = colDir[i];

    const col1 = b1
      ? `<td class="col-box">${b1.box}</td><td><strong>${b1.bipado}/${b1.total}</strong></td><td>${b1.status}</td>`
      : "<td></td><td></td><td></td>";

    const col2 = b2
      ? `<td class="col-box">${b2.box}</td><td><strong>${b2.bipado}/${b2.total}</strong></td><td>${b2.status}</td>`
      : "<td></td><td></td><td></td>";

    linhas += `<tr>${col1}<td class="spacer"></td>${col2}</tr>`;

    if ((i + 1) % 5 === 0 && i < 24) {
      linhas += `<tr class="bloco-spacer"><td colspan="7"></td></tr>`;
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

// 1) Suas funções auxiliares:
function converterStringParaSegundos(hhmmss) {
  const partes = hhmmss.split(":").map((str) => parseInt(str, 10));
  if (partes.length !== 3 || partes.some(isNaN)) return 0;
  const [h, m, s] = partes;
  return h * 3600 + m * 60 + s;
}

function converterSegundosParaString(totalSegundos) {
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos % 60;
  const pad2 = (n) => String(n).padStart(2, "0");
  return `${pad2(horas)}:${pad2(minutos)}:${pad2(segundos)}`;
}

// 2) Função “obterTempoPadrao” (exemplo fixo; substitua pela sua lógica)
function obterTempoPadrao(codEtapa) {
  const mapa = {
    "003": { tempo80: 15 }, // 15 segundos por peça
    "005": { tempo80: 10 }, // 10 segundos por pedido
    "006": { tempo80: 20 }, // 20 segundos por pedido
  };
  return mapa[codEtapa] || null;
}

// 3) Função que, dado pecas, pedidos e resumo, calcula e exibe no DOM:
function calcularETrocarTempos(pecas, pedidos, resumo) {
  // 3.1) Montar o objeto de tempos padrão
  const tempoPadrao = {};
  ["003", "005", "006"].forEach((cod) => {
    const tempoObj = obterTempoPadrao(cod);
    if (tempoObj && tempoObj.tempo80 != null) {
      tempoPadrao[cod] = parseFloat(tempoObj.tempo80);
    }
  });

  // 3.2) Calcular tempo ideal total (segundos)
  const tpEtapa003 = (tempoPadrao["003"] || 0) * pecas;
  const tpEtapa005 = (tempoPadrao["005"] || 0) * pedidos;
  const tpEtapa006 = (tempoPadrao["006"] || 0) * pedidos;
  const tempoIdealTotalSegundos = Math.round(
    tpEtapa003 + tpEtapa005 + tpEtapa006
  );

  // 3.3) Calcular tempo real total (segundos)
  const tempoRealTotalSegundos = resumo.reduce((acc, etapaObj) => {
    return acc + converterStringParaSegundos(etapaObj.tempo);
  }, 0);

  // 3.4) Converter para “HH:mm:ss”
  const idealFormatado = converterSegundosParaString(tempoIdealTotalSegundos);
  const realFormatado = converterSegundosParaString(tempoRealTotalSegundos);

  // 3.5) Atualizar o DOM
  const elementoIdeal = document.getElementById("tempoIdealTotalDisplay");
  const elementoReal = document.getElementById("tempoRealTotalDisplay");

  if (elementoIdeal) elementoIdeal.textContent = idealFormatado;
  if (elementoReal) elementoReal.textContent = realFormatado;

  // (Opcional) Você pode também retornar um objeto com esses valores, se precisar de outros cálculos
  return {
    idealSegundos: tempoIdealTotalSegundos,
    realSegundos: tempoRealTotalSegundos,
    idealHHMMSS: idealFormatado,
    realHHMMSS: realFormatado,
  };
}

function popularTabelaTempoIdeal(lista) {
  const tbody = document.getElementById("tbodyTempoIdeal");
  if (!tbody) return;

  tbody.innerHTML = "";
  totalSegundosIdeal = 0;

  lista.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.etapa}</td>
      <td>${item.tempo_ideal}</td>
      <td>–</td>
      <td>–</td>
      <td>–</td>  <!-- Executado -->
      <td>–</td>  <!-- Eficiência -->
    `;
    tbody.appendChild(tr);

    // Soma os segundos do tempo_ideal
    const segs = converterStringParaSegundos(item.tempo_ideal);
    totalSegundosIdeal += segs;
  });

  // Atualiza o “displayTempoIdealTotal”
  const display = document.getElementById("displayTempoIdealTotal");
  if (display)
    display.textContent = converterSegundosParaString(totalSegundosIdeal);
}

function formatarTempo(segundos) {
  return converterSegundosParaString(segundos);
}

function iniciarEtapaAtual() {
  inicioEtapa = new Date();
  pausado = false;

  timerEtapa = setInterval(() => {
    const agora = new Date();
    const segDecorridos = Math.floor((agora - inicioEtapa) / 1000);
    const totalSegs = tempoAcumuladoEtapa + segDecorridos;
    document.getElementById("displayTempoEtapaAtual").textContent =
      formatarTempo(totalSegs);
  }, 1000);
}

function pausarOuRetomarEtapa() {
  const btn = document.getElementById("btnPausarEtapa");
  if (!btn) return;

  if (pausado) {
    // Retomar
    inicioEtapa = new Date();
    inicioTotal = new Date();
    iniciarEtapaAtual();

    timerTotal = setInterval(() => {
      const agora = new Date();
      const segDecorridos = Math.floor((agora - inicioTotal) / 1000);
      const totalSegs = tempoAcumuladoTotal + segDecorridos;
      document.getElementById("displayTempoTotal").textContent =
        formatarTempo(totalSegs);
    }, 1000);

    btn.innerHTML = `<i class="bi bi-pause-fill"></i> Pausar Etapa`;
    pausado = false;
  } else {
    // Pausar
    const agora = new Date();
    tempoAcumuladoEtapa += Math.floor((agora - inicioEtapa) / 1000);
    tempoAcumuladoTotal += Math.floor((agora - inicioTotal) / 1000);

    clearInterval(timerEtapa);
    clearInterval(timerTotal);

    btn.innerHTML = `<i class="bi bi-play-fill"></i> Retomar Etapa`;
    pausado = true;
  }
}

function reiniciarEtapa() {
  clearInterval(timerEtapa);
  document.getElementById("displayTempoEtapaAtual").textContent = "00:00:00";
  iniciarEtapaAtual();
  const btn = document.getElementById("btnPausarEtapa");
  if (btn) btn.innerHTML = `<i class="bi bi-pause-fill"></i> Pausar Etapa`;
  pausado = false;
}

function avancarParaProximaEtapa() {
  clearInterval(timerEtapa);

  const fim = new Date();
  const segsDesdeUltimoInicio = Math.floor((fim - inicioEtapa) / 1000);
  const segsPassados = tempoAcumuladoEtapa + segsDesdeUltimoInicio;
  const tempoHHMMSS = formatarTempo(segsPassados);
  const etapaCod = etapas[etapaAtualIndex];

  // Captura a linha correspondente na tabela
  const linha = document.querySelector(
    `#tbodyTempoIdeal tr:nth-child(${etapaAtualIndex + 1})`
  );
  if (linha) {
    const celulas = linha.querySelectorAll("td");
    if (celulas.length >= 6) {
      const horarioInicio = inicioEtapa.toLocaleTimeString("pt-BR");
      const horarioFim = fim.toLocaleTimeString("pt-BR");

      celulas[2].textContent = horarioInicio; // Início
      celulas[3].textContent = horarioFim; // Fim
      celulas[4].textContent = tempoHHMMSS; // Executado

      const tempoIdealStr = celulas[1].textContent || "00:00:00";
      const idealSegs = converterStringParaSegundos(tempoIdealStr);
      const eficiencia =
        idealSegs > 0 ? Math.round((idealSegs / segsPassados) * 100) : 0;

      celulas[5].textContent = `${eficiencia}%`;
      celulas[5].classList.remove(
        "text-success",
        "text-warning",
        "text-danger"
      );

      if (eficiencia >= 100) {
        celulas[5].classList.add("text-success", "fw-bold");
      } else if (eficiencia >= 80) {
        celulas[5].classList.add("text-warning", "fw-bold");
      } else {
        celulas[5].classList.add("text-danger", "fw-bold");
      }
    } else {
      console.warn("⚠️ A linha da tabela não tem colunas suficientes.");
    }
  }

  // Armazena no resumo
  resumo.push({ etapa: etapaCod, tempo: tempoHHMMSS });
  inicioEtapa = null;
  tempoAcumuladoEtapa = 0;

  etapaAtualIndex++;

  if (etapaAtualIndex < etapas.length) {
    const proximaEtapa = etapas[etapaAtualIndex];
    document.getElementById("labelEtapaAtual").textContent = proximaEtapa;
    document.getElementById("displayTempoEtapaAtual").textContent = "00:00:00";

    iniciarEtapaAtual();
    calcularETrocarTempos(window.pecas, window.pedidos, resumo);

    // Alterna botões
    btnProximaEtapa.classList.remove("d-none");
    btnFinalizarRomaneio.classList.add("d-none");

    if (proximaEtapa === "006") {
      btnProximaEtapa.classList.add("d-none");
      btnFinalizarRomaneio.classList.remove("d-none");
    }
  } else {
    finalizarEtapas();
  }
}

async function finalizarEtapas() {
  clearInterval(timerTotal);
  clearInterval(timerEtapa);

  // Marca fim da última etapa se ainda estava em andamento
  if (etapaAtualIndex < etapas.length) {
    const fim = new Date();
    const segsPassados = Math.floor((fim - inicioEtapa) / 1000);
    const tempoHHMMSS = formatarTempo(segsPassados);
    const etapaCod = etapas[etapaAtualIndex];

    // Atualiza a linha da tabela
    const linha = document.querySelector(
      `#tbodyTempoIdeal tr:nth-child(${etapaAtualIndex + 1})`
    );
    if (linha) {
      const celulas = linha.querySelectorAll("td");
      if (celulas.length >= 6) {
        const horarioInicio = inicioEtapa.toLocaleTimeString("pt-BR");
        const horarioFim = fim.toLocaleTimeString("pt-BR");

        celulas[2].textContent = horarioInicio;
        celulas[3].textContent = horarioFim;
        celulas[4].textContent = tempoHHMMSS;

        const tempoIdealStr = celulas[1].textContent || "00:00:00";
        const idealSegs = converterStringParaSegundos(tempoIdealStr);
        const eficiencia =
          idealSegs > 0 ? Math.round((idealSegs / segsPassados) * 100) : 0;

        celulas[5].textContent = `${eficiencia}%`;
        celulas[5].classList.remove(
          "text-success",
          "text-warning",
          "text-danger"
        );

        if (eficiencia >= 100) {
          celulas[5].classList.add("text-success", "fw-bold");
        } else if (eficiencia >= 80) {
          celulas[5].classList.add("text-warning", "fw-bold");
        } else {
          celulas[5].classList.add("text-danger", "fw-bold");
        }
      }
    }

    // Registra no resumo final
    resumo.push({ etapa: etapaCod, tempo: tempoHHMMSS });

    // ⏺️ Montar dados para envio ao Sheets
    const dadosParaPlanilha = resumo
      .map((linha, i) => {
        const tr = document.querySelector(
          `#tbodyTempoIdeal tr:nth-child(${i + 1})`
        );
        if (!tr) return null;

        const tds = tr.querySelectorAll("td");
        return {
          etapa: tds[0]?.textContent || "",
          tempoIdeal: tds[1]?.textContent || "",
          inicio: tds[2]?.textContent || "",
          fim: tds[3]?.textContent || "",
          executado: tds[4]?.textContent || "",
          eficiencia: tds[5]?.textContent || "",
          operador1: operador1 || "",
          operador2: operador2 || "",
          romaneio: romaneio || "",
          timestamp: new Date().toISOString(),
        };
      })
      .filter(Boolean); // remove linhas nulas
  }

  // Atualiza status da UI
  document.getElementById("labelEtapaAtual").textContent = "—";
  document.getElementById("btnPausarEtapa").disabled = true;
  document.getElementById("btnReiniciarEtapa").disabled = true;

  const btnProximaEtapa = document.getElementById("btnProximaEtapa");
  const btnFinalizarRomaneio = document.getElementById("btnFinalizarRomaneio");

  if (btnProximaEtapa) btnProximaEtapa.classList.add("d-none");
  if (btnFinalizarRomaneio) btnFinalizarRomaneio.classList.add("d-none");

  // Atualiza tempo real total
  calcularETrocarTempos(window.pecas, window.pedidos, resumo);

  await salvarEtapasNaPlanilha();
}

async function salvarEtapasNaPlanilha() {
  const etapasParaSalvar = resumo.map((etapaObj, index) => {
    const linha = document.querySelector(
      `#tbodyTempoIdeal tr:nth-child(${index + 1})`
    );
    const tds = linha?.querySelectorAll("td") || [];

    const idEtapa = `${romaneio}-${etapaObj.etapa}-${
      tds[2]?.textContent || ""
    }`.trim();

    return {
      operador1: operador1,
      operador2: operador2 || null,
      romaneio,
      etapa: etapaObj.etapa,
      inicio: tds[2]?.textContent || "",
      fim: tds[3]?.textContent || "",
      tempo: etapaObj.tempo,
      pedidos: window.pedidos || 0,
      pecas: window.pecas || 0,
      id_etapa: idEtapa,
    };
  });

  const etapasEnviadas = JSON.parse(
    localStorage.getItem("etapasEnviadas") || "[]"
  );

  for (const etapa of etapasParaSalvar) {
    if (etapasEnviadas.includes(etapa.id_etapa)) {
      console.log("⏩ Etapa já enviada:", etapa.id_etapa);
      continue;
    }

    const sucesso = await enviarEtapaParaPlanilha(etapa);
    if (sucesso) {
      etapasEnviadas.push(etapa.id_etapa);
      localStorage.setItem("etapasEnviadas", JSON.stringify(etapasEnviadas));
    }
  }

  // 💾 Salva resumo completo no localStorage para persistência
  localStorage.setItem(`etapas-${romaneio}`, JSON.stringify(resumo));
}

async function prepararDadosDoRomaneio(rom) {
  // 1) Buscar todos os pedidos desse romaneio
  const { data: pedidosData, error: errPedidos } = await supabase
    .from("pedidos")
    .select("id")
    .eq("romaneio", rom);

  if (errPedidos) {
    console.error("Erro ao buscar pedidos do romaneio:", errPedidos);
    return { pecas: 0, pedidos: 0 };
  }
  const pedidoIds = pedidosData.map((p) => p.id);
  window.pedidos = pedidoIds.length;

  // 2) Buscar quantidades de peças (soma de qtd em produtos_pedido)
  //    Suponho que a tabela “produtos_pedido” tem colunas: pedido_id, qtd, qtd_bipada, box, etc.
  const { data: produtosData, error: errProdutos } = await supabase
    .from("produtos_pedido")
    .select("qtd")
    .in("pedido_id", pedidoIds);

  if (errProdutos) {
    console.error("Erro ao buscar produtos do romaneio:", errProdutos);
    window.pecas = 0;
    return { pecas: 0, pedidos: window.pedidos };
  }

  const totalPecas = produtosData.reduce((acc, linha) => {
    return acc + (linha.qtd || 0);
  }, 0);

  window.pecas = totalPecas;
  return { pecas: totalPecas, pedidos: window.pedidos };
}

function configurarListenersCronometro() {
  // 🔁 (Re)captura os botões toda vez que o cronômetro for carregado
  btnProximaEtapa = document.getElementById("btnProximaEtapa");
  btnFinalizarRomaneio = document.getElementById("btnFinalizarRomaneio");

  const btnIniciar = document.getElementById("btnIniciarRomaneio");
  const btnPausar = document.getElementById("btnPausarEtapa");
  const btnReiniciar = document.getElementById("btnReiniciarEtapa");

  if (!btnIniciar || !btnPausar || !btnReiniciar) {
    console.warn("⚠️ Botões do cronômetro não encontrados no DOM.");
    return;
  }

  // 🔁 Garante que os botões sejam visíveis apenas quando devem
  btnProximaEtapa?.classList.add("d-none");
  btnFinalizarRomaneio?.classList.add("d-none");

  // Botão "Iniciar Romaneio"
  btnIniciar.addEventListener("click", async () => {
    if (!window.operador) {
      return alert("Operador não está definido.");
    }
    if (!window.romaneio) {
      return alert("Romaneio não está definido.");
    }

    await prepararDadosDoRomaneio(window.romaneio);

    btnIniciar.disabled = true;
    btnPausar.disabled = false;
    btnReiniciar.disabled = false;

    etapaAtualIndex = 0;
    document.getElementById("labelEtapaAtual").textContent =
      etapas[etapaAtualIndex];

    inicioTotal = new Date();
    timerTotal = setInterval(() => {
      const agora = new Date();
      const segDecorridos = Math.floor((agora - inicioTotal) / 1000);
      const totalSegs = tempoAcumuladoTotal + segDecorridos;
      document.getElementById("displayTempoTotal").textContent =
        formatarTempo(totalSegs);
    }, 1000);

    iniciarEtapaAtual();
    buscarEPopularTempoIdeal(window.romaneio);

    // 👇 Mostra botão Próxima Etapa, oculta Finalizar
    btnProximaEtapa?.classList.remove("d-none");
    btnFinalizarRomaneio?.classList.add("d-none");
  });

  // Botão "Próxima Etapa"
  btnProximaEtapa?.addEventListener("click", () => {
    avancarParaProximaEtapa();
  });

  // Botão "Finalizar Romaneio"
  btnFinalizarRomaneio?.addEventListener("click", () => {
    finalizarEtapas(); // ou outro comportamento
    localStorage.removeItem(`etiquetasNL-${romaneio}`);
  });

  // Botão "Pausar Etapa"
  btnPausar.addEventListener("click", () => {
    pausarOuRetomarEtapa();
  });

  // Botão "Reiniciar Etapa"
  btnReiniciar.addEventListener("click", () => {
    reiniciarEtapa();
  });

  // Teclado: Enter ou Espaço avança etapa
  document.addEventListener("keydown", (e) => {
    const elementoFocado = document.activeElement;
    const ehInput =
      elementoFocado &&
      (elementoFocado.tagName === "INPUT" ||
        elementoFocado.tagName === "TEXTAREA");

    if (ehInput) return;
    if ((e.key === "Enter" || e.key === " ") && !btnIniciar.disabled) {
      if (inicioEtapa) {
        avancarParaProximaEtapa();
      }
    }
  });
}

// Mostrar/ocultar modal flutuante do cronômetro
async function carregarCronometroNoModal() {
  try {
    const resp = await fetch("/cronometro.html");
    if (!resp.ok) throw new Error("Não foi possível carregar cronometro.html");

    const container = document.getElementById("cronometroModal");
    container.innerHTML = await resp.text();

    // 🔧 Corrigido: preenchimento seguro dos campos
    const elOp1 = container.querySelector("#operadorDisplay");
    const elOp2 = container.querySelector("#operador2Display");
    const elRom = container.querySelector("#romaneioDisplay");

    if (elOp1) elOp1.value = operador1 || "—";
    if (elOp2) elOp2.value = operador2 || "—";
    if (elRom) elRom.value = romaneio || "—";

    // Reativa funções internas
    if (typeof initCronometroCampos === "function") {
      initCronometroCampos();
    }

    configurarListenersCronometro();
  } catch (err) {
    console.error("Erro ao injetar cronômetro:", err);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // 1) Carrega o cronometro.html dentro de #cronometroModal
  await carregarCronometroNoModal();

  // 2) Lógica do botão flutuante que abre/fecha o modal
  const btnCron = document.getElementById("btnCronometroFloating");
  const modalCron = document.getElementById("cronometroModal");
  if (btnCron && modalCron) {
    btnCron.addEventListener("click", (e) => {
      e.stopPropagation();
      modalCron.style.display =
        modalCron.style.display === "block" ? "none" : "block";
    });
    document.addEventListener("click", (e) => {
      if (!modalCron.contains(e.target) && !btnCron.contains(e.target)) {
        modalCron.style.display = "none";
      }
    });
  } else {
    console.warn("botão ou modal do cronômetro não encontrados.");
  }
});

function obterPedidosEpecasDoRomaneio(rom, callback) {
  supabase
    .from("romaneios")
    .select("romaneio, qtd_pedidos, qtd_pecas") // Nomes corrigidos
    .eq("romaneio", rom)
    .single()
    .then(({ data, error }) => {
      if (error || !data) {
        console.error("Erro ao buscar romaneio:", error);
        callback(null);
      } else {
        callback({
          romaneio: data.romaneio,
          qtd_pedidos: data.qtd_pedidos,
          qtd_pecas: data.qtd_pecas,
        });
      }
    });
}

function buscarEPopularTempoIdeal(rom) {
  if (!rom) return console.warn("buscarEPopularTempoIdeal: rom vazio");

  obterPedidosEpecasDoRomaneio(rom, (resRom) => {
    if (!resRom) return;

    const totalPedidos = Number(resRom.qtd_pedidos) || 0;
    const totalPecas = Number(resRom.qtd_pecas) || 0;

    const tempo80Map = {
      "003": 2.42, // segundos por peça
      "005": 13.376, // segundos por pedido
      "006": 17.778, // segundos por pedido
    };

    const etapas = ["003", "005", "006"];
    const lista = etapas.map((etapa) => {
      const tempoSegundos =
        etapa === "003"
          ? tempo80Map[etapa] * totalPecas
          : tempo80Map[etapa] * totalPedidos;

      return {
        etapa,
        tempo_ideal: converterSegundosParaString(Math.round(tempoSegundos)),
      };
    });

    popularTabelaTempoIdeal(lista);
  });
}

function calcularETabelaTempoIdeal(tempoObjMap, totalPedidos, totalPecas) {
  // Converter segundos → “HH:mm:ss”
  function segParaHHMMSS(segundos) {
    const h = String(Math.floor(segundos / 3600)).padStart(2, "0");
    const m = String(Math.floor((segundos % 3600) / 60)).padStart(2, "0");
    const s = String(segundos % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  // 1) Extrai o tp80 de cada etapa (em segundos)
  const tp003 = (tempoObjMap["003"]?.tempo80 || 0) * totalPecas;
  const tp005 = (tempoObjMap["005"]?.tempo80 || 0) * totalPedidos;
  const tp006 = (tempoObjMap["006"]?.tempo80 || 0) * totalPedidos;

  // 2) Formata cada um em “HH:mm:ss”
  const tempoIdeal003 = segParaHHMMSS(Math.round(tp003));
  const tempoIdeal005 = segParaHHMMSS(Math.round(tp005));
  const tempoIdeal006 = segParaHHMMSS(Math.round(tp006));

  // 3) Preenche o <tbody id="tbodyTempoIdeal"> com 3 linhas
  const tbody = document.getElementById("tbodyTempoIdeal");
  if (!tbody) {
    console.warn("tbodyTempoIdeal não encontrado no DOM");
    return;
  }
  tbody.innerHTML = ""; // limpa antes

  // Cria função auxiliar para montar cada <tr>
  function montaLinha(etapa, tempoHH) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.etapa}</td>
      <td>${item.tempo_ideal}</td>
      <td>–</td>
      <td>–</td>
      <td>–</td>
      <td>–</td>
    `;
    return tr;
  }

  tbody.appendChild(montaLinha("003", tempoIdeal003));
  tbody.appendChild(montaLinha("005", tempoIdeal005));
  tbody.appendChild(montaLinha("006", tempoIdeal006));

  // 4) Exibe o “Tempo Ideal Total” em #displayTempoIdealTotal
  const totalSegundos = Math.round(tp003 + tp005 + tp006);
  const displayIdeal = document.getElementById("displayTempoIdealTotal");
  if (displayIdeal) displayIdeal.textContent = segParaHHMMSS(totalSegundos);

  // 5) (Opcional) Armazene em variável global se quiser usar noutro lugar
  window._tempoIdealTotalSegundos = totalSegundos;
}

async function enviarEtapaParaPlanilha(etapa) {
  try {
    const response = await fetch(
      "https://script.google.com/macros/s/AKfycbwLnP9MUhfHdVjeZZFNH_rkr2gJyxQwoHC4GvMtJSykcqYvhBzB8GeMVu2NH57yWNHp/exec",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          func: "registrarEtapaPickingBox",
          data: etapa,
        }),
      }
    );

    const json = await response.json();
    if (json.status === "ok") {
      console.log("✅ Etapa enviada:", etapa.id_etapa);
      return true;
    } else if (json.status === "duplicado") {
      console.log("ℹ️ Etapa já existente:", etapa.id_etapa);
      return true; // considera como sucesso
    } else {
      console.warn("⚠️ Erro ao enviar etapa:", json.message || json);
      return false;
    }
  } catch (error) {
    console.error("🚨 Erro ao enviar etapa via proxy:", error);
    return false;
  }
}

async function obterResumoPorMetodoEnvio(romaneio) {
  const { data, error } = await supabase
    .from("pedidos")
    .select("metodo_envio")
    .eq("romaneio", romaneio);

  if (error) {
    console.error("Erro ao buscar pedidos:", error);
    return {};
  }

  const contagem = {};

  data.forEach(({ metodo_envio }) => {
    const metodo = metodo_envio?.trim() || "Desconhecido";
    contagem[metodo] = (contagem[metodo] || 0) + 1;
  });

  return contagem;
}

async function gerarResumoVisualRomaneio() {
  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select("id, metodo_envio, status")
    .eq("romaneio", romaneio);

  if (error) {
    console.error("Erro ao buscar pedidos:", error);
    return;
  }

  const resumo = {}; // método => { sub: x, pesado: y, nl: z }

  pedidos.forEach((pedido) => {
    const metodo = (pedido.metodo_envio || "Outros")
      .replace("Correios", "")
      .trim()
      .toUpperCase();
    if (!resumo[metodo])
      resumo[metodo] = { sub: 0, pesado: 0, nl: 0, remessa: 0 };
    resumo[metodo].sub += 1;

    // Corrigido: usa o objeto de caixas que reflete o UI
    if (caixas[pedido.id]?.pesado) resumo[metodo].pesado += 1;
  });

  // Calcular NL por método
  for (const metodo in resumo) {
    const dados = resumo[metodo];
    dados.nl = dados.sub - dados.pesado;
    dados.remessa = Math.max(dados.pesado - dados.nl, 0);
  }

  // Preenche a tabela
  const corpo = document.getElementById("resumoTabelaEnvios");
  corpo.innerHTML = "";

  let totalSub = 0,
    totalPesado = 0,
    totalNL = 0;

  for (const metodo in resumo) {
    const { sub, pesado, nl, remessa } = resumo[metodo];
    totalSub += sub;
    totalPesado += pesado;
    totalNL += nl;

    const rowClass = nl > 0 ? "bg-warning-subtle" : "";

    corpo.innerHTML += `
  <tr class="${rowClass}">
    <td>${metodo}</td>
    <td class="bg-white text-center">${sub}</td>
    <td class="destacar-pesado">${pesado}</td>
    <td class="destacar-nl">${nl}</td>
    <td class="destacar-remessa text-center">
      ${remessa}
      <br />
      <button
        class="btn btn-sm btn-outline-secondary mt-1"
        onclick="exibirRastreiosPorMetodo('${metodo}')"
        title="Ver códigos de rastreio para ${metodo}"
      >
        📋 Ver Códigos
      </button>
    </td>
  </tr>
`;

    const btnRemessa = document.createElement("button");
    btnRemessa.textContent = "📋 Ver Códigos";
    btnRemessa.className = "btn btn-sm btn-outline-secondary";
    btnRemessa.addEventListener("click", () =>
      exibirRastreiosPorMetodo(metodo.toUpperCase())
    );
  }

  document.getElementById("resTotalSub").textContent = totalSub;
  document.getElementById("resTotalPesado").textContent = totalPesado;
  document.getElementById("resTotalNL").textContent = totalNL;
}

const toggleBtn = document.getElementById("resumoToggle");
const resumoCard = document.getElementById("resumoRomaneio");

toggleBtn.addEventListener("click", () => {
  const isOpen = resumoCard.style.display === "block";

  if (isOpen) {
    resumoCard.style.opacity = 0;
    setTimeout(() => {
      resumoCard.style.display = "none";
      toggleBtn.style.display = "block"; // mostra o botão
    }, 200);
  } else {
    resumoCard.style.display = "block";
    setTimeout(() => (resumoCard.style.opacity = 1), 10);
    toggleBtn.style.display = "none"; // esconde o botão
  }
});

// Fecha ao clicar fora
document.addEventListener("click", (e) => {
  if (
    !document.getElementById("resumoWrapper").contains(e.target) &&
    resumoCard.style.display === "block"
  ) {
    resumoCard.style.display = "none";
    toggleBtn.style.display = "block";
  }
});

document
  .getElementById("btnAbrirRemessaModal")
  .addEventListener("click", () => {
    window.open(
      "https://ge.kaisan.com.br/?page=meta/view&id_view=nfe_arquivo_remessa_conferencia&_menu_acessado=610",
      "_blank"
    );
  });

function atualizarProgresso(pecasBipadas, totalPecas) {
  const percentual =
    totalPecas > 0 ? Math.round((pecasBipadas / totalPecas) * 100) : 0;
  const barra = document.getElementById("progressoConferencia");
  const label = document.getElementById("labelProgresso");
  const bolha = document.getElementById("bolhaProgresso");

  // Atualiza a largura da barra
  barra.style.width = `${percentual}%`;
  barra.setAttribute("aria-valuenow", percentual);

  // Atualiza o texto no centro da barra
  label.textContent = `${pecasBipadas} de ${totalPecas} peças (${percentual}%)`;

  // Atualiza a bolha lateral
  bolha.innerHTML = `<span><strong>${percentual}%</strong><br><small>(${pecasBipadas}/${totalPecas})</small></span>`;

  // Cores semânticas
  if (percentual < 40) {
    barra.style.backgroundColor = "#dc3545"; // vermelho
    bolha.style.backgroundColor = "#dc3545";
  } else if (percentual < 80) {
    barra.style.backgroundColor = "#ffc107"; // amarelo
    bolha.style.backgroundColor = "#ffc107";
  } else {
    barra.style.backgroundColor = "#198754"; // verde
    bolha.style.backgroundColor = "#198754";
  }
}

function calcularPecasTotaisEBipadas() {
  const total = Object.values(caixas).reduce((acc, c) => acc + c.total, 0);
  const bipado = Object.values(caixas).reduce((acc, c) => acc + c.bipado, 0);
  return { total, bipado };
}

function atualizarProgressoPro(bipado, total, inicioTimestamp = null) {
  const perc = total > 0 ? Math.round((bipado / total) * 100) : 0;
  const barra = document.getElementById("progressoConferencia");
  const label = document.getElementById("labelProgresso");
  const bolha = document.getElementById("bolhaProgresso");
  const tempoRestante = document.getElementById("tempoRestante");
  const eficienciaEl = document.getElementById("eficienciaProgresso");

  barra.style.width = `${perc}%`;
  barra.setAttribute("aria-valuenow", perc);
  label.textContent = `${bipado} de ${total} peças (${perc}%)`;
  // Cores por progresso
  let cor = "#198754"; // verde
  if (perc < 40) cor = "#dc3545";
  else if (perc < 80) cor = "#ffc107";
  barra.style.backgroundColor = cor;
}

async function obterCodRastreio(pedidos) {
  if (!Array.isArray(pedidos) || pedidos.length === 0) return [];

  const { data, error } = await supabase
    .from("pedidos_rastreio")
    .select("id_pedido, cod_rastreio")
    .in("id_pedido", pedidos);

  if (error) {
    console.error("Erro ao buscar rastreios:", error);
    return [];
  }

  return data;
}

async function exibirRastreiosPorMetodo(metodo) {
  const { data: pedidos, error: errPedidos } = await supabase
    .from("pedidos")
    .select("id")
    .eq("romaneio", romaneio)
    .ilike("metodo_envio", `%${metodo}%`)
    .eq("status", "PESADO"); // ✅ só os PESADOS

  if (errPedidos || !pedidos || pedidos.length === 0) {
    return alert("Nenhum pedido PESADO encontrado para: " + metodo);
  }

  const pedidoIds = pedidos.map((p) => p.id);

  const { data: rastreios, error: errRast } = await supabase
    .from("pedidos_rastreio")
    .select("id_pedido, cod_rastreio")
    .in("id_pedido", pedidoIds);

  if (errRast || !rastreios || rastreios.length === 0) {
    return alert("Nenhum código de rastreio encontrado para " + metodo);
  }

  // Ordena por pedido
  rastreios.sort((a, b) => (a.id_pedido > b.id_pedido ? 1 : -1));

  const lista = rastreios
    .map((r) => r.cod_rastreio?.trim())
    .filter((r) => !!r)
    .join("\n");

  // Abre prompt com botão de cópia
  const textoFinal = `${lista}`;
  mostrarModalDeTextoCopiavel(textoFinal, metodo);
}

function mostrarModalDeTextoCopiavel(texto, metodo) {
  const linksRemessa = {
    SEDEX:
      "https://ge.kaisan.com.br/?page=nfe_arquivo_remessa/inicia_confere_remessa_transportadora&cod_bandeira=1&cod_loja=-1&cod_transportadora=2",
    PAC: "https://ge.kaisan.com.br/?page=nfe_arquivo_remessa/inicia_confere_remessa_transportadora&cod_bandeira=1&cod_loja=-1&cod_transportadora=1",
    "RETIRADA LOCAL":
      "https://ge.kaisan.com.br/?page=nfe_arquivo_remessa/inicia_confere_remessa_transportadora&cod_bandeira=1&cod_loja=-1&cod_transportadora=4",
  };

  const metodoNormalizado = metodo.toUpperCase();
  const urlRemessa = linksRemessa[metodoNormalizado] || null;

  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "10%";
  modal.style.left = "50%";
  modal.style.transform = "translateX(-50%)";
  modal.style.background = "#fff";
  modal.style.border = "1px solid #ccc";
  modal.style.padding = "20px";
  modal.style.zIndex = "9999";
  modal.style.width = "90%";
  modal.style.maxWidth = "600px";
  modal.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";
  modal.style.borderRadius = "8px";

  modal.innerHTML = `
    <div style="margin-bottom:10px;font-weight:bold;">Lista de Códigos de Rastreio – ${metodo}</div>
    <textarea id="textoRastreios" style="width:100%;height:300px;" readonly>${texto}</textarea>
    <div style="margin-top:10px;text-align:right; gap: 0.5rem;">
      <button id="btnCopiarTexto" class="btn btn-sm btn-primary">📋 Copiar</button>
      ${
        urlRemessa
          ? `<a href="${urlRemessa}" target="_blank" class="btn btn-sm btn-outline-dark">🚚 Gerar Remessa</a>`
          : ""
      }
      <button id="btnFecharModal" class="btn btn-sm btn-outline-secondary">Fechar</button>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById("btnCopiarTexto").addEventListener("click", () => {
    const textarea = document.getElementById("textoRastreios");
    textarea.select();
    document.execCommand("copy");
    alert("✅ Códigos copiados para a área de transferência!");
  });

  document.getElementById("btnFecharModal").addEventListener("click", () => {
    modal.remove();
  });
}

window.exibirRastreiosPorMetodo = exibirRastreiosPorMetodo;

function solicitarCestoNL() {
  return new Promise((resolve) => {
    const modal = new bootstrap.Modal(document.getElementById("cestoModal"));
    const input = document.getElementById("inputCestoNL");
    input.value = "";
    input.focus();

    const btn = document.getElementById("btnConfirmarCesto");

    const confirmar = () => {
      const valor = input.value.trim();
      if (valor) {
        modal.hide();
        resolve(valor);
      } else {
        alert("Digite um cesto válido.");
      }
    };

    btn.onclick = confirmar;
    input.onkeypress = (e) => {
      if (e.key === "Enter") confirmar();
    };

    modal.show();
  });
}

window.imprimirEtiquetaIndividual = function (pedido) {
  const etiqueta = document.querySelector(
    `.etiqueta-nl-print[data-pedido="${pedido}"]`
  );
  if (!etiqueta) return;

  const win = window.open("", "_blank");
  if (!win) return;

  win.document.write(`
    <html>
      <head>
        <title>Etiqueta NL - ${pedido}</title>
        <style>
          @page {
            size: 105mm 148mm;
            margin: 0;
          }

          body {
            margin: 0;
            padding: 0;
          }

          .etiqueta-nl-print {
            width: 105mm;
            height: 148mm;
            margin: 0;
            padding: 0;
          }
        </style>
      </head>
      <body>${etiqueta.outerHTML}</body>
      <script>
        window.onload = () => { window.print(); window.close(); };
      </script>
    </html>
  `);
  win.document.close();
};

document
  .getElementById("btnAtualizarEnderecos")
  ?.addEventListener("click", async () => {
    const confirmacao = confirm(
      "Deseja forçar a atualização dos endereços agora?"
    );
    if (!confirmacao) return;

    try {
      // Força atualização ignorando cache
      localStorage.removeItem("enderecamentos-cache");
      localStorage.removeItem("enderecamentos-cache-timestamp");

      mapaEnderecos = await carregarEnderecosComCache();

      // Atualiza objetos em `pendentes`
      pendentes.forEach((p) => {
        const key = p.sku?.trim().toUpperCase();
        const lista = mapaEnderecos[key] || [];
        p.endereco = lista.length ? lista.join(" • ") : "SEM LOCAL";
      });

      // Atualiza localStorage e UI
      localStorage.setItem(`pendentes-${romaneio}`, JSON.stringify(pendentes));
      renderPendentes();
      alert("✅ Endereços atualizados com sucesso!");
    } catch (err) {
      console.error("Erro ao atualizar endereços:", err);
      alert("❌ Erro ao atualizar endereços.");
    }
  });

window.abrirModalPesagemIndividual = function () {
  document.getElementById("inputPedidoManual").value = "";
  document.getElementById("infoPedidoManual").textContent = "";
  const modal = new bootstrap.Modal(
    document.getElementById("modalPesagemIndividual")
  );
  modal.show();
};

carregarEnderecosComCache()
  .then((resultado) => {
    window.mapaEnderecos = resultado;
  })
  .catch((err) => {
    console.error("Erro ao carregar mapaEnderecos:", err);
    window.mapaEnderecos = {};
  });

async function pesarPedidoManual() {
  const pedidoId = document.getElementById("inputPedidoManual").value.trim();
  if (!pedidoId) return alert("Digite o número do pedido");

  // 1. Busca cod_nfe
  const { data: pedidoNfe } = await supabase
    .from("pedidos_nfe")
    .select("cod_nfe")
    .eq("pedido_id", pedidoId)
    .maybeSingle();

  if (!pedidoNfe) {
    document.getElementById("infoPedidoManual").textContent =
      "❌ Pedido não encontrado na tabela pedidos_nfe.";
    return;
  }

  const codNfe = pedidoNfe.cod_nfe;

  // 2. Marca como PESADO
  await supabase
    .from("pedidos")
    .update({ status: "PESADO" })
    .eq("id", pedidoId);

  // 3. Abre GE
  const url = `https://ge.kaisan.com.br/index2.php?page=meta/view&id_view=nfe_pedido_conf&acao_view=cadastra&cod_del=${codNfe}&where=cod_nfe_pedido=${codNfe}#prodweightsomaproduto`;
  window.open(url, "_blank");

  // 4. Busca rastreios
  const { data: rastreios } = await supabase
    .from("pedidos_rastreio")
    .select("cod_rastreio")
    .eq("id_pedido", pedidoId);

  if (!rastreios || rastreios.length === 0) {
    alert(
      `ℹ️ Pedido ${pedidoId} marcado como PESADO, mas nenhum rastreio foi encontrado.`
    );
    return;
  }

  // 5. Buscar transportadora do pedido
  const { data: pedidoData } = await supabase
    .from("pedidos")
    .select("metodo_envio")
    .eq("id", pedidoId)
    .maybeSingle();

  const transportadora =
    pedidoData?.metodo_envio?.trim().toUpperCase() || "DESCONHECIDA";

  // 6. Armazena os rastreios agrupados por transportadora
  window.rastreiosManuaisPorTransp = window.rastreiosManuaisPorTransp || {};

  if (!window.rastreiosManuaisPorTransp[transportadora]) {
    window.rastreiosManuaisPorTransp[transportadora] = [];
  }

  rastreios.forEach((r) => {
    const cod = r.cod_rastreio?.trim();
    if (cod) {
      window.rastreiosManuaisPorTransp[transportadora].push(cod);
    }
  });

  alert(
    `✅ Pedido ${pedidoId} marcado como PESADO.\n${rastreios.length} rastreio(s) armazenado(s) para ${transportadora}.`
  );
}

document
  .getElementById("btnPesarManual")
  ?.addEventListener("click", pesarPedidoManual);

// Ativa Enter para pesar diretamente
document
  .getElementById("inputPedidoManual")
  .addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      pesarPedidoManual(); // dispara a função diretamente
    }
  });

window.abrirModalRastreiosManuais = async function () {
  const { data, error } = await supabase
    .from("pedidos_rastreio")
    .select("id_pedido, cod_rastreio, transportadora")
    .eq("manual", true); // ou use .eq("manual", "sim") se for texto

  if (error || !data || data.length === 0) {
    alert("❌ Nenhum rastreio manual encontrado.");
    return;
  }

  // Agrupa por transportadora
  const mapa = {};
  data.forEach((item) => {
    const transp = item.transportadora?.toUpperCase().trim() || "DESCONHECIDA";
    if (!mapa[transp]) mapa[transp] = [];
    mapa[transp].push(item.cod_rastreio.trim());
  });

  // Preenche o <select>
  const select = document.getElementById("selectTransportadoraManual");
  select.innerHTML = '<option value="">Selecione a transportadora</option>';

  Object.keys(mapa)
    .sort()
    .forEach((nome) => {
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = `${nome} (${mapa[nome].length})`;
      select.appendChild(opt);
    });

  // Quando trocar o select, atualiza a textarea
  select.onchange = () => {
    const lista = mapa[select.value] || [];
    document.getElementById("textareaRastreiosManuais").value =
      lista.join("\n");
  };

  // Abre o modal
  const modal = new bootstrap.Modal(
    document.getElementById("modalRastreiosManuais")
  );
  modal.show();
};

window.copiarRastreiosManuais = () => {
  const text = document.getElementById("textareaRastreiosManuais").value;
  if (!text) return alert("Nenhum rastreio para copiar.");
  navigator.clipboard
    .writeText(text)
    .then(() => alert("✅ Rastreios copiados!"))
    .catch((err) => alert("❌ Falha ao copiar."));
};

function mostrarRastreiosManuaisAgrupados() {
  const mapa = window.rastreiosManuaisPorTransp || {};
  const linhas = Object.entries(mapa)
    .map(([transp, codigos]) => `📦 ${transp}:\n${codigos.join("\n")}`)
    .join("\n\n");

  alert(`📋 Rastreios manuais agrupados:\n\n${linhas}`);
}

window.mostrarRastreiosManuaisAgrupados = function () {
  const mapa = window.rastreiosManuaisPorTransp || {};
  const container = document.getElementById("containerRastreiosAgrupados");
  container.innerHTML = "";

  const transps = Object.keys(mapa);
  if (!transps.length) {
    container.innerHTML = `<div class="alert alert-warning">Nenhum rastreio manual armazenado ainda.</div>`;
    const modal = new bootstrap.Modal(
      document.getElementById("modalRastreiosAgrupados")
    );
    modal.show();
    return;
  }

  transps.forEach((transp) => {
    const lista = mapa[transp] || [];

    const card = document.createElement("div");
    card.className = "mb-4 p-3 border rounded shadow-sm bg-light";

    card.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="mb-0">📦 ${transp}</h6>
        <button class="btn btn-sm btn-outline-primary" onclick="copiarRastreiosTransp('${transp}')">📋 Copiar</button>
      </div>
      <textarea class="form-control" rows="6" readonly style="font-family: monospace;">${lista.join(
        "\n"
      )}</textarea>
    `;

    container.appendChild(card);
  });

  const modal = new bootstrap.Modal(
    document.getElementById("modalRastreiosAgrupados")
  );
  modal.show();
};

window.copiarRastreiosTransp = function (transp) {
  const lista = window.rastreiosManuaisPorTransp?.[transp] || [];
  if (!lista.length) return alert("Nenhum rastreio para copiar.");
  navigator.clipboard
    .writeText(lista.join("\n"))
    .then(() => alert(`✅ Rastreios de ${transp} copiados!`))
    .catch(() => alert("❌ Falha ao copiar rastreios."));
};

function reconstruirTabelaResumo() {
  const tbody = document.getElementById("tbodyTempoIdeal");
  if (!tbody || !Array.isArray(window.resumo)) return;

  tbody.innerHTML = "";

  window.resumo.forEach((item) => {
    const tr = document.createElement("tr");

    // Calcula eficiência se possível
    const idealSegundos = converterStringParaSegundos(
      item.tempoIdeal || "00:00:00"
    );
    const realSegundos = converterStringParaSegundos(item.tempo || "00:00:00");

    let eficiencia = "";
    let classeEf = "";

    if (realSegundos > 0 && idealSegundos > 0) {
      const pct = Math.round((idealSegundos / realSegundos) * 100);
      eficiencia = `${pct}%`;

      if (pct >= 100) {
        classeEf = "text-success fw-bold";
      } else if (pct >= 80) {
        classeEf = "text-warning fw-bold";
      } else {
        classeEf = "text-danger fw-bold";
      }
    }

    tr.innerHTML = `
      <td>${item.etapa || "—"}</td>
      <td>${item.tempoIdeal || "—"}</td>
      <td>${item.inicio || "—"}</td>
      <td>${item.fim || "—"}</td>
      <td>${item.tempo || "—"}</td>
      <td class="${classeEf}">${eficiencia}</td>
    `;

    tbody.appendChild(tr);
  });

  // Atualiza tempo total ideal e real
  const idealSegsTotal = window.resumo.reduce(
    (acc, e) => acc + converterStringParaSegundos(e.tempoIdeal || "00:00:00"),
    0
  );
  const realSegsTotal = window.resumo.reduce(
    (acc, e) => acc + converterStringParaSegundos(e.tempo || "00:00:00"),
    0
  );

  const elIdeal = document.getElementById("displayTempoIdealTotal");
  const elReal = document.getElementById("displayTempoTotal");

  if (elIdeal)
    elIdeal.textContent = converterSegundosParaString(idealSegsTotal);
  if (elReal) elReal.textContent = converterSegundosParaString(realSegsTotal);
}
