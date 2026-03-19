export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ status: "error", message: "Method not allowed" });
  }

  try {
    const GAS_SAVE_PDF_URL =
      "https://script.google.com/macros/s/AKfycbzw2FRfSAkuGKMr68re8xpelc8kVURHhj03dm88UPSgTEt80qI_IVB9GoTRq_YhvP9d/exec";

    if (!req.body?.filename || !req.body?.base64) {
      return res.status(400).json({
        status: "error",
        message: "Payload inválido. filename e base64 são obrigatórios.",
      });
    }

    const response = await fetch(GAS_SAVE_PDF_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(500).json({
        status: "error",
        message: `Resposta inválida do GAS: ${text}`,
      });
    }

    if (!response.ok || json?.status !== "ok") {
      return res.status(500).json({
        status: "error",
        message: json?.message || "Erro ao salvar no Drive via GAS",
      });
    }

    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message || "Erro interno ao salvar PDF no Drive",
    });
  }
}
