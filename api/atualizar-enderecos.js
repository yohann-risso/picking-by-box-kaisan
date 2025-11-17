export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ status: "error", message: "Método não permitido" });
  }

  const GAS_WEB_APP_URL =
    "https://script.google.com/macros/s/AKfycbymQwy2XDKVGYQF0Cc1QNqVSdfLQ1ThC5mtogO3v_Ayde1d-Eb-ObvizSarMMWQlFCP/exec";
  const GAS_TOKEN =
    "mFa7kVRyLpT4xZq32uEXWJgHoMb58nPCvtKhALNfY9IQcrszdeUG0jBwmSl6TO1D"; // mesmo token do GAS

  try {
    const { pedidos, romaneio } = req.body;

    if (!Array.isArray(pedidos) || pedidos.length === 0) {
      return res
        .status(400)
        .json({
          status: "error",
          message: "Lista de pedidos ausente ou inválida.",
        });
    }

    const response = await fetch(GAS_WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: GAS_TOKEN,
        pedidos,
        romaneio,
      }),
    });

    const json = await response.json();
    res.status(200).json(json);
  } catch (err) {
    console.error("❌ Erro no fetch para o GAS:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
}
