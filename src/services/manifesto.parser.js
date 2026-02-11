const BASE_URL =
  "https://ge.kaisan.com.br/index2.php?_show_csv=1&_show_pdf=1&func=class__nfe_arquivo_remessa__gera_pdf_romaneio_remessa&html=1";

export async function fetchRemessaHtml(ctr_cod_arquivo_remessa, cookie = "") {
  const url = `/api/ge-remessa?ctr_cod_arquivo_remessa=${encodeURIComponent(
    ctr_cod_arquivo_remessa,
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cookie }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${t}`.slice(0, 220));
  }
  return await res.text();
}

export function parseRemessaHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const textAll = doc.body?.innerText || "";

  const remessaFromTitle =
    (textAll.match(/Pedidos da remessa\s*\((\d+)\)/i) || [])[1] || "";

  const endereco = findAfter(textAll, "Endereço:");
  const usuario = getCabecalhoValue(doc, "Usuário");
  const dataColeta =
    getCabecalhoValue(doc, "Dt coleta") || findAfter(textAll, "Dt coleta:");
  const transportadoraDetalhe =
    getCabecalhoValue(doc, "Transportadora") ||
    findAfter(textAll, "Transportadora:");

  // tenta inferir nome “macro” da transportadora (Correios/Loggi/etc)
  let transportadora = "";
  if (
    /correios/i.test(transportadoraDetalhe) ||
    /pac|sedex/i.test(transportadoraDetalhe)
  ) {
    transportadora = "Correios";
  } else if (/loggi/i.test(transportadoraDetalhe) || /loggi/i.test(textAll)) {
    transportadora = "Loggi";
  } else {
    // fallback: tenta pelo h1 (ex: "Correios" aparece no h1)
    const h1 = Array.from(doc.querySelectorAll("h1"))
      .map((h) => (h.textContent || "").trim())
      .filter(Boolean)
      .join(" ");
    if (/correios/i.test(h1)) transportadora = "Correios";
    else if (/loggi/i.test(h1)) transportadora = "Loggi";
  }

  // pega a maior tabela “de itens”
  const tables = Array.from(doc.querySelectorAll("table"));
  const table = pickBestItemsTable(tables);

  if (!table) {
    return {
      endereco,
      transportadora,
      transportadoraDetalhe,
      dataColeta,
      usuario,
      remessaFromTitle,
      rows: [],
    };
  }

  const rows = [];
  const trs = Array.from(table.querySelectorAll("tr"));

  function normHeader(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildHeaderMap(tr) {
    const cells = Array.from(tr.querySelectorAll("th,td")).map((c) =>
      normHeader(c.textContent),
    );

    const idx = (keys) => {
      for (const k of keys) {
        const i = cells.findIndex((h) => h.includes(k));
        if (i >= 0) return i;
      }
      return -1;
    };

    return {
      destinatario: idx(["destinat"]),
      cep: idx(["cep"]),
      rastreio: idx([
        "rastre",
        "codigo de rastreio",
        "rastreamento",
        "codigo",
        "objeto",
      ]),
      peso: idx(["peso"]),
      pedido: idx(["pedido"]),
      vd: idx(["v.d", "vd", "valor declarado", "valor da mercadoria", "valor"]),
      // normalmente não existe em Correios por linha
      metodo_envio: idx(["metodo", "servico", "envio"]),
      remessa: idx(["remessa"]),
      operador: idx(["operador", "usuario"]),
    };
  }

  function getBy(map, tds, key) {
    const i = map[key];
    return i >= 0 && i < tds.length ? tds[i] : "";
  }

  const headerIdx = trs.findIndex(
    (tr) => tr.querySelectorAll("th").length >= 4,
  );
  if (headerIdx < 0) {
    return {
      endereco,
      transportadora,
      transportadoraDetalhe,
      dataColeta,
      usuario,
      remessaFromTitle,
      rows: [],
    };
  }

  const headerMap = buildHeaderMap(trs[headerIdx]);
  const dataTrs = trs.slice(headerIdx + 1);

  for (const tr of dataTrs) {
    const tds = Array.from(tr.querySelectorAll("td")).map((td) =>
      (td.textContent || "").replace(/\s+/g, " ").trim(),
    );
    if (tds.length < 3) continue;

    // ignora linhas de resumo do GE (colspan)
    if (tr.querySelector("[colspan]")) continue;

    const row = {
      destinatario: getBy(headerMap, tds, "destinatario"),
      cep: getBy(headerMap, tds, "cep"),
      rastreio: getBy(headerMap, tds, "rastreio"),
      peso: getBy(headerMap, tds, "peso"),
      pedido: getBy(headerMap, tds, "pedido"),
      vd: getBy(headerMap, tds, "vd"),

      // se não tiver por linha, usamos o cabeçalho
      metodo_envio:
        getBy(headerMap, tds, "metodo_envio") || transportadoraDetalhe || "",
      remessa: getBy(headerMap, tds, "remessa") || remessaFromTitle || "",
      operador: getBy(headerMap, tds, "operador") || usuario || "",
    };

    if (!row.pedido && !row.rastreio) continue;
    if (String(row.destinatario).toUpperCase() === "TOTAL") continue;

    rows.push(row);
  }

  return {
    endereco,
    transportadora,
    transportadoraDetalhe,
    dataColeta,
    usuario,
    remessaFromTitle,
    rows,
  };
}

export function normalizarTransportadora(transportadoraRaw, rows = []) {
  const t = String(transportadoraRaw || "")
    .trim()
    .toLowerCase();
  if (t.includes("correios") || /pac|sedex/i.test(t)) return "Correios";
  const anyMetodo = rows.find((r) => /pac|sedex/i.test(r.metodo_envio || ""));
  if (anyMetodo) return "Correios";
  if (t.includes("loggi")) return "Loggi";
  return transportadoraRaw
    ? capitalizeWords(transportadoraRaw)
    : "Transportadora";
}

/* ---------------- helpers ---------------- */

function normalizeLabel(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/\s+/g, " ")
    .trim();
}

function getCabecalhoValue(doc, label) {
  // label: "usuario", "dt coleta", "transportadora", "telefone", etc.
  const want = normalizeLabel(label);

  const table = doc.querySelector("table.tb_cabecalho");
  if (!table) return "";

  const tds = Array.from(table.querySelectorAll("td"));
  for (let i = 0; i < tds.length; i++) {
    const txt = normalizeLabel(tds[i].textContent);
    // casa por "usuario:" ou "usuario"
    if (txt.includes(want)) {
      const next = tds[i + 1];
      return (next?.textContent || "").replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

function findAfter(textAll, label) {
  const idx = textAll.indexOf(label);
  if (idx < 0) return "";
  const chunk = textAll.slice(idx + label.length).trim();
  return (chunk.split("\n")[0] || "").trim();
}

function pickBestItemsTable(tables) {
  let best = null;
  let bestScore = -1;

  for (const tb of tables) {
    const txt = (tb.innerText || "").toLowerCase();
    const rows = tb.querySelectorAll("tr").length;
    const score =
      rows +
      (txt.includes("cep") ? 20 : 0) +
      (txt.includes("rastre") || txt.includes("rastreamento") ? 20 : 0) +
      (txt.includes("destinat") ? 10 : 0);

    if (score > bestScore) {
      bestScore = score;
      best = tb;
    }
  }
  return best;
}

function capitalizeWords(s) {
  return String(s)
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}
