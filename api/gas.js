export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ status: "error", message: "Método não permitido" });
  }

  try {
    const response = await fetch(
      "https://script.google.com/macros/s/AKfycbwUMPjyOqeMBX3vRSdMmJmtnt9-Dt8MHdPYl1aTS9cLaPZ7CuyNuw_uuEwRX0Speh5h/exec",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body || {}),
      },
    );

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        status: "error",
        message: "Resposta do GAS não é JSON válido.",
        raw: text,
      };
    }

    return res.status(response.ok ? 200 : response.status).json(data);
  } catch (err) {
    console.error("Erro no proxy GAS:", err);
    return res
      .status(500)
      .json({ status: "error", message: err.message || "Erro interno" });
  }
}
