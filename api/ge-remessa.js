export default async function handler(req, res) {
  try {
    const { ctr_cod_arquivo_remessa } = req.query;

    if (!ctr_cod_arquivo_remessa) {
      res.status(400).send("Missing ctr_cod_arquivo_remessa");
      return;
    }

    const body = req.method === "POST" ? req.body || {} : {};
    const cookie = String(body.cookie || "").trim();

    const target =
      `https://ge.kaisan.com.br/index2.php` +
      `?_show_csv=1&_show_pdf=1&func=class__nfe_arquivo_remessa__gera_pdf_romaneio_remessa` +
      `&ctr_cod_arquivo_remessa=${encodeURIComponent(ctr_cod_arquivo_remessa)}` +
      `&html=1`;

    const r = await fetch(target, {
      headers: {
        // passa cookie se fornecido
        ...(cookie ? { cookie } : {}),
        "user-agent": "Mozilla/5.0 (ManifestoBot)",
        accept: "text/html,*/*",
      },
    });

    const text = await r.text();

    if (!r.ok) {
      res
        .status(r.status)
        .send(text?.slice(0, 2000) || `Upstream error ${r.status}`);
      return;
    }

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.status(200).send(text);
  } catch (e) {
    res.status(500).send(e?.message || "Internal error");
  }
}
