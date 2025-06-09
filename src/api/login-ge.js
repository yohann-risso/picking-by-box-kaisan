export default async function handler(req, res) {
  const { login, senha, bandeira = 1 } = req.body;

  if (!login || !senha) {
    return res.status(400).json({ error: "Login e senha são obrigatórios" });
  }

  const form = new URLSearchParams();
  form.append("login", login);
  form.append("senha", senha);
  form.append("sel_bandeira_login", String(bandeira));
  form.append("func", "login");

  try {
    const response = await fetch("https://ge.kaisan.com.br/index2.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
      },
      body: form,
      redirect: "manual",
    });

    const location = response.headers.get("location");
    const setCookie = response.headers.get("set-cookie");

    if (!setCookie || !setCookie.includes("PHPSESSID")) {
      return res.status(401).json({ error: "Login inválido" });
    }

    const match = setCookie.match(/PHPSESSID=([^;]+)/);
    const session = match?.[1];

    if (!session || !location?.includes("index2.php")) {
      return res.status(401).json({ error: "Autenticação falhou" });
    }

    return res.status(200).json({ session });

  } catch (err) {
    console.error("Erro ao logar no GE:", err);
    return res.status(500).json({ error: "Erro interno ao logar no GE" });
  }
}
