export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const response = await fetch(
      "https://script.google.com/macros/s/AKfycbwLnP9MUhfHdVjeZZFNH_rkr2gJyxQwoHC4GvMtJSykcqYvhBzB8GeMVu2NH57yWNHp/exec",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      }
    );

    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();

    if (!response.ok) {
      console.error("Erro do GAS:", response.status, raw);
      return res
        .status(500)
        .json({ error: "Resposta inválida do GAS", status: response.status });
    }

    const data = contentType.includes("application/json")
      ? JSON.parse(raw)
      : { raw };

    return res.status(200).json(data);
  } catch (err) {
    console.error("Erro no proxy do GAS:", err);
    return res
      .status(500)
      .json({ error: "Erro ao enviar dados ao Google Apps Script" });
  }
}
