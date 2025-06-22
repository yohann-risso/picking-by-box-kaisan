export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", message: "Método não permitido" });
  }

  try {
    const result = await fetch("https://script.google.com/macros/s/AKfycbwUMPjyOqeMBX3vRSdMmJmtnt9-Dt8MHdPYl1aTS9cLaPZ7CuyNuw_uuEwRX0Speh5h/exec", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const json = await result.json();
    res.status(200).json(json);
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
}
