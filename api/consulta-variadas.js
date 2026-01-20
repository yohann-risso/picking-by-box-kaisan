// /api/consulta-variadas.js
export default async function handler(req, res) {
  try {
    const skus = req.query.skus;
    if (!skus) {
      return res.status(400).json({ error: "Nenhum SKU enviado." });
    }

    const GAS_URL =
      "https://script.google.com/macros/s/AKfycbxOYOB5RBgHfHzGv_maR8B7KJMSOY51pf56gjI169WdeD4FQliH4DVNtlhjDCQfX0kO/exec" +
      "?skus=" +
      encodeURIComponent(skus);

    const r = await fetch(GAS_URL);
    const json = await r.json();

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(json);
  } catch (err) {
    console.error("Erro proxy consulta-variadas:", err);
    return res.status(500).json({
      error: "Erro interno ao consultar GAS variadas.",
      detalhe: err.message,
    });
  }
}
