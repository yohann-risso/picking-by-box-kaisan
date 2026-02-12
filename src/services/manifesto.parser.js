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

function getFromTbCabecalho(doc, label) {
  const table = doc.querySelector("table.tb_cabecalho");
  if (!table) return "";

  const want = normalizeLabel(label);

  const clean = (s) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  const norm = (s) => normalizeLabel(clean(s)).replace(/:$/, "");

  const trs = Array.from(table.querySelectorAll("tr"));
  for (const tr of trs) {
    const tds = Array.from(tr.querySelectorAll("td"));
    for (let i = 0; i < tds.length; i++) {
      const cellTxt = norm(tds[i].textContent);

      // pega tanto "usuario" quanto "usuario:" e também quando vem com <b> dentro
      if (cellTxt === want || cellTxt.includes(want)) {
        const next = clean(tds[i + 1]?.textContent);
        if (next) return next;

        // fallback: label e valor no mesmo td: "Usuário: Fulano"
        const raw = clean(tds[i].textContent);
        const same = raw.replace(/^[^:]*:\s*/i, "").trim();
        if (same) return same;
      }
    }
  }
  return "";
}

export function parseRemessaHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const textAll = doc.body?.innerText || "";

  const remessaFromTitle =
    (textAll.match(/Pedidos da remessa\s*\((\d+)\)/i) || [])[1] || "";

  const endereco =
    findAfter(textAll, "Endereço:") ||
    "RUA RUFINO SIQUEIRA, 1 - CONSELHEIRO PAULINO - NOVA FRIBURGO/RJ - 28635-500";
  const usuario =
    getFromTbCabecalho(doc, "Usuário") ||
    getFromTbCabecalho(doc, "Operador") ||
    "";

  const dataColeta =
    getFromTbCabecalho(doc, "Dt coleta") ||
    getFromTbCabecalho(doc, "Data da Coleta") ||
    findAfter(textAll, "Dt coleta:") ||
    findAfter(textAll, "Data da Coleta:");
  const transportadoraDetalhe =
    getFromTbCabecalho(doc, "Transportadora") ||
    findAfter(textAll, "Transportadora:");

  // tenta inferir nome “macro” da transportadora (Correios/Loggi/etc)
  let transportadora = "";

  // prioridade total: o valor do cabeçalho (Transportadora: ...)
  const td = String(transportadoraDetalhe || "").toLowerCase();

  if (
    td.includes("retirar") ||
    td.includes("retirada") ||
    td.includes("local")
  ) {
    transportadora = "Retirada Local";
  } else if (td.includes("loggi")) {
    transportadora = "Loggi";
  } else if (td.includes("correios") || /pac|sedex/i.test(td)) {
    transportadora = "Correios";
  } else {
    // fallback final: só se não tiver transportadoraDetalhe
    const h1 = Array.from(doc.querySelectorAll("h1"))
      .map((h) => (h.textContent || "").trim())
      .filter(Boolean)
      .join(" ");
    if (/correios/i.test(h1)) transportadora = "Correios";
    else if (/loggi/i.test(h1)) transportadora = "Loggi";
    else transportadora = "";
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

  // ===== 1. Retirada Local primeiro (mais específico) =====
  if (t.includes("retirar") || t.includes("retirada") || t.includes("local")) {
    return "Retirada Local";
  }

  // ===== 2. Loggi =====
  if (t.includes("loggi")) {
    return "Loggi";
  }

  // ===== 3. Correios =====
  if (t.includes("correios") || /pac|sedex/i.test(t)) {
    return "Correios";
  }

  // fallback por método das linhas
  const anyMetodo = rows.find((r) =>
    /pac|sedex/i.test(String(r.metodo_envio || "")),
  );

  if (anyMetodo) return "Correios";

  // ===== default =====
  return transportadoraRaw
    ? capitalizeWords(transportadoraRaw)
    : "Transportadora";
}

/* ---------------- helpers ---------------- */

function normalizeLabel(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getUsuarioFromGeHeader(doc, textAll = "") {
  const wantKeys = ["usuario", "usuário", "operador"];

  const clean = (s) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  const norm = (s) => normalizeLabel(clean(s)).replace(/:$/, "");

  // A) Busca por tb_cabecalho (quando existe)
  const tb = doc.querySelector("table.tb_cabecalho");
  if (tb) {
    const v = findLabelValueInTable(tb, wantKeys);
    if (v) return v;
  }

  // B) Busca por QUALQUER tabela (Sheets IMPORTHTML "table";N)
  const tables = Array.from(doc.querySelectorAll("table"));
  for (const t of tables) {
    const v = findLabelValueInTable(t, wantKeys);
    if (v) return v;
  }

  // C) Busca por <b>/<strong> "Usuário:" e pega td/linha vizinha
  const bolds = Array.from(doc.querySelectorAll("b,strong"));
  for (const b of bolds) {
    const k = norm(b.textContent);
    if (wantKeys.includes(k)) {
      const td = b.closest("td");
      const tr = td?.closest("tr");
      if (tr) {
        const tds = Array.from(tr.querySelectorAll("td"));
        const idx = td ? tds.indexOf(td) : -1;
        const next = idx >= 0 ? clean(tds[idx + 1]?.textContent) : "";
        if (next) return next;
      }

      // fallback: "Usuário: Fulano" no mesmo td
      const tdRaw = clean(td?.textContent);
      const same = tdRaw.replace(/^[^:]*:\s*/i, "").trim();
      if (same) return same;
    }
  }

  // D) Regex no texto total
  const m =
    textAll.match(/Usu[aá]rio:\s*([^\n]+)/i) ||
    textAll.match(/Operador:\s*([^\n]+)/i);
  if (m && m[1]) return clean(m[1]);

  return "";
}

function findLabelValueInTable(tableEl, wantKeys) {
  const clean = (s) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  const norm = (s) => normalizeLabel(clean(s)).replace(/:$/, "");

  const rows = Array.from(tableEl.querySelectorAll("tr"));
  for (const tr of rows) {
    const cells = Array.from(tr.querySelectorAll("th,td")).map((c) =>
      clean(c.textContent),
    );

    for (let i = 0; i < cells.length; i++) {
      const k = norm(cells[i]);
      if (!k) continue;

      // pega "usuario"/"operador" mesmo se vier colado tipo "Usuário:"
      if (wantKeys.includes(k) || wantKeys.some((w) => k.includes(w))) {
        const next = (cells[i + 1] || "").trim();
        if (next) return next;

        // caso "Usuário: Fulano" na mesma célula
        const same = cells[i].replace(/^[^:]*:\s*/i, "").trim();
        if (same && normalizeLabel(same) !== k) return same;
      }
    }
  }
  return "";
}

function getCabecalhoValueLikeSheets(doc, label) {
  const want = normalizeLabel(label);

  // 1) tenta a tb_cabecalho primeiro
  const table =
    doc.querySelector("table.tb_cabecalho") || doc.querySelectorAll("table")[0]; // fallback: primeira tabela

  if (!table) return "";

  const rows = Array.from(table.querySelectorAll("tr"));
  for (const tr of rows) {
    const cells = Array.from(tr.querySelectorAll("td,th")).map((c) =>
      String(c.textContent || "")
        .replace(/\s+/g, " ")
        .trim(),
    );

    // varre as células e procura o label ("Usuário", "Operador", etc)
    for (let i = 0; i < cells.length; i++) {
      const cellNorm = normalizeLabel(cells[i]).replace(/:$/, "");
      if (cellNorm === want || cellNorm.includes(want)) {
        // pega a célula seguinte (Col4 se o label estiver em Col3)
        const next = (cells[i + 1] || "").trim();
        if (next) return next;
      }
    }
  }

  return "";
}

function getCabecalhoValue(doc, label, textAllFallback = "") {
  const want = normalizeLabel(label);

  const clean = (s) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim();

  // 1) Tenta pela tb_cabecalho (mais comum)
  const table = doc.querySelector("table.tb_cabecalho");
  if (table) {
    const tds = Array.from(table.querySelectorAll("td"));

    for (let i = 0; i < tds.length; i++) {
      const raw = clean(tds[i].textContent);
      const txt = normalizeLabel(raw);

      if (txt.includes(want)) {
        // valor no próximo td
        const next = clean(tds[i + 1]?.textContent);
        if (next) return next;

        // valor no mesmo td (ex: "Usuário: Gabriel")
        const same = raw.replace(/^[^:]*:\s*/i, "").trim();
        if (same && normalizeLabel(same) !== want) return same;
      }
    }
  }

  // 2) Busca por <b>/<strong> com "Usuário:" e pega o TD ao lado
  const bolds = Array.from(doc.querySelectorAll("b,strong"));
  for (const b of bolds) {
    const bTxt = normalizeLabel(clean(b.textContent)).replace(/:$/, "");
    if (!bTxt) continue;

    if (bTxt === want) {
      const td = b.closest("td");
      if (td) {
        const tr = td.closest("tr");
        if (tr) {
          const cells = Array.from(tr.querySelectorAll("td"));
          const idx = cells.indexOf(td);
          if (idx >= 0) {
            const next = clean(cells[idx + 1]?.textContent);
            if (next) return next;
          }
        }

        // fallback: pega o texto do próprio td sem o "Usuário:"
        const tdRaw = clean(td.textContent);
        const cleaned = tdRaw.replace(/^[^:]*:\s*/i, "").trim();
        if (cleaned && normalizeLabel(cleaned) !== want) return cleaned;
      }
    }
  }

  // 3) Busca por qualquer TD contendo "Usuário:" e tenta extrair
  const allTds = Array.from(doc.querySelectorAll("td"));
  for (let i = 0; i < allTds.length; i++) {
    const raw = clean(allTds[i].textContent);
    const txt = normalizeLabel(raw);

    if (txt.startsWith(want + ":")) {
      const cleaned = raw.replace(/^[^:]*:\s*/i, "").trim();
      if (cleaned) return cleaned;

      const next = clean(allTds[i + 1]?.textContent);
      if (next) return next;
    }
  }

  // 4) Regex fallback no texto geral — agora cobrindo variações
  if (textAllFallback) {
    const m =
      textAllFallback.match(/Usu[aá]rio:\s*([^\n]+)/i) ||
      textAllFallback.match(/Operador:\s*([^\n]+)/i) ||
      textAllFallback.match(/Usu[aá]rio respons[aá]vel:\s*([^\n]+)/i);

    if (m && m[1]) return String(m[1]).trim();
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
