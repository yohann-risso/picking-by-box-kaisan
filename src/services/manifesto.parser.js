const BASE_URL =
  "https://ge.kaisan.com.br/index2.php?_show_csv=1&_show_pdf=1&func=class__nfe_arquivo_remessa__gera_pdf_romaneio_remessa&html=1";

export async function fetchRemessaHtml(ctr_cod_arquivo_remessa, cookie = "") {
  // Passa pelo proxy do Vercel pra evitar CORS
  const url = `/api/ge-remessa?ctr_cod_arquivo_remessa=${encodeURIComponent(
    ctr_cod_arquivo_remessa,
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
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

  const endereco = findAfter(textAll, "Endereço:");
  const transportadora = findAfter(textAll, "Transportadora:");
  const dataColeta = findAfter(textAll, "Data da Coleta:");

  // pega a maior tabela “de itens”
  const tables = Array.from(doc.querySelectorAll("table"));
  const table = pickBestItemsTable(tables);

  if (!table) return { endereco, transportadora, dataColeta, rows: [] };

  const rows = [];
  const trs = Array.from(table.querySelectorAll("tr"));

  // tenta achar linha de header
  const headerIdx = trs.findIndex((tr) => {
    const ths = tr.querySelectorAll("th");
    return ths.length >= 6;
  });

  const dataTrs = trs.slice(Math.max(0, headerIdx + 1));

  for (const tr of dataTrs) {
    const tds = Array.from(tr.querySelectorAll("td")).map((td) =>
      (td.textContent || "").replace(/\s+/g, " ").trim(),
    );
    if (tds.length < 6) continue;

    // Heurística: layout do seu PDF final tem essas colunas:
    // Destinatário | CEP | Rastreio | Peso | Pedido | V.D. | Método | Remessa | Operador
    // Alguns htmls podem vir sem operador ou sem método; tratamos com fallback.
    const [
      destinatario,
      cep,
      rastreio,
      peso,
      pedido,
      vd,
      metodo_envio,
      remessa,
      operador,
    ] = normalizeCellsTo9(tds);

    // evita linhas “TOTAL/RESUMO”
    if (
      String(destinatario).toUpperCase() === "TOTAL" ||
      String(destinatario).toUpperCase().includes("RESUMO")
    ) {
      continue;
    }

    rows.push({
      destinatario,
      cep,
      rastreio,
      peso,
      pedido,
      vd,
      metodo_envio,
      remessa,
      operador,
    });
  }

  return { endereco, transportadora, dataColeta, rows };
}

export function normalizarTransportadora(transportadoraRaw, rows = []) {
  const t = String(transportadoraRaw || "")
    .trim()
    .toLowerCase();

  // regra pedida: Correios PAC + SEDEX = Correios
  // (no seu modelo de manifesto dos Correios, a transportadora no topo é "Correios"
  // e no resumo embaixo quebra PAC/SEDEX) :contentReference[oaicite:3]{index=3}
  if (t.includes("correios") || /pac|sedex/i.test(t)) return "Correios";

  // fallback: se método contém PAC/SEDEX e transportadora veio vazia/estranha
  const anyMetodo = rows.find((r) => /pac|sedex/i.test(r.metodo_envio || ""));
  if (anyMetodo) return "Correios";

  if (t.includes("loggi")) return "Loggi";

  // default: devolve capitalizado
  return transportadoraRaw
    ? capitalizeWords(transportadoraRaw)
    : "Transportadora";
}

/* ---------------- helpers ---------------- */

function findAfter(textAll, label) {
  const idx = textAll.indexOf(label);
  if (idx < 0) return "";
  const chunk = textAll.slice(idx + label.length).trim();
  // pega até quebra de linha
  return (chunk.split("\n")[0] || "").trim();
}

function pickBestItemsTable(tables) {
  // escolhe a tabela com mais linhas e que contenha "CEP" e "Código" ou "Rastreio"
  let best = null;
  let bestScore = -1;

  for (const tb of tables) {
    const txt = (tb.innerText || "").toLowerCase();
    const rows = tb.querySelectorAll("tr").length;
    const score =
      rows +
      (txt.includes("cep") ? 20 : 0) +
      (txt.includes("código") || txt.includes("rastre") ? 20 : 0) +
      (txt.includes("destinat") ? 10 : 0);

    if (score > bestScore) {
      bestScore = score;
      best = tb;
    }
  }
  return best;
}

function normalizeCellsTo9(tds) {
  // se já tem 9, ok
  if (tds.length >= 9) return tds.slice(0, 9);

  // se tem 8, assume sem operador
  if (tds.length === 8) return [...tds, ""];

  // se tem 7, assume sem operador e sem remessa (ou método)
  if (tds.length === 7)
    return [tds[0], tds[1], tds[2], tds[3], tds[4], tds[5], tds[6], "", ""];

  // se tem 6, assume mínimo
  if (tds.length === 6)
    return [tds[0], tds[1], tds[2], tds[3], tds[4], tds[5], "", "", ""];

  // fallback geral
  const out = Array(9).fill("");
  for (let i = 0; i < Math.min(9, tds.length); i++) out[i] = tds[i];
  return out;
}

function capitalizeWords(s) {
  return String(s)
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}
