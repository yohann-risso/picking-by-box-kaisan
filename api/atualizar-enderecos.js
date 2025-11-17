export default async function handler(req, res) {
  try {
    const skus = req.query.skus;
    if (!skus) {
      return res.status(400).json({ error: "Nenhum SKU enviado." });
    }

    const GAS_URL =
      "https://script.google.com/macros/s/AKfycbzEYYSWfRKYGxAkNFBBV9C6qlMDXlDkEQIBNwKOtcvGEdbl4nfaHD5usa89ZoV2gMcEgA/exec" +
      "?skus=" +
      encodeURIComponent(skus);

    const r = await fetch(GAS_URL);
    const json = await r.json();

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(json);
  } catch (err) {
    console.error("Erro proxy GAS:", err);
    return res.status(500).json({ error: "Erro interno ao chamar o GAS." });
  }
}
