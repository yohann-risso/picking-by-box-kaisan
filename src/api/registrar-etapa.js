// /api/registrar-etapa.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const result = await fetch("https://script.google.com/macros/s/AKfycbwLnP9MUhfHdVjeZZFNH_rkr2gJyxQwoHC4GvMtJSykcqYvhBzB8GeMVu2NH57yWNHp/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const json = await result.json();
    res.status(200).json(json);
  } catch (err) {
    console.error("Erro no proxy do GAS:", err);
    res.status(500).json({ error: "Erro ao enviar dados ao Google Apps Script" });
  }
}
